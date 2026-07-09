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
import { appendLeadToEaoSheet, normalizeMetaRawRows } from '@/lib/jmp-sheets'
import { dispatchCrmWelcome } from '@/lib/crm-welcome'

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

  // Pregões do 13º Mega Evento EAO Baviera em que o lead quer comprar.
  // Espelha src/leiloes.ts da landing — só aceitamos ids conhecidos, o corpo
  // da requisição não é confiável.
  const LEILAO_IDS = ['aspiracoes', 'femeas', 'touros'] as const
  const leiloes = Array.isArray(body.leiloes)
    ? LEILAO_IDS.filter((id) => (body.leiloes as unknown[]).includes(id))
    : []
  const leiloesDescricao = str(body.leiloesDescricao)
  // Consentimento explícito de contato via WhatsApp (checkbox obrigatório).
  const whatsappConsent = body.whatsappConsent === true

  // Host real de onde veio o cadastro (eao.* ou jmp.* servem a MESMA landing).
  // Antes era fixo em jmp.bulaassessoria.com, o que atribuía errado os leads
  // que chegam pelo domínio do evento.
  const referer = req.headers.get('referer')
  const host = req.headers.get('host') ?? 'eao.bulaassessoria.com'

  // Atribuição de campanha (Meta), no MESMO formato do import de planilha
  // (`extra_data.utm` em sheetRowToLead) — é assim que as regras por campanha
  // reconhecem o lead depois. `ad-id` chega como ad_id (a landing normaliza).
  const utmAttr = {
    source: str(body.utm_source),
    medium: str(body.utm_medium),
    campaign: str(body.utm_campaign),
    content: str(body.utm_content),
    ad_id: str(body.ad_id),
  }
  const temUtm = Object.values(utmAttr).some(Boolean)

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
    origem: 'Landing EAO — 13º Mega Baviera 10–12/jul',
    source: 'jmp-landing',
    source_page: host,
    landing_url: referer || `https://${host}/`,
    // O assessor lê isto direto no card, sem abrir o JSON de extra_data.
    notes: leiloesDescricao ? `Quer comprar em: ${leiloesDescricao}` : null,
    data_entrada: new Date().toISOString(),
    extra_data: {
      evento: 'mega-eao-baviera-2026',
      leiloes,
      whatsapp_consent: whatsappConsent,
      ...(temUtm ? { utm: utmAttr } : {}),
    },
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
    leiloesDescricao,
    whatsappConsent,
  }

  // Mesma atribuição, no formato de colunas que a planilha espera.
  const utm = {
    utm_source: utmAttr.source,
    utm_medium: utmAttr.medium,
    utm_campaign: utmAttr.campaign,
    utm_content: utmAttr.content,
    ad_id: utmAttr.ad_id,
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

  // Aba "Leads EAO" — dedicada à campanha do 13º Mega Baviera. A aba
  // "Leads JMP" fica intacta (histórico do evento anterior + despejo do Meta).
  try {
    await appendLeadToEaoSheet({ ...leadCtx, ...utm, leadId: data?.id ?? null, createdAt: new Date() })
  } catch (e) {
    console.error('[JMP lead] sheets append failed:', e)
  }

  // Auto-cura oportunista das linhas cruas que o Meta despeja na aba "Leads
  // JMP". Rodava dentro do antigo appendLeadToSheet; como a landing passou a
  // gravar na aba do EAO, o gatilho por lead vive aqui — senão só o cron
  // diário (sheet-heal) realinharia, deixando a planilha torta por até 24h.
  try {
    await normalizeMetaRawRows()
  } catch (e) {
    console.error('[JMP lead] meta rows normalize failed:', e)
  }

  // Boas-vindas automáticas no WhatsApp pelo número conectado (Baileys).
  // Best-effort: nunca derruba o cadastro do lead.
  try {
    await dispatchCrmWelcome(supabaseAdmin(), {
      phone: whatsapp,
      nome,
      leadId: data?.id ?? null,
      origin: 'jmp-landing',
    })
  } catch (e) {
    console.error('[JMP lead] whatsapp welcome failed:', e)
  }

  return ok({ id: data?.id })
}
