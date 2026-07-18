/**
 * AUDITOR NOTURNO do atendimento IA (pedido do chefe, 18/07/2026).
 *
 * Lê as conversas do dia no inbox oficial (cloud), monta o transcript de cada
 * uma e pede a um modelo que avalie a condução contra o playbook
 * habilitação-first: fase certa? perdeu o "sim"? repetiu pergunta? travou onde?
 * O resultado vira uma linha por conversa em `crm_conversa_auditorias`,
 * exibida na aba "Auditoria IA" do CRM — é o ciclo de identificar e corrigir
 * falhas sem esperar reclamação de lead.
 *
 * Custo: 1 chamada de IA por conversa COM resposta do lead no dia (dezenas,
 * não centenas). Disparos sem resposta não são auditados — não há condução.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { openRouterJSON, type ChatMessage } from './openrouter'
import { DEFAULT_CONCIERGE_MODEL } from './whatsapp-concierge'

export interface AuditoriaFalha {
    tipo: string
    detalhe: string
}

export interface AuditoriaConversa {
    dia: string
    phone: string
    lead_id: string | null
    lead_nome: string | null
    msgs_lead: number
    msgs_bot: number
    fase_final: string | null
    score: number | null
    resumo: string | null
    falhas: AuditoriaFalha[]
    trava: string | null
    proxima_acao: string | null
    destaque: string | null
    modelo: string
}

const AUDIT_SYSTEM = `Você é o auditor de qualidade do atendimento por IA da Bula Assessoria (assessoria de leilão de gado Nelore P.O.). Avalie a conversa abaixo contra o playbook:

PLAYBOOK (habilitação-first):
1. O objetivo é HABILITAR o lead: cadastro completo (nome, CPF, I.E./NIRF, endereço, e-mail) + documentos (RG/CNH com foto, comprovante de endereço) aprovado na leiloeira.
2. O lead geralmente já vem qualificado da campanha. Perguntas de descoberta só quando não se sabe o que ele busca — no máximo 2. Perguntar o que o formulário já respondeu é FALHA (pergunta_redundante).
3. Fluxo: apresentação curta da assessoria (gratuita) → pergunta do "sim" (quer que a gente deixe seu cadastro pronto?) → coleta de dados+documentos em pedido único organizado → análise da leiloeira.
4. O porquê comercial do cadastro: compra parcelada (30x) direto com a leiloeira, ela banca o risco, então só libera lance de cadastro aprovado. Não usar isso = oportunidade perdida quando o lead hesita.
5. Tom direto e sério, sem elogio ("Ótimo!", "ótima escolha") nem enchimento. Mensagens de 2-4 linhas, uma pergunta por vez.
6. NUNCA oferecer assessor/pessoa antes do cadastro aprovado. NUNCA prometer aprovação/taxa/desconto. Nunca repetir lista de dados para lead que hesitou.
7. Lead com sinal de compra parado sem pedido do "sim" ou dos dados = oportunidade perdida grave.

Responda SOMENTE com JSON:
{
  "score": 0-10 (10 = condução impecável rumo ao cadastro),
  "resumo": "2-3 frases: quem é o lead, o que quer, onde a conversa está",
  "fase_final": "descoberta|apresentacao|habilitacao|analise|perdido|fora_de_escopo",
  "falhas": [{"tipo": "pergunta_redundante|nao_pediu_sim|nao_pediu_dados|fase_errada|tom|oferta_assessor_cedo|resposta_ruim|oportunidade_perdida|outro", "detalhe": "1 frase citando a mensagem"}],
  "trava": "onde a conversa emperrou, ou null se está fluindo/concluída",
  "proxima_acao": "1 frase: o que fazer com este lead agora",
  "destaque": "1 resposta da IA que foi exemplar e serviria de few-shot, ou null"
}`

function normalizePhoneKey(input: string): string {
    return String(input || '').replace(/\D/g, '')
}

/** Variantes BR (com/sem DDI 55 e 9º dígito) para casar lead por telefone. */
function phoneVariants(phone: string): string[] {
    const v = new Set<string>()
    const d = normalizePhoneKey(phone)
    if (!d) return []
    v.add(d)
    if (d.startsWith('55')) v.add(d.slice(2)); else v.add(`55${d}`)
    const wo = d.startsWith('55') ? d.slice(2) : d
    if (wo.length === 11 && wo[2] === '9') { const x = wo.slice(0, 2) + wo.slice(3); v.add(x); v.add(`55${x}`) }
    else if (wo.length === 10) { const x = wo.slice(0, 2) + '9' + wo.slice(2); v.add(x); v.add(`55${x}`) }
    return [...v]
}

interface MsgRow {
    phone: string | null
    name: string | null
    direction: string | null
    body: string | null
    created_at: string
    origin: string | null
    intent: string | null
    lead_id: string | null
}

/** Janela [inicio, fim) do dia em America/Campo_Grande (UTC-4). */
export function janelaDoDia(dia: string): { inicio: string; fim: string } {
    const d = new Date(`${dia}T00:00:00-04:00`)
    const fim = new Date(d.getTime() + 24 * 3600_000)
    return { inicio: d.toISOString(), fim: fim.toISOString() }
}

/**
 * Roda a auditoria de um dia (formato YYYY-MM-DD, fuso de MS). Idempotente:
 * upsert por (dia, phone) — rerodar substitui a avaliação.
 */
export async function runAuditoriaDoDia(
    supabase: SupabaseClient,
    dia: string,
    opts: { maxConversas?: number; model?: string } = {},
): Promise<{ auditadas: number; puladas: number; erros: number }> {
    const { inicio, fim } = janelaDoDia(dia)
    const model = opts.model || DEFAULT_CONCIERGE_MODEL

    // Mensagens 1:1 do inbox oficial no dia, ordem cronológica, paginado.
    const rows: MsgRow[] = []
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
            .from('whatsapp_messages')
            .select('phone, name, direction, body, created_at, origin, intent, lead_id')
            .or('inbox_id.eq.cloud,and(inbox_id.is.null,channel.eq.cloud)')
            .gte('created_at', inicio).lt('created_at', fim)
            .not('phone', 'is', null)
            .order('created_at', { ascending: true })
            .range(from, from + 999)
        if (error) throw new Error(error.message)
        rows.push(...((data ?? []) as MsgRow[]))
        if (!data || data.length < 1000) break
    }

    // Agrupa por telefone; só audita conversa em que o LEAD falou no dia.
    const byPhone = new Map<string, MsgRow[]>()
    for (const m of rows) {
        const p = normalizePhoneKey(m.phone || '')
        if (!/^\d{10,13}$/.test(p)) continue
        if (m.intent === 'assessor') continue
        if (!byPhone.has(p)) byPhone.set(p, [])
        byPhone.get(p)!.push(m)
    }
    const conversas = [...byPhone.entries()]
        .filter(([, msgs]) => msgs.some(m => m.direction === 'inbound'))
        .slice(0, opts.maxConversas ?? 120)

    let auditadas = 0, erros = 0
    const puladas = byPhone.size - conversas.length

    // 4 conversas em paralelo: 100+ conversas sequenciais não cabem no
    // maxDuration do cron; 4-wide fica dentro do rate limit do OpenRouter.
    const CONC = 4
    const fila = [...conversas]
    await Promise.all(Array.from({ length: CONC }, async () => {
        for (;;) {
            const item = fila.shift()
            if (!item) return
            const [phone, msgs] = item
            await auditarUma(phone, msgs)
        }
    }))

    async function auditarUma(phone: string, msgs: MsgRow[]) {
        // Contexto do lead (nome/interesse ajudam o auditor a julgar redundância).
        let lead: { id: string; nome: string | null; interesse_principal: string | null; quantidade_animais: string | null } | null = null
        const leadId = msgs.find(m => m.lead_id)?.lead_id ?? null
        if (leadId) {
            const { data } = await supabase.from('crm_leads')
                .select('id, nome, interesse_principal, quantidade_animais').eq('id', leadId).maybeSingle()
            lead = data ?? null
        } else {
            const { data } = await supabase.from('crm_leads')
                .select('id, nome, interesse_principal, quantidade_animais')
                .in('telefone', phoneVariants(phone)).limit(1).maybeSingle()
            lead = data ?? null
        }

        const transcript = msgs.slice(-40).map(m => {
            const who = m.direction === 'inbound' ? 'LEAD' : 'IA'
            return `${who}: ${(m.body || '(mídia)').slice(0, 500)}`
        }).join('\n')
        const contexto = lead
            ? `Lead: ${lead.nome ?? '(sem nome)'} | interesse do formulário: ${lead.interesse_principal ?? '—'} | rebanho declarado: ${lead.quantidade_animais ?? '—'}`
            : 'Lead sem cadastro casado no CRM.'

        try {
            const messages: ChatMessage[] = [
                { role: 'system', content: AUDIT_SYSTEM },
                { role: 'user', content: `${contexto}\n\nCONVERSA DO DIA (${dia}):\n${transcript}` },
            ]
            // 1ª tentativa no modelo titular (90s); se pendurar/falhar, cai pro
            // Gemini Flash — auditoria atrasada é inútil, o cron tem teto de tempo.
            let r: Record<string, unknown> | null = null
            try {
                r = await openRouterJSON<Record<string, unknown>>(messages, {
                    model, temperature: 0.2, maxTokens: 700, logKind: 'auditoria-conversas',
                    signal: AbortSignal.timeout(90_000),
                })
            } catch { /* tenta o fallback */ }
            if (!r) {
                r = await openRouterJSON<Record<string, unknown>>(messages, {
                    model: 'google/gemini-2.5-flash', temperature: 0.2, maxTokens: 700,
                    logKind: 'auditoria-conversas', signal: AbortSignal.timeout(45_000),
                })
            }
            if (!r) { erros++; return }
            const falhas = Array.isArray(r.falhas)
                ? (r.falhas as AuditoriaFalha[]).filter(f => f && typeof f.detalhe === 'string').slice(0, 8)
                : []
            const row: AuditoriaConversa = {
                dia, phone,
                lead_id: lead?.id ?? null,
                lead_nome: lead?.nome ?? msgs.find(m => m.name)?.name ?? null,
                msgs_lead: msgs.filter(m => m.direction === 'inbound').length,
                msgs_bot: msgs.filter(m => m.direction === 'outbound').length,
                fase_final: typeof r.fase_final === 'string' ? r.fase_final : null,
                score: Number.isFinite(Number(r.score)) ? Math.max(0, Math.min(10, Math.round(Number(r.score)))) : null,
                resumo: typeof r.resumo === 'string' ? r.resumo.slice(0, 1000) : null,
                falhas,
                trava: typeof r.trava === 'string' && r.trava.trim() ? r.trava.slice(0, 500) : null,
                proxima_acao: typeof r.proxima_acao === 'string' ? r.proxima_acao.slice(0, 500) : null,
                destaque: typeof r.destaque === 'string' && r.destaque.trim() ? r.destaque.slice(0, 800) : null,
                modelo: model,
            }
            const { error } = await supabase
                .from('crm_conversa_auditorias')
                .upsert(row, { onConflict: 'dia,phone' })
            if (error) { console.warn('[auditoria] upsert falhou:', error.message); erros++ }
            else auditadas++
        } catch (e) {
            console.warn('[auditoria] conversa falhou:', phone, e instanceof Error ? e.message : e)
            erros++
        }
    }

    return { auditadas, puladas, erros }
}

