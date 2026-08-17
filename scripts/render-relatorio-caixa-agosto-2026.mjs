/**
 * Renderiza o relatorio de caixa a partir de outputs/relatorio-caixa-agosto-2026/dados.json.
 * Paleta monocromatica do brandbook (preto/cinza/branco + dourado cirurgico).
 * Gera HTML e PDF A4. O PDF vai para a Area de Trabalho.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { chromium } from 'playwright'

const OUT = 'outputs/relatorio-caixa-agosto-2026'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))

/* ---------- helpers ---------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const corta = (t, n) => {
  const x = String(t)
  if (x.length <= n) return x
  const c = x.slice(0, n)
  const sp = c.lastIndexOf(' ')
  return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.-]+$/, '') + '…'
}
const mi = n => (Number(n) / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
const kk = n => {
  const a = Math.abs(n)
  if (a >= 1e6) return (n / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'mi'
  if (a >= 1000) return (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + 'k'
  return brl0(n)
}
const pc = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
const dm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7)
const MES = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/* ---------- paleta (validada: 19,8:1 / 3,36:1, separacao 5,89:1) ---------- */
const INK = '#0A0A0A', REF = '#8C8C8C', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C'
const RAMP = ['#EDEDED', '#CFCFCF', '#A8A8A8', '#6E6E6E', '#1A1A1A']

/* =======================================================================
   GRAFICO 1 — escada diaria de caixa
   ======================================================================= */
function gEscada() {
  const W = 760, H = 330, L = 62, R = 90, T = 26, B = 46
  const pts = D.escada
  const vals = pts.map(p => p.saldo)
  const max = Math.max(...vals) * 1.12, min = 0
  const x = i => L + i * (W - L - R) / (pts.length - 1)
  const y = v => T + (H - T - B) * (1 - (v - min) / (max - min))
  let grid = '', ticks = 5
  for (let i = 0; i <= ticks; i++) {
    const v = min + (max - min) * i / ticks, yy = y(v)
    grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    grid += `<text x="${L - 8}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="${MUTED}">${kk(v)}</text>`
  }
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' ')
  const area = line + ` L${x(pts.length - 1).toFixed(1)},${y(min)} L${x(0).toFixed(1)},${y(min)} Z`
  let lbl = ''
  pts.forEach((p, i) => {
    if (i === 0 || i === pts.length - 1 || (p.ent === 0 && p.sai === 0)) return
    lbl += `<line x1="${x(i).toFixed(1)}" y1="${y(p.saldo).toFixed(1)}" x2="${x(i).toFixed(1)}" y2="${H - B}" stroke="${GRID}" stroke-width="1"/>`
  })
  const dots = pts.map((p, i) => (p.ent || p.sai || i === 0 || i === pts.length - 1)
    ? `<circle cx="${x(i).toFixed(1)}" cy="${y(p.saldo).toFixed(1)}" r="3.4" fill="${INK}" stroke="#fff" stroke-width="2"/>` : '').join('')
  const iMin = pts.findIndex(p => p.data === D.pontoMinimo.data)
  const iHoje = 0
  // marcador lateral (dir) para o ponto de hoje, e inferior para o vale — sem colidir com o eixo
  const marcaLado = (i, txt, sub) => {
    const px = x(i), py = y(pts[i].saldo)
    return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.6" fill="${GOLD}" stroke="#fff" stroke-width="2"/>
      <text x="${(px + 10).toFixed(1)}" y="${(py - 5).toFixed(1)}" font-size="10.5" font-weight="700" fill="${INK}">${esc(txt)}</text>
      <text x="${(px + 10).toFixed(1)}" y="${(py + 6).toFixed(1)}" font-size="9" fill="${MUTED}">${esc(sub)}</text>`
  }
  const marcaBaixo = (i, txt, sub) => {
    const px = x(i), py = y(pts[i].saldo)
    return `<line x1="${px.toFixed(1)}" y1="${(py + 9).toFixed(1)}" x2="${px.toFixed(1)}" y2="${(py + 30).toFixed(1)}" stroke="${GOLD}" stroke-width="2"/>
      <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.6" fill="${GOLD}" stroke="#fff" stroke-width="2"/>
      <text x="${px.toFixed(1)}" y="${(py + 44).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${INK}">${esc(txt)}</text>
      <text x="${px.toFixed(1)}" y="${(py + 56).toFixed(1)}" text-anchor="middle" font-size="9" fill="${MUTED}">${esc(sub)}</text>`
  }
  const eixoX = pts.map((p, i) => (i % 2 === 0 || i === pts.length - 1)
    ? `<text x="${x(i).toFixed(1)}" y="${H - B + 16}" text-anchor="middle" font-size="9" fill="${MUTED}">${dm(p.data)}</text>` : '').join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Saldo diario do Sicoob de 17 a 31 de agosto">
    ${grid}${lbl}
    <path d="${area}" fill="${INK}" opacity="0.07"/>
    <path d="${line}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    ${marcaLado(iHoje, 'R$ ' + brl0(pts[0].saldo), 'hoje')}
    ${marcaBaixo(iMin, 'R$ ' + brl0(D.pontoMinimo.saldo), 'ponto mais baixo')}
    <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="${INK}" stroke-width="1.2"/>
    ${eixoX}
  </svg>`
}

/* =======================================================================
   GRAFICO 2 — cenarios de agosto (barras horizontais divergentes)
   ======================================================================= */
function gCenariosAgo() {
  const W = 760, H = 210, L = 108, R = 20, T = 14, bh = 30, gap = 16
  const vals = D.cenariosAgosto.map(c => c.saldo)
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0)
  const span = (max - min) || 1
  const x = v => L + (W - L - R) * (v - min) / span
  const x0 = x(0)
  let bars = ''
  D.cenariosAgosto.forEach((c, i) => {
    const yy = T + i * (bh + gap)
    const neg = c.saldo < 0
    const bx = neg ? x(c.saldo) : x0, bw = Math.max(2, Math.abs(x(c.saldo) - x0))
    const fill = i === 1 ? INK : REF
    bars += `<rect x="${bx.toFixed(1)}" y="${yy}" width="${bw.toFixed(1)}" height="${bh}" fill="${fill}" rx="4"/>`
    if (!neg) bars += `<rect x="${x0.toFixed(1)}" y="${yy}" width="${Math.min(4, bw).toFixed(1)}" height="${bh}" fill="${fill}"/>`
    else bars += `<rect x="${(x0 - Math.min(4, bw)).toFixed(1)}" y="${yy}" width="${Math.min(4, bw).toFixed(1)}" height="${bh}" fill="${fill}"/>`
    bars += `<text x="${L - 10}" y="${yy + bh / 2 + 4}" text-anchor="end" font-size="11" font-weight="${i === 1 ? 700 : 500}" fill="${INK}">${esc(c.nome)}</text>`
    const tx = neg ? bx - 8 : x(c.saldo) + 8
    bars += `<text x="${tx.toFixed(1)}" y="${yy + bh / 2 + 4}" text-anchor="${neg ? 'end' : 'start'}" font-size="11" font-weight="700" fill="${INK}">R$ ${brl0(c.saldo)}</text>`
  })
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Saldo do Sicoob em 31 de agosto nos quatro cenarios">
    ${bars}
    <line x1="${x0.toFixed(1)}" y1="${T - 6}" x2="${x0.toFixed(1)}" y2="${T + 4 * (bh + gap) - gap + 6}" stroke="${INK}" stroke-width="1.4"/>
    <text x="${x0.toFixed(1)}" y="${T + 4 * (bh + gap) - gap + 20}" text-anchor="middle" font-size="9" fill="${MUTED}">zero</text>
  </svg>`
}

/* =======================================================================
   GRAFICO 3 — aging de recebiveis (rampa sequencial)
   ======================================================================= */
function gAging() {
  const W = 760, H = 178, L = 128, R = 90, T = 12, bh = 26, gap = 12
  const max = Math.max(...D.aging.map(a => a.valor)) * 1.05 || 1
  let bars = ''
  D.aging.forEach((a, i) => {
    const yy = T + i * (bh + gap), bw = (W - L - R) * a.valor / max
    bars += `<rect x="${L}" y="${yy}" width="${Math.max(2, bw).toFixed(1)}" height="${bh}" fill="${RAMP[i + 1]}" rx="4"/>`
    bars += `<rect x="${L}" y="${yy}" width="4" height="${bh}" fill="${RAMP[i + 1]}"/>`
    bars += `<text x="${L - 10}" y="${yy + bh / 2 + 4}" text-anchor="end" font-size="10.5" fill="${INK}">${esc(a.faixa)}</text>`
    bars += `<text x="${(L + bw + 9).toFixed(1)}" y="${yy + bh / 2 + 4}" font-size="10.5" font-weight="700" fill="${INK}">R$ ${brl0(a.valor)}</text>`
    bars += `<text x="${(L + bw + 9).toFixed(1)}" y="${yy + bh / 2 + 15}" font-size="8.5" fill="${MUTED}">${a.n} titulo${a.n === 1 ? '' : 's'}</text>`
  })
  const yLim = T + 2 * (bh + gap) - gap / 2
  bars += `<line x1="${L - 4}" y1="${yLim}" x2="${W - R + 40}" y2="${yLim}" stroke="${GOLD}" stroke-width="1.6" stroke-dasharray="5 3"/>`
  bars += `<text x="${W - R + 44}" y="${yLim + 3.5}" font-size="8.5" font-weight="700" fill="${INK}">limite histórico</text>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Recebiveis vencidos por faixa de idade">${bars}</svg>`
}

/* =======================================================================
   GRAFICO 4 — VGV mensal 2025 x 2026 (barras agrupadas, 2 series)
   ======================================================================= */
function gSerie() {
  const W = 760, H = 300, L = 58, R = 14, T = 30, B = 44
  const rows = D.serie.filter(r => r.mes <= 8)
  const max = Math.max(...rows.map(r => Math.max(r.v25 || 0, r.v26 || 0))) * 1.1
  const iw = (W - L - R) / rows.length
  const bw = (iw - 14) / 2
  const y = v => T + (H - T - B) * (1 - v / max)
  let grid = ''
  for (let i = 0; i <= 4; i++) {
    const v = max * i / 4, yy = y(v)
    grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    grid += `<text x="${L - 8}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="${MUTED}">${kk(v)}</text>`
  }
  let bars = ''
  rows.forEach((r, i) => {
    const cx = L + i * iw + iw / 2
    const y25 = y(r.v25 || 0), y26 = y(r.v26 || 0)
    // 2025 (referencia, cinza) a esquerda; 2026 (foco, preto) a direita; 2px de respiro entre elas
    bars += `<rect x="${(cx - bw - 1).toFixed(1)}" y="${y25.toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - B - y25).toFixed(1)}" fill="${REF}" rx="3"/>`
    const parcial = r.mes === 8
    bars += `<rect x="${(cx + 1).toFixed(1)}" y="${y26.toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - B - y26).toFixed(1)}" fill="${parcial ? 'url(#hatch)' : INK}" stroke="${parcial ? INK : 'none'}" stroke-width="${parcial ? 1.2 : 0}" rx="3"/>`
    bars += `<text x="${cx.toFixed(1)}" y="${H - B + 15}" text-anchor="middle" font-size="9.5" fill="${MUTED}">${MES[r.mes]}</text>`
    if (parcial) {
      bars += `<text x="${cx.toFixed(1)}" y="${H - B + 28}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${MUTED}">parcial</text>`
    } else if (r.v25 && r.v26) {
      const dd = (r.v26 / r.v25 - 1) * 100
      bars += `<text x="${cx.toFixed(1)}" y="${H - B + 28}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${dd < 0 ? INK : MUTED}">${dd > 0 ? '+' : ''}${dd.toFixed(0)}%</text>`
    }
  })
  const leg = `<rect x="${L}" y="8" width="11" height="11" fill="${REF}" rx="2"/><text x="${L + 17}" y="17.5" font-size="10" fill="${INK}">2025</text>
    <rect x="${L + 56}" y="8" width="11" height="11" fill="${INK}" rx="2"/><text x="${L + 73}" y="17.5" font-size="10" fill="${INK}">2026</text>
    <rect x="${L + 112}" y="8" width="11" height="11" fill="url(#hatch)" stroke="${INK}" stroke-width="1" rx="2"/><text x="${L + 129}" y="17.5" font-size="10" fill="${INK}">2026 parcial</text>
    <text x="${W - R}" y="17.5" text-anchor="end" font-size="9" fill="${MUTED}">agosto fechado só até 16/08 — 11 leilões ainda por vir</text>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="VGV mensal 2025 contra 2026">
    <defs><pattern id="hatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <rect width="5" height="5" fill="#fff"/><line x1="0" y1="0" x2="0" y2="5" stroke="${INK}" stroke-width="2.6"/></pattern></defs>
    ${grid}${bars}<line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="${INK}" stroke-width="1.2"/>${leg}</svg>`
}

/* =======================================================================
   GRAFICO 5 — decomposicao da queda (cascata)
   ======================================================================= */
function gCascata() {
  const W = 760, H = 250, L = 58, R = 14, T = 26, B = 56
  const steps = [
    { l: 'VGV jan–jul 2025', v: D.janJul.v25, tipo: 'total' },
    { l: 'efeito volume', v: D.decomp.volume, tipo: 'delta' },
    { l: 'efeito preço', v: D.decomp.preco, tipo: 'delta' },
    { l: 'VGV jan–jul 2026', v: D.janJul.v26, tipo: 'total' },
  ]
  const max = D.janJul.v25 * 1.12
  const y = v => T + (H - T - B) * (1 - v / max)
  const iw = (W - L - R) / steps.length, bw = iw * 0.52
  let grid = ''
  for (let i = 0; i <= 4; i++) {
    const v = max * i / 4, yy = y(v)
    grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    grid += `<text x="${L - 8}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="${MUTED}">${kk(v)}</text>`
  }
  let acc = 0, bars = '', prevX = null, prevY = null
  steps.forEach((s, i) => {
    const cx = L + i * iw + iw / 2, bx = cx - bw / 2
    let top, hgt, fill
    if (s.tipo === 'total') { acc = s.v; top = y(s.v); hgt = (H - B) - top; fill = INK }
    else { const de = acc; acc = acc + s.v; top = y(Math.max(de, acc)); hgt = Math.abs(y(de) - y(acc)); fill = REF }
    bars += `<rect x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, hgt).toFixed(1)}" fill="${fill}" rx="3"/>`
    const lblY = top - 7
    const txt = s.tipo === 'delta' ? (s.v > 0 ? '+' : '−') + 'R$ ' + brl0(Math.abs(s.v)) : 'R$ ' + brl0(s.v)
    bars += `<text x="${cx.toFixed(1)}" y="${lblY.toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="${INK}">${esc(txt)}</text>`
    bars += `<text x="${cx.toFixed(1)}" y="${H - B + 16}" text-anchor="middle" font-size="9.5" fill="${MUTED}">${esc(s.l)}</text>`
    if (s.tipo === 'delta') {
      const share = Math.abs(s.v) / (Math.abs(D.decomp.preco) + Math.abs(D.decomp.volume)) * 100
      bars += `<text x="${cx.toFixed(1)}" y="${H - B + 29}" text-anchor="middle" font-size="9" font-weight="700" fill="${INK}">${share.toFixed(1).replace('.', ',')}% da queda</text>`
    }
    if (prevX !== null) bars += `<line x1="${prevX.toFixed(1)}" y1="${prevY.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${prevY.toFixed(1)}" stroke="${MUTED}" stroke-width="1" stroke-dasharray="3 3"/>`
    prevX = bx + bw; prevY = y(acc)
  })
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Decomposicao da queda de VGV entre volume e preco">
    ${grid}${bars}<line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="${INK}" stroke-width="1.2"/></svg>`
}

/* =======================================================================
   GRAFICO 6 — cenarios set-dez contra o break-even
   ======================================================================= */
function gSetDez() {
  const W = 760, H = 268, L = 58, R = 130, T = 26, B = 52
  const cs = D.cenariosSetDez
  const be = D.setDez.receitaBreakEven
  const max = Math.max(...cs.map(c => c.receita), be) * 1.14
  const iw = (W - L - R) / cs.length, bw = iw * 0.5
  const y = v => T + (H - T - B) * (1 - v / max)
  let grid = ''
  for (let i = 0; i <= 4; i++) {
    const v = max * i / 4, yy = y(v)
    grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    grid += `<text x="${L - 8}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="${MUTED}">${kk(v)}</text>`
  }
  let bars = ''
  cs.forEach((c, i) => {
    const cx = L + i * iw + iw / 2, bx = cx - bw / 2, ty = y(c.receita)
    const fill = i === 1 ? INK : REF
    bars += `<rect x="${bx.toFixed(1)}" y="${ty.toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - B - ty).toFixed(1)}" fill="${fill}" rx="4"/>`
    bars += `<text x="${cx.toFixed(1)}" y="${(ty - 8).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${INK}">R$ ${brl0(c.receita)}</text>`
    bars += `<text x="${cx.toFixed(1)}" y="${H - B + 16}" text-anchor="middle" font-size="10" font-weight="${i === 1 ? 700 : 500}" fill="${INK}">${esc(c.nome)}</text>`
    bars += `<text x="${cx.toFixed(1)}" y="${H - B + 29}" text-anchor="middle" font-size="8.5" fill="${MUTED}">cobertura a ${(c.T * 100).toFixed(0)}% de 2025</text>`
    bars += `<text x="${cx.toFixed(1)}" y="${H - B + 41}" text-anchor="middle" font-size="9" font-weight="700" fill="${INK}">sobra R$ ${brl0(c.resultado)}</text>`
  })
  const yBE = y(be)
  bars += `<line x1="${L}" y1="${yBE.toFixed(1)}" x2="${W - R + 6}" y2="${yBE.toFixed(1)}" stroke="${GOLD}" stroke-width="2" stroke-dasharray="6 3"/>`
  bars += `<text x="${W - R + 12}" y="${(yBE - 3).toFixed(1)}" font-size="10" font-weight="700" fill="${INK}">ponto de equilíbrio</text>`
  bars += `<text x="${W - R + 12}" y="${(yBE + 10).toFixed(1)}" font-size="9.5" fill="${MUTED}">R$ ${brl0(be)} em 4 meses</text>`
  bars += `<text x="${W - R + 12}" y="${(yBE + 22).toFixed(1)}" font-size="9.5" fill="${MUTED}">= R$ ${brl0(D.modelo.breakEvenMes)}/mês</text>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Receita projetada de setembro a dezembro nos quatro cenarios contra o ponto de equilibrio">
    ${grid}${bars}<line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="${INK}" stroke-width="1.2"/></svg>`
}

/* =======================================================================
   TABELAS
   ======================================================================= */
const linhasEscada = D.escada.filter(e => e.ent || e.sai).map(e => {
  const itens = (e.itens || []).filter(i => i.v > 0).sort((a, b) => b.v - a.v)
  return `<tr>
    <td class="num">${dm(e.data)}</td>
    <td>${itens.map(i => `<span class="chip ${i.t === 'entrada' ? 'in' : 'out'}">${i.t === 'entrada' ? '+' : '−'} ${brl0(i.v)}</span> ${esc(corta(i.d, 58))}`).join('<br>')}</td>
    <td class="num strong">${brl(e.saldo)}</td>
  </tr>`
}).join('')

const linhasCrSet = D.setembro.crItens.map(c => `<tr>
  <td class="num">${dm(c.data)}</td><td>${esc(corta(c.desc, 62))}</td><td class="num strong">${brl(c.valor)}</td></tr>`).join('')

const linhasVenc = D.vencidos.map(v => `<tr>
  <td class="num">${v.idade}d</td><td>${esc(corta(v.desc, 60))}</td><td class="num strong">${brl(v.valor)}</td>
  <td class="num ${v.idade > 60 ? 'alerta' : ''}">${v.idade > 60 ? 'fora do padrao' : 'dentro do padrao'}</td></tr>`).join('')

const linhasAgenda = D.agenda.filter(a => a.mes >= 8).map(a => `<tr>
  <td>${MES[a.mes]}/26</td><td class="num strong">${a.cadastrados}</td><td class="num">${a.real25 == null ? '—' : a.real25}</td>
  <td class="num">${a.real25 ? pc(100 * a.cadastrados / a.real25) : '—'}</td></tr>`).join('')

const linhasCen = D.cenariosSetDez.map((c, i) => `<tr class="${i === 1 ? 'destaque' : ''}">
  <td class="strong">${esc(c.nome)}</td><td class="num">${(c.T * 100).toFixed(0)}%</td>
  <td class="num">${mi(c.vgv)}</td><td class="num">${brl0(c.receita)}</td>
  <td class="num">${brl0(c.contrib)}</td><td class="num">${brl0(c.fixo)}</td>
  <td class="num strong">${brl0(c.resultado)}</td></tr>`).join('')

const linhasConc = D.concentracao.slice(0, 6).map(c => `<tr>
  <td>${esc(c.nome)}</td><td class="num">${brl0(c.valor)}</td><td class="num strong">${pc(c.pct)}</td></tr>`).join('')

/* =======================================================================
   HTML
   ======================================================================= */
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')
const cenB = D.cenariosAgosto.find(c => c.chave === 'B')
const cenD = D.cenariosAgosto.find(c => c.chave === 'D')
const prova = D.provaCalendario.find(p => p.mes === 8)

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Posicao de Caixa e Cenarios — Bula Assessoria</title>
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

  /* ---- capa ---- */
  .capa { background: ${INK}; color: #fff; padding: 32mm 20mm 20mm; display: flex; flex-direction: column; }
  .capa img { width: 42mm; margin-bottom: 26mm; }
  .capa h1 { font-size: 44px; line-height: 1.02; color: #fff; font-weight: 700; }
  .capa .sub { font-size: 12.6px; color: #B5B5B5; margin-top: 8mm; max-width: 128mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
  .capa .rule { width: 26mm; height: 3px; background: ${GOLD}; margin: 9mm 0; }
  .capa .meta { margin-top: auto; flex-wrap: wrap; row-gap: 6mm; display: flex; gap: 14mm; border-top: 1px solid #2A2A2A; padding-top: 6mm; }
  .capa .meta div span { display: block; font-size: 8.5px; color: #8A8A8A; text-transform: uppercase; letter-spacing: .09em; margin-bottom: 2px; }
  .capa .meta div strong { font-size: 12px; font-weight: 600; }

  /* ---- estrutura ---- */
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

  /* ---- tiles ---- */
  .tiles { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin: 4mm 0 6mm; }
  .tiles.t3 { grid-template-columns: repeat(3,1fr); }
  .tile { border: 1px solid ${GRID}; border-top: 3px solid ${INK}; padding: 3.4mm 3.4mm 3mm; }
  .tile .k { font-size: 8px; text-transform: uppercase; letter-spacing: .085em; color: ${MUTED}; margin-bottom: 1.6mm; line-height: 1.3; min-height: 5.6mm; }
  .tile .v { font-family: Oswald, sans-serif; font-size: 21px; font-weight: 600; line-height: 1; }
  .tile .v.sm { font-size: 17px; }
  .tile .d { font-size: 8.4px; color: ${MUTED}; margin-top: 1.6mm; line-height: 1.4; }
  .tile.gold { border-top-color: ${GOLD}; }

  /* ---- caixas ---- */
  .box { border: 1px solid ${GRID}; padding: 4mm 4.4mm; margin: 4mm 0; }
  .box.dark { background: ${INK}; color: #fff; border-color: ${INK}; }
  .box.dark .t { color: ${GOLD}; }
  .box.rule { border: none; border-left: 3px solid ${INK}; padding: 1mm 0 1mm 4mm; }
  .box .t { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; margin-bottom: 2.2mm; font-weight: 600; }
  .box.dark p { color: #D8D8D8; }
  .box.dark strong { color: #fff; }

  /* ---- tabelas ---- */
  table { width: 100%; border-collapse: collapse; font-size: 9.3px; margin: 3mm 0; }
  th { text-align: left; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.4px; letter-spacing: .07em; font-weight: 600;
       border-bottom: 1.4px solid ${INK}; padding: 2mm 1.8mm; }
  td { padding: 1.7mm 1.8mm; border-bottom: 1px solid #F0F0F0; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.strong { font-weight: 600; }
  tr.destaque td { background: #F6F6F6; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  td.alerta { color: ${INK}; font-weight: 600; }
  .chip { display: inline-block; font-variant-numeric: tabular-nums; font-weight: 600; font-size: 8.8px; padding: 0 1.2mm; border-radius: 2px; margin-right: 1mm; }
  .chip.in { background: #EFEFEF; }
  .chip.out { background: ${INK}; color: #fff; }

  figure { margin: 3mm 0 5mm; }
  figcaption { font-size: 8.6px; color: ${MUTED}; margin-top: 1.8mm; line-height: 1.45; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .cols3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5mm; }
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.6mm; }
  .tile .v .cur { font-size: 12px; font-weight: 500; color: ${MUTED}; margin-right: 1px; }
</style></head><body>

<!-- CAPA -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Posição de caixa<br>e cenários<br>até dezembro</h1>
  <div class="rule"></div>
  <div class="sub">Fluxo projetado dia a dia até 31 de agosto, a ponte de setembro e quatro cenários para o segundo semestre — com o teste que separa <strong style="color:#fff">queda de agenda</strong> de <strong style="color:#fff">queda de preço</strong>.</div>
  <div class="meta">
    <div><span>Data-base</span><strong>17 de agosto de 2026</strong></div>
    <div><span>Caixa consolidado</span><strong>R$ ${brl(D.caixa.consolidado)}</strong></div>
    <div><span>Fontes</span><strong>ERP · HastaPró · Planilha-mestra</strong></div>
    <div><span>Uso</span><strong>Interno — diretoria</strong></div>
  </div>
</section>

<!-- SUMARIO -->
<section class="page">
  <div class="head"><h2>Sumário executivo</h2><div class="n">01</div></div>

  <p class="lead">O caixa de agosto <strong>fecha positivo no cenário base</strong>, mas o mês inteiro se decide num único dia. Sobre o receio do segundo semestre, os números dizem uma coisa clara: <strong>a agenda não está encolhendo — o ticket é que encolheu</strong>. E a operação, do jeito que está hoje, suporta uma queda bem maior do que a que se desenha.</p>

  <div class="tiles">
    <div class="tile"><div class="k">Caixa hoje (consolidado)</div><div class="v"><span class="cur">R$</span>${brl0(D.caixa.consolidado)}</div><div class="d">Sicoob ${brl0(D.caixa.sicoob)} + Sicredi ${brl0(D.caixa.sicrediLiquido)}</div></div>
    <div class="tile"><div class="k">Saldo projetado em 31/08</div><div class="v"><span class="cur">R$</span>${brl0(D.saldo31)}</div><div class="d">cenário base, só com títulos datados</div></div>
    <div class="tile gold"><div class="k">Dia mais apertado</div><div class="v">${dm(D.pontoMinimo.data)}</div><div class="d">saldo cai a R$ ${brl0(D.pontoMinimo.saldo)}</div></div>
    <div class="tile"><div class="k">A receber em setembro</div><div class="v"><span class="cur">R$</span>${brl0(D.setembro.cr)}</div><div class="d">${pc(D.setembro.jmpPct)} disso é o JMP</div></div>
  </div>

  <h3>As três conclusões</h3>

  <div class="box rule">
    <div class="t">1 &nbsp;·&nbsp; Agosto depende de um título só</div>
    <p>No cenário base o caixa nunca fica abaixo de <strong>R$ ${brl0(D.pontoMinimo.saldo)}</strong>. Mas essa folga inteira é o <strong>EAO Baviera</strong>, de R$ ${brl(D.tituloCritico.valor)}, previsto para ${dm(D.tituloCritico.data)} — o mesmo dia em que saem R$ ${brl0(D.escada.find(e => e.data === D.tituloCritico.data).sai)} de comissões de julho. Se ele não entrar, o Sicoob vira <strong>negativo em R$ ${brl0(Math.abs(D.saldoSemCritico))}</strong> em ${dm(D.tituloCritico.data)}. Cobrar esse título esta semana vale mais do que qualquer outra medida deste relatório.</p>
  </div>

  <div class="box rule">
    <div class="t">2 &nbsp;·&nbsp; A agenda curta de set–dez é do cadastro, não do mercado</div>
    <p>O calendário mostra poucos leilões de setembro em diante, mas <strong>${pc(D.leadTime.ate45)} dos leilões de 2026 entraram na agenda com 45 dias ou menos de antecedência</strong> (mediana de ${D.leadTime.mediana} dias). Quarenta dias antes de agosto começar havia <strong>${prova.antes} eventos</strong> cadastrados; agosto fechou com <strong>${prova.final}</strong>. O que está lá hoje para set–dez são as âncoras planejadas com meses de antecedência — o miolo do mês ainda não foi lançado. Em leilões realizados, jan–jul/2026 teve <strong>${D.janJul.ev26}</strong> contra ${D.janJul.ev25} em 2025.</p>
  </div>

  <div class="box rule">
    <div class="t">3 &nbsp;·&nbsp; A queda é preço, e ela cabe no orçamento</div>
    <p>De janeiro a julho o VGV caiu ${pc(Math.abs(D.janJul.deltaVGV))}. Decompondo: <strong>${pc(D.decomp.pctPreco)} da queda é preço por lote</strong> (R$ ${brl0(D.janJul.rl26)} contra R$ ${brl0(D.janJul.rl25)}) e o resto é volume de lotes. Com a estrutura de custo de hoje, o segundo semestre só deixa de se pagar se a cobertura despencar para <strong>${pc(D.setDez.TBreakEven * 100)} do nível de 2025</strong>. O ritmo atual está entre ${pc(D.fatores.junJul * 100)} e ${pc(D.fatores.janJul * 100)}.</p>
  </div>

  <h3>Como ler este relatório</h3>
  <div class="cols3">
    <div><p class="small"><strong>Páginas 02 a 05 — o curto prazo.</strong> Onde está o dinheiro hoje, o mês movimento a movimento, os quatro cenários de agosto e a qualidade da carteira. É a parte acionável nesta semana.</p></div>
    <div><p class="small"><strong>Páginas 06 a 08 — o diagnóstico.</strong> A ponte de setembro e o exame do receio em duas frentes: a agenda (que não caiu) e o preço (que caiu). É a parte que explica o que está acontecendo.</p></div>
    <div><p class="small"><strong>Páginas 09 e 10 — o segundo semestre.</strong> Quatro cenários até dezembro contra o ponto de equilíbrio, e a lista de ações em ordem de retorno. É a parte que orienta decisão.</p></div>
  </div>

  <h3>O veredito</h3>
  <p>Não há problema de solvência no horizonte deste relatório. Há um <strong>problema de sincronismo em agosto</strong> — a maior saída do mês, o DAS de julho de R$ ${brl0(55846.64)} em 20/08, chega antes da maior entrada — e um <strong>problema de cobrança</strong>: R$ ${brl0(D.vencidoTotal)} vencidos, dos quais R$ ${brl0(D.vencidoForaPadrao)} já passaram do prazo em que, historicamente, esta casa nunca deixou de receber.</p>
  <div class="pfoot"><span>Bula Assessoria Pecuária — documento interno</span><span>Posição de caixa e cenários · 17/08/2026</span></div>
</section>

<!-- CAIXA -->
<section class="page">
  <div class="head"><h2>Posição de caixa</h2><div class="n">02</div></div>

  <div class="cols">
    <div>
      <h3>Onde está o dinheiro</h3>
      <table>
        <tr><th>Conta</th><th class="num">Saldo</th></tr>
        ${D.contas.map(c => `<tr><td>${esc(c.nome)}</td><td class="num strong">${brl(c.saldo)}</td></tr>`).join('')}
        <tr class="total"><td>Consolidado</td><td class="num">${brl(D.caixa.consolidado)}</td></tr>
      </table>
      <p class="small">O Sicoob está conciliado contra o extrato de 17/08 ao centavo. A conta corrente do Sicredi aparece em R$ ${brl(D.caixa.sicrediCC)}: o PIX de R$ 15.000 de 04/08 saiu de lá sem que o resgate correspondente da aplicação fosse lançado. O dinheiro existe — está na aplicação; falta o lançamento. Trate o bloco Sicredi como <strong>R$ ${brl(D.caixa.sicrediLiquido)}</strong>.</p>
    </div>
    <div>
      <h3>O que já está contratado até 31/08</h3>
      <table>
        <tr><th>Movimento</th><th class="num">Valor</th></tr>
        <tr><td>Entradas com data firmada</td><td class="num strong">${brl(D.crAgostoFirme)}</td></tr>
        <tr><td>Entradas a cobrar</td><td class="num strong">${brl(D.crAgostoCobrar)}</td></tr>
        <tr><td>Saídas comprometidas</td><td class="num strong">− ${brl(D.cpAgostoSemFolha)}</td></tr>
        <tr><td>Folha de agosto <span class="muted">(paga em 03/09)</span></td><td class="num">− ${brl(D.folhaAgosto)}</td></tr>
        <tr class="total"><td>Efeito no caixa em agosto</td><td class="num">${brl(D.crAgostoTotal - D.cpAgostoSemFolha)}</td></tr>
      </table>
      <p class="small">A folha vence dia 31, mas o histórico mostra pagamento entre o 1º e o 8º dia do mês seguinte (mediana de ${D.folhaAtrasoMediano} dias). Por isso ela sai da conta de agosto no cenário base — e volta nos cenários conservador e de estresse.</p>
    </div>
  </div>

  <h3>Saldo do Sicoob, dia a dia</h3>
  <figure>${gEscada()}
    <figcaption>Cenário base: todos os títulos datados entram e saem no vencimento, vencidos regularizados em 18/08 e folha de agosto paga em 03/09. O vale de ${dm(D.pontoMinimo.data)} é o encontro das comissões de julho com as faturas de cartão.</figcaption>
  </figure>

  <div class="box dark">
    <div class="t">O ponto único de falha</div>
    <p>Em ${dm(D.tituloCritico.data)} entram R$ ${brl(D.tituloCritico.valor)} do <strong>EAO Baviera</strong> e saem R$ ${brl0(D.escada.find(e => e.data === D.tituloCritico.data).sai)} — quase todo o lote de comissões de julho. Sem essa entrada o saldo do dia vai a <strong>R$ ${brl(D.saldoSemCritico)}</strong>. As compensações possíveis, em ordem de menor atrito: resgatar o Sicredi (R$ ${brl(D.caixa.sicrediLiquido)}), negociar o lote de comissões para o dia 30 — quando entram R$ ${brl0(D.escada.find(e => e.data === '2026-08-30').ent)} — ou antecipar qualquer um dos R$ ${brl0(D.vencidoDentroPadrao)} vencidos de até 60 dias.</p>
  </div>
  <div class="pfoot"><span>Bula Assessoria Pecuária — documento interno</span><span>Posição de caixa e cenários · 17/08/2026</span></div>
</section>

<!-- DIA A DIA -->
<section class="page">
  <div class="head"><h2>O mês, movimento a movimento</h2><div class="n">03</div></div>
  <p class="lead">Só os dias com movimento. O saldo da última coluna é o do fim do dia, no cenário base.</p>
  <table>
    <tr><th style="width:12mm">Dia</th><th>Movimentos</th><th class="num" style="width:30mm">Saldo ao fim do dia</th></tr>
    ${linhasEscada}
  </table>
  <p class="small">Os títulos vencidos de competência anterior — Bulinha, FGTS e a máquina de café, R$ ${brl0(8492)} somados — foram alocados em 18/08 por serem regularizações pendentes sem data nova. Se forem empurrados, todo o perfil melhora; mas o vale de ${dm(D.pontoMinimo.data)} permanece, porque ele é feito de compromissos com data certa.</p>
  <div class="pfoot"><span>Bula Assessoria Pecuária — documento interno</span><span>Posição de caixa e cenários · 17/08/2026</span></div>
</section>

<!-- CENARIOS AGOSTO -->
<section class="page">
  <div class="head"><h2>Os quatro cenários de agosto</h2><div class="n">04</div></div>

  <p class="lead">Os cenários não mexem no custo — as saídas de agosto já estão contratadas e datadas. O que varia é <strong>quanto da carteira entra</strong> e <strong>quando a folha é paga</strong>.</p>

  <figure>${gCenariosAgo()}
    <figcaption>Saldo do Sicoob em 31/08. A barra preta é o cenário base. Não inclui o bloco Sicredi de R$ ${brl(D.caixa.sicrediLiquido)}, que serve de colchão.</figcaption>
  </figure>

  <table>
    <tr><th style="width:26mm">Cenário</th><th>Premissa</th><th class="num" style="width:26mm">Sicoob 31/08</th><th class="num" style="width:26mm">Com Sicredi</th></tr>
    ${D.cenariosAgosto.map((c, i) => `<tr class="${i === 1 ? 'destaque' : ''}">
      <td class="strong">${esc(c.nome)}</td><td>${esc(c.desc)}</td>
      <td class="num strong">${brl(c.saldo)}</td><td class="num">${brl(c.comSicredi)}</td></tr>`).join('')}
  </table>

  <div class="box rule">
    <div class="t">Por que o cenário de estresse assusta menos do que parece</div>
    <p>Mesmo em estresse, o rombo de R$ ${brl0(Math.abs(cenD.saldo))} é menor que a folha de um mês e se resolve deslocando o próprio lote de comissões, que é discricionário e historicamente já foi pago fora do vencimento. O que <em>não</em> é discricionário — DAS, DARF e cartão, R$ ${brl0(55846.64 + 1114.60 + 7329.97)} somados — cabe folgado no saldo de hoje, sem depender de nenhuma cobrança.</p>
    <p>Dito isso, o cenário de estresse deixa a empresa entrando em setembro com o caixa no vermelho e sem colchão — e setembro começa com a folha de agosto, R$ ${brl0(D.folhaAgosto)}, no dia 3, antes de qualquer recebimento relevante do mês.</p>
  </div>
  <div class="pfoot"><span>Bula Assessoria Pecuária — documento interno</span><span>Posição de caixa e cenários · 17/08/2026</span></div>
</section>

<!-- CARTEIRA -->
<section class="page">
  <div class="head"><h2>A carteira: o que entra e com que pontualidade</h2><div class="n">05</div></div>

  <div class="tiles">
    <div class="tile"><div class="k">Atraso mediano de recebimento</div><div class="v">${D.recebimento.mediana} dias</div><div class="d">${D.recebimento.n} títulos recebidos em 2026</div></div>
    <div class="tile"><div class="k">Recebidos no prazo ou antes</div><div class="v">${pc(D.recebimento.noPrazoPct)}</div><div class="d">${pc(D.recebimento.ate30Pct)} em até 30 dias</div></div>
    <div class="tile"><div class="k">Maior atraso já observado</div><div class="v">${D.recebimento.maiorAtraso} dias</div><div class="d">nenhum recebimento passou disso</div></div>
    <div class="tile gold"><div class="k">Vencido fora do padrão</div><div class="v"><span class="cur">R$</span>${brl0(D.vencidoForaPadrao)}</div><div class="d">de R$ ${brl0(D.vencidoTotal)} vencidos</div></div>
  </div>

  <p>A carteira da Bula é <strong>pontual</strong>: metade dos títulos é paga no dia do vencimento ou antes, e o atraso médio ponderado por valor é de ${D.recebimento.medioPonderado} dias. Isso torna o aging abaixo mais útil que o normal — quando um título desta casa passa de 60 dias, ele sai do comportamento observado, e nenhum dos ${D.recebimento.n} recebimentos de 2026 levou mais que ${D.recebimento.maiorAtraso} dias.</p>

  <h3>Recebíveis vencidos por idade</h3>
  <figure>${gAging()}
    <figcaption>A linha marca 60 dias — o limite acima do qual nunca houve recebimento em 2026. R$ ${brl0(D.vencidoForaPadrao)} já estão desse lado.</figcaption>
  </figure>

  <table>
    <tr><th class="num" style="width:14mm">Idade</th><th>Título</th><th class="num" style="width:24mm">Valor</th><th class="num" style="width:28mm">Leitura</th></tr>
    ${linhasVenc}
    <tr class="total"><td></td><td>Total vencido</td><td class="num">${brl(D.vencidoTotal)}</td><td></td></tr>
  </table>
  <div class="pfoot"><span>Bula Assessoria Pecuária — documento interno</span><span>Posição de caixa e cenários · 17/08/2026</span></div>
</section>

<!-- SETEMBRO -->
<section class="page">
  <div class="head"><h2>Setembro: a ponte</h2><div class="n">06</div></div>

  <p class="lead">Setembro é o mês que resolve o ano. Entram <strong>R$ ${brl(D.setembro.cr)}</strong> já contratados — mais do que qualquer mês isolado de janeiro a julho — contra R$ ${brl(D.setembro.cpReal + D.setembro.cpOrc + D.folhaAgosto)} de saídas previstas.</p>

  <div class="tiles t3">
    <div class="tile"><div class="k">A receber contratado</div><div class="v"><span class="cur">R$</span>${brl0(D.setembro.cr)}</div><div class="d">${D.setembro.crItens.length} títulos</div></div>
    <div class="tile"><div class="k">Saídas previstas</div><div class="v"><span class="cur">R$</span>${brl0(D.setembro.cpReal + D.setembro.cpOrc + D.folhaAgosto)}</div><div class="d">inclui a folha de agosto paga em 03/09</div></div>
    <div class="tile gold"><div class="k">Peso do JMP</div><div class="v">${pc(D.setembro.jmpPct)}</div><div class="d">R$ ${brl0(D.setembro.jmp)} em 13/09</div></div>
  </div>

  <div class="box rule">
    <div class="t">O que dá confiança e o que exige vigilância</div>
    <p><strong>Dá confiança:</strong> a 1ª parcela do JMP, de R$ 165.667,50, entrou em 10/08 — um dia depois do vencimento, sem atrito. A 2ª parcela é do mesmo contrato e da mesma contraparte.</p>
    <p><strong>Exige vigilância:</strong> ${pc(D.setembro.jmpPct)} do mês depender de um pagador só significa que cada dia de atraso do JMP tem custo direto de caixa. E o Mafra (R$ ${brl0(88202)}), o São Geraldo (R$ ${brl0(50198)}) e o LS Galeria (R$ ${brl0(57840)}) são títulos <em>novos</em>, lançados agora — sem histórico de pontualidade dessas contrapartes nesses valores.</p>
  </div>

  <table>
    <tr><th style="width:14mm">Venc.</th><th>Título</th><th class="num" style="width:26mm">Valor</th></tr>
    ${linhasCrSet}
    <tr class="total"><td></td><td>Total de setembro</td><td class="num">${brl(D.setembro.cr)}</td></tr>
  </table>

  <p class="small">Nota de método: os títulos de julho e agosto sem data acordada com a leiloeira foram lançados com vencimento em <strong>data do leilão + 45 dias</strong>, que é a prática do contrato. Onde a planilha-mestra traz data explícita — Kirz e Neloraço em 20/08, São Geraldo em 20/09 — essa data prevaleceu.</p>
  <div class="pfoot"><span>Bula Assessoria Pecuária — documento interno</span><span>Posição de caixa e cenários · 17/08/2026</span></div>
</section>

<!-- AGENDA -->
<section class="page">
  <div class="head"><h2>O receio examinado (I): a agenda</h2><div class="n">07</div></div>

  <p class="lead">A percepção de que "o número de leilões está caindo até o fim do ano" vem de olhar o calendário. O calendário, porém, <strong>não é uma previsão — é um cadastro que se enche em cima da hora</strong>.</p>

  <div class="tiles">
    <div class="tile"><div class="k">Antecedência mediana de cadastro</div><div class="v">${D.leadTime.mediana} dias</div><div class="d">${D.leadTime.n} leilões de 2026</div></div>
    <div class="tile"><div class="k">Cadastrados com até 30 dias</div><div class="v">${pc(D.leadTime.ate30)}</div><div class="d">até 45 dias: ${pc(D.leadTime.ate45)}</div></div>
    <div class="tile gold"><div class="k">Agosto, 40 dias antes</div><div class="v">${prova.antes} → ${prova.final}</div><div class="d">o que havia cadastrado e o que o mês fechou</div></div>
    <div class="tile"><div class="k">Leilões realizados jan–jul</div><div class="v">${D.janJul.ev26} <span class="muted" style="font-size:13px">vs ${D.janJul.ev25}</span></div><div class="d">2026 contra 2025 — mais praças cobertas</div></div>
  </div>

  <h3>O que o calendário mostra hoje, contra o que 2025 de fato entregou</h3>
  <table>
    <tr><th>Mês</th><th class="num">Cadastrados hoje</th><th class="num">Realizados em 2025</th><th class="num">Cobertura do cadastro</th></tr>
    ${linhasAgenda}
  </table>

  <div class="box rule">
    <div class="t">Como ler essa tabela</div>
    <p>Os eventos que já estão em setembro, outubro, novembro e dezembro foram cadastrados com <strong>139 a 223 dias de antecedência</strong> — são as âncoras do ano (JMP, EAO, Matinha, Jacamim, Santa Nazaré), marcadas com meses de folga. O miolo de cada mês, que responde por dois terços da agenda, historicamente entra nos 30 dias anteriores. Concluir "o ano vai encolher" a partir dessa tabela é ler um cadastro incompleto como se fosse demanda.</p>
    <p><strong>O que isso não significa:</strong> não é garantia de que set–dez repetirá 2025. Significa que <em>a agenda de hoje não é evidência de queda</em> — e a evidência real de queda está na próxima página.</p>
  </div>

  <p class="small">Ressalva honesta: a prova de enchimento acima tem duas observações — julho e agosto — com bases pequenas, 6 e ${prova.antes} eventos. Ela sustenta a direção do argumento, não um multiplicador preciso. Por isso a projeção do segundo semestre não usa esse fator: usa o formato sazonal de 2025 escalado pelo nível observado de 2026, que é um método mais estável.</p>
  <div class="pfoot"><span>Bula Assessoria Pecuária — documento interno</span><span>Posição de caixa e cenários · 17/08/2026</span></div>
</section>

<!-- PRECO -->
<section class="page">
  <div class="head"><h2>O receio examinado (II): o preço</h2><div class="n">08</div></div>

  <p class="lead">Aqui está a queda de verdade. De janeiro a julho o VGV caiu <strong>${pc(Math.abs(D.janJul.deltaVGV))}</strong> contra 2025 — mas não por falta de praça.</p>

  <figure>${gSerie()}
    <figcaption>VGV mensal da cobertura Bula. Junho de 2026 praticamente empata com junho de 2025; julho e agosto é que abrem o vão. Agosto/2026 está fechado só até 16/08 e ainda tem 11 leilões na agenda — a comparação do mês ainda não é válida.</figcaption>
  </figure>

  <figure>${gCascata()}
    <figcaption>Decomposição de jan–jul: o efeito volume mede quantos lotes a menos foram vendidos ao preço de 2025; o efeito preço mede o que a queda de ticket tirou dos lotes efetivamente vendidos.</figcaption>
  </figure>

  <div class="cols">
    <div>
      <table style="margin-top:0">
        <tr><th>Indicador (jan–jul)</th><th class="num">2025</th><th class="num">2026</th><th class="num">Δ</th></tr>
        <tr><td>Leilões com venda</td><td class="num">${D.janJul.ev25}</td><td class="num">${D.janJul.ev26}</td><td class="num strong">${D.janJul.ev26 >= D.janJul.ev25 ? '+' : ''}${(D.janJul.ev26 - D.janJul.ev25)}</td></tr>
        <tr><td>Lotes vendidos</td><td class="num">${brl0(D.janJul.lt25)}</td><td class="num">${brl0(D.janJul.lt26)}</td><td class="num strong">${pc(D.janJul.deltaLotes)}</td></tr>
        <tr><td>Preço por lote</td><td class="num">${brl0(D.janJul.rl25)}</td><td class="num">${brl0(D.janJul.rl26)}</td><td class="num strong">${pc(D.janJul.deltaPreco)}</td></tr>
        <tr class="total"><td>VGV</td><td class="num">${mi(D.janJul.v25)}</td><td class="num">${mi(D.janJul.v26)}</td><td class="num">${pc(D.janJul.deltaVGV)}</td></tr>
      </table>
      <p class="small" style="margin-top:2mm"><strong>A consequência gerencial:</strong> se ${pc(D.decomp.pctPreco)} da queda é preço e a equipe já cobriu <strong>mais</strong> praças que em 2025, cobrar volume de praça da equipe não resolve — a capacidade produtiva está intacta. O que move o resultado agora é o mix e o tipo de acordo, não o número de eventos.</p>
    </div>
    <div>
      <h3 style="margin-top:0">Por que o boi caro joga contra</h3>
      <p>A intuição de commodity engana aqui. A arroba está em <strong>recorde nominal</strong> em 2026, e isso é vento contra, não a favor: a alta vem de <strong>oferta reduzida</strong> — menos animal circulando, menos pista. O pecuarista com boi na máxima realiza em vez de investir, e a reposição, também em máxima, disputa o mesmo caixa que compraria genética.</p>
      <p>O teste que fecha o diagnóstico: medido <strong>em arrobas</strong>, o lote caiu 28,0% enquanto a commodity subia 12,4%. A genética descolou para baixo do boi gordo — é retração de demanda pelo discricionário, não indexação.</p>
      <p class="small">O gatilho de virada, portanto, é a <strong>normalização da oferta</strong> — abate e retenção —, não o preço da arroba em si.</p>
    </div>
  </div>
  <div class="pfoot"><span>Bula Assessoria Pecuária — documento interno</span><span>Posição de caixa e cenários · 17/08/2026</span></div>
</section>

<!-- CENARIOS SET-DEZ -->
<section class="page">
  <div class="head"><h2>Cenários de setembro a dezembro</h2><div class="n">09</div></div>

  <p class="lead">A projeção usa o <strong>formato sazonal de 2025</strong> — set–dez concentrou R$ ${mi(D.setDez.v25)} — escalado pelo <strong>nível observado de 2026</strong>. Cada cenário é um fator de nível diferente, e nenhum é chute: todos saem de períodos realmente medidos.</p>

  <figure>${gSetDez()}
    <figcaption>Receita da Bula projetada para os quatro meses, contra o ponto de equilíbrio. A barra preta é o cenário base.</figcaption>
  </figure>

  <table>
    <tr><th>Cenário</th><th class="num">Nível</th><th class="num">Cobertura</th><th class="num">Receita</th><th class="num">Margem contrib.</th><th class="num">Custo fixo</th><th class="num">Resultado</th></tr>
    ${linhasCen}
  </table>

  <div class="cols">
    <div>
      <h3>O modelo por trás</h3>
      <table>
        <tr><td>Receita sobre a cobertura <span class="muted">(take-rate)</span></td><td class="num strong">${pc(D.modelo.takeRate * 100)}</td></tr>
        <tr><td>Comissão de assessores</td><td class="num strong">${pc(D.modelo.pctComissao * 100)} da receita</td></tr>
        <tr><td>Imposto</td><td class="num strong">${pc(D.modelo.pctImposto * 100)} da receita</td></tr>
        <tr class="total"><td>Margem de contribuição</td><td class="num">${pc(D.modelo.margemContribuicao * 100)}</td></tr>
        <tr><td>Custo fixo mensal</td><td class="num strong">${brl0(D.custo.fixoMensal)}</td></tr>
        <tr class="total"><td>Receita de equilíbrio por mês</td><td class="num">${brl0(D.modelo.breakEvenMes)}</td></tr>
      </table>
      <p class="small">Take-rate, comissão e imposto vêm dos totais fechados de 2026 na planilha-mestra. O custo fixo é a média realizada de abril a julho no extrato — estrutura mais despesa de leilão —, com a folha ajustada para o valor atual de R$ ${brl0(D.folhaMensal)}.</p>
    </div>
    <div>
      <div class="box dark" style="margin-top:0">
        <div class="t">Nível de ruptura</div>
        <p>O segundo semestre só deixa de se pagar se a cobertura cair para <strong>${pc(D.setDez.TBreakEven * 100)} do nível de 2025</strong>.</p>
        <p>O ritmo medido em 2026 está entre <strong>${pc(D.fatores.junJul * 100)}</strong>, o par de meses mais fraco do ano, e <strong>${pc(D.fatores.janJul * 100)}</strong>, o acumulado. Até o cenário de estresse deste relatório, que assume metade de 2025, fecha positivo.</p>
      </div>
      <p class="small">Mesmo no pior cenário modelado o resultado dos quatro meses é positivo, mas a folga cai de R$ ${brl0(D.cenariosSetDez[1].resultado)} para R$ ${brl0(D.cenariosSetDez[3].resultado)} — margem que não absorve nenhum evento inesperado. O que separa "confortável" de "no fio" não é a receita: é o custo fixo de R$ ${brl0(D.custo.fixoMensal)} por mês, do qual R$ ${brl0(D.folhaMensal)} é folha e cerca de R$ 20.000 é cartão.</p>
    </div>
  </div>

  <div class="box rule">
    <div class="t">O buraco de janeiro e fevereiro</div>
    <p>A receita vira caixa com cerca de 45 dias de defasagem. O que for vendido em <strong>novembro e dezembro só entra no caixa em janeiro e fevereiro</strong> — meses que, historicamente, valem <strong>1,2% do ano</strong> em VGV próprio. O segundo semestre precisa, portanto, financiar o primeiro bimestre de 2027: cerca de <strong>R$ ${brl0(D.custo.fixoMensal * 2)}</strong> a reservar até o fim de dezembro. Nos cenários base e conservador essa reserva cabe no próprio resultado do período; no de estresse, não.</p>
  </div>
  <div class="pfoot"><span>Bula Assessoria Pecuária — documento interno</span><span>Posição de caixa e cenários · 17/08/2026</span></div>
</section>

<!-- ACOES -->
<section class="page">
  <div class="head"><h2>Onde agir, em ordem de retorno</h2><div class="n">10</div></div>

  <table>
    <tr><th style="width:6mm"></th><th style="width:50mm">Ação</th><th>Por quê</th><th class="num" style="width:22mm">Efeito</th><th style="width:20mm">Prazo</th></tr>
    <tr><td class="strong">1</td><td class="strong">Confirmar o recebimento do EAO Baviera para ${dm(D.tituloCritico.data)}</td>
      <td>É a única entrada que sustenta o vale de ${dm(D.pontoMinimo.data)}. Sem ela o Sicoob fica negativo no dia.</td>
      <td class="num strong">R$ ${brl0(D.tituloCritico.valor)}</td><td>esta semana</td></tr>
    <tr><td class="strong">2</td><td class="strong">Lançar o resgate da aplicação do Sicredi</td>
      <td>A conta corrente está em R$ ${brl(D.caixa.sicrediCC)} porque o resgate que bancou o PIX de 04/08 nunca foi registrado. Não é dinheiro novo — é o colchão aparecer no lugar certo.</td>
      <td class="num strong">R$ ${brl0(15000)}</td><td>imediato</td></tr>
    <tr><td class="strong">3</td><td class="strong">Atacar os vencidos de mais de 60 dias</td>
      <td>São ${D.aging[2].n + D.aging[3].n} títulos fora de qualquer comportamento observado em 2026. Quanto mais tempo passa, menor a chance — já estão no ponto de virar renegociação ou perda.</td>
      <td class="num strong">R$ ${brl0(D.vencidoForaPadrao)}</td><td>até 31/08</td></tr>
    <tr><td class="strong">4</td><td class="strong">Fechar a receita dos leilões ainda sem valor</td>
      <td>EAO Baviera Machos, as três etapas Santa Cruz, Guadalupe Touros de 20/07, Neloraço, Essência Bambu, Terra Brava e Matinha Expogenética estão com fechamento no sistema e receita zerada — falta o faturamento total da leiloeira.</td>
      <td class="num strong">a apurar</td><td>até 31/08</td></tr>
    <tr><td class="strong">5</td><td class="strong">Migrar acordos de cobertura para percentual sobre faturamento</td>
      <td>Pelo ponto de indiferença do próprio contrato, 1% sobre faturamento equivale a 5,16% sobre cobertura — e a Bula cobra hoje 4,21% em média. É receita deixada na mesa, sem esforço comercial adicional.</td>
      <td class="num strong">estrutural</td><td>na renovação</td></tr>
    <tr><td class="strong">6</td><td class="strong">Reservar o 1º bimestre de 2027</td>
      <td>Janeiro e fevereiro valem 1,2% do ano em VGV. O custo fixo não para.</td>
      <td class="num strong">R$ ${brl0(D.custo.fixoMensal * 2)}</td><td>até 31/12</td></tr>
    <tr><td class="strong">7</td><td class="strong">Reduzir a dependência de ${esc(D.concentracao[0].nome)}</td>
      <td>${pc(D.concentracao[0].pct)} da receita de 2026 numa contraparte só; o índice de concentração equivale a ${D.leiloerasEfetivas.toFixed(1)} leiloeiras efetivas.</td>
      <td class="num strong">estrutural</td><td>2027</td></tr>
  </table>

  <div class="cols">
    <div>
      <h3>Concentração de contraparte</h3>
      <table style="margin-top:1mm">
        <tr><th>Contraparte</th><th class="num">Receita 2026</th><th class="num">Part.</th></tr>
        ${linhasConc}
      </table>
      <p class="small">HHI de <strong>${D.hhi.toFixed(4)}</strong> — equivalente a <strong>${D.leiloerasEfetivas.toFixed(1)} leiloeiras efetivas</strong>. Não é um problema de caixa hoje, mas é o maior risco estrutural do modelo.</p>
    </div>
    <div>
      <h3>Premissas e fontes</h3>
      <p class="small">Saldos e títulos: ERP, conciliado contra o extrato Sicoob de 17/08/2026 ao centavo. Cobertura e lotes: fechamentos alinhados lote a lote ao HastaPró (FIL '2') para agosto. Histórico de 2025: seed do Power BI de 20/07. Take-rate, comissão e imposto: totais de 2026 da planilha-mestra FINANCEIRO BULA 2026 (Drive, versão de 13/08).</p>
      <p class="small"><strong>Regras de tempo.</strong> Folha paga no 3º dia do mês seguinte (mediana histórica). Títulos sem data acordada: leilão + 45 dias. Receita vira caixa em D+45.</p>
      <p class="small"><strong>Sensibilidade.</strong> Cada ponto percentual a mais no nível de cobertura de set–dez vale cerca de R$ ${brl0(D.setDez.v25 * 0.01 * D.modelo.takeRate * D.modelo.margemContribuicao)} de resultado no período.</p>
    </div>
  </div>

  <div class="box">
    <div class="t">O que este relatório não sabe</div>
    <p class="small" style="margin:0">(a) O extrato do Sicredi de agosto não foi importado — o saldo daquela conta é uma inferência. (b) A cobertura do São Geraldo (R$ 375.000) e do Kirz (R$ 99.600) aparece na planilha mas não tem lote correspondente em nenhuma fonte; a receita foi lançada, a cobertura não. (c) O LS Galeria diverge: R$ 576.000 no HastaPró contra R$ 526.000 na planilha — a receita foi lançada pelo menor. (d) A agenda de set–dez está incompleta por natureza; a projeção não a utiliza. (e) O percentual do Mafra Touros está em 0,35% na planilha contra 0,3% na tabela de acordo.</p>
  </div>
  <div class="pfoot"><span>Bula Assessoria Pecuária — documento interno</span><span>Posição de caixa e cenários · 17/08/2026</span></div>
</section>

</body></html>`

fs.writeFileSync(path.join(OUT, 'relatorio.html'), html)
console.log('HTML gravado:', path.join(OUT, 'relatorio.html'))

const browser = await chromium.launch()
const pg = await browser.newPage()
await pg.setContent(html, { waitUntil: 'networkidle' })
try { await pg.evaluate(() => document.fonts.ready) } catch { }
const desktop = path.join(os.homedir(), 'Desktop')
const pdfPath = path.join(desktop, 'Bula - Posicao de Caixa e Cenarios - 17-08-2026.pdf')
await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '14mm', left: '11mm', right: '11mm' } })
await pg.screenshot({ path: path.join(OUT, 'preview.png'), fullPage: true })
await browser.close()
console.log('PDF:', pdfPath)
console.log('preview:', path.join(OUT, 'preview.png'))
