/**
 * Renderiza o resultado comercial 2026 a partir de
 * outputs/resultado-comercial-2026-08-21/dados.json.
 *
 *   node scripts/render-resultado-comercial-2026.mjs
 *
 * Sai na Área de Trabalho: o XLSX (o que o chefe pediu — "num Excel mesmo")
 * e o PDF A4. Paleta do brandbook: preto, grafite e o dourado como acento.
 * Nenhum número escrito à mão — tudo vem do dados.json.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import xlsx from 'xlsx'
import { chromium } from 'playwright'

const OUT = 'outputs/resultado-comercial-2026-08-21'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))
const desktop = path.join(os.homedir(), 'Desktop')
const BASE = 'Bula - Faturamento, Comissao e Margem - 21-08-2026'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pc = (n, d = 1) => (Number(n) * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
const kk = (n) => {
  const a = Math.abs(n)
  if (a >= 1e6) return (n / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
  if (a >= 1000) return (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + 'k'
  return brl0(n)
}

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', SOFT = '#9B9B9B'

/* ══════════════════ XLSX ══════════════════ */

const M = (n) => ({ v: Number(n), t: 'n', z: '#,##0.00' })
const P = (n) => ({ v: Number(n), t: 'n', z: '0.00%' })
const I = (n) => ({ v: Number(n), t: 'n', z: '#,##0' })

const wb = xlsx.utils.book_new()
const addSheet = (nome, aoa, larguras) => {
  const ws = xlsx.utils.aoa_to_sheet(aoa)
  ws['!cols'] = larguras.map((w) => ({ wch: w }))
  xlsx.utils.book_append_sheet(wb, ws, nome)
}

addSheet('RESUMO', [
  ['BULA ASSESSORIA — FATURAMENTO, COMISSÃO E MARGEM'],
  [`Janeiro a agosto de 2026 · posição de ${D.meta.geradoEm.split('-').reverse().join('/')}`],
  [],
  ['O QUE A BULA VENDEU'],
  ['Leilões', I(D.ano.leiloes)],
  ['Lotes vendidos', I(D.ano.lotes)],
  ['Cobertura vendida (VGV Bula)', M(D.ano.vgv)],
  [],
  ['O QUE A BULA GANHA COM ISSO — receita pelos acordos com as marcas'],
  ['Receita já apurada com a leiloeira', M(D.ano.receitaApurada)],
  [`Receita estimada dos ${D.apuracao.semAcordo} leilões sem acordo fechado`, M(D.ano.receitaEstimada)],
  ['RECEITA TOTAL', M(D.ano.receita)],
  ['Take-rate (receita ÷ cobertura)', P(D.modelo.takeRate)],
  [],
  ['DA RECEITA À MARGEM'],
  ['Receita', M(D.cascata.receita), P(1)],
  ['(−) Imposto 18%', M(-D.cascata.imposto), P(-D.cascata.imposto / D.cascata.receita)],
  ['(−) Comissão de assessores', M(-D.cascata.comissao), P(-D.cascata.comissao / D.cascata.receita)],
  ['(−) Despesa operacional de leilão', M(-D.cascata.despesaLeilao), P(-D.cascata.despesaLeilao / D.cascata.receita)],
  ['= MARGEM DE CONTRIBUIÇÃO', M(D.cascata.margemContribuicao), P(D.cascata.margemPct)],
  [`(−) Custo fixo de ${D.cascata.meses} meses (folha + estrutura)`, M(-D.cascata.custoFixoPeriodo), P(-D.cascata.custoFixoPeriodo / D.cascata.receita)],
  ['= RESULTADO', M(D.cascata.resultado), P(D.cascata.resultado / D.cascata.receita)],
  [],
  ['A RECEBER HOJE'],
  ['Vencido (cobrança em atraso)', M(D.receber.vencido)],
  ['A vencer', M(D.receber.aVencer)],
  ['TOTAL A RECEBER', M(D.receber.total)],
  ['Já recebido de comissão de leilão no ano', M(D.receber.recebidoComissao)],
  ['(memo) Repasse de comprador que passou pela conta', M(D.receber.repasseComprador)],
  [],
  ['O PONTO DE EQUILÍBRIO COM A FOLHA NOVA'],
  ['Folha antiga (competência julho)', M(D.custo.folhaAntes)],
  ['Folha nova (a partir de agosto)', M(D.custo.folhaNova)],
  ['Estrutura (média mensal realizada abr–jul)', M(D.custo.estruturaMes)],
  ['Custo fixo mensal — antes', M(D.custo.fixoAntes)],
  ['Custo fixo mensal — depois', M(D.custo.fixoDepois)],
  ['Receita/mês para empatar — antes', M(D.breakEven.antes.receita)],
  ['Receita/mês para empatar — depois', M(D.breakEven.depois.receita)],
  ['Cobertura/mês para empatar — antes', M(D.breakEven.antes.vgv)],
  ['Cobertura/mês para empatar — depois', M(D.breakEven.depois.vgv)],
  ['Receita média realizada por mês', M(D.breakEven.receitaMediaMes)],
  ['Folga mensal com a folha nova', M(D.breakEven.folgaDepois)],
], [46, 18, 12])

addSheet('MES A MES', [
  ['Mês', 'Leilões', 'Lotes', 'Cobertura vendida', 'Receita apurada', 'Receita estimada', 'Receita total', 'Take-rate', 'Imposto 18%', 'Comissão', 'Comissão % da receita'],
  ...D.mensal.map((m) => [
    m.nome, I(m.leiloes), I(m.lotes), M(m.vgv), M(m.receitaApurada), M(m.receitaEstimada), M(m.receita),
    P(m.take), M(m.imposto), M(m.comissao), m.receita > 0 ? P(m.comissao / m.receita) : '',
  ]),
  ['TOTAL', I(D.ano.leiloes), I(D.ano.lotes), M(D.ano.vgv), M(D.ano.receitaApurada), M(D.ano.receitaEstimada),
    M(D.ano.receita), P(D.modelo.takeRate), M(D.ano.imposto), M(D.ano.comissao), P(D.ano.comissao / D.ano.receita)],
], [12, 9, 8, 19, 17, 17, 15, 11, 14, 15, 20])

addSheet('COMISSAO', [
  ['POR FAIXA DE PERCENTUAL — quanto cada regra pesa'],
  ['Faixa', 'Participações', 'Cobertura vendida', 'Comissão', '% do total de comissão'],
  ...D.comissao.porFaixa.map((f) => [f.faixa, I(f.n), M(f.vgv), M(f.comissao), P(f.pctDoTotal)]),
  [],
  ['POR ASSESSOR'],
  ['Assessor', 'Participações', 'Cobertura vendida', 'Comissão', '% efetivo sobre a venda'],
  ...D.comissao.porAssessor.map((a) => [a.nome, I(a.leiloes), M(a.vgv), M(a.comissao), P(a.pctEfetivo, 2)]),
  ['TOTAL', I(D.comissao.porAssessor.reduce((s, a) => s + a.leiloes, 0)), M(D.comissao.vgvCoberto), M(D.comissao.total), P(D.comissao.pctSobreVgv, 2)],
  [],
  ['Ainda em aberto como título no ERP', M(D.comissao.emAberto)],
], [30, 14, 19, 16, 23])

addSheet('A RECEBER', [
  ['Leiloeira', 'Títulos', 'Vencido', 'A vencer', 'Total'],
  ...D.receber.porLeiloeira.map((l) => [l.leiloeira, I(l.n), M(l.vencido), M(l.aVencer), M(l.total)]),
  ['TOTAL', I(D.receber.titulos), M(D.receber.vencido), M(D.receber.aVencer), M(D.receber.total)],
], [32, 9, 16, 16, 16])

addSheet('CUSTO FIXO', [
  ['A FOLHA A PARTIR DE AGOSTO/2026'],
  ['Colaborador', 'Função', 'Salário fixo'],
  ...D.custo.equipe.map((e) => [e.nome, e.funcao || '', M(e.salario)]),
  ['TOTAL DA FOLHA', '', M(D.custo.folhaNova)],
  [],
  ['ESTRUTURA (média mensal realizada no banco, abr–jul)', '', M(D.custo.estruturaMes)],
  ['CUSTO FIXO MENSAL (folha nova + estrutura)', '', M(D.custo.fixoDepois)],
  [],
  ['Memo — não entram no custo fixo:'],
  ['Despesa operacional de leilão (varia com o evento)', '', M(D.custo.leilaoMes)],
  ['Cartão da Bula (gasto do Bulinha, abate dívida)', '', M(D.custo.cartaoMes)],
], [46, 26, 16])

const xlsxPath = path.join(desktop, `${BASE}.xlsx`)
xlsx.writeFile(wb, xlsxPath)
console.log('XLSX:', xlsxPath)

/* ══════════════════ Gráficos SVG ══════════════════ */

/* Cascata: da receita ao resultado */
function gCascata() {
  const W = 780, H = 250, T = 30, B = 52, L = 0
  const passos = [
    { rot: 'Receita', v: D.cascata.receita, tipo: 'total' },
    { rot: 'Imposto 18%', v: -D.cascata.imposto, tipo: 'sai' },
    { rot: 'Comissão', v: -D.cascata.comissao, tipo: 'sai' },
    { rot: 'Despesa de leilão', v: -D.cascata.despesaLeilao, tipo: 'sai' },
    { rot: 'Margem de contribuição', v: D.cascata.margemContribuicao, tipo: 'sub' },
    { rot: 'Custo fixo (8 meses)', v: -D.cascata.custoFixoPeriodo, tipo: 'sai' },
    { rot: 'Resultado', v: D.cascata.resultado, tipo: 'total' },
  ]
  const max = D.cascata.receita * 1.04
  const bw = W / passos.length - 14
  const y = (v) => T + (H - T - B) * (1 - v / max)
  let acum = 0, out = ''
  passos.forEach((p, i) => {
    const x = i * (W / passos.length) + 7
    let topo, base
    if (p.tipo === 'sai') { base = acum; acum += p.v; topo = acum } else { topo = p.v; base = 0; acum = p.v }
    const yTopo = y(Math.max(topo, base)), yBase = y(Math.min(topo, base))
    const alt = Math.max(yBase - yTopo, 1.5)
    const fill = p.tipo === 'total' ? INK : p.tipo === 'sub' ? GOLD : '#C4C4C4'
    out += `<rect x="${x.toFixed(1)}" y="${yTopo.toFixed(1)}" width="${bw.toFixed(1)}" height="${alt.toFixed(1)}" fill="${fill}"/>`
    out += `<text x="${(x + bw / 2).toFixed(1)}" y="${(yTopo - 6).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${INK}">${kk(Math.abs(p.v))}</text>`
    const rot = p.rot.split(' ')
    const linhas = rot.length > 2 ? [rot.slice(0, 2).join(' '), rot.slice(2).join(' ')] : [p.rot]
    linhas.forEach((l, k) => {
      out += `<text x="${(x + bw / 2).toFixed(1)}" y="${(H - B + 16 + k * 11).toFixed(1)}" text-anchor="middle" font-size="9" fill="${MUTED}">${esc(l)}</text>`
    })
    if (i < passos.length - 1 && p.tipo !== 'sub') {
      const yl = y(acum)
      out += `<line x1="${(x + bw).toFixed(1)}" y1="${yl.toFixed(1)}" x2="${(x + W / passos.length).toFixed(1)}" y2="${yl.toFixed(1)}" stroke="${SOFT}" stroke-width="0.8" stroke-dasharray="2 2"/>`
    }
  })
  out += `<line x1="0" y1="${y(0).toFixed(1)}" x2="${W}" y2="${y(0).toFixed(1)}" stroke="${INK}" stroke-width="1.1"/>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Cascata da receita ao resultado">${out}</svg>`
}

/* Barras: cobertura vendida mês a mês, apurado x pendente */
function gMensal() {
  const W = 780, H = 178, T = 22, B = 40, L = 44
  const max = Math.max(...D.mensal.map((m) => m.vgv)) * 1.12
  const bw = (W - L) / D.mensal.length - 12
  const y = (v) => T + (H - T - B) * (1 - v / max)
  let out = ''
  for (let i = 0; i <= 3; i++) {
    const v = max * i / 3, yy = y(v)
    out += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W}" y2="${yy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    out += `<text x="${L - 7}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" font-size="8.6" fill="${MUTED}">${kk(v)}</text>`
  }
  D.mensal.forEach((m, i) => {
    const x = L + i * ((W - L) / D.mensal.length) + 6
    const yA = y(m.vgvApurado), yTot = y(m.vgv), y0 = y(0)
    out += `<rect x="${x.toFixed(1)}" y="${yTot.toFixed(1)}" width="${bw.toFixed(1)}" height="${(yA - yTot).toFixed(1)}" fill="#D8D8D8"/>`
    out += `<rect x="${x.toFixed(1)}" y="${yA.toFixed(1)}" width="${bw.toFixed(1)}" height="${(y0 - yA).toFixed(1)}" fill="${INK}"/>`
    out += `<text x="${(x + bw / 2).toFixed(1)}" y="${(yTot - 5).toFixed(1)}" text-anchor="middle" font-size="8.8" font-weight="600" fill="${INK}">${kk(m.vgv)}</text>`
    out += `<text x="${(x + bw / 2).toFixed(1)}" y="${(H - B + 15).toFixed(1)}" text-anchor="middle" font-size="9" fill="${MUTED}">${esc(m.nome.slice(0, 3))}</text>`
  })
  out += `<g transform="translate(${L},${H - 8})">
    <rect x="0" y="-8" width="11" height="8" fill="${INK}"/><text x="16" y="-1" font-size="8.4" fill="${MUTED}">receita já apurada com a leiloeira</text>
    <rect x="215" y="-8" width="11" height="8" fill="#D8D8D8"/><text x="231" y="-1" font-size="8.4" fill="${MUTED}">vendido, acordo ainda não fechado</text></g>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Cobertura vendida por mês">${out}</svg>`
}

/* Barra empilhada: peso de cada faixa de comissão */
function gFaixas() {
  const W = 780, H = 74, bh = 34
  const tot = D.comissao.total
  const cores = { '2% (assessor)': INK, '5% (parceiro)': GOLD, 'sem percentual': '#B4B4B4', 'até 1% (apoio)': '#E0E0E0' }
  let x = 0, out = '', leg = ''
  D.comissao.porFaixa.forEach((f, i) => {
    const w = (f.comissao / tot) * W
    const cor = cores[f.faixa] || '#D0D0D0'
    out += `<rect x="${x.toFixed(1)}" y="16" width="${Math.max(w, 0.8).toFixed(1)}" height="${bh}" fill="${cor}"/>`
    if (w > 92) {
      const claro = cor === '#B4B4B4' || cor === '#E0E0E0'
      out += `<text x="${(x + 8).toFixed(1)}" y="32" font-size="10.5" font-weight="700" fill="${claro ? INK : '#fff'}">${pc(f.pctDoTotal, 1)}</text>`
      out += `<text x="${(x + 8).toFixed(1)}" y="44" font-size="8.6" fill="${claro ? MUTED : '#CFCFCF'}">${esc(f.faixa)} · R$ ${brl0(f.comissao)}</text>`
    } else {
      leg += `<g transform="translate(${(i - 1) * 210},${H - 4})"><rect x="0" y="-8" width="10" height="8" fill="${cor}" stroke="${GRID}"/><text x="15" y="-1" font-size="8.3" fill="${MUTED}">${esc(f.faixa)} · ${pc(f.pctDoTotal, 1)}</text></g>`
    }
    x += w
  })
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Peso de cada faixa de comissão">${out}${leg}</svg>`
}

/* ══════════════════ HTML ══════════════════ */

const dm = D.meta.geradoEm.split('-').reverse().join('/')
const linhaMensal = (m) => `<tr>
  <td>${esc(m.nome)}</td><td class="n">${m.leiloes}</td><td class="n">${brl0(m.lotes)}</td>
  <td class="n">${brl0(m.vgv)}</td><td class="n">${brl0(m.receita)}</td>
  <td class="n">${m.vgv > 0 ? pc(m.take, 2) : '—'}</td>
  <td class="n">${brl0(m.imposto)}</td><td class="n">${brl0(m.comissao)}</td>
  <td class="n">${m.receita > 0 ? pc(m.comissao / m.receita, 1) : '—'}</td></tr>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(BASE)}</title>
<style>
  @page { size: A4; margin: 13mm 12mm 12mm 12mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: "Segoe UI", Arial, sans-serif; color:${INK}; font-size:10.5px; line-height:1.45; }
  h1 { font-size:20px; margin:0 0 2px; letter-spacing:-0.3px; text-transform:uppercase; font-weight:800; }
  h2 { font-size:12.5px; margin:20px 0 7px; text-transform:uppercase; letter-spacing:1.1px; font-weight:700;
       border-bottom:1.6px solid ${INK}; padding-bottom:4px; }
  .sub { color:${MUTED}; font-size:10px; margin-bottom:14px; }
  .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:9px; margin:12px 0 4px; }
  .kpi { border:1px solid ${GRID}; border-top:2.5px solid ${INK}; padding:8px 9px; }
  .kpi .r { font-size:8.4px; text-transform:uppercase; letter-spacing:0.7px; color:${MUTED}; }
  .kpi .v { font-size:17px; font-weight:800; margin-top:2px; letter-spacing:-0.4px; }
  .kpi .d { font-size:8.6px; color:${MUTED}; margin-top:1px; }
  .kpi.gold { border-top-color:${GOLD}; }
  table { width:100%; border-collapse:collapse; font-size:9.6px; }
  th { text-align:left; font-size:8.3px; text-transform:uppercase; letter-spacing:0.6px; color:${MUTED};
       border-bottom:1px solid ${INK}; padding:4px 5px; font-weight:700; }
  td { padding:3.6px 5px; border-bottom:1px solid ${GRID}; }
  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; }
  tr.tot td { font-weight:800; border-top:1.6px solid ${INK}; border-bottom:none; }
  .nota { font-size:8.8px; color:${MUTED}; margin-top:6px; line-height:1.5; }
  .destaque { border-left:3px solid ${GOLD}; padding:7px 11px; margin:11px 0; background:#FBFAF6; font-size:10.2px; }
  .duas { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  .quebra { page-break-before: always; }
  .g { margin:6px 0 2px; }
  .rod { margin-top:16px; padding-top:7px; border-top:1px solid ${GRID}; font-size:8.2px; color:${MUTED}; }
</style></head><body>

<h1>Faturamento, comissão e margem</h1>
<div class="sub">Bula Assessoria · janeiro a agosto de 2026 · posição de ${dm}</div>

<div class="kpis">
  <div class="kpi"><div class="r">Cobertura vendida</div><div class="v">R$ ${kk(D.ano.vgv)}</div>
    <div class="d">${D.ano.leiloes} leilões · ${brl0(D.ano.lotes)} lotes</div></div>
  <div class="kpi"><div class="r">Receita da Bula</div><div class="v">R$ ${kk(D.ano.receita)}</div>
    <div class="d">${pc(D.modelo.takeRate, 2)} do que foi vendido</div></div>
  <div class="kpi gold"><div class="r">Margem de contribuição</div><div class="v">R$ ${kk(D.cascata.margemContribuicao)}</div>
    <div class="d">${pc(D.cascata.margemPct)} da receita</div></div>
  <div class="kpi"><div class="r">Resultado do período</div><div class="v">R$ ${kk(D.cascata.resultado)}</div>
    <div class="d">R$ ${brl0(D.cascata.resultado / D.cascata.meses)} por mês</div></div>
</div>

<h2>Da receita ao que sobra</h2>
<div class="g">${gCascata()}</div>
<div class="destaque">De cada <b>R$ 100</b> que a Bula fatura de comissão das leiloeiras,
<b>R$ ${brl0(100 * D.cascata.imposto / D.cascata.receita)}</b> vão de imposto,
<b>R$ ${brl0(100 * D.cascata.comissao / D.cascata.receita)}</b> de comissão dos assessores e
<b>R$ ${brl0(100 * D.cascata.despesaLeilao / D.cascata.receita)}</b> de despesa de leilão.
Sobram <b>R$ ${brl0(100 * D.cascata.margemPct)}</b> de margem de contribuição — é dela que sai o custo fixo de toda a estrutura.</div>

<h2>Mês a mês</h2>
<div class="g">${gMensal()}</div>
<table>
  <thead><tr><th>Mês</th><th class="n">Leilões</th><th class="n">Lotes</th><th class="n">Cobertura vendida</th>
  <th class="n">Receita</th><th class="n">Take-rate</th><th class="n">Imposto</th><th class="n">Comissão</th><th class="n">Com. % rec.</th></tr></thead>
  <tbody>${D.mensal.map(linhaMensal).join('')}
  <tr class="tot"><td>Total</td><td class="n">${D.ano.leiloes}</td><td class="n">${brl0(D.ano.lotes)}</td>
    <td class="n">${brl0(D.ano.vgv)}</td><td class="n">${brl0(D.ano.receita)}</td><td class="n">${pc(D.modelo.takeRate, 2)}</td>
    <td class="n">${brl0(D.ano.imposto)}</td><td class="n">${brl0(D.ano.comissao)}</td><td class="n">${pc(D.ano.comissao / D.ano.receita, 1)}</td></tr></tbody>
</table>
<div class="nota"><b>Apurado × estimado.</b> ${D.apuracao.comAcordo} dos ${D.apuracao.leiloes} leilões já têm a receita fechada com a leiloeira
(R$ ${brl0(D.ano.receitaApurada)}). Os outros ${D.apuracao.semAcordo} — quase todos da Expogenética, encerrada há dias — venderam
R$ ${brl0(D.apuracao.vgvPendente)} de cobertura e ainda não têm acordo apurado; a receita deles entra estimada em
R$ ${brl0(D.ano.receitaEstimada)}, pelo take-rate de ${pc(D.modelo.takeRate, 2)} medido nos leilões já fechados.
O volume vendido e a comissão dos assessores são fato nos ${D.apuracao.leiloes}: a comissão nasce do lance, não do acordo.</div>

<div class="quebra"></div>

<h2>Comissão — quem ganha e quanto pesa</h2>
<div class="g">${gFaixas()}</div>
<div class="destaque">A comissão de 2026 é <b>R$ ${brl(D.comissao.total)}</b>, ou <b>${pc(D.comissao.pctSobreVgv, 2)}</b> de tudo que foi vendido.
Ela não está no percentual de 5%: <b>${pc(D.comissao.porFaixa.find((f) => f.faixa === '2% (assessor)').pctDoTotal, 1)}</b> dela é a faixa de 2% dos assessores;
o parceiro a 5% responde por <b>${pc(D.comissao.porFaixa.find((f) => f.faixa === '5% (parceiro)').pctDoTotal, 1)}</b> —
R$ ${brl0(D.comissao.porFaixa.find((f) => f.faixa === '5% (parceiro)').comissao)}.
${esc(D.comissao.porAssessor[0].nome)} sozinho responde por R$ ${brl0(D.comissao.porAssessor[0].comissao)},
${pc(D.comissao.porAssessor[0].comissao / D.comissao.total, 1)} do total, a ${pc(D.comissao.porAssessor[0].pctEfetivo, 2)} efetivo sobre o que vendeu.</div>

<div class="duas">
  <div>
    <table>
      <thead><tr><th>Assessor</th><th class="n">Vendeu</th><th class="n">Comissão</th><th class="n">% efet.</th></tr></thead>
      <tbody>${D.comissao.porAssessor.map((a) => `<tr><td>${esc(a.nome)}</td><td class="n">${brl0(a.vgv)}</td>
        <td class="n">${brl0(a.comissao)}</td><td class="n">${pc(a.pctEfetivo, 2)}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="n">${brl0(D.comissao.vgvCoberto)}</td>
        <td class="n">${brl0(D.comissao.total)}</td><td class="n">${pc(D.comissao.pctSobreVgv, 2)}</td></tr></tbody>
    </table>
    <div class="nota">"A definir" são ${D.comissao.porAssessor.find((a) => a.nome === 'A definir')?.leiloes || 0} participações
    sem assessor atribuído no fechamento, R$ ${brl0(D.comissao.porAssessor.find((a) => a.nome === 'A definir')?.comissao || 0)}
    de comissão sem dono. Vale resolver antes do próximo pagamento.</div>
  </div>
  <div>
    <table>
      <thead><tr><th>A receber por leiloeira</th><th class="n">Vencido</th><th class="n">A vencer</th><th class="n">Total</th></tr></thead>
      <tbody>${D.receber.porLeiloeira.map((l) => `<tr><td>${esc(l.leiloeira)}</td><td class="n">${brl0(l.vencido)}</td>
        <td class="n">${brl0(l.aVencer)}</td><td class="n">${brl0(l.total)}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="n">${brl0(D.receber.vencido)}</td>
        <td class="n">${brl0(D.receber.aVencer)}</td><td class="n">${brl0(D.receber.total)}</td></tr></tbody>
    </table>
    <div class="nota">R$ ${brl0(D.receber.vencido)} já venceram e não entraram — ${pc(D.receber.vencido / D.receber.total, 0)} de tudo
    que se tem a receber. De comissão de leilão já entraram R$ ${brl0(D.receber.recebidoComissao)} no ano.</div>
  </div>
</div>

<h2>O custo fixo de ter trazido todo mundo</h2>
<div class="duas">
  <div>
    <table>
      <thead><tr><th>Colaborador</th><th>Função</th><th class="n">Salário</th></tr></thead>
      <tbody>${D.custo.equipe.map((e) => `<tr><td>${esc(e.nome)}</td><td>${esc(e.funcao || '')}</td><td class="n">${brl0(e.salario)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="2">Folha a partir de agosto</td><td class="n">${brl0(D.custo.folhaNova)}</td></tr>
      <tr><td colspan="2">Estrutura (média mensal abr–jul)</td><td class="n">${brl0(D.custo.estruturaMes)}</td></tr>
      <tr class="tot"><td colspan="2">Custo fixo mensal</td><td class="n">${brl0(D.custo.fixoDepois)}</td></tr></tbody>
    </table>
  </div>
  <div>
    <table>
      <thead><tr><th>Ponto de equilíbrio</th><th class="n">Antes</th><th class="n">Com a folha nova</th></tr></thead>
      <tbody>
        <tr><td>Folha mensal</td><td class="n">${brl0(D.custo.folhaAntes)}</td><td class="n">${brl0(D.custo.folhaNova)}</td></tr>
        <tr><td>Custo fixo mensal</td><td class="n">${brl0(D.custo.fixoAntes)}</td><td class="n">${brl0(D.custo.fixoDepois)}</td></tr>
        <tr><td>Receita/mês para empatar</td><td class="n">${brl0(D.breakEven.antes.receita)}</td><td class="n">${brl0(D.breakEven.depois.receita)}</td></tr>
        <tr class="tot"><td>Cobertura/mês para empatar</td><td class="n">${brl0(D.breakEven.antes.vgv)}</td><td class="n">${brl0(D.breakEven.depois.vgv)}</td></tr>
      </tbody>
    </table>
    <div class="destaque" style="margin-top:10px">A folha subiu de R$ ${brl0(D.custo.folhaAntes)} para R$ ${brl0(D.custo.folhaNova)}.
    Com a margem de ${pc(D.cascata.margemPct)}, isso empurra o ponto de equilíbrio de R$ ${brl0(D.breakEven.antes.receita)} para
    <b>R$ ${brl0(D.breakEven.depois.receita)}</b> de receita por mês — ou seja, <b>R$ ${brl0(D.breakEven.deltaVgv)} a mais de
    cobertura vendida todo mês</b> só para empatar.
    A média realizada de 2026 é R$ ${brl0(D.breakEven.receitaMediaMes)} de receita por mês: a folga cai de
    R$ ${brl0(D.breakEven.folgaAntes)} para R$ ${brl0(D.breakEven.folgaDepois)}.</div>
  </div>
</div>
<div class="nota">Fora do custo fixo, de propósito: <b>despesa operacional de leilão</b> (R$ ${brl0(D.custo.leilaoMes)}/mês em média) varia com o evento
e já está descontada na margem de contribuição; <b>cartão da Bula</b> (R$ ${brl0(D.custo.cartaoMes)}/mês) é gasto do Bulinha e abate a dívida com ele,
não é estrutura. A comissão em aberto como título no ERP hoje é R$ ${brl0(D.comissao.emAberto)}.</div>

<div class="rod">Fontes: fechamento de leilões, contas a receber, contas a pagar, extrato conciliado e cadastro de folha do ERP Bula.
Imposto pelo critério de 18% sobre a receita, o mesmo da planilha-mestra. Gerado em ${dm}.</div>

</body></html>`

const htmlPath = path.join(OUT, 'relatorio.html')
fs.writeFileSync(htmlPath, html)

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
const pdfPath = path.join(desktop, `${BASE}.pdf`)
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
await browser.close()
console.log('PDF: ', pdfPath)
