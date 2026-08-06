import { NextRequest } from 'next/server'
import { fail, ok } from '@/lib/respond'
import {
  appendLeadToPerpetuoSheet,
  appendLeadToFemeasTab,
  FEMEAS_FORM_NAME,
} from '@/lib/jmp-sheets'
import { aplicarMascaraTelefone, normalizarWhatsapp } from '@/lib/telefone'
import { categorias, CATEGORIA_INDECISO } from '@/app/femeas/_lib/categorias'
import {
  CATEGORIAS_ACEITAS,
  MOMENTOS_ACEITOS,
  QUANTIDADES_ACEITAS,
  REBANHOS_ACEITOS,
  avaliarLeadFemeas,
  documentoValido,
  mascaraDocumento,
} from '@/app/femeas/_lib/qualificacao'

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint PÚBLICO da landing de FÊMEAS (funil perpétuo de matrizes PO).
//
// É um FORK da rota de touros, não uma parametrização dela: /api/touros/lead
// está em produção convertendo, e mexer nela para caber duas campanhas troca
// risco de código novo (isolado) por risco de regressão no que já fatura.
//
// O QUE MUDA EM RELAÇÃO AO /touros, e por quê:
//
//   · Destino: a aba FEMEAS, que é a FILA DO SDR — não as abas dos assessores
//     do perpétuo de touros. Se esta rota chamasse o caminho de touros, todo
//     lead de fêmea apareceria na fila errada.
//   · Régua: própria (_lib/qualificacao.ts), SEM mínimo de cabeças. A de touros
//     reprovaria o público que esta página existe para atrair.
//   · Campos de atrito: documento (CPF/CNPJ), inscrição estadual, categoria,
//     quantidade e o texto do projeto. Eles são o produto da página, não
//     burocracia: o gargalo do funil é hora de assessor, e o formulário é a
//     única alavanca de escala com a triagem manual.
//
// O QUE NÃO MUDA, e não deve ser "melhorado":
//
//   · O veredito é do SERVIDOR (INV-3). O client é falsificável, e é o veredito
//     que escolhe a página de obrigado e o valor da conversão.
//   · E-mail é OPCIONAL. O funil é WhatsApp; exigir e-mail é atrito que não
//     qualifica — e atrito que não qualifica é o único tipo proibido aqui.
//   · O telefone é normalizado ANTES de validar (quem cola o próprio número
//     manda "5531988887777").
//   · Nenhum disparo de WhatsApp, nenhum insert no CRM. Lead em ENTRADA cai no
//     radar de followup e no concierge IA, e este atendimento é 100% manual —
//     é a mesma decisão de 24/07 que tirou o /touros do CRM.
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VALID_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
])
// Revalidação por Set derivado da MESMA fonte que o formulário lê (_lib/copy e
// _lib/categorias). Recriar as listas aqui é como a lista do /saogeraldo
// divergiu em três lugares — e lista divergente recusa lead sem ninguém
// entender por quê.
const VALID_MOMENTOS = new Set(MOMENTOS_ACEITOS)
const VALID_REBANHOS = new Set(REBANHOS_ACEITOS)
const VALID_QUANTIDADES = new Set(QUANTIDADES_ACEITAS)
const VALID_CATEGORIAS = new Set(CATEGORIAS_ACEITAS)

/** id da categoria → rótulo legível, para a planilha que o SDR lê. */
const CATEGORIA_LABEL = new Map<string, string>([
  ...categorias.map(c => [c.id, c.nome] as [string, string]),
  [CATEGORIA_INDECISO.id, CATEGORIA_INDECISO.nome],
])

/** O texto do projeto é o insumo nº 1 da triagem manual — sem ele o SDR liga no escuro. */
const PROJETO_MIN = 10

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  const nome = String(body.nome ?? '').trim()
  const email = String(body.email ?? '').trim()
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
  const categoria = str(body.categoria, 40)
  const quantidade = str(body.quantidade, 80)
  const projeto = str(body.projeto, 2000)
  const documento = str(body.documento, 20)
  const temInscricaoEstadual = str(body.inscricaoEstadual, 3)

  const whatsappConsent = body.whatsappConsent === true
  if (!whatsappConsent) return fail('Autorize o contato via WhatsApp para continuar.')
  if (!uf || !VALID_UFS.has(uf)) return fail('Selecione um estado válido.')
  if (!cabecas || !VALID_REBANHOS.has(cabecas)) return fail('Selecione o tamanho do rebanho.')
  if (!momento || !VALID_MOMENTOS.has(momento)) return fail('Selecione em que momento você está.')
  if (!categoria || !VALID_CATEGORIAS.has(categoria)) {
    return fail('Selecione por qual categoria pensa em começar.')
  }
  if (!quantidade || !VALID_QUANTIDADES.has(quantidade)) {
    return fail('Selecione quantas matrizes pretende comprar.')
  }
  if (!projeto || projeto.length < PROJETO_MIN) {
    return fail('Conte um pouco do seu projeto — é o que a nossa equipe lê antes da reunião.')
  }
  if (temInscricaoEstadual !== 'Sim' && temInscricaoEstadual !== 'Não') {
    return fail('Informe se você tem inscrição estadual.')
  }
  // Dígito verificador, não só comprimento: CPF/CNPJ inventado passa por
  // qualquer checagem de tamanho e só é descoberto na hora de habilitar a
  // compra — que é tarde, porque a reunião já aconteceu.
  if (!documento || !documentoValido(documento)) {
    return fail('Informe um CPF ou CNPJ válido.')
  }

  const host = str(req.headers.get('host'), 253) ?? 'femeas.bulaassessoria.com'
  const referer = str(req.headers.get('referer'), 2048)
  const eventId = str(body.event_id, 128)

  const utmAttr = {
    source: str(body.utm_source),
    medium: str(body.utm_medium),
    campaign: str(body.utm_campaign),
    content: str(body.utm_content),
    ad_id: str(body.ad_id),
    fbclid: str(body.fbclid),
    gclid: str(body.gclid),
  }

  // O veredito da régua PRÓPRIA de fêmeas. Ele não filtra ninguém: escolhe a
  // página de obrigado e o valor da conversão. Ver o cabeçalho de
  // _lib/qualificacao.ts — quem decide se vira reunião é o SDR, na planilha.
  const veredicto = avaliarLeadFemeas({
    documento,
    inscricaoEstadual: temInscricaoEstadual,
    quantidade,
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
    // Sempre 'femeas-po', nunca a categoria escolhida: é este campo que decide
    // a aba, e mandar "embrioes" aqui jogaria o lead na aba EMBRIÕES, partindo
    // a fila do SDR em duas superfícies. A categoria vai em coluna própria.
    interesse: 'femeas-po',
    oQueBusca: quantidade,
    inscricaoEstadual: temInscricaoEstadual,
    utm_source: utmAttr.source,
    utm_medium: utmAttr.medium,
    utm_campaign: utmAttr.campaign,
    utm_content: utmAttr.content,
    ad_id: utmAttr.ad_id,
    leadId: eventId,
    createdAt,
    whatsappConsent,
    formName: FEMEAS_FORM_NAME,
  }

  // A planilha é o ÚNICO registro do lead — o append da base NÃO é best-effort:
  // se o Google falhar, devolvemos erro e a pessoa reenvia (o formulário
  // preserva os dados). Duplicata conta como sucesso: já está lá.
  try {
    const r = await appendLeadToPerpetuoSheet(sheetLead)
    if (r.skipped && r.reason !== 'duplicate') {
      console.error('[femeas lead] sheets append skipped:', r.reason, { host, referer })
      return fail('Não foi possível registrar o cadastro. Tente novamente.', 500)
    }
  } catch (e) {
    console.error('[femeas lead] sheets append failed:', e)
    return fail('Não foi possível registrar o cadastro. Tente novamente.', 500)
  }

  // Fila de trabalho do SDR. Best-effort: o lead JÁ está registrado na base, e
  // o cron das abas por interesse recupera na próxima passada — só sem as
  // colunas próprias (documento, categoria, projeto, régua), que a base não
  // tem. Por isso o erro é logado alto: é perda de contexto de triagem, não de
  // lead.
  try {
    const r = await appendLeadToFemeasTab({
      ...sheetLead,
      cpf: mascaraDocumento(documento),
      categoria: CATEGORIA_LABEL.get(categoria) ?? categoria,
      projeto,
      reguaAutomatica: veredicto.isMql,
    })
    if (r.skipped && r.reason !== 'duplicate' && r.reason !== 'test_lead') {
      console.error('[femeas lead] fila do SDR pulada:', r.reason)
    }
  } catch (e) {
    console.error('[femeas lead] fila do SDR falhou:', e)
  }

  // `is_mql` é o contrato que o formulário e o GTM já esperam — o nome fica,
  // mesmo significando "passou na régua de fêmeas" e não o MQL do CRM.
  // `motivos` é para a instrumentação: é o que permite comparar esta régua com
  // a aprovação do SDR depois, em vez de discutir no achismo.
  return ok({ id: eventId, is_mql: veredicto.isMql, motivos: veredicto.motivos })
}
