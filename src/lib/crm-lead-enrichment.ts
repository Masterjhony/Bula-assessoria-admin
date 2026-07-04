// ─────────────────────────────────────────────────────────────────────────────
// Automação de ENRIQUECIMENTO do lead pelo telefone (Direct Data).
//
// Todo lead nasce com telefone (WhatsApp/formulário) mas quase nunca com CPF —
// e sem CPF nenhuma consulta externa (I.E., score, protestos) é possível. Este
// módulo descobre o CPF (+ e-mail/endereço/renda) a partir do CELULAR via
// /api/EnriquecimentoLead e grava no lead. Rodando ANTES das automações de
// crédito/I.E. no mesmo passo, o CPF descoberto já cascateia para elas.
//
// Gates de custo (consulta paga):
//   • etapa ativa (PERDIDOS fora)  • telefone presente  • CPF ainda vazio
//   • 1 tentativa a cada 30 dias (extra_data.enriquecimento.consultedAt)
// Sem DIRECTD_TOKEN → no-op. Best-effort: nunca derruba a ação que chamou.
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
import { enriquecerLeadPorTelefone, isDirectdConfigured } from '@/lib/directd-provider'

type LeadLike = {
  id: string
  status: string
  nome?: string | null
  telefone?: string | null
  celular?: string | null
  email?: string | null
  cpf?: string | null
  contact_history?: unknown
  extra_data?: Record<string, unknown> | null
}

const RETRY_DAYS = 30

const ACTIVE_STAGES = new Set([
  CRM_STAGE_ENTRY,
  CRM_STAGE_CONNECTION,
  CRM_STAGE_QUALIFICATION,
  CRM_STAGE_INFO_CAPTURED,
  CRM_STAGE_REGISTRATION,
])

function recentlyTried(extra: Record<string, unknown> | null | undefined): boolean {
  const enr = (extra?.enriquecimento || null) as { consultedAt?: string } | null
  if (!enr?.consultedAt) return false
  const last = new Date(enr.consultedAt).getTime()
  if (Number.isNaN(last)) return false
  return Date.now() - last < RETRY_DAYS * 86400000
}

export function shouldEnrichLead(lead: LeadLike): boolean {
  if (!isDirectdConfigured()) return false
  if (!ACTIVE_STAGES.has(normalizeCRMStatus(lead.status))) return false
  if (String(lead.cpf ?? '').replace(/\D/g, '').length === 11) return false
  const fone = String(lead.celular || lead.telefone || '').replace(/\D/g, '')
  if (fone.length < 10) return false
  return !recentlyTried(lead.extra_data)
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

export interface EnrichmentResult {
  attempted: boolean
  cpf: string | null
  reason?: string
}

/**
 * Enriquece o lead pelo telefone, se as condições valerem, e grava o resultado.
 * Retorna o CPF descoberto (para o caller cascatear às automações seguintes).
 */
export async function maybeEnrichLeadFromPhone(
  supabase: SupabaseClient,
  lead: LeadLike,
): Promise<EnrichmentResult> {
  if (!shouldEnrichLead(lead)) {
    return { attempted: false, cpf: null, reason: 'condições não atendidas' }
  }

  const fone = String(lead.celular || lead.telefone || '')
  const r = await enriquecerLeadPorTelefone(fone)

  // Relê extra_data/contact_history atuais para não sobrescrever escrita
  // concorrente (mesmo padrão da automação de crédito).
  const { data: current } = await supabase
    .from('crm_leads')
    .select('extra_data, contact_history, nome, email')
    .eq('id', lead.id)
    .single()

  const extra: Record<string, unknown> = {
    ...(((current?.extra_data as Record<string, unknown> | null) || lead.extra_data || {}) as Record<string, unknown>),
    enriquecimento: {
      provider: 'directd',
      consultedAt: new Date().toISOString(),
      pending: r.pending,
      cpfEncontrado: Boolean(r.cpf),
      rendaFaixa: r.rendaFaixa,
      endereco: r.endereco,
      message: r.message,
    },
  }

  const note = r.pending
    ? `Enriquecimento pendente: ${r.message || 'erro na consulta'}`
    : r.cpf
      ? `Enriquecimento (telefone→CPF): CPF localizado${r.nome ? ` · ${r.nome}` : ''}${r.rendaFaixa ? ` · renda ${r.rendaFaixa}` : ''}`
      : 'Enriquecimento: nenhum CPF encontrado para este telefone.'

  const patch: Record<string, unknown> = {
    extra_data: extra,
    contact_history: appendNote(current?.contact_history ?? lead.contact_history, note),
  }
  if (!r.pending && r.cpf) {
    patch.cpf = r.cpf
    // Preenche só o que está vazio — dado digitado por humano/lead prevalece.
    const nomeAtual = String(current?.nome ?? lead.nome ?? '').trim()
    if (r.nome && !/\S+\s+\S+/.test(nomeAtual)) patch.nome = r.nome
    if (r.email && !String(current?.email ?? lead.email ?? '').trim()) patch.email = r.email
    if (r.endereco && !extra.endereco_titular) {
      extra.endereco_titular = r.endereco
    }
  }

  const { error } = await supabase.from('crm_leads').update(patch).eq('id', lead.id)
  if (error) console.warn('[CRM] Falha ao gravar enriquecimento:', error.message)

  return { attempted: true, cpf: !r.pending ? r.cpf : null, reason: r.message }
}
