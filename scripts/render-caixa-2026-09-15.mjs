/**
 * Renderiza o panorama de caixa de 15/09/2026 (projecao ate 15/10) a partir de
 * outputs/caixa-2026-09-15/dados.json. Paleta monocromatica do brandbook.
 * Gera HTML + PDF A4 na Area de Trabalho. Nenhum numero escrito a mao aqui.
 *
 * Molde: render-caixa-setembro-2026-09-10.mjs, com as duas correcoes de
 * render-pdf-a4-margem-zero (margem 0 no pg.pdf e .page com height fixa).
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { chromium } from 'playwright'

const OUT = 'outputs/caixa-2026-09-15'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const r2 = n => Math.round(Number(n) * 100) / 100
const kk = n => { const a = Math.abs(n); return a >= 1000 ? (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + 'k' : brl0(n) }
const dm = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—'
const DIA_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const ds = iso => DIA_SEM[new Date(iso + 'T12:00:00Z').getUTCDay()]
const corta = (t, n) => { const x = String(t); if (x.length <= n) return x; const c = x.slice(0, n), sp = c.lastIndexOf(' '); return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–]+$/, '') + '…' }
const sinal = n => (n < 0 ? '−R$ ' + brl(Math.abs(n)) : 'R$ ' + brl(n))
const sinal0 = n => (n < 0 ? '−R$ ' + brl0(Math.abs(n)) : 'R$ ' + brl0(n))
const limpa = s => String(s).replace(/ - COMISSAO BULA| - FECHAMENTO BULA| - BULA REMATES|COMISSAO |Comissão /gi, '').replace(/\s+/g, ' ').trim()
const pct = n => (Number(n) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', SOFT = '#B4B4B4', RED = '#7A1F1F'
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

const cen = k => D.cenarios.find(c => c.chave === k)
const BASE = cen('BASE'), VERIF = cen('VERIF'), ATRAS = cen('ATRAS'), SEMLS = cen('SEM_LS'), IMP = cen('IMPOSTOS')
const b25 = D.blocos.find(b => b.dia === '2026-09-25') || { valor: 0, n: 0 }
const bFolha = D.blocos.find(b => b.dia === '2026-10-05') || { valor: 0, n: 0 }
const classeRot = c => c === 'firme' ? 'firme' : c === 'projetada' ? 'projeção' : c === 'verificacao' ? 'em verificação' : c
const classeTag = c => `<span class="tag ${c === 'firme' ? 'on' : c === 'verificacao' ? 'gold' : ''}">${classeRot(c)}</span>`
const firmezaTag = f => `<span class="tag ${f === 'acordada' ? 'on' : f === 'regra' ? 'gold' : ''}">${f === 'acordada' ? 'acordada' : f === 'regra' ? 'data de regra' : f === 'informada' ? 'informada pelo João' : 'planilha'}</span>`
const RODAPE = 'Bula Assessoria Pecuária · panorama de caixa em 15/09/2026 · projeção até 15/10'

/* ── grafico: curva diaria ───────────────────────────────────────────────── */
function grafCurva() {
  const W = 1000, H = 318, L = 62, R = 104, T = 22, B = 40
  const series = [
    { c: BASE, rot: 'Base', dash: '', w: 2.6 },
    { c: VERIF, rot: '+ em verificação', dash: '5,3', w: 1.9 },
    { c: SEMLS, rot: 'sem LS Galeria', dash: '1.5,3', w: 1.9 },
  ]
  const todos = series.flatMap(s => s.c.pontos.map(p => p.saldo)).concat([0])
  const max = Math.max(...todos) * 1.06, min = Math.min(...todos, 0) * 1.12
  const n = D.dias.length
  const x = i => L + (i / (n - 1)) * (W - L - R)
  const y = v => T + (1 - (v - min) / (max - min)) * (H - T - B)
  let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Inter, sans-serif">`
  const passo = (max - min) / 4
  for (let k = 0; k <= 4; k++) {
    const v = min + passo * k
    g += `<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    g += `<text x="${L - 7}" y="${(y(v) + 3.2).toFixed(1)}" text-anchor="end" font-size="11" fill="${MUTED}">${kk(v)}</text>`
  }
  if (min < 0) g += `<line x1="${L}" y1="${y(0).toFixed(1)}" x2="${W - R}" y2="${y(0).toFixed(1)}" stroke="${RED}" stroke-width="1.2"/>`
  g += `<line x1="${L}" y1="${y(D.reserva).toFixed(1)}" x2="${W - R}" y2="${y(D.reserva).toFixed(1)}" stroke="${GOLD}" stroke-width="1" stroke-dasharray="3,3"/>`
  g += `<text x="${W - R + 4}" y="${(y(D.reserva) + 3.2).toFixed(1)}" font-size="9.5" fill="#8A7331">reserva ${kk(D.reserva)}</text>`
  for (let i = 0; i < n; i++) {
    const dia = D.dias[i]
    if (Number(dia.slice(8, 10)) % 5 !== 0 && i !== 0) continue
    g += `<text x="${x(i).toFixed(1)}" y="${H - B + 16}" text-anchor="middle" font-size="10.5" fill="${MUTED}">${dm(dia)}</text>`
  }
  for (const [d, rot] of [['2026-09-25', 'dia 25 · comissões'], ['2026-09-30', 'fim do mês'], ['2026-10-05', 'folha']]) {
    const i = D.dias.indexOf(d)
    if (i < 0) continue
    g += `<line x1="${x(i).toFixed(1)}" y1="${T}" x2="${x(i).toFixed(1)}" y2="${H - B}" stroke="${SOFT}" stroke-width="1" stroke-dasharray="2,3"/>`
    g += `<text x="${x(i).toFixed(1)}" y="${T - 7}" text-anchor="middle" font-size="9.5" fill="${MUTED}">${rot}</text>`
  }
  for (const s of series) {
    const d = s.c.pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' ')
    g += `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${s.w}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round"/>`
    const last = s.c.pontos[s.c.pontos.length - 1]
    g += `<circle cx="${x(n - 1).toFixed(1)}" cy="${y(last.saldo).toFixed(1)}" r="2.6" fill="${INK}"/>`
    g += `<text x="${(x(n - 1) + 6).toFixed(1)}" y="${(y(last.saldo) + 3.4).toFixed(1)}" font-size="10.5" fill="${last.saldo < 0 ? RED : INK}" font-weight="600">${kk(last.saldo)}</text>`
  }
  g += `</svg>`
  const leg = series.map(s => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:11px">
    <svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="${INK}" stroke-width="${s.w}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/></svg>
    ${esc(s.rot)} <strong>${sinal0(s.c.fecha)}</strong> em 15/10</span>`).join('')
  return `<figure>${g}<div style="font-size:9px;margin-top:1.5mm">${leg}</div></figure>`
}

/* ── grafico: barras entradas x saidas (base) ────────────────────────────── */
function grafBarras() {
  const W = 1000, H = 150, L = 62, R = 20, T = 14, B = 34
  const pts = BASE.pontos
  const max = Math.max(...pts.map(p => Math.max(p.entrada, p.saida))) * 1.08
  const n = pts.length
  const bw = Math.max(6, (W - L - R) / n * 0.62)
  const x = i => L + (i + 0.5) / n * (W - L - R)
  const y = v => T + (1 - v / max) * (H - T - B)
  let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Inter, sans-serif">`
  for (let k = 0; k <= 3; k++) {
    const v = (max / 3) * k
    g += `<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}" stroke="${GRID}"/>`
    g += `<text x="${L - 7}" y="${(y(v) + 3.2).toFixed(1)}" text-anchor="end" font-size="10.5" fill="${MUTED}">${kk(v)}</text>`
  }
  pts.forEach((p, i) => {
    if (p.saida > 0) g += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${y(p.saida).toFixed(1)}" width="${(bw / 2 - 0.6).toFixed(1)}" height="${(H - B - y(p.saida)).toFixed(1)}" fill="${INK}"/>`
    if (p.entrada > 0) g += `<rect x="${(x(i) + 0.6).toFixed(1)}" y="${y(p.entrada).toFixed(1)}" width="${(bw / 2 - 0.6).toFixed(1)}" height="${(H - B - y(p.entrada)).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="1.3"/>`
    if (Number(p.dia.slice(8, 10)) % 5 === 0 || i === 0)
      g += `<text x="${x(i).toFixed(1)}" y="${H - B + 15}" text-anchor="middle" font-size="10" fill="${MUTED}">${dm(p.dia)}</text>`
  })
  g += `<line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="${INK}" stroke-width="1.2"/></svg>`
  return `<figure>${g}<div style="font-size:9px;margin-top:1.2mm">
    <span style="margin-right:11px"><svg width="10" height="9"><rect width="9" height="9" fill="${INK}"/></svg> saídas (firmes + projetadas)</span>
    <span><svg width="10" height="9"><rect width="8" height="8" x="0.5" y="0.5" fill="none" stroke="${INK}" stroke-width="1.3"/></svg> entradas com data</span></div></figure>`
}

const foot = n => `<div class="pfoot"><span>${RODAPE}</span><span>${n}</span></div>`
const custoVerif = r2(BASE.fecha - VERIF.fecha)
const custoLS = r2(BASE.fecha - SEMLS.fecha)
const entradasHoje = D.realizado.entradas
const topEntradas = [...entradasHoje].sort((a, b) => b.valor - a.valor).slice(0, 8)
const restoEntradas = r2(D.realizado.somaEntradas - topEntradas.reduce((s, e) => s + e.valor, 0))
const semPos = D.semPosicao
const semPosCrit = semPos.filter(t => t.criterio)

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; color: ${INK}; margin: 0; font-size: 10.2px; line-height: 1.52; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1,h2,h3 { font-family: Oswald, "Arial Narrow", Impact, sans-serif; text-transform: uppercase; letter-spacing: .022em; font-weight: 600; margin: 0; }
  .page { width: 210mm; height: 296mm; padding: 14mm 13mm 17mm; position: relative; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .pfoot { position: absolute; left: 13mm; right: 13mm; bottom: 7mm; font-size: 7.4px; color: #A6A6A6; display: flex; justify-content: space-between; border-top: 1px solid ${GRID}; padding-top: 2mm; }
  .capa { background: ${INK}; color: #fff; padding: 30mm 20mm 20mm; display: flex; flex-direction: column; }
  .capa img { width: 42mm; margin-bottom: 20mm; }
  .capa h1 { font-size: 40px; line-height: 1.04; color: #fff; font-weight: 700; }
  .capa .sub { font-size: 12.2px; color: #B5B5B5; margin-top: 7mm; max-width: 150mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
  .capa .rule { width: 26mm; height: 3px; background: ${GOLD}; margin: 8mm 0; }
  .capa .meta { margin-top: auto; flex-wrap: wrap; row-gap: 6mm; display: flex; gap: 11mm; border-top: 1px solid #2A2A2A; padding-top: 6mm; }
  .capa .meta div span { display: block; font-size: 8.5px; color: #8A8A8A; text-transform: uppercase; letter-spacing: .09em; margin-bottom: 2px; }
  .capa .meta div strong { font-size: 12px; font-weight: 600; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid ${INK}; padding-bottom: 3mm; margin-bottom: 5mm; }
  .head h2 { font-size: 21px; }
  .head .n { font-size: 9px; color: ${MUTED}; letter-spacing: .12em; text-transform: uppercase; font-family: Oswald, sans-serif; }
  h3 { font-size: 13px; margin: 5mm 0 2.2mm; }
  h3:first-of-type { margin-top: 0; }
  p { margin: 0 0 2.6mm; }
  .lead { font-size: 11.2px; line-height: 1.58; }
  strong { font-weight: 600; }
  .muted { color: ${MUTED}; }
  .small { font-size: 8.9px; color: ${MUTED}; line-height: 1.5; }
  .tiles { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin: 3.5mm 0 5mm; }
  .tiles.t5 { grid-template-columns: repeat(5,1fr); }
  .tile { border: 1px solid ${GRID}; border-top: 3px solid ${INK}; padding: 3.2mm 3.2mm 2.8mm; }
  .tile .k { font-size: 7.8px; text-transform: uppercase; letter-spacing: .085em; color: ${MUTED}; margin-bottom: 1.4mm; line-height: 1.3; min-height: 5.6mm; }
  .tile .v { font-family: Oswald, sans-serif; font-size: 17.5px; font-weight: 600; line-height: 1; white-space: nowrap; }
  .tile .v .cur { font-size: 10.5px; font-weight: 500; color: ${MUTED}; margin-right: 1px; }
  .tile .d { font-size: 8.2px; color: ${MUTED}; margin-top: 1.5mm; line-height: 1.4; }
  .tile.gold { border-top-color: ${GOLD}; }
  .tile.neg .v { color: ${RED}; }
  .box { border: 1px solid ${GRID}; padding: 3.6mm 4.2mm; margin: 3.5mm 0; }
  .box.dark { background: ${INK}; color: #fff; border-color: ${INK}; }
  .box.dark .t { color: ${GOLD}; }
  .box.dark p, .box.dark li { color: #D8D8D8; }
  .box.dark strong { color: #fff; }
  .box.rule { border: none; border-left: 3px solid ${INK}; padding: 1mm 0 1mm 4mm; }
  .box.gold { border: none; border-left: 3px solid ${GOLD}; padding: 1mm 0 1mm 4mm; }
  .box .t { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; margin-bottom: 2mm; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 9.1px; margin: 2.4mm 0; }
  table.xs { font-size: 8.4px; }
  table.xs td { padding: 1.05mm 1.5mm; }
  table.xxs { font-size: 7.9px; margin: 1.8mm 0; }
  table.xxs td { padding: .8mm 1.3mm; line-height: 1.35; }
  table.xxs th { padding: 1.3mm 1.3mm; font-size: 7.6px; }
  th { text-align: left; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.2px; letter-spacing: .07em; font-weight: 600; border-bottom: 1.4px solid ${INK}; padding: 1.8mm 1.6mm; }
  td { padding: 1.35mm 1.6mm; border-bottom: 1px solid #F0F0F0; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.destaque td { background: #F6F6F6; font-weight: 600; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  tr.neg td { color: ${RED}; }
  figure { margin: 2.5mm 0 3.5mm; }
  figcaption { font-size: 8.6px; color: ${MUTED}; margin-top: 1.4mm; line-height: 1.45; }
  ol, ul { margin: 0 0 2.6mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.4mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .cols2.w { grid-template-columns: 1.25fr 1fr; }
  .tag { display:inline-block; font-size:7.3px; letter-spacing:.05em; text-transform:uppercase; border:1px solid ${GRID}; padding:0 1.1mm; color:${MUTED}; white-space: nowrap; }
  .tag.on { border-color:${INK}; color:${INK}; }
  .tag.gold { border-color:${GOLD}; color:#8A7331; }
  .res { border-top: 1px solid ${GRID}; padding: 2mm 0 1.6mm; }
  .res .t { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 9.6px; letter-spacing: .05em; font-weight: 600; margin-bottom: .8mm; }
  .res p { margin: 0; font-size: 9.2px; line-height: 1.5; color: #333; }
</style></head><body>

<!-- CAPA -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Panorama de caixa<br>15 de setembro</h1>
  <div class="rule"></div>
  <div class="sub">O caixa fechou o dia 15 em <strong style="color:#fff">R$ ${brl(D.caixa.total)}</strong>, todo da Bula: o repasse ao Bulinha, o Marcelo e a metade do Rusa já saíram.
  Amanhã entra a Colonial (<strong style="color:#fff">R$ ${brl0(D.colonial.cr.valor)}</strong>, NF 643). O dia 25 pede <strong style="color:#fff">R$ ${brl0(b25.valor)}</strong> de comissões,
  dos quais R$ ${brl0(D.d25.verificacao)} ainda em verificação, e a folha de 05/10 leva R$ ${brl0(bFolha.valor)}.
  Só com o que tem data para entrar, o mês <strong style="color:#fff">fecha em ${sinal0(BASE.fechaMes)}</strong> e o caixa chega a 15/10 com
  <strong style="color:#fff">${sinal0(BASE.fecha)}</strong>. Se as saídas em verificação forem pagas como estão, 15/10 vira ${sinal0(VERIF.fecha)};
  se os <strong style="color:#fff">R$ ${brl0(D.curtoPrazo.total)}</strong> informados hoje (Matinha, Terra Brava, e-Rural) forem validados e entrarem, vai a ${sinal0(cen('CURTO').fecha)}.</div>
  <div class="meta">
    <div><span>Caixa em 15/09</span><strong>R$ ${brl(D.caixa.total)}</strong></div>
    <div><span>Entra com data até 15/10</span><strong>R$ ${brl0(D.somaEntradas)}</strong></div>
    <div><span>Sai até 15/10 (firme + projeção)</span><strong>R$ ${brl0(D.somaFirmes + D.somaProjetadas)}</strong></div>
    <div><span>Fecha 30/09 (base)</span><strong>${sinal0(BASE.fechaMes)}</strong></div>
    <div><span>Chega a 15/10 (base)</span><strong>${sinal0(BASE.fecha)}</strong></div>
    <div><span>Cabe pagar hoje</span><strong>${sinal0(BASE.cabe)}</strong></div>
  </div>
</section>

<!-- 1. POSICAO -->
<section class="page">
  <div class="head"><h2>A posição de hoje</h2><div class="n">01 · ${dm(D.hoje)} · 18h57</div></div>
  <div class="tiles">
    <div class="tile"><div class="k">Caixa total</div><div class="v"><span class="cur">R$</span>${brl0(D.caixa.total)}</div><div class="d">três contas; Sicoob bate ao centavo com o extrato de hoje</div></div>
    <div class="tile gold"><div class="k">Entra com data até 30/09</div><div class="v"><span class="cur">R$</span>${brl0(D.entradasAteFimMes)}</div><div class="d">${D.entradas.filter(e => e.data <= D.fimMes).length} títulos, Colonial amanhã incluída</div></div>
    <div class="tile"><div class="k">Sai até 30/09 (firme + projeção)</div><div class="v"><span class="cur">R$</span>${brl0(D.saidasAteFimMes.firme)}</div><div class="d">mais R$ ${brl0(D.saidasAteFimMes.verificacao)} em verificação, todos no dia 25</div></div>
    <div class="tile ${BASE.fechaMes < 0 ? 'neg' : ''}"><div class="k">Fecha 30/09 em</div><div class="v">${sinal0(BASE.fechaMes)}</div><div class="d">base; ${sinal0(VERIF.fechaMes)} pagando o que está em verificação</div></div>
  </div>

  <table>
    <tr><th>Conta</th><th class="num">Saldo</th><th>De onde vem o número</th></tr>
    ${D.caixa.contas.map(c => `<tr><td>${esc(c.nome)}</td><td class="num">${brl(c.saldo)}</td><td class="muted">${esc(c.extrato)}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td class="num">${brl(D.caixa.total)}</td><td></td></tr>
  </table>

  <h3>O que caiu hoje, 15/09</h3>
  <table>
    <tr><th>Lançamento</th><th>Categoria</th><th class="num">Valor</th></tr>
    ${D.realizado.hoje.map(m => `<tr><td>${esc(corta(m.desc, 70))}</td><td class="muted">${esc(m.cat || '—')}</td><td class="num">${m.tipo === 'saida' ? '−' : ''}${brl(m.valor)}</td></tr>`).join('')}
    <tr class="total"><td>Saiu hoje</td><td></td><td class="num">−${brl(r2(D.realizado.hoje.filter(m => m.tipo === 'saida').reduce((s, m) => s + m.valor, 0)))}</td></tr>
  </table>
  <p class="small">Os quatro entraram no ERP hoje pelo extrato: o ISSQN de agosto (guia 1786806) e os dois seguros já tinham título e foram baixados; a estadia do Leonardo em Betim (Hotel Abba Uno, 16–18/09, Booking 5249.952.565) fecha ao centavo com a reserva paga no cartão do João e virou título a posteriori.</p>

  <h3>Como o caixa chegou aqui — 01 a 15/09</h3>
  <div class="cols2 w">
    <div>
      <table class="xs">
        <tr><th>Entrou</th><th class="num">Valor</th></tr>
        ${topEntradas.map(e => `<tr><td>${dm(e.data)} · ${esc(corta(e.quem, 44))}</td><td class="num">${brl(e.valor)}</td></tr>`).join('')}
        ${restoEntradas > 0.005 ? `<tr><td class="muted">+ ${entradasHoje.length - topEntradas.length} entradas menores</td><td class="num muted">${brl(restoEntradas)}</td></tr>` : ''}
        <tr class="total"><td>Entradas operacionais</td><td class="num">${brl(D.realizado.somaEntradas)}</td></tr>
      </table>
    </div>
    <div>
      <table class="xs">
        <tr><th>Saiu</th><th class="num">Valor</th></tr>
        ${D.realizado.saidasPorGrupo.filter(g => g.valor >= 100).map(g => `<tr><td>${esc(g.grupo)}</td><td class="num">${brl(g.valor)}</td></tr>`).join('')}
        <tr><td class="muted">miúdos (sem categoria, apps, outras)</td><td class="num muted">${brl(r2(D.realizado.saidasPorGrupo.filter(g => g.valor < 100).reduce((s, g) => s + g.valor, 0)))}</td></tr>
        <tr class="total"><td>Saídas operacionais</td><td class="num">${brl(D.realizado.somaSaidas)}</td></tr>
      </table>
    </div>
  </div>
  <p class="small">Abertura em 01/09 reconstruída pelos próprios lançamentos: <strong>R$ ${brl(D.realizado.aberturaReconstruida)}</strong> (Sicoob ${brl(D.realizado.sicoobAberturaReconstruida)}, igual ao “saldo anterior” impresso no extrato, ${brl(D.realizado.sicoobAbertura)}) + ${brl(D.realizado.somaEntradas)} − ${brl(D.realizado.somaSaidas)} = ${brl(D.caixa.total)}. Transferências entre contas fora da conta. O JMP (165.667,50 em 08/09) entrou e saiu inteiro para o Felipe; o que sobrou de setembro até aqui foi EAO + Mafra + Naviraí + São Geraldo + e-Rural + Kito.</p>
  ${foot(1)}
</section>

<!-- 2. AMANHA: COLONIAL -->
<section class="page">
  <div class="head"><h2>O pagamento de amanhã</h2><div class="n">02 · Colonial · 16/09</div></div>
  <div class="tiles">
    <div class="tile gold"><div class="k">Colonial — NF 643</div><div class="v"><span class="cur">R$</span>${brl(D.colonial.nf.valor)}</div><div class="d">emitida hoje 14h43, competência 09/2026, ISS 5% não retido</div></div>
    <div class="tile"><div class="k">Conta lote a lote</div><div class="v"><span class="cur">R$</span>${brl0(D.colonial.conta.reduce((s, c) => s + c.base, 0))}</div><div class="d">3% sobre 12 lotes em dois pregões da Colonial</div></div>
    <div class="tile"><div class="k">A planilha dizia</div><div class="v"><span class="cur">R$</span>${brl(D.colonial.planilha.total)}</div><div class="d">R$ ${brl(D.colonial.planilha.diferenca)} a mais: lotes de outros vendedores</div></div>
    <div class="tile"><div class="k">Caixa após 16/09 (base)</div><div class="v"><span class="cur">R$</span>${brl0(D.semana[0].saldoBase)}</div><div class="d">se o PIX cair amanhã e nada mais sair</div></div>
  </div>

  <div class="cols2">
    <div>
      <h3>O que a Colonial está pagando</h3>
      <table>
        <tr><th>Pregão</th><th>Lotes</th><th class="num">Base</th><th class="num">3%</th></tr>
        ${D.colonial.conta.map(c => `<tr><td>${esc(c.leilao)}</td><td class="muted">${esc(c.lotes)}</td><td class="num">${brl0(c.base)}</td><td class="num">${brl(c.valor)}</td></tr>`).join('')}
        <tr class="total"><td>NF 643</td><td></td><td class="num">${brl0(D.colonial.conta.reduce((s, c) => s + c.base, 0))}</td><td class="num">${brl(D.colonial.nf.valor)}</td></tr>
      </table>
      <p class="small">Fechado lote a lote em 11/09 com a listagem da Programa (coluna Vendedor) e confirmado hoje pelo Aurelio às 13h07: <em>“incluindo os lotes que faltam, a comissão ficou no valor de R$ 11.340,00”</em>. O lote 19 do Pepitas vale 22.500 (750 × 30), não os 27.000 que a ficha do grupo trazia.</p>
    </div>
    <div>
      <h3>O que ficou fora da NF</h3>
      <table>
        <tr><th>Vendedor no mesmo pregão</th><th>Lote</th><th class="num">Base</th><th class="num">3%</th></tr>
        ${D.colonial.foraDaNF.map(c => `<tr><td>${esc(c.vendedor)}</td><td class="muted">${esc(c.lote)}</td><td class="num">${brl0(c.base)}</td><td class="num">${brl(c.valor)}</td></tr>`).join('')}
        <tr><td class="muted">Lote 19 a 27.000 em vez de 22.500</td><td></td><td class="num muted">4.500</td><td class="num muted">${brl(D.colonial.lote19.efeito)}</td></tr>
        <tr class="total"><td>Diferença para a planilha</td><td></td><td></td><td class="num">${brl(D.colonial.planilha.diferenca)}</td></tr>
      </table>
      <p class="small">“Pagamos só lotes nossos, convidado combina por fora” (áudio da Colonial, 10/09). Terra Boa, Nelore ZAN e Agropontieri não têm acordo na aba <em>Acordos com Marcas</em>: são cobrança à parte, e por isso ficam como pendência, não como título.</p>
    </div>
  </div>

  <div class="box dark">
    <div class="t">Duas ressalvas antes de contar com o dinheiro</div>
    <p><strong>A data é informada, não assinada.</strong> “Deve ocorrer amanhã (16/09)” é o relato do João após a conversa com o Aurelio; não há mensagem da Colonial com data. Se não cair, o título segue aberto e a curva perde R$ ${brl0(D.colonial.cr.valor)} no dia.</p>
    <p style="margin:0"><strong>A NF descreve só o Pepitas.</strong> O texto fala em “Leilão Pepitas Colonial Expogenética 22/08”, mas o valor cobre também os três lotes do Noite Nacional de 21/08. Lida ao pé da letra, valeria R$ 7.830,00 — faltariam R$ 3.510,00. O título do ERP nomeia os dois pregões.</p>
  </div>

  <h3>Os próximos sete dias, dia a dia</h3>
  <table class="xs">
    <tr><th>Dia</th><th>Entra</th><th class="num">Valor</th><th>Sai</th><th class="num">Valor</th><th class="num">Saldo (base)</th></tr>
    ${D.semana.map(s => `<tr${s.dia === D.amanha ? ' class="destaque"' : ''}><td><strong>${dm(s.dia)}</strong> <span class="muted">${ds(s.dia)}</span></td>
      <td>${s.entradas.length ? s.entradas.map(e => esc(corta(e.rot, 44)) + ' ' + firmezaTag(e.firmeza)).join('<br>') : '<span class="muted">—</span>'}</td>
      <td class="num">${s.entradas.length ? s.entradas.map(e => brl(e.valor)).join('<br>') : ''}</td>
      <td>${s.saidas.length ? s.saidas.map(t => esc(corta(limpa(t.desc), 40)) + ' ' + classeTag(t.classe)).join('<br>') : '<span class="muted">—</span>'}</td>
      <td class="num">${s.saidas.length ? s.saidas.map(t => brl(t.valor)).join('<br>') : ''}</td>
      <td class="num"><strong>${brl(s.saldoBase)}</strong></td></tr>`).join('')}
  </table>
  <p class="small">O saldo da coluna final soma só firmes e projeções; o que está “em verificação” não entra até ser decidido. Até 22/09 a semana é leve: o peso do mês está no dia 25.</p>
  ${foot(2)}
</section>

<!-- 3. CURVA -->
<section class="page">
  <div class="head"><h2>A curva até 15 de outubro</h2><div class="n">03 · projeção · 30 dias</div></div>
  <p class="lead">Cada linha parte do caixa de hoje e desce conforme os títulos vencem. Só entram recebíveis <strong>com data</strong>; a base de saídas leva obrigação confirmada mais projeção certa de sair (folha, cartões, contabilidade). O que está em verificação é cenário, não base.</p>
  ${grafCurva()}
  <figcaption>A reserva de R$ ${brl0(D.reserva)} é o colchão: o que passa dela é o que sobra para decidir. O vale do dia 25 é o lote de comissões; a folha de 05/10 é o segundo degrau.</figcaption>

  <table class="xs">
    <tr><th>Cenário</th><th class="num">Fecha 30/09</th><th class="num">Chega a 15/10</th><th class="num">Menor saldo</th><th>Quando</th><th class="num">Cabe pagar</th></tr>
    ${D.cenarios.map(c => `<tr${c.min < 0 ? ' class="neg"' : ''}><td><strong>${esc(c.rot)}</strong> — <span class="muted">${esc(c.desc)}</span></td>
      <td class="num">${sinal0(c.fechaMes)}</td><td class="num">${sinal0(c.fecha)}</td><td class="num">${sinal0(c.min)}</td><td>${dm(c.minDia)}</td><td class="num">${sinal0(c.cabe)}</td></tr>`).join('')}
  </table>
  <p class="small">“Cabe pagar” = menor saldo da curva menos a reserva. Pagar X hoje desloca <em>todo</em> o saldo seguinte em −X: o que limita é o ponto mais baixo do período, não o saldo de hoje. Nenhum recebível de outubro está na curva além do Santa Nazaré 2/2 (01/10): os leilões de setembro ainda não têm título.</p>

  <h3>Entradas e saídas, dia a dia (base)</h3>
  ${grafBarras()}

  <div class="box gold">
    <div class="t">O que decide o período</div>
    <p>Na base o mês fecha em <strong>${sinal(BASE.fechaMes)}</strong> e o caixa chega a 15/10 com <strong>${sinal(BASE.fecha)}</strong>, depois da folha de 05/10 (R$ ${brl0(bFolha.valor)}). Três coisas mudam esse número:
    as <strong>R$ ${brl(D.somaVerificacao)}</strong> em ${D.verificacao.length} comissões em verificação (pagas como estão, levam 15/10 a ${sinal(VERIF.fecha)}, custo de R$ ${brl(custoVerif)});
    o <strong>LS Galeria II</strong> (sem os 57.840 em 21/09, 15/10 vai a ${sinal(SEMLS.fecha)});
    e os <strong>impostos de setembro</strong>, que ainda não existem no ERP (ISS estimado de R$ ${brl(D.impostosEstimados.iss.valor)} em 15/10 e DAS de R$ ${brl(D.impostosEstimados.das.valor)} em 20/10, só com as NFs já vistas).</p>
    <p style="margin:0">Do lado das entradas, os <strong>R$ ${brl(D.curtoPrazo.total)}</strong> informados hoje (Matinha, Terra Brava, e-Rural — pág. 05) só entram no cenário “+ curto prazo”; os <strong>R$ ${brl(D.somaSemPosicao)}</strong> sem data e os <strong>R$ ${brl0(D.pipeline.somaReceitaInformada)}</strong> que a planilha estima para os leilões em fechamento não estão em curva nenhuma — folga possível, não folga contada.</p>
  </div>
  ${foot(3)}
</section>

<!-- 4. ENTRADAS -->
<section class="page">
  <div class="head"><h2>O que entra — e com que data</h2><div class="n">04 · recebíveis do ERP · R$ ${brl0(D.somaEntradas + D.somaVencidosReceber + D.somaSemPosicao)} em aberto</div></div>
  <p class="small" style="color:${INK}">Cada linha carrega a fonte da data. <span class="tag on">acordada</span> = acordo expresso (tag no título); <span class="tag">planilha</span> = data da aba Leilões do financeiro; <span class="tag gold">data de regra</span> = leilão + 45 dias, mantida na curva por exceção declarada.</p>

  <h3>Entra na curva · R$ ${brl(D.somaEntradas)}</h3>
  <table class="xs">
    <tr><th>Data</th><th>Recebível</th><th class="num">Valor</th><th>Fonte da data</th></tr>
    ${D.entradas.map(e => `<tr${e.data === D.amanha ? ' class="destaque"' : ''}><td><strong>${dm(e.data)}</strong> <span class="muted">${ds(e.data)}</span></td><td>${esc(corta(e.rot, 50))} ${firmezaTag(e.firmeza)}</td>
      <td class="num">${brl(e.valor)}</td><td class="muted">${esc(corta(e.fonte, 120))}</td></tr>`).join('')}
    <tr class="total"><td></td><td>Total com data</td><td class="num">${brl(D.somaEntradas)}</td><td></td></tr>
  </table>

  <h3>Tem data, mas a data já passou · R$ ${brl(D.somaVencidosReceber)}</h3>
  <table class="xs">
    <tr><th>Data</th><th>Recebível</th><th class="num">Valor</th><th>Fonte</th></tr>
    ${D.vencidosReceber.map(e => `<tr><td><strong>${dm(e.data)}</strong></td><td>${esc(corta(e.rot, 52))}</td><td class="num">${brl(e.valor)}</td><td class="muted">${esc(e.fonte)}</td></tr>`).join('')}
  </table>

  <h3>Sem data — em fechamento ou em cobrança · R$ ${brl(D.somaSemPosicao)} em ${semPos.length} títulos</h3>
  <table class="xxs">
    <tr><th>Recebível</th><th>Cliente</th><th class="num">Valor</th><th>Venc. de regra</th><th>Situação</th></tr>
    ${semPos.map(t => `<tr><td>${esc(corta(limpa(t.desc), 54))}</td><td class="muted">${esc(corta(t.cliente || '—', 20))}</td><td class="num">${brl(t.valor)}</td><td class="muted">${dm(t.venc)}${t.venc && t.venc < D.hoje ? ' <span class="tag">passou</span>' : ''}</td><td class="muted">${t.criterio ? 'critério a confirmar' : t.origem === 'estimativa' ? 'estimativa' : t.nf ? 'NF ' + esc(t.nf) : 'sem NF'}</td></tr>`).join('')}
    <tr class="total"><td>Total sem posição</td><td></td><td class="num">${brl(D.somaSemPosicao)}</td><td></td><td></td></tr>
  </table>
  <p class="small">Fora da curva de propósito: vencimento é regra automática, não compromisso da leiloeira. ${semPosCrit.length} deles (R$ ${brl(r2(semPosCrit.reduce((s, t) => s + t.valor, 0)))}) têm “critério a confirmar”: nem o valor é certo. Lagoa dos Patos, 18ª Mega Nelore e São Francisco venceram entre maio e julho sem cobrança formal.</p>
  ${foot(4)}
</section>

<!-- 5. CURTO PRAZO INFORMADO HOJE -->
<section class="page">
  <div class="head"><h2>Curto prazo informado hoje — a validar</h2><div class="n">05 · R$ ${brl(D.curtoPrazo.total)} · fora da base</div></div>
  <p class="lead">Às 19h você mandou três blocos “pra entrar muito em breve”, com a ressalva de que <strong>falta validar antes de proceder e emitir nota</strong>. Ficam fora da curva base e entram só no cenário <em>“+ curto prazo (se validar)”</em>, com datas-hipótese declaradas. Para cada um: o que a fonte diz, o que o ERP tem, o que a planilha tem e o que falta.</p>
  ${D.curtoPrazo.itens.map(i => `
  <div class="box" style="margin:3mm 0">
    <div class="t" style="display:flex;justify-content:space-between"><span>${esc(i.grupo)}</span><span>R$ ${brl(i.valor)}</span></div>
    <p class="small" style="color:#333">${esc(i.fonte)}</p>
    <table class="xs" style="margin:1.5mm 0">
      <tr><th>No ERP</th><th class="num">Valor</th><th>Na planilha</th><th class="num">Valor</th></tr>
      <tr><td>${esc(i.erpNota)}</td><td class="num">${i.erp ? brl(i.erp) : '—'}</td><td class="muted">${esc(i.planilhaNota)}</td><td class="num">${brl(i.planilha)}</td></tr>
    </table>
    <p class="small" style="margin:0"><strong>O que falta:</strong> ${esc(i.falta)}</p>
  </div>`).join('')}

  <h3>Datas-hipótese usadas no cenário “+ curto prazo”</h3>
  <table class="xs">
    <tr><th>Data</th><th>Entrada</th><th class="num">Valor</th><th>Por que essa data</th></tr>
    ${D.curtoPrazo.hipoteses.map(h => `<tr><td><strong>${dm(h.data)}</strong> <span class="muted">${ds(h.data)}</span></td><td>${esc(corta(h.grupo, 44))}</td><td class="num">${brl(h.valor)}</td><td class="muted">${esc(h.rot)}</td></tr>`).join('')}
    <tr class="total"><td></td><td>Total se tudo validar</td><td class="num">${brl(D.curtoPrazo.total)}</td><td class="muted">30/09 iria a ${sinal0(cen('CURTO').fechaMes)}; 15/10 a ${sinal0(cen('CURTO').fecha)}</td></tr>
  </table>
  <p class="small">Nada disso tem NF emitida ainda (a da Tangará estava sendo emitida hoje). O que o ERP já carrega dos três blocos são R$ ${brl(D.curtoPrazo.totalERP)} em títulos sem data — e o da Terra Brava está R$ ${brl(r2(D.curtoPrazo.itens[1].erp - D.curtoPrazo.itens[1].valor))} acima do combinado.</p>
  ${foot(5)}
</section>

<!-- 6. PIPELINE DA PLANILHA + IMPOSTOS -->
<section class="page">
  <div class="head"><h2>O que a planilha já enxerga e o ERP ainda não</h2><div class="n">06 · leilões em fechamento · fora de toda curva</div></div>
  <p class="small" style="color:${INK}">A aba <em>Leilões</em> da planilha FINANCEIRO BULA 2026 (arquivo baixado hoje às 13h56) marca ${D.pipeline.itens.length} pregões de 15/08 a 13/09 como <strong>EM FECHAMENTO</strong>. Os valores são <strong>copiados da coluna RECEITA da planilha</strong> — não são projeção nossa nem título do ERP. Sem data e sem NF, não entram em cenário nenhum.</p>
  <table class="xxs">
    <tr><th>Data</th><th>Leilão</th><th>Leiloeira</th><th class="num">Vendas Bula</th><th class="num">Receita (planilha)</th><th>No ERP</th></tr>
    ${D.pipeline.itens.map(p => `<tr><td>${dm(p.data)}</td><td>${esc(corta(p.leilao, 40))}</td><td class="muted">${esc(p.leiloeira)}</td><td class="num">${brl0(p.vendas)}</td><td class="num">${p.receita ? brl(p.receita) : '<span class="muted">sem valor</span>'}</td><td class="muted">${esc(corta(p.erp, 44))}</td></tr>`).join('')}
    <tr class="total"><td></td><td>Soma do que a planilha valorou</td><td></td><td class="num">${brl0(D.pipeline.somaVendas)}</td><td class="num">${brl(D.pipeline.somaReceitaInformada)}</td><td class="muted">${D.pipeline.nSemValor} pregões sem valor</td></tr>
  </table>
  <p class="small">Leitura com cuidado: a planilha soma lotes de outros vendedores no mesmo pregão (Colonial: 15.615 virou 11.340) e em alguns aplica percentual sobre o faturamento total (Flor do Arataú, ASJ). É a visão do financeiro sobre o que falta faturar, não o valor a receber.</p>

  <h3>Impostos de setembro — ainda não existem no ERP</h3>
  <div class="cols2">
    <div>
      <table class="xs">
        <tr><th>NF de setembro vista</th><th>Emissão</th><th class="num">Valor</th></tr>
        ${D.impostosEstimados.nfs.map(n => `<tr><td>NF ${esc(n.nf)}</td><td class="muted">${dm(n.emissao)}</td><td class="num">${brl(n.valor)}</td></tr>`).join('')}
        <tr class="total"><td>Base conhecida</td><td></td><td class="num">${brl(D.impostosEstimados.base)}</td></tr>
      </table>
    </div>
    <div>
      <table class="xs">
        <tr><th>Guia</th><th>Venc.</th><th class="num">Estimativa</th></tr>
        <tr><td>ISSQN 09/2026 <span class="muted">(${esc(D.impostosEstimados.iss.regra)})</span></td><td>${dm(D.impostosEstimados.iss.venc)}</td><td class="num">${brl(D.impostosEstimados.iss.valor)}</td></tr>
        <tr><td>DAS 09/2026 <span class="muted">(${esc(D.impostosEstimados.das.regra)})</span></td><td>${dm(D.impostosEstimados.das.venc)}</td><td class="num">${brl(D.impostosEstimados.das.valor)}</td></tr>
        <tr class="total"><td>Total estimado</td><td></td><td class="num">${brl(r2(D.impostosEstimados.iss.valor + D.impostosEstimados.das.valor))}</td></tr>
      </table>
    </div>
  </div>
  <p class="small">${esc(D.impostosEstimados.nota)} Cada NF nova de setembro (os leilões da tabela acima, quando faturados) soma 16,39% de imposto para outubro.</p>
  ${foot(6)}
</section>

<!-- 7. SAIDAS -->
<section class="page">
  <div class="head"><h2>O que sai</h2><div class="n">07 · obrigações até 15/10 · R$ ${brl0(D.somaSaidas)} em ${D.naJanela.length} títulos</div></div>
  <div class="tiles">
    <div class="tile"><div class="k">Firme</div><div class="v"><span class="cur">R$</span>${brl0(D.somaFirmes)}</div><div class="d">${D.firmes.length} títulos com obrigação e valor confirmados</div></div>
    <div class="tile"><div class="k">Projeção</div><div class="v"><span class="cur">R$</span>${brl0(D.somaProjetadas)}</div><div class="d">${D.projetadas.length} títulos: folha de 05/10, cartões de 22/09, contabilidade</div></div>
    <div class="tile gold"><div class="k">Em verificação</div><div class="v"><span class="cur">R$</span>${brl0(D.somaVerificacao)}</div><div class="d">${D.verificacao.length} comissões com valor ou beneficiário discutido — fora da base</div></div>
    <div class="tile"><div class="k">Depois de 15/10</div><div class="v"><span class="cur">R$</span>${brl0(D.somaDepois)}</div><div class="d">${D.depoisJanela.length} títulos, quase tudo folha projetada de out–dez</div></div>
  </div>

  <table>
    <tr><th>Data</th><th class="num">Total</th><th class="num">Firme</th><th class="num">Projeção</th><th class="num">Em verif.</th><th>Nº</th><th>Maiores do dia</th></tr>
    ${D.blocos.map(b => `<tr${b.dia === '2026-09-25' ? ' class="destaque"' : ''}><td><strong>${dm(b.dia)}</strong> <span class="muted">${ds(b.dia)}</span></td>
      <td class="num">${brl(b.valor)}</td><td class="num">${b.firme ? brl(b.firme) : '<span class="muted">—</span>'}</td><td class="num">${b.projetada ? brl(b.projetada) : '<span class="muted">—</span>'}</td><td class="num">${b.verificacao ? brl(b.verificacao) : '<span class="muted">—</span>'}</td><td>${b.n}</td>
      <td class="muted">${esc(corta(b.maiores.map(m => limpa(m.desc)).join(' · '), 60))}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td class="num">${brl(D.somaSaidas)}</td><td class="num">${brl(D.somaFirmes)}</td><td class="num">${brl(D.somaProjetadas)}</td><td class="num">${brl(D.somaVerificacao)}</td><td>${D.naJanela.length}</td><td></td></tr>
  </table>

  <div class="cols2">
    <div>
      <h3>O dia 25, por quem recebe</h3>
      <table class="xs">
        <tr><th>Beneficiário</th><th class="num">Total</th><th class="num">Em verif.</th></tr>
        ${D.d25.benef.slice(0, 11).map(b => `<tr><td>${esc(corta(b.nome, 40))} <span class="muted">(${b.n})</span></td><td class="num">${brl(b.valor)}</td><td class="num muted">${b.verificacao ? brl(b.verificacao) : '—'}</td></tr>`).join('')}
        ${D.d25.benef.length > 11 ? `<tr><td class="muted">+ ${D.d25.benef.length - 11} outros</td><td class="num muted">${brl(r2(D.d25.benef.slice(11).reduce((s, b) => s + b.valor, 0)))}</td><td></td></tr>` : ''}
        <tr class="total"><td>Total do dia 25</td><td class="num">${brl(D.d25.total)}</td><td class="num">${brl(D.d25.verificacao)}</td></tr>
      </table>
      <p class="small">Rusa recebeu metade de agosto em 11/09 (32.817,50); a outra metade segue em 25/09. <strong>R$ ${brl(D.d25.aDefinir)}</strong> em ${D.d25.nADefinir} títulos estão “a definir”: sem beneficiário decidido não podem ser pagos, e por isso não estão na base.</p>
    </div>
    <div>
      <h3>Impostos e folha na janela</h3>
      <table class="xs">
        <tr><th>Título</th><th>Venc.</th><th class="num">Valor</th></tr>
        ${D.impostos.map(t => `<tr><td>${esc(corta(t.desc, 40))}</td><td>${dm(t.venc)}</td><td class="num">${brl(t.valor)}</td></tr>`).join('')}
        <tr class="total"><td>Impostos lançados</td><td></td><td class="num">${brl(r2(D.impostos.reduce((s, t) => s + t.valor, 0)))}</td></tr>
      </table>
      <table class="xs">
        <tr><th>Folha de setembro (projeção, 05/10)</th><th class="num">Valor</th></tr>
        ${D.folhaOut.sort((a, b) => b.valor - a.valor).slice(0, 5).map(t => `<tr><td>${esc(corta(t.desc.replace(/Folha Setembro\/2026 - /i, ''), 40))}</td><td class="num">${brl(t.valor)}</td></tr>`).join('')}
        ${D.folhaOut.length > 5 ? `<tr><td class="muted">+ ${D.folhaOut.length - 5} pessoas</td><td class="num muted">${brl(r2(D.folhaOut.slice(5).reduce((s, t) => s + t.valor, 0)))}</td></tr>` : ''}
        <tr class="total"><td>Folha</td><td class="num">${brl(r2(D.folhaOut.reduce((s, t) => s + t.valor, 0)))}</td></tr>
      </table>
      <p class="small">A folha é o cadastro (origem estimativa); em 01/09 a real foi 47.951,61 — Douglas recebeu 10.000 contra 12.500 cadastrados, e o cadastro já traz 10.000 para setembro.</p>
    </div>
  </div>
  ${foot(7)}
</section>

<!-- 8. FORA DA CURVA -->
<section class="page">
  <div class="head"><h2>Fora da curva</h2><div class="n">08 · atrasados e sem data</div></div>
  <p class="lead">Existem, têm saldo e não estão em nenhuma curva — ou porque venceram e não foram pagos, ou porque nunca ganharam vencimento. Quase tudo é comissão com apuração aberta.</p>

  <h3>Atrasados · R$ ${brl(D.somaAtrasados)} em ${D.atrasados.length} títulos</h3>
  <table class="xxs">
    <tr><th>Venc.</th><th>Título</th><th>Beneficiário</th><th class="num">Saldo</th><th>Situação</th></tr>
    ${[...D.atrasados].sort((a, b) => a.venc.localeCompare(b.venc)).map(t => `<tr><td>${dm(t.venc)}</td><td>${esc(corta(limpa(t.desc), 56))}</td><td class="muted">${esc(corta(t.fornecedor || '—', 20))}</td><td class="num">${brl(t.valor)}</td><td>${classeTag(t.classe)}</td></tr>`).join('')}
    <tr class="total"><td></td><td>Total</td><td></td><td class="num">${brl(D.somaAtrasados)}</td><td></td></tr>
  </table>
  <p class="small">As quatro passagens da ADN (14/09, R$ ${brl(r2(D.atrasados.filter(t => /ADN/i.test(t.desc)).reduce((s, t) => s + t.valor, 0)))}) são obrigação firme vencida ontem — é o único bloco atrasado que não é comissão em apuração. As comissões de março a agosto seguem “em verificação” desde os fechamentos de origem.</p>

  <h3>Sem vencimento · R$ ${brl(D.somaSemData)} em ${D.semData.length} títulos</h3>
  <table class="xxs">
    <tr><th>Título</th><th>Beneficiário</th><th class="num">Saldo</th><th>Situação</th></tr>
    ${[...D.semData].sort((a, b) => b.valor - a.valor).map(t => `<tr><td>${esc(corta(limpa(t.desc), 62))}</td><td class="muted">${esc(corta(t.fornecedor || '—', 20))}</td><td class="num">${brl(t.valor)}</td><td>${classeTag(t.classe)}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td></td><td class="num">${brl(D.somaSemData)}</td><td></td></tr>
  </table>
  <p class="small">A Nane concentra R$ ${brl(r2(D.semData.filter(t => /nane/i.test(t.desc)).reduce((s, t) => s + t.valor, 0)))}: comissão acumulada para dezembro, por acordo. O aluguel da casa de Uberaba (4.666,67) está em disputa desde a Expogenética.</p>
  ${foot(8)}
</section>

<!-- 9. RESSALVAS (1/2) -->
<section class="page">
  <div class="head"><h2>O que não foi assumido como verdade</h2><div class="n">09 · ressalvas · 1 de 2</div></div>
  <p class="small" style="color:${INK}">Você pediu cuidado com dado avulso. Esta é a lista do que este relatório <strong>não</strong> tratou como certo — e do que aconteceria se estivesse errado.</p>
  ${D.ressalvas.slice(0, 8).map(r => `<div class="res"><div class="t">${esc(r.tema)}</div><p>${esc(r.texto)}</p></div>`).join('')}
  ${foot(9)}
</section>

<!-- 10. RESSALVAS (2/2) + DECISOES -->
<section class="page">
  <div class="head"><h2>O que não foi assumido como verdade</h2><div class="n">10 · ressalvas · 2 de 2</div></div>
  ${D.ressalvas.slice(8).map(r => `<div class="res"><div class="t">${esc(r.tema)}</div><p>${esc(r.texto)}</p></div>`).join('')}

  <div class="box" style="margin-top:5mm">
    <div class="t">O que falta decidir ou conferir</div>
    <ol style="margin-bottom:0">
      <li><strong>Confirmar amanhã se a Colonial pagou os R$ ${brl(D.colonial.cr.valor)} inteiros</strong> (os dois pregões) — e, se vier só o Pepitas (7.830), cobrar os 3.510 do Noite Nacional.</li>
      <li><strong>Cobrar à parte Terra Boa, Nelore ZAN e Agropontieri</strong> (R$ ${brl(r2(D.colonial.foraDaNF.reduce((s, c) => s + c.valor, 0)))} a 3%): não têm acordo na aba de marcas — decidir se cobra e por qual tabela.</li>
      <li><strong>Resolver as ${D.verificacao.length} comissões em verificação antes do dia 25</strong> (R$ ${brl(D.somaVerificacao)}): LS Galeria 22.800 “a definir”, Sabiá Dourado 5.535, Genética Aditiva 6.640, Pérolas do Tapajós 4.500 + 2.100. Cada uma decidida entra na base e muda o que cabe pagar.</li>
      <li><strong>Fechar data do LS Galeria II com a e-Rural</strong> (57.840): é o maior recebível do mês e está na curva por data de regra.</li>
      <li><strong>Lançar os impostos de setembro</strong> assim que as guias saírem; hoje a estimativa é R$ ${brl(r2(D.impostosEstimados.iss.valor + D.impostosEstimados.das.valor))} só com as NFs 638/639/643.</li>
      <li><strong>Santa Nazaré 1/2 (5.714, 04/09)</strong> venceu com data acordada e não caiu: cobrar.</li>
      <li><strong>Validar o curto prazo de hoje</strong>: Terra Brava — emitir a NF de 4.686,30 e corrigir o CR de 11.984,49; Matinha — “de acordo” de Thiago e Terêncio e a resposta sobre o lote E11; e-Rural — conferir os 3 itens do Marcondes (80.250 × 37.500 no ERP) antes de anexar as NFs no portal.</li>
      <li><strong>As duas perguntas de 14/09</strong>: 792 “venda Raphael Coelho” ao Marcelo e o PIX de 50,00 sem dono.</li>
    </ol>
  </div>

  <p class="small" style="margin-top:4mm">Base: ERP conciliado até 15/09/2026 18h57 — Sicoob bate ao centavo com o extrato do dia (50 lançamentos, validação por saldo dia a dia); Sicredi na posição de 14/09. Datas dos recebíveis: tags de acordo nos títulos, aba Leilões da planilha FINANCEIRO BULA 2026 (arquivo (8), 15/09 13h56) e informação do João sobre a Colonial. Saídas: títulos do ERP classificados por apuração (firme / projeção / em verificação). Curto prazo: prints enviados pelo João às 19h de 15/09. Gerado por <code>gera-caixa-2026-09-15.mjs</code> + <code>render-caixa-2026-09-15.mjs</code>; conciliação em <code>concilia-sicoob-2026-09-15.mts</code>.</p>
  ${foot(10)}
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
const pdfPath = path.join(desktop, 'Bula - Panorama de Caixa 15-09-2026.pdf')
await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
fs.copyFileSync(pdfPath, path.join(OUT, 'Bula - Panorama de Caixa 15-09-2026.pdf'))
const nSec = await pg.evaluate(() => document.querySelectorAll('.page').length)
await browser.close()
const { PDFDocument } = await import('pdf-lib')
const doc = await PDFDocument.load(fs.readFileSync(pdfPath))
console.log('PDF:', pdfPath)
console.log('secoes no HTML:', nSec, '| paginas no PDF:', doc.getPageCount(), doc.getPageCount() === nSec ? '(OK)' : '(⚠ DIVERGE)')
