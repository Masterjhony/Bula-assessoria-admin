// Relatorio de vendas do Douglas Bispo em julho/2026, conferido no HastaPro.
//
// Fonte da verdade: Firebird do HastaPro (FIL_CODIGO='2' = Bula Assessoria).
// Os numeros de julho foram CONFERIDOS AO VIVO no banco em 06/08/2026 (SELECT
// only, C:\databases\BULAREMATES\dados.fdb) e batem lote a lote com o snapshot
// outputs/hastapro/ de 27/07 — que este script le por ser mais rapido/estavel.
// Atribuicao de venda = LOTES.LOT_PISTEIRO (Douglas = PRE_CODIGO 251122122024148).
// Cruzamento de controle: bula_leilao_fechamento.por_assessor no Supabase.
//
// Saidas:
//   outputs/vendas-douglas-julho-2026.html
//   outputs/vendas-douglas-julho-2026.pdf
//   Desktop/Vendas Douglas Bispo - Julho 2026.pdf
//
// Uso: node scripts/gera-relatorio-vendas-douglas-julho-2026.mjs

import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(root, 'outputs')
const hasta = join(root, 'outputs', 'hastapro')
const desktop = join(process.env.USERPROFILE || '', 'Desktop')

const DOUGLAS = '251122122024148'
const INI = '2026-07-01'
const FIM = '2026-07-31'
// Codigo 260707195925645 aparece em LOT_PISTEIRO mas nao existe em PRESTADORES;
// so existe em CLIENTES (consultado ao vivo em 06/08/2026).
const PISTEIRO_FORA_DA_EQUIPE = 'Regiane Cristina Neves de Abreu'

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })
const pct = (v) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const br = (iso) => (iso || '').slice(0, 10).split('-').reverse().join('/')
const clean = (s) => (s == null ? s : String(s).replace(/�/g, '').replace(/\s+/g, ' ').trim())

const L = (f) => JSON.parse(readFileSync(join(hasta, f), 'utf8'))
const lotes = L('lotes.json')
const leiloes = L('leiloes.json')
const prestadores = L('prestadores.json')
const compradores = L('compradores.json')
const vendedores = L('vendedores.json')
const clientes = L('clientes_full.json')
const fazendas = L('fazendas.json')

const preMap = Object.fromEntries(prestadores.map((p) => [p.PRE_CODIGO, clean(p.PRE_NOME)]))
const leiMap = Object.fromEntries(leiloes.map((l) => [l.LEI_CODIGO, l]))
const cliMap = Object.fromEntries(clientes.map((c) => [c.CLI_CODIGO, c]))
const fazPorCli = {}
for (const f of fazendas) (fazPorCli[f.CLI_CODIGO] ??= []).push(f)
const lotKey = (l) => `${l.LEI_CODIGO}|${l.LOT_LOTE}`
const compMap = {}
for (const c of compradores) (compMap[lotKey(c)] ??= c)
const vendMap = {}
for (const v of vendedores) (vendMap[lotKey(v)] ??= v)

const dataVenda = (l) => (l.LOT_DATA_VENDA || leiMap[l.LEI_CODIGO]?.LEI_DATA || '').slice(0, 10)
const noPeriodo = (l) => { const d = dataVenda(l); return d >= INI && d <= FIM }

// --- identificacao do comprador: cadastro + fazenda (UF costuma so existir na fazenda)
function comprador(l) {
  const cp = compMap[lotKey(l)]
  if (!cp) return { nome: '(sem comprador no lote)', uf: null, fazenda: null }
  const c = cliMap[cp.CLI_CODIGO]
  const fz = (fazPorCli[cp.CLI_CODIGO] || [])[0]
  return {
    codigo: cp.CLI_CODIGO,
    nome: clean(c?.CLI_NOME || c?.CLI_RAZAOSOCIAL) || `(cod. ${cp.CLI_CODIGO} fora do cadastro)`,
    uf: c?.CLI_UF || fz?.FAZ_UF || null,
    fazenda: clean(fz?.FAZ_NOME) || null,
    semCadastro: !c,
  }
}

const julho = lotes.filter(noPeriodo)
const vendas = julho.filter((l) => l.LOT_PISTEIRO === DOUGLAS)
  .map((l) => {
    const le = leiMap[l.LEI_CODIGO]
    const cp = comprador(l)
    const vd = vendMap[lotKey(l)]
    const vendedor = vd ? clean(cliMap[vd.CLI_CODIGO]?.CLI_NOME || cliMap[vd.CLI_CODIGO]?.CLI_RAZAOSOCIAL) : null
    return {
      data: dataVenda(l),
      leilao: clean(le?.LEI_NOME),
      lote: String(l.LOT_LOTE).trim(),
      qtd: Number(l.LOT_QTD || 0),
      total: Number(l.LOT_TOTAL || 0),
      parcela: Number(l.LOT_LANCE || 0),
      parcelas: l.LOT_LANCE && l.LOT_QTD ? Math.round(l.LOT_TOTAL / (l.LOT_LANCE * l.LOT_QTD)) : null,
      comprador: cp.nome,
      compradorUf: cp.uf,
      compradorSemCadastro: cp.semCadastro,
      vendedor,
    }
  })
  .sort((a, b) => a.data.localeCompare(b.data) || a.leilao.localeCompare(b.leilao))

const soma = (arr, f) => arr.reduce((s, x) => s + Number(f(x) || 0), 0)
const vgv = soma(vendas, (v) => v.total)
const animais = soma(vendas, (v) => v.qtd)
const ticket = vgv / vendas.length
const COMISSAO_PCT = 0.02
const comissao = vgv * COMISSAO_PCT

// --- ancoras conferidas manualmente contra o HastaPro
assert.equal(vendas.length, 26)
assert.equal(animais, 35)
assert.equal(vgv, 965700)

// --- agrupamentos
const agrupa = (arr, chave) => {
  const m = new Map()
  for (const v of arr) {
    const k = chave(v)
    if (!m.has(k)) m.set(k, { chave: k, lotes: 0, animais: 0, vgv: 0 })
    const g = m.get(k)
    g.lotes += 1; g.animais += v.qtd; g.vgv += v.total
  }
  return [...m.values()].sort((a, b) => b.vgv - a.vgv)
}

const porEvento = agrupa(vendas, (v) => `${v.data}|${v.leilao}`).map((g) => {
  const [data, leilao] = g.chave.split('|')
  return { ...g, data, leilao }
}).sort((a, b) => b.vgv - a.vgv)

const porComprador = agrupa(vendas, (v) => v.comprador).map((g) => ({
  ...g,
  uf: vendas.find((v) => v.comprador === g.chave)?.compradorUf || null,
  share: g.vgv / vgv,
}))

const porUf = agrupa(vendas, (v) => v.compradorUf || 'sem UF')

// --- equipe no mesmo mes (mesmo criterio: LOT_PISTEIRO)
// Lotes com total 0 sao lotes abertos e nao vendidos — ficam de fora do ranking.
const equipe = agrupa(julho.filter((l) => Number(l.LOT_TOTAL || 0) > 0).map((l) => ({
  chave: preMap[l.LOT_PISTEIRO] || null,
  qtd: Number(l.LOT_QTD || 0),
  total: Number(l.LOT_TOTAL || 0),
  pist: l.LOT_PISTEIRO,
})), (x) => x.chave || (x.pist ? `${PISTEIRO_FORA_DA_EQUIPE} (lançada como cliente, não como prestador)` : 'Sem pisteiro informado'))
const vgvEquipe = soma(equipe, (e) => e.vgv)
const shareDouglas = vgv / vgvEquipe
const posicao = equipe.findIndex((e) => e.chave === 'Douglas Bispo Carvalho') + 1
assert.equal(posicao, 1)

// --- serie 2026 do Douglas
const serie = agrupa(
  lotes.filter((l) => l.LOT_PISTEIRO === DOUGLAS).map((l) => ({
    chave: dataVenda(l).slice(0, 7), qtd: Number(l.LOT_QTD || 0), total: Number(l.LOT_TOTAL || 0),
  })),
  (x) => x.chave
).sort((a, b) => a.chave.localeCompare(b.chave))
const mesNome = { '01': 'jan', '02': 'fev', '03': 'mar', '04': 'abr', '05': 'mai', '06': 'jun', '07': 'jul' }
const junho = serie.find((s) => s.chave === '2026-06')
const variacao = (vgv - junho.vgv) / junho.vgv

// --- divergencia com o ERP (bula_leilao_fechamento.por_assessor)
// Numeros do ERP consultados no Supabase em 06/08/2026 (evento = fechamento).
const erp = [
  { evento: 'Navirai Matrizes', data: '2026-07-05', hasta: 85500, erp: 85500 },
  { evento: 'EAO Baviera — Femeas', data: '2026-07-11', hasta: 322500, erp: 322500 },
  { evento: 'Nelore Sorriso — Femeas', data: '2026-07-12', hasta: 159000, erp: 159000, nota: 'HastaPro registra 15.000 em 12/07 e 144.000 em 13/07; o fechamento consolida os dois dias.' },
  { evento: 'EAO Baviera — Machos', data: '2026-07-12', hasta: 102300, erp: 145800, nota: 'O ERP credita 4 transacoes ao Douglas; no HastaPro sao 2 lotes (348 e 396). Os 43.500 restantes estao com o Fabio no HastaPro.' },
  { evento: 'Base Genetica Santa Cruz — 1a etapa', data: '2026-07-14', hasta: 25500, erp: 0, nota: 'Lote 116 e do Douglas no HastaPro; o ERP creditou ao Leonardo.' },
  { evento: 'Base Genetica Santa Cruz — 2a etapa', data: '2026-07-15', hasta: 42600, erp: 22500, nota: 'Lote 124 (20.100) e do Douglas no HastaPro; o ERP creditou ao Gustavo Rusa (a 5%).' },
  { evento: 'Navirai Matrizes — 2a etapa', data: '2026-07-16', hasta: 52500, erp: 28500, nota: 'Lote 33 (24.000) e do Douglas no HastaPro; o ERP creditou ao Leonardo.' },
  { evento: 'Guadalupe Agropecuaria — Femeas', data: '2026-07-18', hasta: 19500, erp: 0, nota: 'O ERP tem esse lote como "A definir". E do Douglas no HastaPro (comprador Gilberto Pereira Sarubi, PA).' },
  { evento: 'Base Genetica Santa Cruz — 3a etapa', data: '2026-07-19', hasta: 99600, erp: 99600 },
  { evento: 'Genetica Aditiva — 1a etapa Femeas', data: '2026-07-25', hasta: 56700, erp: 56700 },
  { evento: 'Genetica Aditiva — 2a etapa Touros', data: '2026-07-26', hasta: 0, erp: 0 },
]
const erpTotal = soma(erp, (e) => e.erp)
const erpDelta = vgv - erpTotal
assert.equal(soma(erp, (e) => e.hasta), vgv)
assert.equal(erpTotal, 920100)
assert.equal(erpDelta, 45600)

const maiorLote = vendas.reduce((a, b) => (b.total > a.total ? b : a))

// --- qualidade do cadastro do comprador (olhando o registro de cliente, nao o fallback da fazenda)
const cadComprador = (v) => {
  const l = lotes.find((x) => x.LOT_PISTEIRO === DOUGLAS && dataVenda(x) === v.data && String(x.LOT_LOTE).trim() === v.lote)
  const cp = l ? compMap[lotKey(l)] : null
  return cp ? cliMap[cp.CLI_CODIGO] || null : null
}
const semCadastro = vendas.filter((v) => v.compradorSemCadastro)
const semUfCadastro = vendas.filter((v) => !cadComprador(v)?.CLI_UF)
const semDoc = vendas.filter((v) => !cadComprador(v)?.CLI_CPFCNPJ)

const linhaSerie = serie.map((s) => {
  const alt = Math.round((s.vgv / Math.max(...serie.map((x) => x.vgv))) * 86)
  return `<div class="bar"><div class="bar-val">${brl0(s.vgv)}</div><div class="bar-fill" style="height:${alt}%"></div><div class="bar-lbl">${mesNome[s.chave.slice(5)]}</div></div>`
}).join('')

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Vendas Douglas Bispo — Julho/2026</title>
<style>
  @page { size: A4; margin: 11mm 10mm 13mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #151515; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 10.2px; line-height: 1.35; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #151515; padding-bottom: 10px; }
  .header.repeat { padding-top: 6mm; }
  .brand { font-size: 20px; font-weight: 800; letter-spacing: 2.6px; text-transform: uppercase; }
  .brand small { display: block; margin-top: 2px; color: #666; font-size: 8px; font-weight: 400; letter-spacing: 1.8px; }
  .meta { color: #555; font-size: 8.7px; line-height: 1.45; text-align: right; }
  .gold-rule { width: 64px; height: 3px; margin: 7px 0 13px; background: #c5a34c; }
  h1 { margin: 0; font-size: 17px; letter-spacing: 1.2px; text-transform: uppercase; }
  .subtitle { margin: 4px 0 13px; color: #555; font-size: 10px; }
  h2 { margin: 17px 0 7px; font-size: 12px; letter-spacing: .8px; text-transform: uppercase; }
  .hero { display: grid; grid-template-columns: 1.15fr .85fr; gap: 10px; margin-top: 10px; }
  .hero-main { padding: 13px 15px; color: #fff; background: #151515; }
  .hero-main .label { color: #d9c17e; font-size: 8.5px; letter-spacing: 1.1px; text-transform: uppercase; }
  .hero-main .amount { margin-top: 3px; font-size: 27px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .hero-main .line { margin-top: 5px; color: #ddd; font-size: 9px; }
  .hero-side { padding: 11px 13px; border: 1px solid #cfcfcf; background: #fafafa; display: grid; grid-template-columns: 1fr 1fr; gap: 7px 12px; }
  .kpi .small { color: #666; font-size: 8.2px; text-transform: uppercase; letter-spacing: .7px; }
  .kpi .amount { font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .callout { margin: 9px 0 0; padding: 8px 10px; border-left: 3px solid #c5a34c; background: #f8f5eb; }
  .callout strong { color: #55430e; }
  .callout.warn { border-left-color: #a7463f; background: #fbf2f1; }
  .callout.warn strong { color: #7d332d; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { padding: 4px 5px; border-bottom: 1.5px solid #202020; color: #555; font-size: 8px; letter-spacing: .55px; text-align: left; text-transform: uppercase; }
  td { padding: 4px 5px; border-bottom: 1px solid #dedede; vertical-align: top; }
  tr { break-inside: avoid; }
  .right { text-align: right; }
  .money { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .dim { color: #666; font-size: 9px; }
  .total td { padding-top: 6px; border-top: 2px solid #151515; border-bottom: none; font-size: 11px; font-weight: 800; }
  .rank td:first-child { width: 18px; color: #999; font-weight: 700; }
  .me { background: #f3efe1; font-weight: 700; }
  .chart { display: flex; align-items: flex-end; gap: 10px; height: 110px; margin: 10px 0 4px; padding: 0 2px; }
  .bar { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; position: relative; }
  .bar-fill { width: 100%; background: #232323; }
  .bar:last-child .bar-fill { background: #c5a34c; }
  .bar-val { margin-bottom: 2px; font-size: 7.6px; color: #444; font-weight: 700; }
  .bar-lbl { margin-top: 3px; font-size: 8px; color: #666; text-transform: uppercase; letter-spacing: .6px; }
  .detail td:nth-child(1) { width: 46px; white-space: nowrap; }
  .detail td:nth-child(3) { width: 42px; }
  .detail td:nth-child(4) { width: 26px; }
  .detail td:nth-child(5), .detail td:nth-child(6) { width: 80px; }
  .diverg td:nth-child(1) { width: 46px; }
  .diverg .nota { color: #555; font-size: 8.8px; }
  .page-break { break-before: page; }
  .footer { margin-top: 16px; padding-top: 7px; border-top: 1px solid #bbb; color: #777; font-size: 8px; display: flex; justify-content: space-between; }
</style>
</head>
<body>

<div class="header">
  <div class="brand">Bula Assessoria<small>Assessoria Pecuária</small></div>
  <div class="meta">Documento interno<br>Fonte: HastaPro (ERP da leiloeira)<br>Emitido em 06/08/2026</div>
</div>
<div class="gold-rule"></div>
<h1>Vendas — Douglas Bispo · Julho/2026</h1>
<div class="subtitle">Conferência lote a lote no HastaPro (filial Bula Assessoria), com cruzamento contra os fechamentos do nosso ERP.</div>

<div class="hero">
  <div class="hero-main">
    <div class="label">VGV vendido em julho</div>
    <div class="amount">${brl(vgv)}</div>
    <div class="line">${vendas.length} lotes · ${animais} animais · ${porEvento.length} leilões · ticket médio ${brl(ticket)}</div>
  </div>
  <div class="hero-side">
    <div class="kpi"><div class="small">Posição na equipe</div><div class="amount">${posicao}º de ${equipe.length}</div><div class="dim">${pct(shareDouglas * 100)} do VGV do mês</div></div>
    <div class="kpi"><div class="small">Vs. junho</div><div class="amount">${variacao >= 0 ? '+' : ''}${pct(variacao * 100)}</div><div class="dim">junho: ${brl0(junho.vgv)}</div></div>
    <div class="kpi"><div class="small">Comissão de referência (2%)</div><div class="amount">${brl(comissao)}</div></div>
    <div class="kpi"><div class="small">Maior lote</div><div class="amount">${brl0(maiorLote.total)}</div><div class="dim">lote ${esc(maiorLote.lote)} · ${esc(maiorLote.leilao.replace(/^LEILÃO /, ''))}</div></div>
  </div>
</div>

<div class="callout">
  <strong>Conferido:</strong> o HastaPro registra ${vendas.length} lotes com o Douglas como pisteiro em julho, somando ${brl(vgv)} e ${animais} animais.
  É o melhor mês dele em 2026 e o primeiro lugar da equipe no mês. O nosso ERP credita ${brl(erpTotal)} — ${brl(erpDelta)} a menos, por diferença de atribuição em 5 leilões (detalhe na página 2).
</div>

<h2>Evolução 2026 — VGV por mês</h2>
<div class="chart">${linhaSerie}</div>
<table>
  <thead><tr><th>Mês</th>${serie.map((s) => `<th class="right">${mesNome[s.chave.slice(5)]}</th>`).join('')}</tr></thead>
  <tbody>
    <tr><td class="dim">Lotes</td>${serie.map((s) => `<td class="right">${s.lotes}</td>`).join('')}</tr>
    <tr><td class="dim">Animais</td>${serie.map((s) => `<td class="right">${s.animais}</td>`).join('')}</tr>
    <tr><td class="dim">Ticket médio por lote</td>${serie.map((s) => `<td class="right money">${brl0(s.vgv / s.lotes)}</td>`).join('')}</tr>
  </tbody>
</table>

<h2>Ranking da equipe em julho (critério: pisteiro do lote no HastaPro)</h2>
<table class="rank">
  <thead><tr><th></th><th>Pisteiro</th><th class="right">VGV</th><th class="right">Lotes</th><th class="right">Animais</th><th class="right">Ticket</th><th class="right">% do mês</th></tr></thead>
  <tbody>
    ${equipe.map((e, i) => `
      <tr class="${e.chave === 'Douglas Bispo Carvalho' ? 'me' : ''}">
        <td>${i + 1}</td>
        <td>${esc(e.chave)}</td>
        <td class="right money">${brl(e.vgv)}</td>
        <td class="right">${e.lotes}</td>
        <td class="right">${e.animais}</td>
        <td class="right money">${brl0(e.vgv / e.lotes)}</td>
        <td class="right">${pct((e.vgv / vgvEquipe) * 100)}</td>
      </tr>`).join('')}
    <tr class="total"><td></td><td>Total da equipe</td><td class="right money">${brl(vgvEquipe)}</td><td class="right">${soma(equipe, (e) => e.lotes)}</td><td class="right">${soma(equipe, (e) => e.animais)}</td><td></td><td class="right">100,0%</td></tr>
  </tbody>
</table>
<div class="callout">
  <strong>Leitura:</strong> Douglas e Fábio respondem por ${pct(((equipe[0].vgv + equipe[1].vgv) / vgvEquipe) * 100)} do VGV de julho. O total da equipe aqui (${brl(vgvEquipe)}) é maior que o relatório oficial de julho (R$ 2.182.500) porque inclui 4 leilões de 02/07 que não viraram fechamento no nosso ERP — todos do Fábio, sem efeito sobre o Douglas.
  O 3º colocado, ${esc(PISTEIRO_FORA_DA_EQUIPE)} (${brl(equipe[2].vgv)} em ${equipe[2].lotes} lotes), está lançado como <em>cliente</em> no HastaPro e não existe no cadastro de prestadores — não tem função nem percentual definidos. Nos fechamentos do nosso ERP esses mesmos lotes aparecem creditados ao Leonardo Serafim. Vale acertar esse cadastro antes de fechar a comissão de julho.
</div>

<div class="page-break"></div>
<div class="header repeat">
  <div class="brand">Bula Assessoria<small>Assessoria Pecuária</small></div>
  <div class="meta">Vendas Douglas Bispo — Julho/2026<br>Página 2</div>
</div>
<div class="gold-rule"></div>

<h2>Por leilão</h2>
<table>
  <thead><tr><th>Data</th><th>Leilão</th><th class="right">Lotes</th><th class="right">Animais</th><th class="right">VGV</th><th class="right">% do mês</th></tr></thead>
  <tbody>
    ${porEvento.map((e) => `
      <tr>
        <td>${br(e.data)}</td>
        <td>${esc(e.leilao)}</td>
        <td class="right">${e.lotes}</td>
        <td class="right">${e.animais}</td>
        <td class="right money">${brl(e.vgv)}</td>
        <td class="right">${pct((e.vgv / vgv) * 100)}</td>
      </tr>`).join('')}
    <tr class="total"><td></td><td>Total</td><td class="right">${vendas.length}</td><td class="right">${animais}</td><td class="right money">${brl(vgv)}</td><td class="right">100,0%</td></tr>
  </tbody>
</table>

<h2>Por comprador</h2>
<table>
  <thead><tr><th>Comprador</th><th>UF</th><th class="right">Lotes</th><th class="right">Animais</th><th class="right">VGV</th><th class="right">% do mês</th></tr></thead>
  <tbody>
    ${porComprador.map((c) => `
      <tr>
        <td>${esc(c.chave)}</td>
        <td>${esc(c.uf || '—')}</td>
        <td class="right">${c.lotes}</td>
        <td class="right">${c.animais}</td>
        <td class="right money">${brl(c.vgv)}</td>
        <td class="right">${pct(c.share * 100)}</td>
      </tr>`).join('')}
  </tbody>
</table>
<div class="callout warn">
  <strong>Concentração:</strong> ${esc(porComprador[0].chave)} sozinho responde por ${pct(porComprador[0].share * 100)} do VGV do Douglas em julho (${brl(porComprador[0].vgv)} em ${porComprador[0].lotes} lotes).
  Somando os dois maiores, chega a ${pct(((porComprador[0].vgv + porComprador[1].vgv) / vgv) * 100)}. São ${porComprador.length} compradores distintos no mês — a receita depende muito de poucos nomes.
</div>
<div class="callout">
  <strong>Praça:</strong> ${porUf.map((u) => `${u.chave} ${brl0(u.vgv)}`).join(' · ')}. Coerente com a zona dele (Norte + Maranhão); a exceção é o comprador de MS (${brl0(porUf.find((u) => u.chave === 'MS')?.vgv || 0)}).
</div>

<h2>Divergência entre o HastaPro e o nosso ERP</h2>
<table class="diverg">
  <thead><tr><th>Data</th><th>Leilão</th><th class="right">HastaPro</th><th class="right">ERP Bula</th><th class="right">Diferença</th></tr></thead>
  <tbody>
    ${erp.map((e) => `
      <tr>
        <td>${br(e.data)}</td>
        <td>${esc(e.evento)}${e.nota ? `<div class="nota">${esc(e.nota)}</div>` : ''}</td>
        <td class="right money">${brl(e.hasta)}</td>
        <td class="right money">${brl(e.erp)}</td>
        <td class="right money">${e.hasta - e.erp === 0 ? '—' : brl(e.hasta - e.erp)}</td>
      </tr>`).join('')}
    <tr class="total"><td></td><td>Total</td><td class="right money">${brl(vgv)}</td><td class="right money">${brl(erpTotal)}</td><td class="right money">${brl(erpDelta)}</td></tr>
  </tbody>
</table>
<div class="callout warn">
  <strong>Por que isso importa:</strong> a comissão é calculada em cima da atribuição. Pelo HastaPro o Douglas fecha julho com ${brl(vgv)} (2% = ${brl(comissao)});
  pelo ERP, ${brl(erpTotal)} (2% = ${brl(erpTotal * COMISSAO_PCT)}). A diferença de ${brl(erpDelta)} vale ${brl(erpDelta * COMISSAO_PCT)} de comissão.
  Os fechamentos do ERP em quatro desses casos vieram da captura de lances do WhatsApp, que atribui pelo que foi falado na pista; o HastaPro registra o pisteiro no cadastro do lote. Antes de fechar a comissão de julho, vale bater esses 5 leilões com o Douglas e com quem o ERP creditou (Leonardo, Fábio e Rusa).
</div>

<h2>Pontos de atenção no cadastro</h2>
<table>
  <thead><tr><th>Achado</th><th class="right">Lotes</th><th>Efeito</th></tr></thead>
  <tbody>
    <tr><td>Comprador sem cadastro de cliente no HastaPro (só o código)</td><td class="right">${semCadastro.length}</td><td class="dim">Não dá para cruzar com o CRM nem com o módulo Clientes; ficam de fora de qualquer ação de recompra.</td></tr>
    <tr><td>Comprador sem UF no cadastro de cliente</td><td class="right">${semUfCadastro.length}</td><td class="dim">A UF usada neste relatório veio da fazenda vinculada, não do cadastro do cliente.</td></tr>
    <tr><td>Comprador sem CPF/CNPJ no cadastro</td><td class="right">${semDoc.length}</td><td class="dim">Cadastro rápido feito durante o pregão; trava habilitação e faturamento.</td></tr>
  </tbody>
</table>

<div class="page-break"></div>
<div class="header repeat">
  <div class="brand">Bula Assessoria<small>Assessoria Pecuária</small></div>
  <div class="meta">Vendas Douglas Bispo — Julho/2026<br>Página 3 · Detalhe lote a lote</div>
</div>
<div class="gold-rule"></div>

<h2>Detalhe — ${vendas.length} lotes</h2>
<table class="detail">
  <thead><tr><th>Data</th><th>Leilão / lote</th><th class="right">Lote</th><th class="right">Qtd</th><th class="right">Valor</th><th class="right">Parcelamento</th><th>Comprador</th></tr></thead>
  <tbody>
    ${vendas.map((v) => `
      <tr>
        <td>${br(v.data)}</td>
        <td>${esc(v.leilao)}${v.vendedor ? `<div class="dim">vendedor: ${esc(v.vendedor)}</div>` : ''}</td>
        <td class="right">${esc(v.lote)}</td>
        <td class="right">${v.qtd}</td>
        <td class="right money">${brl(v.total)}</td>
        <td class="right money">${v.parcelas ? `${v.parcelas}x ${brl(v.parcela)}` : '—'}</td>
        <td>${esc(v.comprador)}${v.compradorUf ? ` <span class="dim">(${esc(v.compradorUf)})</span>` : ''}</td>
      </tr>`).join('')}
    <tr class="total"><td></td><td>Total</td><td></td><td class="right">${animais}</td><td class="right money">${brl(vgv)}</td><td></td><td></td></tr>
  </tbody>
</table>

<h2>Como este relatório foi apurado</h2>
<div class="callout">
  <strong>Fonte:</strong> base Firebird do HastaPro, filial <em>Bula Assessoria</em>. Venda atribuída pelo campo <em>pisteiro</em> do lote (cadastro do Douglas Bispo Carvalho, CPF 068.770.065-50).
  Valor = <em>total do lote</em>; parcelamento derivado de total ÷ (parcela × cabeças). Período: 01/07 a 31/07/2026 — o último leilão de julho na base é 26/07, então o mês está completo.
  Os 26 lotes foram conferidos ao vivo no banco do HastaPro em 06/08/2026 (consulta somente-leitura), lote a lote. Cruzamento de controle: <em>bula_leilao_fechamento.por_assessor</em> do nosso ERP, na mesma data.
</div>
<div class="callout">
  <strong>Sobre a comissão:</strong> os ${brl(comissao)} são a referência da tabela fixa de 2% sobre o VGV de cobertura. O valor efetivamente pago sai da planilha do financeiro e historicamente difere dessa conta —
  use este número para conferência, não como autorização de pagamento. Pagamento da comissão de julho: dia 25/08 (ou o dia útil seguinte).
</div>

<div class="footer">
  <span>Bula Assessoria · documento interno</span>
  <span>Gerado em 06/08/2026 a partir do HastaPro</span>
</div>

</body>
</html>`

mkdirSync(outputDir, { recursive: true })
const htmlPath = join(outputDir, 'vendas-douglas-julho-2026.html')
const pdfPath = join(outputDir, 'vendas-douglas-julho-2026.pdf')
writeFileSync(htmlPath, html, 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '11mm', right: '10mm', bottom: '13mm', left: '10mm' } })
await browser.close()

try {
  writeFileSync(join(desktop, 'Vendas Douglas Bispo - Julho 2026.pdf'), readFileSync(pdfPath))
} catch (err) {
  console.log('(nao copiei para o Desktop:', err.message, ')')
}

console.log('HTML:', htmlPath)
console.log('PDF :', pdfPath)
console.log('Desktop: Vendas Douglas Bispo - Julho 2026.pdf')
console.log(`\nVGV ${brl(vgv)} | ${vendas.length} lotes | ${animais} animais | ticket ${brl(ticket)}`)
console.log(`Equipe ${brl(vgvEquipe)} — Douglas ${pct(shareDouglas * 100)} (${posicao}o lugar)`)
console.log(`ERP credita ${brl(erpTotal)} — divergencia ${brl(erpDelta)} (${brl(erpDelta * COMISSAO_PCT)} de comissao)`)
