/**
 * Renderiza o relatorio de fluxo de caixa 10-30/09/2026 a partir de
 * outputs/caixa-setembro-2026-09-10/dados.json. Paleta monocromatica do
 * brandbook. Gera HTML + PDF A4 na Area de Trabalho.
 * Nenhum numero escrito a mao aqui.
 *
 * Grafico impresso em monocromatico: a identidade das series nunca e so cor —
 * cada cenario tem traco proprio e rotulo na ponta, com legenda presente.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { chromium } from 'playwright'

const OUT = 'outputs/caixa-setembro-2026-09-10'
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
const limpa = s => String(s).replace(/ - COMISSAO BULA| - FECHAMENTO BULA| - BULA REMATES|COMISSAO |Comissão /gi, '').trim()

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', SOFT = '#B4B4B4', RED = '#7A1F1F'
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

const cen = k => D.cenarios.find(c => c.chave === k)
const BASE = cen('BASE'), ATRAS = cen('ATRASADOS'), SEMMARC = cen('SEM_MARCELO')
const custoMarcelo = r2(SEMMARC.fecha - BASE.fecha)

/* ── grafico: curva diaria dos tres cenarios ────────────────────────────── */
function grafCurva() {
  const W = 1000, H = 340, L = 62, R = 96, T = 18, B = 40
  const series = [
    { c: BASE, rot: 'Como decidido', dash: '', w: 2.6 },
    { c: ATRAS, rot: '+ atrasados', dash: '5,3', w: 1.9 },
    { c: SEMMARC, rot: 'se adiar o Marcelo', dash: '1.5,3', w: 1.9 },
  ]
  const todos = series.flatMap(s => s.c.pontos.map(p => p.saldo)).concat([0])
  const max = Math.max(...todos) * 1.06, min = Math.min(...todos, 0) * 1.12
  const n = D.dias.length
  const x = i => L + (i / (n - 1)) * (W - L - R)
  const y = v => T + (1 - (v - min) / (max - min)) * (H - T - B)
  let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Inter, sans-serif">`
  // grade horizontal
  const passo = (max - min) / 4
  for (let k = 0; k <= 4; k++) {
    const v = min + passo * k
    g += `<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    g += `<text x="${L - 7}" y="${(y(v) + 3.2).toFixed(1)}" text-anchor="end" font-size="11" fill="${MUTED}">${kk(v)}</text>`
  }
  // zero
  if (min < 0) g += `<line x1="${L}" y1="${y(0).toFixed(1)}" x2="${W - R}" y2="${y(0).toFixed(1)}" stroke="${RED}" stroke-width="1.2"/>`
  // reserva
  g += `<line x1="${L}" y1="${y(D.reserva).toFixed(1)}" x2="${W - R}" y2="${y(D.reserva).toFixed(1)}" stroke="${GOLD}" stroke-width="1" stroke-dasharray="3,3"/>`
  g += `<text x="${W - R + 4}" y="${(y(D.reserva) + 3.2).toFixed(1)}" font-size="9.5" fill="#8A7331">reserva ${kk(D.reserva)}</text>`
  // eixo x
  for (let i = 0; i < n; i++) {
    const dia = D.dias[i]
    if (Number(dia.slice(8, 10)) % 5 !== 0 && i !== 0) continue
    g += `<text x="${x(i).toFixed(1)}" y="${H - B + 16}" text-anchor="middle" font-size="10.5" fill="${MUTED}">${dm(dia)}</text>`
  }
  // dia 25 marcado
  const i25 = D.dias.indexOf('2026-09-25')
  if (i25 >= 0) {
    g += `<line x1="${x(i25).toFixed(1)}" y1="${T}" x2="${x(i25).toFixed(1)}" y2="${H - B}" stroke="${SOFT}" stroke-width="1" stroke-dasharray="2,3"/>`
    g += `<text x="${x(i25).toFixed(1)}" y="${T - 5}" text-anchor="middle" font-size="9.5" fill="${MUTED}">dia 25 · comissões</text>`
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
    ${esc(s.rot)} <strong>${sinal0(s.c.fecha)}</strong></span>`).join('')
  return `<figure>${g}<div style="font-size:9px;margin-top:1.5mm">${leg}</div></figure>`
}

/* ── grafico: barras de entradas x saidas por dia ───────────────────────── */
function grafBarras() {
  const W = 1000, H = 210, L = 62, R = 20, T = 14, B = 34
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
    <span style="margin-right:11px"><svg width="10" height="9"><rect width="9" height="9" fill="${INK}"/></svg> saídas</span>
    <span><svg width="10" height="9"><rect width="8" height="8" x="0.5" y="0.5" fill="none" stroke="${INK}" stroke-width="1.3"/></svg> entradas</span></div></figure>`
}

const linhaCP = t => `<tr><td>${esc(corta(limpa(t.desc), 62))}</td><td class="num">${brl(t.valor)}</td></tr>`

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
  .capa .sub { font-size: 12.2px; color: #B5B5B5; margin-top: 7mm; max-width: 145mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
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
  .tile.neg .v { color: ${RED}; }
  .box { border: 1px solid ${GRID}; padding: 4mm 4.4mm; margin: 4mm 0; }
  .box.dark { background: ${INK}; color: #fff; border-color: ${INK}; }
  .box.dark .t { color: ${GOLD}; }
  .box.dark p, .box.dark li { color: #D8D8D8; }
  .box.dark strong { color: #fff; }
  .box.rule { border: none; border-left: 3px solid ${INK}; padding: 1mm 0 1mm 4mm; }
  .box.gold { border: none; border-left: 3px solid ${GOLD}; padding: 1mm 0 1mm 4mm; }
  .box .t { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; margin-bottom: 2.2mm; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 9.3px; margin: 3mm 0; }
  th { text-align: left; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.4px; letter-spacing: .07em; font-weight: 600; border-bottom: 1.4px solid ${INK}; padding: 2mm 1.8mm; }
  td { padding: 1.5mm 1.8mm; border-bottom: 1px solid #F0F0F0; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.destaque td { background: #F6F6F6; font-weight: 600; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  tr.neg td { color: ${RED}; }
  figure { margin: 3mm 0 4mm; }
  figcaption { font-size: 8.6px; color: ${MUTED}; margin-top: 1.6mm; line-height: 1.45; }
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.5mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .tag { display:inline-block; font-size:7.6px; letter-spacing:.06em; text-transform:uppercase; border:1px solid ${GRID}; padding:0 1.2mm; color:${MUTED}; }
  .tag.on { border-color:${INK}; color:${INK}; }
  .tag.gold { border-color:${GOLD}; color:#8A7331; }
</style></head><body>

<!-- CAPA -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Fluxo de caixa<br>até 30 de setembro</h1>
  <div class="rule"></div>
  <div class="sub">O caixa fechou o dia 10 em <strong style="color:#fff">R$ ${brl(D.caixa.total)}</strong>, já com o Mafra dentro.
  Mas <strong style="color:#fff">R$ ${brl0(D.bulinha.total)}</strong> disso é do Bulinha e sai agora, o Marcelo leva
  <strong style="color:#fff">R$ ${brl0(D.marcelo.valor)}</strong> amanhã e o dia 25 ainda pede
  <strong style="color:#fff">R$ ${brl0(D.blocos.find(b => b.dia === '2026-09-25').valor)}</strong> de comissões.
  Com tudo isso e só o que tem data para entrar, o mês <strong style="color:#fff">fecha em ${sinal0(BASE.fecha)}</strong> e o caixa
  fura o zero em ${dm(BASE.minDia)}. Adiando o Marcelo, fecharia em ${sinal0(SEMMARC.fecha)}.</div>
  <div class="meta">
    <div><span>Caixa em ${dm(D.hoje)}</span><strong>R$ ${brl(D.caixa.total)}</strong></div>
    <div><span>Entra com data</span><strong>R$ ${brl0(D.somaEntradas)}</strong></div>
    <div><span>Sai até 30/09</span><strong>R$ ${brl0(D.somaSaidas)}</strong></div>
    <div><span>Fecha o mês</span><strong>${sinal0(BASE.fecha)}</strong></div>
    <div><span>Menor saldo (${dm(BASE.minDia)})</span><strong>${sinal0(BASE.min)}</strong></div>
  </div>
</section>

<!-- 1. POSICAO -->
<section class="page">
  <div class="head"><h2>A posição de hoje</h2><div class="n">01 · ${dm(D.hoje)}</div></div>
  <div class="tiles">
    <div class="tile"><div class="k">Caixa total</div><div class="v"><span class="cur">R$</span>${brl0(D.caixa.total)}</div><div class="d">três contas, conciliadas ao centavo com os extratos</div></div>
    <div class="tile gold"><div class="k">Caixa próprio</div><div class="v"><span class="cur">R$</span>${brl0(D.caixaProprio)}</div><div class="d">tirando o repasse do JMP, que é do Bulinha</div></div>
    <div class="tile"><div class="k">A sair até 30/09</div><div class="v"><span class="cur">R$</span>${brl0(D.somaSaidas)}</div><div class="d">${D.naJanela.length} títulos com vencimento na janela</div></div>
    <div class="tile ${BASE.fecha < 0 ? 'neg' : ''}"><div class="k">Fecha o mês em</div><div class="v">${sinal0(BASE.fecha)}</div><div class="d">já com o Marcelo em 11/09; sem os atrasados</div></div>
  </div>

  <table>
    <tr><th>Conta</th><th class="num">Saldo</th><th>Observação</th></tr>
    ${D.caixa.contas.map(c => `<tr><td>${esc(c.nome)}</td><td class="num">${brl(c.saldo)}</td><td class="muted">${c.tipo === 'investimento' ? 'aplicação — é onde está o dinheiro do JMP' : c.saldo < 0 ? 'saldo devedor: cesta e integralização debitadas em 10/09' : 'conta operacional'}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td class="num">${brl(D.caixa.total)}</td><td></td></tr>
  </table>

  <div class="box dark">
    <div class="t">O número que engana</div>
    <p>O caixa mostra <strong>R$ ${brl(D.caixa.total)}</strong>, mas <strong>R$ ${brl(D.bulinha.total)}</strong> já têm dono: é o repasse ao Bulinha
    fechado hoje — a 2ª parcela do JMP (R$ 165.667,50, que entrou no Sicredi em 08/09 e foi aplicada no mesmo dia) mais a comissão dele de agosto
    (R$ 3.960,00), menos a metade do ISS já pago (R$ 8.283,37).</p>
    <p style="margin:0">Descontado o repasse, o caixa de verdade é <strong>R$ ${brl(D.caixaProprio)}</strong>.</p>
  </div>

  <h3>O que caiu hoje</h3>
  <table>
    <tr><th>Entrada</th><th class="num">Valor</th><th>Origem</th></tr>
    <tr><td>Mafra — Redenção/PA (fêmeas 01/08 + touros 02/08)</td><td class="num">${brl(D.mafra.recebido)}</td><td class="muted">PIX às 17h de Carlos Alberto M Terra</td></tr>
    <tr><td>EAO Baviera — NF 639 consolidada</td><td class="num">92.324,97</td><td class="muted">TED, um dia após o vencimento</td></tr>
    <tr><td>Naviraí — NF 630/631/632 (etapas 1 e 2 de julho)</td><td class="num">18.404,25</td><td class="muted">três PIX de Claudio Sabino</td></tr>
    <tr class="total"><td>Entrou em 10/09</td><td class="num">${brl(r2(D.mafra.recebido + 92324.97 + 18404.25))}</td><td></td></tr>
  </table>
  <p class="small">O Mafra veio <strong>R$ ${brl(D.mafra.desconto)} abaixo</strong> dos R$ ${brl(D.mafra.erp)} que o ERP tinha lançado. ${esc(D.mafra.nota)}</p>

  <div class="pfoot"><span>Bula Assessoria Pecuária · fluxo de caixa 10–30/09/2026</span><span>1</span></div>
</section>

<!-- 2. A CURVA -->
<section class="page">
  <div class="head"><h2>A curva até o fim do mês</h2><div class="n">02 · projeção</div></div>
  <p class="lead">Cada linha parte do caixa de hoje e desce conforme os títulos vencem. Só entram na curva os recebíveis
  <strong>com data</strong> — os que a planilha do Drive datou e os que a leiloeira confirmou. O resto está no fim do relatório, fora da conta.</p>
  ${grafCurva()}
  <figcaption>A reserva de R$ ${brl0(D.reserva)} é o colchão de segurança: o que passa dela é o que sobra para decidir.
  O vale do dia 25 é o lote de comissões — o maior desembolso isolado do mês.</figcaption>

  <table>
    <tr><th>Cenário</th><th class="num">Menor saldo</th><th>Quando</th><th class="num">Fecha o mês</th><th class="num">Cabe pagar</th></tr>
    ${D.cenarios.map(c => `<tr${c.fecha < 0 ? ' class="neg"' : ''}><td><strong>${esc(c.rot)}</strong> — <span class="muted">${esc(c.desc)}</span></td>
      <td class="num">${sinal0(c.min)}</td><td>${dm(c.minDia)}</td><td class="num">${sinal0(c.fecha)}</td><td class="num">${sinal0(c.cabe)}</td></tr>`).join('')}
  </table>
  <p class="small">“Cabe pagar” = menor saldo da curva menos a reserva. Pagar X hoje desloca <em>todo</em> o saldo seguinte em −X, por isso o que limita é o
  ponto mais baixo do mês, não o saldo de hoje.</p>

  <h3>Entradas e saídas, dia a dia</h3>
  ${grafBarras()}

  <div class="box gold">
    <div class="t">O que o Marcelo custa no mês</div>
    <p>Pagando os <strong>R$ ${brl(D.marcelo.valor)}</strong> em 11/09, o mês <strong>fecha em ${sinal(BASE.fecha)}</strong> e o menor saldo vai a
    <strong>${sinal(BASE.min)}</strong> em ${dm(BASE.minDia)} — ou seja, o caixa fura o zero na semana do dia 25, quando saem as comissões.</p>
    <p style="margin:0">Adiando, o mês fecharia em <strong>${sinal(SEMMARC.fecha)}</strong>. A diferença é exatamente o valor dele.
    <strong>O buraco de ${dm(BASE.minDia)} é coberto por qualquer um destes:</strong> os R$ ${brl(D.somaVencidosReceber)} vencidos a cobrar,
    ou as ${D.alavancas.nADefinir} comissões “a definir” de R$ ${brl(D.alavancas.aDefinir)} que não podem ser pagas sem beneficiário decidido.</p>
  </div>

  <div class="pfoot"><span>Bula Assessoria Pecuária · fluxo de caixa 10–30/09/2026</span><span>2</span></div>
</section>

<!-- 3. ENTRADAS -->
<section class="page">
  <div class="head"><h2>O que entra — e com que data</h2><div class="n">03 · recebíveis</div></div>
  <p class="lead">Cada linha carrega a fonte da data. Onde a planilha do Drive e o ERP divergiam, valeu a planilha: ela é a posição do financeiro.</p>

  <h3>Entra na curva · R$ ${brl(D.somaEntradas)}</h3>
  <table>
    <tr><th>Data</th><th>Recebível</th><th class="num">Valor</th><th>Fonte da data</th></tr>
    ${D.entradas.map(e => `<tr><td><strong>${dm(e.data)}</strong> <span class="muted">${ds(e.data)}</span></td><td>${esc(corta(e.rot, 50))}</td>
      <td class="num">${brl(e.valor)}</td><td class="muted">${esc(e.fonte)}</td></tr>`).join('')}
    <tr class="total"><td></td><td>Total com data</td><td class="num">${brl(D.somaEntradas)}</td><td></td></tr>
  </table>

  <h3>Tem data, mas a data já passou · R$ ${brl(D.somaVencidosReceber)}</h3>
  <table>
    <tr><th>Data</th><th>Recebível</th><th class="num">Valor</th><th>Fonte</th></tr>
    ${D.vencidosReceber.map(e => `<tr><td><strong>${dm(e.data)}</strong></td><td>${esc(corta(e.rot, 50))}</td><td class="num">${brl(e.valor)}</td><td class="muted">${esc(e.fonte)}</td></tr>`).join('')}
    <tr class="total"><td></td><td>Total vencido a cobrar</td><td class="num">${brl(D.somaVencidosReceber)}</td><td></td></tr>
  </table>
  <p class="small">Ficam <strong>fora</strong> da curva de propósito: projetar recebimento atrasado como se fosse certo é o que faz um mês apertado parecer folgado.
  Se entrarem, somam direto ao que cabe pagar.</p>

  <h3>Sem data — em fechamento · R$ ${brl(D.somaSemPosicao)} em ${D.semPosicao.length} títulos</h3>
  <table>
    <tr><th>Recebível</th><th class="num">Valor</th><th>Venc. de regra no ERP</th></tr>
    ${D.semPosicao.slice(0, 7).map(t => `<tr><td>${esc(corta(limpa(t.desc), 58))}</td><td class="num">${brl(t.valor)}</td><td class="muted">${t.venc ? dm(t.venc) : '—'}</td></tr>`).join('')}
    ${D.semPosicao.length > 7 ? `<tr><td class="muted">+ ${D.semPosicao.length - 7} títulos menores</td><td class="num muted">${brl(r2(D.semPosicao.slice(7).reduce((s, t) => s + t.valor, 0)))}</td><td></td></tr>` : ''}
    <tr class="total"><td>Total sem posição</td><td class="num">${brl(D.somaSemPosicao)}</td><td></td></tr>
  </table>
  <p class="small">Esses existem e vão entrar, mas nenhum tem data acordada — o vencimento no ERP é a regra automática de leilão + 45 dias, não um compromisso da leiloeira.
  Por isso não entram na projeção.</p>

  <div class="pfoot"><span>Bula Assessoria Pecuária · fluxo de caixa 10–30/09/2026</span><span>3</span></div>
</section>

<!-- 4. SAIDAS -->
<section class="page">
  <div class="head"><h2>O que sai</h2><div class="n">04 · obrigações · R$ ${brl0(D.somaSaidas)} em ${D.naJanela.length} títulos</div></div>

  <table>
    <tr><th>Data</th><th class="num">Total</th><th>Nº</th><th>Maiores do dia</th></tr>
    ${D.blocos.map(b => `<tr${b.dia === '2026-09-25' ? ' class="destaque"' : ''}><td><strong>${dm(b.dia)}</strong> <span class="muted">${ds(b.dia)}</span></td>
      <td class="num">${brl(b.valor)}</td><td>${b.n}</td>
      <td class="muted">${esc(corta(b.maiores.map(m => limpa(m.desc)).join(' · '), 74))}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td class="num">${brl(D.somaSaidas)}</td><td>${D.naJanela.length}</td><td></td></tr>
  </table>

  <div class="cols2">
    <div>
      <h3>O dia 25, por quem recebe</h3>
      <table>
        <tr><th>Beneficiário</th><th class="num">Valor</th></tr>
        ${D.d25Benef.slice(0, 6).map(b => `<tr><td>${esc(b.nome)}</td><td class="num">${brl(b.valor)}</td></tr>`).join('')}
        ${D.d25Benef.length > 6 ? `<tr><td class="muted">+ ${D.d25Benef.length - 6} outros</td><td class="num muted">${brl(r2(D.d25Benef.slice(6).reduce((s, b) => s + b.valor, 0)))}</td></tr>` : ''}
        <tr class="total"><td>Total do dia 25</td><td class="num">${brl(D.blocos.find(b => b.dia === '2026-09-25').valor)}</td></tr>
      </table>
      <p class="small">Dessas, <strong>R$ ${brl(D.alavancas.aDefinir)}</strong> em ${D.alavancas.nADefinir} títulos estão como <em>“a definir”</em>:
      sem beneficiário decidido não podem ser pagas, mas contam na projeção. Resolver a atribuição libera esse valor no dia 25.</p>
    </div>
    <div>
      <h3>Impostos da competência</h3>
      <table>
        <tr><th>Guia</th><th>Venc.</th><th class="num">Valor</th></tr>
        ${D.impostos.map(t => `<tr><td>${esc(corta(t.desc, 34))}</td><td>${dm(t.venc)}</td><td class="num">${brl(t.valor)}</td></tr>`).join('')}
        <tr class="total"><td>Total</td><td></td><td class="num">${brl(r2(D.impostos.reduce((s, t) => s + t.valor, 0)))}</td></tr>
      </table>

      <h3>O repasse ao Bulinha</h3>
      <table>
        <tr><th>Título</th><th class="num">Valor</th></tr>
        ${D.bulinha.titulos.map(t => `<tr><td>${esc(corta(limpa(t.desc), 40))}</td><td class="num">${brl(t.valor)}</td></tr>`).join('')}
        <tr class="total"><td>Total</td><td class="num">${brl(D.bulinha.total)}</td></tr>
      </table>
      <p class="small">JMP 165.667,50 + comissão 3.960,00 − metade do ISS 8.283,37. As duas comissões foram antecipadas do dia 25 para sair no mesmo PIX.</p>
    </div>
  </div>

  <div class="pfoot"><span>Bula Assessoria Pecuária · fluxo de caixa 10–30/09/2026</span><span>4</span></div>
</section>

<!-- 5. FORA DA CURVA + PENDENCIAS -->
<section class="page">
  <div class="head"><h2>Fora da curva e pendências</h2><div class="n">05 · o que falta decidir</div></div>

  <h3>Atrasados — R$ ${brl(D.somaAtrasados)} em ${D.atrasados.length} títulos</h3>
  <table>
    <tr><th>Venc.</th><th>Título</th><th class="num">Valor</th></tr>
    ${D.atrasados.sort((a, b) => a.venc.localeCompare(b.venc)).slice(0, 3).map(t => `<tr><td>${dm(t.venc)}</td><td>${esc(corta(limpa(t.desc), 62))}</td><td class="num">${brl(t.valor)}</td></tr>`).join('')}
    ${D.atrasados.length > 3 ? `<tr><td></td><td class="muted">+ ${D.atrasados.length - 3} títulos</td><td class="num muted">${brl(r2(D.atrasados.slice(3).reduce((s, t) => s + t.valor, 0)))}</td></tr>` : ''}
    <tr class="total"><td></td><td>Total</td><td class="num">${brl(D.somaAtrasados)}</td></tr>
  </table>

  <h3>Sem vencimento — R$ ${brl(D.somaSemData)} em ${D.semData.length} títulos</h3>
  <table>
    <tr><th>Título</th><th class="num">Valor</th></tr>
    ${D.semData.sort((a, b) => b.valor - a.valor).slice(0, 3).map(t => `<tr${/MARCELO/i.test(t.desc) ? ' class="destaque"' : ''}><td>${esc(corta(limpa(t.desc), 68))}</td><td class="num">${brl(t.valor)}</td></tr>`).join('')}
    ${D.semData.length > 3 ? `<tr><td class="muted">+ ${D.semData.length - 3} títulos</td><td class="num muted">${brl(r2(D.semData.sort((a, b) => b.valor - a.valor).slice(3).reduce((s, t) => s + t.valor, 0)))}</td></tr>` : ''}
    <tr class="total"><td>Total</td><td class="num">${brl(D.somaSemData)}</td></tr>
  </table>
  <p class="small">Em boa parte comissões da Nane, que seguem sem data desde os fechamentos.</p>

  <div class="box">
    <div class="t">O que falta decidir ou conferir</div>
    <ol style="margin-bottom:0">
      <li><strong>Marcelo — R$ ${brl(D.marcelo.valor)}, decidido para 11/09.</strong> Cabe no dia, mas deixa o mês em ${sinal(BASE.fecha)}
      e o caixa negativo em ${dm(BASE.minDia)}. O que fecha o buraco é cobrar os R$ ${brl(D.somaVencidosReceber)} vencidos ou destravar as
      ${D.alavancas.nADefinir} comissões “a definir”.</li>
      <li><strong>Rusa — corrigido para R$ 65.635,00.</strong> O ERP tinha R$ 97.960,00. Saíram quatro títulos que não estão na planilha de vendas dele
      (LS Galeria 22.800, Sabiá Dourado 5.535, Pérolas do Tapajós 4.500 + 2.100) e entrou um que faltava (Premium Colonial lote 29, R$ 2.610,00).
      <strong>Dois deles conflitam com o fechamento</strong>, que atribui os lotes ao Rusa: LS Galeria e Pérolas do Tapajós ficaram como “a definir”
      em vez de ir para outra pessoa por conta própria. Sabiá Dourado foi para o Douglas — ali as duas fontes concordam.</li>
      <li><strong>Mafra: 31,00 sem explicação.</strong> Pagaram 85.620,00; a tabela do acordo (0,3% do VGV para cobertura de 3–8%) dá 85.651,00.
      Diferença mínima — cobrar só se houver outro acerto com eles.</li>
      <li><strong>São Geraldo.</strong> A planilha ainda mostra R$ 25.099,00 “A RECEBER l 15/09”, mas o ERP recebeu R$ 24.904,00 em 02/09.
      Ou a planilha está desatualizada, ou faltam R$ 195,00. Não entrou na projeção.</li>
      <li><strong>LS Galeria II.</strong> A planilha traz R$ 59.840,00 e o ERP R$ 57.840,00 — <strong>R$ 2.000,00 de diferença</strong> num título
      que vence em 21/09. Projetei pelo ERP.</li>
      <li><strong>Terra Brava, 3ª parcela.</strong> A planilha diz R$ 2.745,00 e o ERP R$ 2.405,00 por parcela. Projetei pelo ERP.</li>
      <li><strong>Naviraí na planilha.</strong> Está lançado 16.335,00 (valores antigos, de antes da conferência de 21/08); entrou 18.404,25.</li>
      <li><strong>Bulinha tem dois cadastros</strong> no ERP — “Bulinha (Felipe Andrade)” e “Felipe Vilela Andrade”. O repasse aponta para um e as
      comissões para o outro. Unificar quando não houver título em aberto.</li>
    </ol>
  </div>

  <p class="small" style="margin-top:5mm">Base: ERP conciliado até 10/09/2026 — Sicoob, Sicredi conta corrente e aplicação batem ao centavo com os extratos,
  sem movimento pendente. Datas dos recebíveis: planilha FINANCEIRO BULA 2026 (Drive, aba Leilões), lida em 10/09 às 18h48.
  Gerado por <code>gera-caixa-setembro-2026-09-10.mjs</code> + <code>render-caixa-setembro-2026-09-10.mjs</code>.</p>

  <div class="pfoot"><span>Bula Assessoria Pecuária · fluxo de caixa 10–30/09/2026</span><span>5</span></div>
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
const pdfPath = path.join(desktop, 'Bula - Fluxo de Caixa ate 30-09-2026.pdf')
// Margem ZERO: cada .page ja e 210x297mm com padding proprio.
await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
const nSec = await pg.evaluate(() => document.querySelectorAll('.page').length)
await browser.close()
const { PDFDocument } = await import('pdf-lib')
const doc = await PDFDocument.load(fs.readFileSync(pdfPath))
console.log('secoes no HTML:', nSec, '| paginas no PDF:', doc.getPageCount(), doc.getPageCount() === nSec ? '(OK)' : '(⚠ DIVERGE)')
console.log('PDF:', pdfPath)
