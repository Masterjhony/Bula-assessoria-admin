/**
 * Renderiza o relatorio de posicao de caixa / fluxo de 09/09 a 10/10/2026 a
 * partir de outputs/caixa-63k-setembro-2026/dados.json. Paleta monocromatica do
 * brandbook (preto, cinza, dourado). Gera HTML + PDF A4 na Area de Trabalho.
 * Nenhum numero escrito a mao aqui.
 *
 * Graficos: como o relatorio e impresso em monocromatico, a identidade das
 * series NUNCA e so cor — cada cenario tem traco proprio e rotulo direto na
 * ponta da linha, com legenda presente.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { chromium } from 'playwright'

const OUT = 'outputs/caixa-63k-setembro-2026'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const r2 = n => Math.round(Number(n) * 100) / 100
const kk = n => { const a = Math.abs(n); return a >= 1000 ? (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + 'k' : brl0(n) }
const dm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7)
const DIA_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const ds = iso => DIA_SEM[new Date(iso + 'T12:00:00Z').getUTCDay()]
const corta = (t, n) => { const x = String(t); if (x.length <= n) return x; const c = x.slice(0, n), sp = c.lastIndexOf(' '); return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–]+$/, '') + '…' }
const sinal = n => (n < 0 ? '−R$ ' + brl(Math.abs(n)) : 'R$ ' + brl(n))
const sinal0 = n => (n < 0 ? '−R$ ' + brl0(Math.abs(n)) : 'R$ ' + brl0(n))
const limpa = s => String(s).replace(/ - COMISSAO BULA| - FECHAMENTO BULA| - BULA REMATES/gi, '')

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', SOFT = '#B4B4B4'
const cen = k => D.cenarios.find(c => c.chave === k)
const cap = k => D.capacidades.find(c => c.chave === k)
const BASE = cen('BASE'), REPASSE = cen('REPASSE'), CHEFE25 = cen('CHEFE_25'), COMEAO = cen('COM_EAO'),
  ALAVANCAS = cen('ALAVANCAS'), TUDOJUNTO = cen('TUDO_JUNTO'), TUDOATRASA = cen('TUDO_ATRASA')
const capHoje = cap('REPASSE_25'), capAlav = cap('ALAV_25'), capEao = cap('EAO_25'), capTudo = cap('TUDO_25')
const faltaEao = r2(D.alvoChefe - capEao.cabe)
const sobraJmp = r2(D.somaCrConfirmado - D.felipe.valor - D.crConfirmado.filter(t => t.navirai).reduce((s, t) => s + t.valor, 0))
const somaNavirai = r2(D.crConfirmado.filter(t => t.navirai).reduce((s, t) => s + t.valor, 0))
const somaJmp = r2(D.crConfirmado.filter(t => t.jmp).reduce((s, t) => s + t.valor, 0))
const restaJmp = r2(somaJmp - D.felipe.valor)
const saidasJanela = r2(D.somaCpJanela + D.dasEstimado + D.estruturalDifuso + D.leilaoJanela)
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

/* ===================== G1 — a linha do caixa, por cenário ===================== */
function gLinha() {
  const W = 762, H = 262, L = 52, R = 132, T = 12, B = 40
  // "Nada entra" fica fora do grafico de proposito: ele desce a -296k e
  // esmagaria a escala onde a decisao acontece. Continua na tabela abaixo.
  const series = [
    { k: 'CHEFE_25', rot: 'Pagando o chefe', dash: '6 3', w: 2.2, cor: INK },
    { k: 'REPASSE', rot: 'Sem pagar o chefe', dash: '', w: 1.4, cor: MUTED },
    { k: 'ALAVANCAS', rot: 'Chefe + alavancas', dash: '1 3', w: 1.4, cor: SOFT },
    { k: 'COM_EAO', rot: 'Chefe + EAO', dash: '', w: 2.4, cor: GOLD },
    { k: 'TUDO_JUNTO', rot: 'Chefe + EAO + alavancas', dash: '4 2', w: 1.6, cor: GOLD },
  ]
  const pts = D.linhas.BASE
  const todos = series.flatMap(s => D.linhas[s.k].map(p => p.saldo)).concat([0])
  const max = Math.max(...todos), min = Math.min(...todos)
  const pad = (max - min) * 0.08 || 1000
  const hi = max + pad, lo = min - pad
  const x = i => L + (i * (W - L - R)) / (pts.length - 1)
  const y = v => T + ((hi - v) * (H - T - B)) / (hi - lo)
  let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Inter, sans-serif">`
  for (let i = 0; i <= 5; i++) {
    const v = lo + ((hi - lo) * i) / 5
    g += `<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}" stroke="${GRID}" stroke-width=".7"/>`
    g += `<text x="${L - 6}" y="${(y(v) + 3).toFixed(1)}" font-size="7.6" fill="${MUTED}" text-anchor="end">${kk(v)}</text>`
  }
  g += `<line x1="${L}" y1="${y(0).toFixed(1)}" x2="${W - R}" y2="${y(0).toFixed(1)}" stroke="${INK}" stroke-width="1.1"/>`
  g += `<text x="${L + 4}" y="${(y(0) - 4).toFixed(1)}" font-size="7.2" fill="${MUTED}">zero</text>`
  pts.forEach((p, i) => {
    if (p.data.slice(8) === '10' || p.data.slice(8) === '15' || p.data.slice(8) === '20' || p.data.slice(8) === '25' || p.data.slice(8) === '30' || p.data.slice(8) === '05')
      g += `<text x="${x(i).toFixed(1)}" y="${H - B + 13}" font-size="7.6" fill="${MUTED}" text-anchor="middle">${dm(p.data)}</text>`
  })
  // marcos: entrada do JMP e o dia 25
  for (const [d, rot] of [[D.diaJmp, 'JMP'], ['2026-09-25', 'dia 25'], ['2026-10-05', 'folha']]) {
    const i = pts.findIndex(p => p.data === d)
    if (i < 0) continue
    g += `<line x1="${x(i).toFixed(1)}" y1="${T}" x2="${x(i).toFixed(1)}" y2="${H - B}" stroke="${GRID}" stroke-width=".9" stroke-dasharray="2 3"/>`
    g += `<text x="${x(i).toFixed(1)}" y="${T + 8}" font-size="7" fill="${SOFT}" text-anchor="middle">${rot}</text>`
  }
  for (const s of series) {
    const lp = D.linhas[s.k]
    const d = lp.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' ')
    g += `<path d="${d}" fill="none" stroke="${s.cor}" stroke-width="${s.w}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round"/>`
  }
  // rotulo direto na ponta de cada linha (identidade nunca so por cor)
  const fins = series.map(s => ({ s, v: D.linhas[s.k][D.linhas[s.k].length - 1].saldo })).sort((a, b) => b.v - a.v)
  let ultimo = -99
  for (const f of fins) {
    let yy = y(f.v)
    if (yy - ultimo < 11.5) yy = ultimo + 11.5
    ultimo = yy
    g += `<line x1="${W - R}" y1="${y(f.v).toFixed(1)}" x2="${W - R + 8}" y2="${yy.toFixed(1)}" stroke="${f.s.cor}" stroke-width=".8"/>`
    g += `<text x="${W - R + 11}" y="${(yy + 2.6).toFixed(1)}" font-size="7.6" fill="${INK}">${f.s.rot} <tspan fill="${MUTED}">${kk(f.v)}</tspan></text>`
  }
  return g + '</svg>'
}

/* ===================== G2 — entradas e saídas por dia ===================== */
function gBarras() {
  const W = 762, H = 168, L = 52, R = 16, T = 12, B = 34
  const pts = D.linhas.CHEFE_25
  const max = Math.max(...pts.map(p => Math.max(p.entradas, p.saidas)))
  const bw = (W - L - R) / pts.length
  const y = v => T + ((max - v) * (H - T - B)) / max
  let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Inter, sans-serif">`
  for (let i = 0; i <= 3; i++) {
    const v = (max * i) / 3
    g += `<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}" stroke="${GRID}" stroke-width=".7"/>`
    g += `<text x="${L - 6}" y="${(y(v) + 3).toFixed(1)}" font-size="7.4" fill="${MUTED}" text-anchor="end">${kk(v)}</text>`
  }
  pts.forEach((p, i) => {
    const cx = L + i * bw
    const w = bw / 2 - 1.6
    if (p.entradas > 0) g += `<rect x="${(cx + 0.8).toFixed(1)}" y="${y(p.entradas).toFixed(1)}" width="${w.toFixed(1)}" height="${(H - B - y(p.entradas)).toFixed(1)}" fill="${INK}" rx="1.6"/>`
    if (p.saidas > 0) g += `<rect x="${(cx + bw / 2 + 0.8).toFixed(1)}" y="${y(p.saidas).toFixed(1)}" width="${w.toFixed(1)}" height="${(H - B - y(p.saidas)).toFixed(1)}" fill="${SOFT}" rx="1.6"/>`
    if (i % 3 === 0) g += `<text x="${(cx + bw / 2).toFixed(1)}" y="${H - B + 12}" font-size="7" fill="${MUTED}" text-anchor="middle">${dm(p.data)}</text>`
  })
  const iJmp = pts.findIndex(p => p.data === D.diaJmp)
  const i25 = pts.findIndex(p => p.data === '2026-09-25')
  g += `<text x="${(L + iJmp * bw + bw / 2).toFixed(1)}" y="${(y(pts[iJmp].entradas) - 4).toFixed(1)}" font-size="7.4" fill="${INK}" text-anchor="middle">JMP+Naviraí ${kk(pts[iJmp].entradas)}</text>`
  g += `<text x="${(L + i25 * bw + bw / 2).toFixed(1)}" y="${(y(pts[i25].saidas) - 4).toFixed(1)}" font-size="7.4" fill="${INK}" text-anchor="middle">comissões + chefe ${kk(pts[i25].saidas)}</text>`
  g += `<rect x="${W - 150}" y="${T}" width="8" height="8" fill="${INK}" rx="1.4"/><text x="${W - 138}" y="${T + 7}" font-size="7.4" fill="${MUTED}">entra</text>`
  g += `<rect x="${W - 96}" y="${T}" width="8" height="8" fill="${SOFT}" rx="1.4"/><text x="${W - 84}" y="${T + 7}" font-size="7.4" fill="${MUTED}">sai</text>`
  return g + '</svg>'
}

/* ===================== G3 — quanto cabe pagar, por cenário ===================== */
function gCabe() {
  const linhas = D.capacidades
  const W = 762, rowH = 23, L = 236, R = 78, T = 16
  const H = T + linhas.length * rowH + 14
  const vals = linhas.map(c => c.cabe).concat([D.alvoChefe, 0])
  const max = Math.max(...vals), min = Math.min(...vals, 0)
  const x = v => L + ((v - min) * (W - L - R)) / (max - min)
  let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Inter, sans-serif">`
  g += `<line x1="${x(0).toFixed(1)}" y1="${T - 8}" x2="${x(0).toFixed(1)}" y2="${H - 12}" stroke="${INK}" stroke-width="1"/>`
  g += `<line x1="${x(D.alvoChefe).toFixed(1)}" y1="${T - 10}" x2="${x(D.alvoChefe).toFixed(1)}" y2="${H - 12}" stroke="${GOLD}" stroke-width="1.4" stroke-dasharray="4 2"/>`
  g += `<text x="${(x(D.alvoChefe) + 4).toFixed(1)}" y="${T - 3}" font-size="7.6" fill="${GOLD}">meta ${brl0(D.alvoChefe)}</text>`
  linhas.forEach((c, i) => {
    const yy = T + i * rowH
    const x0 = Math.min(x(0), x(c.cabe)), x1 = Math.max(x(0), x(c.cabe))
    g += `<text x="0" y="${(yy + 12).toFixed(1)}" font-size="8.4" fill="${INK}">${esc(corta(c.rot, 46))}</text>`
    g += `<rect x="${x0.toFixed(1)}" y="${(yy + 3).toFixed(1)}" width="${Math.max(1.4, x1 - x0).toFixed(1)}" height="13" rx="3" fill="${c.cabe >= D.alvoChefe ? GOLD : c.cabe >= 0 ? INK : SOFT}"/>`
    const lx = c.cabe >= 0 ? x1 + 5 : x0 - 5
    g += `<text x="${lx.toFixed(1)}" y="${(yy + 13).toFixed(1)}" font-size="8.4" fill="${INK}" text-anchor="${c.cabe >= 0 ? 'start' : 'end'}" font-weight="600" stroke="#fff" stroke-width="2.6" paint-order="stroke">${sinal0(c.cabe)}</text>`
  })
  return g + '</svg>'
}

const foot = () => `<div class="pfoot"><span>Bula Assessoria Pecuária — Posição de caixa e o pagamento de R$ ${brl0(D.alvoChefe)} · 09/09 a 10/10/2026</span><span>Gerado em 09/09/2026 · fonte: ERP (conciliado até ${dm(D.conciliadoAte)})</span></div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Bula — Caixa e o pagamento de R$ ${brl0(D.alvoChefe)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; color: ${INK}; margin: 0; font-size: 10.2px; line-height: 1.52; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1,h2,h3 { font-family: Oswald, "Arial Narrow", Impact, sans-serif; text-transform: uppercase; letter-spacing: .022em; font-weight: 600; margin: 0; }
  .page { width: 210mm; height: 296mm; padding: 14mm 13mm 17mm; position: relative; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .pfoot { position: absolute; left: 13mm; right: 13mm; bottom: 7mm; font-size: 7.4px; color: #A6A6A6;
           display: flex; justify-content: space-between; border-top: 1px solid ${GRID}; padding-top: 2mm; }
  .capa { background: ${INK}; color: #fff; padding: 30mm 20mm 20mm; display: flex; flex-direction: column; }
  .capa img { width: 42mm; margin-bottom: 20mm; }
  .capa h1 { font-size: 40px; line-height: 1.04; color: #fff; font-weight: 700; }
  .capa .sub { font-size: 12.2px; color: #B5B5B5; margin-top: 7mm; max-width: 140mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
  .capa .rule { width: 26mm; height: 3px; background: ${GOLD}; margin: 8mm 0; }
  .capa .meta { margin-top: auto; flex-wrap: wrap; row-gap: 6mm; display: flex; gap: 11mm; border-top: 1px solid #2A2A2A; padding-top: 6mm; }
  .capa .meta div span { display: block; font-size: 8.5px; color: #8A8A8A; text-transform: uppercase; letter-spacing: .09em; margin-bottom: 2px; }
  .capa .meta div strong { font-size: 12px; font-weight: 600; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid ${INK}; padding-bottom: 3mm; margin-bottom: 6mm; }
  .head h2 { font-size: 21px; }
  .head .n { font-size: 9px; color: ${MUTED}; letter-spacing: .12em; text-transform: uppercase; font-family: Oswald, sans-serif; }
  h3 { font-size: 13px; margin: 6mm 0 2.4mm; }
  h3:first-of-type { margin-top: 0; }
  p { margin: 0 0 3mm; }
  .lead { font-size: 11.4px; line-height: 1.58; }
  strong { font-weight: 600; }
  .muted { color: ${MUTED}; }
  .small { font-size: 9px; color: ${MUTED}; line-height: 1.5; }
  .tiles { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin: 4mm 0 6mm; }
  .tile { border: 1px solid ${GRID}; border-top: 3px solid ${INK}; padding: 3.4mm 3.4mm 3mm; }
  .tile .k { font-size: 8px; text-transform: uppercase; letter-spacing: .085em; color: ${MUTED}; margin-bottom: 1.6mm; line-height: 1.3; min-height: 5.6mm; }
  .tile .v { font-family: Oswald, sans-serif; font-size: 18.5px; font-weight: 600; line-height: 1; }
  .tile .v .cur { font-size: 11px; font-weight: 500; color: ${MUTED}; margin-right: 1px; }
  .tile .d { font-size: 8.4px; color: ${MUTED}; margin-top: 1.6mm; line-height: 1.4; }
  .tile.gold { border-top-color: ${GOLD}; }
  .tile.neg .v { color: #7A1F1F; }
  .box { border: 1px solid ${GRID}; padding: 4mm 4.4mm; margin: 4mm 0; }
  .box.dark { background: ${INK}; color: #fff; border-color: ${INK}; }
  .box.dark .t { color: ${GOLD}; }
  .box.dark p, .box.dark li { color: #D8D8D8; }
  .box.dark strong { color: #fff; }
  .box.rule { border: none; border-left: 3px solid ${INK}; padding: 1mm 0 1mm 4mm; }
  .box.gold { border-left: 3px solid ${GOLD}; border-top: none; border-right: none; border-bottom: none; padding: 1mm 0 1mm 4mm; }
  .box .t { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; margin-bottom: 2.2mm; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 9.3px; margin: 3mm 0; }
  th { text-align: left; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.4px; letter-spacing: .07em; font-weight: 600;
       border-bottom: 1.4px solid ${INK}; padding: 2mm 1.8mm; }
  td { padding: 1.6mm 1.8mm; border-bottom: 1px solid #F0F0F0; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.destaque td { background: #F6F6F6; font-weight: 600; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  tr.neg td { color: #7A1F1F; }
  figure { margin: 3mm 0 5mm; }
  figcaption { font-size: 8.6px; color: ${MUTED}; margin-top: 1.8mm; line-height: 1.45; }
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.6mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .tag { display:inline-block; font-size:7.6px; letter-spacing:.06em; text-transform:uppercase; border:1px solid ${GRID}; padding:0 1.2mm; color:${MUTED}; }
  .tag.on { border-color:${INK}; color:${INK}; }
  .tag.gold { border-color:${GOLD}; color:#8A7331; }
</style></head><body>

<!-- ============================= CAPA ============================= -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Caixa de setembro<br>e os R$ ${brl0(D.alvoChefe)} do Marcelo</h1>
  <div class="rule"></div>
  <div class="sub">O caixa de hoje é <strong style="color:#fff">R$ ${brl(D.caixa.total)}</strong>. Até 10/10 entram
  <strong style="color:#fff">R$ ${brl0(D.somaCrJanela)}</strong> com data e saem <strong style="color:#fff">R$ ${brl0(saidasJanela)}</strong> —
  mas R$ ${brl0(D.felipe.valor)} do que entra no dia 10 é do Felipe, não nosso, e o dia 25 concentra
  <strong style="color:#fff">R$ ${brl0(D.comissoes25)}</strong> de comissões.
  Do jeito que está, <strong style="color:#fff">não cabe pagar os ${brl0(D.alvoChefe)}</strong>: falta ${sinal0(Math.abs(capHoje.cabe))}.
  O que muda o sinal é o <strong style="color:#fff">EAO</strong> — a NF 639 de R$ ${brl0(D.somaCrEao)}, emitida em 02/09 e até hoje sem data de pagamento.</div>
  <div class="meta">
    <div><span>Caixa em ${dm(D.hoje)}</span><strong>R$ ${brl(D.caixa.total)}</strong></div>
    <div><span>Cabe pagar hoje</span><strong>${sinal0(capHoje.cabe)}</strong></div>
    <div><span>Cabe se o EAO pagar</span><strong>${sinal0(capEao.cabe)}</strong></div>
    <div><span>Com as alavancas + EAO</span><strong>${sinal0(capTudo.cabe)}</strong></div>
  </div>
</section>

<!-- ============================= P1 — A RESPOSTA ============================= -->
<section class="page">
  <div class="head"><h2>1 · A resposta</h2><span class="n">09/09 a 10/10/2026</span></div>

  <p class="lead">Você perguntou se dá para pagar os <strong>R$ ${brl(D.alvoChefe)}</strong> do Marcelo nas próximas semanas.
  A resposta curta é: <strong>não com o que está travado hoje</strong> — e falta pouco.
  Mantendo um colchão de R$ ${brl0(D.reserva)} até 10/10, a capacidade de pagamento hoje é <strong>${sinal(capHoje.cabe)}</strong>.
  Se o EAO pagar a NF 639, ela vira <strong>${sinal(capEao.cabe)}</strong> — a ${sinal(faltaEao)} da meta.
  Com as duas alavancas internas somadas ao EAO, sobe para <strong>${sinal(capTudo.cabe)}</strong> e o pagamento cabe já em <strong>${dm(D.janelas.cedoTudo.data)}</strong>.</p>

  <figure>${gCabe()}
  <figcaption>Quanto cabe pagar ao Marcelo em 25/09 mantendo R$ ${brl0(D.reserva)} de colchão até 10/10, em cada configuração.
  A linha dourada é a meta de R$ ${brl0(D.alvoChefe)}. Barras cinzas são capacidade negativa: pagar ali fura o caixa.</figcaption></figure>

  <div class="tiles">
    <div class="tile"><div class="k">Caixa hoje (ERP)</div><div class="v"><span class="cur">R$</span>${brl(D.caixa.total)}</div><div class="d">conciliado até ${dm(D.conciliadoAte)} — ${D.gapDias} dias sem extrato</div></div>
    <div class="tile neg"><div class="k">Cabe pagar hoje</div><div class="v">${sinal0(capHoje.cabe)}</div><div class="d">nem os 63.500, nem R$ 1: o mês já fecha negativo</div></div>
    <div class="tile gold"><div class="k">Cabe com o EAO</div><div class="v"><span class="cur">R$</span>${brl0(capEao.cabe)}</div><div class="d">falta ${sinal0(faltaEao)} para a meta</div></div>
    <div class="tile gold"><div class="k">Cabe com EAO + alavancas</div><div class="v"><span class="cur">R$</span>${brl0(capTudo.cabe)}</div><div class="d">e o pagamento cabe já em ${dm(D.janelas.cedoTudo.data)}</div></div>
  </div>

  <h3>Por que o JMP de amanhã não resolve</h3>
  <p>Amanhã entram <strong>R$ ${brl(D.somaCrConfirmado)}</strong> — R$ ${brl(somaJmp)} do JMP e R$ ${brl(somaNavirai)} do Naviraí. Parece o dobro do que você precisa,
  mas <strong>R$ ${brl(D.felipe.valor)} desse dinheiro é do Felipe</strong>: a 2ª parcela das NFs 618/619 foi faturada dentro do CNPJ da Bula, e do repasse líquido
  desconta-se só a metade do ISS. <strong>Do JMP sobram R$ ${brl(restaJmp)}.</strong> Com o Naviraí, o dia 10 acrescenta
  <strong>R$ ${brl(r2(restaJmp + somaNavirai))}</strong> de caixa próprio — não R$ ${brl0(D.somaCrConfirmado)}.</p>

  <div class="box dark">
    <div class="t">As três coisas que decidem o pagamento</div>
    <ol style="margin-bottom:0">
      <li><strong>O EAO.</strong> R$ ${brl(D.somaCrEao)} da NF 639, emitida em 02/09 e mandada por e-mail com pedido de previsão de pagamento — <strong>que nunca foi respondido</strong>. É a maior peça solta do mês e sozinha quase paga o Marcelo.</li>
      <li><strong>As comissões do dia 25.</strong> R$ ${brl(D.comissoes25)} em ${D.nComissoes25} títulos, o maior bloco de saída do ano. Dentro deles, <strong>R$ ${brl(D.somaADefinir)} em ${D.comissaoADefinir.length} títulos "a definir"</strong> — sem beneficiário decidido, não têm como ser pagos no dia 25.</li>
      <li><strong>Os vencidos a receber.</strong> R$ ${brl(D.somaCrVencido)} em ${D.crVencido.length} títulos, o mais velho de 02/05. Cobrança que já deveria ter entrado.</li>
    </ol>
  </div>

  <h3>A recomendação: prometa a data ao EAO, não ao calendário</h3>
  <p>Antecipar ou parcelar o pagamento <strong>não muda onde o mês fecha</strong> — muda só o dia em que o buraco aparece.
  O que muda o resultado é dinheiro entrando ou saída adiada. Por isso a proposta é amarrar o pagamento do Marcelo à liquidação da NF 639:</p>

  <table>
    <tr><th>Quando</th><th>O que fazer</th><th class="num">Valor</th></tr>
    <tr><td>Hoje a 12/09</td><td>Cobrar a data do EAO por escrito e executar as duas alavancas: decidir as ${D.comissaoADefinir.length} comissões “a definir” e disparar a cobrança dos vencidos.</td><td class="num">—</td></tr>
    <tr class="destaque"><td>Se o EAO pagar até 24/09</td><td><strong>Paga os R$ ${brl0(D.alvoChefe)} inteiros no dia 25</strong>, no ciclo normal, junto com as comissões da casa. Sobra de ${sinal0(COMEAO.final)} em 10/10.</td><td class="num">${brl(D.alvoChefe)}</td></tr>
    <tr><td>Se o EAO não responder</td><td>Paga no dia 25 só o que as alavancas internas abrem (${sinal0(capAlav.cabe)}) e o saldo assim que a NF 639 cair. Sem as alavancas, setembro não comporta nenhum valor.</td><td class="num">${brl(capAlav.cabe)} + saldo</td></tr>
  </table>

  <p class="small">O colchão de R$ ${brl0(D.reserva)} não é exagero: o ERP não tem <strong>nenhum</strong> recebível lançado depois de 10/10 — não porque não exista,
  mas porque os leilões de setembro ainda não foram faturados. Até essas notas saírem, depois da folha de 05/10 só se enxerga despesa.</p>

  ${foot()}
</section>

<!-- ============================= P2 — CAIXA HOJE ============================= -->
<section class="page">
  <div class="head"><h2>2 · Onde o caixa está hoje</h2><span class="n">conciliado até ${dm(D.conciliadoAte)}</span></div>

  <div class="tiles">
    <div class="tile"><div class="k">Sicoob CC 1.056-1</div><div class="v"><span class="cur">R$</span>${brl(D.caixa.sicoob)}</div><div class="d">última conciliação em ${dm(D.conciliadoAte)}</div></div>
    <div class="tile"><div class="k">Sicredi (CC + aplicação)</div><div class="v"><span class="cur">R$</span>${brl(D.caixa.sicredi)}</div><div class="d">praticamente zerado desde 01/09</div></div>
    <div class="tile gold"><div class="k">Caixa total</div><div class="v"><span class="cur">R$</span>${brl(D.caixa.total)}</div><div class="d">é com isso que a projeção começa</div></div>
    <div class="tile"><div class="k">Buraco de leitura</div><div class="v"><span class="cur">R$</span>${brl0(D.gapEstimado)}</div><div class="d">${D.gapDias} dias sem extrato, pela média medida</div></div>
  </div>

  <div class="box gold">
    <p style="margin:0"><strong>Antes de decidir, importe o extrato.</strong> O último movimento lançado é de <strong>${dm(D.conciliadoAte)}</strong>.
    Entre ${dm(D.conciliadoAte)} e hoje passaram ${D.gapDias} dias com dois pregões (05/09) e o Mafra (06/09) — pela média medida de julho e agosto,
    isso costuma consumir cerca de <strong>R$ ${brl(D.gapEstimado)}</strong> que ainda não estão nesta conta.
    Todos os números deste relatório partem de R$ ${brl(D.caixa.total)}; se o extrato trouxer saída maior, cada cenário desce junto.</p>
  </div>

  <h3>O que já andou em setembro</h3>
  <p>Nos ${D.realizado.length ? new Set(D.realizado.map(x => x.data)).size : 0} dias lançados, entraram <strong>R$ ${brl(D.realEntradas)}</strong> e saíram <strong>R$ ${brl(D.realSaidas)}</strong>.
  A folha de agosto saiu inteira no dia 1º e o São Geraldo entrou no dia 2.</p>

  <table>
    <tr><th>Data</th><th>O que foi</th><th class="num">Entra</th><th class="num">Sai</th></tr>
    ${D.realizado.filter(x => !/Transferencias Internas/i.test(x.categoria) && x.valor >= 1000)
    .sort((a, b) => a.data.localeCompare(b.data) || b.valor - a.valor).map(x => `<tr>
      <td>${dm(x.data)}</td><td>${esc(corta(x.rot.replace(/^PIX EMIT\.OUTRA IF - Pagamento Pix - /, '').replace(/^DB\.TR\.C\.DIF\.TIT\.INT - FAV\.: /, '').replace(/^CRED\.TRANSF\.CONTAS - REM\.: /, '').replace(/^PIX REC\.OUTRA IF MT - Recebimento Pix - /, ''), 76))}</td>
      <td class="num">${x.tipo === 'entrada' ? brl(x.valor) : '—'}</td><td class="num">${x.tipo === 'saida' ? brl(x.valor) : '—'}</td></tr>`).join('')}
    <tr><td class="muted">—</td><td class="muted">+ ${D.realizado.filter(x => !/Transferencias Internas/i.test(x.categoria) && x.valor < 1000).length} lançamentos abaixo de R$ 1.000 (tarifas, ajustes)</td>
      <td class="num muted">—</td><td class="num muted">${brl(r2(D.realizado.filter(x => !/Transferencias Internas/i.test(x.categoria) && x.valor < 1000 && x.tipo === 'saida').reduce((s, x) => s + x.valor, 0)))}</td></tr>
    <tr class="total"><td colspan="2">Total (fora transferência interna)</td><td class="num">${brl(D.realEntradas)}</td><td class="num">${brl(D.realSaidas)}</td></tr>
  </table>

  <h3>As duas médias que completam a projeção</h3>
  <p>Nem toda saída vira título no ERP. O que falta entra pela <strong>média medida no extrato de julho e agosto</strong>, nunca por arbitramento:
  custo estrutural difuso de <strong>R$ ${brl(D.estruturalDia)}/dia</strong> (fora folha, imposto, comissão e leilão) e despesa de leilão de
  <strong>R$ ${brl(D.leilaoDia)}/dia</strong>. Na janela de ${D.janelaDias} dias isso soma <strong>R$ ${brl(r2(D.estruturalDifuso + D.leilaoJanela))}</strong>,
  já descontados os R$ ${brl(D.estruturalLancado)} que aparecem como título.</p>

  ${foot()}
</section>

<!-- ============================= P3 — O QUE ENTRA ============================= -->
<section class="page">
  <div class="head"><h2>3 · O que entra — e o que ainda não tem data</h2><span class="n">R$ ${brl0(r2(D.somaCrJanela + D.somaCrEao + D.somaCrVencido))} em aberto</span></div>

  <p class="lead">Você pediu posição sobre <strong>EAO, e-Rural e Mafra</strong>. Os três estão em estágios diferentes, e a diferença
  entre eles é o que separa a projeção do desejo: <span class="tag on">confirmado</span> é data que alguém disse;
  <span class="tag">regra</span> é leilão + 45 dias, que o ERP calcula sozinho; <span class="tag gold">sem data</span> é nota emitida esperando resposta.</p>

  <table>
    <tr><th>Quem</th><th>Situação hoje</th><th class="num">Valor</th><th>Data</th></tr>
    <tr class="destaque"><td>JMP (JBJ)</td><td>2ª parcela das NFs 618/619. Confirmado pelo financeiro: “dia 10 teremos o pagamento de Naviraí e JMP”. <strong>R$ ${brl(D.felipe.valor)} são repasse ao Felipe.</strong></td><td class="num">${brl(somaJmp)}</td><td>10/09 <span class="tag on">confirmado</span></td></tr>
    <tr class="destaque"><td>Naviraí</td><td>Duas etapas de matrizes (05/07 e 16/07). Você confirmou hoje: entra amanhã.</td><td class="num">${brl(somaNavirai)}</td><td>10/09 <span class="tag on">confirmado</span></td></tr>
    <tr><td>Mafra</td><td>Fêmeas (01/08) e Touros (02/08), Redenção/PA. <strong>Não há data acordada</strong> — 15 e 16/09 são leilão + 45 dias. Pendência aberta: os Touros foram lançados a 0,35% do faturamento, e a tabela de acordo para essa faixa de cobertura diz 0,3% (R$ 15.306,00).</td><td class="num">${brl(D.somaCrMafra)}</td><td>15–16/09 <span class="tag">regra</span></td></tr>
    <tr><td>e-Rural</td><td>Sorriso Touros (04/08) e LS Galeria II (07/08), com NFs 637 e 638 emitidas em 01/09. Você diz que entra em breve; <strong>ninguém deu data</strong>, e a e-Rural já deixou vencer o Sorriso Fêmeas (R$ ${brl(D.crVencido.filter(t => t.erural).reduce((s, t) => s + t.valor, 0))}, vencido em 26/08).</td><td class="num">${brl(D.somaCrErural)}</td><td>18 e 21/09 <span class="tag">regra</span></td></tr>
    <tr><td><strong>EAO</strong></td><td><strong>NF 639 emitida em 02/09</strong>, R$ ${brl(D.somaCrEao)}, referente ao 13º MegaBaviera (fêmeas 10–11/07 + machos 12/07), sem retenção. A nota foi enviada ao e-mail pedido e a previsão de pagamento <strong>nunca voltou</strong>. Contato: Max Pereira.</td><td class="num">${brl(D.somaCrEao)}</td><td>— <span class="tag gold">sem data</span></td></tr>
    <tr><td>Marcondes</td><td>Leilão Nelore Marcondes — Abertura, 3 itens consolidados, venda 23/08. <strong>Informado por você hoje</strong>; ainda não existe título no ERP e o portal da leiloeira pede a nota fiscal anexada antes de pagar.</td><td class="num">${brl(D.extraInformado[0].valor)}</td><td>15/09 <span class="tag">informado</span></td></tr>
    <tr class="total"><td colspan="2">Somando tudo o que está em aberto até 10/10</td><td class="num">${brl(r2(D.somaCrJanela + D.somaCrEao))}</td><td></td></tr>
  </table>

  <div class="box rule">
    <p style="margin:0"><strong>Uma correção no ERP que muda o total do EAO.</strong> As duas estimativas antigas do MegaBaviera
    (R$ ${brl(D.somaCrDuplicado)} somadas) continuam abertas ao lado do título consolidado da NF 639.
    São <strong>o mesmo evento contado duas vezes</strong>: a auditoria de hoje substituiu as estimativas pela nota, mas não fechou os títulos antigos.
    Este relatório conta só a NF 639 — no ERP, o painel ainda mostra R$ ${brl(r2(D.somaCrEao + D.somaCrDuplicado))} de EAO a receber.</p>
  </div>

  ${foot()}
</section>

<!-- ============================= P4 — RECEBIVEIS TITULO A TITULO ============================= -->
<section class="page">
  <div class="head"><h2>4 · Título a título</h2><span class="n">${D.crJanela.length + D.crVencido.length} recebíveis</span></div>

  <div class="cols2">
    <div>
      <h3>Entra na janela, por data</h3>
      <table>
        <tr><th>Venc.</th><th>Título</th><th class="num">Valor</th></tr>
        ${D.crJanela.map(t => `<tr${t.jmp || t.mafra ? ' class="destaque"' : ''}><td>${dm(t.venc)}</td><td>${esc(corta(limpa(t.rot), 40))}</td><td class="num">${brl(t.valor)}</td></tr>`).join('')}
        <tr class="total"><td colspan="2">Total com data</td><td class="num">${brl(D.somaCrJanela)}</td></tr>
      </table>
      <p class="small">Destacados o JMP e o Mafra: são R$ ${brl0(r2(somaJmp + D.somaCrMafra))} dos R$ ${brl0(D.somaCrJanela)}, ou ${Math.round((somaJmp + D.somaCrMafra) / D.somaCrJanela * 100)}% de tudo que entra.</p>
    </div>
    <div>
      <h3>Vencido — cobrança parada</h3>
      <table>
        <tr><th>Venc.</th><th>Título</th><th class="num">Valor</th></tr>
        ${D.crVencido.map(t => `<tr><td>${dm(t.venc)}</td><td>${esc(corta(limpa(t.rot), 40))}</td><td class="num">${brl(t.valor)}</td></tr>`).join('')}
        <tr class="total"><td colspan="2">Total vencido</td><td class="num">${brl(D.somaCrVencido)}</td></tr>
      </table>
      <p class="small">Nenhum deles entra na linha do caixa — vencido não é realocado para “amanhã”, porque quem define data de cobrança é você.
      Eles aparecem só no cenário de recuperação.</p>

      <h3>Sem data</h3>
      <table>
        <tr><th>Título</th><th class="num">Valor</th></tr>
        ${D.crEao.map(t => `<tr class="destaque"><td>${esc(corta(limpa(t.rot), 46))}</td><td class="num">${brl(t.valor)}</td></tr>`).join('')}
      </table>
      <p class="small">A NF 639 é o maior recebível isolado da casa hoje — maior que o Mafra inteiro (R$ ${brl0(D.somaCrMafra)})
      e ${(D.somaCrEao / D.somaCrVencido).toFixed(1).replace('.', ',')}× o total dos vencidos.</p>
    </div>
  </div>

  ${foot()}
</section>

<!-- ============================= P5 — O QUE SAI ============================= -->
<section class="page">
  <div class="head"><h2>5 · O que sai</h2><span class="n">R$ ${brl0(saidasJanela)} até 10/10</span></div>

  <figure>${gBarras()}
  <figcaption>Entradas e saídas por dia no cenário em que o chefe é pago no dia 25. O mês inteiro cabe em dois dias:
  o 10, que traz o JMP e o Naviraí, e o 25, que leva as comissões.</figcaption></figure>

  <div class="tiles">
    <div class="tile"><div class="k">Títulos com data</div><div class="v"><span class="cur">R$</span>${brl0(D.somaCpJanela)}</div><div class="d">${D.cpJanela.length} títulos até 10/10</div></div>
    <div class="tile"><div class="k">Comissões do dia 25</div><div class="v"><span class="cur">R$</span>${brl0(D.comissoes25)}</div><div class="d">${D.nComissoes25} títulos — ${Math.round(D.comissoes25 / D.somaCpJanela * 100)}% de tudo que sai</div></div>
    <div class="tile"><div class="k">Folha de 05/10</div><div class="v"><span class="cur">R$</span>${brl0(D.folha0510)}</div><div class="d">${D.nFolha0510} pessoas, competência setembro</div></div>
    <div class="tile"><div class="k">DAS de agosto (estimado)</div><div class="v"><span class="cur">R$</span>${brl0(D.dasEstimado)}</div><div class="d">vence ${dm(D.dasVenc)} — guia ainda não chegou</div></div>
  </div>

  <div class="cols2">
    <div>
      <h3>Por categoria, até 10/10</h3>
      <table>
        <tr><th>Categoria</th><th class="num">Valor</th></tr>
        ${D.porCategoriaJanela.map(c => `<tr><td>${esc(corta(c.categoria, 34))}</td><td class="num">${brl(c.valor)}</td></tr>`).join('')}
        <tr><td>DAS de agosto (estimado)</td><td class="num">${brl(D.dasEstimado)}</td></tr>
        <tr><td>Estrutural + leilão (média medida)</td><td class="num">${brl(r2(D.estruturalDifuso + D.leilaoJanela))}</td></tr>
        <tr class="total"><td>Total</td><td class="num">${brl(saidasJanela)}</td></tr>
      </table>
    </div>
    <div>
      <h3>Sem data — decisão sua</h3>
      <table>
        <tr><th>Compromisso</th><th class="num">Valor</th></tr>
        <tr class="destaque"><td>Marcelo — 35% do lucro, 1º trimestre</td><td class="num">${brl(D.chefe.valor)}</td></tr>
        <tr class="destaque"><td>Repasse do JMP ao Felipe</td><td class="num">${brl(D.felipe.valor)}</td></tr>
        ${D.cpSemDataOutros.slice(0, 8).map(t => `<tr><td>${esc(corta(t.rot, 40))}</td><td class="num">${brl(t.valor)}</td></tr>`).join('')}
        <tr><td class="muted">+ ${D.cpSemDataOutros.length - 8} títulos menores</td><td class="num muted">${brl(r2(D.somaCpSemDataOutros - D.cpSemDataOutros.slice(0, 8).reduce((s, t) => s + t.valor, 0)))}</td></tr>
        <tr class="total"><td>Total sem data</td><td class="num">${brl(D.somaCpSemData)}</td></tr>
      </table>
      <p class="small">Os R$ ${brl0(D.somaCpSemDataOutros)} de baixo são quase todos <strong>comissões da Nane</strong>, que acumulam para dezembro,
      mais hotel e reembolsos de Expogenética. Só o Marcelo e o Felipe entram nos cenários.</p>
    </div>
  </div>

  <div class="box">
    <div class="t">O DAS de agosto ainda não tem guia — mas dá para estimar com precisão</div>
    <p style="margin:0">O título existe no ERP com valor zero, “aguardando guia”. A base sai da guia de <strong>ISS que já chegou</strong>:
    R$ ${brl(D.iss)} vencendo em 15/09. Como o ISS é 5% da mesma receita, a competência de agosto foi de <strong>R$ ${brl(D.baseAgosto)}</strong> —
    e a carga média do Simples medida em julho (${(D.aliqDas * 100).toFixed(4).replace('.', ',')}%) dá <strong>R$ ${brl(D.dasEstimado)}</strong> de DAS em ${dm(D.dasVenc)}.
    <span class="muted">Agosto foi um mês de faturamento pequeno porque as notas grandes (EAO, e-Rural, São Geraldo) só saíram em 01–02/09 — o que joga
    o imposto delas para 20/10, fora desta janela, e num valor bem maior.</span></p>
  </div>

  ${foot()}
</section>

<!-- ============================= P6 — CENARIOS ============================= -->
<section class="page">
  <div class="head"><h2>6 · Os cenários</h2><span class="n">${D.cenarios.length} projeções</span></div>

  <figure>${gLinha()}
  <figcaption>Saldo ao fim de cada dia. Cada cenário tem traço próprio e rótulo na ponta — a linha grossa tracejada é o pedido
  (pagar o chefe no dia 25), a dourada é o mesmo com o EAO pagando. A linha preta horizontal é o zero.</figcaption></figure>

  <table>
    <tr><th>Cenário</th><th class="num">Pior dia</th><th>Quando</th><th class="num">Fecha em 10/10</th><th class="num">Dias neg.</th></tr>
    ${D.cenarios.map(c => `<tr${c.negativos === 0 ? ' class="destaque"' : c.fundo < -100000 ? ' class="neg"' : ''}>
      <td>${esc(c.rot)}<br><span class="small">${esc(c.nota)}</span></td>
      <td class="num">${sinal0(c.fundo)}</td><td>${dm(c.diaFundo)}</td>
      <td class="num">${sinal0(c.final)}</td><td class="num">${c.negativos}</td></tr>`).join('')}
  </table>

  <p class="small">Destacados em cinza os cenários que <strong>passam sem nenhum dia negativo</strong>. Repare que antecipar ou parcelar o pagamento
  do chefe <strong>não muda onde o mês fecha</strong> — muda só quando o buraco aparece. O que muda o resultado é entrada de dinheiro ou adiamento de saída.</p>

  ${foot()}
</section>

<!-- ============================= P7 — O QUE FAZER ============================= -->
<section class="page">
  <div class="head"><h2>7 · O que fazer nesta semana</h2><span class="n">em ordem de valor</span></div>

  <table>
    <tr><th>#</th><th>Ação</th><th class="num">Vale</th><th>Com quem</th></tr>
    <tr class="destaque"><td>1</td><td><strong>Arrancar a data do EAO.</strong> A NF 639 foi emitida em 02/09 e mandada para o e-mail que eles pediram; a previsão de pagamento nunca voltou. É a peça que decide o mês.</td><td class="num">${brl(D.somaCrEao)}</td><td>Max Pereira / financeiro EAO</td></tr>
    <tr class="destaque"><td>2</td><td><strong>Decidir as ${D.comissaoADefinir.length} comissões “a definir” do dia 25.</strong> Sem beneficiário definido elas não podem ser pagas — mas hoje estão na projeção como se fossem. Decidir (ou adiar formalmente para outubro) é caixa imediato.</td><td class="num">${brl(D.somaADefinir)}</td><td>diretoria</td></tr>
    <tr><td>3</td><td><strong>Cobrar os ${D.crVencido.length} vencidos.</strong> R$ ${brl(D.somaCrVencido)} parados, o mais velho de 02/05. Metade é Santa Cruz (R$ ${brl(r2(D.crVencido.filter(t => /SANTA CRUZ/i.test(t.rot)).reduce((s, t) => s + t.valor, 0)))}).</td><td class="num">${brl(D.somaCrVencido)}</td><td>Ana Paula / contatos por leiloeira</td></tr>
    <tr><td>4</td><td><strong>Confirmar data com Mafra e e-Rural.</strong> Os R$ ${brl(r2(D.somaCrMafra + D.somaCrErural))} dos dois são “leilão + 45 dias” calculado pelo ERP, não data acordada. Sem eles o mês fecha ${sinal0(cen('SEM_MAFRA').final)}.</td><td class="num">${brl(r2(D.somaCrMafra + D.somaCrErural))}</td><td>Programa Leilões / Vivian</td></tr>
    <tr><td>5</td><td><strong>Emitir a NF do Marcondes.</strong> O portal da leiloeira está pedindo a nota anexada para liberar o pagamento de 15/09.</td><td class="num">${brl(D.extraInformado[0].valor)}</td><td>Ana Paula</td></tr>
    <tr><td>6</td><td><strong>Importar o extrato de ${dm(D.conciliadoAte)} até hoje.</strong> ${D.gapDias} dias sem lançamento, com dois pregões no meio. Toda a projeção parte do saldo de ${dm(D.conciliadoAte)}.</td><td class="num">~${brl(D.gapEstimado)}</td><td>você</td></tr>
    <tr><td>7</td><td><strong>Fechar as duas estimativas antigas do EAO no ERP.</strong> Elas duplicam a NF 639 e inflam o contas a receber em R$ ${brl(D.somaCrDuplicado)}.</td><td class="num">${brl(D.somaCrDuplicado)}</td><td>você</td></tr>
  </table>

  <h3>O que este relatório não promete</h3>
  <ul>
    <li><strong>Nenhuma data de recebimento aqui é garantia.</strong> Só JMP e Naviraí (10/09) têm confirmação de gente; o resto é regra de +45 dias que o ERP aplica sozinho quando a planilha não traz data.</li>
    <li><strong>O DAS de agosto é estimativa</strong> (R$ ${brl(D.dasEstimado)}), derivada da guia de ISS. Quando a guia chegar, o número troca.</li>
    <li><strong>A fatura de cartão de 22/09 (R$ ${brl(r2(D.cpJanela.filter(t => /Fatura cartao/i.test(t.rot)).reduce((s, t) => s + t.valor, 0)))}) está lançada por estimativa</strong>, repetindo agosto. A leitura do Sicoob em 26/08 apontava R$ 4.829,66 para a próxima fatura — se for esse o valor, sobram R$ ${brl(r2(D.cpJanela.filter(t => /Fatura cartao/i.test(t.rot)).reduce((s, t) => s + t.valor, 0) - 4829.66))} a favor do caixa.</li>
    <li><strong>A janela termina em 10/10 por escolha:</strong> ela cobre a folha de 05/10, que é a primeira parede depois do dia 25. O imposto sobre o faturamento de setembro — que já passa de R$ 120 mil com as notas de 01–02/09 — vence em 20/10, fora daqui.</li>
  </ul>

  <h3>Para quem ligar</h3>
  <div class="cols2">
    <table>
      <tr><th>Leiloeira</th><th>Contato de cobrança</th></tr>
      <tr class="destaque"><td>EAO</td><td>Max Pereira (comercial) · +55 34 9672-7349<br><span class="small">institucional (73) 99859-4839 · helio@eaoempreendimentos.com</span></td></tr>
      <tr class="destaque"><td>e-Rural</td><td>Vivian Lutgard · +55 65 9325-4687<br><span class="small">admin do grupo “PARCERIA BULA e ERURAL”</span></td></tr>
      <tr><td>Naviraí</td><td>Elvis · +55 34 9294-9959<br><span class="small">financeiro Chácara Naviraí (67) 98158-0001</span></td></tr>
    </table>
    <table>
      <tr><th>Leiloeira</th><th>Contato de cobrança</th></tr>
      <tr><td>Santa Cruz</td><td>Nelore Santa Cruz · +55 61 8626-1377<br><span class="small">R$ ${brl(r2(D.crVencido.filter(t => /SANTA CRUZ/i.test(t.rot)).reduce((s, t) => s + t.valor, 0)))} vencidos em 3 títulos</span></td></tr>
      <tr><td>Genética Aditiva</td><td>Claudinei Sandim · +55 67 9984-6958<br><span class="small">2ª parcela combinada para 26/09</span></td></tr>
      <tr><td>Guadalupe</td><td><span class="muted">sem contato salvo</span><br><span class="small">candidata: Valéria Borges +55 67 9601-4226</span></td></tr>
    </table>
  </div>
  <p class="small">Contatos conferidos em 12/08/2026. Kirz e Neloraço são Bula Remates — acerto interno, não cobrança externa.</p>

  <div class="box dark">
    <div class="t">Em uma frase</div>
    <p style="margin:0" class="lead">Com o que está travado hoje, <strong>os R$ ${brl(D.alvoChefe)} não cabem</strong> — o mês já fecha ${sinal(REPASSE.final)} sem eles,
    porque o dia 25 leva R$ ${brl0(D.comissoes25)} de comissões e o JMP de amanhã é, na maior parte, dinheiro do Felipe.
    <strong>O EAO paga o Marcelo</strong>: com a NF 639 liquidada, a capacidade vai a ${sinal(capEao.cabe)} — a ${sinal(faltaEao)} da meta — e com as duas alavancas internas
    o pagamento cabe inteiro já em ${dm(D.janelas.cedoTudo.data)}.</p>
  </div>

  ${foot()}
</section>

</body></html>`

fs.writeFileSync(path.join(OUT, 'relatorio.html'), html)
console.log('HTML:', path.join(OUT, 'relatorio.html'))

const browser = await chromium.launch()
const pg = await browser.newPage({ viewport: { width: 900, height: 1200 } })
await pg.setContent(html, { waitUntil: 'networkidle' })
try { await pg.evaluate(() => document.fonts.ready) } catch { }
const over = await pg.evaluate(() => Array.from(document.querySelectorAll('.page')).map((p, i) => ({ i: i + 1, over: p.scrollHeight - p.clientHeight })).filter(x => x.over > 1))
if (over.length) console.log('ATENCAO paginas transbordando:', JSON.stringify(over))
else console.log('paginas OK (nenhuma transborda)')
const desktop = path.join(os.homedir(), 'Desktop')
const pdfPath = path.join(desktop, 'Bula - Caixa de Setembro e o Pagamento de 63.500.pdf')
// Margem ZERO: cada .page ja e 210x297mm com padding proprio. Qualquer margem
// aqui soma a altura da folha e joga uma pagina em branco entre as reais.
await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
const nPdf = await pg.evaluate(() => document.querySelectorAll('.page').length)
console.log('secoes no HTML:', nPdf)
await browser.close()
console.log('PDF:', pdfPath)
