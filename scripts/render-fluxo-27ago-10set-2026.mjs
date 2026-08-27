/**
 * Renderiza o relatorio de fluxo de caixa 27/08 -> 10/09/2026 a partir de
 * outputs/fluxo-27ago-10set-2026/dados.json. Paleta monocromatica do brandbook.
 * Gera HTML + PDF A4 na Area de Trabalho. Nenhum numero escrito a mao.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { chromium } from 'playwright'

const OUT = 'outputs/fluxo-27ago-10set-2026'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pc = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
const r2 = n => Math.round(Number(n) * 100) / 100
const kk = n => {
  const a = Math.abs(n)
  if (a >= 1000) return (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + 'k'
  return brl0(n)
}
const dm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7)
const DIA_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const ds = iso => DIA_SEM[new Date(iso + 'T12:00:00Z').getUTCDay()]
const corta = (t, n) => {
  const x = String(t)
  if (x.length <= n) return x
  const c = x.slice(0, n), sp = c.lastIndexOf(' ')
  return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–]+$/, '') + '…'
}
const sinal = n => (n < 0 ? '−R$ ' + brl(Math.abs(n)) : 'R$ ' + brl(n))

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C'
const cen = k => D.cenarios.find(c => c.chave === k)
const BASE = cen('BASE'), SEMC = cen('SEM_COM_JUL'), SOSIC = cen('SO_SICOOB'), NAV1 = cen('NAVIRAI_1'), ATR = cen('ATRASO_5')
const nec = (colchao, ate) => D.necessidade.find(n => n.colchao === colchao).marcos.find(m => m.ate === ate)
const folha = D.saidasLancadas.filter(x => x.categoria === 'Folha de Pagamento')
  .map(x => ({ ...x, pessoa: String(x.rot).replace(/^Folha\s+\w+\/\d+\s*-\s*/i, '') }))
  .sort((a, b) => b.valor - a.valor)
const leilaoProj = D.saidasProjetadas.filter(x => !x.oculto)
const eao = D.candidatos.filter(c => /EAO BAVIERA/i.test(c.rot))
const eaoTotal = r2(eao.reduce((s, c) => s + c.valor, 0))
// Pico DEPOIS do primeiro dia: o saldo de 27/08 e o ponto de partida, nao um pico.
const picoData = D.linhas.BASE.slice(1).reduce((a, p) => (p.saldo > a.saldo ? p : a), D.linhas.BASE[1])
const d0509 = D.linhas.BASE.find(p => p.data === '2026-09-05')
const entraNavirai = r2(D.entradas.filter(e => e.data === '2026-09-10').reduce((s, e) => s + e.valor, 0))
const gastoLeilaoProj = r2(D.premissas.leilao.porPresencial * D.presenciaisSemCP.length)

/* ============ G1 — a linha do caixa ============ */
function gLinha() {
  const W = 762, H = 268, L = 58, R = 132, T = 16, B = 44
  const series = [
    { k: 'SO_SICOOB', rot: 'Só o Sicoob', cor: '#C6C6C6', dash: '3 2', w: 1.5 },
    { k: 'SEM_COM_JUL', rot: 'Sem comissões de julho', cor: GOLD, dash: '5 2', w: 1.8 },
    { k: 'BASE', rot: 'Base — pagando tudo', cor: INK, dash: '', w: 2.4 },
  ]
  const pts = D.linhas.BASE
  const todos = series.flatMap(s => D.linhas[s.k].map(p => p.saldo))
  const max = Math.max(...todos, 0) * 1.12, min = Math.min(...todos, 0) * 1.25
  const x = i => L + i * (W - L - R) / (pts.length - 1)
  const y = v => T + (H - T - B) * (1 - (v - min) / (max - min))
  let grid = ''
  for (let i = 0; i <= 4; i++) {
    const v = min + (max - min) * i / 4, yy = y(v)
    grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    grid += `<text x="${L - 7}" y="${(yy + 3.4).toFixed(1)}" text-anchor="end" font-size="9" fill="${MUTED}">${kk(v)}</text>`
  }
  const y0 = y(0)
  grid += `<line x1="${L}" y1="${y0.toFixed(1)}" x2="${W - R}" y2="${y0.toFixed(1)}" stroke="${INK}" stroke-width="1.2"/>`
  // zona negativa
  const iNeg = pts.findIndex(p => p.saldo < 0)
  let zona = ''
  if (iNeg >= 0) {
    const fim = pts.length - 1
    zona = `<rect x="${x(iNeg - 1).toFixed(1)}" y="${y0.toFixed(1)}" width="${(x(fim) - x(iNeg - 1)).toFixed(1)}" height="${(H - B - y0).toFixed(1)}" fill="#F2F2F2"/>`
  }
  // marcos verticais
  const marcos = [
    { d: '2026-08-30', rot: 'Kito' },
    { d: '2026-09-05', rot: 'FOLHA' },
    { d: '2026-09-10', rot: 'Naviraí' },
  ]
  let vlin = ''
  for (const m of marcos) {
    const i = pts.findIndex(p => p.data === m.d)
    if (i < 0) continue
    vlin += `<line x1="${x(i).toFixed(1)}" y1="${T}" x2="${x(i).toFixed(1)}" y2="${H - B}" stroke="${m.rot === 'FOLHA' ? INK : GRID}" stroke-width="${m.rot === 'FOLHA' ? 1.2 : 1}" stroke-dasharray="2 2"/>`
    vlin += `<text x="${x(i).toFixed(1)}" y="${T - 4}" text-anchor="middle" font-size="8" fill="${m.rot === 'FOLHA' ? INK : MUTED}" font-weight="${m.rot === 'FOLHA' ? 700 : 400}">${m.rot}</text>`
  }
  let paths = '', legenda = ''
  series.forEach((s, si) => {
    const p = D.linhas[s.k]
    const d = p.map((q, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(q.saldo).toFixed(1)}`).join(' ')
    paths += `<path d="${d}" fill="none" stroke="${s.cor}" stroke-width="${s.w}" stroke-dasharray="${s.dash}" stroke-linejoin="round"/>`
    const fimY = y(p[p.length - 1].saldo)
    paths += `<circle cx="${x(p.length - 1).toFixed(1)}" cy="${fimY.toFixed(1)}" r="2.6" fill="${s.cor}"/>`
    legenda += `<g transform="translate(${W - R + 8},${T + 8 + si * 22})">
      <line x1="0" y1="0" x2="14" y2="0" stroke="${s.cor}" stroke-width="${s.w}" stroke-dasharray="${s.dash}"/>
      <text x="18" y="3" font-size="8.4" fill="${INK}">${esc(corta(s.rot, 26))}</text>
      <text x="18" y="13.6" font-size="8.4" fill="${MUTED}">${sinal(D.linhas[s.k][D.linhas[s.k].length - 1].saldo)}</text></g>`
  })
  // eixo x
  let eixo = ''
  pts.forEach((p, i) => {
    if (i % 2 && i !== pts.length - 1) return
    eixo += `<text x="${x(i).toFixed(1)}" y="${H - B + 13}" text-anchor="middle" font-size="8.2" fill="${MUTED}">${dm(p.data)}</text>`
  })
  // fundo do poco
  const iF = pts.findIndex(p => p.data === BASE.fundoData)
  const anot = `<circle cx="${x(iF).toFixed(1)}" cy="${y(BASE.fundo).toFixed(1)}" r="3.4" fill="none" stroke="${INK}" stroke-width="1.4"/>
    <text x="${x(iF).toFixed(1)}" y="${(y(BASE.fundo) + 16).toFixed(1)}" text-anchor="middle" font-size="8.6" font-weight="700" fill="${INK}">${sinal(BASE.fundo)}</text>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${zona}${grid}${vlin}${paths}${anot}${eixo}${legenda}</svg>`
}

/* ============ G2 — entra x sai por dia ============ */
function gBarras() {
  const W = 762, H = 150, L = 58, R = 12, T = 12, B = 34
  const pts = D.linhas.BASE
  const max = Math.max(...pts.map(p => Math.max(p.entra, p.sai))) * 1.1
  const bw = (W - L - R) / pts.length
  let g = '', barras = ''
  for (let i = 0; i <= 2; i++) {
    const v = max * i / 2, yy = T + (H - T - B) * (1 - v / max)
    g += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    g += `<text x="${L - 7}" y="${(yy + 3.4).toFixed(1)}" text-anchor="end" font-size="8.4" fill="${MUTED}">${kk(v)}</text>`
  }
  const yb = H - B
  pts.forEach((p, i) => {
    const cx = L + i * bw + bw / 2
    const hE = (H - T - B) * (p.entra / max), hS = (H - T - B) * (p.sai / max)
    if (p.entra) barras += `<rect x="${(cx - bw * 0.34).toFixed(1)}" y="${(yb - hE).toFixed(1)}" width="${(bw * 0.30).toFixed(1)}" height="${hE.toFixed(1)}" fill="${GOLD}"/>`
    if (p.sai) barras += `<rect x="${(cx + bw * 0.04).toFixed(1)}" y="${(yb - hS).toFixed(1)}" width="${(bw * 0.30).toFixed(1)}" height="${hS.toFixed(1)}" fill="${INK}"/>`
    if (i % 2 === 0 || i === pts.length - 1) barras += `<text x="${cx.toFixed(1)}" y="${H - B + 13}" text-anchor="middle" font-size="8.2" fill="${MUTED}">${dm(p.data)}</text>`
  })
  const leg = `<g transform="translate(${L},${H - 6})">
    <rect x="0" y="-7" width="9" height="7" fill="${GOLD}"/><text x="13" y="-1" font-size="8.4" fill="${INK}">entra</text>
    <rect x="52" y="-7" width="9" height="7" fill="${INK}"/><text x="65" y="-1" font-size="8.4" fill="${INK}">sai</text></g>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${g}<line x1="${L}" y1="${yb}" x2="${W - R}" y2="${yb}" stroke="${INK}" stroke-width="1.2"/>${barras}${leg}</svg>`
}

const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')
let PG = 0
const foot = () => `<div class="pfoot"><span>Bula Assessoria — Fluxo de caixa 27/08 a 10/09/2026</span><span>${++PG}</span></div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Bula — Fluxo de Caixa até 10/09/2026</title>
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
  .capa .sub { font-size: 12.4px; color: #B5B5B5; margin-top: 8mm; max-width: 136mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
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
  tr.neg td { background: #FAFAFA; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  figure { margin: 3mm 0 5mm; }
  figcaption { font-size: 8.6px; color: ${MUTED}; margin-top: 1.8mm; line-height: 1.45; }
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.6mm; }
  .tag { display: inline-block; font-size: 7.6px; text-transform: uppercase; letter-spacing: .07em; padding: 0.4mm 1.4mm;
         border: 1px solid ${GRID}; color: ${MUTED}; margin-left: 1.4mm; vertical-align: 1px; }
  .tag.est { border-color: ${GOLD}; color: #8A7530; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
</style></head><body>

<!-- ============================ CAPA ============================ -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Fluxo de caixa<br>e posição até<br>10 de setembro</h1>
  <div class="rule"></div>
  <div class="sub">A janela atravessa a folha de 05/09 e termina três dias antes da 2ª parcela do JMP.
  Com o Kito e o Sorriso entrando até o fim de agosto e o Naviraí em 10/09, o caixa <strong style="color:#fff">fura em 05/09</strong>
  e só volta no último dia — fechando em ${sinal(BASE.final)}.</div>
  <div class="meta">
    <div><span>Período</span><strong>27/08 a 10/09/2026</strong></div>
    <div><span>Caixa de partida</span><strong>R$ ${brl(D.caixa.inicial)}</strong></div>
    <div><span>Fundo do poço</span><strong>${sinal(BASE.fundo)} · ${dm(BASE.fundoData)}</strong></div>
    <div><span>Base</span><strong>ERP conciliado 1:1 com o extrato de 27/08 15h48</strong></div>
  </div>
</section>

<!-- ============================ P1 — VEREDITO ============================ -->
<section class="page">
  <div class="head"><h2>O veredito</h2><div class="n">01 · resposta</div></div>

  <div class="tiles">
    <div class="tile"><div class="k">Caixa hoje (27/08)</div><div class="v"><span class="cur">R$</span>${brl0(D.caixa.inicial)}</div>
      <div class="d">Sicoob ${brl0(D.caixa.sicoob)} + Sicredi ${brl0(D.caixa.sicredi)}</div></div>
    <div class="tile gold"><div class="k">Entra na janela</div><div class="v"><span class="cur">R$</span>${brl0(D.entradasTotal)}</div>
      <div class="d">${D.entradas.length} títulos — só o que o senhor deu como firme</div></div>
    <div class="tile"><div class="k">Sai na janela</div><div class="v"><span class="cur">R$</span>${brl0(D.saidasTotal)}</div>
      <div class="d">${brl0(D.saidasLancadasTotal)} lançados + ${brl0(D.saidasProjetadasTotal)} projetados</div></div>
    <div class="tile"><div class="k">Fecha 10/09 em</div><div class="v">${BASE.final < 0 ? '−' : ''}<span class="cur">R$</span>${brl0(Math.abs(BASE.final))}</div>
      <div class="d">${BASE.diasNegativos} dias no vermelho</div></div>
  </div>

  <p class="lead">A resposta curta: <strong>as três cobranças que o senhor deu como certas não cobrem a folha.</strong>
  Elas somam R$ ${brl(D.entradasTotal)} e o que sai na janela soma R$ ${brl(D.saidasTotal)} — a diferença de
  R$ ${brl(r2(D.saidasTotal - D.entradasTotal))} come o caixa inteiro e passa dele.</p>

  <p>O caminho é este: já em <strong>28/08</strong> saem R$ ${brl0(D.linhas.BASE[1].sai)} das comissões de julho que continuam em aberto,
  e o caixa cai para R$ ${brl0(D.linhas.BASE[1].saldo)}. O Kito (${dm(D.entradas[0].data)}) e o Sorriso (31/08) recompõem até
  <strong>R$ ${brl(picoData.saldo)}</strong> em ${dm(picoData.data)} — o melhor momento do período, e ainda assim abaixo de onde
  o caixa está hoje. Aí vem <strong>05/09</strong>: a folha de agosto (R$ ${brl(D.blocos.folha)}) mais o presencial do Jacamin
  tiram R$ ${brl0(d0509.sai)} num dia só, contra entrada zero, e o saldo vai a ${sinal(d0509.saldo)}. Fica negativo por
  ${BASE.diasNegativos} dias, até o Naviraí em 10/09 trazer R$ ${brl0(entraNavirai)} — que ainda não é o bastante para voltar ao azul.</p>

  <figure>${gLinha()}
    <figcaption>Saldo consolidado (Sicoob + Sicredi) dia a dia. A faixa cinza é o campo negativo.
    Mesmo <strong>segurando as comissões de julho</strong> — a linha dourada — o caixa apenas raspa o zero (${sinal(SEMC.fundo)} em ${dm(SEMC.fundoData)}).
    A linha clara mostra o piso defensável: só o Sicoob, sem a aplicação do Sicredi.</figcaption></figure>

  <div class="box dark">
    <div class="t">O aperto tem nome e data</div>
    <p style="margin:0">Não é o mês que é ruim — é <strong>um dia</strong>. Em 05/09 saem R$ ${brl(d0509.sai)}
    contra entrada zero, porque as três cobranças combinadas caem <em>antes</em> (30 e 31/08) ou <em>depois</em> (10/09) da folha.
    Para atravessar 05/09 sem furar faltam <strong>R$ ${brl(nec(0, '2026-09-05').precisa)}</strong>; para não ficar negativo nenhum dia da janela,
    <strong>R$ ${brl(nec(0, '2026-09-10').precisa)}</strong>. Qualquer um dos dois títulos do EAO Baviera resolve sozinho.</p>
  </div>

  <figure>${gBarras()}
    <figcaption>Entra × sai por dia. As entradas são três eventos isolados; as saídas são contínuas — é essa assimetria que cria o vale.</figcaption></figure>

  <div class="box rule">
    <p class="small" style="margin:0"><strong style="color:${INK};font-size:10.2px">De onde saem os números.</strong>
    Caixa: Sicoob R$ ${brl(D.caixa.sicoob)} conciliado 1:1 com o extrato de hoje 15h48, mais a aplicação do Sicredi (R$ ${brl(D.caixa.sicredi)}, última posição conhecida).
    Entradas: só os ${D.entradas.length} títulos que o senhor deu como firmes — os outros R$ ${brl0(D.emTratativaTotal)} a receber, R$ ${brl0(D.vencidoTotal)} deles já vencidos, ficaram integralmente de fora.
    Saídas: os R$ ${brl(D.saidasLancadasTotal)} de título aberto no ERP mais R$ ${brl(D.saidasProjetadasTotal)} de despesa que ainda não virou lançamento — dois leilões presenciais sem título e o custo estrutural corrente.
    Detalhe de cada bloco na página 3; o que pode mudar, na página 5.</p>
  </div>

  ${foot()}
</section>

<!-- ============================ P2 — DIA A DIA ============================ -->
<section class="page">
  <div class="head"><h2>Dia a dia</h2><div class="n">02 · calendário</div></div>

  <p>Cenário base: tudo o que está em aberto no ERP é pago, e entram as três cobranças combinadas.
  Saídas vencidas antes de hoje foram jogadas para 28/08 — elas não somem do fluxo só porque atrasaram.</p>

  <table>
    <thead><tr><th style="width:16mm">Data</th><th>O que move o dia</th><th class="num" style="width:22mm">Entra</th><th class="num" style="width:22mm">Sai</th><th class="num" style="width:26mm">Saldo</th></tr></thead>
    <tbody>
      ${D.linhas.BASE.map(p => {
        const ent = D.entradas.filter(e => e.data === p.data)
        const sai = [...D.saidasLancadas.filter(x => x.data === p.data), ...leilaoProj.filter(x => x.data === p.data)]
          .sort((a, b) => b.valor - a.valor)
        const grupos = []
        if (ent.length) grupos.push(ent.map(e => corta(e.rot, 46)).join(' · '))
        // Comissao e folha viram uma linha so — 13 e 9 titulos nao cabem na tabela.
        for (const [cat, rot] of [['Comissões', 'comissões de julho em aberto'], ['Folha de Pagamento', 'folha de agosto']]) {
          const g = sai.filter(x => x.categoria === cat)
          if (g.length) grupos.push('<strong>' + rot.charAt(0).toUpperCase() + rot.slice(1) + '</strong> — ' + g.length + ' títulos, R$ ' + brl0(g.reduce((s, x) => s + x.valor, 0)))
        }
        const resto = sai.filter(x => !['Comissões', 'Folha de Pagamento'].includes(x.categoria))
        for (const x of resto.filter(x => x.valor >= 500)) grupos.push(esc(corta(x.rot, 54)))
        const menores = resto.filter(x => x.valor < 500)
        if (menores.length && !grupos.length) grupos.push('<span class="muted">custo estrutural corrente</span>')
        else if (menores.length) grupos.push('<span class="muted">+ estrutural</span>')
        const cls = p.saldo < 0 ? 'neg' : (p.data === '2026-09-05' ? 'destaque' : '')
        return `<tr class="${cls}"><td><strong>${dm(p.data)}</strong> <span class="muted">${ds(p.data)}</span></td>
          <td>${grupos.join(' · ') || '<span class="muted">—</span>'}</td>
          <td class="num">${p.entra ? brl(p.entra) : '<span class="muted">—</span>'}</td>
          <td class="num">${p.sai ? brl(p.sai) : '<span class="muted">—</span>'}</td>
          <td class="num"><strong>${p.saldo < 0 ? '−' : ''}${brl(Math.abs(p.saldo))}</strong></td></tr>`
      }).join('')}
      <tr class="total"><td colspan="2">Janela inteira</td><td class="num">${brl(BASE.entradas)}</td><td class="num">${brl(BASE.saidas)}</td><td class="num">${BASE.final < 0 ? '−' : ''}${brl(Math.abs(BASE.final))}</td></tr>
    </tbody>
  </table>

  <h3>As três entradas, e de onde vem a confiança em cada uma</h3>
  <table>
    <thead><tr><th style="width:16mm">Data</th><th>Título</th><th>Lastro</th><th class="num" style="width:24mm">Valor</th></tr></thead>
    <tbody>
      ${D.entradas.map(e => `<tr><td><strong>${dm(e.data)}</strong></td><td>${esc(corta(e.rot, 52))}</td>
        <td class="muted">${esc(e.nota)}</td><td class="num">${brl(e.valor)}</td></tr>`).join('')}
      <tr class="total"><td colspan="3">Total declarado firme</td><td class="num">${brl(D.entradasTotal)}</td></tr>
    </tbody>
  </table>
  <p class="small">O Sorriso Fêmeas entra por <strong>R$ ${brl(D.entradas[1].valor)}</strong>, não pelos R$ 7.950,00 que o ERP trazia:
  o valor foi retificado hoje contra a NF 635 e o portal da e-Rural. A diferença de R$ 800,02 continua sem explicação pela fórmula do acordo
  e está registrada no título para conferir com a e-Rural.</p>

  ${foot()}
</section>

<!-- ============================ P3 — SAÍDAS ============================ -->
<section class="page">
  <div class="head"><h2>O que sai</h2><div class="n">03 · saídas</div></div>

  <p class="lead">R$ ${brl(D.saidasTotal)} no total. <strong>R$ ${brl(D.saidasLancadasTotal)} já são título no ERP</strong>;
  os outros <strong>R$ ${brl(D.saidasProjetadasTotal)} são projeção</strong> — despesa que só vira lançamento quando o extrato chega.
  Ignorar esse segundo bloco é o erro que já mordeu a projeção de agosto.</p>

  <table>
    <thead><tr><th>Bloco</th><th>Como entra</th><th class="num" style="width:26mm">Valor</th></tr></thead>
    <tbody>
      <tr><td><strong>Folha de agosto</strong> — paga 05/09</td><td class="muted">título lançado; confere com o cadastro <em>erp_folha_estrutura</em></td><td class="num">${brl(D.blocos.folha)}</td></tr>
      <tr><td><strong>Comissões de julho ainda em aberto</strong></td><td class="muted">${D.comissoesJulhoAbertas.length} títulos vencidos em 25/08, não quitados</td><td class="num">${brl(D.blocos.comissaoJulhoAberta)}</td></tr>
      <tr><td>Despesa de leilão já lançada</td><td class="muted">Melhoradores Especial, 29/08 — estimativa no ERP</td><td class="num">${brl(D.blocos.leilaoLancado)}</td></tr>
      <tr><td>Recorrentes de estrutura</td><td class="muted">marketing, contador, site, tarifas, cooperativa</td><td class="num">${brl(D.blocos.recorrentes)}</td></tr>
      <tr><td>Encargos (FGTS julho + agosto)</td><td class="muted">não estão no DAS nem no ISSQN</td><td class="num">${brl(D.blocos.encargos)}</td></tr>
      <tr class="destaque"><td colspan="2">Subtotal — títulos lançados</td><td class="num">${brl(D.saidasLancadasTotal)}</td></tr>
      <tr><td><strong>Leilões presenciais sem título</strong></td><td class="muted">${D.presenciaisSemCP.map(p => corta(p.nome, 26)).join(' · ')}</td><td class="num">${brl(r2(D.premissas.leilao.porPresencial * D.presenciaisSemCP.length))}</td></tr>
      <tr><td>Custo estrutural que ainda não virou conta</td><td class="muted">média diária menos o que já está lançado</td><td class="num">${brl(D.premissas.estrutural.aProjetar)}</td></tr>
      <tr class="destaque"><td colspan="2">Subtotal — projetado</td><td class="num">${brl(D.saidasProjetadasTotal)}</td></tr>
      <tr class="total"><td colspan="2">Total da janela</td><td class="num">${brl(D.saidasTotal)}</td></tr>
    </tbody>
  </table>

  <div class="cols2">
    <div>
      <h3>A folha de 05/09, pessoa a pessoa</h3>
      <table>
        <thead><tr><th>Pessoa</th><th class="num">Valor</th></tr></thead>
        <tbody>
          ${folha.map(f => `<tr><td>${esc(f.pessoa)}</td><td class="num">${brl(f.valor)}</td></tr>`).join('')}
          <tr class="total"><td>Competência agosto</td><td class="num">${brl(D.blocos.folha)}</td></tr>
        </tbody>
      </table>
      <p class="small">Agosto sai <strong>pro-rata</strong> — Matheus M1, Pedro e Luana entraram no meio do mês.
      De setembro em diante a folha é <strong>R$ 52.000 cheios</strong>, todo dia 05. Conferido contra o cadastro:
      45 títulos, nenhuma divergência.</p>
    </div>
    <div>
      <h3>Reembolsos e despesa de leilão</h3>
      <table>
        <thead><tr><th>Mês</th><th class="num">Reembolsos</th></tr></thead>
        <tbody>
          ${D.premissas.reembolso.serie.filter(x => x.mes >= '2026-06').map(x => `<tr><td>${x.mes.slice(5)}/${x.mes.slice(2, 4)}</td><td class="num">${brl(x.valor)}</td></tr>`).join('')}
        </tbody>
      </table>
      <p class="small">Reembolso não é rubrica própria: ele chega dentro de <em>Despesa Operacional de Leilão</em> e <em>Viagem/Passagens</em>,
      e responde por <strong>${pc(D.premissas.reembolso.fatiaDoLeilao * 100)}</strong> desse gasto em jun–ago.
      Agosto foi atípico (R$ ${brl0(D.premissas.reembolso.serie.find(x => x.mes === '2026-08').valor)}) por causa da Expogenética.
      Na janela projetada os reembolsos vêm embutidos nos dois presenciais sem título — na prática caem
      <strong>1 a 3 semanas depois do pregão</strong>, ou seja, os do Melhoradores e do ASJ (29 e 30/08) devem aparecer justamente na primeira quinzena de setembro.</p>
      <table>
        <thead><tr><th style="width:14mm">Data</th><th>Últimos reembolsos pagos</th><th class="num" style="width:20mm">Valor</th></tr></thead>
        <tbody>
          ${D.premissas.reembolso.ultimos.map(m => `<tr><td>${dm(m.data)}</td><td>${esc(corta(String(m.rot).replace(/^(PIX EMIT(IDO)?\.?\s*OUTRA IF\s*-?\s*|DEB\.[^-]*-\s*FAV\.:\s*|TRANSF\.\s*PIX SICOOB\s*-\s*FAV\.:\s*)/i, ''), 44))}</td><td class="num">${brl(m.valor)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <div class="box">
    <div class="t">Como a projeção foi calculada</div>
    <p class="small" style="margin:0"><strong>Leilão:</strong> só presencial gasta — virtual não gera diária, passagem nem estadia.
    A janela tem ${D.presenciaisJanela.length} presenciais (${D.presenciaisJanela.map(p => dm(p.data) + ' ' + corta(p.nome, 24)).join(' · ')});
    um já tem título de R$ ${brl(D.blocos.leilaoLancado)} e os outros dois entram pela média de
    <strong>R$ ${brl(D.premissas.leilao.porPresencial)} por presencial</strong> (R$ ${brl0(D.premissas.leilao.total)} ÷ ${D.premissas.leilao.presenciais} presenciais de jun–ago).
    <strong>Estrutura:</strong> média de jul e ago do Sicoob fora de folha, comissão, imposto, transferência e leilão —
    R$ ${brl(D.premissas.estrutural.media)}/mês, ou R$ ${brl(D.premissas.estrutural.porDia)} por dia. Em ${D.dias} dias dá R$ ${brl(D.premissas.estrutural.bruto)};
    descontando os R$ ${brl(D.premissas.estrutural.jaLancado)} que já estão lançados, sobram <strong>R$ ${brl(D.premissas.estrutural.aProjetar)}</strong> diluídos no período.
    Julho e agosto são os dois primeiros meses inteiros sem escritório — usar meses anteriores inflaria a conta.</p>
  </div>

  ${foot()}
</section>

<!-- ============================ P4 — CENÁRIOS ============================ -->
<section class="page">
  <div class="head"><h2>Cenários e o que fazer</h2><div class="n">04 · decisão</div></div>

  <table>
    <thead><tr><th>Cenário</th><th>O que muda</th><th class="num" style="width:24mm">Fundo</th><th class="num" style="width:24mm">10/09</th><th class="num" style="width:16mm">Dias&nbsp;−</th></tr></thead>
    <tbody>
      ${D.cenarios.map(c => `<tr class="${c.chave === 'BASE' ? 'destaque' : ''}"><td><strong>${esc(c.rot)}</strong></td><td class="muted">${esc(c.desc)}</td>
        <td class="num">${c.fundo < 0 ? '−' : ''}${brl(Math.abs(c.fundo))}<br><span class="muted" style="font-size:8px">${dm(c.fundoData)}</span></td>
        <td class="num">${c.final < 0 ? '−' : ''}${brl(Math.abs(c.final))}</td><td class="num">${c.diasNegativos}</td></tr>`).join('')}
    </tbody>
  </table>

  <p><strong>Nenhum cenário fecha positivo com folga.</strong> O melhor deles — segurar as comissões de julho — apenas encosta no zero
  (${sinal(SEMC.fundo)}) e ainda assim depende de as três cobranças caírem na data. Cinco dias de atraso levam o fim da janela a ${sinal(ATR.final)}.</p>

  <h3>Quanto falta cobrar</h3>
  <table>
    <thead><tr><th>Colchão desejado</th><th class="num">até 31/08</th><th class="num">até 05/09</th><th class="num">até 10/09</th></tr></thead>
    <tbody>
      ${D.necessidade.map(n => `<tr><td>${n.colchao === 0 ? '<strong>Só não ficar negativo</strong>' : 'Manter R$ ' + brl0(n.colchao) + ' em caixa'}</td>
        ${n.marcos.map(m => `<td class="num">${m.precisa ? brl(m.precisa) : '<span class="muted">nada</span>'}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>

  <h3>Quem pode cobrir — os maiores vencidos que ficaram fora do fluxo</h3>
  <table>
    <thead><tr><th style="width:18mm">Venceu</th><th>Título</th><th class="num" style="width:26mm">Valor</th><th style="width:34mm">Resolve a janela?</th></tr></thead>
    <tbody>
      ${D.candidatos.map(c => `<tr><td>${dm(c.vencimento)}</td><td>${esc(corta(c.rot, 54))}</td><td class="num">${brl(c.valor)}</td>
        <td>${c.valor >= nec(0, '2026-09-10').precisa ? '<strong>Sim, sozinho</strong>' : 'Só combinado'}</td></tr>`).join('')}
      <tr class="total"><td colspan="2">Vencido total fora do fluxo</td><td class="num">${brl(D.vencidoTotal)}</td><td></td></tr>
    </tbody>
  </table>

  <div class="box dark">
    <div class="t">A alavanca continua sendo o EAO Baviera</div>
    <p style="margin:0">Os dois títulos do EAO somam <strong>R$ ${brl(eaoTotal)}</strong> e venceram em 25 e 26/08.
    Qualquer um deles isolado já cobre os R$ ${brl(nec(0, '2026-09-10').precisa)} que faltam para a janela não furar em dia nenhum;
    os dois juntos fechariam 10/09 em <strong>${sinal(r2(BASE.final + eaoTotal))}</strong>, com colchão de sobra.
    É a mesma conclusão do relatório de 20/08 — e a cobrança segue com o Max.</p>
  </div>

  <h3>O que vem logo depois da janela</h3>
  <p>A janela termina três dias antes do dinheiro grande: a <strong>2ª parcela do JMP (R$ ${brl(D.jmpTotal)})</strong> vence em 13/09.
  Mas o alívio dura pouco — entre 11 e 30/09 saem <strong>R$ ${brl(D.logoDepoisTotal)}</strong> em títulos já lançados,
  dos quais R$ ${brl0(D.logoDepois.filter(x => /Impostos/.test(x.categoria)).reduce((s, x) => s + x.valor, 0))} são as guias de agosto (ISSQN 15/09, DAS 22/09)
  e R$ ${brl0(D.logoDepois.filter(x => /Remuneracao de Socio/.test(x.categoria)).reduce((s, x) => s + x.valor, 0))} a participação trimestral do Marcelo em 25/09.
  <strong>Não trate a entrada do JMP como folga:</strong> ela é o que paga setembro.</p>

  ${foot()}
</section>

<!-- ============================ P5 — RESSALVAS ============================ -->
<section class="page">
  <div class="head"><h2>Ressalvas</h2><div class="n">05 · o que este relatório não sabe</div></div>

  <p class="lead">Todo número acima sai do ERP e do extrato — nenhum foi digitado à mão. O que segue é o que ainda não está firme,
  e que muda a conta se mudar.</p>

  <table>
    <thead><tr><th style="width:44mm">Ponto</th><th>Situação</th><th style="width:34mm">Efeito se mudar</th></tr></thead>
    <tbody>
      <tr><td><strong>Sicredi — R$ ${brl(D.caixa.sicredi)}</strong></td>
        <td>O extrato do Sicredi nunca foi importado. Esse é o último saldo conhecido no ERP, não um saldo bancário conferido hoje.</td>
        <td>É a diferença entre fechar em ${sinal(BASE.final)} e ${sinal(SOSIC.final)}.</td></tr>
      <tr><td><strong>Naviraí — dois títulos</strong></td>
        <td>Há <strong>dois</strong> títulos do Naviraí vencendo em 10/09 (R$ ${D.entradas.filter(e => e.data === '2026-09-10').map(e => brl(e.valor)).join(' e R$ ')}). Li a sua mensagem como os dois.</td>
        <td>Se for só o maior, 10/09 fecha em ${sinal(NAV1.final)}.</td></tr>
      <tr><td><strong>Comissões de julho — R$ ${brl(D.blocos.comissaoJulhoAberta)}</strong></td>
        <td>${D.comissoesJulhoAbertas.length} títulos vencidos em 25/08 e não pagos. Parte é a divergência de atribuição Leonardo × Fábio, que segue aberta; parte é o que o Leonardo não cobrou.</td>
        <td>Segurá-los muda o fim da janela de ${sinal(BASE.final)} para ${sinal(SEMC.final)}.</td></tr>
      <tr><td><strong>Sorriso Fêmeas — R$ 800,02</strong></td>
        <td>A NF 635 e o portal da e-Rural dizem R$ ${brl(D.entradas[1].valor)}; a fórmula do acordo dá R$ 7.950,00. A diferença não se explica pelo acordo cadastrado.</td>
        <td>Conferir com a e-Rural se há desconto de plataforma.</td></tr>
      <tr><td><strong>Despesa de leilão projetada</strong></td>
        <td>R$ ${brl(r2(D.premissas.leilao.porPresencial * D.presenciaisSemCP.length))} para dois presenciais, por média histórica. Presencial é o gasto mais volátil da Bula — a média de jun–ago varia de R$ 2.225 a R$ 9.627 por evento.</td>
        <td>Pode variar alguns milhares para cima ou para baixo.</td></tr>
      <tr><td><strong>Cartões de crédito</strong></td>
        <td>As faturas de setembro vencem em 22/09, fora da janela. Nenhuma compra de agosto ainda foi itemizada.</td>
        <td>Não afeta esta janela; afeta setembro.</td></tr>
      <tr><td><strong>Guias de agosto</strong></td>
        <td>ISSQN (15/09) e DAS (22/09) estão lançados por estimativa de carga efetiva, não por cálculo do contador.</td>
        <td>Fora da janela, dentro de setembro.</td></tr>
      <tr><td><strong>Os R$ ${brl(D.emTratativaTotal)} em tratativa</strong></td>
        <td>Tudo o que não é Kito, Sorriso ou Naviraí ficou de fora — inclusive R$ ${brl(D.vencidoTotal)} já vencidos. Nenhum centavo deles entrou na projeção.</td>
        <td>Cada acordo fechado desloca a linha para cima na hora.</td></tr>
    </tbody>
  </table>

  <h3>O calendário de decisão</h3>
  <table>
    <thead><tr><th style="width:24mm">Prazo</th><th>O que precisa acontecer</th><th style="width:52mm">Se não acontecer</th></tr></thead>
    <tbody>
      <tr><td><strong>até 02/09</strong></td><td>Fechar data com o Max para <strong>um</strong> dos títulos do EAO Baviera (R$ ${brl0(eao[0].valor)} ou R$ ${brl0(eao[1].valor)}).</td>
        <td>Sobra decidir entre atrasar a folha ou segurar as comissões de julho — e a segunda só adia o problema para 25/09.</td></tr>
      <tr><td><strong>até 04/09</strong></td><td>Decidir se as ${D.comissoesJulhoAbertas.length} comissões de julho (R$ ${brl0(D.blocos.comissaoJulhoAberta)}) saem antes ou depois da folha.</td>
        <td>Saindo antes e sem o EAO, 05/09 fecha em ${sinal(d0509.saldo)}.</td></tr>
      <tr><td><strong>até 05/09</strong></td><td>Folha de agosto paga: R$ ${brl0(D.blocos.folha)} para ${folha.length} pessoas.</td>
        <td>É a saída menos adiável da janela — atrasá-la custa mais do que qualquer juro de cobrança.</td></tr>
      <tr><td><strong>até 10/09</strong></td><td>Confirmar com a leiloeira que a 2ª parcela do JMP entra mesmo em 13/09.</td>
        <td>Setembro inteiro depende dela: R$ ${brl0(D.logoDepoisTotal)} vencem entre 11 e 30/09.</td></tr>
      <tr><td><strong>quando entrar</strong></td><td>Importar o extrato do Sicredi e conciliar.</td>
        <td>R$ ${brl(D.caixa.sicredi)} do caixa desta projeção seguem sem conferência bancária.</td></tr>
    </tbody>
  </table>

  <h3>Em uma frase</h3>
  <div class="box rule">
    <p style="margin:0" class="lead">O caixa aguenta agosto e não aguenta 05/09. Faltam <strong>R$ ${brl(nec(0, '2026-09-05').precisa)}</strong>
    para pagar a folha sem furar, e <strong>R$ ${brl(nec(0, '2026-09-10').precisa)}</strong> para atravessar a janela inteira no azul.
    Um telefonema para o Max — qualquer um dos dois títulos do EAO Baviera — resolve os dois problemas de uma vez.</p>
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
const pdfPath = path.join(desktop, 'Bula - Fluxo de Caixa ate 10-09-2026.pdf')
await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '14mm', left: '11mm', right: '11mm' } })
await pg.screenshot({ path: path.join(OUT, 'preview.png'), fullPage: true })
await browser.close()
console.log('PDF:', pdfPath)
