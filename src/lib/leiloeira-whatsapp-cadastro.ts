/**
 * Cadastro em leiloeiras via GRUPO do WhatsApp (Baileys) — submissão e decisão.
 *
 * Papel dos canais (divisão dura da arquitetura):
 *   • API oficial (Cloud)  → fala com o CLIENTE (lead);
 *   • Baileys (nº próprio) → fala com EQUIPE e PARCEIROS (grupos internos).
 *
 * Fluxo:
 *   1. Checklist de habilitação completo (concierge) → a ficha do lead é
 *      postada no grupo de cadastros de cada leiloeira vinculada
 *      (leiloeiras.whatsapp_group_id), com um código de rastreio (#CAD-XXXX)
 *      e os links dos documentos. Registro em cliente_leiloeira_cadastro
 *      (canal 'whatsapp', status 'enviado'). Idempotente por leiloeira.
 *   2. Alguém da leiloeira responde no grupo ("aprovado" / "recusado",
 *      idealmente citando a ficha ou incluindo o código). O VPS encaminha a
 *      mensagem do grupo para /api/whatsapp/group-inbound, que chama
 *      handleLeiloeiraGroupMessage: casa a resposta com a submissão, atualiza
 *      o status, avisa o CLIENTE pela API oficial e confirma no grupo.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteMatchKey, fmtCpf } from './clientes'
import { sendVpsGroup } from './whatsapp-vps'
import { sendOutbound } from './whatsapp-gateway'
import { notifyTeamGroup } from './whatsapp-team-notify'
import { firstName } from './whatsapp-central'

const DOCS_BUCKET = 'cliente-documentos'

/* ─── Tipos ────────────────────────────────────────────────────────────── */

interface LeadRow {
    id: string
    nome: string | null
    telefone: string | null
    celular: string | null
    email: string | null
    cpf: string | null
    cidade: string | null
    estado: string | null
    inscricao_estadual: string | null
    tem_inscricao_estadual: string | null
    interesse_principal: string | null
    o_que_busca: string | null
    quantidade_animais: string | null
    contact_history: Array<Record<string, unknown>> | null
    extra_data: Record<string, unknown> | null
}

interface LeiloeiraGroupRow {
    id: string
    nome: string
    whatsapp_group_id: string
    ativo: boolean | null
}

export interface GroupSubmissionResult {
    attempted: number
    sent: number
    skipped: { leiloeira: string; reason: string }[]
}

/* ─── Submissão ────────────────────────────────────────────────────────── */

function gerarCodigo(): string {
    // 5 chars base36 maiúsculos — curto o bastante pra digitar, único o
    // bastante pro volume de cadastros (colisão tratada pelo retry do índice).
    return `CAD-${crypto.randomUUID().replace(/-/g, '').slice(0, 5).toUpperCase()}`
}

const LEAD_FICHA_FIELDS =
    'id, nome, telefone, celular, email, cpf, cidade, estado, inscricao_estadual, tem_inscricao_estadual, interesse_principal, o_que_busca, quantidade_animais, contact_history, extra_data'

function buildFicha(lead: LeadRow, codigo: string, docs: { nome: string; url: string }[]): string {
    const xd = (lead.extra_data ?? {}) as Record<string, unknown>
    const str = (v: unknown) => String(v ?? '').trim()
    const fone = str(lead.celular) || str(lead.telefone)
    const fazenda = [str(xd.fazenda_nome), [str(xd.fazenda_cidade), str(xd.fazenda_uf)].filter(Boolean).join('/')]
        .filter(Boolean).join(' — ')
    const ie = str(lead.inscricao_estadual)
        || (str(lead.tem_inscricao_estadual).toLowerCase() === 'sim' ? 'Tem (nº a confirmar)' : '')

    const linhas = [
        `📋 *Solicitação de cadastro* · ${codigo}`,
        '',
        `*Nome:* ${str(lead.nome) || '—'}`,
        `*CPF:* ${lead.cpf ? fmtCpf(lead.cpf) : '—'}`,
        `*Telefone:* ${fone || '—'}`,
        `*E-mail:* ${str(lead.email) || '—'}`,
    ]
    const endereco = str(xd.endereco_titular)
    if (endereco) linhas.push(`*Endereço:* ${endereco}`)
    if (fazenda) linhas.push(`*Fazenda:* ${fazenda}`)
    linhas.push(`*Inscrição Estadual:* ${ie || '—'}`)
    const interesse = str(lead.interesse_principal) || str(lead.o_que_busca)
    if (interesse) linhas.push(`*Interesse:* ${interesse}${lead.quantidade_animais ? ` (${lead.quantidade_animais} cab.)` : ''}`)

    if (docs.length) {
        linhas.push('', '*Documentos:*')
        for (const d of docs) linhas.push(`• ${d.nome}: ${d.url}`)
    } else {
        linhas.push('', '_Sem documentos anexados._')
    }

    linhas.push(
        '',
        `Para retornar, responda esta mensagem (ou cite o código ${codigo}) com *aprovado* ou *recusado*.`,
        '_Enviado automaticamente pela Bula Assessoria._',
    )
    return linhas.join('\n')
}

/** Links assinados (7 dias) dos documentos que o lead enviou pelo WhatsApp. */
async function loadLeadDocLinks(
    supabase: SupabaseClient,
    leadId: string,
): Promise<{ nome: string; url: string }[]> {
    const { data } = await supabase
        .from('crm_lead_documentos')
        .select('nome_arquivo, path')
        .eq('lead_id', leadId)
    const docs: { nome: string; url: string }[] = []
    const seen = new Set<string>()
    for (const d of (data ?? []) as { nome_arquivo: string; path: string }[]) {
        if (!d.path || seen.has(d.nome_arquivo)) continue
        seen.add(d.nome_arquivo)
        const { data: signed } = await supabase.storage
            .from(DOCS_BUCKET)
            .createSignedUrl(d.path, 7 * 86400)
        if (signed?.signedUrl) docs.push({ nome: d.nome_arquivo, url: signed.signedUrl })
    }
    return docs
}

/**
 * Posta a ficha de cadastro do lead nos grupos de leiloeira vinculados.
 * Idempotente: pula leiloeiras cujo cadastro deste cliente já está
 * 'enviado'/'aprovado'. Best-effort: nunca lança.
 */
export async function submitLeadCadastroToLeiloeiraGroups(
    supabase: SupabaseClient,
    leadId: string,
): Promise<GroupSubmissionResult> {
    const result: GroupSubmissionResult = { attempted: 0, sent: 0, skipped: [] }
    try {
        const { data: leadData } = await supabase
            .from('crm_leads')
            .select(LEAD_FICHA_FIELDS)
            .eq('id', leadId)
            .maybeSingle()
        const lead = leadData as LeadRow | null
        if (!lead) return result

        const matchKey = clienteMatchKey(lead.nome)
        if (!matchKey) {
            result.skipped.push({ leiloeira: '*', reason: 'lead sem nome (match_key vazio)' })
            return result
        }

        const { data: leiloeirasData } = await supabase
            .from('leiloeiras')
            .select('id, nome, whatsapp_group_id, ativo')
            .eq('ativo', true)
            .neq('whatsapp_group_id', '')
        const leiloeiras = ((leiloeirasData ?? []) as LeiloeiraGroupRow[])
            .filter(l => l.whatsapp_group_id)
        if (!leiloeiras.length) {
            result.skipped.push({ leiloeira: '*', reason: 'nenhuma leiloeira com grupo vinculado' })
            return result
        }

        // Idempotência: quem já recebeu este cliente não recebe de novo.
        const { data: statusData } = await supabase
            .from('cliente_leiloeira_cadastro')
            .select('leiloeira_id, status')
            .eq('cliente_key', matchKey)
        const jaEnviado = new Set(
            (statusData ?? [])
                .filter((s: { status: string | null }) => s.status === 'enviado' || s.status === 'aprovado')
                .map((s: { leiloeira_id: string }) => s.leiloeira_id),
        )

        const docs = await loadLeadDocLinks(supabase, lead.id)

        for (const leiloeira of leiloeiras) {
            if (jaEnviado.has(leiloeira.id)) continue
            result.attempted++
            const codigo = gerarCodigo()
            const r = await sendVpsGroup(leiloeira.whatsapp_group_id, buildFicha(lead, codigo, docs))
            if (!r.queued) {
                result.skipped.push({ leiloeira: leiloeira.nome, reason: r.error || 'falha no envio ao grupo' })
                continue
            }
            const { error } = await supabase.from('cliente_leiloeira_cadastro').upsert(
                {
                    cliente_key: matchKey,
                    leiloeira_id: leiloeira.id,
                    status: 'enviado',
                    canal: 'whatsapp',
                    codigo,
                    crm_lead_id: lead.id,
                    enviado_at: new Date().toISOString(),
                },
                { onConflict: 'cliente_key,leiloeira_id' },
            )
            if (error) console.warn('[cadastro-grupo] registro falhou:', error.message)
            result.sent++
        }
    } catch (e) {
        console.warn('[cadastro-grupo] submissão falhou:', e instanceof Error ? e.message : e)
    }
    return result
}

/* ─── Decisão no grupo ─────────────────────────────────────────────────── */

export interface GroupMessageInput {
    groupJid: string
    /** JID do participante que escreveu (ex.: 5567...@s.whatsapp.net). */
    participant?: string | null
    senderName?: string | null
    text: string
    /** Texto da mensagem citada (quando a resposta cita a ficha). */
    quotedText?: string | null
}

export type GroupDecisionOutcome =
    | { kind: 'ignored'; reason: string }
    | { kind: 'unmatched'; decision: 'aprovado' | 'recusado' }
    | { kind: 'decided'; decision: 'aprovado' | 'recusado'; cliente: string; leiloeira: string; clienteAvisado: boolean }

function parseDecision(text: string): 'aprovado' | 'recusado' | null {
    if (/\b(reprovad\w*|recusad\w*|negad\w*|n[ãa]o\s+aprovad\w*)\b/i.test(text)) return 'recusado'
    if (/\baprovad\w*\b/i.test(text)) return 'aprovado'
    return null
}

function parseCodigo(...texts: (string | null | undefined)[]): string | null {
    for (const t of texts) {
        const m = /CAD-([A-Z0-9]{4,10})/i.exec(t || '')
        if (m) return `CAD-${m[1].toUpperCase()}`
    }
    return null
}

interface CadastroRow {
    id: string
    cliente_key: string
    leiloeira_id: string
    status: string | null
    codigo: string | null
    crm_lead_id: string | null
}

/**
 * Processa uma mensagem recebida num grupo de cadastros de leiloeira.
 * Detecta aprovado/recusado, casa com a submissão (código > citação > única
 * pendente), atualiza o status e fecha o ciclo com o cliente e a equipe.
 */
export async function handleLeiloeiraGroupMessage(
    supabase: SupabaseClient,
    input: GroupMessageInput,
): Promise<GroupDecisionOutcome> {
    const { data: leiloeiraData } = await supabase
        .from('leiloeiras')
        .select('id, nome, whatsapp_group_id, ativo')
        .eq('whatsapp_group_id', input.groupJid)
        .maybeSingle()
    const leiloeira = leiloeiraData as LeiloeiraGroupRow | null
    if (!leiloeira) return { kind: 'ignored', reason: 'grupo_sem_leiloeira' }

    const decision = parseDecision(input.text)
    if (!decision) return { kind: 'ignored', reason: 'sem_decisao' }

    // 1) Código explícito (na resposta ou na ficha citada)
    const codigo = parseCodigo(input.text, input.quotedText)
    let cadastro: CadastroRow | null = null
    if (codigo) {
        const { data } = await supabase
            .from('cliente_leiloeira_cadastro')
            .select('id, cliente_key, leiloeira_id, status, codigo, crm_lead_id')
            .eq('leiloeira_id', leiloeira.id)
            .eq('codigo', codigo)
            .maybeSingle()
        cadastro = data as CadastroRow | null
    }

    // 2) Sem código: tenta as submissões pendentes desta leiloeira
    if (!cadastro) {
        const { data } = await supabase
            .from('cliente_leiloeira_cadastro')
            .select('id, cliente_key, leiloeira_id, status, codigo, crm_lead_id')
            .eq('leiloeira_id', leiloeira.id)
            .eq('status', 'enviado')
            .order('enviado_at', { ascending: false })
            .limit(20)
        const pendentes = (data ?? []) as CadastroRow[]
        // Nada pendente e nenhum código citado → é conversa normal do grupo
        // que por acaso contém "aprovado"; não incomodar.
        if (!pendentes.length && !codigo) return { kind: 'ignored', reason: 'sem_pendencias' }
        const hay = `${input.text}\n${input.quotedText || ''}`.toLowerCase()
        const porNome = pendentes.filter(p => p.cliente_key && hay.includes(p.cliente_key))
        if (porNome.length === 1) cadastro = porNome[0]
        else if (pendentes.length === 1) cadastro = pendentes[0]
    }

    if (!cadastro) {
        // Pede o dado que falta — melhor do que decidir errado.
        void sendVpsGroup(
            input.groupJid,
            `🤖 Não consegui identificar de qual cadastro se trata. Responda *citando a ficha* ou inclua o código (ex.: CAD-A1B2C).`,
        )
        return { kind: 'unmatched', decision }
    }

    // ── Atualiza o status ──
    const now = new Date().toISOString()
    await supabase
        .from('cliente_leiloeira_cadastro')
        .update({
            status: decision,
            decidido_at: now,
            decidido_por: (input.senderName || input.participant || '').slice(0, 120),
            decisao_msg: input.text.slice(0, 500),
            ...(decision === 'aprovado' ? { aprovado_at: now } : {}),
        })
        .eq('id', cadastro.id)

    // ── Efeitos no lead + retorno ao cliente (API oficial) ──
    let clienteNome = cadastro.cliente_key
    let clienteAvisado = false
    if (cadastro.crm_lead_id) {
        const { data: leadData } = await supabase
            .from('crm_leads')
            .select('id, nome, telefone, celular, contact_history, extra_data, optout_whatsapp')
            .eq('id', cadastro.crm_lead_id)
            .maybeSingle()
        const lead = leadData as (Pick<LeadRow, 'id' | 'nome' | 'telefone' | 'celular' | 'contact_history' | 'extra_data'> & { optout_whatsapp: boolean | null }) | null
        if (lead) {
            clienteNome = lead.nome || clienteNome
            const xd = { ...(lead.extra_data ?? {}) } as Record<string, unknown>
            xd.cadastro_status = decision === 'aprovado' ? 'aprovado' : 'recusado'
            if (decision === 'aprovado') xd.cadastro_aprovado = true
            const history = Array.isArray(lead.contact_history) ? [...lead.contact_history] : []
            history.unshift({
                id: crypto.randomUUID(),
                type: 'whatsapp',
                date: now,
                notes: `[Grupo ${leiloeira.nome}] Cadastro ${decision.toUpperCase()} por ${input.senderName || 'leiloeira'}`,
                by: 'automacao-cadastro',
            })
            await supabase
                .from('crm_leads')
                .update({
                    extra_data: xd,
                    contact_history: history,
                    // Recusa exige conversa humana — nunca dar a má notícia no automático.
                    ...(decision === 'recusado' ? { handoff_humano: true, handoff_at: now } : {}),
                })
                .eq('id', lead.id)

            const phone = lead.celular || lead.telefone || ''
            if (phone && !lead.optout_whatsapp) {
                const nome = firstName(lead.nome) || ''
                const texto = decision === 'aprovado'
                    ? `Boa notícia${nome ? `, ${nome}` : ''}! 🎉 Seu cadastro na *${leiloeira.nome}* foi *aprovado*. Você já está habilitado a comprar parcelado nos leilões. Qualquer dúvida, é só me chamar por aqui!`
                    : `Olá${nome ? `, ${nome}` : ''}! Tivemos um retorno da ${leiloeira.nome} sobre o seu cadastro e precisamos alinhar alguns detalhes com você. Nossa equipe já vai te chamar por aqui, tudo bem?`
                const r = await sendOutbound(supabase, {
                    to: { phone, leadId: lead.id, name: lead.nome },
                    text: texto,
                    intent: 'crm_reply', // canal do cliente = API oficial (política do gateway)
                    origin: 'cadastro-leiloeira',
                })
                clienteAvisado = r.status === 'sent' || r.status === 'queued'
            }
        }
    }

    // ── Confirmação no grupo da leiloeira + aviso interno ──
    void sendVpsGroup(
        input.groupJid,
        `✅ Registrado: cadastro de *${clienteNome}* marcado como *${decision.toUpperCase()}*. ${clienteAvisado ? 'Cliente avisado.' : 'Cliente ainda não avisado (fora da janela ou sem WhatsApp).'}`,
    )
    void notifyTeamGroup(supabase, [
        decision === 'aprovado' ? '🟢 *Cadastro APROVADO pela leiloeira*' : '🔴 *Cadastro RECUSADO pela leiloeira*',
        `Cliente: ${clienteNome}`,
        `Leiloeira: ${leiloeira.nome} · por ${input.senderName || 'participante do grupo'}`,
        clienteAvisado
            ? 'Cliente avisado pela API oficial.'
            : decision === 'recusado'
                ? 'Lead marcado para atendimento humano — falar com o cliente.'
                : '⚠ Não consegui avisar o cliente (janela fechada/sem telefone) — avisar manualmente.',
    ].join('\n')).catch(() => { /* best-effort */ })

    return { kind: 'decided', decision, cliente: clienteNome, leiloeira: leiloeira.nome, clienteAvisado }
}
