// ─────────────────────────────────────────────────────────────────────────────
// Automação CRM → CLIENTES.
// Quando um lead chega na etapa CADASTRO e está APROVADO (score razoável-pra-cima
// + tem Inscrição Estadual), ele "vira cliente": é gravado/atualizado na tabela
// `clientes` (overlay por match_key) e ARQUIVADO no CRM (sai do Kanban). Ao virar
// cliente, dispara o e-mail de submissão para as leiloeiras parceiras.
// Best-effort e idempotente.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { CRM_STAGE_REGISTRATION, normalizeCRMStatus } from '@/lib/crm-types'
import { clienteMatchKey, scoreToFaixa, isClienteCadastroApto } from '@/lib/clientes'
import { submitClienteToLeiloeiras } from '@/lib/leiloeira-submission'

type LeadLike = {
  id: string
  nome: string
  empresa?: string | null
  status: string
  telefone?: string | null
  celular?: string | null
  email?: string | null
  cidade?: string | null
  estado?: string | null
  cpf?: string | null
  inscricao_estadual?: string | null
  tem_inscricao_estadual?: string | null
  score_serasa?: number | null
  pendencias_financeiras?: string | null
  momento_pecuaria?: string | null
  operacao_pecuaria?: string | null
  responsavel?: string | null
  extra_data?: Record<string, unknown> | null
  arquivado?: boolean | null
}

function isRegistration(status: string): boolean {
  return normalizeCRMStatus(status) === CRM_STAGE_REGISTRATION
}

/** Critério de aprovação: score razoável-pra-cima + tem I.E., ou flag manual. */
export function leadCadastroApto(lead: LeadLike): boolean {
  const manual = Boolean(lead.extra_data?.cadastro_aprovado)
  const auto = isClienteCadastroApto({
    scoreCredito: lead.score_serasa ?? null,
    temIE: lead.tem_inscricao_estadual ?? null,
  })
  return manual || auto
}

export interface SyncResult {
  synced: boolean
  matchKey?: string
  reason?: string
  emailsSent?: number
}

/**
 * Move o lead aprovado para a base de Clientes e o arquiva no CRM.
 * @param force quando true (aprovação manual), ignora a checagem automática de
 *              critério mas ainda exige nome.
 */
export async function syncLeadToClientes(
  supabase: SupabaseClient,
  lead: LeadLike,
  opts: { force?: boolean; notifyLeiloeiras?: boolean; status?: string } = {},
): Promise<SyncResult> {
  if (lead.arquivado) return { synced: false, reason: 'lead já arquivado' }
  if (!opts.force && !isRegistration(lead.status)) return { synced: false, reason: 'fora da etapa CADASTRO' }
  if (!opts.force && !leadCadastroApto(lead)) return { synced: false, reason: 'cadastro não aprovado' }

  const nome = (lead.nome || lead.empresa || '').trim()
  const match_key = clienteMatchKey(nome)
  if (!match_key) return { synced: false, reason: 'lead sem nome' }

  const score = lead.score_serasa ?? null
  const payload = {
    match_key,
    nome,
    responsavel: (lead.responsavel || '').trim(),
    telefone: (lead.celular || lead.telefone || '').trim(),
    email: (lead.email || '').trim(),
    cidade: (lead.cidade || '').trim(),
    uf: (lead.estado || '').trim().toUpperCase(),
    status: opts.status ?? 'ativo',
    cpf: (lead.cpf || '').replace(/\D/g, ''),
    inscricao_estadual: (lead.inscricao_estadual || '').trim(),
    tem_inscricao_estadual: (lead.tem_inscricao_estadual || '').trim(),
    score_credito: score,
    score_faixa: scoreToFaixa(score),
    momento_pecuaria: (lead.momento_pecuaria || '').trim(),
    operacao_pecuaria: (lead.operacao_pecuaria || '').trim(),
    crm_lead_id: lead.id,
  }

  const { error: upErr } = await supabase.from('clientes').upsert(payload, { onConflict: 'match_key' })
  if (upErr) {
    console.warn('[CRM→Clientes] falha no upsert do cliente:', upErr.message)
    return { synced: false, reason: upErr.message }
  }

  // Arquiva o lead (soft-delete) — sai do Kanban.
  const { error: arErr } = await supabase
    .from('crm_leads')
    .update({ arquivado: true, arquivado_at: new Date().toISOString() })
    .eq('id', lead.id)
  if (arErr) console.warn('[CRM→Clientes] falha ao arquivar lead:', arErr.message)

  // Dispara submissão para as leiloeiras (best-effort). Pode ser desligado
  // (ex.: botão de "ganho" manual, enquanto o cadastro das leiloeiras não existe).
  let emailsSent = 0
  if (opts.notifyLeiloeiras !== false) {
    try {
      const r = await submitClienteToLeiloeiras(supabase, match_key)
      emailsSent = r.sent
    } catch (e) {
      console.warn('[CRM→Clientes] falha na submissão p/ leiloeiras:', e instanceof Error ? e.message : e)
    }
  }

  return { synced: true, matchKey: match_key, emailsSent }
}
