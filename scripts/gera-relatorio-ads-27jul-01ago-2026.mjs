// Relatório de mídia paga + conversão — janela 27/07/2026 a 01/08/2026 (o leilão São Geraldo
// foi em 01/08, 12h). Fecha o ciclo do leilão e compara com o perpétuo de touros que rodou junto.
//
// Fontes, e a distinção importa:
// - CONVERSÃO: planilha "Leads - Bula Assessoria.xlsx", aba TOUROS — apurada por
//   scripts/apura-leads-27jul-01ago-2026.mjs (JSON em outputs/). Cobre a janela inteira.
// - MÍDIA: última extração disponível da API do Meta é de 31/07 16h24, registrada em
//   .planning/leilao-sao-geraldo/ANALISE-VERBA-SAOGERALDO-2026-07-31.md. O token da conta
//   expirou em 20/07, então 01/08 e o perpétuo NÃO têm gasto medido. Isso está dito no relatório
//   em vez de estimado — número inventado em relatório de cliente é pior que buraco declarado.
//
// Saídas: outputs/relatorio-ads-27jul-01ago-2026.{html,pdf} + cópia no Desktop.
// Uso: node scripts/gera-relatorio-ads-27jul-01ago-2026.mjs

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { chromium } from 'playwright'
import { carregaMidia } from './lib/midia-27jul-01ago-2026.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(root, 'outputs')
const desktop = join(homedir(), 'Desktop')
const stem = 'relatorio-ads-27jul-01ago-2026'
const desktopStem = 'Relatorio Ads e Conversao - 27-07 a 01-08-2026'

mkdirSync(outputDir, { recursive: true })

const D = JSON.parse(readFileSync(join(outputDir, 'apuracao-leads-27jul-01ago-2026.json'), 'utf8'))

// Gasto oficial da janela: export de campanhas do Gerenciador. É a fonte de verdade dos totais.
const M = carregaMidia()

// ---------------------------------------------------------------------------
// 1) Detalhe por conjunto e criativo — extração da API do Meta em 31/07/2026 16h24
//    (ANALISE-VERBA-SAOGERALDO). PARCIAL: vai só até aquele instante, e por isso serve para
//    comparar conjuntos entre si, nunca para somar o investimento do período.
// ---------------------------------------------------------------------------

const midiaSaoGeraldo = {
  extraidoEm: '31/07/2026 16h24',
  conjuntos: [
    { nome: 'RMKT', inicio: '29/jul', orcDia: 100, gasto: 187.16, impressoes: 12673, alcance: 8346, freq: 1.52, cpm: 14.77, resultados: 12, custoResultado: 15.60, evento: 'Múltiplas conv.' },
    { nome: 'RMKT — Cópia', inicio: '30/jul', orcDia: 300, gasto: 72.39, impressoes: 7918, alcance: 6662, freq: 1.19, cpm: 9.14, resultados: 3, custoResultado: 24.13, evento: 'Múltiplas conv.' },
    { nome: 'Aberto', inicio: '29/jul', orcDia: 200, gasto: 273.05, impressoes: 16514, alcance: 11069, freq: 1.49, cpm: 16.53, resultados: 5, custoResultado: 54.61, evento: 'MQL-Sao-Geraldo' },
    { nome: 'Aberto — Cópia', inicio: '31/jul', orcDia: 300, gasto: 99.40, impressoes: 2839, alcance: 2426, freq: 1.17, cpm: 35.01, resultados: 0, custoResultado: null, evento: 'Lead Sao geraldo' },
  ],
  totalGasto: 632.83,
  totalOrcDia: 900,
  totalImpressoes: 40015,
  totalAlcance: 24395,
  cpmMedio: 15.81,
  totalResultados: 20,
}

// Quebra por criativo — mesma extração. O total (R$644,31) difere em R$11,48 do total por
// conjunto (R$632,83): o painel do Meta agrega em recortes distintos. Não reconciliar à força.
const midiaCriativos = [
  { nome: '03', gasto: 117.74, impressoes: 7338, resultados: 10, custoResultado: 11.77, cpm: 16.05 },
  { nome: '01', gasto: 297.76, impressoes: 18627, resultados: 5, custoResultado: 59.55, cpm: 15.99 },
  { nome: '04', gasto: 172.24, impressoes: 12105, resultados: 3, custoResultado: 57.41, cpm: 14.23 },
  { nome: '05', gasto: 33.92, impressoes: 1760, resultados: 2, custoResultado: 16.96, cpm: 19.27 },
  { nome: '02', gasto: 22.65, impressoes: 858, resultados: 0, custoResultado: null, cpm: 26.40 },
]
const midiaCriativosTotal = { gasto: 644.31, impressoes: 40688, resultados: 20 }

// ---------------------------------------------------------------------------
// 2) Formatação
// ---------------------------------------------------------------------------

const brl = (v) => (v === null || v === undefined) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pct = (v, d = 0) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`
const dec = (v, d = 2) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const taxa = (a, b) => (b ? pct((a / b) * 100) : '—')

const C = {
  black: '#171717', charcoal: '#242424', gold: '#C5A34C', gray: '#666666',
  midGray: '#9a9a9a', line: '#e2e2e2', paleGray: '#f3f3f3', white: '#ffffff',
  vermelho: '#9c3b2e',
}

// ---------------------------------------------------------------------------
// 3) Derivados
// ---------------------------------------------------------------------------

const T = D.totais
const SG = D.saoGeraldo
const PP = D.perpetuo
const corte = D.recorteMidia

// Custos usam o gasto REAL da janela (export do Gerenciador) contra os leads da mesma janela.
// A quebra por conjunto da API (midiaSaoGeraldo) fica só como detalhe parcial — ela cobre até
// 31/07 16h24 e por isso não soma o total.
const cplSG = M.saoGeraldo.gasto / SG.leads
const cpmqlSG = M.saoGeraldo.gasto / SG.mql
const cpCadastroSG = M.saoGeraldo.gasto / SG.cadastroOk
const cplPP = M.perpetuo.gasto / PP.leads
const cpmqlPP = M.perpetuo.gasto / PP.mql
const cpCadastroPP = M.perpetuo.gasto / PP.cadastroOk
const vantagemHabilitado = cpCadastroPP / cpCadastroSG
const coberturaConjuntos = (midiaSaoGeraldo.totalGasto / M.saoGeraldo.gasto) * 100
const entregaReal = midiaSaoGeraldo.totalGasto / 2.7 // 29/07 ~13h → 31/07 16h24 ≈ 2,7 dias
const taxaEntrega = (entregaReal / midiaSaoGeraldo.totalOrcDia) * 100

const naoRespondeu = D.porEtapa.find((e) => e.chave === 'NÃO RESPONDEU') || { leads: 0, mql: 0 }
const qualificacao = D.porEtapa.find((e) => e.chave === 'QUALIFICAÇÃO') || { leads: 0, mql: 0 }
const cadastroOkEtapa = D.porEtapa.find((e) => e.chave === 'CADASTRO OK') || { leads: 0, mql: 0 }

const picoLeads = D.porHora.filter((h) => h.hora >= 17 && h.hora <= 22).reduce((a, h) => a + h.leads, 0)

// ---------------------------------------------------------------------------
// 4) Gráficos (SVG inline)
// ---------------------------------------------------------------------------

function graficoDiario() {
  const W = 1040, H = 330
  const left = 58, right = 58, top = 40, bottom = 48
  const w = W - left - right
  const h = H - top - bottom
  const dias = D.porDia
  const maxLeads = 24
  const maxMql = 12 // o pico é 9 MQL (29/07) — teto folgado para o rótulo não sair do quadro
  const stepX = w / (dias.length - 1)
  const x = (i) => left + stepX * i
  const yL = (v) => top + h - (v / maxLeads) * h
  const yM = (v) => top + h - (v / maxMql) * h

  let grid = ''
  for (let i = 0; i <= 4; i += 1) {
    const yy = top + (h * i) / 4
    grid += `<line x1="${left}" y1="${yy}" x2="${W - right}" y2="${yy}" stroke="${C.line}"/>`
    grid += `<text x="${left - 10}" y="${yy + 4}" text-anchor="end" font-size="11" fill="${C.gray}">${Math.round(maxLeads * (4 - i) / 4)}</text>`
    grid += `<text x="${W - right + 10}" y="${yy + 4}" font-size="11" fill="${C.gray}">${Math.round(maxMql * (4 - i) / 4)}</text>`
  }

  const barW = Math.min(46, stepX * 0.52)
  const barras = dias.map((l, i) => {
    const alturaPp = (l.pp / maxLeads) * h
    const alturaSg = (l.sg / maxLeads) * h
    const baseY = top + h
    return `
      <rect x="${x(i) - barW / 2}" y="${baseY - alturaPp}" width="${barW}" height="${alturaPp}" fill="${C.midGray}" rx="1.5"/>
      <rect x="${x(i) - barW / 2}" y="${baseY - alturaPp - alturaSg}" width="${barW}" height="${alturaSg}" fill="${C.charcoal}" rx="1.5"/>
      <text x="${x(i)}" y="${baseY - alturaPp - alturaSg - 7}" text-anchor="middle" font-size="11.5" font-weight="700" fill="${C.charcoal}">${l.total}</text>
      <text x="${x(i)}" y="${H - 28}" text-anchor="middle" font-size="11.5" font-weight="700" fill="${C.black}">${l.dia}</text>`
  }).join('')

  // Sem rótulo numérico nos pontos: eles caem em cima das barras escuras e a tabela logo abaixo
  // do gráfico já traz os valores.
  const linha = dias.map((l, i) => `${x(i)},${yM(l.mql)}`).join(' ')
  const pontos = dias.map((l, i) => `<circle cx="${x(i)}" cy="${yM(l.mql)}" r="4.5" fill="${C.gold}" stroke="${C.white}" stroke-width="1.6"/>`).join('')

  // Marca o dia em que o São Geraldo entrou no ar. O rótulo fica na faixa livre acima da barra
  // mais alta (21 leads) e acima do pico da linha de MQL — nas duas bordas ele seria coberto.
  const entrada = x(2) - stepX / 2
  const faixa = `<rect x="${entrada}" y="${top}" width="${W - right - entrada}" height="${h}" fill="${C.gold}" opacity="0.07"/>
    <text x="${entrada + 10}" y="${top - 6}" font-size="10.5" font-weight="700" fill="${C.gold}">CAMPANHA SÃO GERALDO NO AR ↓</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">
    <rect width="100%" height="100%" fill="${C.white}"/>
    <text x="${left}" y="16" font-size="12.5" font-weight="700" fill="${C.black}" letter-spacing="0.6">LEADS POR DIA — SÃO GERALDO (ESCURO) SOBRE PERPÉTUO (CLARO) · MQL NA LINHA DOURADA</text>
    ${faixa}${grid}${barras}
    <polyline points="${linha}" fill="none" stroke="${C.gold}" stroke-width="2.6"/>
    ${pontos}
    <text x="${left - 10}" y="${top - 12}" text-anchor="end" font-size="10" fill="${C.gray}">leads</text>
    <text x="${W - right + 10}" y="${top - 12}" font-size="10" fill="${C.gray}">MQL</text>
    <rect x="${left}" y="${H - 15}" width="11" height="11" fill="${C.charcoal}"/>
    <text x="${left + 16}" y="${H - 5}" font-size="10.5" fill="${C.gray}">São Geraldo</text>
    <rect x="${left + 105}" y="${H - 15}" width="11" height="11" fill="${C.midGray}"/>
    <text x="${left + 121}" y="${H - 5}" font-size="10.5" fill="${C.gray}">Perpétuo Touro</text>
  </svg>`
}

function graficoFunil() {
  const etapas = [
    { rotulo: 'Leads captados', valor: T.leads, mql: T.mql },
    { rotulo: 'Com inscrição estadual', valor: T.ie, mql: null },
    { rotulo: 'MQL (rebanho ≥100 + IE)', valor: T.mql, mql: null },
    { rotulo: 'Habilitados (CADASTRO OK)', valor: T.cadastroOk, mql: null },
  ]
  const W = 1040, H = 210
  const left = 250, right = 120, top = 30
  const w = W - left - right
  const rowH = 42
  const max = T.leads

  const barras = etapas.map((e, i) => {
    const yy = top + rowH * i
    const bw = (e.valor / max) * w
    const cor = i === 3 ? C.gold : i === 2 ? C.charcoal : C.midGray
    return `<text x="${left - 14}" y="${yy + 20}" text-anchor="end" font-size="11.5" font-weight="${i === 3 ? 700 : 400}" fill="${C.black}">${esc(e.rotulo)}</text>
      <rect x="${left}" y="${yy + 4}" width="${bw}" height="26" fill="${cor}" rx="2"/>
      <text x="${left + bw + 10}" y="${yy + 22}" font-size="13" font-weight="700" fill="${C.charcoal}">${e.valor}</text>
      <text x="${W - 12}" y="${yy + 22}" text-anchor="end" font-size="10.5" fill="${C.gray}">${pct((e.valor / max) * 100)} do topo</text>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">
    <rect width="100%" height="100%" fill="${C.white}"/>
    <text x="16" y="16" font-size="12.5" font-weight="700" fill="${C.black}" letter-spacing="0.6">DO LEAD AO HABILITADO — OS 88 DA JANELA</text>
    ${barras}
  </svg>`
}

function graficoBlocos() {
  const W = 1040, H = 250
  const blocos = [
    { nome: 'São Geraldo (leilão)', d: SG, cor: C.charcoal },
    { nome: 'Perpétuo Touro', d: PP, cor: C.midGray },
  ]
  const left = 200, right = 40, top = 46
  const w = W - left - right
  const max = 50
  const groupH = 88

  const barras = blocos.map((b, i) => {
    const y0 = top + groupH * i
    const wLeads = (b.d.leads / max) * w
    const wMql = (b.d.mql / max) * w
    const wCad = (b.d.cadastroOk / max) * w
    return `
      <text x="${left - 14}" y="${y0 + 18}" text-anchor="end" font-size="12" font-weight="700" fill="${C.black}">${esc(b.nome)}</text>
      <rect x="${left}" y="${y0 + 4}" width="${wLeads}" height="20" fill="${b.cor}" opacity="0.35" rx="2"/>
      <text x="${left + wLeads + 8}" y="${y0 + 19}" font-size="11" fill="${C.gray}">${b.d.leads} leads</text>
      <rect x="${left}" y="${y0 + 28}" width="${wMql}" height="20" fill="${b.cor}" rx="2"/>
      <text x="${left + wMql + 8}" y="${y0 + 43}" font-size="11" font-weight="700" fill="${C.charcoal}">${b.d.mql} MQL · ${taxa(b.d.mql, b.d.leads)}</text>
      <rect x="${left}" y="${y0 + 52}" width="${Math.max(wCad, 2)}" height="20" fill="${C.gold}" rx="2"/>
      <text x="${left + Math.max(wCad, 2) + 8}" y="${y0 + 67}" font-size="11" font-weight="700" fill="${C.gold}">${b.d.cadastroOk} habilitados · ${taxa(b.d.cadastroOk, b.d.leads)}</text>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">
    <rect width="100%" height="100%" fill="${C.white}"/>
    <text x="16" y="16" font-size="12.5" font-weight="700" fill="${C.black}" letter-spacing="0.6">MESMO PÚBLICO, MESMA SEMANA, MESMA PLANILHA — RESULTADOS DIFERENTES</text>
    <text x="16" y="32" font-size="10.5" fill="${C.gray}">Barra clara: leads · barra cheia: MQL · barra dourada: habilitados no leilão</text>
    ${barras}
  </svg>`
}

function graficoHora() {
  const W = 1040, H = 210
  const left = 46, right = 24, top = 34, bottom = 40
  const w = W - left - right
  const h = H - top - bottom
  const max = Math.max(...D.porHora.map((x) => x.leads))
  const barW = w / 24

  const barras = D.porHora.map((x, i) => {
    const alt = (x.leads / max) * h
    const pico = x.hora >= 17 && x.hora <= 22
    return `<rect x="${left + barW * i + 2}" y="${top + h - alt}" width="${barW - 4}" height="${alt}" fill="${pico ? C.gold : C.midGray}" rx="1.5"/>
      ${x.leads ? `<text x="${left + barW * i + barW / 2}" y="${top + h - alt - 5}" text-anchor="middle" font-size="9.5" fill="${C.gray}">${x.leads}</text>` : ''}
      <text x="${left + barW * i + barW / 2}" y="${H - 22}" text-anchor="middle" font-size="9" fill="${C.gray}">${String(x.hora).padStart(2, '0')}</text>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">
    <rect width="100%" height="100%" fill="${C.white}"/>
    <text x="${left}" y="16" font-size="12.5" font-weight="700" fill="${C.black}" letter-spacing="0.6">HORA EM QUE O LEAD CHEGA — DOURADO É A JANELA 17H–22H</text>
    <line x1="${left}" y1="${top + h}" x2="${W - right}" y2="${top + h}" stroke="${C.line}"/>
    ${barras}
  </svg>`
}

// ---------------------------------------------------------------------------
// 5) HTML
// ---------------------------------------------------------------------------

const kpi = (rotulo, valor, nota, destaque) => `
  <div class="kpi${destaque ? ' destaque' : ''}">
    <div class="kpi-rotulo">${esc(rotulo)}</div>
    <div class="kpi-valor">${valor}</div>
    ${nota ? `<div class="kpi-nota">${nota}</div>` : ''}
  </div>`

const linhaConjunto = (g) => {
  const sgLinha = !/Perpétuo/.test(g.chave)
  return `<tr${/Aberto/.test(g.chave) || /RMKT/.test(g.chave) ? ' class="marcada"' : ''}>
    <td>${esc(g.chave)}</td>
    <td>${g.leads}</td>
    <td>${g.ie}</td>
    <td>${g.mql}</td>
    <td>${taxa(g.mql, g.leads)}</td>
    <td>${g.cadastroOk}</td>
    <td>${taxa(g.cadastroOk, g.leads)}</td>
  </tr>`
}

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Relatório Ads e Conversão — 27/07 a 01/08/2026</title>
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
  .grafico { border: 1px solid ${C.line}; padding: 10px 8px 4px; margin: 10px 0 14px; }
  .caixa { border: 1px solid ${C.black}; border-left: 5px solid ${C.gold}; padding: 11px 14px; margin: 12px 0; }
  .caixa.alerta { border-left-color: ${C.vermelho}; }
  .caixa h3 { margin-top: 0; }
  .caixa p:last-child { margin-bottom: 0; }
  ol, ul { margin: 0 0 10px; padding-left: 20px; }
  li { margin-bottom: 5px; }
  .rodape { margin-top: 22px; padding-top: 9px; border-top: 1px solid ${C.line}; font-size: 8.4pt; color: ${C.gray}; }
  .quebra { page-break-before: always; }
  .evita-quebra { page-break-inside: avoid; }
  .nota-fonte { font-size: 8.6pt; color: ${C.gray}; margin: -4px 0 12px; }
  .duas { display: flex; gap: 16px; }
  .duas > div { flex: 1; }
</style>
</head>
<body>

<div class="capa">
  <h1>Leilão São Geraldo<br>Mídia e conversão</h1>
  <div class="sub">
    Bula Assessoria · janela <strong>27/07 a 01/08/2026</strong> · pregão em 01/08, 12h<br>
    Conversão: planilha de leads, aba TOUROS (${T.leads} leads) · Mídia: export de campanhas do Gerenciador (conta CA2)
  </div>
</div>
<div class="regua"></div>

<h2>1 · Resumo executivo</h2>

<p class="lede">
  Em seis dias entraram <strong>${T.leads} leads</strong> de touro. Deles, <strong>${T.mql} passaram na régua de
  qualificação</strong> (rebanho ≥ 100 cabeças <em>e</em> inscrição estadual) e <strong>${T.cadastroOk} chegaram a
  CADASTRO OK</strong> — habilitados para dar lance.
</p>

<div class="kpis">
  ${kpi('Leads na janela', int(T.leads), '27/07 a 01/08')}
  ${kpi('Com inscrição estadual', int(T.ie), `${taxa(T.ie, T.leads)} do total`)}
  ${kpi('MQL', int(T.mql), `${taxa(T.mql, T.leads)} do total`)}
  ${kpi('Habilitados', int(T.cadastroOk), `${taxa(T.cadastroOk, T.leads)} do total`, true)}
</div>
<div class="kpis">
  ${kpi('Investido na janela', brl(M.total.gasto), 'as duas campanhas')}
  ${kpi('Custo por lead', brl(M.total.gasto / T.leads), `${T.leads} leads`, true)}
  ${kpi('Custo por MQL', brl(M.total.gasto / T.mql), `${T.mql} qualificados`, true)}
  ${kpi('Custo por habilitado', brl(M.total.gasto / T.cadastroOk), `${T.cadastroOk} cadastros OK`, true)}
</div>

<div class="caixa">
  <h3>Os três pontos que decidem o próximo leilão</h3>
  <p><strong>1. O perpétuo dá lead barato e comprador caro.</strong> O lead dele custou
  <strong>${brl(cplPP)}</strong> contra ${brl(cplSG)} do leilão — mas o MQL sai a
  <strong>${brl(cpmqlPP)} contra ${brl(cpmqlSG)}</strong> e o habilitado a
  <strong>${brl(cpCadastroPP)} contra ${brl(cpCadastroSG)}</strong>. Na ponta que vende, o leilão é
  <strong>${dec(vantagemHabilitado, 1)}x mais eficiente</strong> — e custou quase o mesmo
  (${brl(M.saoGeraldo.gasto)} contra ${brl(M.perpetuo.gasto)}).</p>
  <p><strong>2. A campanha do leilão só existiu por 3 dos 6 dias.</strong> Entrou no ar em 29/07 e o pregão foi em
  01/08. Nos dias 27 e 28 os ${D.porDia[0].total + D.porDia[1].total} leads que entraram vieram todos do perpétuo.
  Três dias de leilão no ar produziram ${SG.leads} leads — a mesma taxa por dia projetaria
  <strong>~${Math.round((SG.leads / 3) * 6)} leads em seis</strong>.</p>
  <p><strong>3. O gargalo não foi mídia, foi telefone.</strong> ${naoRespondeu.leads} dos ${T.leads} leads
  (${taxa(naoRespondeu.leads, T.leads)}) terminaram em <strong>NÃO RESPONDEU</strong> — e ${naoRespondeu.mql}
  deles eram MQL. Cada MQL não atendido é um lead comprado, pago e jogado fora.</p>
</div>

<h2>2 · O período dia a dia</h2>
<div class="grafico evita-quebra">${graficoDiario()}</div>

<table class="evita-quebra">
  <thead>
    <tr><th>Dia</th><th>Leads</th><th>São Geraldo</th><th>Perpétuo</th><th>MQL</th><th>% MQL</th><th>Habilitados</th></tr>
  </thead>
  <tbody>
    ${D.porDia.map((l) => `<tr${l.dia === '01/08' ? ' class="marcada"' : ''}>
      <td>${l.dia}${l.dia === '01/08' ? ' <span style="color:#666">(pregão 12h)</span>' : ''}</td>
      <td>${l.total}</td><td>${l.sg}</td><td>${l.pp}</td>
      <td>${l.mql}</td><td>${taxa(l.mql, l.total)}</td><td>${l.cadastroOk}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td>${T.leads}</td><td>${SG.leads}</td><td>${PP.leads}</td>
      <td>${T.mql}</td><td>${taxa(T.mql, T.leads)}</td><td>${T.cadastroOk}</td></tr>
  </tbody>
</table>

<p>O pico de volume foi <strong>29/07 (${D.porDia[2].total} leads)</strong>, o primeiro dia cheio do leilão no ar.
O melhor dia em qualidade foi o mesmo 29/07 (${D.porDia[2].mql} MQL). No dia do pregão entraram ainda
<strong>${D.porDia[5].total} leads, ${D.porDia[5].mql} deles MQL</strong> — gente chegando na manhã do leilão,
o que justifica manter verba correndo até a hora do pregão.</p>

<div class="quebra"></div>

<h2>3 · São Geraldo contra o perpétuo — o contraste que decide verba</h2>
<div class="grafico evita-quebra">${graficoBlocos()}</div>

<table class="evita-quebra">
  <thead>
    <tr><th>Campanha</th><th>Investido</th><th>Impressões</th><th>Leads</th><th>Custo/lead</th>
      <th>MQL</th><th>Custo/MQL</th><th>Habilit.</th><th>Custo/habilit.</th></tr>
  </thead>
  <tbody>
    <tr class="marcada"><td><strong>São Geraldo (leilão)</strong></td><td>${brl(M.saoGeraldo.gasto)}</td>
      <td>${int(M.saoGeraldo.impressoes)}</td><td>${SG.leads}</td><td>${brl(cplSG)}</td>
      <td><strong>${SG.mql}</strong></td><td><strong>${brl(cpmqlSG)}</strong></td>
      <td><strong>${SG.cadastroOk}</strong></td><td><strong>${brl(cpCadastroSG)}</strong></td></tr>
    <tr><td>Perpétuo Touro (web)</td><td>${brl(M.perpetuo.gasto)}</td><td>${int(M.perpetuo.impressoes)}</td>
      <td>${PP.leads}</td><td>${brl(cplPP)}</td><td>${PP.mql}</td><td>${brl(cpmqlPP)}</td>
      <td>${PP.cadastroOk}</td><td>${brl(cpCadastroPP)}</td></tr>
    <tr class="total"><td>Total</td><td>${brl(M.total.gasto)}</td><td>${int(M.total.impressoes)}</td>
      <td>${T.leads}</td><td>${brl(M.total.gasto / T.leads)}</td><td>${T.mql}</td>
      <td>${brl(M.total.gasto / T.mql)}</td><td>${T.cadastroOk}</td>
      <td>${brl(M.total.gasto / T.cadastroOk)}</td></tr>
  </tbody>
</table>

<p>Qualidade dos dois blocos na mesma régua: São Geraldo <strong>${taxa(SG.mql, SG.leads)} de MQL</strong>
(${SG.ie} dos ${SG.leads} com inscrição estadual) contra <strong>${taxa(PP.mql, PP.leads)}</strong> do perpétuo
(${PP.ie} de ${PP.leads}).</p>

<div class="caixa">
  <h3>O que esse quadro está dizendo</h3>
  <p>O perpétuo trouxe <strong>${PP.leads - SG.leads} leads a mais</strong> que o leilão e
  <strong>${SG.mql - PP.mql} MQL a menos</strong>. Traduzindo: ele compra <em>curiosidade</em>, o leilão compra
  <em>intenção</em>. A régua é a mesma para os dois — ${taxa(SG.mql, SG.leads)} contra
  ${taxa(PP.mql, PP.leads)} de aproveitamento não é ruído, é natureza de oferta.</p>
  <p>E a diferença abre ainda mais no fim do funil: <strong>${SG.cadastroOk} habilitados contra ${PP.cadastroOk}</strong>.
  O perpétuo rodou os seis dias; o leilão, três. <strong>Campanha com data e catálogo converte; campanha
  genérica de touro enche planilha.</strong></p>
</div>

<h2>4 · Por conjunto de anúncio</h2>
<table>
  <thead>
    <tr><th>Conjunto</th><th>Leads</th><th>Com IE</th><th>MQL</th><th>% MQL</th><th>Habilitados</th><th>% habilitados</th></tr>
  </thead>
  <tbody>
    ${D.porConjunto.map(linhaConjunto).join('')}
    <tr class="total"><td>Total</td><td>${T.leads}</td><td>${T.ie}</td><td>${T.mql}</td>
      <td>${taxa(T.mql, T.leads)}</td><td>${T.cadastroOk}</td><td>${taxa(T.cadastroOk, T.leads)}</td></tr>
  </tbody>
</table>

<p>O conjunto <strong>Aberto</strong> (público frio) foi o que mais produziu no leilão: ${D.porConjunto[1].leads}
leads e <strong>${D.porConjunto[1].mql} MQL</strong>, com ${D.porConjunto[1].cadastroOk} habilitados. O
<strong>RMKT</strong> converteu mais barato por resultado no painel do Meta (§7), mas tem teto de público — os
${D.porConjunto[2].leads} leads mostram isso. O <strong>Formulário Instantâneo</strong> trouxe poucos leads porém
<strong>${D.porConjunto[3].cadastroOk} deles viraram habilitados</strong>: taxa de fechamento de
${taxa(D.porConjunto[3].cadastroOk, D.porConjunto[3].leads)}, a melhor de todos os conjuntos.</p>

<h2>5 · Por criativo</h2>
<table>
  <thead>
    <tr><th>Criativo (utm_content)</th><th>Leads</th><th>Com IE</th><th>MQL</th><th>% MQL</th><th>Habilitados</th></tr>
  </thead>
  <tbody>
    ${D.porCriativo.filter((c) => c.leads > 1).map((c) => `<tr${c.leads >= 9 ? ' class="marcada"' : ''}>
      <td>${esc(c.chave)}</td><td>${c.leads}</td><td>${c.ie}</td><td>${c.mql}</td>
      <td>${taxa(c.mql, c.leads)}</td><td>${c.cadastroOk}</td></tr>`).join('')}
  </tbody>
</table>

<ul>
  <li><strong>video-perpetuo-touro03 é o campeão de volume e o pior de qualidade:</strong>
  ${D.porCriativo[0].leads} leads — ${taxa(D.porCriativo[0].leads, T.leads)} de tudo que entrou — e só
  ${D.porCriativo[0].mql} MQL (${taxa(D.porCriativo[0].mql, D.porCriativo[0].leads)}), com
  ${D.porCriativo[0].cadastroOk} habilitado.</li>
  <li><strong>video-sao-geraldo01 foi o cavalo de batalha do leilão:</strong> ${D.porCriativo[1].leads} leads,
  ${D.porCriativo[1].mql} MQL, ${D.porCriativo[1].cadastroOk} habilitados. Único criativo com produção comprovada
  no público frio.</li>
  <li><strong>video-sao-geraldo03 tem a melhor taxa entre os de volume:</strong>
  ${taxa(D.porCriativo[2].mql, D.porCriativo[2].leads)} de MQL em ${D.porCriativo[2].leads} leads — e no painel do
  Meta é o mais barato por resultado (${brl(midiaCriativos[0].custoResultado)}, §7). Rodou quase só em
  retargeting; <strong>nunca foi testado com verba real no frio</strong>.</li>
  <li><strong>video-sao-geraldo05, com 3 leads, fez 3 MQL e 2 habilitados.</strong> Amostra pequena demais para
  concluir, boa demais para ignorar — é o teste nº 1 do próximo leilão.</li>
</ul>

<div class="quebra"></div>

<h2>6 · Do lead ao habilitado</h2>
<div class="grafico evita-quebra">${graficoFunil()}</div>

<table class="evita-quebra">
  <thead><tr><th>Etapa no CRM</th><th>Leads</th><th>% do total</th><th>dos quais MQL</th></tr></thead>
  <tbody>
    ${D.porEtapa.map((e) => `<tr${e.chave === 'NÃO RESPONDEU' || e.chave === 'CADASTRO OK' ? ' class="marcada"' : ''}>
      <td>${esc(e.chave)}</td><td>${e.leads}</td><td>${taxa(e.leads, T.leads)}</td><td>${e.mql}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td>${T.leads}</td><td>100%</td><td>${T.mql}</td></tr>
  </tbody>
</table>

<div class="caixa alerta">
  <h3>O buraco está no atendimento, não na mídia</h3>
  <p><strong>${naoRespondeu.leads} leads (${taxa(naoRespondeu.leads, T.leads)}) morreram em NÃO RESPONDEU</strong>,
  e <strong>${naoRespondeu.mql} deles eram MQL</strong> — rebanho grande e inscrição estadual, exatamente o perfil
  que dá lance. Outros <strong>${qualificacao.leads} ficaram parados em QUALIFICAÇÃO</strong>, com
  ${qualificacao.mql} MQL dentro.</p>
  <p>Somando: <strong>${naoRespondeu.mql + qualificacao.mql} dos ${T.mql} MQL da janela não chegaram ao cadastro.</strong>
  Isso é ${pct(((naoRespondeu.mql + qualificacao.mql) / T.mql) * 100)} do inventário qualificado perdido depois de
  já ter sido pago. Nenhum ajuste de segmentação, criativo ou orçamento recupera esse valor — só telefone.</p>
</div>

<p>Do outro lado, a conversão de quem <em>foi</em> trabalhado é boa: dos ${T.mql} MQL,
<strong>${cadastroOkEtapa.mql} viraram CADASTRO OK</strong>. E vale registrar que
<strong>${T.cadastroOk - cadastroOkEtapa.mql} dos ${T.cadastroOk} habilitados ficaram fora da régua de MQL</strong>
(rebanho abaixo de 100 cabeças) — ou seja, <strong>a régua é conservadora</strong>: quem tem inscrição estadual
merece ligação mesmo com rebanho menor.</p>

<div class="evita-quebra">
<h3>6.1 · Como o atendimento se distribuiu</h3>
<table>
  <thead><tr><th>Assessor · leads do São Geraldo</th><th>Leads</th><th>MQL</th><th>Habilitados</th><th>MQL que virou habilitado</th></tr></thead>
  <tbody>
    ${D.porAtendenteSaoGeraldo.map((a) => `<tr${a.cadastroOk >= 4 ? ' class="marcada"' : ''}>
      <td>${esc(a.chave)}</td><td>${a.leads}</td><td>${a.mql}</td><td>${a.cadastroOk}</td>
      <td>${taxa(a.cadastroOk, a.mql)}</td></tr>`).join('')}
    <tr class="total"><td>Total São Geraldo</td><td>${SG.leads}</td><td>${SG.mql}</td><td>${SG.cadastroOk}</td>
      <td>${taxa(SG.cadastroOk, SG.mql)}</td></tr>
  </tbody>
</table>
</div>

<p><strong>Ressalva antes de ler esta tabela como ranking:</strong> a carteira não é sorteada — há roteamento por
zona, e os assessores receberam misturas diferentes de São Geraldo e perpétuo. A coluna que <em>é</em> comparável
é a última: <strong>${esc(D.porAtendenteSaoGeraldo[0].chave)} converteu
${taxa(D.porAtendenteSaoGeraldo[0].cadastroOk, D.porAtendenteSaoGeraldo[0].mql)} dos MQL que recebeu em habilitado;
os demais, nenhum</strong>. Com ${D.porAtendenteSaoGeraldo[1].mql} MQL na mão do segundo colocado, a amostra é
pequena para julgar pessoa — mas é grande o bastante para justificar <strong>padronizar o roteiro de
qualificação</strong> pelo de quem fechou.</p>

<h2>7 · Mídia</h2>
<p class="nota-fonte">
  Export de campanhas do Gerenciador de Anúncios, conta CA2, período
  ${M.janela.de.split('-').reverse().join('/')} a ${M.janela.ate.split('-').reverse().join('/')} — cobre a janela
  inteira, igual à da planilha de leads.
</p>

<div class="kpis">
  ${kpi('Investido', brl(M.total.gasto), 'as duas campanhas')}
  ${kpi('São Geraldo', brl(M.saoGeraldo.gasto), `${pct((M.saoGeraldo.gasto / M.total.gasto) * 100)} da verba`)}
  ${kpi('Perpétuo Touro', brl(M.perpetuo.gasto), `${pct((M.perpetuo.gasto / M.total.gasto) * 100)} da verba`)}
  ${kpi('CPM médio', brl(M.total.cpm))}
</div>
<div class="kpis">
  ${kpi('Impressões', int(M.total.impressoes))}
  ${kpi('Custo por lead', brl(M.total.gasto / T.leads), `${T.leads} leads`, true)}
  ${kpi('Custo por MQL', brl(M.total.gasto / T.mql), `${T.mql} qualificados`, true)}
  ${kpi('Custo por habilitado', brl(M.total.gasto / T.cadastroOk), `${T.cadastroOk} cadastros OK`, true)}
</div>

<table class="evita-quebra">
  <thead><tr><th>Campanha</th><th>Investido</th><th>Impressões</th><th>Alcance</th><th>Freq.</th><th>CPM</th><th>Resultados no painel</th></tr></thead>
  <tbody>
    ${M.campanhas.map((c) => `<tr${/SAO GERALDO/i.test(c.nome) ? ' class="marcada"' : ''}>
      <td>${esc(c.nome)}</td><td>${brl(c.gasto)}</td><td>${int(c.impressoes)}</td>
      <td>${int(c.alcance)}</td><td>${dec(c.frequencia)}</td><td>${brl(c.cpm)}</td>
      <td>${c.resultadosMeta === null ? 'nenhum registrado' : `${c.resultadosMeta} · ${brl(c.custoResultadoMeta)} cada`}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td>${brl(M.total.gasto)}</td><td>${int(M.total.impressoes)}</td>
      <td>—</td><td></td><td>${brl(M.total.cpm)}</td><td></td></tr>
  </tbody>
</table>

<p><strong>O painel do Meta não enxergou o leilão.</strong> A campanha do São Geraldo aparece com
<em>nenhum resultado registrado</em>, e a do perpétuo com ${M.campanhas.find((c) => c.resultadosMeta)?.resultadosMeta ?? 0}
resultados a ${brl(M.campanhas.find((c) => c.resultadosMeta)?.custoResultadoMeta ?? 0)} cada — contra ${PP.mql} MQL
reais na planilha. <strong>A contagem de leads deste relatório vem da planilha, não do pixel</strong>, e é por isso
que os custos aqui são confiáveis e os do painel não. Consertar a medição do lado do Meta é pré-requisito para
otimizar por conversão na próxima campanha.</p>

<p>Alcance não é somável entre campanhas (a mesma pessoa pode ter visto as duas), por isso não há total na coluna.
O CTR não sai neste export — para tê-lo, reexportar incluindo as colunas <em>Cliques no link</em> e <em>CTR</em>.</p>

<h3>7.1 · Por conjunto — detalhe parcial</h3>
<p class="nota-fonte">
  Quebra da API do Meta em ${midiaSaoGeraldo.extraidoEm}: cobre ${brl(midiaSaoGeraldo.totalGasto)} dos
  ${brl(M.saoGeraldo.gasto)} do leilão (${pct(coberturaConjuntos)}). Serve para comparar conjuntos entre si —
  <strong>não</strong> para somar investimento.
</p>
<table>
  <thead>
    <tr><th>Conjunto</th><th>Início</th><th>Orç./dia</th><th>Investido</th><th>Impressões</th><th>Freq.</th><th>CPM</th><th>Result.</th><th>Custo/result.</th></tr>
  </thead>
  <tbody>
    ${midiaSaoGeraldo.conjuntos.map((c) => `<tr${c.nome === 'RMKT' ? ' class="marcada"' : ''}>
      <td>${esc(c.nome)}</td><td style="text-align:right">${c.inicio}</td><td>${brl(c.orcDia)}</td>
      <td>${brl(c.gasto)}</td><td>${int(c.impressoes)}</td><td>${dec(c.freq)}</td>
      <td>${brl(c.cpm)}</td><td>${c.resultados}</td><td>${brl(c.custoResultado)}</td></tr>`).join('')}
    <tr class="total"><td>Parcial até ${midiaSaoGeraldo.extraidoEm}</td><td></td><td>${brl(midiaSaoGeraldo.totalOrcDia)}</td>
      <td>${brl(midiaSaoGeraldo.totalGasto)}</td><td>${int(midiaSaoGeraldo.totalImpressoes)}</td><td></td>
      <td>${brl(midiaSaoGeraldo.cpmMedio)}</td><td>${midiaSaoGeraldo.totalResultados}</td><td></td></tr>
  </tbody>
</table>

<p><strong>Aviso de unidade:</strong> a coluna "Custo/resultado" <em>não</em> compara igual com igual entre linhas —
cada conjunto otimizava para um evento diferente (o RMKT para múltiplas conversões, o Aberto para
<em>MQL-Sao-Geraldo</em>). Use-a dentro de cada linha, não entre linhas. A comparação limpa entre conjuntos é a
da §4, que usa a régua de MQL da casa, igual para todos.</p>

<div class="caixa alerta">
  <h3>O orçamento ficou na ordem inversa da performance</h3>
  <p>O <strong>RMKT</strong> foi o conjunto mais eficiente (${brl(15.60)} por resultado) e era o de
  <strong>menor orçamento: ${brl(100)}/dia</strong>. O <strong>Aberto — Cópia</strong> teve
  <strong>${brl(300)}/dia</strong>, CPM de ${brl(35.01)} — o dobro dos outros — e produziu
  <strong>zero resultados</strong> em ${brl(99.40)}.</p>
  <p>E a campanha <strong>nunca gastou o teto</strong>. Pelo export, o leilão entregou
  ${brl(M.saoGeraldo.gasto)} nos ~3 dias no ar — <strong>~${brl(M.saoGeraldo.gasto / 3)}/dia</strong> contra os
  ${brl(midiaSaoGeraldo.totalOrcDia)}/dia que os conjuntos somavam no fechamento
  (<strong>${pct((M.saoGeraldo.gasto / 3 / midiaSaoGeraldo.totalOrcDia) * 100)}</strong>). Na leitura de 29–30/07,
  com ${brl(300)}/dia autorizados, saíram ${brl(157.90)}/dia — 53%. Ou seja: subir o número no painel não fez o
  dinheiro sair na mesma proporção. A causa levantada na época foi <em>limite de gastos da conta</em>; precisa ser
  confirmada no Gerenciador antes do próximo leilão, porque nenhum ajuste de campanha destrava um teto de conta.</p>
</div>

<h3>7.2 · Por criativo (painel do Meta)</h3>
<table>
  <thead><tr><th>Criativo</th><th>Investido</th><th>% verba</th><th>Impressões</th><th>CPM</th><th>Result.</th><th>Custo/result.</th></tr></thead>
  <tbody>
    ${midiaCriativos.map((c) => `<tr${c.nome === '03' || c.nome === '04' ? ' class="marcada"' : ''}>
      <td>video-sao-geraldo${esc(c.nome)}</td><td>${brl(c.gasto)}</td>
      <td>${pct((c.gasto / midiaCriativosTotal.gasto) * 100)}</td><td>${int(c.impressoes)}</td>
      <td>${brl(c.cpm)}</td><td>${c.resultados}</td><td>${brl(c.custoResultado)}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td>${brl(midiaCriativosTotal.gasto)}</td><td>100%</td>
      <td>${int(midiaCriativosTotal.impressoes)}</td><td></td><td>${midiaCriativosTotal.resultados}</td><td></td></tr>
  </tbody>
</table>

<p>A alocação também saiu invertida: o <strong>01 levou ${pct((297.76 / 644.31) * 100)} da verba</strong> para
${brl(59.55)}/resultado, enquanto o <strong>03 levou ${pct((117.74 / 644.31) * 100)}</strong> e entregou o resultado
mais barato da conta (<strong>${brl(11.77)}</strong>). O <strong>04 consumiu ${brl(172.24)}
(${pct((172.24 / 644.31) * 100)} da verba) para 3 resultados</strong> e, na planilha, ${D.porCriativo.find((c) => c.chave === 'video-sao-geraldo04')?.mql ?? 0} MQL.</p>

<div class="caixa">
  <h3>Cobertura desta seção</h3>
  <p><strong>O investimento, as impressões e todos os custos por lead, por MQL e por habilitado cobrem a janela
  inteira</strong> — vêm do export de campanhas e batem, dia a dia, com o período da planilha.</p>
  <p>O que continua fora: <strong>CTR e cliques</strong> (não vêm neste export — basta reexportar com as colunas
  <em>Cliques no link</em> e <em>CTR</em>) e as <strong>quebras por conjunto, criativo, idade e região no
  fechamento</strong> — o detalhe das §7.1 e §7.2 é a leitura parcial de ${midiaSaoGeraldo.extraidoEm}, boa para
  ordenar o que funcionou, não para somar verba.</p>
</div>

<div class="quebra"></div>

<h2>8 · Quem é esse comprador</h2>

<div class="duas">
  <div>
    <h3>Estados que mais responderam</h3>
    <table>
      <thead><tr><th>UF</th><th>Leads</th><th>MQL</th></tr></thead>
      <tbody>
        ${D.porUf.slice(0, 10).map((u) => `<tr><td>${esc(u.chave)}</td><td>${u.leads}</td><td>${u.mql}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div>
    <h3>Tamanho do rebanho</h3>
    <table>
      <thead><tr><th>Faixa</th><th>Leads</th><th>MQL</th></tr></thead>
      <tbody>
        ${D.porCabecas.slice(0, 8).map((c) => `<tr><td>${esc(c.chave)}</td><td>${c.leads}</td><td>${c.mql}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>

<p><strong>O leilão foi nacional, não regional.</strong> ${D.porUf.length} estados diferentes apareceram, liderados
por ${esc(D.porUf[0].chave)} (${D.porUf[0].leads}), ${esc(D.porUf[1].chave)} (${D.porUf[1].leads}) e
${esc(D.porUf[2].chave)} (${D.porUf[2].leads}). Isso é o oposto da campanha de julho, que concentrou 99% da verba
em Mato Grosso do Sul — e é provavelmente por isso que a frequência ficou saudável
(${dec(Math.min(...midiaSaoGeraldo.conjuntos.map((c) => c.freq)))} a
${dec(Math.max(...midiaSaoGeraldo.conjuntos.map((c) => c.freq)))} por conjunto), sem sinal de saturação. Na
campanha de julho ela chegou a 3,97.</p>

<p>O perfil de compra é claro: <strong>${D.porQtd[0].leads} dos ${T.leads} querem
"${esc(D.porQtd[0].chave)}"</strong> (${taxa(D.porQtd[0].leads, T.leads)}). Não é comprador de lote grande — é
pecuarista trocando os reprodutores da temporada. A oferta e o parcelamento têm que falar com esse.</p>

<h3>Momento na pecuária</h3>
<table>
  <thead><tr><th>Momento</th><th>Leads</th><th>MQL</th><th>% MQL</th></tr></thead>
  <tbody>
    ${D.porMomento.slice(0, 8).map((m) => `<tr><td>${esc(m.chave)}</td><td>${m.leads}</td><td>${m.mql}</td>
      <td>${taxa(m.mql, m.leads)}</td></tr>`).join('')}
  </tbody>
</table>

<h2>9 · A que horas o lead chega</h2>
<div class="grafico evita-quebra">${graficoHora()}</div>

<p><strong>${picoLeads} dos ${T.leads} leads (${taxa(picoLeads, T.leads)}) chegaram entre 17h e 22h.</strong>
É a janela em que o pecuarista senta e mexe no celular. Um segundo bloco aparece de manhã (6h–11h,
${D.porHora.filter((h) => h.hora >= 6 && h.hora <= 11).reduce((a, h) => a + h.leads, 0)} leads) — inclusive na
manhã do próprio pregão.</p>

<p><strong>Consequência operacional direta:</strong> escala de atendimento concentrada no horário comercial pega
a metade errada do dia. Se os ${naoRespondeu.leads} "NÃO RESPONDEU" tiverem que virar contato, a equipe precisa
estar no telefone <strong>entre 17h e 22h</strong>, não das 8h às 18h.</p>

<div class="quebra"></div>

<h2>10 · O que fazer no próximo leilão</h2>

<h3>Antes de mexer em qualquer campanha</h3>
<ol>
  <li><strong>Confirmar o limite de gastos da conta.</strong> ~${brl(M.saoGeraldo.gasto / 3)}/dia entregues contra
  ${brl(midiaSaoGeraldo.totalOrcDia)}/dia autorizados
  (${pct((M.saoGeraldo.gasto / 3 / midiaSaoGeraldo.totalOrcDia) * 100)}). Enquanto isso não for verificado, subir
  orçamento não compra entrega — Gerenciador → Cobrança → Configurações de pagamento.</li>
  <li><strong>Consertar a medição do lado do Meta.</strong> O painel registrou <em>zero</em> resultados para a
  campanha do leilão. Sem evento confiável, a campanha não tem por onde otimizar e o relatório depende
  inteiramente da planilha.</li>
</ol>

<h3>Mídia</h3>
<ol start="3">
  <li><strong>Subir a campanha do leilão com 8 a 10 dias, não 3.</strong> Foi a variável mais cara do ciclo: a
  campanha do leilão converteu ${taxa(SG.mql, SG.leads)} contra ${taxa(PP.mql, PP.leads)} do perpétuo, e só teve
  metade da janela para trabalhar.</li>
  <li><strong>Verba na ordem da performance.</strong> O RMKT teve o melhor custo por resultado com o menor
  orçamento; o "Aberto — Cópia" teve o maior orçamento e zero resultados. Conjunto duplicado sem critério divide
  público e queima aprendizado.</li>
  <li><strong>Testar o <em>03</em> no público frio com verba real.</strong> Melhor custo por resultado da conta
  (${brl(11.77)}) e melhor taxa de MQL entre os criativos de volume, mas rodou quase só em retargeting. É a
  hipótese mais barata de ser testada e a de maior retorno se pegar.</li>
  <li><strong>Manter o Formulário Instantâneo no ar, com a entrega apontada certo.</strong> Foram poucos leads,
  mas ${taxa(D.porConjunto[3].cadastroOk, D.porConjunto[3].leads)} deles viraram habilitados — a melhor taxa de
  fechamento entre os conjuntos.</li>
  <li><strong>Não financiar o perpétuo com a verba do leilão.</strong> ${PP.leads} leads e ${PP.cadastroOk}
  habilitado em seis dias. Ele tem função de topo de funil, mas não pode competir por verba na semana do pregão.</li>
</ol>

<h3>Atendimento — a maior alavanca do ciclo</h3>
<ol start="8">
  <li><strong>Plantão de 17h às 22h nos dias de campanha.</strong> ${taxa(picoLeads, T.leads)} dos leads chegam
  nessa faixa.</li>
  <li><strong>Ligar em quem tem inscrição estadual, mesmo com rebanho pequeno.</strong>
  ${T.cadastroOk - cadastroOkEtapa.mql} dos ${T.cadastroOk} habilitados deste leilão ficaram fora da régua de MQL.</li>
  <li><strong>Trabalhar o backlog antes de comprar lead novo.</strong> ${naoRespondeu.mql + qualificacao.mql} MQL
  desta janela ainda estão em NÃO RESPONDEU ou QUALIFICAÇÃO. Ao custo por MQL medido (${brl(cpmqlSG)}), esse
  backlog vale <strong>${brl((naoRespondeu.mql + qualificacao.mql) * cpmqlSG)} de mídia já paga</strong> — e é o
  lead mais barato disponível para o próximo leilão, porque já foi comprado.</li>
</ol>

<div class="rodape">
  <strong>Conversão</strong> (§1 a §6, §8, §9): planilha "Leads - Bula Assessoria.xlsx", aba TOUROS, ${T.leads}
  registros na janela 27/07 a 01/08/2026. Régua de MQL: rebanho ≥ 100 cabeças <em>e</em> inscrição estadual = Sim.
  "Habilitado" = etapa CADASTRO OK no CRM. Apuração: <em>scripts/apura-leads-27jul-01ago-2026.mjs</em>.<br>
  <strong>Mídia</strong> (§7): export de campanhas do Gerenciador de Anúncios, conta CA2, janela completa
  ${M.janela.de.split('-').reverse().join('/')} a ${M.janela.ate.split('-').reverse().join('/')}. As quebras por
  conjunto e criativo (§7.1 e §7.2) são a leitura parcial da API em ${midiaSaoGeraldo.extraidoEm}, registrada em
  <em>.planning/leilao-sao-geraldo/ANALISE-VERBA-SAOGERALDO-2026-07-31.md</em> — comparam conjuntos, não somam
  verba. Sem CTR: o export não traz cliques.<br>
  Relatório: <em>scripts/gera-relatorio-ads-27jul-01ago-2026.mjs</em>
</div>

</body>
</html>`

// ---------------------------------------------------------------------------
// 6) Escrita e PDF
// ---------------------------------------------------------------------------

const htmlPath = join(outputDir, `${stem}.html`)
const pdfPath = join(outputDir, `${stem}.pdf`)
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
    <span>Bula Assessoria · Leilão São Geraldo · mídia e conversão · 27/07 a 01/08/2026</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`,
  margin: { top: '14mm', right: '13mm', bottom: '16mm', left: '13mm' },
})
await browser.close()

copyFileSync(pdfPath, join(desktop, `${desktopStem}.pdf`))

console.log('HTML:', htmlPath)
console.log('PDF :', pdfPath)
console.log('PDF (Desktop):', join(desktop, `${desktopStem}.pdf`))
