import { NextRequest } from 'next/server'
import { fail, ok } from '@/lib/respond'
import { appendLeadToSaoGeraldoTab } from '@/lib/jmp-sheets'
import { evaluateMql, DEFAULT_JMP_MQL_RULE } from '@/lib/crm-types'
import { aplicarMascaraTelefone, normalizarWhatsapp } from '@/lib/telefone'

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

/**
 * Identificador do funil deste lançamento. Hoje ele NÃO vai para o banco — a
 * rota de touros deixou de gravar em crm_leads em 24/07 (ver comentário abaixo)
 * e esta rota herda a mesma arquitetura. A separação real do funil é a ABA
 * dedicada na planilha (LEADS SAO GERALDO).
 *
 * Fica aqui, nomeado, porque é o rótulo canônico do lançamento em log e é o
 * valor de `source` a usar se um dia o insert no CRM voltar.
 */
const LEAD_SOURCE = 'leilao-sg7p'

// Endpoint PÚBLICO da landing do "Leilão Touros São Geraldo e 7P".
// Fork de /api/touros/lead — a rota de touros NÃO foi tocada.
//
// HERDA a decisão do cliente de 24/07: o lead NÃO entra em crm_leads. Lead em
// ENTRADA no CRM cai no radar dos disparos/followups e no concierge IA, e esta
// campanha é de atendimento 100% manual pela equipe, via planilha. Por isso a
// planilha é o ÚNICO registro — e por isso o append abaixo é bloqueante, não
// best-effort: se o Google falhar, devolvemos erro e o lead pode reenviar.
//
// DIFERENÇAS vs. a rota de touros (e só estas):
//  - Grava na aba própria do lançamento, via appendLeadToSaoGeraldoTab().
//  - NÃO chama appendLeadToPerpetuoSheet(): a aba-arquivo marca a linha com o
//    form_name do perpétuo, e o cron syncTourosLandingTabs() varre por esse
//    form_name — o lead do leilão acabaria nas abas dos assessores do perpétuo.
//  - NÃO chama appendLeadToTourosTabs(): mesmo motivo, são abas do perpétuo.
//
// IGUAL à rota de touros, de propósito:
//  - Revalidação server-side de TODOS os campos (não confiar no client).
//  - MQL decidido no SERVIDOR (≥100 cabeças + IE), nunca no browser.
//  - Resposta { id, is_mql } — é o veredito que a landing usa para escolher a
//    URL de obrigado, e é a navegação hard para essa URL que dispara a conversão.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  const nome = String(body.nome ?? '').trim()
  // E-mail é OPCIONAL: o funil é 100% WhatsApp e o e-mail não qualifica nem é
  // canal aqui — exigi-lo só adiciona fricção em tráfego mobile pago. Guardamos
  // se vier, mas não bloqueia o cadastro.
  const email = String(body.email ?? '').trim()
  // Normaliza o código do país ANTES de validar: quem cola o número do
  // próprio WhatsApp manda "5531988887777". Ver src/lib/telefone.ts.
  const whatsappBruto = String(body.whatsapp ?? '').trim()
  const whatsapp = aplicarMascaraTelefone(whatsappBruto)
  const whatsappDigits = normalizarWhatsapp(whatsappBruto)
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

  const eventId = str(body.event_id, 128)

  // Atribuição de campanha (Meta/Google), no MESMO formato da rota de touros —
  // é assim que as colunas de utm da aba reconhecem o lead depois. `ad-id`
  // chega como ad_id (a landing normaliza).
  const utmAttr = {
    source: str(body.utm_source),
    medium: str(body.utm_medium),
    campaign: str(body.utm_campaign),
    content: str(body.utm_content),
    ad_id: str(body.ad_id),
  }

  // Padrão de MQL do Funil (≥100 cabeças + tem IE). Mesma régua do perpétuo: a
  // qualificação do assessor não muda por ser leilão. Usa o default canônico
  // para não acoplar ao crm_config.
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
    // O catálogo do leilão é 100% macho — mesmo interesse do perpétuo.
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

  // A aba do lançamento é o ÚNICO registro do lead — append bloqueante. Lead de
  // teste e duplicata contam como sucesso: no primeiro caso a omissão é
  // proposital, no segundo o lead já está registrado.
  try {
    const r = await appendLeadToSaoGeraldoTab(sheetLead)
    if (r.skipped && r.reason !== 'duplicate' && r.reason !== 'test_lead') {
      console.error(`[${LEAD_SOURCE} lead] append pulado:`, r.reason)
      return fail('Não foi possível registrar o cadastro. Tente novamente.', 500)
    }
  } catch (e) {
    console.error(`[${LEAD_SOURCE} lead] append falhou:`, e)
    return fail('Não foi possível registrar o cadastro. Tente novamente.', 500)
  }

  // Veredito de MQL (fonte de verdade = servidor) para o client escolher a URL
  // de obrigado e disparar a conversão com VALOR diferenciado — Meta/Google
  // otimizam por lead que vale (≥100 cabeças + IE), não por volume.
  return ok({ id: eventId, is_mql: isMql })
}
