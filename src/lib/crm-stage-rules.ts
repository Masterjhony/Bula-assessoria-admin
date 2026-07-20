import type { SupabaseClient } from '@supabase/supabase-js'
import {
    CRM_STAGE_ENTRY,
    CRM_STAGE_CONNECTION,
    CRM_STAGE_QUALIFICATION,
    CRM_STAGE_INFO_CAPTURED,
    CRM_STAGE_REGISTRATION,
    CRM_STAGE_LOST,
    normalizeCRMStatus,
} from './crm-types'

/**
 * REGRAS DE MOVIMENTAÇÃO AUTOMÁTICA DE ETAPAS — fonte única.
 *
 * Todo movimento automático de lead entre etapas do CRM obedece às regras
 * abaixo e a NENHUMA outra. Quem move é sempre um destes três atores, e cada
 * movimento fica auditado em extra_data.stage_history (quem, de→para, motivo,
 * quando — últimas 30 entradas), que alimenta o painel "Movimentações de etapa".
 *
 * PRINCÍPIOS
 *  1. Automação só AVANÇA (piso por dado coletado, via maxStatus). Uma decisão
 *     manual de adiantar o lead nunca é desfeita por mensagem ambígua.
 *  2. CADASTRO e GANHO são decisões humanas. A automação para em
 *     INFORMAÇÕES CAPTADAS; aprovar cadastro/ganhar é gente.
 *  3. As duas únicas transições automáticas "para trás" são as terminais:
 *     perda por inatividade (→ PERDIDOS) e reativação (PERDIDOS → volta).
 *
 * PISOS DE AVANÇO (concierge, ator 'ia' — computeStageFromData):
 *  • lead respondeu                          → no mínimo CONEXÃO
 *  • qualquer dado de qualificação coletado  → no mínimo QUALIFICAÇÃO
 *  • checklist completo OU interesse+IE+doc  → no mínimo INFORMAÇÕES CAPTADAS
 *  • IA concluiu nao_apto                    → PERDIDOS
 *
 * PERDA POR INATIVIDADE (cron diário, ator 'sistema' — sweepInactiveLeadsToLost):
 *  • Só CONEXÃO e QUALIFICAÇÃO. Lead que respondeu ao menos 1 vez, recebeu
 *    ≥3 tentativas nossas e está ≥14 dias sem responder → PERDIDOS.
 *  • Lead que NUNCA respondeu é backlog, não perdido — não é tocado.
 *  • INFORMAÇÕES CAPTADAS em diante NUNCA perde automaticamente (o lead já
 *    entregou dados; desistir dele é decisão humana).
 *  • Handoff humano e opt-out são intocáveis.
 *
 * REATIVAÇÃO (inbound, ator 'sistema' — reactivateLeadIfLost, este arquivo):
 *  • Lead em PERDIDOS que manda QUALQUER mensagem volta imediatamente para a
 *    etapa de onde caiu (último stage_history com to=PERDIDOS), com fallback
 *    QUALIFICAÇÃO se o histórico não disser. Responder = não está perdido.
 *  • Vale também para quem foi movido a PERDIDOS manualmente: se o operador
 *    quer o lead fora de vez, o caminho é opt-out ou arquivar — não PERDIDOS.
 *  • Opt-out não reativa (o silêncio é um pedido do lead).
 *  • A etapa de retorno nunca passa de INFORMAÇÕES CAPTADAS (princípio 2).
 */

/** Ordem de "senioridade" das etapas para o avanço-somente (maxStatus). */
export const STATUS_ORDER = [
    CRM_STAGE_ENTRY,
    CRM_STAGE_CONNECTION,
    CRM_STAGE_QUALIFICATION,
    CRM_STAGE_INFO_CAPTURED,
    CRM_STAGE_REGISTRATION,
    CRM_STAGE_LOST,
]

/**
 * Piso de etapa: devolve a mais "avançada" entre a atual e a candidata.
 * ATENÇÃO: PERDIDOS é o topo da ordem — maxStatus nunca tira um lead de lá.
 * Sair de PERDIDOS é exclusividade de reactivateLeadIfLost.
 */
export function maxStatus(current: string, candidate: string): string {
    const ci = STATUS_ORDER.indexOf(normalizeCRMStatus(current))
    const ni = STATUS_ORDER.indexOf(normalizeCRMStatus(candidate))
    if (ni < 0) return current
    if (ci < 0) return candidate
    return ni > ci ? candidate : current
}

export interface StageMove {
    from: string
    to: string
    reason: string
    by: 'ia' | 'sistema' | 'usuario'
    at?: string
}

const STAGE_HISTORY_MAX = 30

/**
 * Registra um movimento no extra_data.stage_history (imutável: devolve um novo
 * extra_data). Toda escrita de stage_history do sistema passa por aqui — o
 * formato é o contrato do painel "Movimentações de etapa".
 */
export function pushStageMove(
    extraData: Record<string, unknown> | null | undefined,
    move: StageMove,
): Record<string, unknown> {
    const prev = extraData ?? {}
    const rawHist = prev.stage_history
    const history = Array.isArray(rawHist) ? [...rawHist] : []
    history.unshift({ ...move, at: move.at ?? new Date().toISOString() })
    return { ...prev, stage_history: history.slice(0, STAGE_HISTORY_MAX) }
}

/**
 * Para onde um lead PERDIDO volta ao responder: a etapa de onde ele caiu
 * (último movimento com destino PERDIDOS), limitada a INFORMAÇÕES CAPTADAS.
 * Histórico sem essa informação (ou etapa inválida) → QUALIFICAÇÃO, que é o
 * piso natural de quem respondeu.
 */
export function reactivationTarget(extraData: Record<string, unknown> | null | undefined): string {
    const rawHist = (extraData ?? {}).stage_history
    const history = Array.isArray(rawHist) ? rawHist : []
    const lastLost = history.find(
        (h): h is { from?: unknown; to?: unknown } =>
            !!h && typeof h === 'object' && normalizeCRMStatus(String((h as { to?: unknown }).to ?? '')) === CRM_STAGE_LOST,
    )
    const from = normalizeCRMStatus(String(lastLost?.from ?? ''))
    const allowed = [CRM_STAGE_CONNECTION, CRM_STAGE_QUALIFICATION, CRM_STAGE_INFO_CAPTURED]
    if (allowed.includes(from)) return from
    return CRM_STAGE_QUALIFICATION
}

/**
 * REGRA DE REATIVAÇÃO: chamada pelo pipeline de inbound para TODO lead que
 * mandou mensagem. Se ele está em PERDIDOS (e não é opt-out), volta para a
 * etapa de onde caiu e audita o movimento. Devolve a etapa nova, ou null se
 * nada mudou. Best-effort: falha de banco não pode derrubar o atendimento.
 */
export async function reactivateLeadIfLost(
    supabase: SupabaseClient,
    lead: { id: string; status?: string | null; optout_whatsapp?: boolean | null },
): Promise<string | null> {
    if (normalizeCRMStatus(lead.status) !== CRM_STAGE_LOST) return null
    if (lead.optout_whatsapp) return null
    try {
        const { data } = await supabase
            .from('crm_leads')
            .select('extra_data')
            .eq('id', lead.id)
            .single()
        const extra = (data?.extra_data ?? {}) as Record<string, unknown>
        const target = reactivationTarget(extra)
        const nextExtra = pushStageMove(extra, {
            from: CRM_STAGE_LOST,
            to: target,
            reason: 'lead respondeu — reativado automaticamente',
            by: 'sistema',
        })
        const { error } = await supabase
            .from('crm_leads')
            .update({ status: target, extra_data: nextExtra })
            .eq('id', lead.id)
            .eq('status', lead.status ?? CRM_STAGE_LOST) // corrida: só move se ainda estiver perdido
        if (error) {
            console.warn('[stage-rules] reativação falhou:', error.message)
            return null
        }
        return target
    } catch (e) {
        console.warn('[stage-rules] reativação falhou:', e instanceof Error ? e.message : e)
        return null
    }
}
