/**
 * Sincroniza a habilitação de um lead: CONSULTA → GRAVA → SUBMETE (ou pede).
 *
 * É o passo que faltava. O concierge consultava a I.E./propriedade, mas quem
 * decidia enviar a ficha às leiloeiras era um `if` aninhado dentro do aviso
 * interno — e esse aviso dispara uma vez só, ainda em "INFORMAÇÕES CAPTADAS",
 * com o checklist incompleto. Resultado: quando o checklist finalmente fechava,
 * o bloco não rodava mais e a ficha NUNCA era submetida.
 *
 * Aqui a regra fica explícita e num lugar só:
 *   1. Se o lead tem CPF e a propriedade ainda não foi consultada, consulta e
 *      grava no lead (fazenda, cidade/UF, I.E., endereço da propriedade).
 *   2. Recalcula o checklist com o estado novo e persiste em extra_data.
 *   3. Tem o ESSENCIAL → posta a ficha nos grupos das leiloeiras (idempotente).
 *      Não tem      → devolve o que falta, para a IA pedir ao cliente.
 *
 * "Essencial" ≠ "checklist completo". A ficha aprovada do Ricardo tinha Roteiro,
 * Telefone e Resp. Telefone em branco — a leiloeira não é exigente com campo
 * acessório. O checklist segue guiando a CONVERSA; a submissão usa
 * `prontoParaFicha()` (nome, CPF e telefone) e o documento com foto é exigência
 * por leiloeira: a Programa recebe a ficha sem ele, as demais aguardam o doc.
 *
 * Idempotente e chamável de qualquer lugar: do turno do concierge, de um
 * backfill, de um botão no CRM.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeHabilitacaoChecklist, type HabilitacaoChecklist } from './crm-habilitacao'
import { maybeRunStateRegistrationCheck } from './crm-state-registration-automation'
import { maybeEnrichLeadFromPhone } from './crm-lead-enrichment'
import { consultarImoveisRuraisPorCpf, isFiscalApiConfigured } from './state-registration-provider'
import { submitLeadCadastroToLeiloeiraGroups, enviarComplementoCadastro } from './leiloeira-whatsapp-cadastro'
import { ieDispensadaParaLead, avisoIeDispensadaTexto } from './concierge-campanha'
import { notifyTeamGroup } from './whatsapp-team-notify'
import { DEFAULT_JMP_MQL_RULE } from './crm-types'

const LEAD_FIELDS =
    'id, nome, telefone, celular, email, cpf, estado, cidade, quantidade_animais, ' +
    'inscricao_estadual, tem_inscricao_estadual, status, contact_history, extra_data'

interface SyncLead {
    id: string
    nome: string | null
    telefone: string | null
    celular: string | null
    email: string | null
    cpf: string | null
    estado: string | null
    quantidade_animais: string | null
    inscricao_estadual: string | null
    tem_inscricao_estadual: string | null
    /** Nunca é nulo na prática; as automações exigem `string`. */
    status: string
    contact_history: unknown
    extra_data: Record<string, unknown> | null
}

/** O PostgREST tipa `select(string)` de forma frouxa; normalizamos aqui. */
function asLead(row: unknown): SyncLead | null {
    if (!row || typeof row !== 'object' || !('id' in row)) return null
    const r = row as Record<string, unknown>
    return { ...(r as unknown as SyncLead), status: String(r.status ?? '') }
}

export interface HabilitacaoSyncResult {
    leadId: string
    /** Rodou consulta externa nesta chamada. */
    consultou: boolean
    /** Campos que a consulta trouxe (para log/UI). */
    encontrados: string[]
    checklist: HabilitacaoChecklist | null
    /** Itens que ainda faltam — é o que a IA deve pedir ao cliente. */
    faltando: string[]
    /** Tem o essencial para a ficha ir à leiloeira (≠ checklist completo). */
    pronto: boolean
    /** Ficha postada nos grupos das leiloeiras nesta chamada. */
    submetido: boolean
    enviadosPara: number
    motivo?: string
}

async function loadDocs(supabase: SupabaseClient, leadId: string) {
    const { data } = await supabase.from('crm_lead_documentos').select('tipo').eq('lead_id', leadId)
    return { count: data?.length ?? 0, tipos: (data ?? []).map(d => String(d.tipo || 'outro')) }
}

function buildChecklist(lead: SyncLead, docs: { count: number; tipos: string[] }): HabilitacaoChecklist {
    const xd = lead.extra_data ?? {}
    return computeHabilitacaoChecklist({
        nome: lead.nome,
        cpf: lead.cpf,
        telefone: lead.telefone,
        celular: lead.celular,
        email: lead.email,
        inscricao_estadual: lead.inscricao_estadual,
        tem_inscricao_estadual: lead.tem_inscricao_estadual,
        extra_data: xd,
        docsCount: docs.count,
        docTipos: docs.tipos,
        ieDispensadaPara: ieDispensadaParaLead(lead),
        // (documentosSimplificados descontinuado: a análise de crédito PF exige
        // a lista completa da leiloeira — consulta não substitui documento.)
    })
}

const cpfValido = (v: unknown) => String(v ?? '').replace(/\D/g, '').length === 11
const limpo = (v: unknown) => {
    const s = String(v ?? '').trim()
    return /^(null|undefined|nulo|n\/a|-)$/i.test(s) ? '' : s
}

/**
 * A ficha só vai para a leiloeira quando está ANALISÁVEL — a leiloeira
 * (Programa/Márcia, 07/2026) só analisa cadastro com a DOCUMENTAÇÃO COMPLETA de
 * análise de crédito PF; incompleto ela não analisa (e ainda repassa à EAO).
 * Submeter incompleto só gerava recusa e atrito.
 *
 * O gate usa o próprio checklist (fonte única). Exige os itens OBRIGATÓRIOS da
 * lista oficial + o básico do titular; campos acessórios (e-mail, fazenda, I.E.)
 * NÃO travam a submissão — entram na ficha se houver.
 *
 *   básico:     nome_completo · cpf · telefone
 *   documentos: doc_identidade · doc_identidade_selfie · doc_endereco
 *               · doc_matricula · doc_itr · doc_renda · referencias
 */
const ITENS_OBRIGATORIOS_FICHA = [
    'nome_completo', 'cpf', 'telefone',
    'doc_identidade', 'doc_identidade_selfie', 'doc_endereco',
    'doc_matricula', 'doc_itr', 'doc_renda', 'referencias',
] as const

export function prontoParaFicha(
    checklist: HabilitacaoChecklist,
): { pronto: boolean; faltamEssenciais: string[] } {
    const byKey = new Map(checklist.items.map(i => [i.key, i]))
    const faltam: string[] = []
    for (const key of ITENS_OBRIGATORIOS_FICHA) {
        const item = byKey.get(key)
        if (!item || !item.done) faltam.push(item?.label ?? key)
    }
    return { pronto: faltam.length === 0, faltamEssenciais: faltam }
}

export async function sincronizarHabilitacao(
    supabase: SupabaseClient,
    leadId: string,
    opts: { consultar?: boolean; submeter?: boolean; dryRun?: boolean } = {},
): Promise<HabilitacaoSyncResult> {
    const consultar = opts.consultar ?? true
    const submeter = opts.submeter ?? true
    const base: HabilitacaoSyncResult = {
        leadId, consultou: false, encontrados: [], checklist: null,
        faltando: [], pronto: false, submetido: false, enviadosPara: 0,
    }

    const reload = async (): Promise<SyncLead | null> => {
        const { data } = await supabase.from('crm_leads').select(LEAD_FIELDS).eq('id', leadId).maybeSingle()
        return asLead(data)
    }
    let lead = await reload()
    if (!lead) return { ...base, motivo: 'lead não encontrado' }

    // ── 1a. Telefone → CPF (Direct Data). Sem CPF nenhuma outra consulta roda.
    if (consultar && !cpfValido(lead.cpf) && !opts.dryRun) {
        try {
            const r = await maybeEnrichLeadFromPhone(supabase, lead)
            if (r.attempted) {
                base.consultou = true
                // Recarrega SEMPRE que a consulta rodou: ela grava a auditoria em
                // extra_data, e o update do checklist lá embaixo parte deste
                // objeto — com a cópia velha, o registro da consulta era apagado.
                lead = (await reload()) ?? lead
            }
            if (r.cpf) base.encontrados.push(`CPF ${r.cpf}`)
        } catch (e) {
            console.warn('[habilitacao-sync] enriquecimento falhou:', e instanceof Error ? e.message : e)
        }
    }

    // ── 1b. CPF (+UF) → I.E. e a PROPRIEDADE (fazenda, cidade/UF, endereço) ─
    if (consultar && cpfValido(lead.cpf) && !(lead.extra_data ?? {}).propriedade_consultada_at && !opts.dryRun) {
        try {
            // `previous` com a MESMA etapa: passar null faria a automação achar que
            // o lead "acabou de entrar na etapa" e furar a trava de 30 dias.
            await maybeRunStateRegistrationCheck(supabase, lead, { status: lead.status }, DEFAULT_JMP_MQL_RULE)
            base.consultou = true
            lead = (await reload()) ?? lead
        } catch (e) {
            console.warn('[habilitacao-sync] consulta de I.E. falhou:', e instanceof Error ? e.message : e)
        }
    }
    // ── 1c. CPF → imóveis rurais no CNIR/CAFIR da Receita (FiscalAPI) ──────
    // É a fonte de propriedade para quem NÃO TEM I.E. — o Sintegra só devolve
    // fazenda de quem é inscrito, e a maioria dos leads (EAO) não é. Sem isto a
    // ficha saía com o bloco da propriedade inteiro em branco. Gate: 1x/30 dias
    // e só quando a propriedade continua vazia após o Sintegra.
    {
        const xdCnir = (lead.extra_data ?? {}) as Record<string, unknown>
        const fiscal = (xdCnir.fiscal ?? {}) as Record<string, unknown>
        const cnirPrev = (fiscal.cnir ?? null) as { consultedAt?: string; pending?: boolean } | null
        const cnirRecente = Boolean(cnirPrev?.consultedAt && !cnirPrev.pending
            && Date.now() - new Date(cnirPrev.consultedAt).getTime() < 30 * 86400000)
        const semPropriedade = !limpo(xdCnir.fazenda_nome) && !limpo(xdCnir.fazenda_cidade)
        if (consultar && !opts.dryRun && isFiscalApiConfigured() && cpfValido(lead.cpf) && semPropriedade && !cnirRecente) {
            try {
                const r = await consultarImoveisRuraisPorCpf(String(lead.cpf))
                base.consultou = true
                const melhor = r.imoveis.find(i => i.nome && i.municipio) ?? r.imoveis[0]
                const patchExtra: Record<string, unknown> = {
                    ...xdCnir,
                    fiscal: {
                        ...fiscal,
                        cnir: {
                            consultedAt: r.consultedAt,
                            pending: r.pending,
                            total: r.imoveis.length,
                            imoveis: r.imoveis.slice(0, 5),
                            message: r.message,
                        },
                    },
                }
                if (melhor) {
                    if (melhor.nome && !limpo(xdCnir.fazenda_nome)) patchExtra.fazenda_nome = melhor.nome
                    if (melhor.municipio && !limpo(xdCnir.fazenda_cidade)) patchExtra.fazenda_cidade = melhor.municipio
                    if (melhor.uf && !limpo(xdCnir.fazenda_uf)) patchExtra.fazenda_uf = melhor.uf
                    patchExtra.propriedade_fonte = 'cnir'
                }
                await supabase.from('crm_leads').update({ extra_data: patchExtra }).eq('id', leadId)
                lead = (await reload()) ?? lead
            } catch (e) {
                console.warn('[habilitacao-sync] consulta CNIR falhou:', e instanceof Error ? e.message : e)
            }
        }
    }

    const xd = lead.extra_data ?? {}
    if (base.consultou) {
        if (lead.inscricao_estadual) base.encontrados.push(`I.E. ${lead.inscricao_estadual}`)
        if (xd.fazenda_nome) base.encontrados.push(String(xd.fazenda_nome))
        if (xd.fazenda_cidade) base.encontrados.push(`${xd.fazenda_cidade}/${xd.fazenda_uf ?? ''}`)
        if (xd.endereco_titular) base.encontrados.push('endereço do titular')
    }

    // ── 2. Recalcula e persiste o checklist ────────────────────────────────
    const docs = await loadDocs(supabase, leadId)
    const checklist = buildChecklist(lead, docs)
    base.checklist = checklist
    base.faltando = checklist.missingLabels

    // `extraAtual` acumula: cada update parte do estado mais recente, senão um
    // gravaria por cima do outro (foi assim que a auditoria da consulta sumiu).
    const extraAtual: Record<string, unknown> = {
        ...xd,
        habilitacao: {
            done: checklist.done,
            total: checklist.total,
            complete: checklist.complete,
            missing: checklist.missingLabels,
            at: new Date().toISOString(),
        },
    }
    if (!opts.dryRun) {
        await supabase.from('crm_leads').update({ extra_data: extraAtual }).eq('id', leadId)
    }

    // Complemento: ficha já postada em algum grupo ganha os dados que chegaram
    // DEPOIS (fazenda da conversa/consulta, docs novos) citando o mesmo código.
    // WhatsApp não deixa editar mensagem após 15 min — o complemento é o jeito
    // de a ficha "ficar completa" na mesma thread. Roda antes da submissão para
    // valer também para quem já saiu da fila (cadastro_submetido_at).
    if (submeter && !opts.dryRun) {
        await enviarComplementoCadastro(supabase, leadId).catch(() => { /* best-effort */ })
    }

    // ── 3. Cadastro ANALISÁVEL → ficha às leiloeiras. Senão → a IA pede o que
    // falta. A leiloeira só analisa com documentação completa (identidade +
    // propriedade + movimentação pecuária); mandar incompleto só gera recusa.
    // O checklist guia a CONVERSA; `prontoParaFicha` guarda a SUBMISSÃO.
    const { pronto, faltamEssenciais } = prontoParaFicha(checklist)
    base.pronto = pronto
    if (!pronto) return { ...base, motivo: `aguardando documentação para análise: ${faltamEssenciais.join(', ')}` }
    if (!submeter || opts.dryRun) return { ...base, motivo: 'pronto (submissão não solicitada)' }
    if (xd.cadastro_submetido_at) return { ...base, motivo: 'ficha já submetida antes' }

    const sub = await submitLeadCadastroToLeiloeiraGroups(supabase, leadId)
    base.enviadosPara = sub.sent
    base.submetido = sub.sent > 0
    const coberturaCompleta = !sub.skipped.length && !sub.aguardandoDoc.length

    // A flag é gravada sobre o extra_data MAIS RECENTE (o submit acabou de
    // escrever `ficha_estado_enviado` lá; usar a cópia local apagaria a régua).
    const marcarSubmetido = async () => {
        const { data } = await supabase.from('crm_leads').select('extra_data').eq('id', leadId).single()
        const atual = ((data?.extra_data as Record<string, unknown> | null) ?? extraAtual)
        await supabase.from('crm_leads').update({
            extra_data: { ...atual, cadastro_submetido_at: new Date().toISOString() },
        }).eq('id', leadId)
    }

    // attempted=0 sem pendências = todas as leiloeiras já tinham recebido este
    // cliente (submissão antiga, antes da flag existir). Grava a flag para o
    // lead sair da fila da varredura em vez de ser reprocessado para sempre.
    if (sub.sent === 0 && sub.attempted === 0 && coberturaCompleta) {
        await marcarSubmetido()
        return { ...base, motivo: 'ficha já estava nas leiloeiras (flag regularizada)' }
    }

    // Nada enviado agora e o que falta é só documento → silencioso: a varredura
    // roda de hora em hora e avisar a equipe a cada passada viraria spam.
    if (sub.sent === 0 && !sub.attempted && sub.aguardandoDoc.length && !sub.skipped.length) {
        return { ...base, motivo: `aguardando documento com foto para: ${sub.aguardandoDoc.join(', ')}` }
    }

    if (sub.sent > 0) {
        if (coberturaCompleta) {
            await marcarSubmetido()
        }
        const fone = lead.celular || lead.telefone || ''
        const uf = String(lead.estado ?? '').trim() || String((lead.extra_data ?? {}).fazenda_uf ?? '').trim()
        const linhas = [
            '📤 *Ficha de cadastro enviada às leiloeiras*',
            `${lead.nome ?? leadId}${uf ? ` (${uf.toUpperCase()})` : ''}${fone ? ` — ${fone}` : ''}`,
            `Enviada ao grupo de ${sub.sent} leiloeira(s) — aguardando aprovado/recusado.`,
        ]
        if (sub.aguardandoDoc.length) {
            linhas.push(`⏳ ${sub.aguardandoDoc.join(', ')}: aguardando documento com foto do cliente para enviar.`)
        }
        // A ressalva da I.E. dispensada só aqui: é neste momento que a ficha
        // realmente segue sem ela, e é isto que a equipe precisa conferir.
        const dispensa = ieDispensadaParaLead(lead)
        if (dispensa && !lead.inscricao_estadual) {
            linhas.push('', avisoIeDispensadaTexto(lead.nome ?? leadId, fone))
        }
        await notifyTeamGroup(supabase, linhas.join('\n')).catch(() => { /* best-effort */ })
    } else if (sub.skipped.length) {
        base.motivo = sub.skipped.map(s => `${s.leiloeira}: ${s.reason}`).join(' · ')
        await notifyTeamGroup(supabase, [
            '⚠️ *Cadastro completo, mas a ficha NÃO foi enviada*',
            `${lead.nome ?? leadId}`,
            base.motivo,
        ].join('\n')).catch(() => { /* best-effort */ })
    }
    return base
}
