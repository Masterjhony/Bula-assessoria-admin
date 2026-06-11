import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fail, ok } from '@/lib/respond'
import {
  CRM_STAGE_ENTRY,
  evaluateMql,
  JMP_FUNNEL_ID,
  DEFAULT_JMP_MQL_RULE,
  type CRMMqlRule,
} from '@/lib/crm-types'
import { DEFAULT_JMP_CONTENT, sanitizeContent } from '@/lib/jmp-content'
import { sendJmpWelcomeEmail } from '@/lib/jmp-welcome-email'
import { enrollLeadInEmailFlow } from '@/lib/jmp-email-flow'
import { appendLeadToSheet } from '@/lib/jmp-sheets'

const CONTENT_TABLE = 'jmp_landing_content'
const CONTENT_ROW_ID = 'default'

// Lê a regra de MQL do Funil JMP a partir do crm_config (site_settings). Como o
// route roda com service role (sem getCRMConfig), busca direto. Qualquer falha
// ou ausência cai no padrão ≥100 cabeças + tem IE.
async function getJmpMqlRule(): Promise<CRMMqlRule> {
  try {
    const { data } = await supabaseAdmin()
      .from('site_settings')
      .select('value')
      .eq('key', 'crm_config')
      .maybeSingle()
    const funnels = (data?.value as { funnels?: Array<{ id: string; mql_rule?: CRMMqlRule }> } | null)?.funnels
    const jmp = funnels?.find((f) => f.id === JMP_FUNNEL_ID)
    return jmp?.mql_rule ?? DEFAULT_JMP_MQL_RULE
  } catch {
    return DEFAULT_JMP_MQL_RULE
  }
}

// Endpoint PÚBLICO da landing jmp.bulaassessoria.com (formulário Nelore JMP).
// Não exige usuário autenticado: grava o lead direto em crm_leads via service
// role. Só aceita os campos do formulário e mapeia para as colunas reais do
// CRM (mesmas usadas em src/app/sistema/actions/crm-leads.ts). Qualquer campo
// extra é ignorado — não confiamos no corpo da requisição.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  const nome = String(body.nome ?? '').trim()
  const email = String(body.email ?? '').trim()
  const whatsapp = String(body.whatsapp ?? '').trim()
  if (!nome) return fail('nome é obrigatório.')
  if (!email) return fail('email é obrigatório.')
  if (!whatsapp) return fail('whatsapp é obrigatório.')

  const str = (v: unknown) => {
    const s = String(v ?? '').trim()
    return s.length ? s : null
  }

  const cabecas = str(body.cabecas)
  const temInscricaoEstadual = str(body.inscricaoEstadual)

  // Regra de MQL do Funil JMP (editável nas Configurações do CRM, por funil).
  // Best-effort: se a config não existir/falhar, cai no padrão (≥100 + tem IE).
  const mqlRule = await getJmpMqlRule()
  const isMql = evaluateMql(mqlRule, {
    quantidade_animais: cabecas,
    tem_inscricao_estadual: temInscricaoEstadual,
  })

  const lead = {
    nome,
    email,
    // Grava o WhatsApp em telefone E celular: o CRM (modal/cards) usa `celular`
    // como contato principal — sem isso o número "não puxa" ao abrir o lead.
    telefone: whatsapp,
    celular: whatsapp,
    estado: str(body.uf),
    cidade: str(body.cidade),
    momento_pecuaria: str(body.momento),
    quantidade_animais: cabecas,
    interesse: str(body.interesse),
    // "Sim"/"Não" — se o lead tem inscrição estadual (pergunta obrigatória na
    // landing). Coluna distinta de inscricao_estadual (o número da IE).
    tem_inscricao_estadual: temInscricaoEstadual,
    // Quantidade que o lead precisa, já em texto legível e contextual ao
    // interesse (ex.: "21 a 50 touros"). Montado na landing.
    o_que_busca: str(body.oQueBusca),
    status: CRM_STAGE_ENTRY,
    funnel_id: JMP_FUNNEL_ID,
    is_mql: isMql,
    origem: 'Landing JMP — Nelore 13/14 jun',
    source: 'jmp-landing',
    source_page: 'jmp.bulaassessoria.com',
    landing_url:
      req.headers.get('referer') || 'https://jmp.bulaassessoria.com/',
    data_entrada: new Date().toISOString(),
  }

  const { data, error } = await supabaseAdmin()
    .from('crm_leads')
    .insert(lead)
    .select('id')
    .single()

  if (error) {
    console.error('[JMP lead] insert failed:', error.message)
    return fail('Não foi possível registrar a inscrição.', 500)
  }

  const leadCtx = {
    nome,
    email,
    whatsapp,
    uf: str(body.uf),
    cidade: str(body.cidade),
    momento: str(body.momento),
    cabecas: str(body.cabecas),
    interesse: str(body.interesse),
    oQueBusca: str(body.oQueBusca),
    inscricaoEstadual: str(body.inscricaoEstadual),
  }

  // Atribuição de campanha vinda dos criativos (Meta). Só usada na planilha —
  // não vai para o insert em crm_leads (essas colunas não existem lá e
  // quebrariam o cadastro). `ad-id` chega como ad_id (a landing normaliza).
  const utm = {
    utm_source: str(body.utm_source),
    utm_medium: str(body.utm_medium),
    utm_campaign: str(body.utm_campaign),
    utm_content: str(body.utm_content),
    ad_id: str(body.ad_id),
  }

  // Conteúdo (templates de e-mail). Carregado uma vez para welcome + fluxo.
  const { data: contentRow } = await supabaseAdmin()
    .from(CONTENT_TABLE)
    .select('data')
    .eq('id', CONTENT_ROW_ID)
    .maybeSingle()
    .then((r) => r, () => ({ data: null }))
  const content = contentRow?.data ? sanitizeContent(contentRow.data) : DEFAULT_JMP_CONTENT

  // Cada efeito colateral é best-effort — nunca derruba o cadastro do lead.
  try {
    await sendJmpWelcomeEmail(content, leadCtx)
  } catch (e) {
    console.error('[JMP lead] welcome email failed:', e)
  }

  try {
    await enrollLeadInEmailFlow(content, { ...leadCtx, leadId: data?.id ?? null })
  } catch (e) {
    console.error('[JMP lead] email flow enroll failed:', e)
  }

  try {
    await appendLeadToSheet({ ...leadCtx, ...utm, leadId: data?.id ?? null, createdAt: new Date() })
  } catch (e) {
    console.error('[JMP lead] sheets append failed:', e)
  }

  return ok({ id: data?.id })
}
