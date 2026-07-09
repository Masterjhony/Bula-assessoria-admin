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
 *   3. Checklist completo  → posta a ficha nos grupos das leiloeiras (idempotente).
 *      Checklist incompleto → devolve o que falta, para a IA pedir ao cliente.
 *
 * Idempotente e chamável de qualquer lugar: do turno do concierge, de um
 * backfill, de um botão no CRM.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeHabilitacaoChecklist, type HabilitacaoChecklist } from './crm-habilitacao'
import { maybeRunStateRegistrationCheck } from './crm-state-registration-automation'
import { maybeEnrichLeadFromPhone } from './crm-lead-enrichment'
import { submitLeadCadastroToLeiloeiraGroups } from './leiloeira-whatsapp-cadastro'
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
        documentosSimplificados: Boolean(xd.propriedade_consultada_at),
    })
}

const cpfValido = (v: unknown) => String(v ?? '').replace(/\D/g, '').length === 11

export async function sincronizarHabilitacao(
    supabase: SupabaseClient,
    leadId: string,
    opts: { consultar?: boolean; submeter?: boolean; dryRun?: boolean } = {},
): Promise<HabilitacaoSyncResult> {
    const consultar = opts.consultar ?? true
    const submeter = opts.submeter ?? true
    const base: HabilitacaoSyncResult = {
        leadId, consultou: false, encontrados: [], checklist: null,
        faltando: [], submetido: false, enviadosPara: 0,
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

    // ── 3. Completo → ficha às leiloeiras. Incompleto → a IA pede o que falta.
    if (!checklist.complete) return { ...base, motivo: `faltam ${checklist.missingLabels.length} item(ns)` }
    if (!submeter || opts.dryRun) return { ...base, motivo: 'completo (submissão não solicitada)' }
    // Flag própria da submissão — separada do aviso interno, que dispara antes.
    if (xd.cadastro_submetido_at) return { ...base, motivo: 'ficha já submetida antes' }

    const sub = await submitLeadCadastroToLeiloeiraGroups(supabase, leadId)
    base.enviadosPara = sub.sent
    base.submetido = sub.sent > 0

    if (sub.sent > 0) {
        await supabase.from('crm_leads').update({
            extra_data: { ...extraAtual, cadastro_submetido_at: new Date().toISOString() },
        }).eq('id', leadId)
        const fone = lead.celular || lead.telefone || ''
        const linhas = [
            '📤 *Ficha de cadastro enviada às leiloeiras*',
            `${lead.nome ?? leadId}${fone ? ` — ${fone}` : ''}`,
            `Enviada ao grupo de ${sub.sent} leiloeira(s) — aguardando aprovado/recusado.`,
        ]
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
