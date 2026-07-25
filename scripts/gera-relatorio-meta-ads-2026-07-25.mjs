// Relatório das campanhas ativas no Meta Ads — data-base 25/07/2026, 12h26 (MS).
//
// Fonte: conector Meta Ads (API oficial / Meta MCP), contas Bula 360.
// Os números abaixo são a extração literal da API naquele instante — não recalcular
// nem "arredondar" divergências: o parcial do dia 25/07 é parcial de propósito.
//
// Saídas:
// - outputs/relatorio-meta-ads-2026-07-25.{html,pdf}
// - Desktop/Relatorio Meta Ads - Campanhas Ativas - 25-07-2026.pdf
//
// Uso:
//   node scripts/gera-relatorio-meta-ads-2026-07-25.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(root, 'outputs')
const desktop = join(process.env.USERPROFILE || '', 'Desktop')
const outputStem = 'relatorio-meta-ads-2026-07-25'
const desktopStem = 'Relatorio Meta Ads - Campanhas Ativas - 25-07-2026'

mkdirSync(outputDir, { recursive: true })

// ---------------------------------------------------------------------------
// 1) Dados extraídos do conector (25/07/2026 12h26)
// ---------------------------------------------------------------------------

const principal = {
  nome: 'CORTE PERPÉTUO / 13 de Julho',
  id: '120252376771150184',
  conta: 'CA1 - Bula 360 (1155240258865815)',
  objetivo: 'OUTCOME_LEADS — formulário instantâneo',
  lance: 'Highest volume',
  inicio: '13/07/2026 10h36',
  fim: '25/07/2026 10h36',
  investido: 2705.34,
  impressoes: 256022,
  alcance: 64520,
  frequencia: 3.968103,
  cliques: 3247,
  ctr: 1.27,
  cpc: 0.83,
  cpm: 10.57,
  leads: 154,
  cpl: 17.57,
  engajamentos: 57697,
  video75: 9753,
}

const touros = {
  nome: 'LEAD - PERPETUO TOURO',
  id: '120249455058620708',
  conta: 'CA2 - Bula 360 (2705134163151418)',
  objetivo: 'OUTCOME_LEADS — conversão de pixel "MQL Perpetuo Touros"',
  inicio: '24/07/2026 13h51',
  fim: 'sem data de encerramento',
  investido: 237.09,
  impressoes: 12594,
  alcance: 8452,
  frequencia: 1.490062,
  cliques: 299,
  ctr: 2.37,
  cpc: 0.79,
  cpm: 18.83,
  engajamentos: 3533,
  resultados: 1,
  custoResultado: 237.09,
}

const diario = [
  { dia: '13/07', investido: 171.29, impressoes: 10015, ctr: 1.17, leads: 9, cpl: 19.03 },
  { dia: '14/07', investido: 100.74, impressoes: 9191, ctr: 1.75, leads: 7, cpl: 14.39 },
  { dia: '15/07', investido: 152.71, impressoes: 15754, ctr: 1.45, leads: 19, cpl: 8.04 },
  { dia: '16/07', investido: 160.52, impressoes: 15301, ctr: 1.42, leads: 14, cpl: 11.47 },
  { dia: '17/07', investido: 161.20, impressoes: 12698, ctr: 1.61, leads: 8, cpl: 20.15 },
  { dia: '18/07', investido: 267.52, impressoes: 19146, ctr: 1.78, leads: 20, cpl: 13.38 },
  { dia: '19/07', investido: 324.97, impressoes: 23357, ctr: 1.63, leads: 16, cpl: 20.31 },
  { dia: '20/07', investido: 240.60, impressoes: 21025, ctr: 1.49, leads: 21, cpl: 11.46 },
  { dia: '21/07', investido: 287.81, impressoes: 34307, ctr: 1.01, leads: 17, cpl: 16.93 },
  { dia: '22/07', investido: 240.42, impressoes: 28513, ctr: 0.87, leads: 7, cpl: 34.35 },
  { dia: '23/07', investido: 241.36, impressoes: 27427, ctr: 0.97, leads: 6, cpl: 40.23 },
  { dia: '24/07', investido: 243.90, impressoes: 27492, ctr: 1.08, leads: 7, cpl: 34.84 },
  { dia: '25/07', investido: 112.30, impressoes: 11796, ctr: 1.07, leads: 3, cpl: 37.43, parcial: true },
]

const plataformas = [
  { nome: 'Instagram', investido: 2277.81, impressoes: 224493, cliques: 2395, ctr: 1.07, leads: 125, cpl: 18.22 },
  { nome: 'Facebook', investido: 427.53, impressoes: 31529, cliques: 852, ctr: 2.70, leads: 29, cpl: 14.74 },
]

const idades = [
  { faixa: '18-24', investido: 513.35, impressoes: 90692, cliques: 799, ctr: 0.88, leads: 28, cpl: 18.33 },
  { faixa: '25-34', investido: 665.63, impressoes: 81378, cliques: 854, ctr: 1.05, leads: 35, cpl: 19.02 },
  { faixa: '35-44', investido: 621.21, impressoes: 44753, cliques: 669, ctr: 1.49, leads: 34, cpl: 18.27 },
  { faixa: '45-54', investido: 425.10, impressoes: 21729, cliques: 468, ctr: 2.15, leads: 28, cpl: 15.18 },
  { faixa: '55-64', investido: 277.53, impressoes: 11285, cliques: 279, ctr: 2.47, leads: 15, cpl: 18.50 },
  { faixa: '65+', investido: 202.09, impressoes: 6144, cliques: 178, ctr: 2.90, leads: 14, cpl: 14.44 },
]

const regioes = [
  { nome: 'Mato Grosso do Sul', investido: 2698.56, impressoes: 255346, ctr: 1.27 },
  { nome: 'Amambay (Paraguai)', investido: 1.26, impressoes: 210, ctr: 0.95 },
  { nome: 'Não identificado', investido: 5.52, impressoes: 466, ctr: 1.50 },
]

const conjuntos = [
  { nome: 'CORTE PERPÉTUO', orcamento: 300, investido: 2385.57, impressoes: 234669, ctr: 1.26, leads: 142, cpl: 16.80 },
  { nome: 'CORTE PERPÉTUO — FLYER DO LEILÃO', orcamento: 150, investido: 319.77, impressoes: 21353, ctr: 1.32, leads: 12, cpl: 26.65 },
]

const criativos = [
  { nome: 'CORTE PERPÉTUO — 03', investido: 78.57, impressoes: 5342, ctr: 1.44, leads: 8, cpl: 9.82, video75: 213 },
  { nome: 'CORTE PERPÉTUO — 06', investido: 1023.84, impressoes: 105370, ctr: 1.41, leads: 73, cpl: 14.03, video75: 3018 },
  { nome: 'CORTE PERPÉTUO — 02', investido: 48.57, impressoes: 3709, ctr: 1.16, leads: 3, cpl: 16.19, video75: 115 },
  { nome: 'CORTE PERPÉTUO — 07', investido: 269.07, impressoes: 25145, ctr: 1.11, leads: 14, cpl: 19.22, video75: 1454 },
  { nome: 'CORTE PERPÉTUO — 05', investido: 814.81, impressoes: 84348, ctr: 1.12, leads: 40, cpl: 20.37, video75: 4156 },
  { nome: 'CORTE PERPÉTUO — 04', investido: 52.47, impressoes: 4499, ctr: 0.84, leads: 2, cpl: 26.24, video75: 78 },
  { nome: 'CORTE PERPÉTUO — 05 (flyer)', investido: 319.77, impressoes: 21353, ctr: 1.32, leads: 12, cpl: 26.65, video75: 547 },
  { nome: 'CORTE PERPÉTUO — 01', investido: 98.24, impressoes: 6256, ctr: 1.52, leads: 2, cpl: 49.12, video75: 172 },
]

const criativosTouros = [
  { nome: 'video-perpetuo-touro03', investido: 128.98, impressoes: 6932, alcance: 5704, ctr: 2.70, cpm: 18.61 },
  { nome: 'video-perpetuo-touro02', investido: 64.03, impressoes: 3315, alcance: 2678, ctr: 1.87, cpm: 19.32 },
  { nome: 'video-perpetuo-touro01', investido: 44.08, impressoes: 2347, alcance: 1939, ctr: 2.13, cpm: 18.78 },
]

const vencidas = [
  { nome: 'MARCA 15 - RECONHECIMENTO', fim: '30/06/2026', obs: 'R$ 372,19 · CPM R$ 1,62 · CTR 0,23%' },
  { nome: 'CORTE PERPÉTUO (a 1ª, de junho)', fim: '03/07/2026', obs: 'R$ 1.227,53 · CTR 1,45%' },
  { nome: '20/06 - RIO BONITO - TOUROS', fim: '20/06/2026', obs: 'sem entrega no período' },
  { nome: '11/06 l TRESMAR', fim: '11/06/2026', obs: 'sem entrega no período' },
  { nome: '+ ~60 campanhas de leilões passados', fim: 'nov/25 a jun/26', obs: 'rótulo ACTIVE, data-fim vencida' },
]

const semEntrega = [
  { nome: 'FB Atacanta-da-Matinha', orcamento: 20 },
  { nome: 'FB - funil whatsapp', orcamento: 20 },
  { nome: 'FB - funil whatsapp - TESTE', orcamento: 15 },
]

// ---------------------------------------------------------------------------
// 2) Derivados
// ---------------------------------------------------------------------------

const r2 = (v) => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pct = (v, d = 2) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`
const dec = (v, d = 2) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const faseBoa = diario.slice(0, 9)
const faseRuim = diario.slice(9)
const somaFase = (linhas) => {
  const investido = r2(linhas.reduce((a, l) => a + l.investido, 0))
  const leads = linhas.reduce((a, l) => a + l.leads, 0)
  return { investido, leads, cpl: r2(investido / leads) }
}
const boa = somaFase(faseBoa)
const ruim = somaFase(faseRuim)
const pioraCpl = r2(ruim.cpl / boa.cpl)

const totalIdade = r2(idades.reduce((a, i) => a + i.investido, 0))
const jovens = idades.slice(0, 2)
const investJovens = r2(jovens.reduce((a, i) => a + i.investido, 0))
const shareJovens = r2((investJovens / totalIdade) * 100)
const maduros = idades.slice(3)
const investMaduros = r2(maduros.reduce((a, i) => a + i.investido, 0))
const shareMaduros = r2((investMaduros / totalIdade) * 100)

const shareInstagram = r2((plataformas[0].investido / principal.investido) * 100)
const shareFacebook = r2((plataformas[1].investido / principal.investido) * 100)
const shareLeadsFacebook = r2((plataformas[1].leads / principal.leads) * 100)
const vantagemCtrFb = r2(plataformas[1].ctr / plataformas[0].ctr)
const vantagemCplFb = r2((1 - plataformas[1].cpl / plataformas[0].cpl) * 100)

const share06Verba = r2((criativos[1].investido / principal.investido) * 100)
const share06Leads = r2((criativos[1].leads / principal.leads) * 100)
const shareMs = r2((regioes[0].investido / principal.investido) * 100)
const totalPar = r2(principal.investido + touros.investido)
const taxaConvTouros = r2((touros.resultados / touros.cliques) * 100)
const ganhoCtrTouros = r2((touros.ctr / principal.ctr - 1) * 100)
const orcamentoDiaConjuntos = conjuntos.reduce((a, c) => a + c.orcamento, 0)
const entregaMediaDia = r2(diario.slice(0, 12).reduce((a, l) => a + l.investido, 0) / 12)

// ---------------------------------------------------------------------------
// 3) Paleta e gráficos (SVG inline)
// ---------------------------------------------------------------------------

const C = {
  black: '#171717',
  charcoal: '#242424',
  gold: '#C5A34C',
  gray: '#666666',
  midGray: '#9a9a9a',
  line: '#e2e2e2',
  paleGray: '#f3f3f3',
  white: '#ffffff',
}

function graficoDiario() {
  const W = 1040, H = 340
  const left = 62, right = 62, top = 34, bottom = 46
  const w = W - left - right
  const h = H - top - bottom
  const maxLeads = 24
  const maxCpl = 45
  const stepX = w / (diario.length - 1)
  const x = (i) => left + stepX * i
  const yL = (v) => top + h - (v / maxLeads) * h
  const yC = (v) => top + h - (v / maxCpl) * h

  let grid = ''
  for (let i = 0; i <= 4; i += 1) {
    const yy = top + (h * i) / 4
    grid += `<line x1="${left}" y1="${yy}" x2="${W - right}" y2="${yy}" stroke="${C.line}"/>`
    grid += `<text x="${left - 10}" y="${yy + 4}" text-anchor="end" font-size="11" fill="${C.gray}">${Math.round(maxLeads * (4 - i) / 4)}</text>`
    grid += `<text x="${W - right + 10}" y="${yy + 4}" font-size="11" fill="${C.gray}">${Math.round(maxCpl * (4 - i) / 4)}</text>`
  }

  const barW = Math.min(34, stepX * 0.5)
  const barras = diario.map((l, i) => {
    const yy = yL(l.leads)
    const fill = l.parcial ? C.midGray : C.charcoal
    return `<rect x="${x(i) - barW / 2}" y="${yy}" width="${barW}" height="${top + h - yy}" fill="${fill}" rx="1.5"/>
      <text x="${x(i)}" y="${yy - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="${C.charcoal}">${l.leads}</text>`
  }).join('')

  const linha = diario.map((l, i) => `${x(i)},${yC(l.cpl)}`).join(' ')
  const pontos = diario.map((l, i) => `<circle cx="${x(i)}" cy="${yC(l.cpl)}" r="4" fill="${C.gold}" stroke="${C.white}" stroke-width="1.4"/>`).join('')
  const rotulos = diario.map((l, i) => `<text x="${x(i)}" y="${H - 26}" text-anchor="middle" font-size="11" fill="${C.gray}">${l.dia}</text>`).join('')

  // Faixa da fase de saturação (22/07 em diante)
  const inicioRuim = x(9) - stepX / 2
  const faixa = `<rect x="${inicioRuim}" y="${top}" width="${W - right - inicioRuim}" height="${h}" fill="${C.gold}" opacity="0.09"/>
    <text x="${(inicioRuim + W - right) / 2}" y="${top + 16}" text-anchor="middle" font-size="11" font-weight="700" fill="${C.gold}">SATURAÇÃO</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">
    <rect width="100%" height="100%" fill="${C.white}"/>
    <text x="${left}" y="18" font-size="13" font-weight="700" fill="${C.black}" letter-spacing="0.6">LEADS POR DIA (BARRAS) E CUSTO POR LEAD (LINHA)</text>
    ${faixa}${grid}${barras}
    <polyline points="${linha}" fill="none" stroke="${C.gold}" stroke-width="2.6"/>
    ${pontos}${rotulos}
    <text x="${left - 10}" y="${top - 10}" text-anchor="end" font-size="10" fill="${C.gray}">leads</text>
    <text x="${W - right + 10}" y="${top - 10}" font-size="10" fill="${C.gray}">R$/lead</text>
  </svg>`
}

function graficoIdade() {
  const W = 1040, H = 300
  const left = 62, right = 30, top = 34, bottom = 58
  const w = W - left - right
  const h = H - top - bottom
  const maxInvest = 700
  const maxCtr = 3.2
  const groupW = w / idades.length
  const barW = groupW * 0.34
  const yI = (v) => top + h - (v / maxInvest) * h
  const yT = (v) => top + h - (v / maxCtr) * h

  let grid = ''
  for (let i = 0; i <= 4; i += 1) {
    const yy = top + (h * i) / 4
    grid += `<line x1="${left}" y1="${yy}" x2="${W - right}" y2="${yy}" stroke="${C.line}"/>`
    grid += `<text x="${left - 10}" y="${yy + 4}" text-anchor="end" font-size="11" fill="${C.gray}">${int(maxInvest * (4 - i) / 4)}</text>`
  }

  // Rótulo de valor DENTRO da barra: fora, colide com os pontos de CTR.
  const barras = idades.map((f, i) => {
    const cx = left + groupW * i + groupW / 2
    const yy = yI(f.investido)
    return `<rect x="${cx - barW / 2}" y="${yy}" width="${barW}" height="${top + h - yy}" fill="${C.charcoal}" rx="1.5"/>
      <text x="${cx}" y="${yy + 16}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${C.white}">${brl(f.investido).replace('R$ ', '')}</text>
      <text x="${cx}" y="${H - 30}" text-anchor="middle" font-size="12" font-weight="700" fill="${C.black}">${f.faixa}</text>
      <text x="${cx}" y="${H - 14}" text-anchor="middle" font-size="10.5" fill="${C.gray}">CTR ${pct(f.ctr)} · ${brl(f.cpl)}/lead</text>`
  }).join('')

  const pontos = idades.map((f, i) => {
    const cx = left + groupW * i + groupW / 2
    return `<circle cx="${cx}" cy="${yT(f.ctr)}" r="4.5" fill="${C.gold}" stroke="${C.white}" stroke-width="1.4"/>`
  }).join('')
  const linha = idades.map((f, i) => `${left + groupW * i + groupW / 2},${yT(f.ctr)}`).join(' ')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">
    <rect width="100%" height="100%" fill="${C.white}"/>
    <text x="${left}" y="18" font-size="13" font-weight="700" fill="${C.black}" letter-spacing="0.6">INVESTIMENTO POR FAIXA DE IDADE (BARRAS) E CTR (LINHA)</text>
    ${grid}
    <polyline points="${linha}" fill="none" stroke="${C.gold}" stroke-width="2.4" stroke-dasharray="5 3"/>
    ${barras}${pontos}
  </svg>`
}

function graficoCriativos() {
  const ordenado = [...criativos].sort((a, b) => a.cpl - b.cpl)
  const W = 1040, H = 300
  const left = 235, right = 150, top = 34, bottom = 26
  const w = W - left - right
  const rowH = (H - top - bottom) / ordenado.length
  const maxCpl = 52
  const media = principal.cpl

  const linhaMedia = left + (media / maxCpl) * w
  const barras = ordenado.map((c, i) => {
    const yy = top + rowH * i + rowH * 0.18
    const bh = rowH * 0.56
    const bw = (c.cpl / maxCpl) * w
    const destaque = c.cpl <= media
    // Contagem de leads em coluna fixa à direita — acompanhando a barra, colava no valor.
    return `<text x="${left - 12}" y="${yy + bh / 2 + 4}" text-anchor="end" font-size="11.5" fill="${C.black}">${esc(c.nome)}</text>
      <rect x="${left}" y="${yy}" width="${bw}" height="${bh}" fill="${destaque ? C.charcoal : C.midGray}" rx="1.5"/>
      <text x="${left + bw + 8}" y="${yy + bh / 2 + 4}" font-size="11" font-weight="700" fill="${C.charcoal}">${brl(c.cpl)}</text>
      <text x="${W - 14}" y="${yy + bh / 2 + 4}" text-anchor="end" font-size="10.5" fill="${C.gray}">${c.leads} leads</text>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">
    <rect width="100%" height="100%" fill="${C.white}"/>
    <text x="16" y="18" font-size="13" font-weight="700" fill="${C.black}" letter-spacing="0.6">CUSTO POR LEAD DE CADA CRIATIVO</text>
    <line x1="${linhaMedia}" y1="${top - 4}" x2="${linhaMedia}" y2="${H - bottom}" stroke="${C.gold}" stroke-width="1.6" stroke-dasharray="4 3"/>
    <text x="${linhaMedia + 6}" y="${top - 8}" font-size="10.5" font-weight="700" fill="${C.gold}">média ${brl(media)}</text>
    ${barras}
  </svg>`
}

// ---------------------------------------------------------------------------
// 4) HTML
// ---------------------------------------------------------------------------

const kpi = (rotulo, valor, nota) => `
  <div class="kpi">
    <div class="kpi-rotulo">${esc(rotulo)}</div>
    <div class="kpi-valor">${valor}</div>
    ${nota ? `<div class="kpi-nota">${nota}</div>` : ''}
  </div>`

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Relatório Meta Ads — Campanhas Ativas — 25/07/2026</title>
<style>
  @page { size: A4; margin: 14mm 13mm 16mm 13mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: Arial, Helvetica, sans-serif; color: ${C.black};
    font-size: 10.5pt; line-height: 1.5;
  }
  h1, h2, h3 { font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin: 0; }
  .capa { background: ${C.black}; color: ${C.white}; padding: 22px 24px 20px; margin-bottom: 4px; }
  .capa h1 { font-size: 23pt; line-height: 1.12; letter-spacing: 0.04em; }
  .capa .sub { color: #c9c9c9; font-size: 10pt; margin-top: 8px; text-transform: none; letter-spacing: 0; }
  .regua { height: 4px; background: ${C.gold}; margin-bottom: 20px; }
  h2 {
    font-size: 12.5pt; border-bottom: 2px solid ${C.black}; padding-bottom: 5px;
    margin: 26px 0 12px;
  }
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
  thead th {
    background: ${C.charcoal}; color: ${C.white}; font-size: 8.2pt; text-transform: uppercase;
    letter-spacing: 0.06em; padding: 7px 8px; text-align: right; font-weight: 700;
  }
  thead th:first-child { text-align: left; }
  tbody td { padding: 6px 8px; text-align: right; border-bottom: 1px solid ${C.line}; }
  tbody td:first-child { text-align: left; }
  tbody tr:nth-child(even) { background: ${C.paleGray}; }
  tbody tr.total td { font-weight: 700; border-top: 2px solid ${C.black}; border-bottom: none; background: ${C.white}; }
  tbody tr.marcada { background: #faf5e6; }
  tbody tr.marcada td:first-child { box-shadow: inset 3px 0 0 ${C.gold}; }
  .grafico { border: 1px solid ${C.line}; padding: 10px 8px 4px; margin: 10px 0 14px; }
  .caixa { border: 1px solid ${C.black}; border-left: 5px solid ${C.gold}; padding: 11px 14px; margin: 12px 0; }
  .caixa h3 { margin-top: 0; }
  .caixa p:last-child { margin-bottom: 0; }
  ol, ul { margin: 0 0 10px; padding-left: 20px; }
  li { margin-bottom: 5px; }
  .duas { display: flex; gap: 16px; }
  .duas > div { flex: 1; }
  .rodape { margin-top: 22px; padding-top: 9px; border-top: 1px solid ${C.line}; font-size: 8.4pt; color: ${C.gray}; }
  .quebra { page-break-before: always; }
  .evita-quebra { page-break-inside: avoid; }
  .selo {
    display: inline-block; font-size: 7.8pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; padding: 2px 7px; border: 1px solid currentColor;
  }
  .selo.encerrada { color: ${C.gray}; }
  .selo.rodando { color: ${C.black}; background: ${C.gold}; border-color: ${C.gold}; }
  .nota-fonte { font-size: 8.6pt; color: ${C.gray}; margin: -4px 0 12px; }
</style>
</head>
<body>

<div class="capa">
  <h1>Relatório Meta Ads<br>Campanhas em curso</h1>
  <div class="sub">
    Bula Assessoria · extração de <strong>25/07/2026, 12h26</strong> (horário MS)<br>
    Fonte: conector oficial do Meta Ads — varredura das 5 contas de anúncio acessíveis
  </div>
</div>
<div class="regua"></div>

<h2>1 · Resumo executivo</h2>

<p class="lede">
  Há <strong>duas campanhas entregando</strong> no momento da extração, ambas do leilão
  <strong>CORTE PERPÉTUO</strong>. Juntas somam <strong>${brl(totalPar)}</strong> investidos.
</p>

<table>
  <thead>
    <tr><th>Campanha</th><th>Conta</th><th>Período</th><th>Investido</th><th>Leads</th><th>Custo/lead</th><th style="text-align:center">Situação</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>${esc(principal.nome)}</strong></td><td>CA1</td>
      <td>13/07 → 25/07 10h36</td><td>${brl(principal.investido)}</td>
      <td>${principal.leads}</td><td>${brl(principal.cpl)}</td>
      <td style="text-align:center"><span class="selo encerrada">encerrada 10h36</span></td>
    </tr>
    <tr>
      <td><strong>${esc(touros.nome)}</strong></td><td>CA2</td>
      <td>24/07 13h51 → aberta</td><td>${brl(touros.investido)}</td>
      <td>1 MQL</td><td>${brl(touros.custoResultado)}</td>
      <td style="text-align:center"><span class="selo rodando">rodando agora</span></td>
    </tr>
    <tr class="total"><td>Total</td><td></td><td></td><td>${brl(totalPar)}</td><td>—</td><td>—</td><td></td></tr>
  </tbody>
</table>

<div class="caixa">
  <h3>Os três pontos que mudam decisão</h3>
  <p><strong>1. A campanha principal venceu hoje às 10h36.</strong> A data-fim era 25/07 10h36 e o relógio
  já passou (extração 12h26). Ela segue marcada como ativa no painel, mas não entrega mais. Se a captação do
  CORTE PERPÉTUO continua, <strong>não há campanha de volume no ar</strong> — só a de touros, que subiu ontem
  com verba pequena.</p>
  <p><strong>2. Saturação de público na segunda semana.</strong> A frequência chegou a
  <strong>${dec(principal.frequencia)}</strong> (cada pessoa viu o anúncio ~4x) e o custo por lead saiu de
  <strong>${brl(boa.cpl)}</strong> (13–21/07) para <strong>${brl(ruim.cpl)}</strong> (22–25/07) —
  <strong>${dec(pioraCpl, 1)}x mais caro</strong>. Segmentação de ${pct(shareMs, 1)} em um único estado.</p>
  <p><strong>3. A campanha de touros ainda não tem leitura confiável.</strong> 1 MQL em ${brl(touros.investido)}
  e 12 horas de vida. O CTR de ${pct(touros.ctr)} é ${dec(ganhoCtrTouros, 0)}% melhor que o da campanha de corte,
  mas a conversão precisa de conferência antes de escalar.</p>
</div>

<h2>2 · Campanha principal · ${esc(principal.nome)}</h2>
<p class="nota-fonte">
  ID ${principal.id} · Conta ${esc(principal.conta)} · ${esc(principal.objetivo)} ·
  lance ${esc(principal.lance)} · veiculação ${principal.inicio} → ${principal.fim} (12 dias)
</p>

<div class="kpis">
  ${kpi('Investido', brl(principal.investido))}
  ${kpi('Leads', int(principal.leads), 'formulário instantâneo')}
  ${kpi('Custo por lead', brl(principal.cpl))}
  ${kpi('Frequência', dec(principal.frequencia), 'público saturado')}
</div>
<div class="kpis">
  ${kpi('Impressões', int(principal.impressoes))}
  ${kpi('Alcance', int(principal.alcance), 'pessoas únicas')}
  ${kpi('CTR', pct(principal.ctr))}
  ${kpi('CPC', brl(principal.cpc))}
  ${kpi('CPM', brl(principal.cpm))}
</div>

<p>CPM de ${brl(principal.cpm)} e CPC de ${brl(principal.cpc)} são números saudáveis para o nicho — o gargalo
não é o preço da mídia, é a <strong>conversão em lead na segunda metade do período</strong>.
Ainda: ${int(principal.engajamentos)} engajamentos com a publicação e ${int(principal.video75)} visualizações
de vídeo até 75%.</p>

<h3>2.1 · Onde a campanha quebrou</h3>
<div class="grafico evita-quebra">${graficoDiario()}</div>

<table class="evita-quebra">
  <thead>
    <tr><th>Dia</th><th>Investido</th><th>Impressões</th><th>CTR</th><th>Leads</th><th>Custo/lead</th></tr>
  </thead>
  <tbody>
    ${diario.map((l) => `<tr${l.cpl >= 30 ? ' class="marcada"' : ''}>
      <td>${l.dia}${l.parcial ? ' <span style="color:#666">(parcial)</span>' : ''}</td>
      <td>${brl(l.investido)}</td><td>${int(l.impressoes)}</td>
      <td>${pct(l.ctr)}</td><td>${l.leads}</td><td>${brl(l.cpl)}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td>${brl(principal.investido)}</td><td>${int(principal.impressoes)}</td>
      <td>${pct(principal.ctr)}</td><td>${principal.leads}</td><td>${brl(principal.cpl)}</td></tr>
  </tbody>
</table>

<div class="caixa evita-quebra">
  <h3>O padrão é inequívoco</h3>
  <p><strong>Fase boa (13–21/07):</strong> ${boa.leads} leads em ${brl(boa.investido)} → <strong>${brl(boa.cpl)}/lead</strong>.<br>
  <strong>Fase ruim (22–25/07):</strong> ${ruim.leads} leads em ${brl(ruim.investido)} → <strong>${brl(ruim.cpl)}/lead</strong>.</p>
  <p>O que mudou: as impressões diárias <em>subiram</em> (de ~15 mil para ~28 mil) enquanto o CTR <em>caiu</em>
  (de 1,6% para 0,9%). Essa é a assinatura de <strong>exaustão de público</strong> — o algoritmo passou a repetir
  o anúncio para quem já tinha visto, em vez de encontrar gente nova. A frequência de
  ${dec(principal.frequencia)} confirma.</p>
</div>

<div class="quebra"></div>

<h3>2.2 · Plataforma — o Instagram levou a verba, o Facebook converteu melhor</h3>
<table>
  <thead>
    <tr><th>Plataforma</th><th>Investido</th><th>% verba</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>Leads</th><th>Custo/lead</th></tr>
  </thead>
  <tbody>
    <tr><td>Instagram</td><td>${brl(plataformas[0].investido)}</td><td>${pct(shareInstagram, 1)}</td>
      <td>${int(plataformas[0].impressoes)}</td><td>${int(plataformas[0].cliques)}</td>
      <td>${pct(plataformas[0].ctr)}</td><td>${plataformas[0].leads}</td><td>${brl(plataformas[0].cpl)}</td></tr>
    <tr class="marcada"><td><strong>Facebook</strong></td><td>${brl(plataformas[1].investido)}</td><td>${pct(shareFacebook, 1)}</td>
      <td>${int(plataformas[1].impressoes)}</td><td>${int(plataformas[1].cliques)}</td>
      <td><strong>${pct(plataformas[1].ctr)}</strong></td><td>${plataformas[1].leads}</td>
      <td><strong>${brl(plataformas[1].cpl)}</strong></td></tr>
    <tr class="total"><td>Total</td><td>${brl(principal.investido)}</td><td>100,0%</td>
      <td>${int(principal.impressoes)}</td><td>${int(principal.cliques)}</td>
      <td>${pct(principal.ctr)}</td><td>${principal.leads}</td><td>${brl(principal.cpl)}</td></tr>
  </tbody>
</table>
<p>Com apenas ${pct(shareFacebook, 1)} da verba, o Facebook entregou CTR <strong>${dec(vantagemCtrFb, 1)}x melhor</strong>
e lead <strong>${dec(vantagemCplFb, 0)}% mais barato</strong> — ${shareLeadsFacebook.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
dos leads. Vale testar uma divisão mais equilibrada, ou um conjunto exclusivo de Facebook, no próximo leilão.</p>

<h3>2.3 · Faixa de idade — o dinheiro foi para o público errado</h3>
<div class="grafico evita-quebra">${graficoIdade()}</div>

<table class="evita-quebra">
  <thead>
    <tr><th>Idade</th><th>Investido</th><th>% verba</th><th>Impressões</th><th>CTR</th><th>Leads</th><th>Custo/lead</th></tr>
  </thead>
  <tbody>
    ${idades.map((f) => `<tr${f.ctr <= 1.05 ? ' class="marcada"' : ''}>
      <td>${f.faixa}</td><td>${brl(f.investido)}</td>
      <td>${pct((f.investido / totalIdade) * 100, 1)}</td><td>${int(f.impressoes)}</td>
      <td>${pct(f.ctr)}</td><td>${f.leads}</td><td>${brl(f.cpl)}</td></tr>`).join('')}
  </tbody>
</table>

<div class="caixa evita-quebra">
  <h3>Ação sugerida</h3>
  <p><strong>${pct(shareJovens, 1)} da verba (${brl(investJovens)}) foi para 18–34 anos</strong> — a faixa com o
  pior CTR (0,88%–1,05%) e o pior custo por lead. Já 45+ recebeu ${pct(shareMaduros, 1)} (${brl(investMaduros)})
  com CTR de 2 a 3x maior e o lead mais barato da campanha (${brl(idades[5].cpl)} no 65+).</p>
  <p>Para comprador de gado isso faz sentido: quem tem inscrição estadual e capital para habilitar num leilão
  está em 40+. <strong>No próximo leilão, restringir a faixa para 30+ ou 35+.</strong> Só realocando a verba de
  18–24 (${brl(idades[0].investido)}) para o desempenho de 45+, sairiam ~34 leads em vez de 28 — e mais qualificados.</p>
</div>

<h3>2.4 · Região</h3>
<table>
  <thead><tr><th>Região</th><th>Investido</th><th>% verba</th><th>Impressões</th><th>CTR</th></tr></thead>
  <tbody>
    ${regioes.map((r) => `<tr><td>${esc(r.nome)}</td><td>${brl(r.investido)}</td>
      <td>${pct((r.investido / principal.investido) * 100, 2)}</td><td>${int(r.impressoes)}</td>
      <td>${pct(r.ctr)}</td></tr>`).join('')}
  </tbody>
</table>
<p>Segmentação praticamente exclusiva de MS (${pct(shareMs, 1)}). É essa concentração que produziu frequência
de ${dec(principal.frequencia)} em 12 dias. <strong>Ampliar para MT, GO e interior de SP</strong> é o caminho mais
direto para derrubar o custo por lead em campanha longa.</p>

<div class="quebra"></div>

<h3>2.5 · Conjuntos de anúncios</h3>
<table>
  <thead>
    <tr><th>Conjunto</th><th>Orçamento/dia</th><th>Investido</th><th>Impressões</th><th>CTR</th><th>Leads</th><th>Custo/lead</th></tr>
  </thead>
  <tbody>
    ${conjuntos.map((c) => `<tr><td>${esc(c.nome)}</td><td>${brl(c.orcamento)}</td>
      <td>${brl(c.investido)}</td><td>${int(c.impressoes)}</td><td>${pct(c.ctr)}</td>
      <td>${c.leads}</td><td>${brl(c.cpl)}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td>${brl(orcamentoDiaConjuntos)}</td><td>${brl(principal.investido)}</td>
      <td>${int(principal.impressoes)}</td><td>${pct(principal.ctr)}</td><td>${principal.leads}</td>
      <td>${brl(principal.cpl)}</td></tr>
  </tbody>
</table>
<p>O conjunto de flyer estático custa <strong>59% mais por lead</strong> que o de vídeo
(${brl(conjuntos[1].cpl)} contra ${brl(conjuntos[0].cpl)}). E há um sinal de público estreito: orçamento diário
somado de ${brl(orcamentoDiaConjuntos)}, mas entrega real média de ${brl(entregaMediaDia)}/dia — a campanha
<strong>nunca gastou o teto configurado</strong>.</p>

<h3>2.6 · Criativos</h3>
<div class="grafico evita-quebra">${graficoCriativos()}</div>

<table class="evita-quebra">
  <thead>
    <tr><th>Criativo</th><th>Investido</th><th>Impressões</th><th>CTR</th><th>Leads</th><th>Custo/lead</th><th>Vídeo 75%</th></tr>
  </thead>
  <tbody>
    ${criativos.map((c) => `<tr${c.cpl <= 14.5 || c.cpl >= 40 ? ' class="marcada"' : ''}>
      <td>${esc(c.nome)}</td><td>${brl(c.investido)}</td><td>${int(c.impressoes)}</td>
      <td>${pct(c.ctr)}</td><td>${c.leads}</td><td>${brl(c.cpl)}</td><td>${int(c.video75)}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td>${brl(principal.investido)}</td><td>${int(principal.impressoes)}</td>
      <td>${pct(principal.ctr)}</td><td>${principal.leads}</td><td>${brl(principal.cpl)}</td>
      <td>${int(principal.video75)}</td></tr>
  </tbody>
</table>

<ul>
  <li><strong>Criativo 06 carregou a campanha:</strong> ${pct(share06Verba, 0)} da verba e
  <strong>${pct(share06Leads, 0)} dos leads</strong>, com custo por lead 20% abaixo da média. É o modelo a replicar.</li>
  <li><strong>Criativo 03 teve o melhor custo por lead</strong> (${brl(criativos[0].cpl)}) e recebeu só
  ${brl(criativos[0].investido)} — <strong>nunca foi escalado</strong>. Vale reativar com verba real.</li>
  <li><strong>Criativo 01 é o pior da lista</strong> (${brl(criativos[7].cpl)}/lead, 2,8x a média) e ainda consumiu
  ${brl(criativos[7].investido)}. Deveria ter sido cortado nos primeiros dias.</li>
  <li><strong>Criativo 05 prende atenção mas não converte:</strong> melhor retenção de vídeo da campanha
  (${int(criativos[4].video75)} visualizações a 75%) e custo por lead de ${brl(criativos[4].cpl)}. O problema
  está na chamada final, não no conteúdo.</li>
</ul>

<div class="quebra"></div>

<h2>3 · Campanha em curso agora · ${esc(touros.nome)}</h2>
<p class="nota-fonte">
  ID ${touros.id} · Conta ${esc(touros.conta)} · ${esc(touros.objetivo)} ·
  início ${touros.inicio} · ${esc(touros.fim)}
</p>

<div class="kpis">
  ${kpi('Investido', brl(touros.investido), '24–25/07')}
  ${kpi('Impressões', int(touros.impressoes))}
  ${kpi('Alcance', int(touros.alcance))}
  ${kpi('Cliques', int(touros.cliques))}
</div>
<div class="kpis">
  ${kpi('CTR', pct(touros.ctr), `${dec(ganhoCtrTouros, 0)}% acima da campanha de corte`)}
  ${kpi('CPC', brl(touros.cpc))}
  ${kpi('CPM', brl(touros.cpm), 'fase de aprendizado')}
  ${kpi('MQL Perpétuo Touros', String(touros.resultados), `${brl(touros.custoResultado)} por resultado`)}
</div>

<h3>3.1 · Criativos</h3>
<table>
  <thead><tr><th>Criativo</th><th>Investido</th><th>Impressões</th><th>Alcance</th><th>CTR</th><th>CPM</th></tr></thead>
  <tbody>
    ${criativosTouros.map((c) => `<tr${c.ctr >= 2.7 ? ' class="marcada"' : ''}>
      <td>${esc(c.nome)}</td><td>${brl(c.investido)}</td><td>${int(c.impressoes)}</td>
      <td>${int(c.alcance)}</td><td>${pct(c.ctr)}</td><td>${brl(c.cpm)}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td>${brl(touros.investido)}</td><td>${int(touros.impressoes)}</td>
      <td>${int(touros.alcance)}</td><td>${pct(touros.ctr)}</td><td>${brl(touros.cpm)}</td></tr>
  </tbody>
</table>

<p>O CTR de ${pct(touros.ctr)} é <strong>${dec(ganhoCtrTouros, 0)}% melhor</strong> que o da campanha de corte
(${pct(principal.ctr)}) — o criativo de touro está prendendo mais. O CPM está mais caro
(${brl(touros.cpm)} contra ${brl(principal.cpm)}), o que é esperado em campanha nova em aprendizado.</p>

<div class="caixa">
  <h3>Ponto de atenção — conferir antes de mexer na mídia</h3>
  <p>1 MQL em ${int(touros.cliques)} cliques dá taxa de <strong>${pct(taxaConvTouros)}</strong>. Como a otimização
  é por <strong>conversão de pixel</strong> (o Page View na página de obrigado do MQL) e não por formulário
  instantâneo, o caminho é mais longo: o lead sai do Instagram, chega na landing, preenche e precisa ver a página
  de obrigado. Duas leituras possíveis:</p>
  <p><strong>a) É só o tempo de aprendizado</strong> — 12h de vida e verba baixa. Normal; deixar rodar.<br>
  <strong>b) A conversão não está disparando</strong> — ${pct(taxaConvTouros)} é baixo até para funil de landing
  page. Vale abrir o Gerenciador de Eventos e confirmar se o evento "MQL Perpetuo Touros" recebe disparos
  consistentes.</p>
</div>

<h2>4 · Higiene das contas</h2>

<h3>4.1 · Campanhas marcadas ATIVAS que não entregam mais (CA1)</h3>
<table>
  <thead><tr><th>Campanha</th><th style="text-align:left">Data-fim</th><th style="text-align:left">Observação</th></tr></thead>
  <tbody>
    ${vencidas.map((c) => `<tr><td>${esc(c.nome)}</td><td style="text-align:left">${esc(c.fim)}</td>
      <td style="text-align:left">${esc(c.obs)}</td></tr>`).join('')}
  </tbody>
</table>
<p>São mais de 60 campanhas de leilões antigos com o rótulo ativo. Não gastam — a data-fim as trava — mas tornam
impossível responder "o que está rodando?" olhando o painel. <strong>Sugestão: pausar em lote tudo com data-fim
anterior a julho/2026.</strong></p>

<h3>4.2 · Campanhas ativas com orçamento e zero entrega (conta "Bula 1")</h3>
<table>
  <thead><tr><th>Campanha</th><th>Orçamento/dia</th><th>Entrega em 30 dias</th></tr></thead>
  <tbody>
    ${semEntrega.map((c) => `<tr><td>${esc(c.nome)}</td><td>${brl(c.orcamento)}</td>
      <td><strong>nenhuma</strong></td></tr>`).join('')}
    <tr class="total"><td>Total</td><td>${brl(semEntrega.reduce((a, c) => a + c.orcamento, 0))}</td><td>—</td></tr>
  </tbody>
</table>
<p>Três campanhas ativas, sem data-fim, com ${brl(55)}/dia de orçamento configurado e <strong>nenhuma impressão
registrada em 30 dias</strong>. Ou os conjuntos internos estão pausados, ou há rejeição de anúncio / problema de
público. Pode ser um funil de WhatsApp que alguém acha que está rodando e não está.</p>

<h3>4.3 · Notas de acesso</h3>
<ul>
  <li><strong>Conta 1603176774089465</strong> — conector ainda não liberado pela Meta (rollout gradual). Não consultável.</li>
  <li><strong>Contas 815770516188193 e "Formula do Boi!" (1630761758131744)</strong> — sem campanha ativa. A conta
  Fórmula do Boi está sem nada no ar.</li>
</ul>

<div class="quebra"></div>

<h2>5 · Recomendações</h2>

<h3>Imediato — hoje</h3>
<ol>
  <li><strong>Decidir sobre a CORTE PERPÉTUO / 13 de Julho.</strong> Ela parou de entregar às 10h36. Se a captação
  do leilão segue, precisa de nova data-fim; se o leilão já passou, pausar formalmente para tirar do painel.</li>
  <li><strong>Conferir o evento "MQL Perpetuo Touros"</strong> no Gerenciador de Eventos — 1 conversão em
  ${int(touros.cliques)} cliques merece verificação antes de escalar verba.</li>
</ol>

<h3>Próxima campanha de leilão</h3>
<ol start="3">
  <li><strong>Idade a partir de 30–35 anos.</strong> ${pct(shareJovens, 1)} da verba foi para 18–34, a faixa de
  pior CTR e pior custo por lead.</li>
  <li><strong>Ampliar a geografia</strong> além de MS (MT, GO, interior de SP). Frequência de
  ${dec(principal.frequencia)} em 12 dias é público estreito demais para campanha longa.</li>
  <li><strong>Dar mais verba ao Facebook.</strong> Com ${pct(shareFacebook, 1)} do investimento entregou CTR de
  ${pct(plataformas[1].ctr)} e lead a ${brl(plataformas[1].cpl)} — melhor que o Instagram nos dois indicadores.</li>
  <li><strong>Replicar o criativo 06 e reativar o 03 com verba real</strong> (melhor custo por lead da campanha,
  ${brl(criativos[0].cpl)}, e ficou com ${brl(criativos[0].investido)}). Cortar o padrão do criativo 01.</li>
  <li><strong>Reavaliar o flyer estático</strong> — ${brl(conjuntos[1].cpl)}/lead contra ${brl(conjuntos[0].cpl)}
  do vídeo. Ou muda o formato, ou a verba vai para vídeo.</li>
  <li><strong>Janela de 8 a 10 dias, não 12.</strong> A campanha rendeu ${brl(boa.cpl)}/lead até o dia 9 e
  ${brl(ruim.cpl)}/lead depois. Os últimos dias custaram ${brl(ruim.investido)} para trazer ${ruim.leads} leads —
  dinheiro que renderia o dobro num público novo.</li>
</ol>

<h3>Organização</h3>
<ol start="9">
  <li>Pausar em lote as ~60 campanhas com data-fim vencida na CA1.</li>
  <li>Investigar as 3 campanhas da conta Bula 1 com orçamento e zero entrega.</li>
</ol>

<div class="rodape">
  Relatório gerado a partir da API oficial do Meta Ads (conector Meta) em 25/07/2026 às 12h26.
  Os números do dia 25/07 são parciais por natureza — a extração ocorreu com o dia em curso.
  As métricas de lead referem-se a <em>formulário instantâneo</em> (conta CA1) e à conversão personalizada
  de pixel <em>"MQL Perpetuo Touros"</em> (conta CA2); não representam qualificação posterior no CRM.
  Script: <em>scripts/gera-relatorio-meta-ads-2026-07-25.mjs</em>
</div>

</body>
</html>`

// ---------------------------------------------------------------------------
// 5) Escrita e PDF
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
    <span>Bula Assessoria · Relatório Meta Ads · 25/07/2026</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`,
  margin: { top: '14mm', right: '13mm', bottom: '16mm', left: '13mm' },
})
await browser.close()

if (desktop) {
  const { copyFileSync } = await import('node:fs')
  copyFileSync(pdfPath, join(desktop, `${desktopStem}.pdf`))
}

console.log('HTML:', htmlPath)
console.log('PDF :', pdfPath)
if (desktop) console.log('PDF (Desktop):', join(desktop, `${desktopStem}.pdf`))
