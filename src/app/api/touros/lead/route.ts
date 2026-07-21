import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fail, ok } from '@/lib/respond'
import {
  CRM_STAGE_ENTRY,
  evaluateMql,
  JMP_FUNNEL_ID,
  DEFAULT_JMP_MQL_RULE,
} from '@/lib/crm-types'

// Endpoint PÚBLICO da landing touros.bulaassessoria.com (funil perpétuo de
// venda de touros). Variante enxuta de /api/jmp/lead: grava o lead direto em
// crm_leads via service role, com atribuição/origem PRÓPRIAS para não misturar
// com a campanha do Mega Evento EAO.
//
// Diferenças deliberadas vs. /api/jmp/lead:
//  - source: 'touros-perpetuo' (telemetria/atribuição isoladas).
//  - origem própria (o assessor identifica a fonte no card do CRM).
//  - NÃO dispara WhatsApp (dispatchCrmWelcome), e-mail nem planilha — fora de
//    escopo desta landing (decisão explícita). Só persiste o lead no CRM.
//  - Reusa o mesmo funil do CRM (JMP_FUNNEL_ID = 'default') para os leads
//    caírem no board existente; a separação vem por `source`/`origem`.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  const nome = String(body.nome ?? '').trim()
  // E-mail é OPCIONAL: o funil é 100% WhatsApp e o e-mail não qualifica nem é
  // canal aqui — exigi-lo só adiciona fricção em tráfego mobile pago (auditoria
  // de mídia/growth). Guardamos se vier, mas não bloqueia o cadastro.
  const email = String(body.email ?? '').trim()
  const whatsapp = String(body.whatsapp ?? '').trim()
  if (!nome) return fail('nome é obrigatório.')
  if (!whatsapp) return fail('whatsapp é obrigatório.')

  const str = (v: unknown) => {
    const s = String(v ?? '').trim()
    return s.length ? s : null
  }

  const cabecas = str(body.cabecas)
  const temInscricaoEstadual = str(body.inscricaoEstadual)

  // Consentimento explícito de contato via WhatsApp (checkbox obrigatório).
  const whatsappConsent = body.whatsappConsent === true

  const host = req.headers.get('host') ?? 'touros.bulaassessoria.com'
  const referer = req.headers.get('referer')

  // Atribuição de campanha (Meta/Google), no MESMO formato do import da
  // planilha (`extra_data.utm`) — é assim que as regras por campanha
  // reconhecem o lead depois. `ad-id` chega como ad_id (a landing normaliza).
  const utmAttr = {
    source: str(body.utm_source),
    medium: str(body.utm_medium),
    campaign: str(body.utm_campaign),
    content: str(body.utm_content),
    ad_id: str(body.ad_id),
    // Cliques pagos: amarram o lead qualificado ao anúncio e habilitam
    // enhanced conversions (Google) / advanced matching (Meta) no futuro.
    fbclid: str(body.fbclid),
    gclid: str(body.gclid),
  }
  const temUtm = Object.values(utmAttr).some(Boolean)

  // Padrão de MQL do Funil (≥100 cabeças + tem IE). A landing de touros não
  // depende do crm_config para não acoplar; usa o default canônico.
  const isMql = evaluateMql(DEFAULT_JMP_MQL_RULE, {
    quantidade_animais: cabecas,
    tem_inscricao_estadual: temInscricaoEstadual,
  })

  const lead = {
    nome,
    email: email || null,
    // Grava o WhatsApp em telefone E celular: o CRM (modal/cards) usa `celular`
    // como contato principal — sem isso o número "não puxa" ao abrir o lead.
    telefone: whatsapp,
    celular: whatsapp,
    estado: str(body.uf),
    cidade: str(body.cidade),
    momento_pecuaria: str(body.momento),
    quantidade_animais: cabecas,
    // Interesse fixo desta landing: touros PO.
    interesse: 'touros-po',
    tem_inscricao_estadual: temInscricaoEstadual,
    // Quantidade desejada já em texto legível (ex.: "21 a 50 touros"), montado
    // na landing — o assessor lê direto no card.
    o_que_busca: str(body.oQueBusca),
    status: CRM_STAGE_ENTRY,
    funnel_id: JMP_FUNNEL_ID,
    is_mql: isMql,
    origem: 'Landing Touros — Funil Perpétuo',
    source: 'touros-perpetuo',
    source_page: host,
    landing_url: referer || `https://${host}/`,
    data_entrada: new Date().toISOString(),
    extra_data: {
      funil: 'touros-perpetuo',
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
    console.error('[touros lead] insert failed:', error.message)
    return fail('Não foi possível registrar o cadastro.', 500)
  }

  // Devolve o veredito de MQL (fonte de verdade = servidor) para o client
  // disparar o evento de conversão com VALOR diferenciado — assim Meta/Google
  // otimizam por lead que vale (≥100 cabeças + IE), não por volume.
  return ok({ id: data?.id ?? null, is_mql: isMql })
}
