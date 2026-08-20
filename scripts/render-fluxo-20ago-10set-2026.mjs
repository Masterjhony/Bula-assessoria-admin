/**
 * Renderiza o relatorio de fluxo de caixa 20/08 -> 10/09/2026 a partir de
 * outputs/fluxo-20ago-10set-2026/dados.json. Paleta monocromatica do brandbook.
 * Gera HTML + PDF A4 na Area de Trabalho. Nenhum numero escrito a mao.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { chromium } from 'playwright'

const OUT = 'outputs/fluxo-20ago-10set-2026'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pc = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
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
const sinal = n => (n < 0 ? '−R$ ' + brl(Math.abs(n)) : 'R$ ' + brl(n))

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C'
const cen = k => D.cenarios.find(c => c.chave === k)
const PISO = cen('FIRME'), NOM = cen('NOMINAL'), ADIA = cen('ADIA'), EAO = cen('EAO'), REM5 = cen('REM5')
const nec = (rot, ate) => D.necessidade.find(n => n.rot.startsWith(rot)).linha.find(x => x.ate === ate).precisa
const necZero = ate => D.necessidade[0].linha.find(x => x.ate === ate).precisa
const nec30 = ate => D.necessidade[1].linha.find(x => x.ate === ate).precisa
const necSic = ate => D.necessidade[1].linha.find(x => x.ate === ate).precisa
const necAdia = ate => D.necessidade[3].linha.find(x => x.ate === ate).precisa
void nec
const eaoTotal = D.concentracao.find(g => g.grupo === 'EAO Baviera').valor
const semData = D.receber.filter(x => !x.firme)
const firmes = D.receber.filter(x => x.firme)
const totalCorrente = r2(D.residuos.reduce((s, x) => s + x.residuo, 0))
const capZero = D.capacidade.find(c => c.colchao === 0)
const cap10 = D.capacidade.find(c => c.colchao === 10000)

/* ============ G1 — a linha do saldo nos cenarios ============ */
function gLinha() {
  const W = 760, H = 288, L = 60, R = 96, T = 20, B = 40
  const series = [
    { k: 'EAO', src: 'linhasSic', rot: 'Piso + EAO Baviera', cor: GOLD, dash: '4 2', w: 1.8 },
    { k: 'FIRME', src: 'linhasSic', rot: 'Sicoob + Sicredi', cor: '#8C8C8C', dash: '3 2', w: 1.9 },
    { k: 'FIRME', src: 'linhas', rot: 'Só o Sicoob', cor: INK, dash: '', w: 2.2 },
  ]
  const pts = D.linhas.FIRME
  const todos = series.flatMap(s => D[s.src][s.k].map(p => p.saldo))
  const max = Math.max(...todos, 0) * 1.1, min = Math.min(...todos) * 1.18
  const x = i => L + i * (W - L - R) / (pts.length - 1)
  const y = v => T + (H - T - B) * (1 - (v - min) / (max - min))
  let grid = ''
  for (let i = 0; i <= 4; i++) {
    const v = min + (max - min) * i / 4, yy = y(v)
    grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    grid += `<text x="${L - 8}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="${MUTED}">${kk(v)}</text>`
  }
  const y0 = y(0)
  grid += `<line x1="${L}" y1="${y0.toFixed(1)}" x2="${W - R}" y2="${y0.toFixed(1)}" stroke="${INK}" stroke-width="1.1"/>`
  const iCom = pts.findIndex(p => p.data === '2026-08-25')
  const iFol = pts.findIndex(p => p.data === '2026-09-05')
  let marcos = ''
  for (const [i, rot] of [[iCom, 'comissões'], [iFol, 'folha']]) {
    marcos += `<line x1="${x(i).toFixed(1)}" y1="${T}" x2="${x(i).toFixed(1)}" y2="${H - B}" stroke="${GOLD}" stroke-width="1" stroke-dasharray="2 2"/>`
    marcos += `<text x="${(x(i) + 3).toFixed(1)}" y="${T + 9}" font-size="8.6" fill="#8A7530">${rot}</text>`
  }
  const linha = s => D[s.src][s.k].map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' ')
  const paths = series.map(s => `<path d="${linha(s)}" fill="none" stroke="${s.cor}" stroke-width="${s.w}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>`).join('')
  const rot = series.map(s => {
    const arr = D[s.src][s.k]
    const last = arr[arr.length - 1]
    return `<text x="${W - R + 5}" y="${(y(last.saldo) + 3).toFixed(1)}" font-size="8.6" font-weight="600" fill="${s.cor}">${esc(s.rot)}</text>
            <text x="${W - R + 5}" y="${(y(last.saldo) + 13).toFixed(1)}" font-size="8.2" fill="${MUTED}">${kk(last.saldo)}</text>`
  }).join('')
  const eixo = pts.map((p, i) => (i % 3 === 0 || i === pts.length - 1)
    ? `<text x="${x(i).toFixed(1)}" y="${H - B + 15}" text-anchor="middle" font-size="9" fill="${MUTED}">${dm(p.data)}</text>` : '').join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Saldo diário do Sicoob de 20 de agosto a 10 de setembro em três cenários de cobrança">
    ${grid}${marcos}${paths}${rot}${eixo}</svg>`
}

/* ============ G2 — de onde vem e para onde vai o dinheiro da janela ============ */
function gBalanco() {
  const W = 760, H = 188, T = 26, bh = 30, gap = 20
  const ent = [
    { rot: 'Com data acordada', v: D.firmeza.firme, f: INK },
    { rot: 'Sem data acordada (cobrança a fazer)', v: D.firmeza.semData, f: '#DCDCDC' },
  ]
  const sai = D.pagarPorBucket.map((b, i) => ({
    rot: { comissao: 'Comissões de julho', folha: 'Folha de agosto', imposto: 'FGTS em atraso', corrente: 'Cartões, viagens, operação' }[b.bucket],
    v: b.valor, f: ['#0A0A0A', '#3D3D3D', '#8C8C8C', '#C4C4C4'][i],
  })).filter(x => x.v > 0)
  sai.push({ rot: 'Custo corrente não lançado (média)', v: totalCorrente, f: '#E4E4E4', est: true })
  sai.push({ rot: 'FGTS de agosto (estimado)', v: D.encargos.fgts, f: '#EFEFEF', est: true })
  const totE = ent.reduce((s, x) => s + x.v, 0), totS = sai.reduce((s, x) => s + x.v, 0)
  const esc0 = W / Math.max(totE, totS)
  const barra = (arr, yy, tot, rotulo) => {
    let x = 0, out = `<text x="0" y="${yy - 6}" font-size="9" fill="${MUTED}">${rotulo} — R$ ${brl0(tot)}</text>`
    for (const s of arr) {
      const w = s.v * esc0
      out += `<rect x="${x.toFixed(1)}" y="${yy}" width="${Math.max(w, 0.6).toFixed(1)}" height="${bh}" fill="${s.f}"/>`
      if (w > 74) {
        const claro = ['#DCDCDC', '#C4C4C4', '#E4E4E4', '#EFEFEF'].includes(s.f)
        out += `<text x="${(x + 6).toFixed(1)}" y="${yy + 13}" font-size="9.4" font-weight="700" fill="${claro ? INK : '#fff'}">${kk(s.v)}</text>`
        out += `<text x="${(x + 6).toFixed(1)}" y="${yy + 24}" font-size="7.9" fill="${claro ? MUTED : '#C8C8C8'}">${esc(corta(s.rot, Math.floor(w / 4.4)))}</text>`
      }
      x += w
    }
    return out
  }
  const ocultos = sai.filter(s => s.v * esc0 <= 74)
  const leg = ocultos.map((s, i) =>
    `<g transform="translate(${(i % 2) * 386},${H - 16 + Math.floor(i / 2) * 13})"><rect x="0" y="-8" width="12" height="8" fill="${s.f}" stroke="${GRID}"/>
     <text x="17" y="-1" font-size="8.4" fill="${MUTED}">${esc(s.rot)} — R$ ${brl0(s.v)}</text></g>`).join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Comparação entre o que a Bula tem a receber e o que tem a pagar entre 20 de agosto e 10 de setembro">
    ${barra(ent, T, totE, 'ENTRA — o que está datado no período')}
    ${barra(sai, T + bh + gap + 14, totS, 'SAI — o que está comprometido no período')}
    ${leg}</svg>`
}

/* ============ G3 — concentracao da cobranca ============ */
function gConcentracao() {
  const its = D.concentracao
  const W = 760, rh = 19, T = 4, L = 132, H = T + its.length * rh + 12
  const max = Math.max(...its.map(i => i.valor))
  const esc1 = (W - L - 96) / max
  const rows = its.map((g, i) => {
    const y = T + i * rh
    const wF = g.firme * esc1, wC = g.aCobrar * esc1
    return `<text x="${L - 8}" y="${y + 12}" text-anchor="end" font-size="9.2" fill="${INK}">${esc(g.grupo)}</text>
      <rect x="${L}" y="${y + 3}" width="${wF.toFixed(1)}" height="12" fill="${INK}"/>
      <rect x="${(L + wF).toFixed(1)}" y="${y + 3}" width="${wC.toFixed(1)}" height="12" fill="#DCDCDC"/>
      <text x="${(L + wF + wC + 6).toFixed(1)}" y="${y + 12.5}" font-size="8.8" fill="${MUTED}">R$ ${brl0(g.valor)} · ${pc(g.pct)}</text>`
  }).join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Quanto cada leiloeira responde do que a Bula tem a receber no período">
    ${rows}
    <g transform="translate(${L},${H - 2})"><rect x="0" y="-8" width="12" height="8" fill="${INK}"/>
      <text x="17" y="-1" font-size="8.4" fill="${MUTED}">data acordada</text>
      <rect x="112" y="-8" width="12" height="8" fill="#DCDCDC"/>
      <text x="129" y="-1" font-size="8.4" fill="${MUTED}">a cobrar</text></g></svg>`
}

const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')
const foot = () => `<div class="pfoot"><span>Bula Assessoria Pecuária — documento interno</span><span>Fluxo de caixa 20/08 a 10/09/2026 · gerado em 20/08/2026</span></div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Fluxo de Caixa — 20/08 a 10/09/2026</title>
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
  .capa .sub { font-size: 12.4px; color: #B5B5B5; margin-top: 8mm; max-width: 134mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
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
  .tag { display: inline-block; font-size: 7.6px; text-transform: uppercase; letter-spacing: .07em; padding: 0.4mm 1.4mm;
         border: 1px solid ${GRID}; color: ${MUTED}; margin-left: 1.4mm; vertical-align: 1px; }
  .tag.est { border-color: ${GOLD}; color: #8A7530; }
  .tag.ok { border-color: ${INK}; color: ${INK}; }
</style></head><body>

<!-- ============ CAPA ============ -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Fluxo de caixa<br>20/08 a 10/09</h1>
  <div class="rule"></div>
  <div class="sub">Dá para pagar as comissões de julho em 25/08 e a folha de agosto em 05/09? <strong style="color:#fff">As comissões passam usando a reserva do Sicredi. A folha, não</strong> — falta R$ ${brl0(D.necessidade[1].linha.find(x => x.ate === '2026-09-05').precisa)} de cobrança até lá. O dinheiro existe: R$ ${brl0(D.firmeza.total)} vencem dentro da própria janela, mas ${pc(D.firmeza.pctSemData)} sem data acordada com ninguém.</div>
  <div class="meta">
    <div><span>Posição</span><strong>20 de agosto de 2026, 13h47</strong></div>
    <div><span>Sicoob</span><strong>R$ ${brl(D.caixa.sicoob)}</strong></div>
    <div><span>Sicredi (reserva)</span><strong>R$ ${brl(D.sicredi.liquido)}</strong></div>
    <div><span>Comissões 25/08</span><strong>R$ ${brl(D.comissoes25ago)}</strong></div>
    <div><span>Folha 05/09</span><strong>R$ ${brl(D.folhaAgosto)}</strong></div>
  </div>
</section>

<!-- ============ 1. RESPOSTA ============ -->
<section class="page">
  <div class="head"><h2>A resposta</h2><span class="n">01 · Síntese</span></div>

  <p class="lead"><strong>As comissões de 25/08 passam; a folha de 05/09 não.</strong> Só com o Sicoob e só com as cobranças que têm data acordada, o dia 25/08 fecharia em ${sinal(PISO.saldo25ago)}. <strong>Somando a reserva de R$ ${brl(D.sicredi.liquido)} parada no Sicredi, o dia 25/08 fecha em ${sinal(PISO.sic.saldo25ago)}</strong> e a comissão sai integral, sem depender de ninguém. A folha de agosto é outra história: mesmo com a reserva, 05/09 fecha em <strong>${sinal(PISO.sic.saldo05set)}</strong>. Faltam <strong>R$ ${brl(necSic('2026-09-05'))}</strong> de cobrança até lá — e não é falta de dinheiro, é falta de <em>data</em>: há R$ ${brl(D.firmeza.semData)} vencendo na janela sem acordo, mais R$ ${brl(D.vencidos.total)} já vencidos.</p>

  <div class="tiles">
    <div class="tile"><div class="k">Caixa hoje (Sicoob)</div><div class="v"><span class="cur">R$</span>${brl0(D.caixa.sicoob)}</div><div class="d">Conciliado 1:1 com o extrato de hoje 13h47</div></div>
    <div class="tile"><div class="k">Reserva no Sicredi</div><div class="v"><span class="cur">R$</span>${brl0(D.sicredi.liquido)}</div><div class="d">Parada na aplicação desde 04/08; é o que salva 25/08</div></div>
    <div class="tile gold"><div class="k">Precisa cobrar até 05/09</div><div class="v"><span class="cur">R$</span>${brl0(necSic('2026-09-05'))}</div><div class="d">Já contando com a reserva, para a folha não furar</div></div>
    <div class="tile gold"><div class="k">Precisa cobrar até 10/09</div><div class="v"><span class="cur">R$</span>${brl0(necSic('2026-09-10'))}</div><div class="d">Para atravessar a janela inteira</div></div>
  </div>

  <figure>${gLinha()}
    <figcaption>Saldo diário, contando só as cobranças com data acordada. A linha preta é o Sicoob sozinho; a cinza tracejada soma a reserva do Sicredi — é ela que faz o dia 25/08 passar. A dourada mostra o efeito de uma única cobrança sobre o consolidado: o EAO Baviera. Nenhuma das três inclui as ${D.firmeza.nSemData} cobranças sem data acordada.</figcaption>
  </figure>

  <h3>Os cenários, nas duas leituras de caixa</h3>
  <table>
    <thead><tr><th style="width:27%">Cenário</th>
      <th class="num" colspan="3" style="border-left:1px solid #E6E6E6">Só o Sicoob</th>
      <th class="num" colspan="4" style="border-left:1px solid #E6E6E6">Sicoob + reserva do Sicredi</th></tr>
    <tr><th></th>
      <th class="num" style="border-left:1px solid #E6E6E6">25/08</th><th class="num">05/09</th><th class="num">10/09</th>
      <th class="num" style="border-left:1px solid #E6E6E6">25/08</th><th class="num">05/09</th><th class="num">10/09</th><th class="num">Dias<br>neg.</th></tr></thead>
    <tbody>
      ${D.cenarios.map(c => `<tr${c.chave === 'FIRME' ? ' class="destaque"' : ''}>
        <td><strong>${esc(c.nome)}</strong></td>
        <td class="num muted" style="border-left:1px solid #E6E6E6">${brl0(c.saldo25ago)}</td>
        <td class="num muted">${brl0(c.saldo05set)}</td>
        <td class="num muted">${brl0(c.saldo10set)}</td>
        <td class="num" style="border-left:1px solid #E6E6E6">${c.sic.saldo25ago < 0 ? '<strong>' + brl0(c.sic.saldo25ago) + '</strong>' : brl0(c.sic.saldo25ago)}</td>
        <td class="num">${c.sic.saldo05set < 0 ? '<strong>' + brl0(c.sic.saldo05set) + '</strong>' : brl0(c.sic.saldo05set)}</td>
        <td class="num">${c.sic.saldo10set < 0 ? '<strong>' + brl0(c.sic.saldo10set) + '</strong>' : brl0(c.sic.saldo10set)}</td>
        <td class="num">${c.sic.diasNegativos}</td></tr>`).join('')}
    </tbody>
  </table>
  <p class="small">A reserva do Sicredi é um deslocamento constante de R$ ${brl(D.sicredi.liquido)} — ela não resolve nada estruturalmente, só compra as duas semanas entre 25/08 e a folha. Usada, deixa de existir para o resto de setembro.</p>

  <div class="box dark">
    <div class="t">O que mais importa nesta página</div>
    <p style="margin:0">A janela termina em 10/09 e a <strong>2ª parcela do JMP — R$ ${brl(D.jmp2)} — entra em 13/09</strong>. Três dias fora. Nenhuma decisão tomada aqui muda o mês de setembro inteiro: muda apenas se a Bula atravessa ou não essas três semanas. Por isso a saída mais barata não é cortar pagamento, é <strong>encurtar prazo de cobrança</strong>.</p>
  </div>

  ${foot()}
</section>

<!-- ============ 2. O QUE ENTRA E O QUE SAI ============ -->
<section class="page">
  <div class="head"><h2>O que entra e o que sai</h2><span class="n">02 · A janela</span></div>

  <figure>${gBalanco()}
    <figcaption>As duas barras estão na mesma escala. A parte clara da barra de cima é dinheiro que existe e está vencido ou vencendo, mas cuja data de pagamento nunca foi combinada com a leiloeira. As duas últimas faixas da barra de baixo são estimativas: despesa que historicamente sai do banco sem nunca ter virado conta a pagar no sistema.</figcaption>
  </figure>

  <div class="box rule">
    <div class="t">A reserva do Sicredi — e a correção de hoje</div>
    <p style="margin:0 0 2mm">O Sicredi tem <strong>R$ ${brl(D.sicredi.liquido)}</strong> parados na aplicação. Aquela conta corrente opera por <em>varredura</em>: nunca guarda saldo, o dinheiro fica aplicado e volta na hora do pagamento — por isso cada movimento é um par, resgate na aplicação contra crédito na corrente.</p>
    <p style="margin:0 0 2mm">Em <strong>04/08 saíram R$ ${brl0(D.sicredi.valorCorrecao)} da corrente por PIX para o Sicoob</strong> (o crédito está conciliado no extrato do Sicoob daquele dia), <strong>mas o resgate correspondente nunca foi lançado</strong>. A conta ficou com saldo de −R$ ${brl0(D.sicredi.valorCorrecao)}, impossível numa conta com varredura, e a aplicação ficou o mesmo tanto acima da posição real. <strong>Corrigido hoje:</strong> corrente zerada, aplicação em R$ ${brl(D.sicredi.aplicacao)}. O líquido não mudou — R$ ${brl(D.sicredi.liquido)} antes e depois; mudou o rateio.</p>
    <p class="small" style="margin:0">⚠ <strong>O extrato do Sicredi de agosto nunca foi importado.</strong> O último movimento registrado é o de ${dm(D.sicredi.ultimoMovimentoCC)} — ${D.sicredi.diasSemExtrato} dias atrás. Esses R$ ${brl(D.sicredi.liquido)} são a posição do ERP, conferida no app em 03/08, não um saldo confirmado pelo banco hoje. <strong>Antes de contar com eles em 25/08, abrir o app do Sicredi.</strong></p>
  </div>

  <h3>Sai do caixa até 10/09</h3>
  <table>
    <thead><tr><th style="width:14%">Data</th><th>Compromisso</th><th class="num">Valor</th><th class="num" style="width:16%">Acumulado</th></tr></thead>
    <tbody>
      ${(() => {
        const grupos = [
          { data: '2026-08-20', rot: 'Títulos vencidos ainda em aberto (Bulinha e FGTS de julho)', v: r2(D.pagar.filter(p => p.realocado).reduce((s, p) => s + p.valor, 0)) },
          { data: '2026-08-21', rot: 'Passagens da Expogenética — Fábio e Leonardo', v: r2(D.pagar.filter(p => p.data === '2026-08-21').reduce((s, p) => s + p.valor, 0)) },
          { data: '2026-08-24', rot: 'Faturas dos cartões Visa e Mastercard (débito automático)', v: r2(D.pagar.filter(p => p.data === '2026-08-24').reduce((s, p) => s + p.valor, 0)) },
          { data: '2026-08-25', rot: `<strong>Comissões de julho — ${D.comissoes25agoItens.length} títulos</strong>`, v: D.comissoes25ago, d: true },
          { data: '2026-08-31', rot: 'Despesa operacional — Melhoradores Especial 30 Anos', v: r2(D.pagar.filter(p => p.data === '2026-08-31').reduce((s, p) => s + p.valor, 0)) },
          { data: '2026-09-05', rot: `<strong>Folha de agosto — ${D.folhaItens.length} pessoas</strong>`, v: D.folhaAgosto, d: true },
          { data: '2026-09-07', rot: 'FGTS de agosto <span class="tag est">estimado</span>', v: D.encargos.fgts, e: true },
          { data: '2026-09-10', rot: 'Honorários de contabilidade', v: r2(D.pagar.filter(p => p.data === '2026-09-10').reduce((s, p) => s + p.valor, 0)) },
          { data: '—', rot: 'Custo corrente que nunca vira título — cartão, viagem, leilão, marketing <span class="tag est">estimado</span>', v: totalCorrente, e: true },
        ].filter(g => g.v > 0)
        let ac = 0
        return grupos.map(g => { ac = r2(ac + g.v); return `<tr${g.d ? ' class="destaque"' : ''}><td>${g.data === '—' ? '<span class="muted">diluído</span>' : dm(g.data)}</td><td>${g.rot}</td><td class="num">${brl(g.v)}</td><td class="num muted">${brl0(ac)}</td></tr>` }).join('')
          + `<tr class="total"><td></td><td>Total comprometido na janela</td><td class="num">${brl(r2(D.pagarTotal + totalCorrente + D.encargos.fgts))}</td><td class="num"></td></tr>`
      })()}
    </tbody>
  </table>

  <h3>Entra até 10/09 — e o que sustenta cada data</h3>
  <table>
    <thead><tr><th style="width:11%">Data</th><th>Título</th><th class="num">Valor</th><th style="width:34%">Por que essa data</th></tr></thead>
    <tbody>
      ${firmes.map(x => `<tr class="destaque"><td>${dm(x.data)}</td><td>${esc(corta(x.desc, 52))}</td><td class="num">${brl(x.valor)}</td><td class="small">${esc(x.motivo)}${x.obs ? ' <strong>— ' + esc(x.obs) + '</strong>' : ''}</td></tr>`).join('')}
      <tr class="total"><td></td><td>Com data acordada</td><td class="num">${brl(D.firmeza.firme)}</td><td></td></tr>
      ${semData.map(x => `<tr><td class="muted">${dm(x.data)}</td><td class="muted">${esc(corta(x.desc, 52))}</td><td class="num muted">${brl(x.valor)}</td><td class="small">Vencimento automático “leilão + 45 dias”, sem acordo</td></tr>`).join('')}
      <tr class="total"><td></td><td>Sem data acordada — ${pc(D.firmeza.pctSemData)} do total</td><td class="num">${brl(D.firmeza.semData)}</td><td></td></tr>
    </tbody>
  </table>

  ${foot()}
</section>

<!-- ============ 3. A COBRANÇA ============ -->
<section class="page">
  <div class="head"><h2>É cobrança, não corte de custo</h2><span class="n">03 · A alavanca</span></div>

  <p class="lead">Cortar não resolve: das saídas da janela, <strong>${pc(100 * r2(D.comissoes25ago + D.folhaAgosto) / r2(D.pagarTotal + totalCorrente + D.encargos.fgts))}</strong> são comissão de julho e folha de agosto — trabalho já entregue. O que decide o período é qual leiloeira paga primeiro.</p>

  <figure>${gConcentracao()}
    <figcaption>Quanto cada leiloeira responde do que está datado na janela. Três nomes — EAO Baviera, Genética Aditiva e Nelore Santa Cruz — concentram ${pc(r2(D.concentracao.slice(0, 3).reduce((s, g) => s + g.pct, 0)))} do total, e nenhum dos três tem data acordada.</figcaption>
  </figure>

  <h3>Uma única cobrança muda o mês</h3>
  <p>O <strong>Mega Evento EAO Baviera</strong> vale R$ ${brl(eaoTotal)} entre fêmeas (25/08) e machos (26/08) — ${pc(D.concentracao[0].pct)} de tudo que está datado no período. Fechando só essa data, o caixa deixa de furar: o dia 25/08 passa de ${sinal(PISO.saldo25ago)} para <strong>${sinal(EAO.saldo25ago)}</strong>, a folha de 05/09 fecha em <strong>${sinal(EAO.saldo05set)}</strong> e o período inteiro passa sem um dia negativo. Existe contato direto: Max Pereira, gerente comercial.</p>

  <h3>Quanto precisa ser cobrado até cada marco</h3>
  <table>
    <thead><tr><th style="width:40%">Regra de segurança</th><th class="num">até 25/08</th><th class="num">até 31/08</th><th class="num">até 05/09</th><th class="num">até 10/09</th></tr></thead>
    <tbody>
      ${D.necessidade.map((n, i) => `<tr${i === 0 ? ' class="destaque"' : ''}><td>${esc(n.rot)}</td>
        ${n.linha.map(x => `<td class="num">${x.precisa > 0 ? brl0(x.precisa) : '—'}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>
  <p class="small">Leitura: partindo só do que tem data acordada, é quanto precisa entrar de cobrança nova até aquele dia. Com a reserva do Sicredi, <strong>25/08 e 31/08 zeram</strong> — a necessidade só aparece em 05/09, na folha. Adiar as comissões para 05/09 não muda nada nas colunas de setembro: o dinheiro continua faltando, só mais tarde.</p>

  <h3>O estoque de cobrança que ninguém está olhando</h3>
  <div class="tiles">
    <div class="tile"><div class="k">Vencido total</div><div class="v"><span class="cur">R$</span>${brl0(D.vencidos.total)}</div><div class="d">${D.vencidos.n} títulos, nenhum em qualquer cenário</div></div>
    <div class="tile"><div class="k">Vencido há menos de 60 dias</div><div class="v"><span class="cur">R$</span>${brl0(D.vencidos.ate60)}</div><div class="d">O mais recuperável do estoque</div></div>
    <div class="tile"><div class="k">Vencido há mais de 60 dias</div><div class="v"><span class="cur">R$</span>${brl0(D.vencidos.mais60)}</div><div class="d">Exige decisão: cobrar ou baixar</div></div>
    <div class="tile gold"><div class="k">Basta recuperar</div><div class="v">${pc(100 * necZero('2026-09-10') / D.vencidos.ate60)}</div><div class="d">do vencido recente para fechar toda a janela</div></div>
  </div>

  <h3>Os cinco maiores vencidos</h3>
  <table>
    <thead><tr><th style="width:11%">Venceu</th><th class="num" style="width:9%">Dias</th><th>Título</th><th class="num">Valor</th></tr></thead>
    <tbody>
      ${D.vencidos.itens.slice().sort((a, b) => b.valor - a.valor).slice(0, 5).map(v =>
        `<tr><td>${dm(v.data)}</td><td class="num">${v.idade}</td><td>${esc(corta(v.desc, 66))}</td><td class="num">${brl(v.valor)}</td></tr>`).join('')}
    </tbody>
  </table>

  ${foot()}
</section>

<!-- ============ 4. AS DUAS DECISÕES ============ -->
<section class="page">
  <div class="head"><h2>Comissões e folha</h2><span class="n">04 · Decisão</span></div>

  <h3>25/08 — comissões de julho: R$ ${brl(D.comissoes25ago)}</h3>
  <p><strong>Puxando a reserva do Sicredi, a comissão sai integral</strong> sem cobrar nada de ninguém. Só com o Sicoob o teto seria R$ ${brl(capZero.valor)} — ${pc(capZero.pct)} do devido. A reserva cobre exatamente a diferença.</p>
  <table>
    <thead><tr><th style="width:38%">Regra de segurança</th><th class="num">Só o Sicoob</th><th class="num">% do devido</th><th class="num">+ reserva do Sicredi</th><th class="num">% do devido</th><th class="num">Com o EAO pagando</th></tr></thead>
    <tbody>
      ${D.capacidade.map(c => `<tr><td>${esc(c.rot)}</td>
        <td class="num muted">${brl(c.valor)}</td><td class="num muted">${pc(c.pct)}</td>
        <td class="num"><strong>${brl(c.valorSic)}</strong>${c.pctSic >= 99.9 ? ' <span class="tag ok">integral</span>' : ''}</td><td class="num muted">${pc(c.pctSic)}</td>
        <td class="num">${brl(c.valorEao)}${c.pctEao >= 99.9 ? ' <span class="tag ok">integral</span>' : ''}</td></tr>`).join('')}
    </tbody>
  </table>
  <p class="small">O colchão de R$ 30.000 não é alcançável só com o Sicoob porque o caixa já entra em 24/08 abaixo dele (R$ ${brl(PISO.antesComissao)}) — não é a comissão que impede, é o saldo de partida. Com a reserva, dá para pagar R$ ${brl(D.capacidade[2].valorSic)} e ainda manter os R$ 30.000.</p>

  <h3>05/09 — folha de agosto: R$ ${brl(D.folhaAgosto)}</h3>
  <table>
    <thead><tr><th>Pessoa</th><th class="num">Valor</th><th>Pessoa</th><th class="num">Valor</th></tr></thead>
    <tbody>
      ${(() => {
        const it = D.folhaItens
        let out = ''
        for (let i = 0; i < it.length; i += 2) {
          out += `<tr><td>${esc(it[i].desc.replace(/^Folha Agosto\/2026 - /, ''))}</td><td class="num">${brl(it[i].valor)}</td>
            <td>${it[i + 1] ? esc(it[i + 1].desc.replace(/^Folha Agosto\/2026 - /, '')) : ''}</td><td class="num">${it[i + 1] ? brl(it[i + 1].valor) : ''}</td></tr>`
        }
        return out + `<tr class="total"><td>Total</td><td class="num">${brl(D.folhaAgosto)}</td><td></td><td class="num"></td></tr>`
      })()}
    </tbody>
  </table>
  <p>Aqui a reserva não alcança: mesmo com os R$ ${brl(D.sicredi.liquido)} do Sicredi, 05/09 fecha em ${sinal(PISO.sic.saldo05set)}. <strong>É a folha que exige cobrança, não a comissão.</strong> São R$ ${brl(necSic('2026-09-05'))} a fechar até 05/09 — menos de metade do que o EAO Baviera sozinho vale. E é por isso que usar a reserva em 25/08 não é gratuito: ela sai do caixa e não estará lá em setembro.</p>

  <div class="box rule">
    <p style="margin:0"><strong>Adiar as comissões inteiras para 05/09 não é solução.</strong> Com a reserva, 05/09 fecha em ${sinal(ADIA.sic.saldo05set)} — idêntico ao cenário em que elas são pagas em 25/08. Só empurra o buraco de onze dias e concentra R$ ${brl(r2(D.comissoes25ago + D.folhaAgosto))} num único dia, sem ganhar um centavo.</p>
  </div>

  <h3>O risco que não depende de ninguém de fora</h3>
  <p>O repasse da Bula Remates — R$ ${brl(D.remates.totalReal)} de Kirz e Neloraço — estava previsto para hoje e <strong>não entrou até 13h47</strong>. Todos os cenários acima já contam com ele hoje. Se atrasar:</p>
  <table>
    <thead><tr><th style="width:22%">Atraso do repasse <span class="muted">(só o Sicoob)</span></th><th class="num">24/08</th><th class="num">25/08</th><th class="num">Pior dia até 04/09</th><th class="num">10/09</th></tr></thead>
    <tbody>
      ${D.sensibilidade.filter(s => [0, 5, 7, 10].includes(s.atrasoRemates)).map(s =>
        `<tr${s.atrasoRemates === 0 ? ' class="destaque"' : ''}><td>${s.atrasoRemates === 0 ? 'Entra hoje' : '+' + s.atrasoRemates + ' dias (' + dm('2026-08-' + String(20 + s.atrasoRemates).padStart(2, '0')) + ')'}</td>
        <td class="num">${brl0(s.antesComissao)}</td><td class="num">${brl0(s.saldo25ago)}</td><td class="num">${brl0(s.minAteFolha)}</td><td class="num">${brl0(s.saldo10set)}</td></tr>`).join('')}
    </tbody>
  </table>
  <p class="small">A partir de <strong>7 dias</strong> de atraso o dia das comissões piora em R$ ${brl0(Math.abs(r2(D.sensibilidade.find(s => s.atrasoRemates === 7).saldo25ago - D.sensibilidade[0].saldo25ago)))} — é o único risco da janela que se resolve com um telefonema interno, para o Felipe.</p>

  ${foot()}
</section>

<!-- ============ 5. GUADALUPE ============ -->
<section class="page">
  <div class="head"><h2>Guadalupe: acordo fechado</h2><span class="n">05 · Registrado no ERP</span></div>

  <p class="lead">A leiloeira confirmou hoje a comissão do 20º Leilão Guadalupe e aceitou pagar em 2 vezes, com a primeira parcela até 25/08. <strong>Já está lançado no ERP</strong> — e a conferência revelou que o sistema estava cobrando R$ ${brl(Math.abs(D.guadalupeAcordo.delta))} a mais do que o combinado.</p>

  <div class="tiles">
    <div class="tile gold"><div class="k">Comissão acordada</div><div class="v"><span class="cur">R$</span>${brl0(D.guadalupeAcordo.total)}</div><div class="d">Confirmada pela leiloeira em 20/08</div></div>
    <div class="tile"><div class="k">Estava no ERP</div><div class="v"><span class="cur">R$</span>${brl0(D.guadalupeAcordo.antesNoErp)}</div><div class="d">Percentual dos touros nunca foi confirmado</div></div>
    <div class="tile"><div class="k">Correção</div><div class="v">−<span class="cur">R$</span>${brl0(Math.abs(D.guadalupeAcordo.delta))}</div><div class="d">Receita de julho estava superestimada</div></div>
    <div class="tile"><div class="k">Cada parcela</div><div class="v"><span class="cur">R$</span>${brl0(D.guadalupeAcordo.parcela)}</div><div class="d">25/08 e 25/09</div></div>
  </div>

  <h3>Como os R$ ${brl(D.guadalupeAcordo.total)} se formam</h3>
  <table>
    <thead><tr><th style="width:44%">Pregão</th><th class="num">Base</th><th class="num">%</th><th class="num">Comissão</th></tr></thead>
    <tbody>
      ${D.guadalupeAcordo.memoria.map(m => `<tr><td>${esc(m.rot)}</td><td class="num">${brl(m.base)}</td><td class="num">${String(m.pct).replace('.', ',')}%</td><td class="num">${brl(m.valor)}</td></tr>`).join('')}
      <tr class="total"><td>Total — bate exatamente com o valor informado pela leiloeira</td><td class="num"></td><td class="num"></td><td class="num">${brl(D.guadalupeAcordo.total)}</td></tr>
    </tbody>
  </table>
  <p class="small">O faturamento do domingo (R$ ${brl(D.guadalupeAcordo.memoria[1].base)}) não vinha de nenhuma fonte: foi deduzido do próprio total informado e conferiu com o faturamento dos dois pregões de touros que já estava no sistema (R$ 3.952.180,00 − R$ 3.043.180,00 = R$ 909.000,00 de segunda-feira). É a única combinação que fecha nos três dias ao mesmo tempo.</p>

  <h3>O erro que estava no sistema</h3>
  <p>O fechamento dos touros de domingo estava remunerado a <strong>0,75% sobre o faturamento dos dois pregões</strong> — uma faixa da tabela escalonada que a Guadalupe tinha mandado em julho e que <em>nunca foi confirmada</em>. O pregão de segunda-feira estava com receita zero e sem conta a receber nenhuma. O acordo real é mais simples e mais barato: 0,5% num dia só, e 5% sobre a venda da cobertura Bula nos outros dois.</p>

  <h3>O que mudou no ERP</h3>
  <table>
    <thead><tr><th style="width:36%">Registro</th><th class="num">Antes</th><th class="num">Depois</th><th>Efeito</th></tr></thead>
    <tbody>
      <tr><td>Fechamento Fêmeas 18/07</td><td class="num">${brl(3000)}</td><td class="num">${brl(3000)}</td><td class="small">Inalterado; sobra bruta passou a ser calculada</td></tr>
      <tr><td>Fechamento Touros 19/07 (domingo)</td><td class="num">${brl(29641.35)}</td><td class="num">${brl(15215.90)}</td><td class="small">Percentual e base corrigidos para o acordo real</td></tr>
      <tr><td>Fechamento Touros 20/07 (segunda)</td><td class="num">${brl(0)}</td><td class="num">${brl(3210)}</td><td class="small">Pregão que estava sem receita nenhuma</td></tr>
      <tr class="destaque"><td>Contas a receber</td><td class="num">2 títulos</td><td class="num">4 títulos</td><td class="small">Duas parcelas de R$ ${brl(D.guadalupeAcordo.parcela)}, em 25/08 e 25/09</td></tr>
    </tbody>
  </table>

  <div class="box">
    <div class="t">Precisa de confirmação</div>
    <p class="small" style="margin:0">A conversa fixou apenas a <strong>1ª parcela, até 25/08</strong>. A segunda foi lançada para <strong>25/09</strong> por ser o intervalo padrão de 30 dias — se a Guadalupe combinou outra data, é só avisar. A comissão dos assessores desse leilão não muda com a correção: ela é calculada sobre a cobertura vendida, não sobre o que a leiloeira paga à Bula — R$ ${brl(D.guadalupeAcordo.comissaoAssessores)} vencendo em ${dm(D.guadalupeAcordo.comissaoAssessoresVenc)} mais R$ ${brl(D.guadalupeAcordo.comissaoNane)} da Nane diferidos para dezembro. Com a receita corrigida para R$ ${brl(D.guadalupeAcordo.total)}, o leilão paga R$ ${brl(D.guadalupeAcordo.comissaoTotal)} de comissão — <strong>${pc(100 * D.guadalupeAcordo.comissaoTotal / D.guadalupeAcordo.total)} da receita</strong>, contra ${pc(100 * D.guadalupeAcordo.comissaoTotal / D.guadalupeAcordo.antesNoErp)} pelo número antigo.</p>
  </div>

  ${foot()}
</section>

<!-- ============ 6. DEPOIS DA JANELA ============ -->
<section class="page">
  <div class="head"><h2>Três dias depois</h2><span class="n">06 · Contexto</span></div>

  <p class="lead">A janela pedida termina em 10/09. O que vem logo depois muda completamente a leitura do risco — e por isso ele não deve ser lido como um mês ruim, mas como <strong>um vale de três semanas antes de uma entrada grande</strong>.</p>

  <table>
    <thead><tr><th style="width:11%">Data</th><th>Evento</th><th class="num">Valor</th><th style="width:26%">Situação</th></tr></thead>
    <tbody>
      <tr class="destaque"><td>13/09</td><td><strong>2ª parcela do 10º Leilão Nelore JMP</strong> (fêmeas + touros)</td><td class="num">${brl(D.jmp2)}</td><td class="small">Contrato JBJ, 2x — a 1ª entrou em 10/08</td></tr>
      <tr><td>15/09</td><td>ISSQN referente a agosto <span class="tag est">estimado</span></td><td class="num">${brl(r2(D.impostosAgosto.piso * D.mixIss))}</td><td class="small">Sobre o caixa recebido em agosto</td></tr>
      <tr><td>20/09</td><td>DAS do Simples referente a agosto <span class="tag est">estimado</span></td><td class="num">${brl(r2(D.impostosAgosto.piso * (1 - D.mixIss)))}</td><td class="small">Idem</td></tr>
      <tr><td>25/09</td><td>Comissões de agosto — ${D.pos25set.n} títulos <span class="muted">(entra a 2ª parcela do Guadalupe, R$ ${brl0(D.pos25set.guadalupeP2)})</span></td><td class="num">${brl(D.pos25set.comissoes)}</td><td class="small">Já lançadas no ERP</td></tr>
      <tr class="total"><td></td><td>A receber entre 11/09 e 30/09 (tudo)</td><td class="num">${brl(D.depoisTotal)}</td><td class="small">Só R$ ${brl0(D.depoisFirme)} com data</td></tr>
    </tbody>
  </table>

  <div class="box dark">
    <div class="t">A armadilha de setembro</div>
    <p style="margin:0">Os R$ ${brl(D.jmp2)} do JMP entram em 13/09 e as guias de agosto vencem em 15 e 20/09. <strong>A folga dura dois dias.</strong> Pela carga efetiva observada — ${pc(D.taxaTributaria.media)} do caixa recebido, medida em maio, junho e julho — as guias de agosto ficam entre R$ ${brl0(D.impostosAgosto.piso)} (se a cobrança não avançar) e R$ ${brl0(D.impostosAgosto.nominal)} (se agosto receber tudo que está datado). Quanto mais a Bula cobrar em agosto, maior a guia de setembro: é imposto sobre receita bruta, não sobre lucro.</p>
  </div>

  <h3>Por que a projeção inclui despesa que não está lançada</h3>
  <p>O ERP pré-lança folha, comissão e débitos agendados — e mais nada. Cartão de crédito, viagem, combustível, marketing, manutenção, alimentação e despesa operacional de leilão só viram lançamento quando o extrato chega. Projetar só com título lançado subestima a saída em cerca de <strong>R$ ${brl0(D.custoCorrente.media)} por mês</strong>.</p>
  <table>
    <thead><tr><th style="width:26%">Janela</th><th class="num">Esperado pela média</th><th class="num">Já lançado</th><th class="num">Acrescentado ao fluxo</th></tr></thead>
    <tbody>
      ${D.residuos.map(x => `<tr><td>${x.mes === '2026-08' ? '20 a 31/08' : '1 a 10/09'}</td>
        <td class="num">${brl(x.esperado)}</td><td class="num muted">${brl(x.lancado)}</td><td class="num"><strong>${brl(x.residuo)}</strong></td></tr>`).join('')}
      <tr class="total"><td>Total</td><td class="num"></td><td class="num"></td><td class="num">${brl(totalCorrente)}</td></tr>
    </tbody>
  </table>
  <p class="small">Base: média das saídas do Sicoob em abr–jul, fora comissão, folha, imposto, encargos e transferências internas (R$ ${brl(D.custoCorrente.media)}/mês). Agosto já gastou R$ ${brl(D.custoCorrente.agostoAte20)} até o dia 20 — mês de Expogenética.</p>

  ${foot()}
</section>

<!-- ============ 7. RECOMENDAÇÃO ============ -->
<section class="page">
  <div class="head"><h2>O que fazer</h2><span class="n">07 · Ação</span></div>

  <h3>Nesta ordem</h3>
  <ol>
    <li><strong>Hoje: cobrar o repasse da Bula Remates com o Felipe.</strong> R$ ${brl(D.remates.totalReal)} estavam previstos para entrar hoje e não entraram. É dinheiro interno, resolve-se com um telefonema, e é o que sustenta o dia 24/08 em R$ ${brl0(PISO.antesComissao)}.</li>
    <li><strong>Até 22/08: fechar data com o EAO Baviera.</strong> R$ ${brl(eaoTotal)} entre as duas etapas — ${pc(D.concentracao[0].pct)} de tudo que está datado na janela. Sozinho, tira o período inteiro do negativo e libera a comissão integral em 25/08. Contato: Max Pereira.</li>
    <li><strong>Antes de 25/08, abrir o app do Sicredi e confirmar os R$ ${brl(D.sicredi.liquido)}.</strong> É essa reserva que faz a comissão sair integral, e o extrato daquela conta não é importado desde ${dm(D.sicredi.ultimoMovimentoCC)}. Se o saldo estiver lá, transferir para o Sicoob no dia 24.</li>
    <li><strong>Em 25/08, pagar a comissão integral usando a reserva.</strong> O dia fecha em ${sinal(PISO.sic.saldo25ago)}. Só com o Sicoob o teto seria R$ ${brl(capZero.valor)} — e aí o restante teria de ser combinado com a equipe para 05/09.</li>
    <li><strong>Não adiar a folha — e não contar com a reserva duas vezes.</strong> R$ ${brl(D.folhaAgosto)} em 05/09 é a saída menos adiável do período. Gasta a reserva em 25/08, sobram R$ ${brl(necSic('2026-09-05'))} de cobrança a fechar até 05/09.</li>
    <li><strong>Cobrar a Genética Aditiva e a Nelore Santa Cruz na sequência.</strong> Juntas são R$ ${brl0(r2(D.concentracao.find(g => g.grupo === 'Genética Aditiva').valor + D.concentracao.find(g => g.grupo === 'Nelore Santa Cruz').valor))} vencendo entre 28/08 e 09/09, com contato conhecido (Claudinei Sandim e Nelore Santa Cruz).</li>
    <li><strong>Atacar os R$ ${brl(D.vencidos.ate60)} vencidos há menos de 60 dias.</strong> Não entram em nenhum cenário deste relatório. Recuperar ${pc(100 * necZero('2026-09-10') / D.vencidos.ate60)} deles já fecha a janela inteira.</li>
    <li><strong>Passar a registrar a data acordada no título.</strong> Enquanto o vencimento for “leilão + 45 dias” automático, ${pc(D.firmeza.pctSemData)} de qualquer projeção de caixa desta empresa será chute. É a correção de raiz — e é de graça.</li>
  </ol>

  <h3>Calendário de decisão</h3>
  <table>
    <thead><tr><th style="width:12%">Data</th><th style="width:32%">O que checar</th><th>Se estiver resolvido</th><th>Se não estiver</th></tr></thead>
    <tbody>
      <tr class="destaque"><td><strong>hoje</strong></td><td>Repasse da Bula Remates caiu</td><td>24/08 fecha em R$ ${brl0(PISO.antesComissao)}</td><td>Cobrar o Felipe antes de 25/08</td></tr>
      <tr><td>até 22/08</td><td>Data do EAO Baviera fechada</td><td>Comissão integral em 25/08</td><td>Pagar comissão parcial (teto R$ ${brl0(capZero.valor)})</td></tr>
      <tr><td>até 25/08</td><td>1ª parcela do Guadalupe (R$ ${brl0(D.guadalupeAcordo.parcela)})</td><td>Acordo cumprido, cobrar a 2ª em 25/09</td><td>Ligar para a Valéria — foi acordo de hoje</td></tr>
      <tr><td>até 24/08</td><td>Saldo do Sicredi confirmado no app</td><td>Transferir e pagar a comissão integral</td><td>Teto de R$ ${brl0(capZero.valor)} em 25/08</td></tr>
      <tr><td>até 02/09</td><td>R$ ${brl0(necSic('2026-09-05'))} de cobrança fechados</td><td>Folha de 05/09 garantida</td><td>Negociar prazo da folha com a equipe</td></tr>
      <tr><td>até 10/09</td><td>Confirmação da 2ª parcela do JMP para 13/09</td><td>Setembro vira mês de folga</td><td>Refazer esta projeção antes de qualquer compromisso novo</td></tr>
    </tbody>
  </table>

  <div class="box">
    <div class="t">O que este relatório não sabe</div>
    <p class="small" style="margin:0">(a) O Sicoob está conciliado 1:1 com o extrato de hoje 13h47 — R$ ${brl(D.caixa.sicoob)}. (b) O extrato do Sicredi de agosto nunca foi importado. Os R$ ${brl(D.sicredi.liquido)} são a posição do ERP em ${dm(D.sicredi.ultimoMovimentoApp)}, conferida no app naquele dia — não um saldo bancário de hoje. O resgate de R$ ${brl0(D.sicredi.valorCorrecao)} que faltava foi lançado hoje e zerou a conta corrente, mas movimento posterior a ${dm(D.sicredi.ultimoMovimentoCC)} é desconhecido. (c) As guias de agosto são estimativa por carga efetiva, não cálculo do contador. (d) O FGTS de julho (R$ ${brl(D.encargos.fgts)}) segue em aberto no sistema e não apareceu no extrato — conferir se foi pago por fora. (e) A classificação “tem data acordada” vem de uma tabela única no script gerador: se alguma cobrança da lista da página 2 já foi combinada por telefone, avisar que os números mudam na hora. (f) A 2ª parcela do Guadalupe foi lançada para 25/09 por convenção — a conversa só fixou a primeira.</p>
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
const pdfPath = path.join(desktop, 'Bula - Fluxo de Caixa - 20ago a 10set 2026.pdf')
await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '14mm', left: '11mm', right: '11mm' } })
await browser.close()
console.log('PDF:', pdfPath)
