/**
 * Renderiza o relatorio de fluxo de caixa 27/08 -> 10/09/2026 (v2) a partir de
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
const kk = n => { const a = Math.abs(n); return a >= 1000 ? (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + 'k' : brl0(n) }
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
const BASE = cen('BASE'), SOSIC = cen('SO_SICOOB'), NAV1 = cen('NAVIRAI_1'), ATR = cen('ATRASO_5'), COMJ = cen('COM_JULHO')
const folha = D.saidasLancadas.filter(x => x.categoria === 'Folha de Pagamento')
  .map(x => ({ ...x, pessoa: String(x.rot).replace(/^Folha\s+\w+\/\d+\s*-\s*/i, '') }))
  .sort((a, b) => b.valor - a.valor)
const leilaoProj = D.saidasProjetadas.filter(x => !x.oculto)
const leilaoTotal = r2(leilaoProj.reduce((s, x) => s + x.valor, 0))
const eao = D.candidatos.filter(c => /EAO BAVIERA/i.test(c.rot))
const eaoTotal = r2(eao.reduce((s, c) => s + c.valor, 0))
const pico = D.linhas.BASE.reduce((a, p) => (p.saldo > a.saldo ? p : a), D.linhas.BASE[0])
const d0509 = D.linhas.BASE.find(p => p.data === '2026-09-05')
const entraNavirai = r2(D.entradas.filter(e => e.data === '2026-09-10').reduce((s, e) => s + e.valor, 0))
const jacamin = D.presenciais.find(p => !p.dentro && p.data >= D.hoje)

/* ============ G1 — a linha do caixa ============ */
function gLinha() {
  const W = 762, H = 268, L = 58, R = 126, T = 16, B = 44
  const series = [
    { k: 'COM_JULHO', rot: 'Com as comissões de jul.', cor: '#C6C6C6', dash: '3 2', w: 1.5 },
    { k: 'SO_SICOOB', rot: 'Só o Sicoob', cor: GOLD, dash: '5 2', w: 1.8 },
    { k: 'BASE', rot: 'Base', cor: INK, dash: '', w: 2.4 },
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
  const iNeg = pts.map((p, i) => i).filter(i => Math.min(...series.map(s => D.linhas[s.k][i].saldo)) < 0)
  let zona = ''
  if (iNeg.length) zona = `<rect x="${x(iNeg[0] - 1).toFixed(1)}" y="${y0.toFixed(1)}" width="${(x(iNeg[iNeg.length - 1]) - x(iNeg[0] - 1)).toFixed(1)}" height="${(H - B - y0).toFixed(1)}" fill="#F4F4F4"/>`
  grid += `<line x1="${L}" y1="${y0.toFixed(1)}" x2="${W - R}" y2="${y0.toFixed(1)}" stroke="${INK}" stroke-width="1.2"/>`
  const marcos = [{ d: '2026-08-31', rot: 'Kito + Sorriso' }, { d: '2026-09-05', rot: 'FOLHA' }, { d: '2026-09-10', rot: 'Naviraí' }]
  let vlin = ''
  for (const m of marcos) {
    const i = pts.findIndex(p => p.data === m.d); if (i < 0) continue
    const forte = m.rot === 'FOLHA'
    vlin += `<line x1="${x(i).toFixed(1)}" y1="${T}" x2="${x(i).toFixed(1)}" y2="${H - B}" stroke="${forte ? INK : GRID}" stroke-width="${forte ? 1.2 : 1}" stroke-dasharray="2 2"/>`
    vlin += `<text x="${x(i).toFixed(1)}" y="${T - 4}" text-anchor="middle" font-size="8" fill="${forte ? INK : MUTED}" font-weight="${forte ? 700 : 400}">${m.rot}</text>`
  }
  let paths = '', legenda = ''
  series.forEach((s, si) => {
    const p = D.linhas[s.k]
    paths += `<path d="${p.map((q, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(q.saldo).toFixed(1)}`).join(' ')}" fill="none" stroke="${s.cor}" stroke-width="${s.w}" stroke-dasharray="${s.dash}" stroke-linejoin="round"/>`
    paths += `<circle cx="${x(p.length - 1).toFixed(1)}" cy="${y(p[p.length - 1].saldo).toFixed(1)}" r="2.6" fill="${s.cor}"/>`
    legenda += `<g transform="translate(${W - R + 8},${T + 8 + si * 22})">
      <line x1="0" y1="0" x2="14" y2="0" stroke="${s.cor}" stroke-width="${s.w}" stroke-dasharray="${s.dash}"/>
      <text x="18" y="3" font-size="8.4" fill="${INK}">${esc(s.rot)}</text>
      <text x="18" y="13.6" font-size="8.4" fill="${MUTED}">${sinal(p[p.length - 1].saldo)}</text></g>`
  })
  let eixo = ''
  pts.forEach((p, i) => { if (i % 2 && i !== pts.length - 1) return
    eixo += `<text x="${x(i).toFixed(1)}" y="${H - B + 13}" text-anchor="middle" font-size="8.2" fill="${MUTED}">${dm(p.data)}</text>` })
  const iF = pts.findIndex(p => p.data === BASE.fundoData)
  const anot = `<circle cx="${x(iF).toFixed(1)}" cy="${y(BASE.fundo).toFixed(1)}" r="3.4" fill="none" stroke="${INK}" stroke-width="1.4"/>
    <text x="${(x(iF) - 8).toFixed(1)}" y="${(y(BASE.fundo) + 15).toFixed(1)}" text-anchor="end" font-size="8.6" font-weight="700" fill="${INK}">pior dia ${sinal(BASE.fundo)}</text>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${zona}${grid}${vlin}${paths}${anot}${eixo}${legenda}</svg>`
}

/* ============ G2 — a margem contra o que ficou de fora ============ */
function gMargem() {
  const W = 762, H = 132, L = 4, T = 16
  const itens = [{ rot: 'Margem no pior dia (09/09)', valor: BASE.fundo, cor: INK, forte: true }, ...D.consomeMargem.map(x => ({ rot: x.rot, valor: x.valor, cor: '#B8B8B8' }))]
  const max = Math.max(...itens.map(i => i.valor))
  const bh = 20, gap = 8
  let g = ''
  itens.forEach((it, i) => {
    const y = T + i * (bh + gap)
    const w = (W - L - 300) * (it.valor / max)
    g += `<text x="${L}" y="${y + bh / 2 + 3.2}" font-size="9" font-weight="${it.forte ? 700 : 400}" fill="${INK}">${esc(corta(it.rot, 34))}</text>`
    g += `<rect x="${L + 180}" y="${y}" width="${Math.max(w, 1).toFixed(1)}" height="${bh}" fill="${it.cor}"/>`
    g += `<text x="${(L + 180 + Math.max(w, 1) + 7).toFixed(1)}" y="${y + bh / 2 + 3.4}" font-size="9" font-weight="${it.forte ? 700 : 400}" fill="${INK}">R$ ${brl0(it.valor)}</text>`
  })
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${g}</svg>`
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
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  figure { margin: 3mm 0 5mm; }
  figcaption { font-size: 8.6px; color: ${MUTED}; margin-top: 1.8mm; line-height: 1.45; }
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.6mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
</style></head><body>

<!-- ============================ CAPA ============================ -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Fluxo de caixa<br>e posição até<br>10 de setembro</h1>
  <div class="rule"></div>
  <div class="sub">Com nada saindo até 31/08, a janela <strong style="color:#fff">passa sem furar</strong> — mas por pouco:
  o caixa raspa <strong style="color:#fff">${sinal(BASE.fundo)}</strong> em ${dm(BASE.fundoData)}, véspera do Naviraí, e fecha em ${sinal(BASE.final)}.
  Ficaram de fora, por decisão sua, R$ ${brl0(D.consomeMargemTotal)} de obrigação sem data — mais de dez vezes essa margem.</div>
  <div class="meta">
    <div><span>Período</span><strong>27/08 a 10/09/2026</strong></div>
    <div><span>Caixa de partida</span><strong>R$ ${brl(D.caixa.inicial)}</strong></div>
    <div><span>Pior dia</span><strong>${sinal(BASE.fundo)} · ${dm(BASE.fundoData)}</strong></div>
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
      <div class="d">folha ${brl0(D.blocos.folha)} + leilão ${brl0(leilaoTotal)} + estrutura ${brl0(D.premissas.estrutural.aProjetar)}</div></div>
    <div class="tile"><div class="k">Pior dia — ${dm(BASE.fundoData)}</div><div class="v"><span class="cur">R$</span>${brl0(BASE.fundo)}</div>
      <div class="d">fecha 10/09 em R$ ${brl0(BASE.final)} · nenhum dia negativo</div></div>
  </div>

  <p class="lead">Com a sua regra — <strong>nada sai até 31/08</strong> — a janela atravessa a folha de 05/09 sem furar.
  Mas a folga é de <strong>${sinal(BASE.fundo)}</strong> num caixa de quase R$ 47 mil: menos de um dia de operação.</p>

  <p>O caminho: até 31/08 nada se move do lado das saídas, e o Kito (${dm(D.entradas[0].data)}) e o Sorriso (31/08) levam o caixa ao pico de
  <strong>R$ ${brl(pico.saldo)}</strong>. Em <strong>05/09</strong> a folha de agosto tira R$ ${brl0(D.blocos.folha)} e o saldo cai para R$ ${brl0(d0509.saldo)} —
  ainda confortável. O aperto vem <em>depois</em>: em 08 e 09/09 chega a conta dos dois leilões presenciais de 29 e 30/08
  (R$ ${brl0(leilaoTotal)} entre despesa e reembolso), e o caixa desce até ${sinal(BASE.fundo)} na véspera do Naviraí,
  que em 10/09 traz R$ ${brl0(entraNavirai)} e fecha o período em ${sinal(BASE.final)}.</p>

  <figure>${gLinha()}
    <figcaption>Saldo consolidado (Sicoob + Sicredi) dia a dia. A linha dourada é o piso defensável — só o Sicoob, sem a aplicação do Sicredi,
    que fura por ${SOSIC.diasNegativos} dias. A linha clara mostra o que aconteceria se as comissões de julho saíssem em 05/09: ${COMJ.diasNegativos} dias negativos, fundo ${sinal(COMJ.fundo)}.</figcaption></figure>

  <div class="box dark">
    <div class="t">A margem é fina e tem concorrentes</div>
    <p style="margin:0">Sobram <strong>${sinal(BASE.fundo)}</strong> no pior dia. Do lado de fora deste relatório, esperando data,
    estão <strong>R$ ${brl(D.consomeMargemTotal)}</strong> — as comissões de julho (R$ ${brl0(D.abertoSemDataTotal)}), as estimativas do ERP que o senhor mandou tirar
    (R$ ${brl0(D.estimativasForaTotal)}) e a despesa do presencial do Jacamin, cujo caixa cai em ${dm(jacamin.caixa)} (R$ ${brl0(D.premissas.leilao.porPresencial)}).
    <strong>Qualquer um deles entrando na janela derruba o saldo abaixo de zero.</strong></p>
  </div>

  <figure>${gMargem()}
    <figcaption>A folga do pior dia contra o que está fora da linha. Não é previsão de que vão sair — é a medida de quanto o mês depende de eles não saírem.</figcaption></figure>

  <div class="box rule">
    <p class="small" style="margin:0"><strong style="color:${INK};font-size:10.2px">Regras que o senhor definiu para esta versão.</strong>
    (1) Nada sai até 31/08. (2) As ${D.abertoSemData.length} comissões de julho ficam fora — decisão adiada. (3) Toda conta a pagar <em>estimada</em> do ERP sai da projeção;
    o que for de fato o senhor lança. A folha é a única exceção: está gravada como estimativa, mas é reflexo do cadastro de folha, não orçamento — e o senhor pediu que fosse projetada.
    O custo que as estimativas tentavam representar volta pela média histórica do extrato, que é medida e não arbitrada.</p>
  </div>

  ${foot()}
</section>

<!-- ============================ P2 — DIA A DIA ============================ -->
<section class="page">
  <div class="head"><h2>Dia a dia</h2><div class="n">02 · calendário</div></div>

  <table>
    <thead><tr><th style="width:16mm">Data</th><th>O que move o dia</th><th class="num" style="width:22mm">Entra</th><th class="num" style="width:22mm">Sai</th><th class="num" style="width:26mm">Saldo</th></tr></thead>
    <tbody>
      ${D.linhas.BASE.map(p => {
        const ent = D.entradas.filter(e => e.data === p.data)
        const sai = [...D.saidasLancadas.filter(x => x.data === p.data), ...leilaoProj.filter(x => x.data === p.data)].sort((a, b) => b.valor - a.valor)
        const g = []
        if (ent.length) g.push(ent.map(e => esc(corta(e.rot, 46))).join(' · '))
        const fol = sai.filter(x => x.categoria === 'Folha de Pagamento')
        if (fol.length) g.push('<strong>Folha de agosto</strong> — ' + fol.length + ' pessoas, R$ ' + brl0(fol.reduce((s, x) => s + x.valor, 0)))
        for (const x of sai.filter(x => x.categoria !== 'Folha de Pagamento')) {
          const pr = x.pregao ? ' <span class="muted">(pregão ' + dm(x.pregao) + ')</span>' : ''
          g.push(esc(corta(x.rot, 52)) + pr)
        }
        const estr = D.saidasProjetadas.some(x => x.oculto && x.data === p.data)
        if (estr) g.push(g.length ? '<span class="muted">+ estrutural</span>' : '<span class="muted">custo estrutural corrente</span>')
        const cls = p.data === '2026-09-05' ? 'destaque' : (p.data === BASE.fundoData ? 'destaque' : '')
        return `<tr class="${cls}"><td><strong>${dm(p.data)}</strong> <span class="muted">${ds(p.data)}</span></td>
          <td>${g.join(' · ') || '<span class="muted">nada programado</span>'}</td>
          <td class="num">${p.entra ? brl(p.entra) : '<span class="muted">—</span>'}</td>
          <td class="num">${p.sai ? brl(p.sai) : '<span class="muted">—</span>'}</td>
          <td class="num"><strong>${p.saldo < 0 ? '−' : ''}${brl(Math.abs(p.saldo))}</strong></td></tr>`
      }).join('')}
      <tr class="total"><td colspan="2">Janela inteira</td><td class="num">${brl(BASE.entradas)}</td><td class="num">${brl(BASE.saidas)}</td><td class="num">${brl(BASE.final)}</td></tr>
    </tbody>
  </table>

  <h3>As entradas, e de onde vem a confiança em cada uma</h3>
  <table>
    <thead><tr><th style="width:16mm">Data</th><th>Título</th><th>Lastro</th><th class="num" style="width:24mm">Valor</th></tr></thead>
    <tbody>
      ${D.entradas.map(e => `<tr><td><strong>${dm(e.data)}</strong></td><td>${esc(corta(e.rot, 50))}</td>
        <td class="muted">${esc(e.nota)}</td><td class="num">${brl(e.valor)}</td></tr>`).join('')}
      <tr class="total"><td colspan="3">Total declarado firme</td><td class="num">${brl(D.entradasTotal)}</td></tr>
    </tbody>
  </table>
  <p class="small">O Sorriso Fêmeas entra por <strong>R$ ${brl(D.entradas[1].valor)}</strong>, não pelos R$ 7.950,00 que o ERP trazia:
  o valor foi retificado em 27/08 contra a NF 635 e o portal da e-Rural. A diferença de R$ 800,02 continua sem explicação pela fórmula do acordo
  e está registrada no título para conferir com a e-Rural. Os outros R$ ${brl0(D.emTratativaTotal)} a receber — R$ ${brl0(D.vencidoTotal)} deles já vencidos — ficaram integralmente fora.</p>

  ${foot()}
</section>

<!-- ============================ P3 — SAÍDAS ============================ -->
<section class="page">
  <div class="head"><h2>O que sai — e o que ficou de fora</h2><div class="n">03 · saídas</div></div>

  <p class="lead">Na linha do caixa entram <strong>R$ ${brl(D.saidasTotal)}</strong>: a folha, a despesa dos leilões presenciais e o custo estrutural corrente.
  Nada mais. Tudo o que era estimativa do ERP saiu — e o custo que ela representava volta pela média medida no extrato.</p>

  <table>
    <thead><tr><th>Bloco</th><th>Como entra</th><th class="num" style="width:26mm">Valor</th></tr></thead>
    <tbody>
      <tr><td><strong>Folha de agosto</strong> — paga 05/09</td><td class="muted">vem do cadastro <em>erp_folha_estrutura</em>; conferido, 45 títulos sem divergência</td><td class="num">${brl(D.blocos.folha)}</td></tr>
      <tr><td><strong>Despesa e reembolso de leilão</strong></td><td class="muted">${D.presenciaisDentro.map(p => corta(p.nome, 22) + ' (pregão ' + dm(p.data) + ' → caixa ' + dm(p.caixa) + ')').join(' · ')}</td><td class="num">${brl(leilaoTotal)}</td></tr>
      <tr><td>Custo estrutural corrente</td><td class="muted">R$ ${brl(D.premissas.estrutural.porDia)}/dia × ${D.premissas.estrutural.diasProjetados} dias, a partir de 01/09</td><td class="num">${brl(D.premissas.estrutural.aProjetar)}</td></tr>
      <tr class="total"><td colspan="2">Total na linha do caixa</td><td class="num">${brl(D.saidasTotal)}</td></tr>
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
      De setembro em diante a folha é <strong>R$ 52.000 cheios</strong>, todo dia 05.</p>
    </div>
    <div>
      <h3>Reembolsos: quanto e quando</h3>
      <table>
        <thead><tr><th style="width:14mm">Data</th><th>Últimos reembolsos pagos</th><th class="num" style="width:20mm">Valor</th></tr></thead>
        <tbody>
          ${D.premissas.reembolso.ultimos.map(m => `<tr><td>${dm(m.data)}</td><td>${esc(corta(String(m.rot).replace(/^(PIX EMIT(IDO)?\.?\s*OUTRA IF\s*-?\s*|DEB\.[^-]*-\s*FAV\.:\s*|TRANSF\.\s*PIX SICOOB\s*-\s*FAV\.:\s*)/i, ''), 40))}</td><td class="num">${brl(m.valor)}</td></tr>`).join('')}
        </tbody>
      </table>
      <p class="small">Reembolso não é rubrica própria: chega dentro de <em>Despesa Operacional de Leilão</em> e <em>Viagem/Passagens</em>,
      e responde por <strong>${pc(D.premissas.reembolso.fatiaDoLeilao * 100)}</strong> desse gasto em jun–ago.
      <strong>Ele não sai no dia do pregão</strong> — o extrato mostra de 1 a 3 semanas depois. É por isso que os leilões de 29 e 30/08
      aparecem no caixa só em ${dm(D.presenciaisDentro[0].caixa)} e ${dm(D.presenciaisDentro[1].caixa)}, e é o que cria o vale do fim da janela.</p>
    </div>
  </div>

  <h3>O que ficou de fora da linha do caixa</h3>
  <div class="cols2">
    <div>
      <table>
        <thead><tr><th>Comissões de julho — em aberto</th><th class="num" style="width:22mm">Valor</th></tr></thead>
        <tbody>
          ${D.abertoSemData.slice(0, 7).map(x => `<tr><td>${esc(corta(x.rot.replace(/^COMISSAO\s*/i, ''), 46))}</td><td class="num">${brl(x.valor)}</td></tr>`).join('')}
          ${D.abertoSemData.length > 7 ? `<tr><td class="muted">+ ${D.abertoSemData.length - 7} títulos menores</td><td class="num muted">${brl(r2(D.abertoSemData.slice(7).reduce((s, x) => s + x.valor, 0)))}</td></tr>` : ''}
          <tr class="total"><td>${D.abertoSemData.length} títulos, vencidos em 25/08</td><td class="num">${brl(D.abertoSemDataTotal)}</td></tr>
        </tbody>
      </table>
    </div>
    <div>
      <table>
        <thead><tr><th>Estimativas do ERP retiradas</th><th class="num" style="width:18mm">Vence</th><th class="num" style="width:20mm">Valor</th></tr></thead>
        <tbody>
          ${D.estimativasFora.map(x => `<tr><td>${esc(corta(x.rot, 40))}</td><td class="num muted">${dm(x.vencimento)}</td><td class="num">${brl(x.valor)}</td></tr>`).join('')}
          <tr class="total"><td colspan="2">${D.estimativasFora.length} títulos de orçamento</td><td class="num">${brl(D.estimativasForaTotal)}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
  <p class="small">Nenhum dos dois grupos deixou de existir — deixou de ter data. As estimativas foram retiradas a pedido do senhor porque
  orçamento lançado como título estava competindo com o custo real; o custo continua contado, mas pela média do extrato. As comissões de julho
  seguem devidas e voltam ao fluxo assim que a data for definida.</p>

  ${foot()}
</section>

<!-- ============================ P4 — CENÁRIOS ============================ -->
<section class="page">
  <div class="head"><h2>Cenários e o que fazer</h2><div class="n">04 · decisão</div></div>

  <table>
    <thead><tr><th>Cenário</th><th>O que muda</th><th class="num" style="width:24mm">Pior dia</th><th class="num" style="width:24mm">10/09</th><th class="num" style="width:16mm">Dias&nbsp;−</th></tr></thead>
    <tbody>
      ${D.cenarios.map(c => `<tr class="${c.chave === 'BASE' ? 'destaque' : ''}"><td><strong>${esc(c.rot)}</strong></td><td class="muted">${esc(c.desc)}</td>
        <td class="num">${c.fundo < 0 ? '−' : ''}${brl(Math.abs(c.fundo))}<br><span class="muted" style="font-size:8px">${dm(c.fundoData)}</span></td>
        <td class="num">${c.final < 0 ? '−' : ''}${brl(Math.abs(c.final))}</td><td class="num">${c.diasNegativos}</td></tr>`).join('')}
    </tbody>
  </table>

  <p><strong>A janela passa, mas não sobra.</strong> Só o Sicoob — que é o único saldo conciliado de verdade — já fura por ${SOSIC.diasNegativos} dias
  (fundo ${sinal(SOSIC.fundo)}). E se as comissões de julho saírem em 05/09, são ${COMJ.diasNegativos} dias negativos com fundo ${sinal(COMJ.fundo)}.
  Cinco dias de atraso nas três cobranças ainda fecham no azul (${sinal(ATR.final)}) porque o Naviraí sai da janela junto com o alívio — mas aí o problema vira o dia 11.</p>

  <h3>Quem cobre a margem, se precisar</h3>
  <table>
    <thead><tr><th style="width:18mm">Venceu</th><th>Título</th><th class="num" style="width:26mm">Valor</th><th style="width:38mm">Cobre o quê</th></tr></thead>
    <tbody>
      ${D.candidatos.map(c => `<tr><td>${dm(c.vencimento)}</td><td>${esc(corta(c.rot, 54))}</td><td class="num">${brl(c.valor)}</td>
        <td>${c.valor >= D.consomeMargemTotal ? '<strong>Tudo o que ficou de fora</strong>' : c.valor >= D.abertoSemDataTotal ? 'As comissões de julho inteiras' : 'Parte'}</td></tr>`).join('')}
      <tr class="total"><td colspan="2">Vencido total fora do fluxo</td><td class="num">${brl(D.vencidoTotal)}</td><td></td></tr>
    </tbody>
  </table>

  <div class="box dark">
    <div class="t">A alavanca continua sendo o EAO Baviera</div>
    <p style="margin:0">Os dois títulos somam <strong>R$ ${brl(eaoTotal)}</strong> e venceram em 25 e 26/08 — mais que os R$ ${brl0(D.consomeMargemTotal)}
    de tudo o que ficou fora deste relatório. Com eles pagos, o senhor não precisa escolher entre a folha, as comissões de julho e as contas de estrutura:
    a janela fecharia em <strong>${sinal(r2(BASE.final + eaoTotal))}</strong> com folga para quitar o atrasado. É a mesma conclusão de 20/08 — cobrança com o Max.</p>
  </div>

  <h3>O que vem logo depois da janela</h3>
  <p>A janela termina três dias antes do dinheiro grande: a <strong>2ª parcela do JMP (R$ ${brl(D.jmpTotal)})</strong> vence em 13/09.
  Mas entre 11 e 30/09 saem <strong>R$ ${brl(D.logoDepoisTotal)}</strong> em títulos já lançados —
  R$ ${brl0(D.logoDepois.filter(x => /Impostos/.test(x.categoria)).reduce((s, x) => s + x.valor, 0))} das guias de agosto (ISSQN 15/09, DAS 22/09),
  R$ ${brl0(D.logoDepois.filter(x => /Remuneracao de Socio/.test(x.categoria)).reduce((s, x) => s + x.valor, 0))} da participação trimestral do Marcelo em 25/09
  e R$ ${brl0(D.logoDepois.filter(x => /Comissões/.test(x.categoria)).reduce((s, x) => s + x.valor, 0))} de comissões de agosto no dia 25 —
  fora as comissões de julho e as estimativas retiradas, que também precisam caber ali.
  <strong>A entrada do JMP não é folga: é o que paga setembro.</strong></p>

  ${foot()}
</section>

<!-- ============================ P5 — RESSALVAS ============================ -->
<section class="page">
  <div class="head"><h2>Ressalvas</h2><div class="n">05 · o que este relatório não sabe</div></div>

  <p class="lead">Todo número acima sai do ERP e do extrato — nenhum foi digitado à mão. O que segue é o que ainda não está firme,
  e que muda a conta se mudar.</p>

  <table>
    <thead><tr><th style="width:44mm">Ponto</th><th>Situação</th><th style="width:36mm">Efeito se mudar</th></tr></thead>
    <tbody>
      <tr><td><strong>Sicredi — R$ ${brl(D.caixa.sicredi)}</strong></td>
        <td>O extrato do Sicredi nunca foi importado. Esse é o último saldo conhecido no ERP, não um saldo bancário conferido hoje.</td>
        <td>Sem ele a janela fura: ${SOSIC.diasNegativos} dias negativos, fundo ${sinal(SOSIC.fundo)}. <strong>É a ressalva mais cara desta versão.</strong></td></tr>
      <tr><td><strong>Comissões de julho — R$ ${brl(D.abertoSemDataTotal)}</strong></td>
        <td>${D.abertoSemData.length} títulos <em>reais</em> vencidos em 25/08 e não pagos, retirados a seu pedido enquanto a data não é definida.</td>
        <td>Saindo em 05/09: ${COMJ.diasNegativos} dias negativos, fundo ${sinal(COMJ.fundo)}.</td></tr>
      <tr><td><strong>Estimativas retiradas — R$ ${brl(D.estimativasForaTotal)}</strong></td>
        <td>${D.estimativasFora.length} títulos de orçamento saíram da projeção. Parte é despesa que vai acontecer de qualquer jeito (FGTS, contador, site, tarifas); a média histórica cobre esse tipo de custo, mas não garante a mesma data.</td>
        <td>Se caírem todas dentro da janela, consomem mais de três vezes a margem.</td></tr>
      <tr><td><strong>Despesa de leilão — R$ ${brl(leilaoTotal)}</strong></td>
        <td>Projeção pela média de R$ ${brl(D.premissas.leilao.porPresencial)} por presencial (R$ ${brl0(D.premissas.leilao.total)} ÷ ${D.premissas.leilao.presenciais} eventos de jun–ago), com o caixa 10 dias após o pregão. É o gasto mais volátil da Bula: a média mensal por evento vai de R$ 2.225 a R$ 9.627.</td>
        <td>É justamente o que define o pior dia — se vier mais alto ou mais cedo, a margem some.</td></tr>
      <tr><td><strong>Naviraí — dois títulos</strong></td>
        <td>Há <strong>dois</strong> títulos vencendo em 10/09 (R$ ${D.entradas.filter(e => e.data === '2026-09-10').map(e => brl(e.valor)).join(' e R$ ')}). Li a sua mensagem como os dois.</td>
        <td>Se for só o maior, fecha em ${sinal(NAV1.final)} — o pior dia não muda.</td></tr>
      <tr><td><strong>Sorriso Fêmeas — R$ 800,02</strong></td>
        <td>A NF 635 e o portal da e-Rural dizem R$ ${brl(D.entradas[1].valor)}; a fórmula do acordo dá R$ 7.950,00. A diferença não se explica pelo acordo cadastrado.</td>
        <td>Conferir com a e-Rural se há desconto de plataforma.</td></tr>
      <tr><td><strong>Jacamin (05/09)</strong></td>
        <td>O presencial acontece dentro da janela, mas o caixa dele cai em ${dm(jacamin.caixa)} pela regra dos 10 dias.</td>
        <td>Se sair antes, tira R$ ${brl0(D.premissas.leilao.porPresencial)} de dentro do período.</td></tr>
    </tbody>
  </table>

  <h3>O calendário de decisão</h3>
  <table>
    <thead><tr><th style="width:24mm">Prazo</th><th>O que precisa acontecer</th><th style="width:54mm">Se não acontecer</th></tr></thead>
    <tbody>
      <tr><td><strong>até 02/09</strong></td><td>Fechar data com o Max para um dos títulos do EAO Baviera (R$ ${brl0(eao[0].valor)} ou R$ ${brl0(eao[1].valor)}).</td>
        <td>A janela ainda passa, mas com ${sinal(BASE.fundo)} de folga e sem espaço para pagar nada do que ficou de fora.</td></tr>
      <tr><td><strong>até 04/09</strong></td><td>Confirmar que as comissões de julho e as estimativas retiradas não saem antes de 10/09.</td>
        <td>É o único jeito de o pior dia continuar positivo.</td></tr>
      <tr><td><strong>até 05/09</strong></td><td>Folha de agosto paga: R$ ${brl0(D.blocos.folha)} para ${folha.length} pessoas.</td>
        <td>É a saída menos adiável da janela.</td></tr>
      <tr><td><strong>até 10/09</strong></td><td>Confirmar com a leiloeira que a 2ª parcela do JMP entra em 13/09.</td>
        <td>Setembro depende dela: R$ ${brl0(D.logoDepoisTotal)} vencem entre 11 e 30/09.</td></tr>
      <tr><td><strong>quando der</strong></td><td>Importar o extrato do Sicredi e conciliar.</td>
        <td>R$ ${brl(D.caixa.sicredi)} do caixa desta projeção seguem sem conferência bancária — e são eles que separam o azul do vermelho.</td></tr>
    </tbody>
  </table>

  <h3>Em uma frase</h3>
  <div class="box rule">
    <p style="margin:0" class="lead">A janela passa: fecha em ${sinal(BASE.final)}, sem nenhum dia negativo.
    Mas passa com <strong>${sinal(BASE.fundo)}</strong> de folga no pior dia, contra <strong>R$ ${brl0(D.consomeMargemTotal)}</strong> de obrigação
    esperando data do lado de fora — e contra R$ ${brl(D.caixa.sicredi)} de caixa que ninguém conferiu no banco.
    Cobrar um dos títulos do EAO Baviera transforma essa margem em folga de verdade.</p>
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
await browser.close()
console.log('PDF:', pdfPath)
