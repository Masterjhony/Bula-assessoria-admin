import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CRM_STAGE_ENTRY,
  CRM_STAGE_CONNECTION,
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
  ufFromPhone,
  type StateRegistrationRecord,
  type StateRegistrationReport,
} from '@/lib/state-registration-provider'
import { saveLeadDocFromUrl } from '@/lib/whatsapp-lead-documents'

type LeadLike = {
  id: string
  status: string
  nome?: string | null
  cpf?: string | null
  estado?: string | null
  telefone?: string | null
  celular?: string | null
  quantidade_animais?: string | null
  tem_inscricao_estadual?: string | null
  inscricao_estadual?: string | null
  contact_history?: unknown
  extra_data?: Record<string, unknown> | null
}

type PreviousLike = { status?: string | null } | null | undefined

const RECHECK_DAYS = 30

// Como no crédito: qualquer etapa ativa (só PERDIDOS de fora) — assim que o
// CPF aparece, a I.E. é buscada e preenche o card antes mesmo do atendimento.
// Gates de custo: CPF válido + só quando a I.E. ainda não existe + 1×/30 dias.
const IE_STAGES = new Set([
  CRM_STAGE_ENTRY,
  CRM_STAGE_CONNECTION,
  CRM_STAGE_QUALIFICATION,
  CRM_STAGE_INFO_CAPTURED,
  CRM_STAGE_REGISTRATION,
])

function isQualification(status: string): boolean {
  return IE_STAGES.has(normalizeCRMStatus(status))
}

function recentlyChecked(extra: Record<string, unknown> | null | undefined): boolean {
  const fiscal = (extra?.fiscal || null) as { ie?: { consultedAt?: string; pending?: boolean } } | null
  const consultedAt = fiscal?.ie?.consultedAt
  if (!consultedAt) return false
  // Consulta que FALHOU (sem saldo, provedor fora, UF ausente) não conta como
  // consulta feita — senão o erro carimba o lead e a trava de 30 dias bloqueia
  // a tentativa boa. Aconteceu: a cota do Infosimples estourou e todos os leads
  // ficaram travados até agosto.
  if (fiscal?.ie?.pending) return false
  const last = new Date(consultedAt).getTime()
  if (Number.isNaN(last)) return false
  return Date.now() - last < RECHECK_DAYS * 86400000
}

export function shouldRunStateRegistrationCheck(lead: LeadLike, previous: PreviousLike): boolean {
  if (!isQualification(lead.status)) return false
  if (!lead.cpf || lead.cpf.replace(/\D/g, '').length !== 11) return false

  // Ter o número da I.E. não basta mais para pular a consulta: é dela que vêm a
  // fazenda, a cidade/UF e o comprovante em PDF da SEFAZ. Só pula quem já tem
  // I.E. E propriedade confirmada.
  const jaTemTudo = Boolean(String(lead.inscricao_estadual || '').trim())
    && Boolean((lead.extra_data ?? {}).propriedade_consultada_at)
  if (jaTemTudo) return false

  const stageJustEntered = !previous || !isQualification(String(previous.status || ''))
  if (stageJustEntered) return true
  return !recentlyChecked(lead.extra_data)
}

const str = (v: unknown) => String(v ?? '').trim()

/** O registro que corresponde à I.E. escolhida (a ativa, quando há várias). */
function pickBest(report: StateRegistrationReport): StateRegistrationRecord | undefined {
  if (report.pending || !report.inscricaoEstadual) return undefined
  return report.results.find(r => r.inscricao_estadual === report.inscricaoEstadual) ?? report.results[0]
}

function registrationSummary(report: StateRegistrationReport): string {
  if (report.pending) return report.message || 'Consulta de I.E. pendente.'
  if (report.indisponivel) return report.message || 'Consulta de I.E. indisponível nesta UF.'
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

  // UFs candidatas, na ordem de confiança: a que o lead informou no cadastro e
  // a do DDD do telefone. A maioria dos leads não preenche `estado` — sem o
  // fallback do DDD a consulta nunca rodava. E quando a UF do cadastro não tem
  // I.E. (ou a SEFAZ dela não permite consulta por CPF), a UF do DDD é a
  // segunda chance: fazenda registrada onde a pessoa mora. No máximo 2
  // consultas pagas, dentro do mesmo gate de 30 dias.
  const ufCadastro = normalizeUf(lead.estado)
  const ufTelefone = ufFromPhone(lead.celular || lead.telefone)
  const ufsCandidatas = [...new Set([ufCadastro, ufTelefone].filter((u): u is string => Boolean(u)))]

  let report: StateRegistrationReport | null = null
  const ufsConsultadas: string[] = []
  if (!ufsCandidatas.length) {
    report = await consultarInscricaoEstadualPorCpf({ cpf: String(lead.cpf), uf: null, allowAllStates })
  } else {
    for (const ufTentativa of ufsCandidatas) {
      const r = await consultarInscricaoEstadualPorCpf({ cpf: String(lead.cpf), uf: ufTentativa, allowAllStates })
      // Falha transitória (provedor fora, sem saldo): para aqui — não gasta a
      // 2ª consulta num provedor instável; o gate deixa retentar depois.
      if (r.pending) {
        report = report ?? r
        break
      }
      ufsConsultadas.push(ufTentativa)
      report = r
      // Achou a I.E. → é esta; não consulta a próxima UF.
      if (r.inscricaoEstadual) break
    }
  }

  // Nada nas UFs candidatas → busca NACIONAL (FiscalAPI, todos os estados numa
  // chamada). Acha a fazenda registrada longe de onde o lead mora — DDD de TO
  // com propriedade em MG, por exemplo. Se localizar, reconsulta aquela UF pelo
  // caminho rico (Infosimples) para trazer a propriedade e o PDF da SEFAZ.
  if (report && !report.pending && !report.inscricaoEstadual && process.env.FISCALAPI_API_KEY) {
    const nacional = await consultarInscricaoEstadualPorCpf({ cpf: String(lead.cpf), uf: null, allowAllStates: true })
    if (!nacional.pending && nacional.inscricaoEstadual) {
      ufsConsultadas.push('BR')
      const ufAchada = nacional.uf
      if (ufAchada && !ufsCandidatas.includes(ufAchada) && process.env.INFOSIMPLES_TOKEN) {
        const rica = await consultarInscricaoEstadualPorCpf({ cpf: String(lead.cpf), uf: ufAchada })
        report = (!rica.pending && rica.inscricaoEstadual) ? rica : nacional
        ufsConsultadas.push(ufAchada)
      } else {
        report = nacional
      }
    }
  }
  if (!report) {
    return {
      attempted: false,
      pending: true,
      inscricaoEstadual: null,
      temInscricaoEstadual: '',
      reason: 'nenhuma UF candidata para consultar',
    }
  }
  const uf = report.uf ?? ufsCandidatas[0] ?? null

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

  const summary = ufsConsultadas.length > 1 && !report.inscricaoEstadual
    ? `${registrationSummary(report)} (UFs consultadas: ${ufsConsultadas.join(', ')})`
    : registrationSummary(report)
  const { data: current } = await supabase
    .from('crm_leads')
    .select('extra_data, contact_history')
    .eq('id', lead.id)
    .single()
  const extraData = (((current?.extra_data as Record<string, unknown> | null) || lead.extra_data || {}) as Record<string, unknown>)
  const fiscal = (extraData.fiscal || {}) as Record<string, unknown>
  const nextTemIe = report.pending ? lead.tem_inscricao_estadual || '' : report.temInscricaoEstadual
  const nextIe = report.pending ? lead.inscricao_estadual || '' : report.inscricaoEstadual || ''

  const nextExtra: Record<string, unknown> = {
    ...extraData,
    fiscal: {
      ...fiscal,
      ie: {
        inscricaoEstadual: report.inscricaoEstadual,
        temInscricaoEstadual: report.temInscricaoEstadual,
        uf: report.uf,
        ufsConsultadas,
        provider: report.provider,
        consultedAt: report.consultedAt,
        pending: report.pending,
        indisponivel: report.indisponivel ?? false,
        motivo: report.indisponivel ? report.message : undefined,
        results: report.results.slice(0, 5),
      },
    },
  }

  // A consulta do Sintegra devolve a PROPRIEDADE ligada à I.E.: nome da fazenda,
  // município, UF e endereço. É exatamente o bloco "Dados da Propriedade" da
  // ficha de cadastro — preenchemos sozinhos em vez de perguntar ao lead.
  // Só preenche o que está vazio: o que o lead digitou sempre prevalece.
  const best = pickBest(report)
  if (best) {
    // Produtor rural PF: `razao_social` traz o nome completo do titular e
    // `nome_fantasia` o nome da propriedade ("FAZENDA SANTANA").
    const fazendaNome = best.nome_fantasia || best.razao_social
    if (fazendaNome && !str(extraData.fazenda_nome)) nextExtra.fazenda_nome = fazendaNome
    if (best.municipio && !str(extraData.fazenda_cidade)) nextExtra.fazenda_cidade = best.municipio
    const ufProp = best.uf_ie || report.uf
    if (ufProp && !str(extraData.fazenda_uf)) nextExtra.fazenda_uf = ufProp
    const endProp = [best.endereco_logradouro, best.endereco_numero, best.endereco_bairro, best.municipio, ufProp, best.endereco_cep]
      .map(v => String(v ?? '').trim())
      .filter(Boolean)
      .join(', ')
    if (endProp) nextExtra.propriedade_endereco = endProp
    if (best.atividade_economica) nextExtra.propriedade_atividade = best.atividade_economica
    nextExtra.propriedade_consultada_at = report.consultedAt

    // O comprovante da SEFAZ (PDF) vira documento do lead. É o item que mais
    // travava o cadastro — e vale mais que a foto de um papel do lead.
    if (best.site_receipt) {
      const doc = await saveLeadDocFromUrl(supabase, {
        leadId: lead.id,
        url: best.site_receipt,
        filename: `comprovante-ie-${report.uf ?? ''}-${String(lead.cpf).replace(/\D/g, '')}.pdf`,
        tipo: 'ie',
        mime: 'application/pdf',
      }).catch(() => null)
      if (doc) nextExtra.comprovante_ie_anexado_at = new Date().toISOString()
    }
  }

  const patch: Record<string, unknown> = {
    extra_data: nextExtra,
    contact_history: appendNote(current?.contact_history ?? lead.contact_history, summary),
  }

  // UF que exige gov.br (MG): a consulta não roda. NÃO gravamos "não tem I.E." —
  // o Helio tem 001221521-79 e seria marcado como sem inscrição. Só registramos
  // o motivo, para a IA pedir a I.E. ao lead e ninguém retentar em vão.
  if (!report.pending && report.indisponivel) {
    patch.tem_inscricao_estadual = lead.tem_inscricao_estadual || ''
    patch.inscricao_estadual = lead.inscricao_estadual || ''
  } else if (!report.pending) {
    patch.tem_inscricao_estadual = nextTemIe
    patch.inscricao_estadual = nextIe
    // Nome completo oficial, quando o card só tem o primeiro nome do WhatsApp.
    const nomeOficial = str(best?.razao_social)
    if (/\S+\s+\S+/.test(nomeOficial) && !/\S+\s+\S+/.test(str(lead.nome))) {
      patch.nome = nomeOficial
    }
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
