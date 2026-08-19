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

const cen = k => D.cenarios.find(c => c.chave === k)
const REFc = cen('REF'), M = cen('M'), M50 = cen('M50'), M100 = cen('M100'), ESC = cen('ESC'), STR = cen('STR')

/* ===================== G1 — escada diaria de agosto ===================== */
function gAgosto() {
  const W = 760, H = 300, L = 58, R = 84, T = 22, B = 42
  const pts = D.linhas.M100.filter(p => p.data <= '2026-08-31')
  const max = Math.max(...pts.map(p => p.saldo)) * 1.14
  const x = i => L + i * (W - L - R) / (pts.length - 1)
  const y = v => T + (H - T - B) * (1 - v / max)
  let grid = ''
  for (let i = 0; i <= 4; i++) {
    const v = max * i / 4, yy = y(v)
    grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    grid += `<text x="${L - 8}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="${MUTED}">${kk(v)}</text>`
  }
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' ')
  const area = line + ` L${x(pts.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`
  const dots = pts.map((p, i) => (p.ent || p.sai || i === 0 || i === pts.length - 1)
    ? `<circle cx="${x(i).toFixed(1)}" cy="${y(p.saldo).toFixed(1)}" r="3.2" fill="${INK}" stroke="#fff" stroke-width="1.8"/>` : '').join('')
  const iMin = pts.reduce((m, p, i) => p.saldo < pts[m].saldo ? i : m, 0)
  const eixo = pts.map((p, i) => (i % 2 === 0 || i === pts.length - 1)
    ? `<text x="${x(i).toFixed(1)}" y="${H - B + 15}" text-anchor="middle" font-size="9" fill="${MUTED}">${dm(p.data)}</text>` : '').join('')
  const marca = (i, txt, sub, dy) => {
    const px = x(i), py = y(pts[i].saldo)
    return `<line x1="${px.toFixed(1)}" y1="${(py + 8).toFixed(1)}" x2="${px.toFixed(1)}" y2="${(py + dy - 14).toFixed(1)}" stroke="${GOLD}" stroke-width="1.8"/>
      <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.4" fill="${GOLD}" stroke="#fff" stroke-width="2"/>
      <text x="${px.toFixed(1)}" y="${(py + dy).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${INK}">${esc(txt)}</text>
      <text x="${px.toFixed(1)}" y="${(py + dy + 12).toFixed(1)}" text-anchor="middle" font-size="9" fill="${MUTED}">${esc(sub)}</text>`
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Saldo diário do Sicoob de 19 a 31 de agosto">
    ${grid}
    <path d="${area}" fill="${INK}" opacity="0.07"/>
    <path d="${line}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
    ${dots}
    <circle cx="${x(0).toFixed(1)}" cy="${y(pts[0].saldo).toFixed(1)}" r="4.4" fill="${INK}" stroke="#fff" stroke-width="2"/>
    <text x="${(x(0) + 9).toFixed(1)}" y="${(y(pts[0].saldo) - 6).toFixed(1)}" font-size="10.5" font-weight="700" fill="${INK}">R$ ${brl0(pts[0].saldo)}</text>
    <text x="${(x(0) + 9).toFixed(1)}" y="${(y(pts[0].saldo) + 5).toFixed(1)}" font-size="9" fill="${MUTED}">hoje</text>
    ${marca(iMin, 'R$ ' + brl0(pts[iMin].saldo), 'fundo do mês', 40)}
    <text x="${(x(pts.length - 1) + 8).toFixed(1)}" y="${(y(pts[pts.length - 1].saldo) + 1).toFixed(1)}" font-size="10.5" font-weight="700" fill="${INK}">R$ ${brl0(pts[pts.length - 1].saldo)}</text>
    <text x="${(x(pts.length - 1) + 8).toFixed(1)}" y="${(y(pts[pts.length - 1].saldo) + 12).toFixed(1)}" font-size="9" fill="${MUTED}">31/08</text>
    <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="${INK}" stroke-width="1.2"/>
    ${eixo}
  </svg>`
}

/* ===================== G2 — set/out, tres trajetorias ===================== */
function gTrajetorias() {
  const W = 760, H = 320, L = 58, R = 76, T = 24, B = 52
  const series = [
    { k: 'REF', nome: 'Sem os dois pagamentos', cor: REF, tracejado: '3 3' },
    { k: 'M100', nome: 'Marcelo + JMP integral', cor: INK, tracejado: '' },
    { k: 'STR', nome: 'Integral sob estresse', cor: '#A8A8A8', tracejado: '6 3' },
  ]
  const pts = D.linhas.REF.filter(p => p.data >= '2026-08-31')
  const n = pts.length
  const todos = series.flatMap(s => D.linhas[s.k].filter(p => p.data >= '2026-08-31').map(p => p.saldo))
  const max = Math.max(...todos) * 1.10, min = Math.min(0, Math.min(...todos))
  const x = i => L + i * (W - L - R) / (n - 1)
  const y = v => T + (H - T - B) * (1 - (v - min) / (max - min))
  let grid = ''
  for (let i = 0; i <= 5; i++) {
    const v = min + (max - min) * i / 5, yy = y(v)
    grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    grid += `<text x="${L - 8}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="${MUTED}">${kk(v)}</text>`
  }
  let linhas = '', rot = ''
  series.forEach(s => {
    const p = D.linhas[s.k].filter(q => q.data >= '2026-08-31')
    const d = p.map((q, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(q.saldo).toFixed(1)}`).join(' ')
    linhas += `<path d="${d}" fill="none" stroke="${s.cor}" stroke-width="${s.k === 'M100' ? 2.4 : 1.8}" stroke-dasharray="${s.tracejado}" stroke-linejoin="round"/>`
    const ult = p[p.length - 1]
    rot += `<text x="${(x(n - 1) + 6).toFixed(1)}" y="${(y(ult.saldo) + 3.5).toFixed(1)}" font-size="9.4" font-weight="700" fill="${s.cor === '#A8A8A8' ? MUTED : s.cor}">${kk(ult.saldo)}</text>`
  })
  // marcos
  const marcos = [
    { data: '2026-09-13', txt: 'JMP entra e sai' },
    { data: '2026-09-25', txt: 'comissões + Marcelo' },
    { data: '2026-10-20', txt: 'DAS de setembro' },
  ]
  let mk = ''
  marcos.forEach(m => {
    const i = pts.findIndex(p => p.data === m.data)
    if (i < 0) return
    mk += `<line x1="${x(i).toFixed(1)}" y1="${T}" x2="${x(i).toFixed(1)}" y2="${H - B}" stroke="${GOLD}" stroke-width="1" stroke-dasharray="2 2"/>
      <text x="${x(i).toFixed(1)}" y="${T - 8}" text-anchor="middle" font-size="8.4" fill="${MUTED}">${esc(m.txt)}</text>`
  })
  const eixo = pts.map((p, i) => (i % 7 === 0 || i === n - 1)
    ? `<text x="${x(i).toFixed(1)}" y="${H - B + 15}" text-anchor="middle" font-size="9" fill="${MUTED}">${dm(p.data)}</text>` : '').join('')
  const leg = series.map((s, i) => `<g transform="translate(${L + i * 215},${H - 14})">
      <line x1="0" y1="-3.5" x2="20" y2="-3.5" stroke="${s.cor}" stroke-width="2.2" stroke-dasharray="${s.tracejado}"/>
      <text x="26" y="0" font-size="9.2" fill="${INK}">${esc(s.nome)}</text></g>`).join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Trajetória do saldo de 31 de agosto a 31 de outubro em três cenários">
    ${grid}${mk}${linhas}${rot}
    <line x1="${L}" y1="${y(0).toFixed(1)}" x2="${W - R}" y2="${y(0).toFixed(1)}" stroke="${INK}" stroke-width="1.2"/>
    ${eixo}${leg}
  </svg>`
}

/* ===================== G3 — cenarios (barras agrupadas) ===================== */
function gCenarios() {
  const W = 760, H = 310, L = 150, R = 58, T = 12, bh = 13, gap = 5, grp = 16
  const lista = [REFc, M, M50, M100, ESC, STR]
  const max = Math.max(...lista.flatMap(c => [c.saldo30set, c.saldo31out])) * 1.06
  const x = v => L + (W - L - R) * v / max
  let out = ''
  lista.forEach((c, i) => {
    const y0 = T + i * (bh * 2 + gap + grp)
    out += `<text x="${L - 10}" y="${y0 + bh + 3}" text-anchor="end" font-size="10.2" font-weight="${c.chave === 'M100' ? 700 : 500}" fill="${INK}">${esc(c.nome)}</text>`
    const barras = [{ v: c.saldo30set, f: INK, r: '30/09' }, { v: c.saldo31out, f: '#C4C4C4', r: '31/10' }]
    barras.forEach((b, j) => {
      const yy = y0 + j * (bh + gap)
      out += `<rect x="${L}" y="${yy}" width="${Math.max(2, x(b.v) - L).toFixed(1)}" height="${bh}" fill="${b.f}"/>`
      out += `<text x="${(x(b.v) + 6).toFixed(1)}" y="${yy + bh - 2.5}" font-size="9.2" font-weight="600" fill="${INK}">${kk(b.v)}</text>`
    })
  })
  const leg = `<g transform="translate(${L},${H - 6})">
    <rect x="0" y="-9" width="14" height="9" fill="${INK}"/><text x="19" y="-1" font-size="9.2" fill="${INK}">saldo em 30/09</text>
    <rect x="112" y="-9" width="14" height="9" fill="#C4C4C4"/><text x="131" y="-1" font-size="9.2" fill="${INK}">saldo em 31/10</text></g>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Saldo em 30 de setembro e 31 de outubro nos seis cenários">
    ${out}<line x1="${L}" y1="${T - 4}" x2="${L}" y2="${T + 6 * (bh * 2 + gap + grp) - grp}" stroke="${INK}" stroke-width="1.2"/>${leg}</svg>`
}

/* ===================== G4 — riscos: saldo resultante em 30/09 ===================== */
const ROT_CURTO = {
  'São Geraldo remunerado a 0,5% do faturamento, e não a 1%': 'São Geraldo a 0,5%',
  'Carga tributária de agosto no teto observado (29,53%) em vez da média': 'Imposto no teto (29,53%)',
  '30% dos recebíveis de setembro atrasando 30 dias': '30% dos recebíveis atrasando 30 dias',
  'Tudo acima ao mesmo tempo': 'Tudo ao mesmo tempo',
}
function gRiscos() {
  const bh = 20, gap = 12, T = 10
  const linhas = [{ rot: 'Cenário integral, sem revés', v: D.base30set, base: true }]
    .concat(D.riscos.filter(r => !r.jaEmbutido).map(r => ({ rot: ROT_CURTO[r.rot] || r.rot, v: r2(D.base30set + r.valor), delta: r.valor, pior: r.estado === 'pior caso' })))
  const W = 760, H = T + linhas.length * (bh + gap) - gap + 8, L = 220, R = 62
  const max = D.base30set * 1.06
  const x = v => L + (W - L - R) * v / max
  let out = ''
  linhas.forEach((l, i) => {
    const y = T + i * (bh + gap)
    const fill = l.base ? INK : l.pior ? '#6E6E6E' : '#C4C4C4'
    out += `<rect x="${L}" y="${y}" width="${Math.max(2, x(l.v) - L).toFixed(1)}" height="${bh}" fill="${fill}"/>`
    out += `<text x="${(x(l.v) + 7).toFixed(1)}" y="${y + bh - 5.5}" font-size="10" font-weight="700" fill="${INK}">${kk(l.v)}</text>`
    const rot = corta(l.rot, 38)
    out += `<text x="${L - 10}" y="${y + bh - 7.5}" text-anchor="end" font-size="9.4" font-weight="${l.base ? 700 : 500}" fill="${INK}">${esc(rot)}</text>`
    if (l.delta) out += `<text x="${L - 10}" y="${y + bh + 2}" text-anchor="end" font-size="8.4" fill="${MUTED}">${kk(l.delta)}</text>`
  })
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Saldo em 30 de setembro sob cada risco isolado">
    ${out}<line x1="${L}" y1="${T - 4}" x2="${L}" y2="${T + linhas.length * (bh + gap) - gap + 4}" stroke="${INK}" stroke-width="1.2"/></svg>`
}
const r2 = n => Math.round(n * 100) / 100

/* ===================== paginas ===================== */
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')
const foot = t => `<div class="pfoot"><span>Bula Assessoria Pecuária — documento interno</span><span>${t} · 19/08/2026</span></div>`

const linhaAgo = D.linhas.M100.filter(p => p.data <= '2026-08-31' && (p.ent || p.sai))
const linhaSet = D.linhas.M100.filter(p => p.data >= '2026-09-01' && p.data <= '2026-09-30' && (p.ent || p.sai))
const setEnt = r2(linhaSet.reduce((s, x) => s + x.ent, 0))
const setSai = r2(linhaSet.reduce((s, x) => s + x.sai, 0))
const saldoEm = (k, d) => D.linhas[k].find(p => p.data === d).saldo
// dia mais pesado de setembro = maior saida LIQUIDA (o repasse do JMP nao conta: entra e sai no mesmo dia)
const diaPesadoSet = linhaSet.slice().sort((a, b) => (b.sai - b.ent) - (a.sai - a.ent))[0]
// resumo mensal por cenario, para a pagina de sintese
const resumoMes = k => ['2026-08', '2026-09', '2026-10'].map(m => {
  const dias = D.linhas[k].filter(p => p.data.slice(0, 7) === m)
  return { mes: m, ent: r2(dias.reduce((s, x) => s + x.ent, 0)), sai: r2(dias.reduce((s, x) => s + x.sai, 0)), fim: dias[dias.length - 1].saldo }
})
const MESNOME = { '2026-08': 'agosto (de 19/08)', '2026-09': 'setembro', '2026-10': 'outubro' }

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
  .capa .sub { font-size: 12.4px; color: #B5B5B5; margin-top: 8mm; max-width: 130mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
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
  .small { font-size: 9px; color: ${MUTED}; line-height: 1.5; }
  .tiles { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin: 4mm 0 6mm; }
  .tiles.t3 { grid-template-columns: repeat(3,1fr); }
  .tile { border: 1px solid ${GRID}; border-top: 3px solid ${INK}; padding: 3.4mm 3.4mm 3mm; }
  .tile .k { font-size: 8px; text-transform: uppercase; letter-spacing: .085em; color: ${MUTED}; margin-bottom: 1.6mm; line-height: 1.3; min-height: 5.6mm; }
  .tile .v { font-family: Oswald, sans-serif; font-size: 20px; font-weight: 600; line-height: 1; }
  .tile .v.sm { font-size: 16px; }
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
</style></head><body>

<!-- ============ CAPA ============ -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Fluxo de caixa<br>Cenários de setembro</h1>
  <div class="rule"></div>
  <div class="sub">O repasse da Bula Remates de 20/08, o eventual repasse integral da 2ª parcela do JMP ao Felipe e os R$ 40.000 de participação societária do Marcelo — o que cada combinação faz com o caixa até 31 de outubro.</div>
  <div class="meta">
    <div><span>Posição</span><strong>19 de agosto de 2026</strong></div>
    <div><span>Horizonte</span><strong>até 31/10/2026</strong></div>
    <div><span>Caixa Sicoob hoje</span><strong>R$ ${brl(D.caixa.sicoob)}</strong></div>
    <div><span>Decisões em jogo</span><strong>R$ ${brl(D.repasseTotal)}</strong></div>
  </div>
</section>

<!-- ============ 1. RESPOSTA ============ -->
<section class="page">
  <div class="head"><h2>A resposta, antes dos números</h2><span class="n">01 · Síntese</span></div>

  <p class="lead">O caixa <strong>suporta os dois pagamentos</strong>. O repasse do JMP é a parte fácil: os R$ ${brl(D.jmp2)} entram e saem no mesmo dia — ${dm(D.jmpData)} — então não abrem buraco nenhum em setembro. O que o repasse faz é <strong>tirar do caixa a folga que ia atravessar outubro</strong>, e é em outubro que a conta aparece.</p>

  <div class="tiles">
    <div class="tile"><div class="k">Sicoob hoje</div><div class="v"><span class="cur">R$</span>${brl0(D.caixa.sicoob)}</div><div class="d">extrato conciliado até 17/08</div></div>
    <div class="tile gold"><div class="k">Entra amanhã, 20/08</div><div class="v"><span class="cur">R$</span>${brl0(D.remates.totalReal)}</div><div class="d">${brl0(Math.abs(D.remates.delta))} a menos do que o ERP previa</div></div>
    <div class="tile"><div class="k">Saídas novas em discussão</div><div class="v"><span class="cur">R$</span>${brl0(D.repasseTotal)}</div><div class="d">JMP ${brl0(D.jmp2)} + Marcelo ${brl0(D.marcelo)}</div></div>
    <div class="tile"><div class="k">Saldo em 30/09 pagando tudo</div><div class="v"><span class="cur">R$</span>${brl0(M100.saldo30set)}</div><div class="d">contra ${brl0(REFc.saldo30set)} sem pagar nada</div></div>
  </div>

  <h3>As três perguntas</h3>
  <table>
    <thead><tr><th style="width:34%">Pergunta</th><th>Resposta</th></tr></thead>
    <tbody>
      <tr><td><strong>Dá para repassar a parcela inteira do JMP?</strong></td><td>Dá. Em ${dm(D.jmpData)} o dinheiro entra e sai no mesmo dia; o saldo não se mexe. Mesmo pagando tudo, o caixa <strong>não desce de R$ ${brl(M100.minSet.saldo)}</strong> em nenhum dia de setembro, e o dia mais pesado do mês — ${dm(diaPesadoSet.data)}, com R$ ${brl(r2(diaPesadoSet.sai - diaPesadoSet.ent))} de saída líquida — fecha em R$ ${brl(diaPesadoSet.saldo)}.</td></tr>
      <tr><td><strong>E os R$ ${brl0(D.marcelo)} do Marcelo?</strong></td><td>Cabem. Somados ao repasse, tiram R$ ${brl0(D.repasseTotal)} do caixa e ainda deixam <strong>R$ ${brl(M100.saldo31out)}</strong> em 31/10 — desde que os leilões de agora até 15/09 rendam como a média de 2026.</td></tr>
      <tr><td><strong>Onde isso pode dar errado?</strong></td><td>Não é no valor: é no calendário de recebimento. Se <strong>${pc(D.margemSeguranca[0].pct)} do que a Bula tem a receber atrasar 30 dias</strong>, o saldo encosta em R$ 50.000. A ${pc(D.margemSeguranca[1].pct)} chega a zero.</td></tr>
    </tbody>
  </table>

  <div class="box dark">
    <div class="t">O que o relatório encontrou de novo</div>
    <p>A planilha que a Bula Remates mandou prova que os dois títulos de amanhã foram lançados no ERP a <strong>1% do faturamento</strong>, quando o contrato paga por faixa de performance — <strong>0,75%</strong> no Kriz e <strong>0,50%</strong> no Neloraço. São <strong>R$ ${brl(Math.abs(D.remates.delta))} a menos</strong> do que o sistema esperava.</p>
    <p style="margin:0">O mesmo erro está provavelmente no <strong>São Geraldo (R$ ${brl(D.saoGeraldo.valor)}, vence 20/09)</strong>, também lançado a 1%. Se a faixa correta for 0,5%, setembro perde mais <strong>R$ ${brl(D.saoGeraldo.metade)}</strong>. Vale confirmar com a Bula Remates <em>antes</em> de decidir o tamanho do repasse ao Felipe.</p>
  </div>

  <h3>E uma conta que ninguém está fazendo</h3>
  <p>O Simples Nacional tributa a <strong>receita bruta</strong>. Os R$ ${brl(D.jmp2)} da 2ª parcela passam pela NF da Bula e carregam cerca de <strong>R$ ${brl(D.impostoSobreRepasse.media)}</strong> de imposto — que vence em outubro, independentemente de o dinheiro ter sido repassado. Repassando o valor cheio, a Bula fica com a conta e sem o dinheiro. O caminho natural é <strong>repassar líquido de imposto</strong>, ou combinar com o Felipe quem absorve esses ${pc(D.taxaTributaria.media)}.</p>

  <h3>O trimestre em três linhas</h3>
  <table>
    <thead><tr><th style="width:22%">Mês</th><th class="num">Entra</th><th class="num">Sai</th><th class="num">Saldo no fim, pagando tudo</th><th class="num">Saldo no fim, sem pagar nada</th></tr></thead>
    <tbody>
      ${resumoMes('M100').map((m, i) => `<tr><td>${MESNOME[m.mes]}</td><td class="num">${brl(m.ent)}</td><td class="num">${brl(m.sai)}</td>
        <td class="num"><strong>${brl(m.fim)}</strong></td><td class="num muted">${brl(resumoMes('REF')[i].fim)}</td></tr>`).join('')}
    </tbody>
  </table>
  <p class="small">A diferença entre as duas últimas colunas é exatamente os R$ ${brl(D.repasseTotal)} em discussão. Outubro entra com a mesma premissa de receita nos dois — R$ ${brl(D.entradaOutubro.total)} vindos dos ${D.entradaOutubro.nEventos} leilões agendados de hoje até 15/09.</p>

  ${foot('Fluxo de caixa — cenários de setembro')}
</section>

<!-- ============ 2. AGOSTO ============ -->
<section class="page">
  <div class="head"><h2>De onde partimos: 19 a 31 de agosto</h2><span class="n">02 · Curto prazo</span></div>

  <p class="lead">Amanhã é o dia mais movimentado do mês: entram R$ ${brl(D.remates.totalReal)} da Bula Remates e saem R$ ${brl0(linhaAgo[0].sai)} — o DAS de julho sozinho leva R$ 55.846,64. O fundo do mês é <strong>${dm(M100.minAgo.data)}, com R$ ${brl(M100.minAgo.saldo)}</strong>, e quem levanta o caixa de novo é o EAO Baviera em 25/08.</p>

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
  <p class="small">A tabela do contrato Bula Remates × Bula Assessoria remunera por faixa de performance (participação da Bula no faturamento bruto): 0,5% a partir de 5%, 0,75% a partir de 12,5%, 1,0% a partir de 20%. O ERP aplicou 1% linear nos dois títulos. Nenhum dos dois leilões tem fechamento lançado — a receita veio da planilha-mestra, não dos lotes.</p>

  <figure>${gAgosto()}
    <figcaption>Saldo do Sicoob dia a dia, já com o repasse corrigido para R$ ${brl(D.remates.totalReal)}. Os R$ ${brl(D.caixa.sicrediLiquido)} do Sicredi ficam fora do gráfico — é reserva, e o extrato de agosto daquela conta ainda não foi importado.</figcaption>
  </figure>

  <h3>Movimento a movimento até 31/08</h3>
  <table>
    <thead><tr><th style="width:9%">Data</th><th class="num" style="width:15%">Entra</th><th class="num" style="width:15%">Sai</th><th class="num" style="width:16%">Saldo</th><th>Principal item do dia</th></tr></thead>
    <tbody>
      ${linhaAgo.map(p => {
        const maior = p.itens.slice().sort((a, b) => b.valor - a.valor)[0]
        return `<tr${p.data === M100.minAgo.data ? ' class="destaque"' : ''}><td>${dm(p.data)}</td>
          <td class="num">${p.ent ? brl(p.ent) : '—'}</td><td class="num">${p.sai ? brl(p.sai) : '—'}</td>
          <td class="num">${brl(p.saldo)}</td><td class="muted">${esc(corta(maior.desc, 58))}</td></tr>`
      }).join('')}
    </tbody>
  </table>

  <div class="box rule">
    <p style="margin:0">Fora do fluxo acima há <strong>R$ ${brl(D.vencidos.total)} em ${D.vencidos.n} títulos vencidos</strong>, dos quais R$ ${brl(D.vencidos.ate60)} com menos de 60 dias. Nenhum deles entra nas projeções — se a cobrança recuperar parte, é folga extra, não é aposta.</p>
  </div>

  ${foot('Fluxo de caixa — cenários de setembro')}
</section>

<!-- ============ 3. SETEMBRO ============ -->
<section class="page">
  <div class="head"><h2>Setembro: o mês das duas decisões</h2><span class="n">03 · O mês em questão</span></div>

  <p class="lead">Setembro é o mês mais gordo do semestre em recebimento: <strong>R$ ${brl(D.receberSetembro)}</strong> já contratados, um terço deles (${pc(D.jmpPctSetembro)}) na 2ª parcela do JMP. Contra isso há R$ ${brl(D.pagarSetembro)} lançados no ERP mais os impostos de agosto, que <strong>ainda não estão lançados</strong> e valem cerca de R$ ${brl(M100.impSet)}.</p>

  <div class="tiles">
    <div class="tile"><div class="k">Entra em setembro</div><div class="v"><span class="cur">R$</span>${brl0(setEnt)}</div><div class="d">${D.receber.filter(x => x.data >= '2026-09-01' && x.data <= '2026-09-30').length} títulos contratados</div></div>
    <div class="tile"><div class="k">Sai, já lançado</div><div class="v"><span class="cur">R$</span>${brl0(D.pagarSetembro)}</div><div class="d">folha ${brl0(D.folhaAgosto)} + comissões ${brl0(D.comissoes25set)}</div></div>
    <div class="tile gold"><div class="k">Impostos de agosto <span class="tag est">estimado</span></div><div class="v"><span class="cur">R$</span>${brl0(M100.impSet)}</div><div class="d">${pc(D.taxaTributaria.media)} sobre o caixa de agosto</div></div>
    <div class="tile"><div class="k">Dia mais pesado do mês</div><div class="v"><span class="cur">R$</span>${brl0(r2(diaPesadoSet.sai - diaPesadoSet.ent))}</div><div class="d">${dm(diaPesadoSet.data)} · fecha em ${brl0(diaPesadoSet.saldo)}</div></div>
  </div>

  <h3>Por que o repasse do JMP não machuca setembro</h3>
  <p>Os dois títulos do JMP vencem em <strong>${dm(D.jmpData)}</strong> — R$ ${brl(D.jmpItens[0].valor)} das fêmeas e R$ ${brl(D.jmpItens[1].valor)} dos touros. Se o repasse ao Felipe sair no mesmo dia, entrada e saída se anulam e a linha do caixa segue reta. O saldo no dia continua em R$ ${brl(D.linhas.M100.find(p => p.data === D.jmpData).saldo)} com ou sem repasse. <strong>O custo não é em setembro; é a partir de 19/10</strong>, quando vencem os impostos e as comissões e o dinheiro do JMP não está mais lá.</p>

  <h3>Os impostos que ainda não estão no sistema</h3>
  <p>Nenhuma guia de agosto está lançada como conta a pagar. Estimei pela carga efetiva observada sobre o caixa recebido no mês anterior:</p>
  <table>
    <thead><tr><th>Competência</th><th class="num">DAS (Simples)</th><th class="num">ISSQN</th><th class="num">Total</th><th class="num">Caixa recebido no mês</th><th class="num">Carga</th><th>Pago em</th></tr></thead>
    <tbody>
      ${D.cargaTributaria.map(x => `<tr><td>${x.mes.slice(5)}/${x.mes.slice(0, 4)}</td><td class="num">${brl(x.das)}</td>
        <td class="num">${x.iss ? brl(x.iss) : '—'}</td><td class="num">${brl(x.total)}</td><td class="num">${brl(x.base)}</td>
        <td class="num">${pc(x.pct)}</td><td class="muted">${x.pagoEm.slice(5)}/${x.pagoEm.slice(0, 4)}</td></tr>`).join('')}
      <tr class="total"><td>08/2026 <span class="tag est">projetado</span></td><td class="num">${brl(M100.impSet * (1 - D.mixIss))}</td>
        <td class="num">${brl(M100.impSet * D.mixIss)}</td><td class="num">${brl(M100.impSet)}</td><td class="num">${brl(D.entradasAgostoProjetado)}</td>
        <td class="num">${pc(D.taxaTributaria.media)}</td><td>09/2026</td></tr>
    </tbody>
  </table>
  <p class="small">Carga média dos três meses observados: ${pc(D.taxaTributaria.media)} (mínimo ${pc(D.taxaTributaria.min)}, máximo ${pc(D.taxaTributaria.max)}). A base de agosto soma o que já entrou (R$ ${brl(D.entradasAgostoRealizado)}, incluindo a 1ª parcela do JMP recebida em 09/08) com o que ainda entra até 31/08. O ISSQN foi separado do DAS na mesma proporção da guia de julho (${pc(D.mixIss * 100)} do total) e datado em 15/09; o DAS em 21/09.</p>

  <h3>O que entra em setembro</h3>
  <table>
    <thead><tr><th style="width:9%">Data</th><th class="num" style="width:16%">Valor</th><th>Título</th></tr></thead>
    <tbody>
      ${D.receber.filter(x => x.data >= '2026-09-01' && x.data <= '2026-09-30').map(x =>
        `<tr${x.jmp ? ' class="destaque"' : ''}><td>${dm(x.data)}</td><td class="num">${brl(x.valor)}</td><td>${esc(corta(x.desc, 72))}</td></tr>`).join('')}
      <tr class="total"><td></td><td class="num">${brl(D.receberSetembro)}</td><td>Total contratado</td></tr>
    </tbody>
  </table>

  ${foot('Fluxo de caixa — cenários de setembro')}
</section>

<!-- ============ 4. CENARIOS ============ -->
<section class="page">
  <div class="head"><h2>Seis cenários</h2><span class="n">04 · Comparação</span></div>

  <p class="lead">Todos partem do mesmo ponto — R$ ${brl(D.caixa.sicoob)} hoje, o repasse da Bula Remates já corrigido — e mudam só o que se faz com os R$ ${brl(D.repasseTotal)} em discussão. Outubro entra em todos com a mesma premissa, então a comparação entre eles é limpa.</p>

  <table>
    <thead><tr><th style="width:20%">Cenário</th><th class="num">Sai a mais</th><th class="num">Fundo do período</th><th class="num">30/09</th><th class="num">31/10</th></tr></thead>
    <tbody>
      ${[REFc, M, M50, M100, ESC, STR].map(c => `<tr${c.chave === 'M100' ? ' class="destaque"' : ''}>
        <td><strong>${esc(c.nome)}</strong></td>
        <td class="num">${c.saidaNova ? brl(c.saidaNova) : '—'}</td>
        <td class="num">${brl(c.minimo.saldo)} <span class="muted">${dm(c.minimo.data)}</span></td>
        <td class="num">${brl(c.saldo30set)}</td>
        <td class="num">${brl(c.saldo31out)}</td></tr>`).join('')}
    </tbody>
  </table>

  <figure>${gCenarios()}
    <figcaption>Saldo do Sicoob ao fim de setembro e ao fim de outubro. Os quatro primeiros cenários compartilham o mesmo fundo de período — R$ ${brl(REFc.minimo.saldo)} em ${dm(REFc.minimo.data)} — porque nada do que se decide agora afeta agosto.</figcaption>
  </figure>

  <h3>O que cada um assume</h3>
  <table>
    <thead><tr><th style="width:20%">Cenário</th><th>Premissas</th></tr></thead>
    <tbody>
      ${[REFc, M, M50, M100, ESC, STR].map(c => `<tr><td><strong>${esc(c.nome)}</strong></td><td>${esc(c.resumo)}</td></tr>`).join('')}
    </tbody>
  </table>

  <figure>${gTrajetorias()}
    <figcaption>Trajetória do saldo de 31/08 a 31/10. A linha cheia é o cenário pedido — Marcelo e JMP integral. Repare que em ${dm(D.jmpData)} ela não se move: o JMP entra e sai no mesmo dia. As três linhas só se separam de verdade a partir de 19/10.</figcaption>
  </figure>

  ${foot('Fluxo de caixa — cenários de setembro')}
</section>

<!-- ============ 5. OUTUBRO E RISCOS ============ -->
<section class="page">
  <div class="head"><h2>Outubro é quem paga a conta</h2><span class="n">05 · Risco</span></div>

  <p class="lead">Em outubro o ERP só tem <strong>R$ ${brl(D.receberOutubro)}</strong> a receber — não porque o mês seja fraco, mas porque os títulos nascem 45 dias depois do leilão e os leilões de setembro ainda não aconteceram. Contra esse vazio aparente vencem os impostos de setembro (R$ ${brl(M100.impOut)}), a folha e as comissões: <strong>R$ ${brl(r2(D.pagarOutubro + M100.impOut + D.comissoes25set))}</strong> no total.</p>

  <div class="box">
    <div class="t">Como outubro foi estimado</div>
    <p style="margin:0">Há <strong>${D.entradaOutubro.nEventos} leilões na agenda entre hoje e 15/09</strong> — todos com recebimento previsto para outubro, a D+45. A receita média por leilão em 2026 (${D.entradaOutubro.nFechamentosBase} fechamentos desde abril) é de R$ ${brl(D.entradaOutubro.receitaMediaEvento)}, o que projeta <strong>R$ ${brl(D.entradaOutubro.total)}</strong> entrando em outubro, distribuídos em 06/10, 16/10 e 27/10. Essa premissa é igual em todos os cenários; o cenário de estresse a corta pela metade.</p>
  </div>

  <h3>O que pode corroer o saldo de 30/09</h3>
  <figure>${gRiscos()}
    <figcaption>Saldo que sobraria em 30/09 se cada revés acontecesse sozinho, partindo do cenário “Marcelo + JMP integral”. O número menor sob cada rótulo é o impacto isolado. A última barra é o pior caso, com os três juntos — não é a soma simples, porque menos receita também significa menos imposto.</figcaption>
  </figure>

  <table>
    <thead><tr><th style="width:46%">Risco</th><th class="num">Impacto em 30/09</th><th>Situação</th></tr></thead>
    <tbody>
      ${D.riscos.map(r => `<tr><td>${esc(r.rot)}</td><td class="num">${brl(r.valor)}</td><td class="muted">${esc(r.estado)}${r.jaEmbutido ? ' <span class="tag">já embutido</span>' : ''}</td></tr>`).join('')}
    </tbody>
  </table>

  <h3>Quanto dá para repassar em ${dm(D.jmpData)}, sob cada hipótese</h3>
  <p>Mantendo um colchão mínimo de R$ ${brl0(D.capacidadeColchao)} em qualquer dia até 31/10, e já com os R$ ${brl0(D.marcelo)} do Marcelo pagos em 25/09:</p>
  <table>
    <thead><tr><th style="width:60%">Hipótese</th><th class="num">Repasse máximo</th><th class="num">Folga sobre ${brl0(D.jmp2)}</th></tr></thead>
    <tbody>
      ${D.capacidade.map(c => `<tr><td>${esc(c.rot)}</td><td class="num">${brl(c.valor)}</td>
        <td class="num">${c.valor >= D.jmp2 ? 'cabe inteiro' : brl(r2(c.valor - D.jmp2))}</td></tr>`).join('')}
    </tbody>
  </table>
  <p class="small">Só a combinação de atraso de recebimento com carga tributária no teto derruba a capacidade abaixo do valor cheio da parcela — e ainda assim por R$ ${brl(Math.abs(r2(D.capacidade[3].valor - D.jmp2)))}.</p>

  <div class="box dark">
    <div class="t">A margem, em uma frase</div>
    <p style="margin:0">Pagando tudo — Marcelo e JMP integral — <strong>${pc(D.margemSeguranca[0].pct)} dos recebíveis precisariam atrasar 30 dias</strong> para o caixa encostar em R$ 50.000, e <strong>${pc(D.margemSeguranca[1].pct)}</strong> para chegar a zero. O comportamento histórico da carteira é de atraso mediano zero, com 69% dos títulos entrando no prazo ou antes. A decisão é confortável — o que não é confortável é fazê-la sem confirmar o São Geraldo.</p>
  </div>

  ${foot('Fluxo de caixa — cenários de setembro')}
</section>

<!-- ============ 6. RECOMENDACAO ============ -->
<section class="page">
  <div class="head"><h2>Recomendação e pendências</h2><span class="n">06 · Decisão</span></div>

  <h3>O que eu faria</h3>
  <ol>
    <li><strong>Repassar o JMP no dia ${dm(D.jmpData)}, no valor líquido de imposto.</strong> Pagar no mesmo dia em que o dinheiro entra é o que torna a operação neutra para o caixa. Descontar os ${pc(D.taxaTributaria.media)} de tributo — cerca de R$ ${brl(D.impostoSobreRepasse.media)} — evita que a Bula fique com uma guia de outubro referente a dinheiro que não é dela. Se o combinado com o Felipe for o valor cheio, tudo bem, mas então esses R$ ${brl(D.impostoSobreRepasse.media)} precisam ser reconhecidos como custo da operação, não como sobra.</li>
    <li><strong>Pagar o Marcelo em 25/09</strong>, junto com as comissões. É o dia mais pesado do mês — R$ ${brl(r2(D.comissoes25set + D.marcelo))} saindo de uma vez — e ainda assim o saldo fecha o dia em R$ ${brl(saldoEm('M100', '2026-09-25'))}. Se preferir folga, dividir em duas de R$ ${brl0(D.marcelo / 2)} (25/09 e 25/10) devolve R$ ${brl0(D.marcelo / 2)} ao mês mais apertado sem mudar o resultado do bimestre.</li>
    <li><strong>Confirmar o São Geraldo com a Bula Remates antes de 13/09.</strong> É o único número grande do trimestre que pode valer metade do que está lançado. Se vier R$ ${brl(D.saoGeraldo.metade)} em vez de R$ ${brl(D.saoGeraldo.valor)}, nada quebra — mas é melhor saber antes de assinar o repasse.</li>
    <li><strong>Corrigir no ERP os dois títulos de amanhã</strong> para R$ ${brl(D.remates.itens[0].real)} e R$ ${brl(D.remates.itens[1].real)}, conforme a planilha da leiloeira, e revisar a faixa de performance de todo título da Bula Remates ainda em aberto.</li>
    <li><strong>Atacar os R$ ${brl(D.vencidos.ate60)} vencidos com menos de 60 dias.</strong> É a folga que não custa nada e que hoje não está em nenhum cenário.</li>
  </ol>

  <h3>Ponto de checagem</h3>
  <p>Um único gatilho vale a pena acompanhar: <strong>em 20/09, comparar o que entrou no mês com o previsto</strong>. Até essa data setembro já deveria ter recebido R$ ${brl(r2(D.receber.filter(x => x.data >= '2026-09-01' && x.data <= '2026-09-20').reduce((s, x) => s + x.valor, 0)))}. Se o realizado ficar abaixo de 70% disso, adiar a participação do Marcelo para outubro recompõe o colchão imediatamente.</p>

  <h3>O calendário resumido</h3>
  <table>
    <thead><tr><th style="width:9%">Data</th><th>O que acontece</th><th class="num">Entra</th><th class="num">Sai</th><th class="num">Saldo no fim do dia</th></tr></thead>
    <tbody>
      ${[
        ['2026-08-20', 'Repasse da Bula Remates entra; DAS de julho e DARF saem'],
        ['2026-08-24', 'Fundo do mês, depois das faturas de cartão'],
        ['2026-08-25', 'EAO Baviera entra; comissões de julho saem'],
        ['2026-09-05', 'Folha de agosto'],
        ['2026-09-13', '2ª parcela do JMP entra e é repassada ao Felipe'],
        ['2026-09-15', 'Mafra Fêmeas entra; ISSQN de agosto sai'],
        ['2026-09-20', 'São Geraldo — o título a confirmar com a Bula Remates'],
        ['2026-09-21', 'LS Galéria entra; DAS de agosto sai'],
        ['2026-09-25', 'Comissões de agosto + participação do Marcelo'],
        ['2026-10-05', 'Folha de setembro'],
        ['2026-10-20', 'DAS de setembro'],
        ['2026-10-26', 'Comissões dos leilões de setembro'],
      ].map(([d, rot]) => {
        const p = D.linhas.M100.find(x => x.data === d)
        if (!p) return ''
        return `<tr${d === '2026-09-13' ? ' class="destaque"' : ''}><td>${dm(d)}</td><td>${esc(rot)}</td>
          <td class="num">${p.ent ? brl(p.ent) : '—'}</td><td class="num">${p.sai ? brl(p.sai) : '—'}</td><td class="num">${brl(p.saldo)}</td></tr>`
      }).join('')}
    </tbody>
  </table>
  <p class="small">Saldos do cenário “Marcelo + JMP integral”. Em ${dm(D.jmpData)} entra e sai o mesmo valor — é a linha que resume o relatório inteiro.</p>

  <div class="box">
    <div class="t">O que este relatório não sabe</div>
    <p class="small" style="margin:0">(a) O extrato do Sicoob está conciliado até 17/08 — movimentos de 18 e 19/08 ainda não entraram, e o saldo de partida pode variar um pouco. (b) O extrato do Sicredi de agosto nunca foi importado: a conta corrente aparece com −R$ 15.000,00 contra uma aplicação de R$ 27.598,64, o que é impossível numa conta com varredura; o líquido de R$ ${brl(D.caixa.sicrediLiquido)} é inferência e ficou fora de todos os cenários. (c) As guias de agosto e setembro são estimativas por carga efetiva, não cálculo do contador. (d) A receita de outubro é projeção por número de leilões na agenda × média de 2026 — a agenda de setembro e outubro ainda está incompleta por natureza, então a tendência é subestimar. (e) O título “Neloraço PO” (R$ ${brl(D.remates.itens[1].erp)}) e o “30º Neloraço Irmãos Hipólito” (R$ 1.425,00, vence 08/09) podem ser o mesmo evento lançado duas vezes — a planilha da leiloeira traz uma linha só. (f) Nenhum dos R$ ${brl(D.vencidos.total)} vencidos entra nas projeções.</p>
  </div>

  ${foot('Fluxo de caixa — cenários de setembro')}
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
const pdfPath = path.join(desktop, 'Bula - Fluxo de Caixa - Cenarios de Setembro - 19-08-2026.pdf')
await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '14mm', left: '11mm', right: '11mm' } })
await pg.screenshot({ path: path.join(OUT, 'preview.png'), fullPage: true })
await browser.close()
console.log('PDF:', pdfPath)
