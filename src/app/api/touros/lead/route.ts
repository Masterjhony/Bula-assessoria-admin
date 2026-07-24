import { NextRequest } from 'next/server'
import { fail, ok } from '@/lib/respond'
import { appendLeadToPerpetuoSheet, appendLeadToTourosTabs } from '@/lib/jmp-sheets'
import { evaluateMql, DEFAULT_JMP_MQL_RULE } from '@/lib/crm-types'

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
// venda de touros).
//
// DECISÃO (24/07, pedido do cliente): os leads desta campanha vão APENAS para
// a aba "LEADS BULA - PERPETUO" da planilha conectada — NÃO entram no CRM.
// Lead em crm_leads (ENTRADA) entra no radar dos disparos/followups e, ao
// responder, cai no concierge IA — e esta campanha NÃO deve ser atendida pelo
// sistema de atendimento. Atendimento 100% manual pela equipe, via planilha.
// Se um dia voltarem pro CRM, restaurar o insert (git: versão anterior deste
// arquivo) — a planilha guarda todos os campos necessários pro re-import.
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

  const createdAt = new Date()

  const sheetLead = {
    nome,
    email,
    whatsapp,
    uf,
    cidade,
    momento,
    cabecas,
    interesse: 'touros-po',
    oQueBusca: quantidadeTouros,
    inscricaoEstadual: temInscricaoEstadual,
    utm_source: utmAttr.source,
    utm_medium: utmAttr.medium,
    utm_campaign: utmAttr.campaign,
    utm_content: utmAttr.content,
    ad_id: utmAttr.ad_id,
    leadId: eventId,
    createdAt,
    whatsappConsent,
  }

  // A planilha agora é o ÚNICO registro do lead — o append deixa de ser
  // best-effort: se o Google falhar, devolvemos erro e o lead pode reenviar
  // (o form preserva os dados). Duplicata conta como sucesso (já está lá).
  try {
    const sheetResult = await appendLeadToPerpetuoSheet(sheetLead)
    if (sheetResult.skipped && sheetResult.reason !== 'duplicate') {
      console.error('[touros lead] sheets append skipped:', sheetResult.reason)
      return fail('Não foi possível registrar o cadastro. Tente novamente.', 500)
    }
  } catch (e) {
    console.error('[touros lead] sheets append failed:', e)
    return fail('Não foi possível registrar o cadastro. Tente novamente.', 500)
  }

  // Cópias de trabalho da campanha ("LEADS TOUROS" + a aba do assessor da UF).
  // Best-effort de propósito: o lead JÁ está registrado na aba-arquivo acima —
  // falha aqui não pode derrubar o cadastro, e o cron (sheet-perpetuo) refaz.
  try {
    await appendLeadToTourosTabs(sheetLead)
  } catch (e) {
    console.error('[touros lead] abas de trabalho falharam:', e)
  }

  // Devolve o veredito de MQL (fonte de verdade = servidor) para o client
  // disparar o evento de conversão com VALOR diferenciado — assim Meta/Google
  // otimizam por lead que vale (≥100 cabeças + IE), não por volume.
  return ok({ id: eventId, is_mql: isMql })
}
