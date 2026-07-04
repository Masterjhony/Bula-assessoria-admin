// ─────────────────────────────────────────────────────────────────────────────
// Automação de SCORE + PROTESTOS no CRM.
// Quando um lead entra na etapa QUALIFICAÇÃO e tem CPF, dispara a consulta de
// crédito (provedor plugável em `credit-score-provider`) e grava o resultado no
// próprio lead: `score_serasa`, `pendencias_financeiras` (resumo legível) e
// `extra_data.credito` (faixa + protestos + carimbo). Também registra uma nota
// no `contact_history`. Best-effort: nunca derruba a ação que a chamou.
//
// Espelha o padrão de `crm-whatsapp-assessor.ts` (shouldDispatch + persistência
// em extra_data), mas para crédito em vez de notificação de assessor.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CRM_STAGE_ENTRY,
  CRM_STAGE_CONNECTION,
  CRM_STAGE_QUALIFICATION,
  CRM_STAGE_INFO_CAPTURED,
  CRM_STAGE_REGISTRATION,
  normalizeCRMStatus,
} from '@/lib/crm-types'
import { consultarCredito, type CreditReport } from '@/lib/credit-score-provider'
import type { Protesto } from '@/lib/clientes'

type LeadLike = {
  id: string
  status: string
  cpf?: string | null
  score_serasa?: number | null
  contact_history?: unknown
  extra_data?: Record<string, unknown> | null
}

type PreviousLike = { status?: string | null } | null | undefined

// Reconsulta no máximo 1×/14 dias, salvo se a etapa acabou de virar QUALIFICAÇÃO.
const RECHECK_DAYS = 14

// Dispara em QUALQUER etapa ativa (só PERDIDOS fica de fora): assim que o CPF
// existe — venha do formulário, da importação, do humano no card ou da IA — a
// consulta roda e o card já nasce enriquecido, antes mesmo do atendimento.
// Custo controlado pelos outros gates: CPF válido + recheck ≤1×/14 dias.
const CREDIT_STAGES = new Set([
  CRM_STAGE_ENTRY,
  CRM_STAGE_CONNECTION,
  CRM_STAGE_QUALIFICATION,
  CRM_STAGE_INFO_CAPTURED,
  CRM_STAGE_REGISTRATION,
])

function isQualification(status: string): boolean {
  return CREDIT_STAGES.has(normalizeCRMStatus(status))
}

function recentlyChecked(extra: Record<string, unknown> | null | undefined): boolean {
  const credito = (extra?.credito || null) as { consultedAt?: string } | null
  if (!credito?.consultedAt) return false
  const last = new Date(credito.consultedAt).getTime()
  if (Number.isNaN(last)) return false
  return Date.now() - last < RECHECK_DAYS * 86400000
}

export function shouldRunCreditCheck(lead: LeadLike, previous: PreviousLike): boolean {
  if (!isQualification(lead.status)) return false
  if (!lead.cpf || lead.cpf.replace(/\D/g, '').length !== 11) return false
  const stageJustEntered = !previous || !isQualification(String(previous.status || ''))
  if (stageJustEntered) return true
  // mesma etapa: só reconsulta se nunca consultou ou passou do prazo
  return !recentlyChecked(lead.extra_data)
}

function protestosSummary(report: CreditReport): string {
  if (report.pending) return report.message || 'Consulta de crédito pendente.'
  const n = report.protestos.length
  const scoreTxt = report.score != null ? `Score ${report.score}` : 'Score indisponível'
  if (n === 0) return `${scoreTxt} · sem protestos`
  const total = report.protestos.reduce((s, p) => s + (p.valor || 0), 0)
  return `${scoreTxt} · ${n} protesto${n > 1 ? 's' : ''}${total ? ` (R$ ${total.toLocaleString('pt-BR')})` : ''}`
}

function appendNote(history: unknown, note: string): unknown[] {
  const arr = Array.isArray(history) ? [...history] : []
  arr.push({
    id: crypto.randomUUID(),
    type: 'outro',
    date: new Date().toISOString(),
    notes: `[Automação] ${note}`,
    by: 'Sistema',
  })
  return arr
}

export interface CreditCheckResult {
  attempted: boolean
  pending: boolean
  score: number | null
  protestos: Protesto[]
  reason?: string
}

/**
 * Consulta o crédito do lead se as condições forem satisfeitas e grava o
 * resultado. Retorna o que foi feito (best-effort).
 */
export async function maybeRunCreditCheck(
  supabase: SupabaseClient,
  lead: LeadLike,
  previous: PreviousLike,
): Promise<CreditCheckResult> {
  if (!shouldRunCreditCheck(lead, previous)) {
    return { attempted: false, pending: false, score: null, protestos: [], reason: 'condições não atendidas' }
  }

  const report = await consultarCredito(String(lead.cpf))
  const summary = protestosSummary(report)
  const { data: current } = await supabase
    .from('crm_leads')
    .select('extra_data, contact_history')
    .eq('id', lead.id)
    .single()

  const extra = {
    ...(((current?.extra_data as Record<string, unknown> | null) || lead.extra_data || {}) as Record<string, unknown>),
    credito: {
      score: report.score,
      faixa: report.faixa,
      protestos: report.protestos,
      provider: report.provider,
      consultedAt: report.consultedAt,
      pending: report.pending,
    },
  }

  const patch: Record<string, unknown> = {
    extra_data: extra,
    contact_history: appendNote(current?.contact_history ?? lead.contact_history, summary),
  }
  if (!report.pending) {
    if (report.score != null) patch.score_serasa = report.score
    patch.pendencias_financeiras = summary
  }

  const { error } = await supabase.from('crm_leads').update(patch).eq('id', lead.id)
  if (error) {
    console.warn('[CRM] Falha ao gravar consulta de crédito:', error.message)
  }

  return {
    attempted: true,
    pending: report.pending,
    score: report.score,
    protestos: report.protestos,
    reason: report.message,
  }
}
