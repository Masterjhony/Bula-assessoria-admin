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

// Conectivos ignorados na comparação de nomes.
const NAME_STOPWORDS = new Set(['de', 'da', 'do', 'dos', 'das', 'e'])

function nameTokens(name: string): string[] {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !NAME_STOPWORDS.has(t.toLowerCase()))
}

/**
 * O telefone da base pode pertencer a OUTRA pessoa (número trocou de dono,
 * é de um familiar, o lead cadastrou nº de terceiro). Só confiamos no CPF
 * enriquecido se o nome retornado casar com o do lead:
 *   • lead precisa ter ≥2 tokens de nome (nomes só de 1 palavra são ambíguos);
 *   • ≥2 tokens do lead precisam aparecer no nome retornado (match exato ou
 *     prefixo ≥4 chars, p/ pegar Fred→Frederico).
 * Sem isso, metade dos enriquecimentos gravaria a pessoa errada no card.
 */
export function nameMatchesEnriched(leadName: string, returnedName: string): boolean {
  const a = nameTokens(leadName)
  const b = nameTokens(returnedName)
  if (a.length < 2 || b.length === 0) return false
  let matched = 0
  for (const t of a) {
    const hit = b.some(x => x === t || (t.length >= 4 && x.startsWith(t)) || (x.length >= 4 && t.startsWith(x)))
    if (hit) matched++
  }
  return matched >= 2
}

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

  const leadNome = String(current?.nome ?? lead.nome ?? '')
  // Só confia no CPF se o nome retornado casar (o telefone pode ser de outra
  // pessoa). Sem match → NÃO grava CPF; guarda como "suspeito" p/ revisão.
  const nameOk = Boolean(r.cpf && r.nome && nameMatchesEnriched(leadNome, r.nome))
  const acceptCpf = !r.pending && r.cpf && nameOk

  const extra: Record<string, unknown> = {
    ...(((current?.extra_data as Record<string, unknown> | null) || lead.extra_data || {}) as Record<string, unknown>),
    enriquecimento: {
      provider: 'directd',
      consultedAt: new Date().toISOString(),
      pending: r.pending,
      cpfEncontrado: Boolean(r.cpf),
      nomeConfere: nameOk,
      nomeRetornado: r.cpf ? r.nome : null,
      rendaFaixa: acceptCpf ? r.rendaFaixa : null,
      endereco: acceptCpf ? r.endereco : null,
      message: r.message,
    },
  }
  // CPF achado mas de OUTRA pessoa: registra p/ auditoria, não usa.
  if (r.cpf && !nameOk) {
    extra.enriquecimento_suspeito = {
      cpf: r.cpf,
      nomeRetornado: r.nome,
      motivo: 'nome retornado não confere com o lead (telefone pode ser de terceiro)',
      at: new Date().toISOString(),
    }
  }

  const note = r.pending
    ? `Enriquecimento pendente: ${r.message || 'erro na consulta'}`
    : acceptCpf
      ? `Enriquecimento (telefone→CPF): CPF localizado e nome confere${r.rendaFaixa ? ` · renda ${r.rendaFaixa}` : ''}`
      : r.cpf
        ? `Enriquecimento: telefone retornou "${r.nome}", que NÃO confere com o lead — CPF não aplicado (revisar).`
        : 'Enriquecimento: nenhum CPF encontrado para este telefone.'

  const patch: Record<string, unknown> = {
    extra_data: extra,
    contact_history: appendNote(current?.contact_history ?? lead.contact_history, note),
  }
  if (acceptCpf) {
    patch.cpf = r.cpf
    // Preenche só o que está vazio — dado digitado por humano/lead prevalece.
    if (r.email && !String(current?.email ?? lead.email ?? '').trim()) patch.email = r.email
    if (r.endereco && !extra.endereco_titular) {
      extra.endereco_titular = r.endereco
    }
  }

  const { error } = await supabase.from('crm_leads').update(patch).eq('id', lead.id)
  if (error) console.warn('[CRM] Falha ao gravar enriquecimento:', error.message)

  // Só devolve o CPF para cascatear (I.E./crédito) quando o nome confere.
  return { attempted: true, cpf: acceptCpf ? r.cpf : null, reason: r.message }
}
