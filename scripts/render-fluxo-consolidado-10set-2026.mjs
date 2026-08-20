/**
 * Renderiza o relatorio de fluxo de caixa CONSOLIDADO 20/08 -> 10/09/2026 a partir de
 * outputs/fluxo-consolidado-10set-2026/dados.json. Uma linha de caixa so (Sicoob + Sicredi).
 * Paleta monocromatica do brandbook. Gera HTML + PDF A4 na Area de Trabalho.
 * Nenhum numero escrito a mao.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { chromium } from 'playwright'

const OUT = 'outputs/fluxo-consolidado-10set-2026'
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
const PISO = cen('FIRME'), NOM = cen('NOMINAL'), ADIA = cen('ADIA'), EAO = cen('EAO')
const nec = ate => D.necessidade[0].linha.find(x => x.ate === ate).precisa
const nec20 = ate => D.necessidade[1].linha.find(x => x.ate === ate).precisa
const eaoG = D.concentracao.find(g => g.grupo === 'EAO Baviera')
const semData = D.receber.filter(x => !x.firme)
const firmes = D.receber.filter(x => x.firme)
const totalCorrente = r2(D.residuos.reduce((s, x) => s + x.residuo, 0))
const saiTotal = r2(D.pagarTotal + totalCorrente + D.encargos.fgts)
const capZero = D.capacidade.find(c => c.colchao === 0)
const cap20 = D.capacidade.find(c => c.colchao === 20000)
const sens = d => D.sensibilidade.find(x => x.atrasoRemates === d)

/* ============ G1 — a linha do caixa consolidado ============ */
function gLinha() {
  const W = 760, H = 296, L = 62, R = 112, T = 20, B = 40
  const series = [
    { k: 'NOMINAL', rot: 'Todos na data do ERP', cor: '#C6C6C6', dash: '', w: 1.5 },
    { k: 'EAO', rot: 'Com o EAO pago', cor: GOLD, dash: '4 2', w: 1.8 },
    { k: 'FIRME', rot: 'Só o que tem data', cor: INK, dash: '', w: 2.4 },
  ]
  const pts = D.linhas.FIRME
  const todos = series.flatMap(s => D.linhas[s.k].map(p => p.saldo))
  const max = Math.max(...todos, 0) * 1.1, min = Math.min(...todos, 0) * 1.2
  const x = i => L + i * (W - L - R) / (pts.length - 1)
  const y = v => T + (H - T - B) * (1 - (v - min) / (max - min))
  let grid = ''
  for (let i = 0; i <= 4; i++) {
    const v = min + (max - min) * i / 4, yy = y(v)
    grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    grid += `<text x="${L - 8}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="${MUTED}">${kk(v)}</text>`
  }
  const y0 = y(0)
  grid += `<line x1="${L}" y1="${y0.toFixed(1)}" x2="${W - R}" y2="${y0.toFixed(1)}" stroke="${INK}" stroke-width="1.2"/>`
  const iCom = pts.findIndex(p => p.data === '2026-08-25')
  const iFol = pts.findIndex(p => p.data === '2026-09-05')
  let marcos = ''
  for (const [i, rot] of [[iCom, 'comissões 25/08'], [iFol, 'folha 05/09']]) {
    marcos += `<line x1="${x(i).toFixed(1)}" y1="${T}" x2="${x(i).toFixed(1)}" y2="${H - B}" stroke="${GOLD}" stroke-width="1" stroke-dasharray="2 2"/>`
    marcos += `<text x="${(x(i) + 3).toFixed(1)}" y="${T + 9}" font-size="8.6" fill="#8A7530">${rot}</text>`
  }
  const linha = s => D.linhas[s.k].map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' ')
  const paths = series.map(s => `<path d="${linha(s)}" fill="none" stroke="${s.cor}" stroke-width="${s.w}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>`).join('')
  const rot = series.map(s => {
    const arr = D.linhas[s.k], last = arr[arr.length - 1]
    return `<text x="${W - R + 5}" y="${(y(last.saldo) + 2).toFixed(1)}" font-size="8.5" font-weight="600" fill="${s.cor === '#C6C6C6' ? MUTED : s.cor}">${esc(s.rot)}</text>
            <text x="${W - R + 5}" y="${(y(last.saldo) + 12).toFixed(1)}" font-size="8.2" fill="${MUTED}">${kk(last.saldo)}</text>`
  }).join('')
  const eixo = pts.map((p, i) => (i % 3 === 0 || i === pts.length - 1)
    ? `<text x="${x(i).toFixed(1)}" y="${H - B + 15}" text-anchor="middle" font-size="9" fill="${MUTED}">${dm(p.data)}</text>` : '').join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Saldo diário do caixa consolidado de 20 de agosto a 10 de setembro">
    ${grid}${marcos}${paths}${rot}${eixo}</svg>`
}

/* ============ G2 — entra x sai ============ */
function gBalanco() {
  const W = 760, H = 190, T = 26, bh = 30, gap = 20
  const ent = [
    { rot: 'Com data acordada', v: D.firmeza.firme, f: INK },
    { rot: 'Sem data acordada — cobrança a fazer', v: D.firmeza.semData, f: '#DCDCDC' },
  ]
  const sai = D.pagarPorBucket.map((b, i) => ({
    rot: { comissao: 'Comissões de julho', folha: 'Folha de agosto', imposto: 'FGTS em atraso', corrente: 'Cartões, viagens, operação' }[b.bucket],
    v: b.valor, f: ['#0A0A0A', '#3D3D3D', '#8C8C8C', '#C4C4C4'][i],
  })).filter(x => x.v > 0)
  sai.push({ rot: 'Custo corrente não lançado (média)', v: totalCorrente, f: '#E4E4E4' })
  sai.push({ rot: 'FGTS de agosto (estimado)', v: D.encargos.fgts, f: '#EFEFEF' })
  const totE = ent.reduce((s, x) => s + x.v, 0), totS = sai.reduce((s, x) => s + x.v, 0)
  const k = W / Math.max(totE, totS)
  const barra = (arr, yy, tot, rotulo) => {
    let x = 0, out = `<text x="0" y="${yy - 6}" font-size="9" fill="${MUTED}">${rotulo} — R$ ${brl0(tot)}</text>`
    for (const s of arr) {
      const w = s.v * k
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
  const leg = sai.filter(s => s.v * k <= 74).map((s, i) =>
    `<g transform="translate(${(i % 2) * 386},${H - 16 + Math.floor(i / 2) * 13})"><rect x="0" y="-8" width="12" height="8" fill="${s.f}" stroke="${GRID}"/>
     <text x="17" y="-1" font-size="8.4" fill="${MUTED}">${esc(s.rot)} — R$ ${brl0(s.v)}</text></g>`).join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="O que a Bula tem a receber contra o que tem a pagar entre 20 de agosto e 10 de setembro">
    ${barra(ent, T, totE, 'ENTRA — o que está datado no período')}
    ${barra(sai, T + bh + gap + 14, totS, 'SAI — o que está comprometido no período')}${leg}</svg>`
}

/* ============ G3 — concentração da cobrança ============ */
function gConcentracao() {
  const its = D.concentracao
  const W = 760, rh = 19, T = 4, L = 132, H = T + its.length * rh + 12
  const max = Math.max(...its.map(i => i.valor))
  const k = (W - L - 96) / max
  const rows = its.map((g, i) => {
    const y = T + i * rh, wF = g.firme * k, wC = g.aCobrar * k
    return `<text x="${L - 8}" y="${y + 12}" text-anchor="end" font-size="9.2" fill="${INK}">${esc(g.grupo)}</text>
      <rect x="${L}" y="${y + 3}" width="${wF.toFixed(1)}" height="12" fill="${INK}"/>
      <rect x="${(L + wF).toFixed(1)}" y="${y + 3}" width="${wC.toFixed(1)}" height="12" fill="#DCDCDC"/>
      <text x="${(L + wF + wC + 6).toFixed(1)}" y="${y + 12.5}" font-size="8.8" fill="${MUTED}">R$ ${brl0(g.valor)} · ${pc(g.pct)}</text>`
  }).join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Quanto cada leiloeira responde do que a Bula tem a receber no período">
    ${rows}<g transform="translate(${L},${H - 2})"><rect x="0" y="-8" width="12" height="8" fill="${INK}"/>
      <text x="17" y="-1" font-size="8.4" fill="${MUTED}">data acordada</text>
      <rect x="112" y="-8" width="12" height="8" fill="#DCDCDC"/>
      <text x="129" y="-1" font-size="8.4" fill="${MUTED}">a cobrar</text></g></svg>`
}

const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')
const foot = () => `<div class="pfoot"><span>Bula Assessoria Pecuária — documento interno</span><span>Fluxo de caixa consolidado · 20/08 a 10/09/2026 · gerado em 20/08/2026</span></div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Fluxo de Caixa Consolidado — até 10/09/2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
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
  .tile.neg .v { color: ${INK}; }
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
  <h1>Fluxo de caixa<br>até 10 de setembro</h1>
  <div class="rule"></div>
  <div class="sub">Caixa consolidado — Sicoob e Sicredi somados numa linha só. <strong style="color:#fff">As comissões de julho passam em 25/08. A folha de agosto não passa em 05/09</strong>, e faltam R$ ${brl0(nec('2026-09-05'))} de cobrança até lá. O dinheiro existe: R$ ${brl0(D.firmeza.total)} vencem dentro da própria janela, mas ${pc(D.firmeza.pctSemData)} sem data acordada com ninguém.</div>
  <div class="meta">
    <div><span>Posição</span><strong>20 de agosto de 2026</strong></div>
    <div><span>Caixa consolidado</span><strong>R$ ${brl(D.caixa.inicial)}</strong></div>
    <div><span>Comissões 25/08</span><strong>R$ ${brl(D.comissoes25ago)}</strong></div>
    <div><span>Folha 05/09</span><strong>R$ ${brl(D.folhaAgosto)}</strong></div>
  </div>
</section>

<!-- ============ 1. A RESPOSTA ============ -->
<section class="page">
  <div class="head"><h2>A resposta</h2><span class="n">01 · Síntese</span></div>

  <p class="lead"><strong>As comissões de 25/08 passam. A folha de 05/09 não.</strong> Partindo de R$ ${brl(D.caixa.inicial)} em caixa e contando apenas as cobranças que têm data acordada, o dia 25/08 fecha em <strong>${sinal(PISO.saldo25ago)}</strong> — a comissão sai integral, sem depender de ninguém. Onze dias depois a conta vira: 05/09 fecha em <strong>${sinal(PISO.saldo05set)}</strong> e a janela termina em ${sinal(PISO.saldo10set)}. Faltam <strong>R$ ${brl(nec('2026-09-05'))}</strong> de cobrança até a folha. Não é falta de dinheiro — é falta de <em>data</em>: R$ ${brl(D.firmeza.semData)} vencem na janela sem acordo nenhum, e há outros R$ ${brl(D.vencidos.total)} já vencidos.</p>

  <div class="tiles">
    <div class="tile"><div class="k">Caixa hoje, consolidado</div><div class="v"><span class="cur">R$</span>${brl0(D.caixa.inicial)}</div><div class="d">Sicoob R$ ${brl0(D.caixa.sicoob)} + Sicredi R$ ${brl0(D.caixa.sicrediLiquido)}</div></div>
    <div class="tile"><div class="k">Sai até 10/09</div><div class="v"><span class="cur">R$</span>${brl0(saiTotal)}</div><div class="d">${pc(100 * r2(D.comissoes25ago + D.folhaAgosto) / saiTotal)} disso é comissão e folha</div></div>
    <div class="tile gold"><div class="k">Precisa cobrar até 05/09</div><div class="v"><span class="cur">R$</span>${brl0(nec('2026-09-05'))}</div><div class="d">Para a folha não furar o caixa</div></div>
    <div class="tile gold"><div class="k">Precisa cobrar até 10/09</div><div class="v"><span class="cur">R$</span>${brl0(nec('2026-09-10'))}</div><div class="d">Para atravessar a janela inteira</div></div>
  </div>

  <figure>${gLinha()}
    <figcaption>Saldo diário do caixa consolidado. A linha preta conta só as ${D.firmeza.nFirme} cobranças com data acordada — é o piso, não uma previsão. A dourada mostra o efeito de uma única cobrança, o EAO Baviera. A cinza é o cenário em que todas as ${D.firmeza.nSemData} cobranças sem data pagassem no vencimento que o próprio sistema calculou, o que ninguém combinou com ninguém.</figcaption>
  </figure>

  <h3>Os cenários</h3>
  <table>
    <thead><tr><th style="width:32%">Cenário</th><th class="num">24/08<br>véspera</th><th class="num">25/08<br>comissões</th><th class="num">04/09<br>véspera</th><th class="num">05/09<br>folha</th><th class="num">10/09</th><th class="num">Dias<br>negativos</th></tr></thead>
    <tbody>
      ${D.cenarios.map(c => `<tr${c.chave === 'FIRME' ? ' class="destaque"' : ''}>
        <td><strong>${esc(c.nome)}</strong></td>
        <td class="num">${brl0(c.antesComissao)}</td>
        <td class="num">${c.saldo25ago < 0 ? '<strong>' + brl0(c.saldo25ago) + '</strong>' : brl0(c.saldo25ago)}</td>
        <td class="num">${brl0(c.antesFolha)}</td>
        <td class="num">${c.saldo05set < 0 ? '<strong>' + brl0(c.saldo05set) + '</strong>' : brl0(c.saldo05set)}</td>
        <td class="num">${c.saldo10set < 0 ? '<strong>' + brl0(c.saldo10set) + '</strong>' : brl0(c.saldo10set)}</td>
        <td class="num">${c.diasNegativos}</td></tr>`).join('')}
    </tbody>
  </table>

  <h3>De onde vem o caixa de partida</h3>
  <table>
    <thead><tr><th>Conta</th><th class="num" style="width:16%">Saldo</th><th style="width:44%">Situação</th></tr></thead>
    <tbody>
      ${D.caixa.composicao.map(c => `<tr><td>${esc(c.rot)}</td><td class="num">${brl(c.valor)}</td><td class="small">${esc(c.nota)}</td></tr>`).join('')}
      <tr class="total"><td>Caixa consolidado</td><td class="num">${brl(D.caixa.inicial)}</td><td></td></tr>
    </tbody>
  </table>
  <p class="small">A conta corrente do Sicredi está zerada porque aquela conta opera por varredura — o dinheiro fica na aplicação e só desce na hora do pagamento. O resgate de R$ ${brl0(D.sicredi.valorCorrecao)} de 04/08 que faltava foi lançado em 20/08. <strong>⚠ O extrato do Sicredi de agosto nunca foi importado</strong>: o último movimento registrado é de ${dm(D.sicredi.ultimoMovimentoCC)}, ${D.sicredi.diasSemExtrato} dias atrás. Conferir no app antes de contar com esse dinheiro em 25/08.</p>

  ${foot()}
</section>

<!-- ============ 2. A JANELA ============ -->
<section class="page">
  <div class="head"><h2>O que entra e o que sai</h2><span class="n">02 · A janela</span></div>

  <figure>${gBalanco()}
    <figcaption>As duas barras estão na mesma escala. A parte clara da barra de cima é dinheiro que existe e está vencendo, mas cuja data de pagamento nunca foi combinada com a leiloeira. As duas últimas faixas da barra de baixo são estimativas: despesa que historicamente sai do banco sem nunca ter virado conta a pagar no sistema.</figcaption>
  </figure>

  <h3>Sai do caixa até 10/09</h3>
  <table>
    <thead><tr><th style="width:13%">Data</th><th>Compromisso</th><th class="num">Valor</th><th class="num" style="width:15%">Acumulado</th></tr></thead>
    <tbody>
      ${(() => {
        const g = [
          { data: '2026-08-20', rot: 'FGTS de julho, vencido e ainda em aberto', v: r2(D.pagar.filter(p => p.realocado).reduce((s, p) => s + p.valor, 0)) },
          { data: '2026-08-21', rot: 'Passagens da Expogenética — Fábio e Leonardo', v: r2(D.pagar.filter(p => p.data === '2026-08-21').reduce((s, p) => s + p.valor, 0)) },
          { data: '2026-08-24', rot: 'Faturas dos cartões Visa e Mastercard <span class="muted">(quitam o saldo do Bulinha)</span>', v: r2(D.pagar.filter(p => p.data === '2026-08-24').reduce((s, p) => s + p.valor, 0)) },
          { data: '2026-08-25', rot: `<strong>Comissões de julho — ${D.comissoes25agoItens.length} títulos</strong>`, v: D.comissoes25ago, d: true },
          { data: '2026-08-31', rot: 'Despesa operacional — Melhoradores Especial 30 Anos', v: r2(D.pagar.filter(p => p.data === '2026-08-31').reduce((s, p) => s + p.valor, 0)) },
          { data: '2026-09-05', rot: `<strong>Folha de agosto — ${D.folhaItens.length} pessoas</strong>`, v: D.folhaAgosto, d: true },
          { data: '2026-09-07', rot: 'FGTS de agosto <span class="tag est">estimado</span>', v: D.encargos.fgts },
          { data: '2026-09-10', rot: 'Honorários de contabilidade', v: r2(D.pagar.filter(p => p.data === '2026-09-10').reduce((s, p) => s + p.valor, 0)) },
          { data: '—', rot: 'Custo corrente que nunca vira título — cartão, viagem, leilão, marketing <span class="tag est">estimado</span>', v: totalCorrente },
        ].filter(x => x.v > 0)
        let ac = 0
        return g.map(x => { ac = r2(ac + x.v); return `<tr${x.d ? ' class="destaque"' : ''}><td>${x.data === '—' ? '<span class="muted">diluído</span>' : dm(x.data)}</td><td>${x.rot}</td><td class="num">${brl(x.v)}</td><td class="num muted">${brl0(ac)}</td></tr>` }).join('')
          + `<tr class="total"><td></td><td>Total comprometido na janela</td><td class="num">${brl(saiTotal)}</td><td class="num"></td></tr>`
      })()}
    </tbody>
  </table>

  <h3>Entra até 10/09 — e o que sustenta cada data</h3>
  <table>
    <thead><tr><th style="width:10%">Data</th><th>Título</th><th class="num">Valor</th><th style="width:33%">Por que essa data</th></tr></thead>
    <tbody>
      ${firmes.map(x => `<tr class="destaque"><td>${dm(x.data)}</td><td>${esc(corta(x.desc, 50))}</td><td class="num">${brl(x.valor)}</td><td class="small">${esc(x.motivo)}${x.obs ? ' <strong>— ' + esc(x.obs) + '</strong>' : ''}</td></tr>`).join('')}
      <tr class="total"><td></td><td>Com data acordada</td><td class="num">${brl(D.firmeza.firme)}</td><td></td></tr>
      ${semData.map(x => `<tr><td class="muted">${dm(x.data)}</td><td class="muted">${esc(corta(x.desc, 50))}</td><td class="num muted">${brl(x.valor)}</td><td class="small">Vencimento automático “leilão + 45 dias”, sem acordo</td></tr>`).join('')}
      <tr class="total"><td></td><td>Sem data acordada — ${pc(D.firmeza.pctSemData)} do total</td><td class="num">${brl(D.firmeza.semData)}</td><td></td></tr>
    </tbody>
  </table>

  ${foot()}
</section>

<!-- ============ 3. A COBRANÇA ============ -->
<section class="page">
  <div class="head"><h2>É cobrança, não corte de custo</h2><span class="n">03 · A alavanca</span></div>

  <p class="lead">Cortar não resolve: <strong>${pc(100 * r2(D.comissoes25ago + D.folhaAgosto) / saiTotal)}</strong> das saídas da janela são comissão de julho e folha de agosto — trabalho já entregue. O que decide o período é qual leiloeira paga primeiro.</p>

  <figure>${gConcentracao()}
    <figcaption>Quanto cada leiloeira responde do que está datado na janela. Três nomes — ${D.concentracao.slice(0, 3).map(g => g.grupo).join(', ')} — concentram ${pc(r2(D.concentracao.slice(0, 3).reduce((s, g) => s + g.pct, 0)))} do total, e nenhum dos três tem data acordada.</figcaption>
  </figure>

  <h3>Uma única cobrança resolve o mês</h3>
  <p>O <strong>Mega Evento EAO Baviera</strong> vale R$ ${brl(eaoG.valor)} entre fêmeas (25/08) e machos (26/08) — ${pc(eaoG.pct)} de tudo que está datado no período. Fechando só essa data, a folha de 05/09 passa de ${sinal(PISO.saldo05set)} para <strong>${sinal(EAO.saldo05set)}</strong>, a janela termina em ${sinal(EAO.saldo10set)} e <strong>o período inteiro passa sem um dia negativo</strong>. Existe contato direto: Max Pereira, gerente comercial.</p>

  <h3>Quanto precisa ser cobrado até cada marco</h3>
  <table>
    <thead><tr><th style="width:38%">Regra de segurança</th><th class="num">até 25/08</th><th class="num">até 31/08</th><th class="num">até 05/09</th><th class="num">até 10/09</th></tr></thead>
    <tbody>
      ${D.necessidade.map((n, i) => `<tr${i === 0 ? ' class="destaque"' : ''}><td>${esc(n.rot)}</td>
        ${n.linha.map(x => `<td class="num">${x.precisa > 0 ? brl0(x.precisa) : '—'}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>
  <p class="small">Partindo só do que tem data acordada, é quanto precisa entrar de cobrança nova até aquele dia. <strong>Até 31/08 não precisa de nada</strong> — a necessidade só nasce na folha. E adiar as comissões para 05/09 não muda uma linha das colunas de setembro: o dinheiro continua faltando, só mais tarde.</p>

  <h3>O estoque de cobrança que ninguém está olhando</h3>
  <div class="tiles">
    <div class="tile"><div class="k">Vencido total</div><div class="v"><span class="cur">R$</span>${brl0(D.vencidos.total)}</div><div class="d">${D.vencidos.n} títulos, nenhum em qualquer cenário</div></div>
    <div class="tile"><div class="k">Vencido há menos de 60 dias</div><div class="v"><span class="cur">R$</span>${brl0(D.vencidos.ate60)}</div><div class="d">O mais recuperável do estoque</div></div>
    <div class="tile"><div class="k">Vencido há mais de 60 dias</div><div class="v"><span class="cur">R$</span>${brl0(D.vencidos.mais60)}</div><div class="d">Exige decisão: cobrar ou baixar</div></div>
    <div class="tile gold"><div class="k">Basta recuperar</div><div class="v">${pc(100 * nec('2026-09-10') / D.vencidos.ate60)}</div><div class="d">do vencido recente para fechar toda a janela</div></div>
  </div>

  <table>
    <thead><tr><th style="width:10%">Venceu</th><th class="num" style="width:8%">Dias</th><th>Os cinco maiores títulos vencidos</th><th class="num">Valor</th></tr></thead>
    <tbody>
      ${D.vencidos.itens.slice().sort((a, b) => b.valor - a.valor).slice(0, 5).map(v =>
        `<tr><td>${dm(v.data)}</td><td class="num">${v.idade}</td><td>${esc(corta(v.desc, 64))}</td><td class="num">${brl(v.valor)}</td></tr>`).join('')}
    </tbody>
  </table>

  ${foot()}
</section>

<!-- ============ 4. AS DUAS DECISÕES ============ -->
<section class="page">
  <div class="head"><h2>Comissões e folha</h2><span class="n">04 · Decisão</span></div>

  <h3>25/08 — comissões de julho: R$ ${brl(D.comissoes25ago)}</h3>
  <p><strong>A comissão integral cabe</strong> sem cobrar nada de ninguém: o dia fecha em ${sinal(PISO.saldo25ago)} e o caixa só volta a apertar na folha. Querendo guardar colchão, o teto cai — mas colchão aqui é ilusório, porque ele some em 05/09 de qualquer forma se a cobrança não andar.</p>
  <table>
    <thead><tr><th style="width:42%">Regra de segurança</th><th class="num">Comissão pagável sem cobrar nada</th><th class="num">% do devido</th><th class="num">Com o EAO pagando</th></tr></thead>
    <tbody>
      ${D.capacidade.map(c => `<tr${c.colchao === 0 ? ' class="destaque"' : ''}><td>${esc(c.rot)}</td>
        <td class="num"><strong>${brl(c.valor)}</strong>${c.pct >= 99.9 ? ' <span class="tag ok">integral</span>' : ''}</td>
        <td class="num muted">${pc(c.pct)}</td>
        <td class="num">${brl(c.valorEao)}${c.pctEao >= 99.9 ? ' <span class="tag ok">integral</span>' : ''}</td></tr>`).join('')}
    </tbody>
  </table>

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
  <p>É aqui que o caixa fura: 05/09 fecha em ${sinal(PISO.saldo05set)}. <strong>É a folha que exige cobrança, não a comissão</strong> — e são R$ ${brl(nec('2026-09-05'))}, ou ${pc(100 * nec('2026-09-05') / eaoG.valor)} do que o EAO Baviera sozinho vale. A folha é a saída menos adiável do período, então a ordem é: <strong>pagar a comissão em 25/08 e usar as duas semanas seguintes para fechar cobrança</strong>, não o contrário.</p>

  <div class="box rule">
    <p style="margin:0"><strong>Adiar as comissões para 05/09 não é solução.</strong> O dia 05/09 fecha em ${sinal(ADIA.saldo05set)} — exatamente igual ao cenário em que elas são pagas em 25/08. Só empurra o problema onze dias e concentra R$ ${brl(r2(D.comissoes25ago + D.folhaAgosto))} num único dia, sem ganhar um centavo.</p>
  </div>

  <h3>O risco que não depende de ninguém de fora</h3>
  <p>O repasse da Bula Remates — R$ ${brl(D.remates.totalReal)} de Kirz e Neloraço — estava previsto para hoje e <strong>não entrou até 13h47</strong>. Todos os cenários já contam com ele hoje. Se atrasar:</p>
  <table>
    <thead><tr><th style="width:24%">Atraso do repasse</th><th class="num">24/08</th><th class="num">25/08</th><th class="num">Pior dia até 04/09</th><th class="num">10/09</th></tr></thead>
    <tbody>
      ${D.sensibilidade.filter(s => [0, 5, 7, 10].includes(s.atrasoRemates)).map(s =>
        `<tr${s.atrasoRemates === 0 ? ' class="destaque"' : ''}><td>${s.atrasoRemates === 0 ? 'Entra hoje' : '+' + s.atrasoRemates + ' dias (' + dm('2026-08-' + String(20 + s.atrasoRemates).padStart(2, '0')) + ')'}</td>
        <td class="num">${brl0(s.antesComissao)}</td><td class="num">${brl0(s.saldo25ago)}</td><td class="num">${brl0(s.minAteFolha)}</td><td class="num">${brl0(s.saldo10set)}</td></tr>`).join('')}
    </tbody>
  </table>
  <p class="small">Até 5 dias de atraso nada muda no dia das comissões. <strong>A partir de 7 dias</strong> o dia 25/08 vira ${sinal(sens(7).saldo25ago)} — e a comissão deixa de caber. É o único risco da janela que se resolve com um telefonema interno, para o Felipe.</p>

  ${foot()}
</section>

<!-- ============ 5. DEPOIS DA JANELA ============ -->
<section class="page">
  <div class="head"><h2>Três dias depois</h2><span class="n">05 · Contexto</span></div>

  <p class="lead">A janela termina em 10/09. O que vem logo depois muda a leitura do risco: <strong>isto não é um mês ruim, é um vale de três semanas antes de uma entrada grande</strong>.</p>

  <table>
    <thead><tr><th style="width:10%">Data</th><th>Evento</th><th class="num">Valor</th><th style="width:26%">Situação</th></tr></thead>
    <tbody>
      <tr class="destaque"><td>13/09</td><td><strong>2ª parcela do 10º Leilão Nelore JMP</strong> (fêmeas + touros)</td><td class="num">${brl(D.jmp2)}</td><td class="small">Contrato JBJ, 2x — a 1ª entrou em 10/08</td></tr>
      <tr><td>15/09</td><td>ISSQN referente a agosto <span class="tag est">estimado</span></td><td class="num">${brl(r2(D.impostosAgosto.piso * D.mixIss))}</td><td class="small">Sobre o caixa recebido em agosto</td></tr>
      <tr><td>20/09</td><td>DAS do Simples referente a agosto <span class="tag est">estimado</span></td><td class="num">${brl(r2(D.impostosAgosto.piso * (1 - D.mixIss)))}</td><td class="small">Idem</td></tr>
      <tr><td>25/09</td><td>Comissões de agosto — ${D.pos25set.n} títulos <span class="muted">(entra a 2ª parcela do Guadalupe, R$ ${brl0(D.pos25set.guadalupeP2)})</span></td><td class="num">${brl(D.pos25set.comissoes)}</td><td class="small">Já lançadas no ERP</td></tr>
      <tr class="total"><td></td><td>A receber entre 11/09 e 30/09</td><td class="num">${brl(D.depoisTotal)}</td><td class="small">Só R$ ${brl0(D.depoisFirme)} com data</td></tr>
    </tbody>
  </table>

  <div class="box dark">
    <div class="t">A armadilha de setembro</div>
    <p style="margin:0">Os R$ ${brl(D.jmp2)} do JMP entram em 13/09 e as guias de agosto vencem em 15 e 20/09. <strong>A folga dura dois dias.</strong> Pela carga efetiva observada — ${pc(D.taxaTributaria.media)} do caixa recebido, medida em maio, junho e julho — as guias de agosto ficam entre R$ ${brl0(D.impostosAgosto.piso)} (se a cobrança não avançar) e R$ ${brl0(D.impostosAgosto.nominal)} (se agosto receber tudo que está datado). Quanto mais a Bula cobrar em agosto, maior a guia de setembro: é imposto sobre receita bruta, não sobre lucro.</p>
  </div>

  <h3>Por que a projeção inclui despesa que não está lançada</h3>
  <p>O ERP pré-lança folha, comissão e débitos agendados — e mais nada. Cartão, viagem, combustível, marketing, manutenção, alimentação e despesa operacional de leilão só viram lançamento quando o extrato chega. Projetar só com título lançado subestima a saída em cerca de <strong>R$ ${brl0(D.custoCorrente.media)} por mês</strong>.</p>
  <table>
    <thead><tr><th style="width:26%">Janela</th><th class="num">Esperado pela média</th><th class="num">Já lançado</th><th class="num">Acrescentado ao fluxo</th></tr></thead>
    <tbody>
      ${D.residuos.map(x => `<tr><td>${x.mes === '2026-08' ? '20 a 31/08' : '1 a 10/09'}</td>
        <td class="num">${brl(x.esperado)}</td><td class="num muted">${brl(x.lancado)}</td><td class="num"><strong>${brl(x.residuo)}</strong></td></tr>`).join('')}
      <tr class="total"><td>Total</td><td class="num"></td><td class="num"></td><td class="num">${brl(totalCorrente)}</td></tr>
    </tbody>
  </table>
  <p class="small">Base: média das saídas do Sicoob em abr–jul, fora comissão, folha, imposto, encargos e transferências internas (R$ ${brl(D.custoCorrente.media)}/mês). Agosto já gastou R$ ${brl(D.custoCorrente.agostoAte20)} até o dia 20 — mês de Expogenética.</p>

  <div class="box">
    <div class="t">Dois acertos que já entraram nestes números</div>
    <p class="small" style="margin:0 0 2mm"><strong>Guadalupe.</strong> A leiloeira confirmou a comissão do 20º Leilão em ${dm('2026-08-20')}: R$ ${brl(D.guadalupeAcordo.total)} em 2 parcelas de R$ ${brl(D.guadalupeAcordo.parcela)} (1ª em 25/08). O ERP cobrava R$ ${brl(D.guadalupeAcordo.antesNoErp)} — aplicava aos touros uma faixa de 0,75% que nunca foi confirmada. Corrigido: a receita de julho caiu R$ ${brl(Math.abs(D.guadalupeAcordo.delta))}, e a 1ª parcela é uma das poucas entradas com data acordada desta janela.</p>
    <p class="small" style="margin:0"><strong>Bulinha.</strong> As faturas de cartão de ${dm(D.acertoBulinha.data)} (R$ ${brl(D.acertoBulinha.compensado)}) abatem o saldo de comissão devido a ele (R$ ${brl(D.acertoBulinha.devidoOriginal)}), restando R$ ${brl(D.acertoBulinha.residual)}. As 410 compras registradas nos cartões da Bula têm 100% de portador FELIPE V ANDRADE. Antes disso o ERP esperava R$ ${brl(r2(D.acertoBulinha.compensado + D.acertoBulinha.devidoOriginal))} saindo nessas contas, contra R$ ${brl(D.acertoBulinha.compensado)} de desembolso real.</p>
  </div>

  ${foot()}
</section>

<!-- ============ 6. AÇÃO ============ -->
<section class="page">
  <div class="head"><h2>O que fazer</h2><span class="n">06 · Ação</span></div>

  <h3>Nesta ordem</h3>
  <ol>
    <li><strong>Hoje: cobrar o repasse da Bula Remates com o Felipe.</strong> R$ ${brl(D.remates.totalReal)} estavam previstos para entrar hoje e não entraram. É dinheiro interno e resolve-se com um telefonema — e é o que sustenta o dia 24/08 em R$ ${brl0(PISO.antesComissao)}. Na mesma conversa dá para fechar o residual de R$ ${brl(D.acertoBulinha.residual)} que ficou do acerto do cartão.</li>
    <li><strong>Até 24/08: confirmar o saldo do Sicredi no app.</strong> São R$ ${brl(D.caixa.sicrediLiquido)} do caixa consolidado e o extrato daquela conta não é importado desde ${dm(D.sicredi.ultimoMovimentoCC)}. Estando lá, transferir para o Sicoob antes do pagamento.</li>
    <li><strong>Em 25/08, pagar a comissão integral.</strong> R$ ${brl(D.comissoes25ago)} cabem — o dia fecha em ${sinal(PISO.saldo25ago)}. Não há motivo para pagar parcial nem para adiar.</li>
    <li><strong>Até 22/08: fechar data com o EAO Baviera.</strong> R$ ${brl(eaoG.valor)} entre as duas etapas — ${pc(eaoG.pct)} de tudo que está datado na janela. Sozinho, tira o período inteiro do negativo. Contato: Max Pereira.</li>
    <li><strong>Até 02/09: ter R$ ${brl(nec('2026-09-05'))} de cobrança fechados.</strong> É o que falta para a folha de 05/09 não furar o caixa. Se o EAO fechar, já está resolvido.</li>
    <li><strong>Cobrar a Genética Aditiva e a Nelore Santa Cruz na sequência.</strong> Juntas são R$ ${brl0(r2(D.concentracao.find(g => g.grupo === 'Genética Aditiva').valor + D.concentracao.find(g => g.grupo === 'Nelore Santa Cruz').valor))} vencendo entre 28/08 e 09/09, com contato conhecido (Claudinei Sandim e Nelore Santa Cruz).</li>
    <li><strong>Atacar os R$ ${brl(D.vencidos.ate60)} vencidos há menos de 60 dias.</strong> Não entram em nenhum cenário deste relatório. Recuperar ${pc(100 * nec('2026-09-10') / D.vencidos.ate60)} deles fecha a janela inteira.</li>
    <li><strong>Passar a registrar a data acordada no título.</strong> Enquanto o vencimento for “leilão + 45 dias” automático, ${pc(D.firmeza.pctSemData)} de qualquer projeção de caixa desta empresa será chute. É a correção de raiz — e é de graça.</li>
  </ol>

  <h3>Calendário de decisão</h3>
  <table>
    <thead><tr><th style="width:12%">Data</th><th style="width:31%">O que checar</th><th>Se estiver resolvido</th><th>Se não estiver</th></tr></thead>
    <tbody>
      <tr class="destaque"><td><strong>hoje</strong></td><td>Repasse da Bula Remates caiu</td><td>24/08 fecha em R$ ${brl0(PISO.antesComissao)}</td><td>Cobrar o Felipe antes de 25/08</td></tr>
      <tr><td>até 24/08</td><td>Saldo do Sicredi confirmado no app</td><td>Caixa de partida confirmado</td><td>Refazer a conta só com o Sicoob</td></tr>
      <tr><td>até 25/08</td><td>1ª parcela do Guadalupe (R$ ${brl0(D.guadalupeAcordo.parcela)})</td><td>Acordo cumprido, cobrar a 2ª em 25/09</td><td>Ligar para a Valéria — foi acordo de 20/08</td></tr>
      <tr><td>até 02/09</td><td>R$ ${brl0(nec('2026-09-05'))} de cobrança fechados</td><td>Folha de 05/09 garantida</td><td>Negociar prazo da folha com a equipe</td></tr>
      <tr><td>até 10/09</td><td>Confirmação da 2ª parcela do JMP para 13/09</td><td>Setembro vira mês de folga</td><td>Refazer esta projeção antes de qualquer compromisso novo</td></tr>
    </tbody>
  </table>

  <div class="box">
    <div class="t">O que este relatório não sabe</div>
    <p class="small" style="margin:0">(a) O Sicoob está conciliado 1:1 com o extrato de 20/08 13h47 — R$ ${brl(D.caixa.sicoob)}. (b) O extrato do Sicredi de agosto nunca foi importado: os R$ ${brl(D.caixa.sicrediLiquido)} são a posição do ERP em ${dm(D.sicredi.ultimoMovimentoApp)}, conferida no app naquele dia, não um saldo bancário de hoje. (c) As guias de agosto são estimativa por carga efetiva, não cálculo do contador. (d) O FGTS de julho (R$ ${brl(D.encargos.fgts)}) segue em aberto no sistema e não apareceu no extrato — conferir se foi pago por fora. (e) A classificação “tem data acordada” vem de uma tabela única no script gerador: se alguma cobrança da lista da página 2 já foi combinada por telefone, avisar que os números mudam na hora. (f) A 2ª parcela do Guadalupe foi lançada para 25/09 por convenção — a conversa só fixou a primeira. (g) A fatura de cartão de agosto ainda não existe detalhada no módulo de cartões; o rateio por portador foi conferido nas 410 compras de janeiro a julho. (h) O 13º salário vence fora do horizonte e não está aqui.</p>
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
const pdfPath = path.join(desktop, 'Bula - Fluxo de Caixa Consolidado ate 10-09-2026.pdf')
await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '14mm', left: '11mm', right: '11mm' } })
await browser.close()
console.log('PDF:', pdfPath)
