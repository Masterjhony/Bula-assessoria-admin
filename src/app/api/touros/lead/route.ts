import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fail, ok } from '@/lib/respond'
import {
  CRM_STAGE_ENTRY,
  evaluateMql,
  JMP_FUNNEL_ID,
  DEFAULT_JMP_MQL_RULE,
} from '@/lib/crm-types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VALID_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
])
const VALID_CABECAS = new Set([
  '1 a 99 cabeças',
  '100 a 500 cabeças',
  '501 a 1000 cabeças',
  '1001 a 3000 cabeças',
  'mais de 3000 cabeças',
])
const VALID_MOMENTOS = new Set([
  'Cria',
  'Recria',
  'Cria e recria',
  'Ciclo completo',
  'Confinamento',
  'Estou começando agora',
])
const VALID_QUANTIDADES_TOUROS = new Set([
  '1 a 5 touros',
  '6 a 10 touros',
  '11 a 20 touros',
  '21 a 50 touros',
  'mais de 50 touros',
  'ainda não sei quantos touros',
])

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
  const whatsappDigits = whatsapp.replace(/\D/g, '')
  if (nome.length < 3 || nome.length > 120) return fail('Informe um nome válido.')
  if (whatsapp.length > 40 || whatsappDigits.length < 10 || whatsappDigits.length > 11) {
    return fail('Informe um WhatsApp válido com DDD.')
  }
  if (email.length > 254 || (email && !EMAIL_RE.test(email))) {
    return fail('Informe um e-mail válido.')
  }

  const str = (v: unknown, maxLength = 500) => {
    const s = String(v ?? '').trim()
    return s.length ? s.slice(0, maxLength) : null
  }

  const uf = str(body.uf, 2)
  const cidade = str(body.cidade, 120)
  const cabecas = str(body.cabecas, 40)
  const momento = str(body.momento, 80)
  const quantidadeTouros = str(body.oQueBusca, 80)
  const temInscricaoEstadual = str(body.inscricaoEstadual, 3)

  // Consentimento explícito de contato via WhatsApp (checkbox obrigatório).
  const whatsappConsent = body.whatsappConsent === true
  if (!whatsappConsent) return fail('Autorize o contato via WhatsApp para continuar.')
  if (!uf || !VALID_UFS.has(uf)) return fail('Selecione um estado válido.')
  if (!cabecas || !VALID_CABECAS.has(cabecas)) {
    return fail('Selecione o tamanho do rebanho.')
  }
  if (momento && !VALID_MOMENTOS.has(momento)) return fail('Selecione um momento válido.')
  if (!quantidadeTouros || !VALID_QUANTIDADES_TOUROS.has(quantidadeTouros)) {
    return fail('Selecione quantos touros você busca.')
  }
  if (temInscricaoEstadual !== 'Sim' && temInscricaoEstadual !== 'Não') {
    return fail('Informe se você tem inscrição estadual.')
  }

  const host = str(req.headers.get('host'), 253) ?? 'touros.bulaassessoria.com'
  const referer = str(req.headers.get('referer'), 2048)
  const eventId = str(body.event_id, 128)

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
    estado: uf,
    cidade,
    momento_pecuaria: momento,
    quantidade_animais: cabecas,
    // Interesse fixo desta landing: touros PO.
    interesse: 'touros-po',
    tem_inscricao_estadual: temInscricaoEstadual,
    // Quantidade desejada já em texto legível (ex.: "21 a 50 touros"), montado
    // na landing — o assessor lê direto no card.
    o_que_busca: quantidadeTouros,
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
      ...(eventId ? { event_id: eventId } : {}),
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
