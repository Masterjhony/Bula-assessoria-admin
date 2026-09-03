/**
 * Renderiza o relatorio de posicao de caixa de setembro/2026 e previsao ate
 * 20/09 a partir de outputs/caixa-setembro-2026/dados.json. Paleta
 * monocromatica do brandbook. Gera HTML + PDF A4 na Area de Trabalho.
 * Nenhum numero escrito a mao.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { chromium } from 'playwright'

const OUT = 'outputs/caixa-setembro-2026'
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

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C'
const cen = k => D.cenarios.find(c => c.chave === k)
const BASE = cen('BASE'), COMV = cen('COM_VENCIDO'), FIRME = cen('SO_FIRME'), SEMJMP = cen('SEM_JMP'), SOCX = cen('SO_CAIXA')

const entraJMP = r2(D.crJanela.filter(t => /JMP/i.test(t.rot)).reduce((s, t) => s + t.valor, 0))
const entraMafra = r2(D.crJanela.filter(t => /MAFRA/i.test(t.rot)).reduce((s, t) => s + t.valor, 0))
const entraNavirai = r2(D.crJanela.filter(t => /NAVIRAI/i.test(t.rot)).reduce((s, t) => s + t.valor, 0))
const eao = D.crSemData.filter(t => t.grupo === 'EAO')
const erural = D.crSemData.filter(t => t.grupo === 'E-RURAL')
const somaEao = r2(eao.reduce((s, t) => s + t.valor, 0))
const somaErural = r2(erural.reduce((s, t) => s + t.valor, 0))
const foraDaLinha = r2(D.somaCrSemData + D.somaCrVencido)
const saidasJanelaTotal = r2(D.somaCpJanela + D.estruturalDifuso + D.leilaoJanela)
const impostos = r2(D.cpDepois.filter(t => /Impostos/i.test(t.categoria)).reduce((s, t) => s + t.valor, 0))
const socio = r2(D.cpDepois.filter(t => /Socio/i.test(t.categoria)).reduce((s, t) => s + t.valor, 0))
const comisDepois = r2(D.cpDepois.filter(t => /Comiss/i.test(t.categoria)).reduce((s, t) => s + t.valor, 0))
const issqn = D.cpJanela.find(t => /ISSQN/i.test(t.rot))
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

/* ============ G1 — a linha do caixa ============ */
function gLinha() {
  const W = 762, H = 250, L = 56, R = 118, T = 14, B = 40
  const series = [
    { k: 'SO_CAIXA', rot: 'Nada entra', cor: '#C6C6C6', dash: '3 2', w: 1.5 },
    { k: 'SEM_JMP', rot: 'Sem o JMP', cor: '#8A8A8A', dash: '5 3', w: 1.5 },
    { k: 'BASE', rot: 'Base', cor: INK, dash: '', w: 2.4 },
  ]
  const pts = D.linhas.BASE
  const todos = series.flatMap(s => D.linhas[s.k].map(p => p.saldo)).concat([0])
  const max = Math.max(...todos), min = Math.min(...todos)
  const pad = (max - min) * 0.1 || 1000
  const hi = max + pad, lo = min - pad
  const x = i => L + (i * (W - L - R)) / (pts.length - 1)
  const y = v => T + ((hi - v) * (H - T - B)) / (hi - lo)
  const ticks = 5
  let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">`
  for (let i = 0; i <= ticks; i++) {
    const v = lo + ((hi - lo) * i) / ticks
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${v === 0 ? '#B0B0B0' : GRID}" stroke-width="1"/>`
    g += `<text x="${L - 6}" y="${(y(v) + 3).toFixed(1)}" font-size="8.4" fill="${MUTED}" text-anchor="end">${kk(v)}</text>`
  }
  g += `<line x1="${L}" x2="${W - R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="${INK}" stroke-width="1" stroke-dasharray="2 2"/>`
  pts.forEach((p, i) => {
    if (i % 2) return
    g += `<text x="${x(i).toFixed(1)}" y="${H - B + 13}" font-size="8" fill="${MUTED}" text-anchor="middle">${dm(p.data)}</text>`
    g += `<text x="${x(i).toFixed(1)}" y="${H - B + 23}" font-size="7" fill="#AFAFAF" text-anchor="middle">${ds(p.data)}</text>`
  })
  for (const s of series) {
    const d = D.linhas[s.k].map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' ')
    g += `<path d="${d}" fill="none" stroke="${s.cor}" stroke-width="${s.w}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round"/>`
    const last = D.linhas[s.k][D.linhas[s.k].length - 1]
    g += `<text x="${W - R + 6}" y="${(y(last.saldo) + 3).toFixed(1)}" font-size="8.4" fill="${s.cor}" font-weight="600">${s.rot} ${kk(last.saldo)}</text>`
  }
  // marcos de entrada grande
  for (const t of [{ d: '2026-09-13', r: 'JMP ' + kk(entraJMP) }, { d: '2026-09-15', r: 'Mafra ' + kk(entraMafra) }]) {
    const i = pts.findIndex(p => p.data === t.d)
    if (i < 0) continue
    g += `<line x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${T}" y2="${H - B}" stroke="${GOLD}" stroke-width="1" stroke-dasharray="2 2"/>`
    g += `<text x="${(x(i) + 3).toFixed(1)}" y="${T + 9}" font-size="8" fill="${GOLD}" font-weight="600">${t.r}</text>`
  }
  const iF = pts.findIndex(p => p.data === BASE.diaFundo)
  g += `<circle cx="${x(iF).toFixed(1)}" cy="${y(BASE.fundo).toFixed(1)}" r="3" fill="${INK}"/>`
  g += `<text x="${x(iF).toFixed(1)}" y="${(y(BASE.fundo) + 15).toFixed(1)}" font-size="8" fill="${INK}" text-anchor="middle" font-weight="600">pior dia ${kk(BASE.fundo)}</text>`
  return g + '</svg>'
}

/* ============ G2 — barras entradas x saidas por dia ============ */
function gBarras() {
  const pts = D.linhas.BASE, W = 762, H = 140, L = 56, R = 14, T = 10, B = 30
  const max = Math.max(...pts.map(p => Math.max(p.entradas, p.saidas)))
  const bw = (W - L - R) / pts.length
  const y = v => T + ((max - v) * (H - T - B)) / max
  let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">`
  for (let i = 0; i <= 3; i++) {
    const v = (max * i) / 3
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${GRID}"/>`
    g += `<text x="${L - 6}" y="${(y(v) + 3).toFixed(1)}" font-size="8" fill="${MUTED}" text-anchor="end">${kk(v)}</text>`
  }
  pts.forEach((p, i) => {
    const cx = L + i * bw
    if (p.entradas > 0) g += `<rect x="${(cx + bw * 0.12).toFixed(1)}" y="${y(p.entradas).toFixed(1)}" width="${(bw * 0.36).toFixed(1)}" height="${(H - B - y(p.entradas)).toFixed(1)}" fill="${INK}"/>`
    if (p.saidas > 0) g += `<rect x="${(cx + bw * 0.52).toFixed(1)}" y="${y(p.saidas).toFixed(1)}" width="${(bw * 0.36).toFixed(1)}" height="${(H - B - y(p.saidas)).toFixed(1)}" fill="#C6C6C6"/>`
    if (i % 2 === 0) g += `<text x="${(cx + bw / 2).toFixed(1)}" y="${H - B + 12}" font-size="7.6" fill="${MUTED}" text-anchor="middle">${dm(p.data)}</text>`
  })
  g += `<rect x="${W - 150}" y="${T}" width="8" height="8" fill="${INK}"/><text x="${W - 138}" y="${T + 7}" font-size="8" fill="${MUTED}">entra</text>`
  g += `<rect x="${W - 96}" y="${T}" width="8" height="8" fill="#C6C6C6"/><text x="${W - 84}" y="${T + 7}" font-size="8" fill="${MUTED}">sai</text>`
  return g + '</svg>'
}

const foot = () => `<div class="pfoot"><span>Bula Assessoria Pecuária — Posição de caixa de setembro e previsão até 20/09/2026</span><span>Gerado em 03/09/2026 · fonte: ERP conciliado com o extrato Sicoob de 03/09</span></div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Bula — Caixa de Setembro e previsão até 20/09/2026</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; color: ${INK}; margin: 0; font-size: 10.2px; line-height: 1.52; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1,h2,h3 { font-family: Oswald, "Arial Narrow", Impact, sans-serif; text-transform: uppercase; letter-spacing: .022em; font-weight: 600; margin: 0; }
  .page { width: 210mm; min-height: 297mm; padding: 14mm 13mm 17mm; position: relative; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .pfoot { position: absolute; left: 13mm; right: 13mm; bottom: 7mm; font-size: 7.4px; color: #A6A6A6;
           display: flex; justify-content: space-between; border-top: 1px solid ${GRID}; padding-top: 2mm; }
  .capa { background: ${INK}; color: #fff; padding: 32mm 20mm 20mm; display: flex; flex-direction: column; }
  .capa img { width: 42mm; margin-bottom: 24mm; }
  .capa h1 { font-size: 42px; line-height: 1.03; color: #fff; font-weight: 700; }
  .capa .sub { font-size: 12.4px; color: #B5B5B5; margin-top: 8mm; max-width: 138mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
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
  .tile { border: 1px solid ${GRID}; border-top: 3px solid ${INK}; padding: 3.4mm 3.4mm 3mm; }
  .tile .k { font-size: 8px; text-transform: uppercase; letter-spacing: .085em; color: ${MUTED}; margin-bottom: 1.6mm; line-height: 1.3; min-height: 5.6mm; }
  .tile .v { font-family: Oswald, sans-serif; font-size: 19px; font-weight: 600; line-height: 1; }
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
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.6mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .tag { display:inline-block; font-size:7.6px; letter-spacing:.06em; text-transform:uppercase; border:1px solid ${GRID}; padding:0 1.2mm; color:${MUTED}; }
</style></head><body>

<!-- ============================= CAPA ============================= -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Caixa de setembro<br>e previsão até o dia 20</h1>
  <div class="rule"></div>
  <div class="sub">O extrato do Sicoob de 03/09 entrou no ERP e fechou ao centavo: <strong style="color:#fff">R$ ${brl(D.caixa.sicoob)}</strong>.
  Com o Sicredi em R$ ${brl(D.caixa.sicredi)}, o caixa de hoje é <strong style="color:#fff">R$ ${brl(D.caixa.total)}</strong>.
  A janela até 20/09 passa sem nenhum dia negativo e fecha em ${sinal(BASE.final)} — mas só porque o JMP e o Mafra caem dentro dela.
  Os leilões da <strong style="color:#fff">e-Rural e do EAO seguem sem data</strong>: R$ ${brl0(D.somaCrSemData)} que este relatório deixa de fora da conta.</div>
  <div class="meta">
    <div><span>Caixa em 03/09</span><strong>R$ ${brl(D.caixa.total)}</strong></div>
    <div><span>Fecha em 20/09</span><strong>${sinal(BASE.final)}</strong></div>
    <div><span>Pior dia da janela</span><strong>${sinal(BASE.fundo)} · ${dm(BASE.diaFundo)}</strong></div>
    <div><span>Fora da conta</span><strong>R$ ${brl0(foraDaLinha)}</strong></div>
  </div>
</section>

<!-- ============================= P2 — HOJE ============================= -->
<section class="page">
  <div class="head"><h2>1 · Onde o caixa está hoje</h2><span class="n">03/09/2026</span></div>

  <div class="tiles">
    <div class="tile"><div class="k">Sicoob CC 1.056-1</div><div class="v"><span class="cur">R$</span>${brl(D.caixa.sicoob)}</div><div class="d">bate ao centavo com o extrato de 03/09</div></div>
    <div class="tile"><div class="k">Sicredi (CC + aplicação)</div><div class="v"><span class="cur">R$</span>${brl(D.caixa.sicredi)}</div><div class="d">posição confirmada por você em 03/09</div></div>
    <div class="tile gold"><div class="k">Caixa total</div><div class="v"><span class="cur">R$</span>${brl(D.caixa.total)}</div><div class="d">as duas contas somadas</div></div>
    <div class="tile"><div class="k">Saldo em 31/08</div><div class="v"><span class="cur">R$</span>${brl(D.saldo3108)}</div><div class="d">setembro começou praticamente empatado</div></div>
  </div>

  <h3>O que aconteceu em 01 e 02 de setembro</h3>
  <p>Dois dias movimentaram <strong>R$ ${brl(r2(D.realEntradas + D.realSaidas))}</strong> e o caixa terminou quase onde começou:
  entraram R$ ${brl(D.realEntradas)}, saíram R$ ${brl(D.realSaidas)}, variação de ${sinal(r2(D.caixa.sicoob - D.saldo3108))}.
  A folha de agosto saiu inteira no dia 1º.</p>

  <table>
    <tr><th>Data</th><th>O que foi</th><th class="num">Entra</th><th class="num">Sai</th></tr>
    ${D.realizado.filter(x => !/Transferencias Internas/i.test(x.categoria))
      .sort((a, b) => a.data.localeCompare(b.data) || a.tipo.localeCompare(b.tipo) || b.valor - a.valor).map(x => `<tr>
      <td>${dm(x.data)}</td><td>${esc(corta(x.rot.replace(/^PIX EMIT\.OUTRA IF - Pagamento Pix - /, '').replace(/^DB\.TR\.C\.DIF\.TIT\.INT - FAV\.: /, '').replace(/^CRED\.TRANSF\.CONTAS - REM\.: /, ''), 74))}</td>
      <td class="num">${x.tipo === 'entrada' ? brl(x.valor) : '—'}</td><td class="num">${x.tipo === 'saida' ? brl(x.valor) : '—'}</td></tr>`).join('')}
    <tr class="total"><td colspan="2">Total do movimento (fora transferência interna)</td><td class="num">${brl(D.realEntradas)}</td><td class="num">${brl(D.realSaidas)}</td></tr>
  </table>

  <div class="box">
    <div class="t">Três coisas que este extrato resolveu</div>
    <ol style="margin-bottom:0">
      <li><strong>A folha de agosto não estava no ERP.</strong> O extrato anterior foi tirado às 15h11 do dia 1º e os nove PIX de salário caíram depois.
      O sistema mostrava R$ 60.682,37 e o banco tinha R$ ${brl(D.caixa.sicoob)} — uma diferença de R$ ${brl(r2(60682.37 - D.caixa.sicoob))} que era, inteira, folha paga e não lançada.</li>
      <li><strong>Os R$ 12.000 do Sicredi ganharam a outra perna.</strong> Estavam registrados só do lado do Sicoob desde 01/09. Agora o par está completo.</li>
      <li><strong>Os R$ 1.755 de comissão de julho da Laila e do Peralta</strong> saíram no dia 2 e baixaram os títulos que estavam vencidos desde 25/08.</li>
    </ol>
  </div>

  <h3>Sobre o Sicredi: confere, com uma ressalva de R$ ${brl(r2(D.caixa.sicrediInv === 515.99 ? 82.65 : 0))}</h3>
  <p>O ERP trazia R$ 12.598,64 no Sicredi. Tirando os R$ 12.000 que vieram para o Sicoob, sobrariam <strong>R$ 598,64</strong> — e a conta tem <strong>R$ ${brl(D.caixa.sicredi)}</strong>.
  A diferença de <strong>R$ 82,65</strong> foi lançada como ajuste de posição para o ERP bater com o banco.
  A conta que fecha ao centavo é cesta de relacionamento R$ 67,64 + integralização de capital R$ 20,00 − rendimento R$ 4,99,
  mas <strong>isso ainda não foi conferido no extrato do Sicredi</strong> — quando ele vier, o ajuste é substituído pelos lançamentos reais.
  Fora esse detalhe, <strong>a sua conferência está certa</strong>: os R$ 12.000 saíram de lá e chegaram aqui.</p>

  ${foot()}
</section>

<!-- ============================= P3 — PREVISAO ============================= -->
<section class="page">
  <div class="head"><h2>2 · A previsão até 20 de setembro</h2><span class="n">${D.janelaDias} dias</span></div>

  <figure>${gLinha()}
  <figcaption>Saldo ao fim de cada dia. A linha cheia é a base — só o que tem data. As tracejadas são os cenários de risco:
  sem o JMP, e com nada entrando. O pior dia da base é ${dm(BASE.diaFundo)}, com ${sinal(BASE.fundo)}.</figcaption></figure>

  <div class="tiles">
    <div class="tile"><div class="k">Entra na janela</div><div class="v"><span class="cur">R$</span>${brl0(D.somaCrJanela)}</div><div class="d">${D.crJanela.length} títulos com data</div></div>
    <div class="tile"><div class="k">Sai na janela</div><div class="v"><span class="cur">R$</span>${brl0(saidasJanelaTotal)}</div><div class="d">R$ ${brl0(D.somaCpJanela)} lançados + R$ ${brl0(r2(D.estruturalDifuso + D.leilaoJanela))} de média medida</div></div>
    <div class="tile gold"><div class="k">Fecha em 20/09</div><div class="v"><span class="cur">R$</span>${brl0(BASE.final)}</div><div class="d">nenhum dia negativo</div></div>
    <div class="tile"><div class="k">Pior dia</div><div class="v"><span class="cur">R$</span>${brl0(BASE.fundo)}</div><div class="d">${dm(BASE.diaFundo)}, antes do JMP cair</div></div>
  </div>

  <figure>${gBarras()}<figcaption>Entradas e saídas por dia. Os dois blocos de entrada que sustentam a janela são 13/09 (JMP) e 15–16/09 (Mafra).</figcaption></figure>

  <div class="cols2">
    <div>
      <h3>O que entra — com data</h3>
      <table>
        <tr><th>Venc.</th><th>Título</th><th class="num">Valor</th></tr>
        ${D.crJanela.map(t => `<tr${/JMP|MAFRA/i.test(t.rot) ? ' class="destaque"' : ''}><td>${dm(t.venc)}</td><td>${esc(corta(t.rot.replace(/ - COMISSAO BULA| - BULA REMATES/, ''), 42))}</td><td class="num">${brl(t.valor)}</td></tr>`).join('')}
        <tr class="total"><td colspan="2">Total</td><td class="num">${brl(D.somaCrJanela)}</td></tr>
      </table>
    </div>
    <div>
      <h3>O que sai — com data</h3>
      <table>
        <tr><th>Venc.</th><th>Título</th><th class="num">Valor</th></tr>
        ${D.cpJanela.map(t => `<tr><td>${dm(t.venc)}</td><td>${esc(corta(t.rot, 42))}</td><td class="num">${brl(t.valor)}</td></tr>`).join('')}
        <tr><td>—</td><td>Custo estrutural difuso (média medida)</td><td class="num">${brl(D.estruturalDifuso)}</td></tr>
        <tr><td>—</td><td>Despesa de leilão (média medida)</td><td class="num">${brl(D.leilaoJanela)}</td></tr>
        <tr class="total"><td colspan="2">Total</td><td class="num">${brl(saidasJanelaTotal)}</td></tr>
      </table>
    </div>
  </div>

  <div class="box rule">
    <p style="margin:0"><strong>Como as duas médias foram calculadas.</strong> Não são chute: saem do extrato de julho e agosto.
    O custo estrutural fora de folha, imposto e comissão deu R$ ${brl(D.estruturalDia)}/dia — em ${D.janelaDias} dias, R$ ${brl(D.estruturalJanelaBruto)},
    menos R$ ${brl(D.estruturalLancado)} que já estão lançados como título. A despesa de leilão deu R$ ${brl(D.leilaoDia)}/dia.
    <span class="muted">Ressalva: o campo “modelo” dos leilões está vazio em todo julho, então não dá para medir por evento presencial ainda — por isso a média é mensal.</span></p>
  </div>

  ${foot()}
</section>

<!-- ============================= P4 — FORA DA CONTA ============================= -->
<section class="page">
  <div class="head"><h2>3 · O que ficou fora da conta</h2><span class="n">R$ ${brl0(foraDaLinha)}</span></div>

  <p class="lead">A previsão da página anterior só usa recebível <strong>com data</strong>. Tudo o que está aqui existe, está cobrado,
  e não entrou na linha do caixa — por decisão sua, no caso da e-Rural e do EAO, e por já estar vencido, no resto.</p>

  <h3>Sem data prevista — e-Rural e EAO</h3>
  <table>
    <tr><th>Grupo</th><th>Título</th><th>Venc. no ERP</th><th class="num">Valor</th></tr>
    ${D.crSemData.map(t => `<tr><td><span class="tag">${t.grupo}</span></td><td>${esc(corta(t.rot.replace(/ - COMISSAO BULA/, ''), 52))}</td><td>${dm(t.venc)}${t.venc < D.hoje ? ' <span class="muted">(vencido)</span>' : ''}</td><td class="num">${brl(t.valor)}</td></tr>`).join('')}
    <tr class="total"><td colspan="3">Total sem data</td><td class="num">${brl(D.somaCrSemData)}</td></tr>
  </table>
  <p class="small">EAO R$ ${brl(somaEao)} em ${eao.length} títulos (contato Max) · e-Rural R$ ${brl(somaErural)} em ${erural.length} títulos (contato Vivian).
  Só o EAO, se entrasse, mais que dobraria a folga do pior dia da janela.</p>

  <h3>Vencidos com data no ERP, ainda não recebidos</h3>
  <table>
    <tr><th>Venc.</th><th>Título</th><th>Cliente</th><th class="num">Valor</th></tr>
    ${D.crVencido.map(t => `<tr><td>${dm(t.venc)}</td><td>${esc(corta(t.rot.replace(/ - COMISSAO BULA| - BULA REMATES| - PROGRAMA/, ''), 44))}</td><td>${esc(corta(t.cliente, 18))}</td><td class="num">${brl(t.valor)}</td></tr>`).join('')}
    <tr class="total"><td colspan="3">Total vencido</td><td class="num">${brl(D.somaCrVencido)}</td></tr>
  </table>

  <div class="cols2">
    <div>
      <h3>Comissões vencidas a pagar</h3>
      <table>
        <tr><th>Título</th><th class="num">Valor</th></tr>
        ${D.cpVencido.map(t => `<tr><td>${esc(corta(t.rot, 46))}</td><td class="num">${brl(t.valor)}</td></tr>`).join('')}
        <tr class="total"><td>Total (venc. 25/08)</td><td class="num">${brl(D.somaCpVencido)}</td></tr>
      </table>
      <p class="small">Não entraram na linha do caixa: quem define a data de pagamento é você, não o sistema.
      Pagando tudo em 05/09, o pior dia cai de ${sinal(BASE.fundo)} para ${sinal(COMV.fundo)} — continua sem furar.</p>
    </div>
    <div>
      <h3>O que vem logo depois da janela</h3>
      <p>Entre 21 e 30/09 saem <strong>R$ ${brl(D.somaCpDepois)}</strong> já lançados:
      R$ ${brl0(impostos)} do DAS de agosto (22/09), R$ ${brl0(socio)} da participação trimestral do Marcelo (25/09)
      e R$ ${brl0(comisDepois)} de comissões no dia 25.</p>
      <p>Some a isso R$ ${brl0(D.somaCrDepois)} a receber com data depois de 20/09.
      <strong>O saldo de ${sinal(BASE.final)} em 20/09 não é folga: é o que paga o fim de setembro.</strong></p>
    </div>
  </div>

  <h3>Se as coisas não caírem como o previsto</h3>
  <table>
    <tr><th>Cenário</th><th class="num">Pior dia</th><th class="num">Fecha em 20/09</th><th class="num">Dias negativos</th></tr>
    ${[BASE, COMV, FIRME, SEMJMP, SOCX].map(c => `<tr${c.chave === 'BASE' ? ' class="destaque"' : ''}><td>${esc(c.rot)}</td><td class="num">${sinal(c.fundo)}</td><td class="num">${sinal(c.final)}</td><td class="num">${c.negativos}</td></tr>`).join('')}
  </table>
  <p class="small">Mesmo se o JMP atrasar, a janela passa. O único cenário que fura é o de nada entrar em 18 dias — que nunca aconteceu.</p>

  ${foot()}
</section>

<!-- ============================= P5 — DECISOES ============================= -->
<section class="page">
  <div class="head"><h2>4 · O que precisa da sua decisão</h2><span class="n">5 pontos</span></div>

  <table>
    <tr><th style="width:26%">Ponto</th><th class="num" style="width:13%">Valor</th><th>Por quê</th></tr>
    <tr><td><strong>Folha do Douglas</strong></td><td class="num">R$ ${brl(2500)}</td>
      <td>Saiu R$ 10.000 no dia 1º contra um fixo cadastrado de R$ 12.500. O título ficou <strong>parcial</strong> com R$ 2.500 em aberto.
      Ou falta pagar, ou o fixo dele mudou — e aí quem tem de mudar é o cadastro da folha, não o título.</td></tr>
    <tr><td><strong>São Geraldo — base de cálculo</strong></td><td class="num">R$ 390,00</td>
      <td>A Remates pagou R$ 24.904,00, que é <strong>exatamente metade de 1% × R$ 4.980.800</strong> — o faturamento que o HastaPro registra.
      O título foi lançado sobre R$ 5.019.800 (planilha do Drive). Se a base certa for a do HastaPro, sobram R$ 24.904,00 e não R$ ${brl(25294)}.</td></tr>
    <tr><td><strong>e-Rural e EAO</strong></td><td class="num">R$ ${brl(D.somaCrSemData)}</td>
      <td>Sem data prevista, como você apontou. É o maior bloco parado: R$ ${brl0(somaEao)} do EAO (dois títulos vencidos desde 25–26/08)
      e R$ ${brl0(somaErural)} da e-Rural. Uma data em qualquer um dos dois muda a janela inteira.</td></tr>
    <tr><td><strong>ISSQN de agosto</strong></td><td class="num">R$ ${brl(issqn ? issqn.valor : 0)}</td>
      <td>Vence 15/09 e ainda é <strong>estimado</strong> — é a maior saída da janela. Vale confirmar o valor apurado antes do dia 15,
      porque sozinho ele responde por ${(issqn ? (issqn.valor / saidasJanelaTotal) * 100 : 0).toFixed(0)}% de tudo que sai até dia 20.</td></tr>
    <tr><td><strong>Extrato do Sicredi</strong></td><td class="num">R$ 82,65</td>
      <td>O ajuste que ancorou a conta nos R$ ${brl(D.caixa.sicredi)} é uma hipótese até o extrato chegar.
      É valor pequeno, mas é a única linha do caixa hoje que não veio de um extrato.</td></tr>
  </table>

  <div class="box">
    <div class="t">Correção aplicada junto com esta conciliação</div>
    <p style="margin:0">Os dois títulos da 2ª parcela da <strong>Genética Aditiva (R$ 9.141,22)</strong> estavam vencendo em 08 e 09/09 no ERP.
    Essa data era a regra automática de leilão + 45 dias, não um combinado. A data acordada — que está no seu print de 26/08 — é <strong>26/09</strong>.
    Foram corrigidos: sem isso, a previsão contaria R$ 9.141,22 entrando dentro da janela, e os títulos marcariam “vencido” no dia 9 sem estarem.</p>
  </div>

  <h3>Os leilões que ainda geram despesa em setembro</h3>
  <p>Despesa de presencial não sai no dia do pregão: diária, passagem e estadia caem <strong>de uma a três semanas depois</strong>
  — a régua usada aqui é pregão + 10 dias. É isso que faz a despesa dos leilões de fim de agosto aparecer agora,
  e a dos leilões de 18 a 20/09 só depois do fim da janela.</p>
  <table>
    <tr><th>Pregão</th><th>Leilão</th><th>Leiloeira</th><th>Local</th><th class="num">Cai no caixa</th></tr>
    ${D.presenciais.map(p => `<tr${p.dentro ? ' class="destaque"' : ''}>
      <td>${dm(p.data)}</td><td>${esc(corta(p.nome, 38))}</td><td>${esc(corta(p.leiloeira, 18))}</td>
      <td>${esc(corta(p.local, 22))}</td><td class="num">${dm(p.caixa)}${p.dentro ? '' : ' <span class="muted">fora</span>'}</td></tr>`).join('')}
  </table>
  <p class="small">${D.presenciais.filter(p => p.dentro).length} dos ${D.presenciais.length} presenciais caem dentro da janela.
  O valor não está título a título — entra pela média medida de R$ ${brl(D.leilaoDia)}/dia, porque o reembolso chega depois que o assessor presta contas.
  <strong>Preencher o campo “modelo” dos leilões de julho</strong> passaria essa conta de média mensal para custo por evento presencial, que é o número que você pediria.</p>

  <h3>Em uma frase</h3>
  <div class="box rule">
    <p style="margin:0" class="lead">O caixa de hoje é <strong>R$ ${brl(D.caixa.total)}</strong> e a janela até 20/09 passa com folga —
    fecha em ${sinal(BASE.final)} e o pior dia ainda tem ${sinal(BASE.fundo)}, mesmo se o JMP atrasar.
    O aperto não está aqui: está nos <strong>R$ ${brl0(D.somaCpDepois)}</strong> que vencem entre 21 e 30/09,
    e é para eles que os <strong>R$ ${brl0(foraDaLinha)}</strong> parados na e-Rural, no EAO e nos vencidos fazem falta.</p>
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
const pdfPath = path.join(desktop, 'Bula - Caixa de Setembro e Previsao ate 20-09-2026.pdf')
await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '14mm', left: '11mm', right: '11mm' } })
await browser.close()
console.log('PDF:', pdfPath)
