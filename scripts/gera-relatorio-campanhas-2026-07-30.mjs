// Relatório de campanhas ativas — Meta Ads + PostHog + qualidade de leads/MQL.
// Data-base 30/07/2026 (horário de MS, fuso da conta de anúncio).
//
// Fontes (extração literal, não recalcular):
// - Meta Ads: conector oficial, conta CA2 - Bula 360 (2705134163151418).
//   A conta CA1 (1155240258865815) não devolveu métricas no conector nesta
//   extração — só atributos. Está registrado na seção de ressalvas.
// - PostHog: projeto 430113 via HogQL, janela 24/07 → 30/07.
// - Qualidade de lead: planilha "Leads JMP - Bula Assessoria",
//   aba-arquivo "LEADS BULA - PERPETUO" + aba de trabalho "LEADS TOUROS".
//   As landings NÃO gravam em crm_leads — só na planilha.
//
// Saídas:
// - outputs/relatorio-campanhas-2026-07-30.{html,pdf}
// - Desktop/Relatorio Campanhas - Meta Ads PostHog e MQL - 30-07-2026.pdf
//
// Uso: node scripts/gera-relatorio-campanhas-2026-07-30.mjs

import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(root, 'outputs')
const desktop = join(process.env.USERPROFILE || '', 'Desktop')
const outputStem = 'relatorio-campanhas-2026-07-30'
const desktopStem = 'Relatorio Campanhas - Meta Ads PostHog e MQL - 30-07-2026'
mkdirSync(outputDir, { recursive: true })

// ---------------------------------------------------------------------------
// 1) Meta Ads — campanhas que entregaram na janela
// ---------------------------------------------------------------------------

const touros = {
  nome: 'LEAD - PERPETUO TOURO',
  id: '120249455058620708',
  adset: 'CA - PERPETUO TOURO WEB',
  objetivo: 'OUTCOME_LEADS — conversão de pixel "MQL Perpetuo Touros"',
  inicio: '24/07/2026 13h51',
  fim: 'sem data de encerramento',
  investido: 1763.49,
  impressoes: 126037,
  alcance: 63596,
  frequencia: 1.981838,
  cliques: 2048,
  ctr: 1.62,
  cpc: 0.86,
  cpm: 13.99,
  mqlPixel: 17,
  custoPorMqlPixel: 103.73,
}

const saogeraldo = {
  nome: 'LEADS - SAO GERALDO',
  id: '120249560579230708',
  objetivo: 'OUTCOME_LEADS — conversão de pixel "MQL-Sao-Geraldo"',
  inicio: '29/07/2026',
  fim: 'sem data de encerramento',
  investido: 315.72,
  impressoes: 21058,
  alcance: 14411,
  frequencia: 1.461245,
  cliques: 850,
  ctr: 4.04,
  cpc: 0.37,
  cpm: 14.99,
}

// Diário do Meta (MQL = conversão de pixel atribuída pela Meta)
const diarioTouros = [
  { dia: '24/07', investido: 115.73, impressoes: 5097, cliques: 137, ctr: 2.69, cpm: 22.71, mqlPixel: 0 },
  { dia: '25/07', investido: 382.17, impressoes: 22297, cliques: 505, ctr: 2.26, cpm: 17.14, mqlPixel: 4 },
  { dia: '26/07', investido: 409.93, impressoes: 26909, cliques: 391, ctr: 1.45, cpm: 15.23, mqlPixel: 7 },
  { dia: '27/07', investido: 393.99, impressoes: 31767, cliques: 448, ctr: 1.41, cpm: 12.40, mqlPixel: 2 },
  { dia: '28/07', investido: 226.85, impressoes: 20183, cliques: 307, ctr: 1.52, cpm: 11.24, mqlPixel: 1 },
  { dia: '29/07', investido: 162.84, impressoes: 13994, cliques: 186, ctr: 1.33, cpm: 11.64, mqlPixel: 3 },
  { dia: '30/07', investido: 72.15, impressoes: 5806, cliques: 75, ctr: 1.29, cpm: 12.43, mqlPixel: 0, parcial: true },
]

const diarioSg = [
  { dia: '29/07', investido: 235.64, impressoes: 15513, cliques: 648, ctr: 4.18, cpm: 15.19 },
  { dia: '30/07', investido: 80.16, impressoes: 5559, cliques: 202, ctr: 3.63, cpm: 14.42, parcial: true },
]

// Leads reais da planilha, por dia (a régua de verdade)
const leadsDia = [
  { dia: '24/07', touros: 3, tourosMql: 2, sg: 0, sgMql: 0 },
  { dia: '25/07', touros: 18, tourosMql: 4, sg: 0, sgMql: 0 },
  { dia: '26/07', touros: 13, tourosMql: 7, sg: 0, sgMql: 0 },
  { dia: '27/07', touros: 13, tourosMql: 2, sg: 0, sgMql: 0 },
  { dia: '28/07', touros: 9, tourosMql: 1, sg: 0, sgMql: 0 },
  { dia: '29/07', touros: 11, tourosMql: 4, sg: 6, sgMql: 1 },
  { dia: '30/07', touros: 3, tourosMql: 0, sg: 2, sgMql: 1, parcial: true },
]

const plataformasTouros = [
  { nome: 'Instagram', investido: 1317.18, impressoes: 102319, cliques: 1292, ctr: 1.26, cpm: 12.87, mql: 14, cpMql: 94.08 },
  { nome: 'Facebook', investido: 344.77, impressoes: 22599, cliques: 610, ctr: 2.70, cpm: 15.26, mql: 3, cpMql: 114.92 },
  { nome: 'Audience Network', investido: 98.16, impressoes: 905, cliques: 139, ctr: 15.36, cpm: 108.46, mql: 0, cpMql: null },
  { nome: 'Threads', investido: 3.75, impressoes: 253, cliques: 8, ctr: 3.16, cpm: 14.83, mql: 0, cpMql: null },
]

const plataformasSg = [
  { nome: 'Instagram', investido: 83.56, impressoes: 7440, cliques: 185, ctr: 2.49, cpm: 11.23, mql: 2, cpMql: 41.78 },
  { nome: 'Facebook', investido: 51.75, impressoes: 4107, cliques: 309, ctr: 7.52, cpm: 12.60, mql: 0, cpMql: null },
  { nome: 'Audience Network', investido: 49.54, impressoes: 480, cliques: 125, ctr: 26.04, cpm: 103.21, mql: 0, cpMql: null },
]

const idadesTouros = [
  { faixa: '18-24', investido: 245.10, impressoes: 35463, cliques: 335, ctr: 0.94, cpm: 6.91, mql: 1, cpMql: 245.10 },
  { faixa: '25-34', investido: 511.81, impressoes: 46210, cliques: 595, ctr: 1.29, cpm: 11.08, mql: 4, cpMql: 127.95 },
  { faixa: '35-44', investido: 405.75, impressoes: 23925, cliques: 458, ctr: 1.91, cpm: 16.96, mql: 3, cpMql: 135.25 },
  { faixa: '45-54', investido: 271.13, impressoes: 11345, cliques: 300, ctr: 2.64, cpm: 23.90, mql: 3, cpMql: 90.38 },
  { faixa: '55-64', investido: 183.02, impressoes: 6016, cliques: 189, ctr: 3.14, cpm: 30.42, mql: 3, cpMql: 61.01 },
  { faixa: '65+', investido: 147.03, impressoes: 3111, cliques: 172, ctr: 5.53, cpm: 47.26, mql: 3, cpMql: 49.01 },
]

// Região: a Meta não atribui a conversão personalizada por região (todas as
// linhas voltam com 0). Por isso a tabela é de DISTRIBUIÇÃO DE VERBA, não de MQL.
const regioesTouros = [
  { nome: 'Minas Gerais', investido: 259.07, impressoes: 18509, ctr: 1.71 },
  { nome: 'São Paulo', investido: 228.13, impressoes: 13657, ctr: 2.12 },
  { nome: 'Bahia', investido: 160.87, impressoes: 10838, ctr: 1.43 },
  { nome: 'Goiás', investido: 122.60, impressoes: 9034, ctr: 1.33 },
  { nome: 'Paraná', investido: 100.37, impressoes: 6985, ctr: 1.85 },
  { nome: 'Mato Grosso', investido: 91.18, impressoes: 7507, ctr: 1.69 },
  { nome: 'Pará', investido: 89.64, impressoes: 7585, ctr: 1.57 },
  { nome: 'Maranhão', investido: 88.56, impressoes: 7160, ctr: 1.61 },
  { nome: 'Rio de Janeiro', investido: 88.13, impressoes: 4238, ctr: 1.72 },
  { nome: 'Mato Grosso do Sul', investido: 78.35, impressoes: 7015, ctr: 1.53 },
  { nome: 'Ceará', investido: 61.24, impressoes: 4582, ctr: 1.29 },
  { nome: 'Pernambuco', investido: 53.03, impressoes: 3543, ctr: 1.44 },
  { nome: 'Rondônia', investido: 45.12, impressoes: 4100, ctr: 1.76 },
  { nome: 'Tocantins', investido: 41.54, impressoes: 3359, ctr: 1.49 },
  { nome: 'Paraíba', investido: 40.17, impressoes: 2269, ctr: 1.63 },
  { nome: 'Demais UFs (9)', investido: 175.79, impressoes: 13491, ctr: 1.45 },
]

const conjuntosSg = [
  { nome: 'CA - SAO GERALDO - web - Aberto', investido: 185.37, impressoes: 12020, cliques: 620, ctr: 5.16, cpm: 15.42, obs: 'R$ 92,69 por MQL-Sao-Geraldo' },
  { nome: 'CA - SAO GERALDO - web e inst RMKT', investido: 130.43, impressoes: 9052, cliques: 230, ctr: 2.54, cpm: 14.41, obs: 'R$ 10,87 por conversão de pixel (remarketing)' },
]

// ---------------------------------------------------------------------------
// 2) Qualidade dos leads — planilha (aba-arquivo), 24–30/07, sem leads de teste
// ---------------------------------------------------------------------------

const qualidade = {
  totalLeads: 78,
  totalMql: 22,
  tourosLeads: 70,
  tourosMql: 20,
  sgLeads: 8,
  sgMql: 2,
  semEmail: 8,
  semWhatsapp: 0,
  telefonesDuplicados: 2,
}

const porCabecas = [
  { faixa: '1 a 99 cabeças', leads: 50, mql: 0 },
  { faixa: '100 a 500 cabeças', leads: 18, mql: 12 },
  { faixa: '501 a 1000 cabeças', leads: 6, mql: 6 },
  { faixa: '1001 a 3000 cabeças', leads: 3, mql: 3 },
  { faixa: 'mais de 3000 cabeças', leads: 1, mql: 1 },
]

const porIe = [
  { valor: 'Sim', leads: 42, mql: 22 },
  { valor: 'Não', leads: 36, mql: 0 },
]

const porMomento = [
  { valor: 'Ciclo completo', leads: 7, mql: 5 },
  { valor: 'Cria e recria', leads: 15, mql: 7 },
  { valor: 'Recria', leads: 9, mql: 3 },
  { valor: 'Cria', leads: 23, mql: 4 },
  { valor: 'Confinamento', leads: 3, mql: 0 },
  { valor: 'Estou começando agora', leads: 10, mql: 0 },
  { valor: '(não informado)', leads: 11, mql: 3 },
]

const porQtdDesejada = [
  { valor: '1 a 5 touros', leads: 61, mql: 15 },
  { valor: '6 a 10 touros', leads: 7, mql: 3 },
  { valor: '11 a 20 touros', leads: 4, mql: 2 },
  { valor: 'ainda não sei quantos', leads: 3, mql: 1 },
  { valor: '21 a 50 touros', leads: 2, mql: 1 },
  { valor: 'mais de 50 touros', leads: 1, mql: 0 },
]

const porUf = [
  { uf: 'MG', leads: 11, mql: 4 },
  { uf: 'MA', leads: 9, mql: 3 },
  { uf: 'SP', leads: 8, mql: 0 },
  { uf: 'BA', leads: 6, mql: 0 },
  { uf: 'PA', leads: 5, mql: 1 },
  { uf: 'TO', leads: 5, mql: 1 },
  { uf: 'RJ', leads: 4, mql: 2 },
  { uf: 'MT', leads: 4, mql: 3 },
  { uf: 'PB', leads: 3, mql: 1 },
  { uf: 'PR', leads: 3, mql: 1 },
  { uf: 'GO', leads: 3, mql: 1 },
  { uf: 'PE', leads: 3, mql: 1 },
  { uf: 'AL', leads: 3, mql: 0 },
  { uf: 'Outras (7)', leads: 11, mql: 4 },
]

const porCriativo = [
  { nome: 'video-perpetuo-touro03', leads: 58, mql: 17 },
  { nome: 'video-sao-geraldo01', leads: 7, mql: 2 },
  { nome: 'video-perpetuo-touro02', leads: 4, mql: 0 },
  { nome: 'sem utm_content preenchido', leads: 8, mql: 2 },
  { nome: 'macro literal "{{ad.name}}"', leads: 1, mql: 1 },
]

// Aba de trabalho LEADS TOUROS (87 linhas)
const atendimento = {
  total: 87,
  etapas: [
    { nome: 'QUALIFICAÇÃO', n: 40 },
    { nome: 'NÃO RESPONDEU', n: 24 },
    { nome: 'CADASTRO OK', n: 4 },
    { nome: 'NÚMERO ERRADO', n: 4 },
    { nome: '(em branco)', n: 3 },
    { nome: 'linhas desalinhadas', n: 12 },
  ],
  assessores: [
    { nome: 'João', n: 38 },
    { nome: 'Bispo', n: 20 },
    { nome: 'Omena', n: 6 },
    { nome: 'Marcelo', n: 4 },
    { nome: 'Serafim', n: 4 },
  ],
  zonas: [
    { nome: 'Sudeste', n: 22 },
    { nome: 'Nordeste', n: 17 },
    { nome: 'Norte', n: 14 },
    { nome: 'Maranhão', n: 9 },
    { nome: 'Centro-Oeste', n: 8 },
    { nome: 'Sul', n: 5 },
  ],
  douglas: 36,
  joaoAntonio: 39,
}

// ---------------------------------------------------------------------------
// 3) PostHog — comportamento na landing (24–30/07)
// ---------------------------------------------------------------------------

const ph = {
  views: 2320,
  visitantes: 1922,
  iniciouForm: 104,
  tentouEnviar: 148,
  errosValidacao: 153,
  leads: 77,
  mql: 23,
  rageTouros: 63,
  rageSg: 25,
  mobile: 2216,
  desktop: 102,
  tablet: 2,
}

const phEtapas = [
  { etapa: 'Etapa 1 — dados de contato', chegou: null, tentou: 153, falhou: 63 },
  { etapa: 'Etapa 2 — perfil da fazenda', chegou: 90, tentou: 93, falhou: 15 },
  { etapa: 'Etapa 3 — intenção de compra', chegou: 78, tentou: null, falhou: 0 },
]

const phSg = { eventos: 176, iniciou: 26, tentou: 21, erros: 35, steps: 36 }

const phUf = [
  { uf: 'Minas Gerais', views: 427, pessoas: 296 },
  { uf: 'São Paulo', views: 338, pessoas: 290 },
  { uf: 'Bahia', views: 195, pessoas: 158 },
  { uf: 'Distrito Federal', views: 121, pessoas: 104 },
  { uf: 'Paraná', views: 104, pessoas: 86 },
  { uf: 'Ceará', views: 98, pessoas: 85 },
  { uf: 'Goiás', views: 90, pessoas: 76 },
  { uf: 'Mato Grosso do Sul', views: 83, pessoas: 67 },
  { uf: 'Rio de Janeiro', views: 82, pessoas: 72 },
  { uf: 'Pará', views: 77, pessoas: 71 },
  { uf: 'Maranhão', views: 77, pessoas: 70 },
]

// ---------------------------------------------------------------------------
// 4) Derivados
// ---------------------------------------------------------------------------

const r2 = (v) => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pct = (v, d = 1) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`
const dec = (v, d = 2) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const investidoTotal = r2(touros.investido + saogeraldo.investido)
const custoPorLead = r2(investidoTotal / qualidade.totalLeads)
const custoPorMql = r2(investidoTotal / qualidade.totalMql)
const custoLeadTouros = r2(touros.investido / qualidade.tourosLeads)
const custoMqlTouros = r2(touros.investido / qualidade.tourosMql)
const custoLeadSg = r2(saogeraldo.investido / qualidade.sgLeads)
const custoMqlSg = r2(saogeraldo.investido / qualidade.sgMql)
const taxaMql = r2((qualidade.totalMql / qualidade.totalLeads) * 100)
const taxaVisitanteLead = r2((ph.leads / ph.visitantes) * 100)
const taxaMobile = r2((ph.mobile / (ph.mobile + ph.desktop + ph.tablet)) * 100)

const anTotal = r2(plataformasTouros[2].investido + plataformasSg[2].investido)
const anCliques = plataformasTouros[2].cliques + plataformasSg[2].cliques
const anImpressoes = plataformasTouros[2].impressoes + plataformasSg[2].impressoes

const leadsSemIe = porIe[1].leads
const shareSemIe = r2((leadsSemIe / qualidade.totalLeads) * 100)
const leadsPequenos = porCabecas[0].leads
const sharePequenos = r2((leadsPequenos / qualidade.totalLeads) * 100)
const shareUmACinco = r2((porQtdDesejada[0].leads / qualidade.totalLeads) * 100)

const investJovens = r2(idadesTouros[0].investido + idadesTouros[1].investido)
const mqlJovens = idadesTouros[0].mql + idadesTouros[1].mql
const cpMqlJovens = r2(investJovens / mqlJovens)
const investMaduros = r2(idadesTouros[3].investido + idadesTouros[4].investido + idadesTouros[5].investido)
const mqlMaduros = idadesTouros[3].mql + idadesTouros[4].mql + idadesTouros[5].mql
const cpMqlMaduros = r2(investMaduros / mqlMaduros)
const shareJovens = r2((investJovens / touros.investido) * 100)
const vantagemMaduros = r2(cpMqlJovens / cpMqlMaduros)

const investMs = regioesTouros.find((r) => r.nome === 'Mato Grosso do Sul').investido
const shareMs = r2((investMs / touros.investido) * 100)

const naoResponderam = atendimento.etapas[1].n
const shareNaoResponderam = r2((naoResponderam / atendimento.total) * 100)
const cadastroOk = atendimento.etapas[2].n
const roteados = atendimento.douglas + atendimento.joaoAntonio
const naoRoteados = atendimento.total - roteados

const subnotificacao = r2((1 - touros.mqlPixel / qualidade.tourosMql) * 100)

const totalDiaLeads = leadsDia.reduce((a, l) => a + l.touros + l.sg, 0)
const totalDiaMql = leadsDia.reduce((a, l) => a + l.tourosMql + l.sgMql, 0)

// ---------------------------------------------------------------------------
// 5) Paleta e gráficos
// ---------------------------------------------------------------------------

const C = {
  black: '#171717',
  charcoal: '#242424',
  gold: '#C9A84C',
  gray: '#666666',
  midGray: '#9a9a9a',
  line: '#e2e2e2',
  paleGray: '#f3f3f3',
  white: '#ffffff',
}

function graficoDiario() {
  const W = 1040, H = 340
  const left = 62, right = 62, top = 34, bottom = 48
  const w = W - left - right
  const h = H - top - bottom
  const maxLeads = 20
  const maxVerba = 450
  const stepX = w / (leadsDia.length - 1)
  const x = (i) => left + stepX * i
  const yL = (v) => top + h - (v / maxLeads) * h
  const yV = (v) => top + h - (v / maxVerba) * h

  let grid = ''
  for (let i = 0; i <= 4; i += 1) {
    const yy = top + (h * i) / 4
    grid += `<line x1="${left}" y1="${yy}" x2="${W - right}" y2="${yy}" stroke="${C.line}"/>`
    grid += `<text x="${left - 10}" y="${yy + 4}" text-anchor="end" font-size="11" fill="${C.gray}">${Math.round(maxLeads * (4 - i) / 4)}</text>`
    grid += `<text x="${W - right + 10}" y="${yy + 4}" font-size="11" fill="${C.gray}">${int(maxVerba * (4 - i) / 4)}</text>`
  }

  const barW = Math.min(38, stepX * 0.52)
  // Barra empilhada: MQL (escuro) na base, restante do lead (claro) em cima.
  const barras = leadsDia.map((l, i) => {
    const leads = l.touros + l.sg
    const mql = l.tourosMql + l.sgMql
    const yTopo = yL(leads)
    const yMql = yL(mql)
    const op = l.parcial ? 0.55 : 1
    return `<rect x="${x(i) - barW / 2}" y="${yTopo}" width="${barW}" height="${yMql - yTopo}" fill="${C.midGray}" opacity="${op}" rx="1.5"/>
      <rect x="${x(i) - barW / 2}" y="${yMql}" width="${barW}" height="${top + h - yMql}" fill="${C.charcoal}" opacity="${op}" rx="1.5"/>
      <text x="${x(i)}" y="${yTopo - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="${C.charcoal}">${leads}</text>
      ${mql > 0 ? `<text x="${x(i)}" y="${top + h - 7}" text-anchor="middle" font-size="10" font-weight="700" fill="${C.white}">${mql}</text>` : ''}`
  }).join('')

  const verbaDia = leadsDia.map((l, i) => {
    const t = diarioTouros[i] ? diarioTouros[i].investido : 0
    const s = i === 5 ? diarioSg[0].investido : i === 6 ? diarioSg[1].investido : 0
    return r2(t + s)
  })
  const linha = verbaDia.map((v, i) => `${x(i)},${yV(v)}`).join(' ')
  const pontos = verbaDia.map((v, i) => `<circle cx="${x(i)}" cy="${yV(v)}" r="4" fill="${C.gold}" stroke="${C.white}" stroke-width="1.4"/>`).join('')
  const rotulos = leadsDia.map((l, i) => `<text x="${x(i)}" y="${H - 26}" text-anchor="middle" font-size="11" fill="${C.gray}">${l.dia}</text>`).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">
    <rect width="100%" height="100%" fill="${C.white}"/>
    <text x="${left}" y="18" font-size="13" font-weight="700" fill="${C.black}" letter-spacing="0.6">LEADS POR DIA — MQL EM ESCURO — E VERBA INVESTIDA (LINHA)</text>
    ${grid}${barras}
    <polyline points="${linha}" fill="none" stroke="${C.gold}" stroke-width="2.6"/>
    ${pontos}${rotulos}
    <text x="${left - 10}" y="${top - 10}" text-anchor="end" font-size="10" fill="${C.gray}">leads</text>
    <text x="${W - right + 10}" y="${top - 10}" font-size="10" fill="${C.gray}">R$/dia</text>
    <text x="${W - right}" y="${H - 8}" text-anchor="end" font-size="9.5" fill="${C.gray}">30/07 é parcial (extração com o dia em curso)</text>
  </svg>`
}

function graficoIdade() {
  const W = 1040, H = 300
  const left = 68, right = 30, top = 34, bottom = 58
  const w = W - left - right
  const h = H - top - bottom
  const maxInvest = 560
  const maxCp = 260
  const groupW = w / idadesTouros.length
  const barW = groupW * 0.34
  const yI = (v) => top + h - (v / maxInvest) * h
  const yC = (v) => top + h - (v / maxCp) * h

  let grid = ''
  for (let i = 0; i <= 4; i += 1) {
    const yy = top + (h * i) / 4
    grid += `<line x1="${left}" y1="${yy}" x2="${W - right}" y2="${yy}" stroke="${C.line}"/>`
    grid += `<text x="${left - 10}" y="${yy + 4}" text-anchor="end" font-size="11" fill="${C.gray}">${int(maxInvest * (4 - i) / 4)}</text>`
  }

  const barras = idadesTouros.map((f, i) => {
    const cx = left + groupW * i + groupW / 2
    const yy = yI(f.investido)
    return `<rect x="${cx - barW / 2}" y="${yy}" width="${barW}" height="${top + h - yy}" fill="${C.charcoal}" rx="1.5"/>
      <text x="${cx}" y="${yy + 16}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${C.white}">${brl(f.investido).replace('R$ ', '')}</text>
      <text x="${cx}" y="${H - 30}" text-anchor="middle" font-size="12" font-weight="700" fill="${C.black}">${f.faixa}</text>
      <text x="${cx}" y="${H - 14}" text-anchor="middle" font-size="10.5" fill="${C.gray}">${f.mql} MQL · ${brl(f.cpMql)} cada</text>`
  }).join('')

  const linha = idadesTouros.map((f, i) => `${left + groupW * i + groupW / 2},${yC(f.cpMql)}`).join(' ')
  const pontos = idadesTouros.map((f, i) => {
    const cx = left + groupW * i + groupW / 2
    return `<circle cx="${cx}" cy="${yC(f.cpMql)}" r="4.5" fill="${C.gold}" stroke="${C.white}" stroke-width="1.4"/>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">
    <rect width="100%" height="100%" fill="${C.white}"/>
    <text x="${left}" y="18" font-size="13" font-weight="700" fill="${C.black}" letter-spacing="0.6">VERBA POR FAIXA DE IDADE (BARRAS) E CUSTO POR MQL (LINHA)</text>
    ${grid}
    <polyline points="${linha}" fill="none" stroke="${C.gold}" stroke-width="2.4" stroke-dasharray="5 3"/>
    ${barras}${pontos}
  </svg>`
}

function graficoFunil() {
  const etapas = [
    { rot: 'Visitantes únicos', v: ph.visitantes },
    { rot: 'Iniciaram o formulário', v: ph.iniciouForm },
    { rot: 'Chegaram à etapa 2', v: 90 },
    { rot: 'Chegaram à etapa 3', v: 78 },
    { rot: 'Leads gravados', v: qualidade.totalLeads },
    { rot: 'MQL', v: qualidade.totalMql },
  ]
  const W = 1040, H = 250
  const left = 210, right = 190, top = 32, bottom = 16
  const w = W - left - right
  const rowH = (H - top - bottom) / etapas.length
  const max = etapas[0].v

  const barras = etapas.map((e, i) => {
    const yy = top + rowH * i + rowH * 0.16
    const bh = rowH * 0.58
    const bw = Math.max(2, (e.v / max) * w)
    const fill = i === etapas.length - 1 ? C.gold : C.charcoal
    const txt = i === etapas.length - 1 ? C.black : C.charcoal
    const anterior = i > 0 ? etapas[i - 1].v : null
    const queda = anterior ? `${pct((e.v / anterior) * 100, 1)} do passo anterior` : `${pct((e.v / max) * 100, 1)} da base`
    return `<text x="${left - 12}" y="${yy + bh / 2 + 4}" text-anchor="end" font-size="11.5" fill="${C.black}">${esc(e.rot)}</text>
      <rect x="${left}" y="${yy}" width="${bw}" height="${bh}" fill="${fill}" rx="1.5"/>
      <text x="${left + bw + 8}" y="${yy + bh / 2 + 4}" font-size="11.5" font-weight="700" fill="${txt}">${int(e.v)}</text>
      <text x="${W - 14}" y="${yy + bh / 2 + 4}" text-anchor="end" font-size="10" fill="${C.gray}">${queda}</text>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">
    <rect width="100%" height="100%" fill="${C.white}"/>
    <text x="16" y="18" font-size="13" font-weight="700" fill="${C.black}" letter-spacing="0.6">DO ANÚNCIO AO MQL — ONDE O FUNIL PERDE GENTE</text>
    ${barras}
  </svg>`
}

function graficoCabecas() {
  const W = 1040, H = 210
  const left = 200, right = 210, top = 32, bottom = 14
  const w = W - left - right
  const rowH = (H - top - bottom) / porCabecas.length
  const max = Math.max(...porCabecas.map((c) => c.leads))

  const barras = porCabecas.map((c, i) => {
    const yy = top + rowH * i + rowH * 0.18
    const bh = rowH * 0.56
    const bw = Math.max(2, (c.leads / max) * w)
    const bwMql = (c.mql / max) * w
    const taxa = c.leads ? (c.mql / c.leads) * 100 : 0
    return `<text x="${left - 12}" y="${yy + bh / 2 + 4}" text-anchor="end" font-size="11.5" fill="${C.black}">${esc(c.faixa)}</text>
      <rect x="${left}" y="${yy}" width="${bw}" height="${bh}" fill="${C.midGray}" rx="1.5"/>
      ${bwMql > 0 ? `<rect x="${left}" y="${yy}" width="${bwMql}" height="${bh}" fill="${C.charcoal}" rx="1.5"/>` : ''}
      <text x="${left + bw + 8}" y="${yy + bh / 2 + 4}" font-size="11" font-weight="700" fill="${C.charcoal}">${c.leads} ${c.leads === 1 ? 'lead' : 'leads'}</text>
      <text x="${W - 14}" y="${yy + bh / 2 + 4}" text-anchor="end" font-size="10.5" fill="${c.mql ? C.black : C.gray}">${c.mql} MQL · ${pct(taxa, 0)}</text>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">
    <rect width="100%" height="100%" fill="${C.white}"/>
    <text x="16" y="18" font-size="13" font-weight="700" fill="${C.black}" letter-spacing="0.6">TAMANHO DO REBANHO DECLARADO — MQL EM ESCURO</text>
    ${barras}
  </svg>`
}

// ---------------------------------------------------------------------------
// 6) HTML
// ---------------------------------------------------------------------------

const kpi = (rotulo, valor, nota, destaque) => `
  <div class="kpi${destaque ? ' destaque' : ''}">
    <div class="kpi-rotulo">${esc(rotulo)}</div>
    <div class="kpi-valor">${valor}</div>
    ${nota ? `<div class="kpi-nota">${nota}</div>` : ''}
  </div>`

const linhaQualidade = (rotulo, leads, mql) => {
  const taxa = leads ? (mql / leads) * 100 : 0
  return `<tr${taxa >= 50 ? ' class="marcada"' : ''}><td>${esc(rotulo)}</td><td>${leads}</td>
    <td>${pct((leads / qualidade.totalLeads) * 100, 1)}</td><td>${mql}</td><td>${pct(taxa, 1)}</td></tr>`
}

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Relatório de Campanhas — Meta Ads, PostHog e MQL — 30/07/2026</title>
<style>
  @page { size: A4; margin: 14mm 13mm 16mm 13mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: ${C.black}; font-size: 10.5pt; line-height: 1.5; }
  h1, h2, h3 { font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin: 0; }
  .capa { background: ${C.black}; color: ${C.white}; padding: 22px 24px 20px; margin-bottom: 4px; }
  .capa h1 { font-size: 23pt; line-height: 1.12; letter-spacing: 0.04em; }
  .capa .sub { color: #c9c9c9; font-size: 10pt; margin-top: 8px; text-transform: none; letter-spacing: 0; }
  .regua { height: 4px; background: ${C.gold}; margin-bottom: 20px; }
  h2 { font-size: 12.5pt; border-bottom: 2px solid ${C.black}; padding-bottom: 5px; margin: 26px 0 12px; }
  h3 { font-size: 10.5pt; color: ${C.charcoal}; margin: 18px 0 8px; letter-spacing: 0.08em; }
  p { margin: 0 0 9px; }
  .lede { font-size: 11pt; }
  strong { font-weight: 700; }
  .kpis { display: flex; gap: 9px; margin: 14px 0 6px; }
  .kpi { flex: 1; border: 1px solid ${C.line}; border-top: 3px solid ${C.black}; padding: 9px 11px 10px; }
  .kpi-rotulo { font-size: 7.6pt; text-transform: uppercase; letter-spacing: 0.09em; color: ${C.gray}; }
  .kpi-valor { font-size: 16pt; font-weight: 700; margin-top: 3px; line-height: 1.1; }
  .kpi-nota { font-size: 8.6pt; color: ${C.gray}; margin-top: 2px; }
  .kpi.destaque { border-top-color: ${C.gold}; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9.4pt; }
  thead th { background: ${C.charcoal}; color: ${C.white}; font-size: 8.2pt; text-transform: uppercase; letter-spacing: 0.06em; padding: 7px 8px; text-align: right; font-weight: 700; }
  thead th:first-child { text-align: left; }
  tbody td { padding: 6px 8px; text-align: right; border-bottom: 1px solid ${C.line}; }
  tbody td:first-child { text-align: left; }
  tbody tr:nth-child(even) { background: ${C.paleGray}; }
  tbody tr.total td { font-weight: 700; border-top: 2px solid ${C.black}; border-bottom: none; background: ${C.white}; }
  tbody tr.marcada { background: #faf5e6; }
  tbody tr.marcada td:first-child { box-shadow: inset 3px 0 0 ${C.gold}; }
  tbody tr.ruim td:first-child { box-shadow: inset 3px 0 0 ${C.charcoal}; }
  .grafico { border: 1px solid ${C.line}; padding: 10px 8px 4px; margin: 10px 0 14px; }
  .caixa { border: 1px solid ${C.black}; border-left: 5px solid ${C.gold}; padding: 11px 14px; margin: 12px 0; }
  .caixa h3 { margin-top: 0; }
  .caixa p:last-child { margin-bottom: 0; }
  .caixa.alerta { border-left-color: ${C.charcoal}; background: ${C.paleGray}; }
  ol, ul { margin: 0 0 10px; padding-left: 20px; }
  li { margin-bottom: 5px; }
  .duas { display: flex; gap: 16px; }
  .duas > div { flex: 1; }
  .rodape { margin-top: 22px; padding-top: 9px; border-top: 1px solid ${C.line}; font-size: 8.4pt; color: ${C.gray}; }
  .quebra { page-break-before: always; }
  .evita-quebra { page-break-inside: avoid; }
  .selo { display: inline-block; font-size: 7.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 2px 7px; border: 1px solid currentColor; }
  .selo.rodando { color: ${C.black}; background: ${C.gold}; border-color: ${C.gold}; }
  .selo.encerrada { color: ${C.gray}; }
  .nota-fonte { font-size: 8.6pt; color: ${C.gray}; margin: -4px 0 12px; }
</style>
</head>
<body>

<div class="capa">
  <h1>Relatório de Campanhas<br>Mídia, comportamento e qualidade de lead</h1>
  <div class="sub">
    Bula Assessoria · janela <strong>24/07 a 30/07/2026</strong> · extração de <strong>30/07/2026</strong> (horário MS)<br>
    Fontes: conector oficial do Meta Ads · PostHog (projeto 430113) · planilha “Leads JMP — Bula Assessoria”
  </div>
</div>
<div class="regua"></div>

<h2>1 · Resumo executivo</h2>

<p class="lede">
  Duas campanhas entregando: <strong>LEAD - PERPETUO TOURO</strong> (desde 24/07) e
  <strong>LEADS - SAO GERALDO</strong> (desde 29/07), ambas na conta CA2. Juntas somam
  <strong>${brl(investidoTotal)}</strong>, que produziram <strong>${qualidade.totalLeads} leads</strong> e
  <strong>${qualidade.totalMql} MQL</strong> — ${brl(custoPorLead)} por lead e <strong>${brl(custoPorMql)} por MQL</strong>.
</p>

<div class="kpis">
  ${kpi('Investido na janela', brl(investidoTotal), '2 campanhas ativas')}
  ${kpi('Leads captados', int(qualidade.totalLeads), 'planilha, sem leads de teste')}
  ${kpi('MQL', int(qualidade.totalMql), `${pct(taxaMql)} dos leads`, true)}
  ${kpi('Custo por MQL', brl(custoPorMql))}
</div>
<div class="kpis">
  ${kpi('Impressões', int(touros.impressoes + saogeraldo.impressoes))}
  ${kpi('Alcance', int(touros.alcance + saogeraldo.alcance), 'pessoas únicas')}
  ${kpi('Visitantes na landing', int(ph.visitantes), 'PostHog')}
  ${kpi('Visitante → lead', pct(taxaVisitanteLead))}
  ${kpi('Lead → MQL', pct(taxaMql))}
</div>

<table>
  <thead>
    <tr><th>Campanha</th><th>Desde</th><th>Investido</th><th>Leads</th><th>MQL</th><th>R$/lead</th><th>R$/MQL</th><th style="text-align:center">Situação</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>${esc(touros.nome)}</strong></td><td>24/07</td><td>${brl(touros.investido)}</td>
      <td>${qualidade.tourosLeads}</td><td>${qualidade.tourosMql}</td>
      <td>${brl(custoLeadTouros)}</td><td>${brl(custoMqlTouros)}</td>
      <td style="text-align:center"><span class="selo rodando">no ar</span></td>
    </tr>
    <tr>
      <td><strong>${esc(saogeraldo.nome)}</strong></td><td>29/07</td><td>${brl(saogeraldo.investido)}</td>
      <td>${qualidade.sgLeads}</td><td>${qualidade.sgMql}</td>
      <td>${brl(custoLeadSg)}</td><td>${brl(custoMqlSg)}</td>
      <td style="text-align:center"><span class="selo rodando">no ar</span></td>
    </tr>
    <tr class="total"><td>Total</td><td></td><td>${brl(investidoTotal)}</td><td>${qualidade.totalLeads}</td>
      <td>${qualidade.totalMql}</td><td>${brl(custoPorLead)}</td><td>${brl(custoPorMql)}</td><td></td></tr>
  </tbody>
</table>

<div class="caixa">
  <h3>Os quatro pontos que mudam decisão</h3>
  <p><strong>1. A régua de MQL está barrando 7 de cada 10 leads — e está certa.</strong>
  ${leadsPequenos} dos ${qualidade.totalLeads} leads (${pct(sharePequenos)}) declaram
  <strong>menos de 100 cabeças</strong> e ${leadsSemIe} (${pct(shareSemIe)}) <strong>não têm inscrição estadual</strong>.
  Nenhum desses vira MQL. O anúncio está trazendo volume de pecuarista pequeno, não comprador de touro PO.</p>
  <p><strong>2. A Audience Network queimou ${brl(anTotal)} em cliques falsos.</strong> ${int(anCliques)} cliques
  em ${int(anImpressoes)} impressões — CTR de 15% a 26%, contra 1,3% do Instagram — e
  <strong>zero MQL</strong>. É posicionamento de erro de toque em app de terceiro. Desligar hoje.</p>
  <p><strong>3. O público maduro entrega MQL ${dec(vantagemMaduros, 1)}x mais barato e recebe menos verba.</strong>
  A faixa 18–34 levou ${pct(shareJovens)} do investimento (${brl(investJovens)}) e trouxe ${mqlJovens} MQL a
  ${brl(cpMqlJovens)} cada; 45+ levou ${brl(investMaduros)} e trouxe ${mqlMaduros} MQL a ${brl(cpMqlMaduros)}.
  <strong>É a mesma recomendação do relatório de 25/07 — ainda não aplicada.</strong></p>
  <p><strong>4. ${naoResponderam} dos ${atendimento.total} leads (${pct(shareNaoResponderam)}) estão como “NÃO RESPONDEU”.</strong>
  Só ${cadastroOk} chegaram a “CADASTRO OK”. O gargalo já não é captação — é o que acontece depois que o lead entra.</p>
</div>

<div class="quebra"></div>

<h2>2 · Desempenho dia a dia</h2>
<div class="grafico evita-quebra">${graficoDiario()}</div>

<h3>2.1 · LEAD - PERPETUO TOURO</h3>
<p class="nota-fonte">
  ID ${touros.id} · conjunto ${esc(touros.adset)} · ${esc(touros.objetivo)} ·
  início ${touros.inicio} · ${esc(touros.fim)}
</p>

<div class="kpis">
  ${kpi('Investido', brl(touros.investido))}
  ${kpi('Impressões', int(touros.impressoes))}
  ${kpi('Alcance', int(touros.alcance))}
  ${kpi('Frequência', dec(touros.frequencia), 'saudável')}
</div>
<div class="kpis">
  ${kpi('Cliques', int(touros.cliques))}
  ${kpi('CTR', pct(touros.ctr, 2))}
  ${kpi('CPC', brl(touros.cpc))}
  ${kpi('CPM', brl(touros.cpm))}
  ${kpi('MQL real', int(qualidade.tourosMql), `${brl(custoMqlTouros)} cada`, true)}
</div>

<table class="evita-quebra">
  <thead>
    <tr><th>Dia</th><th>Investido</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>CPM</th><th>Leads</th><th>MQL</th><th>R$/lead</th></tr>
  </thead>
  <tbody>
    ${diarioTouros.map((d, i) => {
      const l = leadsDia[i]
      const cpl = l.touros ? d.investido / l.touros : null
      return `<tr${l.tourosMql >= 4 ? ' class="marcada"' : ''}>
        <td>${d.dia}${d.parcial ? ' <span style="color:#666">(parcial)</span>' : ''}</td>
        <td>${brl(d.investido)}</td><td>${int(d.impressoes)}</td><td>${int(d.cliques)}</td>
        <td>${pct(d.ctr, 2)}</td><td>${brl(d.cpm)}</td><td>${l.touros}</td><td>${l.tourosMql}</td>
        <td>${cpl ? brl(cpl) : '—'}</td></tr>`
    }).join('')}
    <tr class="total"><td>Total</td><td>${brl(touros.investido)}</td><td>${int(touros.impressoes)}</td>
      <td>${int(touros.cliques)}</td><td>${pct(touros.ctr, 2)}</td><td>${brl(touros.cpm)}</td>
      <td>${qualidade.tourosLeads}</td><td>${qualidade.tourosMql}</td><td>${brl(custoLeadTouros)}</td></tr>
  </tbody>
</table>

<p>A campanha <strong>não está saturada</strong>: frequência de ${dec(touros.frequencia)} em 7 dias e CPM caindo
de ${brl(diarioTouros[0].cpm)} para ${brl(diarioTouros[6].cpm)}. O CTR recuou de ${pct(diarioTouros[0].ctr, 2)}
para ${pct(diarioTouros[6].ctr, 2)}, mas isso acompanha a abertura de público — não é exaustão. O problema
não é entrega de mídia, é <strong>o perfil de quem preenche o formulário</strong> (seção 4).</p>

<h3>2.2 · LEADS - SAO GERALDO</h3>
<p class="nota-fonte">
  ID ${saogeraldo.id} · ${esc(saogeraldo.objetivo)} · início ${saogeraldo.inicio} · ${esc(saogeraldo.fim)} ·
  apenas 2 dias de entrega até a extração
</p>

<table>
  <thead>
    <tr><th>Dia</th><th>Investido</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>CPM</th><th>Leads</th><th>MQL</th></tr>
  </thead>
  <tbody>
    ${diarioSg.map((d, i) => `<tr>
      <td>${d.dia}${d.parcial ? ' <span style="color:#666">(parcial)</span>' : ''}</td>
      <td>${brl(d.investido)}</td><td>${int(d.impressoes)}</td><td>${int(d.cliques)}</td>
      <td>${pct(d.ctr, 2)}</td><td>${brl(d.cpm)}</td>
      <td>${leadsDia[5 + i].sg}</td><td>${leadsDia[5 + i].sgMql}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td>${brl(saogeraldo.investido)}</td><td>${int(saogeraldo.impressoes)}</td>
      <td>${int(saogeraldo.cliques)}</td><td>${pct(saogeraldo.ctr, 2)}</td><td>${brl(saogeraldo.cpm)}</td>
      <td>${qualidade.sgLeads}</td><td>${qualidade.sgMql}</td></tr>
  </tbody>
</table>

<table class="evita-quebra">
  <thead><tr><th>Conjunto</th><th>Investido</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>CPM</th><th style="text-align:left">Custo por resultado</th></tr></thead>
  <tbody>
    ${conjuntosSg.map((c) => `<tr><td>${esc(c.nome)}</td><td>${brl(c.investido)}</td>
      <td>${int(c.impressoes)}</td><td>${int(c.cliques)}</td><td>${pct(c.ctr, 2)}</td>
      <td>${brl(c.cpm)}</td><td style="text-align:left">${esc(c.obs)}</td></tr>`).join('')}
  </tbody>
</table>

<p>Dois dias é <strong>pouco para decidir</strong>. O CTR de ${pct(saogeraldo.ctr, 2)} parece excelente, mas está
inflado pela Audience Network (${pct(plataformasSg[2].ctr, 2)} de CTR e zero MQL) — descontando esse
posicionamento, o CTR real fica em torno de 4%. O conjunto de remarketing entrega conversão barata
(${brl(10.87)}), o que é esperado: é público que já conhece a marca, não aquisição.</p>

<div class="quebra"></div>

<h2>3 · Para onde o dinheiro está indo</h2>

<h3>3.1 · Posicionamento — a Audience Network está queimando verba</h3>
<table>
  <thead>
    <tr><th>Campanha / posicionamento</th><th>Investido</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>CPM</th><th>MQL</th><th>R$/MQL</th></tr>
  </thead>
  <tbody>
    ${plataformasTouros.map((p) => `<tr${p.nome === 'Audience Network' ? ' class="ruim"' : ''}>
      <td>Touros · ${esc(p.nome)}</td><td>${brl(p.investido)}</td><td>${int(p.impressoes)}</td>
      <td>${int(p.cliques)}</td><td>${pct(p.ctr, 2)}</td><td>${brl(p.cpm)}</td>
      <td>${p.mql}</td><td>${p.cpMql ? brl(p.cpMql) : '—'}</td></tr>`).join('')}
    ${plataformasSg.map((p) => `<tr${p.nome === 'Audience Network' ? ' class="ruim"' : ''}>
      <td>São Geraldo · ${esc(p.nome)}</td><td>${brl(p.investido)}</td><td>${int(p.impressoes)}</td>
      <td>${int(p.cliques)}</td><td>${pct(p.ctr, 2)}</td><td>${brl(p.cpm)}</td>
      <td>${p.mql}</td><td>${p.cpMql ? brl(p.cpMql) : '—'}</td></tr>`).join('')}
  </tbody>
</table>

<div class="caixa alerta evita-quebra">
  <h3>Como reconhecer clique falso</h3>
  <p>A Audience Network entregou <strong>${int(anImpressoes)} impressões</strong> e cobrou
  <strong>${brl(anTotal)}</strong> — CPM de R$ 103 a R$ 108, <strong>8x o CPM do Instagram</strong>
  (${brl(plataformasTouros[0].cpm)}). O CTR de ${pct(plataformasSg[2].ctr, 2)} não é engajamento: é anúncio
  ocupando a tela inteira de um app de terceiro, onde a pessoa toca para fechar. Prova: desses
  <strong>${int(anCliques)} cliques, saiu zero MQL</strong>.</p>
  <p><strong>Ação:</strong> nos dois conjuntos, desmarcar Audience Network no posicionamento manual.
  Economia imediata de ~${brl(anTotal)} a cada 7 dias, sem perder um único lead qualificado.</p>
</div>

<h3>3.2 · Faixa de idade — de novo, a verba está no público errado</h3>
<div class="grafico evita-quebra">${graficoIdade()}</div>

<table class="evita-quebra">
  <thead>
    <tr><th>Idade</th><th>Investido</th><th>% verba</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>MQL</th><th>R$/MQL</th></tr>
  </thead>
  <tbody>
    ${idadesTouros.map((f) => `<tr${f.cpMql <= 95 ? ' class="marcada"' : f.cpMql >= 200 ? ' class="ruim"' : ''}>
      <td>${f.faixa}</td><td>${brl(f.investido)}</td>
      <td>${pct((f.investido / touros.investido) * 100, 1)}</td><td>${int(f.impressoes)}</td>
      <td>${int(f.cliques)}</td><td>${pct(f.ctr, 2)}</td><td>${f.mql}</td><td>${brl(f.cpMql)}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td>${brl(touros.investido)}</td><td>100,0%</td>
      <td>${int(touros.impressoes)}</td><td>${int(touros.cliques)}</td><td>${pct(touros.ctr, 2)}</td>
      <td>${touros.mqlPixel}</td><td>${brl(touros.custoPorMqlPixel)}</td></tr>
  </tbody>
</table>

<p>O padrão é linear e não deixa dúvida: <strong>quanto mais velho o público, melhor o CTR e mais barato o MQL</strong>.
O 65+ converte a ${brl(idadesTouros[5].cpMql)} — <strong>5x mais barato</strong> que o 18–24
(${brl(idadesTouros[0].cpMql)}) — mesmo pagando o CPM mais caro da campanha (${brl(idadesTouros[5].cpm)}).
Faz sentido: quem tem inscrição estadual, rebanho formado e capital para comprar touro PO não tem 22 anos.</p>

<p><strong>A recomendação de restringir a idade já estava no relatório de 25/07 e não foi aplicada.</strong>
Os números desta janela a confirmam com dados novos: os ${brl(investJovens)} colocados em 18–34 renderiam
o dobro de MQL na faixa 45+.</p>

<h3>3.3 · Região — a campanha virou nacional</h3>
<table class="evita-quebra">
  <thead><tr><th>UF</th><th>Investido</th><th>% verba</th><th>Impressões</th><th>CTR</th></tr></thead>
  <tbody>
    ${regioesTouros.map((r) => `<tr><td>${esc(r.nome)}</td><td>${brl(r.investido)}</td>
      <td>${pct((r.investido / touros.investido) * 100, 1)}</td><td>${int(r.impressoes)}</td>
      <td>${pct(r.ctr, 2)}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td>${brl(touros.investido)}</td><td>100,0%</td>
      <td>${int(touros.impressoes)}</td><td>${pct(touros.ctr, 2)}</td></tr>
  </tbody>
</table>

<p class="nota-fonte">A Meta não atribui a conversão personalizada por região — todas as linhas voltam com zero.
Por isso esta tabela mostra <strong>distribuição de verba</strong>, não MQL por estado. O MQL por UF real está na seção 4.4.</p>

<p>Inversão total em relação ao CORTE PERPÉTUO de julho, que era ${pct(99.7)} Mato Grosso do Sul: agora o MS
recebe <strong>${pct(shareMs)} da verba</strong> (${brl(investMs)}) e a liderança é de Minas Gerais e São Paulo.
Abrir geografia foi o certo para derrubar a frequência — mas vale conferir se faz sentido pagar mídia em
${regioesTouros.length - 1}+ estados para um leilão cujo frete encarece a compra. <strong>Um lead do Sul já foi
recusado por “não tem frete SC”</strong> na aba de trabalho.</p>

<div class="quebra"></div>

<h2>4 · Qualidade dos leads e MQL</h2>

<p class="nota-fonte">
  Fonte: aba-arquivo <em>LEADS BULA - PERPETUO</em> da planilha “Leads JMP — Bula Assessoria”, 24–30/07,
  ${qualidade.totalLeads} leads, nenhum marcado como teste. <strong>As landings não gravam no CRM</strong> —
  a planilha é o livro-razão desta campanha.
</p>

<div class="caixa evita-quebra">
  <h3>A régua de MQL em vigor</h3>
  <p>Um lead é MQL quando cumpre <strong>as duas</strong> condições:
  <strong>(a)</strong> rebanho declarado de <strong>100 cabeças ou mais</strong> e
  <strong>(b)</strong> <strong>tem inscrição estadual</strong>. É a regra padrão do funil
  (<em>min_cabeças = 100, exige I.E.</em>), aplicada igual nas duas landings.</p>
</div>

<div class="grafico evita-quebra">${graficoFunil()}</div>

<h3>4.1 · Tamanho do rebanho — onde a régua corta</h3>
<div class="grafico evita-quebra">${graficoCabecas()}</div>

<table class="evita-quebra">
  <thead><tr><th>Rebanho declarado</th><th>Leads</th><th>% do total</th><th>MQL</th><th>Taxa de MQL</th></tr></thead>
  <tbody>
    ${porCabecas.map((c) => linhaQualidade(c.faixa, c.leads, c.mql)).join('')}
    <tr class="total"><td>Total</td><td>${qualidade.totalLeads}</td><td>100,0%</td>
      <td>${qualidade.totalMql}</td><td>${pct(taxaMql)}</td></tr>
  </tbody>
</table>

<p><strong>${leadsPequenos} de ${qualidade.totalLeads} leads (${pct(sharePequenos)}) declaram menos de 100 cabeças</strong>
— e nenhum deles vira MQL. Acima de 500 cabeças, a conversão em MQL é de 100%. O criativo e a segmentação
estão atraindo o pecuarista pequeno; a régua depois o descarta. <strong>É verba paga por lead que já nasce reprovado.</strong></p>

<h3>4.2 · Inscrição estadual — o segundo filtro</h3>
<table>
  <thead><tr><th>Tem inscrição estadual</th><th>Leads</th><th>% do total</th><th>MQL</th><th>Taxa de MQL</th></tr></thead>
  <tbody>
    ${porIe.map((c) => linhaQualidade(c.valor, c.leads, c.mql)).join('')}
  </tbody>
</table>
<p>${leadsSemIe} leads (${pct(shareSemIe)}) declararam <strong>não ter inscrição estadual</strong>. Sem I.E. não há
habilitação em leiloeira, então o lead não avança — independentemente do tamanho do rebanho. Note que
ter I.E. também não garante: dos ${porIe[0].leads} com I.E., ${porIe[0].mql} viraram MQL
(${pct((porIe[0].mql / porIe[0].leads) * 100)}) — os demais reprovaram no rebanho.</p>

<h3>4.3 · Momento na pecuária e intenção de compra</h3>
<div class="duas">
  <div>
    <table>
      <thead><tr><th>Momento</th><th>Leads</th><th>MQL</th><th>Taxa</th></tr></thead>
      <tbody>
        ${porMomento.map((m) => {
          const t = m.leads ? (m.mql / m.leads) * 100 : 0
          return `<tr${t >= 45 ? ' class="marcada"' : ''}><td>${esc(m.valor)}</td>
            <td>${m.leads}</td><td>${m.mql}</td><td>${pct(t, 0)}</td></tr>`
        }).join('')}
      </tbody>
    </table>
  </div>
  <div>
    <table>
      <thead><tr><th>Quantos touros quer</th><th>Leads</th><th>MQL</th><th>Taxa</th></tr></thead>
      <tbody>
        ${porQtdDesejada.map((m) => {
          const t = m.leads ? (m.mql / m.leads) * 100 : 0
          return `<tr${t >= 45 ? ' class="marcada"' : ''}><td>${esc(m.valor)}</td>
            <td>${m.leads}</td><td>${m.mql}</td><td>${pct(t, 0)}</td></tr>`
        }).join('')}
      </tbody>
    </table>
  </div>
</div>

<p><strong>“Ciclo completo” e “cria e recria” são os perfis que convertem</strong> (${pct(71.4, 0)} e ${pct(46.7, 0)}
de MQL). Já <strong>“estou começando agora” trouxe ${porMomento[5].leads} leads e zero MQL</strong> — é o perfil
que o criativo atrai e a régua reprova. Na intenção de compra, ${pct(shareUmACinco)} pedem apenas
<strong>1 a 5 touros</strong>: ticket baixo, ainda que ${porQtdDesejada[0].mql} deles sejam MQL.</p>

<h3>4.4 · Estado do lead — MQL de verdade, por UF</h3>
<table class="evita-quebra">
  <thead><tr><th>UF</th><th>Leads</th><th>% do total</th><th>MQL</th><th>Taxa de MQL</th></tr></thead>
  <tbody>
    ${porUf.map((u) => linhaQualidade(u.uf, u.leads, u.mql)).join('')}
  </tbody>
</table>
<p><strong>São Paulo e Bahia trouxeram ${porUf[2].leads + porUf[3].leads} leads e nenhum MQL</strong>, consumindo
${brl(regioesTouros[1].investido + regioesTouros[2].investido)} de mídia. Mato Grosso é o oposto:
${porUf[7].leads} leads e ${porUf[7].mql} MQL (${pct(75, 0)}). Minas e Maranhão combinam volume e qualidade.
<strong>Há verba de sobra para realocar de SP/BA para MT, MG e MA.</strong></p>

<h3>4.5 · Criativo</h3>
<table>
  <thead><tr><th>Criativo</th><th>Leads</th><th>% do total</th><th>MQL</th><th>Taxa de MQL</th></tr></thead>
  <tbody>
    ${porCriativo.map((c) => linhaQualidade(c.nome, c.leads, c.mql)).join('')}
  </tbody>
</table>
<p>O <strong>video-perpetuo-touro03 é a campanha inteira</strong>: ${porCriativo[0].leads} dos
${qualidade.totalLeads} leads e ${porCriativo[0].mql} dos ${qualidade.totalMql} MQL. Não há teste real de
criativo rodando — o touro02 recebeu ${porCriativo[2].leads} leads e o touro01 nenhum.
Há ainda <strong>${porCriativo[4].leads} lead com a macro literal “{{ad.name}}”</strong> e
${porCriativo[3].leads} sem <em>utm_content</em>: rastreio incompleto, que impede leitura por criativo.</p>

<div class="quebra"></div>

<h2>5 · Comportamento na landing (PostHog)</h2>

<div class="kpis">
  ${kpi('Visitantes únicos', int(ph.visitantes), `${int(ph.views)} visualizações`)}
  ${kpi('Iniciaram o form', int(ph.iniciouForm), `${pct((ph.iniciouForm / ph.visitantes) * 100)} dos visitantes`)}
  ${kpi('Erros de validação', int(ph.errosValidacao), 'mais erros que envios')}
  ${kpi('Cliques de raiva', int(ph.rageTouros + ph.rageSg), 'touros + são geraldo', true)}
  ${kpi('Tráfego mobile', pct(taxaMobile), `${int(ph.desktop)} acessos em desktop`)}
</div>

<h3>5.1 · O funil real da página</h3>
<table>
  <thead><tr><th>Etapa do formulário</th><th>Chegaram</th><th>Tentaram avançar</th><th>Falharam na validação</th><th>Taxa de erro</th></tr></thead>
  <tbody>
    ${phEtapas.map((e) => `<tr${e.falhou >= 60 ? ' class="ruim"' : ''}>
      <td>${esc(e.etapa)}</td><td>${e.chegou === null ? '—' : int(e.chegou)}</td>
      <td>${e.tentou === null ? '—' : int(e.tentou)}</td><td>${int(e.falhou)}</td>
      <td>${e.tentou ? pct((e.falhou / e.tentou) * 100) : '—'}</td></tr>`).join('')}
  </tbody>
</table>

<div class="caixa evita-quebra">
  <h3>A etapa 1 é o gargalo</h3>
  <p>Foram <strong>${phEtapas[0].tentou} tentativas de avançar da etapa 1</strong> e
  <strong>${phEtapas[0].falhou} falharam</strong> — taxa de erro de
  ${pct((phEtapas[0].falhou / phEtapas[0].tentou) * 100)}. Só ${phEtapas[1].chegou} pessoas chegaram à etapa 2.
  A etapa 1 pede dados de contato (nome, WhatsApp, e-mail): <strong>2 em cada 5 pessoas não conseguem passar
  do primeiro passo</strong>, quase certamente por máscara de telefone ou validação de e-mail.</p>
  <p>Reforça o diagnóstico: <strong>${ph.rageTouros} cliques de raiva</strong> em touros.bulaassessoria.com e
  ${ph.rageSg} em saogeraldo.bulaassessoria.com. Cliques de raiva são toques repetidos no mesmo ponto —
  a assinatura de alguém tentando enviar um formulário que não responde.</p>
  <p><strong>Ação:</strong> tornar o e-mail opcional (${qualidade.semEmail} leads já entraram sem e-mail e o
  WhatsApp está em 100% deles) e revisar a máscara do telefone. Recuperar metade dessas
  ${phEtapas[0].falhou} falhas significaria <strong>~30 leads a mais na mesma verba</strong>.</p>
</div>

<h3>5.2 · De onde vem o tráfego</h3>
<table class="evita-quebra">
  <thead><tr><th>UF do visitante</th><th>Visualizações</th><th>Pessoas</th><th>Leads da UF</th><th>MQL da UF</th></tr></thead>
  <tbody>
    ${phUf.map((u) => {
      const sigla = { 'Minas Gerais': 'MG', 'São Paulo': 'SP', 'Bahia': 'BA', 'Paraná': 'PR', 'Ceará': 'CE', 'Goiás': 'GO', 'Mato Grosso do Sul': 'MS', 'Rio de Janeiro': 'RJ', 'Pará': 'PA', 'Maranhão': 'MA' }[u.uf]
      const m = porUf.find((p) => p.uf === sigla)
      return `<tr><td>${esc(u.uf)}</td><td>${int(u.views)}</td><td>${int(u.pessoas)}</td>
        <td>${m ? m.leads : '—'}</td><td>${m ? m.mql : '—'}</td></tr>`
    }).join('')}
  </tbody>
</table>
<p>O tráfego do PostHog confirma a distribuição de verba do Meta: Minas e São Paulo lideram em visitas.
Mas São Paulo, com <strong>${int(phUf[1].pessoas)} pessoas na página</strong>, não gerou um único MQL —
enquanto o Mato Grosso do Sul, com ${int(phUf[7].pessoas)}, gerou 1 lead que é MQL.</p>

<h3>5.3 · Landing de São Geraldo</h3>
<p>Em 2 dias: <strong>${phSg.eventos} eventos</strong>, ${phSg.iniciou} formulários iniciados,
${phSg.tentou} tentativas de envio e <strong>${phSg.erros} erros de validação</strong> — mais erros que
tentativas, o mesmo atrito da landing de touros. Resultado: ${qualidade.sgLeads} leads gravados.</p>

<div class="quebra"></div>

<h2>6 · As três contagens de MQL não batem</h2>

<table>
  <thead><tr><th>Fonte</th><th>O que mede</th><th>Leads</th><th>MQL</th></tr></thead>
  <tbody>
    <tr><td><strong>Planilha</strong> (livro-razão)</td>
      <td style="text-align:left">Linha gravada com a régua aplicada</td>
      <td>${qualidade.totalLeads}</td><td><strong>${qualidade.totalMql}</strong></td></tr>
    <tr><td>PostHog</td><td style="text-align:left">Evento no navegador do visitante</td>
      <td>${ph.leads}</td><td>${ph.mql}</td></tr>
    <tr><td>Meta Ads (pixel)</td><td style="text-align:left">Conversão atribuída ao anúncio — só touros</td>
      <td>—</td><td>${touros.mqlPixel}</td></tr>
  </tbody>
</table>

<p><strong>PostHog e planilha praticamente batem</strong> (${ph.leads} contra ${qualidade.totalLeads} leads;
${ph.mql} contra ${qualidade.totalMql} MQL). A diferença de 1 é registro na virada do dia. Vale notar que a
landing de São Geraldo <strong>ainda dispara o evento com o nome de touros</strong>
(<em>touros_lead_submitted</em>) — o fork não renomeou o evento final, então o número do PostHog cobre as
duas landings juntas. Não é erro de dado, mas atrapalha a leitura por campanha.</p>

<p><strong>A Meta subnotifica ${pct(subnotificacao, 0)}:</strong> atribuiu ${touros.mqlPixel} MQL contra
${qualidade.tourosMql} reais na campanha de touros. É o comportamento esperado — bloqueio de rastreamento no
iOS, cookies e janela de atribuição. <strong>Para decidir verba, use a planilha e o PostHog; o número da Meta
serve para o algoritmo otimizar, não para medir resultado.</strong></p>

<h2>7 · Problemas encontrados</h2>

<h3>7.1 · 12 leads de São Geraldo entraram desalinhados na aba LEADS TOUROS</h3>
<p>A mudança de 29/07, que fez o lead de São Geraldo seguir o caminho de touros, está gravando com o
<strong>layout de coluna errado</strong>. Nas 12 linhas afetadas: a coluna <em>Etapa</em> recebeu um
identificador (“l:1077242948066252”), <em>Atendido por</em> recebeu um horário
(“2026-07-29T14:16:55-05:00”) e <em>Zona</em> recebeu o nome da campanha (“LEADS - SAO GERALDO”).
Esses leads <strong>não aparecem para nenhum assessor</strong> e sujam qualquer contagem por etapa.</p>

<h3>7.2 · ${naoRoteados} leads não chegaram a nenhum assessor</h3>
<table>
  <thead><tr><th>Aba</th><th>Linhas</th></tr></thead>
  <tbody>
    <tr><td>LEADS TOUROS (consolidada)</td><td>${atendimento.total}</td></tr>
    <tr><td>LEADS DOUGLAS</td><td>${atendimento.douglas}</td></tr>
    <tr><td>LEADS JOAO ANTONIO</td><td>${atendimento.joaoAntonio}</td></tr>
    <tr class="total"><td>Roteados / não roteados</td><td>${roteados} / <strong>${naoRoteados}</strong></td></tr>
  </tbody>
</table>
<p>${roteados} dos ${atendimento.total} leads foram para a aba de um assessor. Os ${naoRoteados} restantes
incluem as 12 linhas desalinhadas do item anterior.</p>

<h3>7.3 · Situação do atendimento</h3>
<div class="duas">
  <div>
    <table>
      <thead><tr><th>Etapa</th><th>Leads</th><th>%</th></tr></thead>
      <tbody>
        ${atendimento.etapas.map((e) => `<tr${e.nome === 'NÃO RESPONDEU' ? ' class="ruim"' : ''}>
          <td>${esc(e.nome)}</td><td>${e.n}</td>
          <td>${pct((e.n / atendimento.total) * 100, 0)}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div>
    <table>
      <thead><tr><th>Atendido por</th><th>Leads</th></tr></thead>
      <tbody>
        ${atendimento.assessores.map((a) => `<tr><td>${esc(a.nome)}</td><td>${a.n}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>
<p><strong>${naoResponderam} leads (${pct(shareNaoResponderam)}) estão marcados como “NÃO RESPONDEU”</strong> e
${atendimento.etapas[3].n} como “NÚMERO ERRADO”. Apenas <strong>${cadastroOk} chegaram a “CADASTRO OK”</strong>
— ou seja, de ${brl(investidoTotal)} investidos, ${cadastroOk} compradores efetivamente habilitados até agora.
Com ${qualidade.totalMql} MQL na mão, o funil está travando <strong>depois</strong> da captação.</p>

<h3>7.4 · Ressalvas desta extração</h3>
<ul>
  <li><strong>Conta CA1 - Bula 360:</strong> o conector do Meta devolveu erro em toda consulta de métrica
  desta conta nesta extração (só atributos responderam). Por isso a campanha <strong>CORTE TUPÃ</strong>
  (27–28/07) não tem números aqui. A CORTE PERPÉTUO encerrou em 25/07 e está coberta no relatório anterior.</li>
  <li><strong>Higiene da CA1:</strong> a conta segue com <strong>~80 campanhas rotuladas ACTIVE</strong> com
  data-fim vencida, algumas de novembro/2025. Não gastam, mas impedem responder “o que está no ar?” pelo painel.</li>
  <li><strong>Dia 30/07 é parcial</strong> — a extração ocorreu com o dia em curso.</li>
  <li><strong>MQL por região</strong> não é atribuível pela Meta (a conversão personalizada volta zerada em
  todas as UFs); o MQL por estado da seção 4.4 vem da planilha, que é a fonte correta.</li>
</ul>

<div class="quebra"></div>

<h2>8 · Recomendações</h2>

<h3>Hoje — sem custo, efeito imediato</h3>
<ol>
  <li><strong>Desligar a Audience Network</strong> nos dois conjuntos. ${brl(anTotal)} em 7 dias,
  ${int(anCliques)} cliques, zero MQL. É o corte mais óbvio do relatório.</li>
  <li><strong>Corrigir a gravação dos leads de São Geraldo na aba LEADS TOUROS</strong> (12 linhas com colunas
  trocadas) e reprocessar essas linhas para o assessor certo — hoje elas estão invisíveis.</li>
  <li><strong>Atacar os ${naoResponderam} “NÃO RESPONDEU”.</strong> São leads já pagos. Uma régua de
  reengajamento por template aprovado custa quase nada perto de ${brl(custoPorMql)} por MQL novo.</li>
</ol>

<h3>Esta semana — ajuste de mídia</h3>
<ol start="4">
  <li><strong>Subir a idade mínima para 35 anos.</strong> A faixa 18–34 consome ${pct(shareJovens)} da verba e
  entrega MQL a ${brl(cpMqlJovens)}; 45+ entrega a ${brl(cpMqlMaduros)}. Segunda vez que este relatório aponta
  o mesmo ponto.</li>
  <li><strong>Cortar ou reduzir São Paulo e Bahia.</strong> ${porUf[2].leads + porUf[3].leads} leads, zero MQL,
  ${brl(regioesTouros[1].investido + regioesTouros[2].investido)} gastos. Realocar para MT, MG e MA, que
  combinam volume e taxa de MQL.</li>
  <li><strong>Consertar a etapa 1 do formulário.</strong> ${phEtapas[0].falhou} falhas de validação e
  ${ph.rageTouros + ph.rageSg} cliques de raiva. Tornar o e-mail opcional e revisar a máscara de telefone —
  é o ponto de maior ganho por real investido em todo o relatório.</li>
  <li><strong>Padronizar o rastreio:</strong> ${porCriativo[3].leads} leads sem <em>utm_content</em> e
  ${porCriativo[4].leads} com a macro literal “{{ad.name}}”. Sem isso não há leitura de criativo.</li>
</ol>

<h3>Estrutural — próxima campanha</h3>
<ol start="8">
  <li><strong>Filtrar o rebanho no próprio anúncio.</strong> ${pct(sharePequenos)} dos leads têm menos de 100
  cabeças e são descartados pela régua. Dizer no criativo que é leilão de touro PO para rebanho formado
  reduz volume e aumenta qualidade — o que importa é MQL, não lead.</li>
  <li><strong>Testar criativo de verdade.</strong> Um único vídeo (touro03) responde por
  ${pct((porCriativo[0].leads / qualidade.totalLeads) * 100, 0)} dos leads. Sem alternativa viva, não há como
  saber se o custo por MQL de ${brl(custoPorMql)} é bom ou ruim.</li>
  <li><strong>Renomear o evento da landing de São Geraldo</strong> (<em>touros_lead_submitted</em> →
  <em>saogeraldo_lead_submitted</em>) para separar as duas campanhas no PostHog.</li>
  <li><strong>Pausar em lote as ~80 campanhas vencidas da CA1</strong> — pendência do relatório de 25/07.</li>
</ol>

<div class="rodape">
  Relatório gerado em 30/07/2026 a partir de: API oficial do Meta Ads (conector Meta, conta CA2 - Bula 360);
  PostHog projeto 430113 via HogQL; planilha “Leads JMP — Bula Assessoria”, abas <em>LEADS BULA - PERPETUO</em>
  e <em>LEADS TOUROS</em>. Janela 24/07 a 30/07/2026, horário de MS. O dia 30/07 é parcial por natureza.
  MQL segue a régua do funil: 100+ cabeças <strong>e</strong> inscrição estadual.
  Script: <em>scripts/gera-relatorio-campanhas-2026-07-30.mjs</em>
</div>

</body>
</html>`

// ---------------------------------------------------------------------------
// 7) Escrita e PDF
// ---------------------------------------------------------------------------

const htmlPath = join(outputDir, `${outputStem}.html`)
const pdfPath = join(outputDir, `${outputStem}.pdf`)
writeFileSync(htmlPath, html, 'utf8')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
await page.emulateMedia({ media: 'print' })
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `<div style="width:100%;font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#666;padding:0 13mm;display:flex;justify-content:space-between;">
    <span>Bula Assessoria · Campanhas, PostHog e MQL · 30/07/2026</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`,
  margin: { top: '14mm', right: '13mm', bottom: '16mm', left: '13mm' },
})
await browser.close()

if (desktop) copyFileSync(pdfPath, join(desktop, `${desktopStem}.pdf`))

console.log('HTML:', htmlPath)
console.log('PDF :', pdfPath)
if (desktop) console.log('PDF (Desktop):', join(desktop, `${desktopStem}.pdf`))
console.log(`\nResumo: ${brl(investidoTotal)} · ${qualidade.totalLeads} leads · ${qualidade.totalMql} MQL · ${brl(custoPorMql)}/MQL`)
