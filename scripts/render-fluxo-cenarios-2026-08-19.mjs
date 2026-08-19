/**
 * Renderiza o relatorio de cenarios de fluxo de caixa a partir de
 * outputs/fluxo-cenarios-2026-09/dados.json. Paleta monocromatica do brandbook.
 * Gera HTML + PDF A4 na Area de Trabalho.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { chromium } from 'playwright'

const OUT = 'outputs/fluxo-cenarios-2026-09'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pc = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
const pc2 = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
const r2 = n => Math.round(Number(n) * 100) / 100
const kk = n => {
  const a = Math.abs(n)
  if (a >= 1e6) return (n / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'mi'
  if (a >= 1000) return (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + 'k'
  return brl0(n)
}
const dm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7)
const corta = (t, n) => {
  const x = String(t)
  if (x.length <= n) return x
  const c = x.slice(0, n), sp = c.lastIndexOf(' ')
  return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–]+$/, '') + '…'
}

const INK = '#0A0A0A', REF = '#8C8C8C', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C'

const celula = (reg, dec) => D.matriz.find(m => m.regime === reg).celulas.find(c => c.decisao === dec)
const semData = D.receber.filter(x => !x.firme && !x.negociando)
const firmes = D.receber.filter(x => x.firme)
const negociando = D.receber.filter(x => x.negociando)
const necessidade25 = D.necessidade.nada.find(x => x.ate === '2026-08-25').precisa

/* ============ G1 — composição do que a Bula tem a receber ============ */
function gFirmeza() {
  const W = 760, H = 112, L = 0, R = 0, T = 18, bh = 34
  const tot = D.firmeza.total
  const segs = [
    { v: D.firmeza.firme, f: INK, rot: 'com data acordada' },
    { v: D.firmeza.negociando, f: '#8C8C8C', rot: 'em negociação' },
    { v: D.firmeza.semData, f: '#DCDCDC', rot: 'sem data nenhuma' },
  ]
  let x = L, out = '', leg = '', lx = 0
  segs.forEach(s => {
    const w = (W - L - R) * s.v / tot
    out += `<rect x="${x.toFixed(1)}" y="${T}" width="${w.toFixed(1)}" height="${bh}" fill="${s.f}"/>`
    if (w > 96) {
      const claro = s.f === '#DCDCDC'
      out += `<text x="${(x + 8).toFixed(1)}" y="${T + 15}" font-size="10.5" font-weight="700" fill="${claro ? INK : '#fff'}">R$ ${brl0(s.v)}</text>`
      out += `<text x="${(x + 8).toFixed(1)}" y="${T + 27}" font-size="8.8" fill="${claro ? MUTED : '#C8C8C8'}">${pc(100 * s.v / tot)}</text>`
    }
    leg += `<g transform="translate(${lx},${H - 4})"><rect x="0" y="-9" width="14" height="9" fill="${s.f}"/>
      <text x="19" y="-1" font-size="9" fill="${INK}">${esc(s.rot)} — R$ ${brl0(s.v)} (${pc(100 * s.v / tot)})</text></g>`
    lx += 250
    x += w
  })
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Composição do que a Bula tem a receber por firmeza da data">
    <text x="0" y="10" font-size="9" fill="${MUTED}">R$ ${brl(tot)} a receber até 31/10</text>${out}${leg}</svg>`
}

/* ============ G2 — agosto: com e sem a cobrança do EAO ============ */
function gAgosto() {
  const W = 760, H = 300, L = 62, R = 92, T = 22, B = 44
  const A = D.linhas.NOM100.filter(p => p.data <= '2026-08-31')
  const B2 = D.linhas.PISO100.filter(p => p.data <= '2026-08-31')
  const todos = A.concat(B2).map(p => p.saldo)
  const max = Math.max(...todos) * 1.14, min = Math.min(0, Math.min(...todos) * 1.5)
  const x = i => L + i * (W - L - R) / (A.length - 1)
  const y = v => T + (H - T - B) * (1 - (v - min) / (max - min))
  let grid = ''
  for (let i = 0; i <= 4; i++) {
    const v = min + (max - min) * i / 4, yy = y(v)
    grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    grid += `<text x="${L - 8}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="${MUTED}">${kk(v)}</text>`
  }
  const path = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' ')
  const iCrit = A.findIndex(p => p.data === '2026-08-25')
  const eixo = A.map((p, i) => (i % 2 === 0 || i === A.length - 1)
    ? `<text x="${x(i).toFixed(1)}" y="${H - B + 15}" text-anchor="middle" font-size="9" fill="${MUTED}">${dm(p.data)}</text>` : '').join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Saldo do Sicoob em agosto, com e sem as cobranças sem data">
    ${grid}
    <line x1="${x(iCrit).toFixed(1)}" y1="${T}" x2="${x(iCrit).toFixed(1)}" y2="${H - B}" stroke="${GOLD}" stroke-width="1" stroke-dasharray="2 2"/>
    <text x="${x(iCrit).toFixed(1)}" y="${T - 7}" text-anchor="middle" font-size="8.6" fill="${MUTED}">25/08 · comissões de julho</text>
    <path d="${path(A)}" fill="none" stroke="${REF}" stroke-width="1.8" stroke-dasharray="3 3"/>
    <path d="${path(B2)}" fill="none" stroke="${INK}" stroke-width="2.4"/>
    <line x1="${L}" y1="${y(0).toFixed(1)}" x2="${W - R}" y2="${y(0).toFixed(1)}" stroke="${INK}" stroke-width="1.2"/>
    <circle cx="${x(iCrit).toFixed(1)}" cy="${y(B2[iCrit].saldo).toFixed(1)}" r="4.4" fill="${GOLD}" stroke="#fff" stroke-width="2"/>
    <text x="${(x(A.length - 1) + 8).toFixed(1)}" y="${(y(A[A.length - 1].saldo) + 3.5).toFixed(1)}" font-size="9.6" font-weight="700" fill="${MUTED}">${kk(A[A.length - 1].saldo)}</text>
    <text x="${(x(B2.length - 1) + 8).toFixed(1)}" y="${(y(B2[B2.length - 1].saldo) + 3.5).toFixed(1)}" font-size="9.6" font-weight="700" fill="${INK}">${kk(B2[B2.length - 1].saldo)}</text>
    ${eixo}
    <g transform="translate(${L},${H - 8})">
      <line x1="0" y1="-3.5" x2="20" y2="-3.5" stroke="${INK}" stroke-width="2.4"/><text x="26" y="0" font-size="9.2" fill="${INK}">só o que tem data acordada</text>
      <line x1="230" y1="-3.5" x2="250" y2="-3.5" stroke="${REF}" stroke-width="1.8" stroke-dasharray="3 3"/><text x="256" y="0" font-size="9.2" fill="${INK}">tudo entrando na data do ERP</text>
    </g></svg>`
}

/* ============ G3 — curva do prazo de cobrança ============ */
function gCurva() {
  const W = 760, H = 300, L = 62, R = 74, T = 24, B = 52
  const pts = D.curvaLag
  const series = [
    { k: 'nada', nome: 'Sem pagar o Felipe nem o Marcelo', cor: REF, dash: '3 3' },
    { k: 'ESC', nome: 'Pagando escalonado', cor: '#A8A8A8', dash: '6 3' },
    { k: 'M100', nome: 'Pagando os dois integralmente', cor: INK, dash: '' },
  ]
  const todos = pts.flatMap(p => series.map(s => p[s.k].minimo))
  const max = Math.max(...todos, 40000) * 1.1, min = Math.min(...todos) * 1.06
  const x = i => L + i * (W - L - R) / (pts.length - 1)
  const y = v => T + (H - T - B) * (1 - (v - min) / (max - min))
  let grid = ''
  for (let i = 0; i <= 5; i++) {
    const v = min + (max - min) * i / 5, yy = y(v)
    grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    grid += `<text x="${L - 8}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="${MUTED}">${kk(v)}</text>`
  }
  let linhas = '', rot = ''
  series.forEach(s => {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[s.k].minimo).toFixed(1)}`).join(' ')
    linhas += `<path d="${d}" fill="none" stroke="${s.cor}" stroke-width="${s.k === 'M100' ? 2.4 : 1.8}" stroke-dasharray="${s.dash}"/>`
    const u = pts[pts.length - 1][s.k].minimo
    rot += `<text x="${(x(pts.length - 1) + 6).toFixed(1)}" y="${(y(u) + 3.5).toFixed(1)}" font-size="9.2" font-weight="700" fill="${s.cor === '#A8A8A8' ? MUTED : s.cor}">${kk(u)}</text>`
  })
  const eixo = pts.map((p, i) => i % 2 === 0
    ? `<text x="${x(i).toFixed(1)}" y="${H - B + 15}" text-anchor="middle" font-size="9" fill="${MUTED}">+${p.lag}d</text>` : '').join('')
  const leg = series.slice().reverse().map((s, i) => `<g transform="translate(${L + i * 250},${H - 10})">
      <line x1="0" y1="-3.5" x2="20" y2="-3.5" stroke="${s.cor}" stroke-width="2.2" stroke-dasharray="${s.dash}"/>
      <text x="26" y="0" font-size="9" fill="${INK}">${esc(corta(s.nome, 34))}</text></g>`).join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Menor saldo do período conforme os dias de atraso na cobrança">
    ${grid}${linhas}${rot}
    <line x1="${L}" y1="${y(0).toFixed(1)}" x2="${W - R}" y2="${y(0).toFixed(1)}" stroke="${INK}" stroke-width="1.4"/>
    <text x="${W - R + 6}" y="${(y(0) + 3.5).toFixed(1)}" font-size="9" fill="${INK}">zero</text>
    ${eixo}
    <text x="${((L + W - R) / 2).toFixed(1)}" y="${H - B + 30}" text-anchor="middle" font-size="9" fill="${MUTED}">dias de atraso sobre a data que o ERP calculou</text>
    ${leg}</svg>`
}

/* ============ G4 — necessidade de cobrança acumulada ============ */
function gNecessidade() {
  const W = 760, H = 210, L = 62, R = 24, T = 16, B = 48
  const marcos = D.necessidade.nada.map(x => x.ate)
  const series = [
    { k: 'nada', nome: 'Sem pagar nada', f: '#DCDCDC' },
    { k: 'ESC', nome: 'Escalonado', f: '#A8A8A8' },
    { k: 'M100', nome: 'Pagando os dois', f: INK },
  ]
  const max = Math.max(...series.flatMap(s => D.necessidade[s.k].map(x => x.precisa))) * 1.12
  const gw = (W - L - R) / marcos.length
  const bw = gw * 0.24
  const y = v => T + (H - T - B) * (1 - v / max)
  let out = ''
  for (let i = 0; i <= 3; i++) {
    const v = max * i / 3, yy = y(v)
    out += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    out += `<text x="${L - 8}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="${MUTED}">${kk(v)}</text>`
  }
  marcos.forEach((m, i) => {
    const cx = L + gw * i + gw / 2
    series.forEach((s, j) => {
      const v = D.necessidade[s.k][i].precisa
      const bx = cx + (j - 1) * (bw + 3) - bw / 2
      out += `<rect x="${bx.toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(0) - y(v)).toFixed(1)}" fill="${s.f}"/>`
      if (j === 2) out += `<text x="${(bx + bw / 2).toFixed(1)}" y="${(y(v) - 5).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="${INK}">${kk(v)}</text>`
    })
    out += `<text x="${cx.toFixed(1)}" y="${H - B + 15}" text-anchor="middle" font-size="9.2" fill="${INK}">até ${dm(m)}</text>`
  })
  const leg = series.map((s, i) => `<g transform="translate(${L + i * 200},${H - 8})">
      <rect x="0" y="-9" width="14" height="9" fill="${s.f}"/><text x="19" y="-1" font-size="9" fill="${INK}">${esc(s.nome)}</text></g>`).join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Quanto precisa ser cobrado até cada data">
    ${out}<line x1="${L}" y1="${y(0).toFixed(1)}" x2="${W - R}" y2="${y(0).toFixed(1)}" stroke="${INK}" stroke-width="1.2"/>${leg}</svg>`
}

/* ============ páginas ============ */
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')
const foot = () => `<div class="pfoot"><span>Bula Assessoria Pecuária — documento interno</span><span>Fluxo de caixa — cenários de setembro · 19/08/2026</span></div>`
const linhaAgoPiso = D.linhas.PISO100.filter(p => p.data <= '2026-08-31' && (p.ent || p.sai))
const totalCorrente = r2(D.residuos.reduce((s, x) => s + x.residuo, 0))

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Fluxo de Caixa — Cenários de Setembro</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; color: ${INK}; margin: 0; font-size: 10.2px; line-height: 1.52; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1,h2,h3,.disp { font-family: Oswald, "Arial Narrow", Impact, sans-serif; text-transform: uppercase; letter-spacing: .022em; font-weight: 600; margin: 0; }
  .page { width: 210mm; min-height: 297mm; padding: 14mm 13mm 17mm; position: relative; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .pfoot { position: absolute; left: 13mm; right: 13mm; bottom: 7mm; font-size: 7.4px; color: #A6A6A6;
           display: flex; justify-content: space-between; border-top: 1px solid ${GRID}; padding-top: 2mm; }
  .capa { background: ${INK}; color: #fff; padding: 32mm 20mm 20mm; display: flex; flex-direction: column; }
  .capa img { width: 42mm; margin-bottom: 24mm; }
  .capa h1 { font-size: 42px; line-height: 1.03; color: #fff; font-weight: 700; }
  .capa .sub { font-size: 12.4px; color: #B5B5B5; margin-top: 8mm; max-width: 132mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
  .capa .rule { width: 26mm; height: 3px; background: ${GOLD}; margin: 9mm 0; }
  .capa .meta { margin-top: auto; flex-wrap: wrap; row-gap: 6mm; display: flex; gap: 12mm; border-top: 1px solid #2A2A2A; padding-top: 6mm; }
  .capa .meta div span { display: block; font-size: 8.5px; color: #8A8A8A; text-transform: uppercase; letter-spacing: .09em; margin-bottom: 2px; }
  .capa .meta div strong { font-size: 12px; font-weight: 600; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid ${INK}; padding-bottom: 3mm; margin-bottom: 6mm; }
  .head h2 { font-size: 21px; }
  .head .n { font-size: 9px; color: ${MUTED}; letter-spacing: .12em; text-transform: uppercase; font-family: Oswald, sans-serif; }
  h3 { font-size: 13px; margin: 7mm 0 2.5mm; }
  h3:first-of-type { margin-top: 0; }
  p { margin: 0 0 3mm; }
  .lead { font-size: 11.4px; line-height: 1.58; }
  strong { font-weight: 600; }
  .muted { color: ${MUTED}; }
  .neg { color: ${INK}; font-weight: 700; }
  .small { font-size: 9px; color: ${MUTED}; line-height: 1.5; }
  .tiles { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin: 4mm 0 6mm; }
  .tile { border: 1px solid ${GRID}; border-top: 3px solid ${INK}; padding: 3.4mm 3.4mm 3mm; }
  .tile .k { font-size: 8px; text-transform: uppercase; letter-spacing: .085em; color: ${MUTED}; margin-bottom: 1.6mm; line-height: 1.3; min-height: 5.6mm; }
  .tile .v { font-family: Oswald, sans-serif; font-size: 20px; font-weight: 600; line-height: 1; }
  .tile .v .cur { font-size: 11px; font-weight: 500; color: ${MUTED}; margin-right: 1px; }
  .tile .d { font-size: 8.4px; color: ${MUTED}; margin-top: 1.6mm; line-height: 1.4; }
  .tile.gold { border-top-color: ${GOLD}; }
  .box { border: 1px solid ${GRID}; padding: 4mm 4.4mm; margin: 4mm 0; }
  .box.dark { background: ${INK}; color: #fff; border-color: ${INK}; }
  .box.dark .t { color: ${GOLD}; }
  .box.dark p, .box.dark li { color: #D8D8D8; }
  .box.dark strong { color: #fff; }
  .box.rule { border: none; border-left: 3px solid ${INK}; padding: 1mm 0 1mm 4mm; }
  .box .t { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; margin-bottom: 2.2mm; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 9.3px; margin: 3mm 0; }
  th { text-align: left; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.4px; letter-spacing: .07em; font-weight: 600;
       border-bottom: 1.4px solid ${INK}; padding: 2mm 1.8mm; }
  td { padding: 1.7mm 1.8mm; border-bottom: 1px solid #F0F0F0; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.destaque td { background: #F6F6F6; font-weight: 600; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  figure { margin: 3mm 0 5mm; }
  figcaption { font-size: 8.6px; color: ${MUTED}; margin-top: 1.8mm; line-height: 1.45; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.6mm; }
  .tag { display: inline-block; font-size: 7.6px; text-transform: uppercase; letter-spacing: .07em; padding: 0.4mm 1.4mm;
         border: 1px solid ${GRID}; color: ${MUTED}; margin-left: 1.4mm; vertical-align: 1px; }
  .tag.est { border-color: ${GOLD}; color: #8A7530; }
  .tag.ok { border-color: ${INK}; color: ${INK}; }
</style></head><body>

<!-- ============ CAPA ============ -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Fluxo de caixa<br>Cenários de setembro</h1>
  <div class="rule"></div>
  <div class="sub">O repasse da Bula Remates de 20/08, o eventual repasse integral da 2ª parcela do JMP ao Felipe e os R$ 40.000 de participação societária do Marcelo. E, antes disso, a pergunta que decide o mês: <strong style="color:#fff">R$ ${brl(r2(D.firmeza.semData + D.firmeza.negociando))} do que a Bula tem a receber não têm data acordada com ninguém.</strong></div>
  <div class="meta">
    <div><span>Posição</span><strong>19 de agosto de 2026</strong></div>
    <div><span>Horizonte</span><strong>até 31/10/2026</strong></div>
    <div><span>Caixa Sicoob hoje</span><strong>R$ ${brl(D.caixa.sicoob)}</strong></div>
    <div><span>A receber com data</span><strong>R$ ${brl(D.firmeza.firme)}</strong></div>
  </div>
</section>

<!-- ============ 1. A RESPOSTA ============ -->
<section class="page">
  <div class="head"><h2>A resposta mudou de pergunta</h2><span class="n">01 · Síntese</span></div>

  <p class="lead">A pergunta era se dá para pagar o Felipe e o Marcelo. A resposta honesta é que <strong>essa não é a decisão que define setembro</strong>. Das R$ ${brl(D.firmeza.total)} que a Bula tem a receber até 31/10, apenas <strong>R$ ${brl(D.firmeza.firme)} têm data acordada</strong> — o repasse de amanhã, o boleto do Kito e as duas parcelas do JMP. Todo o resto é vencimento que o próprio sistema calculou como “leilão + 45 dias”, sem nenhum acordo por trás.</p>

  <div class="tiles">
    <div class="tile"><div class="k">Sicoob hoje</div><div class="v"><span class="cur">R$</span>${brl0(D.caixa.sicoob)}</div><div class="d">conciliado até 17/08</div></div>
    <div class="tile"><div class="k">A receber com data acordada</div><div class="v"><span class="cur">R$</span>${brl0(D.firmeza.firme)}</div><div class="d">${D.firmeza.nFirme} títulos, de ${D.receber.length}</div></div>
    <div class="tile gold"><div class="k">A receber sem data nenhuma</div><div class="v"><span class="cur">R$</span>${brl0(r2(D.firmeza.semData + D.firmeza.negociando))}</div><div class="d">${pc(D.firmeza.pctSemData)} do total a receber</div></div>
    <div class="tile gold"><div class="k">Precisa ser cobrado até 25/08</div><div class="v"><span class="cur">R$</span>${brl0(necessidade25)}</div><div class="d">só para o caixa não virar em 25/08</div></div>
  </div>

  <figure>${gFirmeza()}
    <figcaption>Composição do que a Bula tem a receber até 31/10, por firmeza da data. Os R$ ${brl(D.firmeza.negociando)} “em negociação” são as duas cobranças do Guadalupe que estão sendo tratadas agora.</figcaption>
  </figure>

  <h3>As quatro perguntas</h3>
  <table>
    <thead><tr><th style="width:32%">Pergunta</th><th>Resposta</th></tr></thead>
    <tbody>
      <tr><td><strong>Dá para pagar os dois?</strong></td><td>Depende inteiramente da cobrança, não do caixa de hoje. Se todas as cobranças entrarem exatamente na data que o ERP calculou, sim — sobra R$ ${brl(celula('nominal', 'M100').saldo30set)} em 30/09. Se nenhuma for negociada, o caixa fecha setembro em <strong>R$ ${brl(celula('firme', 'M100').saldo30set)}</strong>.</td></tr>
      <tr><td><strong>Qual é o aperto mais próximo?</strong></td><td><strong>25/08</strong>, e não tem nada a ver com o Felipe nem com o Marcelo. Saem R$ ${brl(D.comissoes25ago)} de comissão de julho e a única coisa que cobre isso é o EAO Baviera (R$ ${brl(48556.50)}), que <strong>não tem data</strong>. Sem ele o Sicoob vai a R$ ${brl(D.linhas.PISO100.find(p => p.data === '2026-08-25').saldo)}.</td></tr>
      <tr><td><strong>Quanto de atraso o caixa aguenta?</strong></td><td>Praticamente nenhum. Um atraso de <strong>5 dias</strong> sobre as datas do ERP já leva o menor saldo do período a R$ ${brl(D.curvaLag.find(l => l.lag === 5).nada.minimo)} — mesmo sem pagar o Felipe e o Marcelo.</td></tr>
      <tr><td><strong>Então o que fazer?</strong></td><td>Fechar data de cobrança antes de fechar data de pagamento. Com R$ ${brl0(D.necessidade.ESC.find(x => x.ate === '2026-09-30').precisa)} negociados até 30/09, o escalonado passa. Com R$ ${brl0(D.necessidade.M100.find(x => x.ate === '2026-09-30').precisa)}, passa pagando tudo.</td></tr>
    </tbody>
  </table>

  <div class="box dark">
    <div class="t">O que eu errei na versão anterior</div>
    <p>Tratei o vencimento das contas a receber como se fosse data combinada. Não é: <strong>${D.firmeza.nSemData} dos ${D.receber.length} títulos foram lançados em massa em 17 e 18/08</strong> com vencimento igual à data do leilão mais 45 dias.</p>
    <p style="margin:0">E usei uma estatística de pontualidade que era circular: dos 131 títulos já recebidos, <strong>99 foram criados depois do dinheiro entrar</strong>, com vencimento igual à data do recebimento por construção. O “atraso mediano zero” media o processo de lançamento, não o comportamento das leiloeiras.</p>
  </div>

  <h3>O trimestre, na hipótese mais plausível</h3>
  <p class="small" style="margin-bottom:2mm">Todas as cobranças negociadas, entrando 15 dias depois da data que o sistema calculou — cerca de 60 dias após o leilão.</p>
  <table>
    <thead><tr><th style="width:34%">Decisão sobre Felipe e Marcelo</th><th class="num">Menor saldo do período</th><th class="num">Saldo em 30/09</th><th class="num">Saldo em 31/10</th></tr></thead>
    <tbody>
      ${['nada', 'ESC', 'M100'].map(d => { const c = celula('neg15', d); return `<tr${d === 'ESC' ? ' class="destaque"' : ''}><td>${esc(c.nome)}</td>
        <td class="num${c.minimo.saldo < 0 ? ' neg' : ''}">${brl(c.minimo.saldo)} <span class="muted">${dm(c.minimo.data)}</span></td>
        <td class="num${c.saldo30set < 0 ? ' neg' : ''}">${brl(c.saldo30set)}</td><td class="num">${brl(c.saldo31out)}</td></tr>` }).join('')}
    </tbody>
  </table>

  ${foot()}
</section>

<!-- ============ 2. AS DATAS ============ -->
<section class="page">
  <div class="head"><h2>As datas do ERP não são acordos</h2><span class="n">02 · A base</span></div>

  <p class="lead">Vale ver o rastro. As contas a receber de julho e agosto não existiam no sistema até a semana passada — foram criadas no saneamento de 17 e 18/08, todas de uma vez, com o vencimento calculado pela regra de 45 dias. O intervalo entre a criação do título e o vencimento vai de ${Math.min(...semData.map(x => Math.round((new Date(x.data) - new Date(x.criadoEm)) / 86400000)))} a ${Math.max(...semData.map(x => Math.round((new Date(x.data) - new Date(x.criadoEm)) / 86400000)))} dias, e nenhum deles carrega registro de negociação.</p>

  <h3>O que de fato tem data</h3>
  <table>
    <thead><tr><th style="width:10%">Data</th><th class="num" style="width:16%">Valor</th><th style="width:30%">Título</th><th>Por que é firme</th></tr></thead>
    <tbody>
      ${firmes.map(x => `<tr><td>${dm(x.data)}</td><td class="num">${brl(x.valor)}</td><td>${esc(corta(x.desc, 38))}</td><td class="muted">${esc(x.motivo)}</td></tr>`).join('')}
      <tr class="total"><td></td><td class="num">${brl(D.firmeza.firme)}</td><td colspan="2">Total com data acordada</td></tr>
    </tbody>
  </table>

  <h3>O que está em negociação agora</h3>
  <table>
    <thead><tr><th style="width:10%">Data no ERP</th><th class="num" style="width:16%">Valor</th><th>Título</th></tr></thead>
    <tbody>
      ${negociando.map(x => `<tr><td>${dm(x.data)}</td><td class="num">${brl(x.valor)}</td><td>${esc(corta(x.desc, 62))}</td></tr>`).join('')}
      <tr class="total"><td></td><td class="num">${brl(D.firmeza.negociando)}</td><td>Total em negociação</td></tr>
    </tbody>
  </table>

  <h3>O que não tem data — em ordem de tamanho</h3>
  <table>
    <thead><tr><th style="width:11%">Data do ERP</th><th class="num" style="width:15%">Valor</th><th>Título</th><th class="num" style="width:15%">Acumulado</th></tr></thead>
    <tbody>
      ${(() => { let acc = 0; return semData.slice().sort((a, b) => b.valor - a.valor).map(x => { acc = r2(acc + x.valor); return `<tr><td class="muted">${dm(x.data)}</td><td class="num">${brl(x.valor)}</td><td>${esc(corta(x.desc, 56))}</td><td class="num muted">${brl(acc)}</td></tr>` }).join('') })()}
      <tr class="total"><td></td><td class="num">${brl(D.firmeza.semData)}</td><td colspan="2">${D.firmeza.nSemData} títulos sem data acordada</td></tr>
    </tbody>
  </table>
  <p class="small">Fora desta lista há ainda <strong>R$ ${brl(D.vencidos.total)} em ${D.vencidos.n} títulos já vencidos</strong>, dos quais R$ ${brl(D.vencidos.ate60)} com menos de 60 dias. Também sem data, e também fora de todos os cenários.</p>

  ${foot()}
</section>

<!-- ============ 3. AGOSTO ============ -->
<section class="page">
  <div class="head"><h2>25 de agosto é o aperto real</h2><span class="n">03 · Curto prazo</span></div>

  <p class="lead">Amanhã entra o repasse da Bula Remates — R$ ${brl(D.remates.totalReal)}, e não os R$ ${brl(D.remates.totalErp)} que o ERP previa — e saem R$ ${brl(linhaAgoPiso[0].sai)}, dos quais R$ 55.846,64 são o DAS de julho. Isso o caixa cobre. O problema é <strong>25/08</strong>: saem R$ ${brl(D.comissoes25ago)} de comissão de julho, e a única entrada prevista para o dia é o EAO Baviera de R$ ${brl(48556.50)} — que não tem data acordada.</p>

  <h3>O repasse de amanhã: planilha da leiloeira × ERP</h3>
  <table>
    <thead><tr><th>Leilão</th><th class="num">Faturamento</th><th class="num">Faixa</th><th class="num">Repasse real</th><th class="num">No ERP</th><th class="num">Diferença</th></tr></thead>
    <tbody>
      ${D.remates.itens.map(i => `<tr><td>${esc(i.leilao)} <span class="muted">· ${esc(i.dataLeilao)} · ${i.lotes} lotes</span></td>
        <td class="num">${brl(i.faturamento)}</td><td class="num">${pc2(i.pct)}</td><td class="num">${brl(i.real)}</td>
        <td class="num muted">${brl(i.erp)}</td><td class="num">${brl(i.delta)}</td></tr>`).join('')}
      <tr class="total"><td>Total para NF</td><td class="num">${brl(D.remates.faturamento)}</td><td class="num"></td>
        <td class="num">${brl(D.remates.totalReal)}</td><td class="num">${brl(D.remates.totalErp)}</td><td class="num">${brl(D.remates.delta)}</td></tr>
    </tbody>
  </table>
  <p class="small">O contrato Bula Remates × Bula Assessoria remunera por faixa de performance: 0,5% a partir de 5% de participação no faturamento, 0,75% a partir de 12,5%, 1,0% a partir de 20%. O ERP aplicou 1% linear nos dois títulos. <strong>O mesmo erro está provavelmente no São Geraldo</strong> (R$ ${brl(D.saoGeraldo.valor)}): pela performance de 7,47% a faixa seria 0,5%, ou seja R$ ${brl(D.saoGeraldo.metade)}.</p>

  <figure>${gAgosto()}
    <figcaption>Saldo diário do Sicoob em agosto. A linha cheia é o que acontece se nenhuma cobrança nova for fechada; a tracejada é a premissa antiga, com todos os títulos entrando na data do sistema. As duas se separam exatamente em 25/08.</figcaption>
  </figure>

  <h3>Movimento a movimento, sem contar com o que não tem data</h3>
  <table>
    <thead><tr><th style="width:9%">Data</th><th class="num" style="width:15%">Entra</th><th class="num" style="width:15%">Sai</th><th class="num" style="width:16%">Saldo</th><th>Principal item do dia</th></tr></thead>
    <tbody>
      ${linhaAgoPiso.map(p => {
        const maior = p.itens.slice().sort((a, b) => b.valor - a.valor)[0]
        return `<tr${p.data === '2026-08-25' ? ' class="destaque"' : ''}><td>${dm(p.data)}</td>
          <td class="num">${p.ent ? brl(p.ent) : '—'}</td><td class="num">${p.sai ? brl(p.sai) : '—'}</td>
          <td class="num${p.saldo < 0 ? ' neg' : ''}">${brl(p.saldo)}</td><td class="muted">${esc(corta(maior.desc, 54))}</td></tr>`
      }).join('')}
    </tbody>
  </table>
  <p class="small">Há ainda R$ ${brl(D.caixa.sicrediLiquido)} líquidos no Sicredi, fora de todos os cenários: o extrato de agosto daquela conta nunca foi importado e a conta corrente aparece com −R$ 15.000,00 contra uma aplicação de R$ 27.598,64, o que é impossível numa conta com varredura.</p>

  ${foot()}
</section>

<!-- ============ 4. A MATRIZ ============ -->
<section class="page">
  <div class="head"><h2>Cobrança decide, pagamento só agrava</h2><span class="n">04 · Comparação</span></div>

  <p class="lead">Duas variáveis, e elas não pesam igual. Nas linhas, o que acontece com a cobrança; nas colunas, o que se decide pagar. <strong>A diferença entre a primeira e a última linha é de R$ ${brl0(Math.abs(r2(celula('nominal', 'nada').saldo30set - celula('firme', 'nada').saldo30set)))} no saldo de 30/09; a diferença entre pagar tudo e não pagar nada é de R$ ${brl0(D.repasseTotal)}.</strong> A cobrança pesa mais que o dobro.</p>

  <table>
    <thead><tr><th style="width:24%">Se a cobrança…</th><th class="num">Sem pagar nada</th><th class="num">Escalonado</th><th class="num">Pagando os dois</th></tr></thead>
    <tbody>
      ${D.matriz.map(m => `<tr${m.regime === 'neg15' ? ' class="destaque"' : ''}>
        <td><strong>${esc(m.nome)}</strong></td>
        ${['nada', 'ESC', 'M100'].map(d => {
          const c = m.celulas.find(x => x.decisao === d)
          return `<td class="num${c.minimo.saldo < 0 ? ' neg' : ''}">${brl(c.minimo.saldo)}<br><span class="small">menor saldo · ${dm(c.minimo.data)}</span></td>`
        }).join('')}</tr>`).join('')}
    </tbody>
  </table>
  <p class="small">Menor saldo do Sicoob entre 19/08 e 31/10. Nas duas primeiras linhas a receita dos leilões novos também fica de fora, porque ela nasceria com o mesmo problema de data — por isso elas são piso, não previsão. A linha destacada é a hipótese mais plausível: tudo é negociado, com 15 dias a mais que a data do sistema.</p>

  <figure>${gCurva()}
    <figcaption>Menor saldo do período conforme o atraso médio da cobrança sobre a data que o ERP calculou. Em zero — todos os títulos honrando o vencimento nominal — o caixa fica em R$ ${brl(D.curvaLag[0].nada.minimo)}. <strong>Cinco dias de atraso já levam a negativo</strong>, com ou sem os pagamentos ao Felipe e ao Marcelo.</figcaption>
  </figure>

  <h3>O que cada linha assume</h3>
  <table>
    <thead><tr><th style="width:24%">Hipótese</th><th>Premissas</th></tr></thead>
    <tbody>
      ${D.matriz.map(m => `<tr><td><strong>${esc(m.nome)}</strong></td><td>${esc(m.desc)}</td></tr>`).join('')}
    </tbody>
  </table>

  ${foot()}
</section>

<!-- ============ 5. A CONTA DE COBRANÇA ============ -->
<section class="page">
  <div class="head"><h2>Quanto precisa entrar, e até quando</h2><span class="n">05 · A meta</span></div>

  <p class="lead">Esta é a página operacional. Partindo só do que tem data acordada e mantendo um colchão de R$ ${brl0(D.colchaoAlvo)} em qualquer dia, é este o valor que precisa ser negociado e recebido até cada marco — nas três decisões possíveis sobre o Felipe e o Marcelo.</p>

  <figure>${gNecessidade()}
    <figcaption>Valor acumulado que precisa ser cobrado além do que já tem data. As barras não se somam entre si: cada uma é o total necessário até aquela data.</figcaption>
  </figure>

  <table>
    <thead><tr><th style="width:22%">Até</th><th class="num">Sem pagar nada</th><th class="num">Escalonado</th><th class="num">Pagando os dois</th><th>O que cobre</th></tr></thead>
    <tbody>
      ${D.necessidade.nada.map((x, i) => {
        const cobre = semData.filter(s => s.data <= x.ate).sort((a, b) => b.valor - a.valor)
        let acc = 0, n = 0
        for (const c of cobre) { if (acc >= D.necessidade.M100[i].precisa) break; acc = r2(acc + c.valor); n++ }
        return `<tr><td><strong>${dm(x.ate)}</strong></td>
          <td class="num">${brl(x.precisa)}</td><td class="num">${brl(D.necessidade.ESC[i].precisa)}</td><td class="num">${brl(D.necessidade.M100[i].precisa)}</td>
          <td class="muted">${n ? `os ${n} maiores títulos com data nominal até ${dm(x.ate)} (R$ ${brl0(acc)})` : '—'}</td></tr>`
      }).join('')}
    </tbody>
  </table>

  <h3>A fila de cobrança, por prioridade</h3>
  <p>Ordenada pelo que resolve mais cedo o maior buraco. Os cinco primeiros somam R$ ${brl0(r2(semData.slice().sort((a, b) => b.valor - a.valor).slice(0, 5).reduce((s, x) => s + x.valor, 0)))} e sozinhos cobrem a necessidade até 30/09 no cenário escalonado.</p>
  <table>
    <thead><tr><th style="width:5%">#</th><th style="width:11%">Data no ERP</th><th class="num" style="width:15%">Valor</th><th>Título</th><th class="num" style="width:15%">Acumulado</th></tr></thead>
    <tbody>
      ${(() => {
        let acc = 0
        return semData.slice().sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : b.valor - a.valor)).slice(0, 14).map((x, i) => {
          acc = r2(acc + x.valor)
          return `<tr${i < 3 ? ' class="destaque"' : ''}><td>${i + 1}</td><td>${dm(x.data)}</td><td class="num">${brl(x.valor)}</td>
            <td>${esc(corta(x.desc, 54))}</td><td class="num muted">${brl(acc)}</td></tr>`
        }).join('')
      })()}
    </tbody>
  </table>
  <p class="small">Ordenada por data nominal — quem vence antes é quem sustenta o caixa antes. As três primeiras linhas são o que precisa estar resolvido nesta semana.</p>

  <div class="box dark">
    <div class="t">O número que resume tudo</div>
    <p style="margin:0">Para pagar o Felipe integralmente em 13/09 e o Marcelo em 25/09 sem o caixa virar, é preciso ter negociado e recebido <strong>R$ ${brl(D.necessidade.M100.find(x => x.ate === '2026-09-30').precisa)}</strong> além do que já tem data, até 30/09. Escalonando os dois pagamentos, esse número cai para <strong>R$ ${brl(D.necessidade.ESC.find(x => x.ate === '2026-09-30').precisa)}</strong>. Sem pagar nada, ainda assim são <strong>R$ ${brl(D.necessidade.nada.find(x => x.ate === '2026-09-30').precisa)}</strong> — a cobrança não é opcional em nenhum cenário.</p>
  </div>

  ${foot()}
</section>

<!-- ============ 6. O QUE SAI E NÃO ESTÁ NO SISTEMA ============ -->
<section class="page">
  <div class="head"><h2>A saída que o ERP não mostra</h2><span class="n">06 · Despesa</span></div>

  <p class="lead">Do lado de baixo há um problema espelhado. O ERP pré-lança folha, comissão e alguns débitos agendados — e mais nada. Impostos, encargos e o custo do dia a dia só aparecem quando o extrato chega. Setembro tinha R$ ${brl(D.pagarSetembro)} lançados contra uma saída real projetada de R$ ${brl(r2(D.pagarSetembro + M100set()))}.</p>

  <h3>Os impostos, calculados pela carga efetiva</h3>
  <table>
    <thead><tr><th>Competência</th><th class="num">DAS (Simples)</th><th class="num">ISSQN</th><th class="num">Total</th><th class="num">Caixa recebido no mês</th><th class="num">Carga</th><th>Pago em</th></tr></thead>
    <tbody>
      ${D.cargaTributaria.map(x => `<tr><td>${x.mes.slice(5)}/${x.mes.slice(0, 4)}</td><td class="num">${brl(x.das)}</td>
        <td class="num">${x.iss ? brl(x.iss) : '—'}</td><td class="num">${brl(x.total)}</td><td class="num">${brl(x.base)}</td>
        <td class="num">${pc(x.pct)}</td><td class="muted">${x.pagoEm.slice(5)}/${x.pagoEm.slice(0, 4)}</td></tr>`).join('')}
      <tr class="total"><td>08/2026 <span class="tag est">projetado</span></td><td class="num">${brl(r2(impSet() * (1 - D.mixIss)))}</td>
        <td class="num">${brl(r2(impSet() * D.mixIss))}</td><td class="num">${brl(impSet())}</td><td class="num">${brl(D.entradasAgostoProjetado)}</td>
        <td class="num">${pc(D.taxaTributaria.media)}</td><td>09/2026</td></tr>
    </tbody>
  </table>
  <p class="small">Carga média dos três meses observados: ${pc(D.taxaTributaria.media)} (mínimo ${pc(D.taxaTributaria.min)}, máximo ${pc(D.taxaTributaria.max)}). Muito acima dos 18% que o fechamento usa para calcular a sobra bruta. Somam-se R$ ${brl(D.encargos.mensal)}/mês de FGTS e DARF de empregados, que ficam fora do DAS e do ISSQN.</p>

  <h3>O custo corrente, que nunca vira conta a pagar</h3>
  <p>Cartão de crédito, viagem, combustível, marketing, manutenção, alimentação e despesa operacional de leilão. Média das saídas do Sicoob nessas rubricas, fora folha, comissão, imposto e transferência interna:</p>
  <table>
    <thead><tr><th>Mês</th>${D.custoCorrente.porMes.filter(m => m.mes >= '2026-04').map(m => `<th class="num">${m.mes.slice(5)}/${m.mes.slice(2, 4)}</th>`).join('')}<th class="num">Média abr–jul</th></tr></thead>
    <tbody>
      <tr><td>Custo corrente</td>${D.custoCorrente.porMes.filter(m => m.mes >= '2026-04').map(m =>
        `<td class="num${m.parcial ? ' muted' : ''}">${brl(m.valor)}${m.parcial ? '<br><span class="small">até 18/08</span>' : ''}</td>`).join('')}
        <td class="num"><strong>${brl(D.custoCorrente.media)}</strong></td></tr>
    </tbody>
  </table>
  <table>
    <thead><tr><th style="width:26%">Janela</th><th class="num">Esperado pela média</th><th class="num">Já lançado como conta a pagar</th><th class="num">Acrescentado ao fluxo</th></tr></thead>
    <tbody>
      ${D.residuos.map(x => `<tr><td>${x.mes === '2026-08' ? '19 a 31/08' : x.mes === '2026-09' ? 'setembro' : 'outubro'}</td>
        <td class="num">${brl(x.esperado)}</td><td class="num muted">${brl(x.lancado)}</td><td class="num"><strong>${brl(x.residuo)}</strong></td></tr>`).join('')}
      <tr class="total"><td>Total</td><td class="num"></td><td class="num"></td><td class="num">${brl(totalCorrente)}</td></tr>
    </tbody>
  </table>

  <div class="box rule">
    <p style="margin:0">O Simples tributa a <strong>receita bruta</strong>. Se a 2ª parcela do JMP for repassada cheia ao Felipe, a Bula continua devendo cerca de <strong>R$ ${brl(D.impostoSobreRepasse.media)}</strong> de imposto sobre ela, vencendo em outubro — guia sobre dinheiro que não ficou na empresa. O caminho natural é repassar líquido de imposto, ou combinar com o Felipe quem absorve esses ${pc(D.taxaTributaria.media)}.</p>
  </div>

  ${foot()}
</section>

<!-- ============ 7. RECOMENDAÇÃO ============ -->
<section class="page">
  <div class="head"><h2>Recomendação e pendências</h2><span class="n">07 · Decisão</span></div>

  <h3>O que eu faria, nesta ordem</h3>
  <ol>
    <li><strong>Fechar a data do EAO Baviera esta semana.</strong> São R$ ${brl(48556.50)} da etapa fêmeas mais R$ ${brl(31501.80)} dos machos, e é o único título que resolve 25/08. Sem ele, o Sicoob fecha o dia 25 em R$ ${brl(D.linhas.PISO100.find(p => p.data === '2026-08-25').saldo)} — antes de qualquer decisão sobre Felipe ou Marcelo.</li>
    <li><strong>Depois do Guadalupe, ir atrás do Mafra e do LS Galéria.</strong> Juntos são R$ ${brl0(r2(70345 + 17857 + 57840))} e são os maiores títulos de setembro sem data.</li>
    <li><strong>Não fechar data de pagamento antes de fechar data de cobrança.</strong> A decisão sobre o Felipe pode esperar até 13/09 e a do Marcelo até 25/09 — até lá dá tempo de saber quanto entrou. Se em 10/09 a cobrança de setembro não estiver fechada, escalonar deixa de ser preferência e vira necessidade.</li>
    <li><strong>Se pagar, pagar escalonado e líquido de imposto.</strong> JMP metade em 13/09 e metade em 15/10; Marcelo R$ ${brl0(D.marcelo / 2)} em 25/09 e R$ ${brl0(D.marcelo / 2)} em 25/10. Reduz a necessidade de cobrança até 30/09 de R$ ${brl0(D.necessidade.M100.find(x => x.ate === '2026-09-30').precisa)} para R$ ${brl0(D.necessidade.ESC.find(x => x.ate === '2026-09-30').precisa)}.</li>
    <li><strong>Confirmar o São Geraldo com a Bula Remates.</strong> R$ ${brl(D.saoGeraldo.valor)} lançados a 1%; pela tabela de performance seriam R$ ${brl(D.saoGeraldo.metade)}. E corrigir os dois títulos de amanhã para R$ ${brl(D.remates.itens[0].real)} e R$ ${brl(D.remates.itens[1].real)}.</li>
    <li><strong>Atacar os R$ ${brl(D.vencidos.ate60)} vencidos com menos de 60 dias.</strong> Não entram em nenhum cenário — é folga pura se vierem.</li>
    <li><strong>Passar a registrar a data acordada no título.</strong> Enquanto o vencimento for “leilão + 45 dias” automático, nenhuma projeção de caixa desta empresa vale o papel. É a correção de raiz.</li>
  </ol>

  <h3>Como este relatório classificou cada título</h3>
  <p>Firme = existe acordo expresso: boleto emitido, contrato de parcelamento ou repasse já confirmado pela leiloeira. Tudo o mais entrou como sem data, inclusive títulos que talvez já tenham sido combinados por telefone sem registro no sistema. <strong>Se algum da lista da página 2 já tiver data acertada, é só avisar que os números mudam na hora</strong> — a classificação está numa tabela única no script gerador.</p>

  <h3>Calendário de decisão</h3>
  <table>
    <thead><tr><th style="width:12%">Data</th><th style="width:34%">O que checar</th><th>Se estiver resolvido</th><th>Se não estiver</th></tr></thead>
    <tbody>
      <tr class="destaque"><td><strong>até 22/08</strong></td><td>Data do EAO Baviera (fêmeas e machos) fechada</td><td>25/08 passa sem aperto</td><td>Negociar prazo das comissões de julho com a equipe, ou puxar o Sicredi</td></tr>
      <tr><td>até 29/08</td><td>Guadalupe, Mafra e LS Galéria com data</td><td>Setembro fica coberto</td><td>Segurar as duas decisões e refazer esta projeção</td></tr>
      <tr><td>até 10/09</td><td>R$ ${brl0(D.necessidade.ESC.find(x => x.ate === '2026-09-15').precisa)} negociados e a caminho</td><td>Liberar a 1ª metade do JMP em 13/09</td><td>Adiar o repasse ou repassar só o que entrou</td></tr>
      <tr><td>até 22/09</td><td>Recebido no mês contra o previsto</td><td>Pagar o Marcelo em 25/09</td><td>Empurrar a participação para 25/10</td></tr>
      <tr><td>até 10/10</td><td>Cobrança de outubro e receita dos leilões de setembro</td><td>Liberar a 2ª metade do JMP em 15/10</td><td>Renegociar prazo com o Felipe</td></tr>
    </tbody>
  </table>

  <div class="box">
    <div class="t">O que este relatório não sabe</div>
    <p class="small" style="margin:0">(a) O extrato do Sicoob está conciliado até 17/08; movimentos de 18 e 19/08 ainda não entraram. (b) O extrato do Sicredi de agosto nunca foi importado — os R$ ${brl(D.caixa.sicrediLiquido)} líquidos daquela conta são inferência e ficaram fora de todos os cenários. (c) As guias de agosto e setembro são estimativas por carga efetiva, não cálculo do contador. (d) O custo corrente de setembro e outubro é a média de abr–jul; agosto é mês de Expogenética e já gastou R$ ${brl(D.custoCorrente.agostoAte18)} até o dia 18, então setembro pode vir acima. (e) Não há comissão do Gustavo Rusa lançada para os leilões de agosto — os fechamentos não trazem venda dele, mas vale conferir antes de fechar 25/09. (f) O título “Neloraço PO” (R$ ${brl(D.remates.itens[1].erp)}) e o “30º Neloraço Irmãos Hipólito” (R$ 1.425,00) podem ser o mesmo evento lançado duas vezes. (g) O 13º salário vence fora do horizonte (30/11 e 20/12) e não está aqui.</p>
  </div>

  ${foot()}
</section>

</body></html>`

function impSet() { return r2(D.entradasAgostoProjetado * D.taxaTributaria.media / 100) }
function M100set() { return r2(impSet() + D.residuos[1].residuo + D.encargos.mensal) }

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
const pdfPath = path.join(desktop, 'Bula - Fluxo de Caixa - Cenarios de Setembro - 19-08-2026.pdf')
await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '14mm', left: '11mm', right: '11mm' } })
await browser.close()
console.log('PDF:', pdfPath)
