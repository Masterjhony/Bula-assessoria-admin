import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CRM_STAGE_QUALIFICATION,
  CRM_STAGE_INFO_CAPTURED,
  CRM_STAGE_REGISTRATION,
  DEFAULT_JMP_MQL_RULE,
  evaluateMql,
  normalizeCRMStatus,
  type CRMMqlRule,
} from '@/lib/crm-types'
import {
  consultarInscricaoEstadualPorCpf,
  normalizeUf,
  type StateRegistrationReport,
} from '@/lib/state-registration-provider'

type LeadLike = {
  id: string
  status: string
  cpf?: string | null
  estado?: string | null
  quantidade_animais?: string | null
  tem_inscricao_estadual?: string | null
  inscricao_estadual?: string | null
  contact_history?: unknown
  extra_data?: Record<string, unknown> | null
}

type PreviousLike = { status?: string | null } | null | undefined

const RECHECK_DAYS = 30

// Como no crédito: a I.E. continua necessária depois da QUALIFICAÇÃO — lead
// que avança direto (movido pela IA) também dispara a consulta.
const IE_STAGES = new Set([
  CRM_STAGE_QUALIFICATION,
  CRM_STAGE_INFO_CAPTURED,
  CRM_STAGE_REGISTRATION,
])

function isQualification(status: string): boolean {
  return IE_STAGES.has(normalizeCRMStatus(status))
}

function recentlyChecked(extra: Record<string, unknown> | null | undefined): boolean {
  const fiscal = (extra?.fiscal || null) as { ie?: { consultedAt?: string } } | null
  const consultedAt = fiscal?.ie?.consultedAt
  if (!consultedAt) return false
  const last = new Date(consultedAt).getTime()
  if (Number.isNaN(last)) return false
  return Date.now() - last < RECHECK_DAYS * 86400000
}

export function shouldRunStateRegistrationCheck(lead: LeadLike, previous: PreviousLike): boolean {
  if (!isQualification(lead.status)) return false
  if (!lead.cpf || lead.cpf.replace(/\D/g, '').length !== 11) return false
  if (String(lead.inscricao_estadual || '').trim()) return false

  const stageJustEntered = !previous || !isQualification(String(previous.status || ''))
  if (stageJustEntered) return true
  return !recentlyChecked(lead.extra_data)
}

function registrationSummary(report: StateRegistrationReport): string {
  if (report.pending) return report.message || 'Consulta de I.E. pendente.'
  if (!report.inscricaoEstadual) {
    return `I.E. nao encontrada${report.uf ? ` em ${report.uf}` : ''}.`
  }
  const best = report.results.find(r => r.inscricao_estadual === report.inscricaoEstadual)
  const bits = [
    `I.E. ${report.inscricaoEstadual}`,
    report.uf || best?.uf_ie,
    best?.situacao_ie || best?.situacao_cadastral,
    best?.tipo_ie,
  ].filter(Boolean)
  return `${bits.join(' · ')}.`
}

function appendNote(history: unknown, note: string): unknown[] {
  const arr = Array.isArray(history) ? [...history] : []
  arr.push({
    id: crypto.randomUUID(),
    type: 'outro',
    date: new Date().toISOString(),
    notes: `[Automacao] ${note}`,
    by: 'Sistema',
  })
  return arr
}

export interface StateRegistrationCheckResult {
  attempted: boolean
  pending: boolean
  inscricaoEstadual: string | null
  temInscricaoEstadual: 'Sim' | 'Não' | ''
  reason?: string
}

export async function maybeRunStateRegistrationCheck(
  supabase: SupabaseClient,
  lead: LeadLike,
  previous: PreviousLike,
  mqlRule?: CRMMqlRule | null,
): Promise<StateRegistrationCheckResult> {
  if (!shouldRunStateRegistrationCheck(lead, previous)) {
    return {
      attempted: false,
      pending: false,
      inscricaoEstadual: null,
      temInscricaoEstadual: '',
      reason: 'condicoes nao atendidas',
    }
  }

  const allowAllStates = process.env.FISCALAPI_IE_ALL_STATES === 'true'
  const uf = normalizeUf(lead.estado)
  const report = await consultarInscricaoEstadualPorCpf({
    cpf: String(lead.cpf),
    uf,
    allowAllStates,
  })

  if (report.pending && !process.env.FISCALAPI_API_KEY) {
    return {
      attempted: true,
      pending: true,
      inscricaoEstadual: null,
      temInscricaoEstadual: '',
      reason: report.message,
    }
  }

  if (report.pending && !uf && !allowAllStates) {
    return {
      attempted: true,
      pending: true,
      inscricaoEstadual: null,
      temInscricaoEstadual: '',
      reason: report.message,
    }
  }

  const summary = registrationSummary(report)
  const { data: current } = await supabase
    .from('crm_leads')
    .select('extra_data, contact_history')
    .eq('id', lead.id)
    .single()
  const extraData = (((current?.extra_data as Record<string, unknown> | null) || lead.extra_data || {}) as Record<string, unknown>)
  const fiscal = (extraData.fiscal || {}) as Record<string, unknown>
  const nextTemIe = report.pending ? lead.tem_inscricao_estadual || '' : report.temInscricaoEstadual
  const nextIe = report.pending ? lead.inscricao_estadual || '' : report.inscricaoEstadual || ''

  const patch: Record<string, unknown> = {
    extra_data: {
      ...extraData,
      fiscal: {
        ...fiscal,
        ie: {
          inscricaoEstadual: report.inscricaoEstadual,
          temInscricaoEstadual: report.temInscricaoEstadual,
          uf: report.uf,
          provider: report.provider,
          consultedAt: report.consultedAt,
          pending: report.pending,
          results: report.results.slice(0, 5),
        },
      },
    },
    contact_history: appendNote(current?.contact_history ?? lead.contact_history, summary),
  }

  if (!report.pending) {
    patch.tem_inscricao_estadual = nextTemIe
    patch.inscricao_estadual = nextIe
    patch.is_mql = evaluateMql(mqlRule || DEFAULT_JMP_MQL_RULE, {
      quantidade_animais: lead.quantidade_animais,
      tem_inscricao_estadual: nextTemIe,
      inscricao_estadual: nextIe,
    })
  }

  const { error } = await supabase.from('crm_leads').update(patch).eq('id', lead.id)
  if (error) {
    console.warn('[CRM] Falha ao gravar consulta de I.E.:', error.message)
  }

  return {
    attempted: true,
    pending: report.pending,
    inscricaoEstadual: report.inscricaoEstadual,
    temInscricaoEstadual: report.temInscricaoEstadual,
    reason: report.message,
  }
}
