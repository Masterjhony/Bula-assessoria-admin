/**
 * COMISSÕES DA EXPOGENÉTICA 2026 — desdobramento lote a lote.
 * Pedido do Marcelo no grupo Financeiro (26/08 18:18): "Manda as comissões
 * desdobradas depois por favor."
 *
 * Reaproveita a apuração de scripts/apura-expogenetica-2026.mjs — mesma base do
 * relatório principal, para os dois documentos nunca divergirem.
 */
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import fs from 'node:fs'
import path from 'node:path'

const DESKTOP = 'C:/Users/Notebook-Acer/Desktop'
const OUT = 'outputs/relatorio-expogenetica-2026'
const TMP = path.join(OUT, 'apuracao.json')
const HOJE = '28/08/2026'
const VENC = '25/09/2026'

fs.mkdirSync(OUT, { recursive: true })
execFileSync('node', ['scripts/apura-expogenetica-2026.mjs', '--json', TMP], { stdio: 'inherit' })
const D = JSON.parse(fs.readFileSync(TMP, 'utf8'))
const { leiloes, assessores, T, dre } = D

/* ── títulos já lançados no ERP ─────────────────────────────────────────────── */
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data: fechs } = await sb.from('bula_leilao_fechamento').select('id,nome,data')
  .gte('data', '2026-08-10').lte('data', '2026-08-23')
const { data: cps } = await sb.from('erp_contas_pagar').select('*').in('fechamento_id', fechs.map(f => f.id))
const chave = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
// o Bambú (13/08) é leilão virtual fora da feira — o título dele não conta aqui
const titulos = (cps || []).filter(c => c.status !== 'cancelado' && !/BAMBU/.test(chave(c.descricao)))
const tituladoDe = nome => titulos.filter(c => chave(c.descricao).includes(chave(nome.split(' (')[0])))
  .reduce((s, c) => s + Number(c.valor), 0)

const brl = n => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const brl0 = n => `R$ ${Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
const num = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (n, c = 2) => `${(Number(n || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })}%`
const dt = s => s.slice(8, 10) + '/' + s.slice(5, 7)

/* ── matriz assessor × leilão ───────────────────────────────────────────────── */
const comLeiloes = leiloes.filter(l => l.venda > 0)
const matriz = assessores.map(a => ({
  nome: a.nome, pct: a.pct, total: a.comissao, semPct: a.semPct,
  porLeilao: comLeiloes.map(l => {
    const lts = l.lotes.filter(t => t.assessor === a.nome)
    return { venda: lts.reduce((s, t) => s + t.vgv, 0), com: lts.reduce((s, t) => s + t.comissao, 0), n: lts.length }
  }),
}))

/* ── lotes direcionados (mudaram de dono pela regra do comprador) ───────────── */
const dirigidos = comLeiloes.flatMap(l => l.lotes.filter(t => t.quemDirecionou)
  .map(t => ({ ...t, leilao: l.nome, data: l.data })))
const vgvDirigido = dirigidos.reduce((s, t) => s + t.vgv, 0)
const perdaAssessores = dirigidos.reduce((s, t) => s + t.vgv * 0.02, 0)

/* ── quando cada um recebe ──────────────────────────────────────────────────── */
const quando = n => n === 'Nane' ? '28/12/2026' : VENC
const nota = n => n === 'Nane' ? 'acumula e recebe de uma vez em dezembro'
  : n === 'Gustavo Rusa' ? 'parceiro — nota fiscal própria'
  : n === 'Marcelo Moura' ? 'não está no cadastro de folha — confirmar' : ''

const logo = fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')
const maxCom = Math.max(...assessores.map(a => a.comissao))

const linhasResumo = assessores.map(a => `<tr>
  <td><b>${a.nome}</b>${nota(a.nome) ? `<div class="sub small">${nota(a.nome)}</div>` : ''}</td>
  <td class="num">${a.lotes}</td>
  <td class="num">${brl0(a.venda)}</td>
  <td class="num">${a.semPct ? '2%*' : pct(a.pct, 0)}</td>
  <td class="num"><div class="bar"><span style="width:${(a.comissao / maxCom * 100).toFixed(1)}%"></span></div><b>${num(a.comissao)}</b></td>
  <td class="ctr">${quando(a.nome)}</td></tr>`).join('')

const curto = n => n.split(' (')[0].split(' ')[0]
const k0 = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const linhasMatriz = comLeiloes.map((l, i) => `<tr>
  <td class="ctr sub d">${dt(l.data)}</td><td class="lei">${l.nome}</td>
  ${matriz.map(m => `<td class="num a ${m.porLeilao[i].com ? '' : 'zip'}">${m.porLeilao[i].com ? k0(m.porLeilao[i].com) : '·'}</td>`).join('')}
  <td class="num t"><b>${k0(l.comissaoPaga)}</b></td></tr>`).join('')

const blocosLote = assessores.map(a => {
  const lts = comLeiloes.flatMap(l => l.lotes.filter(t => t.assessor === a.nome).map(t => ({ ...t, leilao: l.nome, data: l.data })))
  return `<h3>${a.nome} — ${lts.length} lote${lts.length > 1 ? 's' : ''} · ${brl0(a.venda)} de venda · ${brl(a.comissao)} de comissão</h3>
  <table>
    <thead><tr><th class="ctr">Data</th><th>Leilão</th><th class="ctr">Lote</th><th>Comprador</th>
      <th class="num">VGV</th><th class="num">%</th><th class="num">Comissão</th></tr></thead>
    <tbody>${lts.map(t => `<tr>
      <td class="ctr sub">${dt(t.data)}</td>
      <td class="small">${t.leilao}</td>
      <td class="ctr">${t.lote}</td>
      <td class="small">${t.comprador || '<span class="sub">não identificado</span>'}${t.fazenda ? `<div class="sub small">${t.fazenda}${t.uf ? ' · ' + t.uf : ''}</div>` : ''}${t.quemDirecionou ? `<div class="mk small">direcionamento — anunciado por ${t.anunciante}</div>` : ''}</td>
      <td class="num">${num(t.vgv)}</td>
      <td class="num">${pct(t.pct, 0)}</td>
      <td class="num">${num(t.comissao)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="4">Total ${a.nome}</td><td class="num">${num(a.venda)}</td><td></td>
      <td class="num">${num(a.comissao)}</td></tr></tfoot>
  </table>`
}).join('')

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, Arial, sans-serif; color: #16181d; font-size: 9pt; line-height: 1.45; }
  .page { padding: 10mm 13mm 8mm; }
  .brk { page-break-before: always; }
  h1,h2,h3,.k,.tag,th,.v { font-family: Oswald, Arial, sans-serif; text-transform: uppercase; letter-spacing: .04em; font-weight: 500; }
  header { background: #0c0d10; color: #fff; padding: 11mm 13mm 8mm; }
  header img { height: 32px; opacity: .95; }
  header h1 { font-size: 21pt; margin-top: 6mm; line-height: 1.05; letter-spacing: .02em; }
  header .gold { color: #C9A84C; }
  header .sub { color: #9aa0aa; font-size: 8.4pt; margin-top: 3.5mm; line-height: 1.5; }
  h2 { font-size: 11.5pt; margin: 6mm 0 2.5mm; padding-bottom: 1.8mm; border-bottom: 1.5pt solid #0c0d10; }
  h2 .n { color: #C9A84C; margin-right: 2.5mm; }
  h2:first-child { margin-top: 0; }
  h3 { font-size: 8.8pt; margin: 5mm 0 1.5mm; color: #16181d; padding-bottom: 1.2mm; border-bottom: .5pt solid #d7dade; }
  p { margin-bottom: 2.5mm; }
  table { width: 100%; border-collapse: collapse; margin: 2mm 0; }
  th { font-size: 7pt; text-align: left; color: #5a616e; border-bottom: 1pt solid #c2c6cd; padding: 1.8mm; }
  td { padding: 1.5mm 1.8mm; border-bottom: .4pt solid #e8eaee; vertical-align: middle; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.ctr, th.ctr { text-align: center; }
  td.zip { color: #d0d3d8; }
  .sub { color: #6b727f; } .small { font-size: 7.3pt; line-height: 1.3; }
  tfoot td { border-top: 1pt solid #0c0d10; border-bottom: none; font-weight: 600; padding-top: 2mm; }
  .bar { display: inline-block; width: 18mm; height: 1.6mm; background: #eceef1; border-radius: 1mm; margin-right: 2.5mm; vertical-align: middle; overflow: hidden; }
  .bar span { display: block; height: 100%; background: #0c0d10; }
  .tag { font-size: 6.6pt; padding: .7mm 1.8mm; border-radius: 1.5mm; white-space: nowrap; }
  .t-ok { background: #e6efe8; color: #2c6539; } .t-fix { background: #fbeae8; color: #9c2e27; }
  .mk { color: #8a6d1f; }
  .cards { display: flex; gap: 3mm; margin: 4mm 0 2mm; }
  .card { flex: 1; border: .6pt solid #d7dade; border-radius: 2mm; padding: 3mm; }
  .card .k { font-size: 6.9pt; color: #6b727f; }
  .card .v { font-size: 15pt; margin-top: 1.5mm; letter-spacing: 0; }
  .card .d { font-size: 7.1pt; color: #6b727f; margin-top: 1mm; line-height: 1.35; }
  .card.dark { background: #0c0d10; border-color: #0c0d10; }
  .card.dark .k { color: #9aa0aa; } .card.dark .v { color: #fff; } .card.dark .d { color: #9aa0aa; }
  .card.gold { border-color: #C9A84C; border-width: 1pt; } .card.gold .v { color: #8a6d1f; }
  .neg { color: #9c2e27; }
  .box { border-left: 2.2pt solid #C9A84C; background: #faf8f2; padding: 3mm 4mm; margin: 3mm 0; }
  .box .k { font-size: 8.2pt; margin-bottom: 1.5mm; }
  .box.alert { border-left-color: #9c2e27; background: #fdf4f3; }
  ul { margin: 1.5mm 0 2mm 4.5mm; } li { margin-bottom: 1.5mm; }
  footer { margin-top: 6mm; padding-top: 2.5mm; border-top: .6pt solid #d7dade; font-size: 7.1pt; color: #8b919c; line-height: 1.5; }
  .rot { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; font-size: 6.2pt; }
  /* matriz assessor x leilão: 13 colunas precisam caber num A4 retrato */
  table.mtz { table-layout: fixed; font-size: 7pt; }
  table.mtz th, table.mtz td { padding: 1.2mm .8mm; }
  table.mtz td.lei { font-size: 6.9pt; line-height: 1.2; }
  table.mtz th.a, table.mtz td.a { width: 11.5mm; }
  table.mtz th.d, table.mtz td.d { width: 9mm; }
  table.mtz th.t, table.mtz td.t { width: 15mm; }
</style></head><body>

<header>
  <img src="data:image/png;base64,${logo}">
  <h1>Expogenética 2026<br><span class="gold">Comissões Desdobradas</span></h1>
  <div class="sub">Bula Assessoria · ${T.lotes} lotes em ${D.comVenda} pregões · apuração de ${HOJE}<br>
  A comissão de cada lote segue o COMPRADOR, não quem anunciou na pista. Mesma base do relatório de vendas e DRE.</div>
</header>

<div class="page">

<div class="cards">
  <div class="card dark"><div class="k">Total a pagar</div><div class="v">${brl0(dre.comissoes)}</div>
    <div class="d">${T.lotes} lotes · ${assessores.length} pessoas<br>${pct(dre.comissoes / T.venda, 2)} da venda de ${brl0(T.venda)}</div></div>
  <div class="card"><div class="k">Vence em 25/09</div><div class="v">${brl0(dre.comissoes - assessores.find(a => a.nome === 'Nane').comissao)}</div>
    <div class="d">ciclo normal — dia 25 do mês seguinte</div></div>
  <div class="card"><div class="k">Diferido p/ 28/12</div><div class="v">${brl0(assessores.find(a => a.nome === 'Nane').comissao)}</div>
    <div class="d">comissão da Nane, que acumula o ano</div></div>
  <div class="card gold"><div class="k">Já lançado no ERP</div><div class="v">${brl0(titulos.reduce((s, c) => s + Number(c.valor), 0))}</div>
    <div class="d">faltam ${brl0(dre.comissoes - titulos.reduce((s, c) => s + Number(c.valor), 0))} virar título</div></div>
</div>

<h2><span class="n">01</span>Quanto cada um recebe</h2>
<table>
  <thead><tr><th>Quem</th><th class="num">Lotes</th><th class="num">Venda</th><th class="num">%</th>
    <th class="num">Comissão</th><th class="ctr">Vence</th></tr></thead>
  <tbody>${linhasResumo}</tbody>
  <tfoot><tr><td>Total</td><td class="num">${T.lotes}</td><td class="num">${brl0(T.venda)}</td><td></td>
    <td class="num">${num(dre.comissoes)}</td><td></td></tr></tfoot>
</table>
<p class="sub small">* Marcelo Moura não está no cadastro de folha; a comissão dele foi provisionada pelo padrão de 2% e precisa ser confirmada.
Percentuais conforme a folha do ERP e a decisão do grupo Financeiro de 05/08 (Laila e Lucas a 1%).</p>

<h2><span class="n">02</span>Comissão por assessor e por leilão</h2>
<table class="mtz">
  <thead><tr><th class="ctr d">Data</th><th>Leilão</th>
    ${matriz.map(m => `<th class="num a"><div class="rot">${curto(m.nome)}</div></th>`).join('')}
    <th class="num t">Total</th></tr></thead>
  <tbody>${linhasMatriz}</tbody>
  <tfoot><tr><td colspan="2">Total</td>
    ${matriz.map(m => `<td class="num a">${k0(m.total)}</td>`).join('')}
    <td class="num t">${k0(dre.comissoes)}</td></tr></tfoot>
</table>
<p class="sub small">Valores arredondados ao real para caber na página; os centavos estão na tabela da seção 01 e no detalhamento da seção 04.</p>

<div class="box alert">
  <div class="k">${brl0(dre.comissoes - titulos.reduce((s, c) => s + Number(c.valor), 0))} ainda não viraram título no ERP</div>
  <p style="margin:0">Existem apenas ${titulos.length} títulos lançados, somando ${brl(titulos.reduce((s, c) => s + Number(c.valor), 0))}:
  Terra Brava/Fábio (${brl(2142)}), Matinha/Douglas (${brl(840)}) e Matinha/Nane (${brl(1710)}, diferido para dezembro).
  <b>A comissão do Gustavo Rusa — ${brl(assessores.find(a => a.nome === 'Gustavo Rusa').comissao)} — não tem nenhum título.</b>
  Sem lançar o restante, o fechamento de setembro sai errado.</p>
</div>

</div>

<div class="page brk">

<h2><span class="n">03</span>Os lotes que mudaram de dono</h2>
<p>Estes ${dirigidos.length} lotes foram anunciados na pista por um assessor da casa, mas o comprador é direcionado pelo
Gustavo Rusa — então a comissão é dele, a 5%, e o assessor não recebe os 2%. É a regra registrada no ERP: paga-se o Rusa
<b>ou</b> o assessor no mesmo lote, nunca os dois. Pagar ambos seria 7% de comissão num leilão cuja receita é de cerca de 5%.</p>
<table>
  <thead><tr><th class="ctr">Data</th><th>Leilão</th><th class="ctr">Lote</th><th>Comprador</th>
    <th>Anunciou na pista</th><th class="num">VGV</th><th class="num">Rusa 5%</th><th class="num">Deixou de ir<br>ao assessor</th></tr></thead>
  <tbody>${dirigidos.map(t => `<tr>
    <td class="ctr sub">${dt(t.data)}</td><td class="small">${t.leilao}</td><td class="ctr">${t.lote}</td>
    <td class="small">${t.comprador || t.quemDirecionou}</td>
    <td class="small sub">${t.anunciante}</td>
    <td class="num">${num(t.vgv)}</td><td class="num">${num(t.comissao)}</td>
    <td class="num sub">${num(t.vgv * 0.02)}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td colspan="5">Total — ${dirigidos.length} lotes</td><td class="num">${num(vgvDirigido)}</td>
    <td class="num">${num(vgvDirigido * 0.05)}</td><td class="num">${num(perdaAssessores)}</td></tr></tfoot>
</table>
<p class="sub small">A coluna da direita é quanto esses mesmos lotes teriam gerado de comissão se fossem de assessor da casa.
A diferença — ${brl(vgvDirigido * 0.05 - perdaAssessores)} — é o custo do direcionamento nesta feira.</p>

<h2><span class="n">04</span>Lote a lote, por assessor</h2>
${blocosLote}

<footer>
  Bula Assessoria · Expogenética 2026 · comissões apuradas em ${HOJE}. Venda lida do HastaPro (filial 2) lote a lote;
  atribuição pela regra do comprador (src/lib/parceiro-direcionamento.ts); percentuais da folha do ERP.
  Ciclo de pagamento: dia 25 do mês seguinte ao leilão.
</footer>

</div>
</body></html>`

fs.writeFileSync(path.join(OUT, 'comissoes.html'), html)
const browser = await chromium.launch()
const pg = await browser.newPage()
await pg.setContent(html, { waitUntil: 'networkidle' })
const pdfPath = path.join(DESKTOP, 'Bula - Expogenetica 2026 - Comissoes Desdobradas.pdf')
await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } })
await pg.setViewportSize({ width: 794, height: 1123 })
await pg.screenshot({ path: path.join(OUT, 'comissoes-preview.png'), fullPage: true })
await browser.close()

/* ── XLSX ── */
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(assessores.map(a => ({
  Quem: a.nome, Lotes: a.lotes, Venda: a.venda, '%': a.pct, 'Comissão': a.comissao, Vence: quando(a.nome), Obs: nota(a.nome),
}))), 'Resumo')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(comLeiloes.flatMap(l => l.lotes.map(t => ({
  Data: l.data, 'Leilão': l.nome, Lote: t.lote, Animais: t.animais, VGV: t.vgv,
  Comprador: t.comprador, Fazenda: t.fazenda, UF: t.uf,
  'Anunciou na pista': t.anunciante, 'Direcionado por': t.quemDirecionou || '',
  'Comissão de': t.assessor, '%': t.pct, 'Comissão': t.comissao,
})))), 'Lote a lote')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(comLeiloes.map((l, i) => {
  const row = { Data: l.data, 'Leilão': l.nome }
  matriz.forEach(m => { row[m.nome] = m.porLeilao[i].com || null })
  row['Total'] = l.comissaoPaga
  return row
})), 'Assessor x Leilão')
let xlsxPath = path.join(DESKTOP, 'Bula - Expogenetica 2026 - Comissoes Desdobradas.xlsx')
try { XLSX.writeFile(wb, xlsxPath) } catch (e) {
  if (e.code !== 'EBUSY') throw e
  xlsxPath = xlsxPath.replace(/\.xlsx$/, ' (atualizado).xlsx'); XLSX.writeFile(wb, xlsxPath)
}
console.log('\nPDF  ->', pdfPath)
console.log('XLSX ->', xlsxPath)
console.log('total comissoes', num(dre.comissoes), '| titulado', num(titulos.reduce((s, c) => s + Number(c.valor), 0)),
  '| lotes direcionados', dirigidos.length, num(vgvDirigido))
