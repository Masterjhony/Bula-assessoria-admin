/**
 * Renderiza "Fechamento de vendas — setembro/2026 (até 13/09)" a partir de
 * outputs/fechamento-setembro-2026/dados.json (scripts/fechamento-setembro-2026.mjs).
 * PDF A4 na Área de Trabalho; nenhum número escrito à mão.
 * Molde: brandbook preto/grafite/branco, Oswald, dourado só no filete;
 * pg.pdf() com margem ZERO e .page com height fixa (render-pdf-a4-margem-zero).
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'
import { PDFDocument } from 'pdf-lib'

const OUT = 'outputs/fechamento-setembro-2026'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pct = (n, d = 0) => (Number(n || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const dm = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—'
const corta = (t, n) => { const x = String(t ?? ''); if (x.length <= n) return x; const c = x.slice(0, n), sp = c.lastIndexOf(' '); return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–·]+$/, '') + '…' }
const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C'
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')
const E = Object.fromEntries(D.eventos.map(e => [e.key, e]))
const T = D.totais, M = D.meta
const ge = new Date(D.geradoEm); const hoje = `${String(ge.getDate()).padStart(2, '0')}/${String(ge.getMonth() + 1).padStart(2, '0')}/${ge.getFullYear()}`
const NPAG = 9
const foot = n => `<div class="pfoot"><span>Bula Assessoria Pecuária · Fechamento de vendas — setembro/2026 (até 13/09) · emitido em ${hoje}</span><span>Página ${n} de ${NPAG}</span></div>`
const autorCurto = a => { const x = String(a || ''); if (/De Omena Gaia/.test(x)) return 'Fábio (2º nº)'; if (/Omena/.test(x)) return 'Fábio'; if (/Douglas/.test(x)) return 'Douglas'; if (/Leonardo/.test(x)) return 'Leonardo'; if (/Nane/.test(x)) return 'Nane'; if (/Marcelo/.test(x)) return 'Marcelo C.'; if (/Laila/.test(x)) return 'Laila'; if (/Peralta/.test(x)) return 'Peralta'; if (/Felipe Andrade/.test(x)) return 'Bulinha'; return x ? corta(x, 14) : 'não capturado' }
const nomeCurto = n => String(n || '').replace(' (Regiane)', '').replace('Fábio Omena', 'Fábio').replace('Douglas Bispo', 'Douglas').replace('Leonardo Serafim', 'Leonardo').replace('Marcelo Carneiro', 'Marcelo C.')
const praca = l => [l.cidade, l.uf].filter(Boolean).join('-') || (l.uf || '—')

const linha = (l, opts = {}) => `<tr>
  <td><strong>${esc(l.lote)}</strong></td>
  ${opts.animal ? `<td>${esc(corta(l.animal || (l.sexo === 'F' ? 'fêmea' : 'touro'), 22))}</td>` : ''}
  <td class="num">${brl(l.parcela)}</td><td class="num">${l.parcelas}×${l.qtd > 1 ? l.qtd : ''}</td><td class="num"><strong>R$ ${brl(l.vgv)}</strong></td>
  <td style="white-space:nowrap">${esc(nomeCurto(l.assessor))}${l.atribuicao ? ` <span class="muted">(correl.)</span>` : ''}</td>
  <td style="white-space:nowrap">${esc(corta(l.comprador + (l.fazenda && l.fazenda !== l.comprador ? ' · ' + l.fazenda : ''), 52))}</td>
  <td style="white-space:nowrap">${esc(corta(praca(l), 20))}</td>
  <td style="white-space:nowrap">${esc((l.fichaQuando || '—').replace(/^\d\d\/\d\d /, ''))} <span class="muted">${esc(autorCurto(l.fichaAutor))}</span></td>
  <td class="num">R$ ${brl(l.comissao)}</td></tr>`
const linhaAra = l => `<tr><td><strong>${esc(l.lote)}</strong></td><td>${esc(l.animal)}</td><td class="num">${l.qtd}</td><td class="num"><strong>R$ ${brl(l.vgv)}</strong></td><td style="white-space:nowrap">${esc(corta(l.comprador, 60))}</td><td class="num">R$ ${brl(l.comissao)}</td></tr>`
const total = (ev, cols) => `<tr class="total"><td colspan="${cols}">${ev.totais.lotes} lotes · ${ev.totais.cabecas} cabeças</td><td class="num">R$ ${brl(ev.totais.vgv)}</td><td colspan="4"></td><td class="num">R$ ${brl(ev.totais.comissao)}</td></tr>`
const porAss = ev => ev.porAssessor.map(a => `${esc(nomeCurto(a.nome))} ${a.lotes} lote${a.lotes > 1 ? 's' : ''} · R$ ${brl0(a.vgv)}`).join(' &nbsp;|&nbsp; ')
const obsLotes = ev => ev.lotes.filter(l => l.obs).map(l => `<li><strong>lt ${esc(l.lote)}:</strong> ${esc(l.obs)}</li>`).join('')
const kv = (k, v) => `<span>${k}</span><div>${v}</div>`
const colsLotes = `<colgroup><col style="width:10mm"><col style="width:13mm"><col style="width:8mm"><col style="width:20mm"><col style="width:21mm"><col style="width:48mm"><col style="width:25mm"><col style="width:22mm"><col style="width:17mm"></colgroup>`
const cabLotes = `<tr><th>Lote</th><th class="num">Parcela</th><th class="num">×</th><th class="num">VGV</th><th>Vendeu</th><th>Comprador</th><th>Praça</th><th>Ficha (hora · quem postou)</th><th class="num">Com.</th></tr>`
const JAC = E.jacamim, ARA = E.aratau, MAR = E.marcondes, MAF = E.mafra, VIS = E.visual, AZ = E.az, EAO = E.eao, KAT = E.katayama, CRI = E.crispim
const ibc = D.fora[0]
const ass = n => D.porAssessor.find(a => new RegExp(n).test(a.nome))
const NOME_CURTO = [
  [/Jacamim/i, 'JACAMIM — 10º Especial Touros'], [/Arata/i, 'FLOR DO ARATAÚ — 10º Leilão & Convidados'], [/Marcondes/i, 'NELORE MARCONDES — Leilão Caminhos'],
  [/Mafra/i, 'MAFRA — Touros Premium (Uberaba)'], [/Visual/i, 'NELORE VISUAL — Shopping de Genética'], [/Nelore AZ/i, 'NELORE AZ — Reprodutores'],
  [/Mega Premium EAO/i, 'EAO — 7º Mega Premium (touros + fêmeas 13/09)'], [/Katayama/i, 'KATAYAMA — Novo Repartimento (fêmeas)'], [/Crispim/i, 'CRISPIM — 2º Herança Genética'],
  [/IBC/i, 'AGROFEIRA IBC — pré-venda (02–08/09)'], [/Só Criador/i, 'SÓ CRIADOR — Bula Remates (gado comercial)'],
]
const nomeTabela = n => (NOME_CURTO.find(([re]) => re.test(n)) || [null, n])[1]

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Bula — Fechamento de vendas — setembro/2026 (até 13/09)</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; color: ${INK}; margin: 0; font-size: 10.2px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1,h2,h3 { font-family: Oswald, "Arial Narrow", Impact, sans-serif; text-transform: uppercase; letter-spacing: .022em; font-weight: 600; margin: 0; }
  .page { width: 210mm; height: 296mm; padding: 13mm 13mm 16mm; position: relative; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .pfoot { position: absolute; left: 13mm; right: 13mm; bottom: 7mm; font-size: 7.4px; color: #A6A6A6; display: flex; justify-content: space-between; border-top: 1px solid ${GRID}; padding-top: 2mm; }
  .capa { background: ${INK}; color: #fff; padding: 32mm 20mm 20mm; display: flex; flex-direction: column; }
  .capa img { width: 42mm; margin-bottom: 20mm; }
  .capa h1 { font-size: 36px; line-height: 1.05; color: #fff; font-weight: 700; }
  .capa h1 small { display: block; font-size: 17px; color: #B5B5B5; font-weight: 500; margin-top: 4mm; letter-spacing: .04em; }
  .capa .sub { font-size: 12.2px; color: #B5B5B5; margin-top: 8mm; max-width: 146mm; line-height: 1.62; }
  .capa .rule { width: 26mm; height: 3px; background: ${GOLD}; margin: 9mm 0; }
  .capa .big { font-family: Oswald, sans-serif; font-size: 34px; font-weight: 700; margin-top: 4mm; }
  .capa .big span { font-size: 13px; color: #B5B5B5; font-weight: 500; display: block; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 1mm; }
  .capa .meta { margin-top: auto; flex-wrap: wrap; row-gap: 6mm; display: flex; gap: 11mm; border-top: 1px solid #2A2A2A; padding-top: 6mm; }
  .capa .meta div span { display: block; font-size: 8.5px; color: #8A8A8A; text-transform: uppercase; letter-spacing: .09em; margin-bottom: 2px; }
  .capa .meta div strong { font-size: 12px; font-weight: 600; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid ${INK}; padding-bottom: 2.6mm; margin-bottom: 4.5mm; }
  .head h2 { font-size: 19.5px; }
  .head .n { font-size: 9px; color: ${MUTED}; letter-spacing: .12em; text-transform: uppercase; font-family: Oswald, sans-serif; white-space: nowrap; margin-left: 6mm; }
  h3 { font-size: 12.3px; margin: 5mm 0 2.2mm; }
  h3:first-of-type { margin-top: 0; }
  p { margin: 0 0 2.6mm; }
  .lead { font-size: 11px; line-height: 1.56; }
  strong { font-weight: 600; }
  .muted { color: ${MUTED}; }
  .small { font-size: 8.8px; color: ${MUTED}; line-height: 1.5; }
  .tiles { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin: 3.5mm 0 4.5mm; }
  .tile { border: 1px solid ${GRID}; border-top: 3px solid ${INK}; padding: 3.2mm 3.2mm 2.8mm; }
  .tile .k { font-size: 8px; text-transform: uppercase; letter-spacing: .085em; color: ${MUTED}; margin-bottom: 1.5mm; line-height: 1.3; min-height: 5.6mm; }
  .tile .v { font-family: Oswald, sans-serif; font-size: 19px; font-weight: 600; line-height: 1; }
  .tile .v .cur { font-size: 11px; font-weight: 500; color: ${MUTED}; margin-right: 1px; }
  .tile .d { font-size: 8.3px; color: ${MUTED}; margin-top: 1.5mm; line-height: 1.4; }
  .tile.gold { border-top-color: ${GOLD}; }
  .box { border: 1px solid ${GRID}; padding: 3.6mm 4.2mm; margin: 3.5mm 0; }
  .box.dark { background: ${INK}; color: #fff; border-color: ${INK}; }
  .box.dark .t { color: ${GOLD}; }
  .box.dark p, .box.dark li, .box.dark td { color: #D8D8D8; }
  .box.dark strong { color: #fff; }
  .box .t { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; margin-bottom: 2mm; font-weight: 600; }
  .box.alerta { border-left: 3px solid ${GOLD}; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; margin: 2mm 0; }
  table.lotes { table-layout: fixed; font-size: 8.5px; }
  table.lotes td { overflow: hidden; padding: 1.15mm 1.4mm; }
  th { text-align: left; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.1px; letter-spacing: .07em; font-weight: 600; border-bottom: 1.4px solid ${INK}; padding: 1.6mm 1.4mm; }
  td { padding: 1.4mm 1.4mm; border-bottom: 1px solid #F0F0F0; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.destaque td { background: #F6F6F6; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  ol, ul { margin: 0 0 2.6mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.3mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .kv { display: grid; grid-template-columns: 30mm 1fr; row-gap: .8mm; column-gap: 2.5mm; font-size: 8.8px; line-height: 1.42; margin-bottom: 3mm; }
  .kv span { color: #9A9A9A; text-transform: uppercase; letter-spacing: .06em; font-size: 7.8px; padding-top: .6mm; }
  .tag { display: inline-block; font-family: Oswald, sans-serif; font-size: 7.6px; letter-spacing: .08em; text-transform: uppercase; padding: .3mm 1.5mm; border: 1px solid ${INK}; }
  .tag.nao { border-color: #B5B5B5; color: ${MUTED}; }
  .bar { height: 5mm; background: #EFEFEF; position: relative; margin: 2mm 0 1.5mm; }
  .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: ${INK}; }
  .bar b { position: absolute; top: 0; bottom: 0; width: 2px; background: ${GOLD}; }
</style></head><body>

<!-- ══ CAPA ══ -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Fechamento de<br>vendas<small>Setembro de 2026 · leilões de 01 a 13/09<br>Jacamim · Flor do Arataú · Marcondes · Mafra · Nelore Visual · Nelore AZ · 7º Mega Premium EAO · Katayama</small></h1>
  <div class="rule"></div>
  <div class="sub">Todos os pregões do mês até aqui, lote a lote, lidos nos grupos de WhatsApp e no repasse do Marcelo, conferidos
  contra os resumos da própria equipe, o Mapa Geral da Magnos, o que o sistema capturou, o HastaPro e a planilha do chefe —
  com o que ainda falta para virar fechamento definitivo.</div>
  <div class="big"><span>Cobertura Bula de 01 a 13/09</span>R$ ${brl(T.vgv)}</div>
  <div class="meta">
    <div><span>Lotes · cabeças</span><strong>${T.lotes} · ${T.cabecas}</strong></div>
    <div><span>Pregões com venda</span><strong>${T.eventosComVenda} de ${D.eventos.length} realizados</strong></div>
    <div><span>Meta do mês</span><strong>R$ ${brl(M.valor)} · ${pct(M.pct, 1)} feito</strong></div>
    <div><span>Comissão da equipe</span><strong>R$ ${brl(T.comissao)}</strong></div>
    <div><span>No HastaPro</span><strong>nada de setembro</strong></div>
    <div><span>Emitido em</span><strong>${hoje}</strong></div>
  </div>
</section>

<!-- ══ 0. TABELA ÚNICA ══ -->
<section class="page">
  <div class="head"><h2>Setembro inteiro numa tabela — realizados e o que ainda vem</h2><div class="n">00 · Todos os leilões</div></div>
  <table class="lotes" style="font-size:8.6px"><colgroup><col style="width:11mm"><col style="width:60mm"><col style="width:20mm"><col style="width:15mm"><col style="width:9mm"><col style="width:21mm"><col style="width:18mm"><col style="width:9mm"><col style="width:21mm"></colgroup>
    <tr><th>Data</th><th>Leilão / evento</th><th>Leiloeira</th><th>Situação</th><th class="num">Lotes</th><th class="num">VGV Bula</th><th class="num">Meta (plan.)</th><th class="num">% meta</th><th>Quem vendeu</th></tr>
    ${D.tabelaUnica.map(t => `<tr${t.status === 'realizado' ? (t.vgv ? '' : ' class="destaque"') : ' style="color:#6E6E6E"'}><td>${dm(t.data)}</td><td style="white-space:nowrap"><strong>${esc(corta(nomeTabela(t.nome), 58))}</strong></td><td style="white-space:nowrap">${esc(corta(t.leiloeira.replace(/ \(.*$/, '').replace(/ \/ .*$/, ''), 20))}</td><td style="white-space:nowrap">${t.status === 'realizado' ? (t.vgv ? 'realizado' : 'sem venda') : esc(t.status.replace('não é cobertura', 'Remates'))}</td><td class="num">${t.lotes ?? '—'}</td><td class="num">${t.vgv ? '<strong>R$ ' + brl(t.vgv) + '</strong>' : (t.status === 'realizado' ? '0' : '—')}</td><td class="num">${t.metaVenda ? 'R$ ' + brl0(t.metaVenda) : '—'}</td><td class="num">${t.pctMeta != null ? pct(t.pctMeta, 0) : '—'}</td><td>${esc(t.assessores.replace(/ Bispo| Omena| Serafim| Carneiro/g, '').replace(/ pela Remates \(R\$ [\d.,]+\)/, ' (pela Remates)') || '—')}</td></tr>`).join('')}
    <tr class="total"><td colspan="4">Realizado até 13/09 (${T.eventosComVenda} pregões com venda)</td><td class="num">${T.lotes}</td><td class="num">R$ ${brl(T.vgv)}</td><td class="num">R$ ${brl0(D.eventos.reduce((s, e) => s + (e.metaVenda || 0), 0))}</td><td class="num">${pct(T.vgv / D.eventos.reduce((s, e) => s + (e.metaVenda || 0), 0), 0)}</td><td></td></tr>
    <tr class="total"><td colspan="4">A realizar (${D.restante.length} pregões, meta da planilha)</td><td class="num">—</td><td class="num">—</td><td class="num">R$ ${brl0(D.metaRestante)}</td><td class="num">—</td><td></td></tr>
    <tr class="total"><td colspan="4">Meta do mês (Marcelo, 03/09)</td><td class="num"></td><td class="num">R$ ${brl(M.valor)}</td><td class="num"></td><td class="num">${pct(M.pct, 1)}</td><td>feito até 13/09</td></tr>
  </table>
  <p class="small">Linhas cinza ainda não aconteceram — a meta é a coluna "META VENDA" da planilha FINANCEIRO BULA 2026 (7). "% meta" = VGV Bula ÷ meta de venda do pregão. Agrofeira IBC: ${esc(String(D.fora[0].detalhe.length))} registros do Fábio sem valor. Só Criador: Laila pela Remates (R$ ${brl0(D.hastapro.soCriador.laila.vgv)}), fora da cobertura. Shopping Naviraí (Marabá), LS Collection e Genética Camparino não estão na planilha. Detalhe lote a lote nas páginas seguintes e na aba "Lotes" do XLSX.</p>
  ${foot(2)}
</section>

<!-- ══ 1. PARECER ══ -->
<section class="page">
  <div class="head"><h2>O mês até 13/09: R$ ${brl0(T.vgv)} em ${T.lotes} lotes, ${pct(M.pct, 0)} da meta</h2><div class="n">01 · Parecer</div></div>
  <p class="lead">Setembro teve <strong>${D.eventos.length} pregões realizados</strong> com a Bula até o dia 13 e a equipe vendeu em <strong>${T.eventosComVenda}</strong> deles.
  O grande dia foi <strong>sábado 05/09</strong>: Jacamim (R$ ${brl0(JAC.totais.vgv)}, ${JAC.totais.lotes} lotes) e Flor do Arataú (R$ ${brl0(ARA.totais.vgv)}, ${ARA.totais.lotes} lotes, todos do Douglas) —
  mais o lote do Nelore Marcondes que ninguém contou. O fim de semana 12–13 somou R$ ${brl0(AZ.totais.vgv + EAO.totais.vgv + KAT.totais.vgv)} (AZ, EAO, Katayama).
  Cada número bate com o que a própria equipe postou; o que não bateu está escrito.</p>

  <div class="tiles">
    <div class="tile gold"><div class="k">Meta do mês (Marcelo, 03/09)</div><div class="v"><span class="cur">R$</span>${brl0(M.valor)}</div><div class="d">22 leilões · R$ 39 mi previstos · cobertura alvo 16,68%</div></div>
    <div class="tile"><div class="k">Realizado até 13/09</div><div class="v"><span class="cur">R$</span>${brl0(M.realizado)}</div><div class="d">${pct(M.pct, 1)} da meta · faltam R$ ${brl0(M.falta)}</div></div>
    <div class="tile"><div class="k">Meta de venda dos pregões que ainda vêm</div><div class="v"><span class="cur">R$</span>${brl0(D.metaRestante)}</div><div class="d">${D.restante.length} pregões de 14 a 28/09 na planilha</div></div>
    <div class="tile"><div class="k">Comissão da equipe (provisória)</div><div class="v"><span class="cur">R$</span>${brl(T.comissao)}</div><div class="d">Douglas ${brl0(ass('Douglas')?.comissao)} · Peralta ${brl0(ass('Peralta')?.comissao)} · Fábio ${brl0(ass('F.bio')?.comissao)} · Nane ${brl0(ass('Nane')?.comissao)}</div></div>
  </div>
  <div class="bar"><i style="width:${Math.min(100, M.pct * 100).toFixed(1)}%"></i><b style="left:${Math.min(100, (M.realizado + D.metaRestante) / M.valor * 100).toFixed(1)}%"></b></div>
  <p class="small">Barra: feito até 13/09 (${pct(M.pct, 1)}). A marca dourada é onde o mês chega se cada pregão restante bater exatamente a sua meta de venda da planilha (${pct((M.realizado + D.metaRestante) / M.valor, 0)}).</p>

  <table>
    <tr><th>Data</th><th>Pregão</th><th>Leiloeira</th><th class="num">Lotes</th><th class="num">VGV Bula</th><th class="num">Meta (planilha)</th><th class="num">% meta</th><th>Bate com a equipe</th><th>Sistema</th></tr>
    ${D.eventos.map(e => `<tr${e.lotes.length ? '' : ' class="destaque"'}><td>${dm(e.data)}</td><td>${esc(corta(e.nome, 46))}</td><td>${esc(corta(e.leiloeira, 22))}</td><td class="num">${e.totais.lotes}</td><td class="num">${e.totais.vgv ? 'R$ ' + brl(e.totais.vgv) : '—'}</td><td class="num">${e.metaVenda ? 'R$ ' + brl0(e.metaVenda) : '—'}</td><td class="num">${e.pctMeta != null ? pct(e.pctMeta, 0) : '—'}</td><td>${e.confere === null ? '<span class="muted">sem resumo</span>' : e.confere ? 'sim' : '<strong>NÃO</strong>'}</td><td>${e.key === 'mafra' ? 'fechamento OK' : e.lotes.length ? (e.key === 'aratau' || e.key === 'marcondes' || e.key === 'katayama' || e.key === 'visual' ? '<span class="tag nao">nada</span>' : '<span class="tag nao">fichas sem leilão</span>') : '—'}</td></tr>`).join('')}
    <tr class="total"><td colspan="3">Setembro até 13/09</td><td class="num">${T.lotes}</td><td class="num">R$ ${brl(T.vgv)}</td><td class="num">R$ ${brl0(D.eventos.reduce((s, e) => s + (e.metaVenda || 0), 0))}</td><td class="num">${pct(T.vgv / D.eventos.reduce((s, e) => s + (e.metaVenda || 0), 0), 0)}</td><td colspan="2">HastaPro: nada de setembro na FIL 2</td></tr>
  </table>

  <div class="box dark">
    <div class="t">O que NÃO está no número — e por quê</div>
    <ol style="margin:0">
      <li><strong>Agrofeira IBC (Fábio, 02–08/09):</strong> ${ibc.detalhe.length} registros de lote/comprador sem valor. É o único VGV do mês sem número. Pedir a lista ao Fábio.</li>
      <li><strong>lt 96 de 12/09 (Douglas, direcionamento do Rusa):</strong> leilão não identificado — R$ 21.000 fora de tudo.</li>
      <li><strong>lt 105 do EAO e lt 38 "de 14/09":</strong> falso positivo da IA e ficha repostada — os dois estão no sistema e precisam ser apagados (R$ 60.600 a mais se ficarem).</li>
      <li><strong>Só Criador 10/09 (Bula Remates):</strong> Laila na pista em 3 lotes (R$ ${brl0(D.hastapro.soCriador.laila.vgv)}) pela Remates — não é cobertura da Assessoria.</li>
      <li><strong>Crispim 03/09 (E-Rural):</strong> zero em todas as fontes ("leilão barato").</li>
    </ol>
  </div>
  ${foot(3)}
</section>

<!-- ══ 2. JACAMIM ══ -->
<section class="page">
  <div class="head"><h2>Sábado 05/09 · Jacamim — R$ ${brl0(JAC.totais.vgv)} em ${JAC.totais.lotes} lotes</h2><div class="n">02 · Jacamim</div></div>
  <div class="kv">
    ${kv('Pregão', esc(JAC.nome) + ' — ' + esc(JAC.leiloeira) + ', ' + esc(JAC.praca) + ' · 12h BSB')}
    ${kv('Condição', esc(JAC.condicao))}
    ${kv('Acordo', '<strong>' + esc(JAC.acordo) + '</strong> → receita estimada R$ ' + brl(JAC.receita.valor))}
    ${kv('Planilha do chefe', 'previsão de faturamento R$ ' + brl0(JAC.planilha?.previsaoFat) + ' · meta de venda R$ ' + brl(JAC.planilha?.metaVenda) + ' (25%) · meta de comissão R$ ' + brl(JAC.planilha?.metaComissao) + ' → <strong>' + pct(JAC.pctMeta, 1) + ' da meta</strong>')}
    ${kv('Resumo da equipe', esc(JAC.resumoEquipe.texto) + ' · <strong>bate: 22 touros + 1 central</strong>')}
  </div>
  <table class="lotes">${colsLotes}${cabLotes}
    ${JAC.lotes.map(l => linha(l)).join('')}
    ${total(JAC, 3)}
  </table>
  <p class="small">${porAss(JAC)}. Percentuais da folha: 2% (Laila 1%). O card de 05/09 22:03 dizia <strong>R$ 883.200 / 24 lotes</strong> porque contava o último touro da noite (1.600 × 30), perdido no "agradece"; o post oficial das 20:27 diz 22 + 1, e é esse o número.</p>
  <div class="cols2">
    <div class="box alerta" style="margin-top:1mm"><div class="t">Lote a lote: o que precisa de atenção</div><ul style="margin:0">${JAC.lotes.filter(l => ['25', '1'].includes(l.lote)).map(l => `<li><strong>lt ${esc(l.lote)}:</strong> ${esc(l.obs)}</li>`).join('')}</ul></div>
    <div class="box" style="margin-top:1mm"><div class="t">Disputou e não levou (não vira venda)</div><ul style="margin:0">${JAC.naoVendas.slice(1).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
  </div>
  ${foot(4)}
</section>

<!-- ══ 3. JACAMIM alertas + ARATAÚ ══ -->
<section class="page">
  <div class="head"><h2>Sábado 05/09 · Flor do Arataú — R$ ${brl0(ARA.totais.vgv)} em ${ARA.totais.lotes} lotes (Douglas)</h2><div class="n">03 · Flor do Arataú</div></div>
  <div class="kv">
    ${kv('Pregão', esc(ARA.nome) + ' — ' + esc(ARA.leiloeira) + ', ' + esc(ARA.praca) + ' · o Douglas estava no recinto (no Jacamim ele comprou por telefone, "sem ver o leilão")')}
    ${kv('Fonte', '<strong>Mapa Geral da Magnos</strong> (4 fotos na DM do Marcelo, 20:34) + a lista dos 25 lotes + áudio "olha os lotes aí que o Douglas vendeu". Remate: R$ ' + brl(ARA.faturamento) + ' em ' + ARA.faturamentoLotes + ' lotes / ' + ARA.faturamentoCabecas + ' cabeças, ' + ARA.defesas.lotes + ' defesas (R$ ' + brl0(ARA.defesas.valor) + ')')}
    ${kv('Acordo', '<strong>' + esc(ARA.acordo) + '</strong> → receita estimada R$ ' + brl(ARA.receita.valor) + ' · cobertura de <strong>' + pct(ARA.totais.vgv / ARA.faturamento, 1) + '</strong> do remate')}
    ${kv('Planilha do chefe', 'previsão R$ ' + brl0(ARA.planilha?.previsaoFat) + ' · meta de venda R$ ' + brl(ARA.planilha?.metaVenda) + ' (12%) → <strong>' + pct(ARA.pctMeta, 0) + ' da meta</strong>')}
  </div>
  <table class="lotes"><colgroup><col style="width:10mm"><col style="width:22mm"><col style="width:9mm"><col style="width:24mm"><col style="width:101mm"><col style="width:18mm"></colgroup>
    <tr><th>Lote</th><th>Categoria</th><th class="num">Cab.</th><th class="num">Valor (mapa)</th><th>Comprador (Mapa Geral da Magnos) — vendeu: Douglas Bispo</th><th class="num">2%</th></tr>
    ${ARA.lotes.map(l => linhaAra(l)).join('')}
    <tr class="total"><td colspan="2">${ARA.totais.lotes} lotes</td><td class="num">${ARA.totais.cabecas}</td><td class="num">R$ ${brl(ARA.totais.vgv)}</td><td></td><td class="num">R$ ${brl(ARA.totais.comissao)}</td></tr>
  </table>
  <p class="small">11 touros + 14 matrizes (lotes 15, 16 e 17 têm 2 cabeças). Parcela = valor ÷ 30 só para leitura; o mapa traz o valor total. Gessival Buss levou 4 lotes (R$ ${brl0(ARA.lotes.filter(l => /Buss/.test(l.comprador)).reduce((s, l) => s + l.vgv, 0))}) — é a mesma família Buss que comprou as 4 fêmeas do Katayama em 13/09.</p>
  <div class="box alerta" style="margin-bottom:0">
    <div class="t">Os dois lotes que precisam de decisão</div>
    <ul style="margin:0">
      <li><strong>Arataú lt 46 (R$ 60.000):</strong> ${esc(ARA.lotes.find(l => l.lote === '46').obs)}</li>
      <li><strong>Jacamim lt 1 (R$ 64.500):</strong> ${esc(JAC.lotes.find(l => l.lote === '1').obs)}</li>
    </ul>
  </div>
  ${foot(5)}
</section>

<!-- ══ 4. MARCONDES · MAFRA · VISUAL · CRISPIM · IBC ══ -->
<section class="page">
  <div class="head"><h2>Os pregões pequenos e o que ficou sem número</h2><div class="n">04 · Marcondes · Mafra · Visual · Crispim · IBC</div></div>
  <div class="cols2">
    <div>
      <h3>05/09 · Leilão Caminhos — Nelore Marcondes</h3>
      <table class="lotes"><colgroup><col style="width:9mm"><col style="width:12mm"><col style="width:7mm"><col style="width:19mm"><col style="width:14mm"><col style="width:30mm"></colgroup>
        <tr><th>Lote</th><th class="num">Parcela</th><th class="num">×</th><th class="num">VGV</th><th>Vendeu</th><th>Comprador</th></tr>
        ${MAR.lotes.map(l => `<tr><td><strong>${esc(l.lote)}</strong> <span class="muted">1F</span></td><td class="num">${brl(l.parcela)}</td><td class="num">30×</td><td class="num"><strong>R$ ${brl(l.vgv)}</strong></td><td>Douglas</td><td>${esc(l.comprador)}<br><span class="muted">${esc(l.fazenda)} · ${esc(praca(l))}</span></td></tr>`).join('')}
      </table>
      <p class="small">${esc(MAR.lotes[0].obs)} Leiloeira e acordo a confirmar; ficha encaminhada pelo Marcelo às 21:32 com a arte "Leilão Caminhos — 05/09, 13h30".</p>

      <h3>06/09 · Touros Premium Nelore Mafra — Uberaba</h3>
      <table class="lotes"><colgroup><col style="width:9mm"><col style="width:12mm"><col style="width:7mm"><col style="width:19mm"><col style="width:14mm"><col style="width:30mm"></colgroup>
        <tr><th>Lote</th><th class="num">Parcela</th><th class="num">×</th><th class="num">VGV</th><th>Vendeu</th><th>Comprador</th></tr>
        ${MAF.lotes.map(l => `<tr><td><strong>${esc(l.lote)}</strong></td><td class="num">${brl(l.parcela)}</td><td class="num">30×</td><td class="num"><strong>R$ ${brl(l.vgv)}</strong></td><td>Fábio</td><td>${esc(l.comprador)}<br><span class="muted">${esc(l.fazenda)} · ${esc(praca(l))}</span></td></tr>`).join('')}
      </table>
      <p class="small">Único fechamento de setembro que o ERP já tem certo. Meta de venda da planilha: R$ ${brl(MAF.planilha?.metaVenda)} (10%) → ${pct(MAF.pctMeta, 1)}. ${esc(MAF.naoVendas[0])} Tabela Mafra: cobertura abaixo de 3% → 4% da venda (R$ ${brl(MAF.receita.valor)}).</p>

      <h3>02–12/09 · Shopping Nelore Visual (venda direta)</h3>
      <table class="lotes"><colgroup><col style="width:14mm"><col style="width:12mm"><col style="width:7mm"><col style="width:19mm"><col style="width:16mm"><col style="width:23mm"></colgroup>
        <tr><th>Animal</th><th class="num">Parcela</th><th class="num">×</th><th class="num">Valor</th><th>Vendeu</th><th>Comprador</th></tr>
        ${VIS.lotes.map(l => `<tr><td><strong>${esc(l.lote)}</strong></td><td class="num">${brl(l.parcela)}</td><td class="num">12×</td><td class="num"><strong>R$ ${brl(l.vgv)}</strong></td><td>Marcelo C.</td><td>${esc(l.comprador)}<br><span class="muted">${esc(praca(l))}</span></td></tr>`).join('')}
      </table>
      <p class="small">${esc(VIS.lotes[0].obs)} Na planilha o Shopping está em 17/09 com 5% da venda (R$ ${brl(VIS.receita.valor)}) e meta de R$ ${brl0(VIS.planilha?.metaVenda)}.</p>

      <h3>03/09 · 2º Nelore Crispim — Herança Genética (E-Rural)</h3>
      <p class="small" style="margin:0">Nenhuma ficha em nenhum grupo, nenhum resumo. Meta de venda da planilha R$ ${brl0(CRI.planilha?.metaVenda)} (40%). Igual a agosto: zero em todas as fontes.</p>
    </div>
    <div>
      <div class="box alerta" style="margin-top:0">
        <div class="t">Agrofeira IBC — vendas do Fábio sem valor</div>
        <p>${esc(ibc.porque)}</p>
        <table style="margin:0; font-size:8.3px">
          ${ibc.detalhe.map(m => `<tr><td style="white-space:nowrap">${esc(m.quando)}</td><td>${esc(corta(m.texto.replace(/ · AGROFEIRA IBC/i, ''), 78))}</td></tr>`).join('')}
        </table>
      </div>
      <div class="box" style="margin-top:0">
        <div class="t">Bula Remates no mês (não é cobertura)</div>
        <p style="margin:0"><strong>Só Criador Machos e Fêmeas de Alto Padrão — 10/09</strong>, gado comercial: R$ ${brl(D.hastapro.soCriador.vgv)} em ${D.hastapro.soCriador.lotes} lotes no HastaPro FIL 01.
        Laila na pista nos lotes ${D.hastapro.soCriador.laila.lotes.join(', ')} (R$ ${brl(D.hastapro.soCriador.laila.vgv)}) <strong>pela Remates</strong> — pela decisão de 26/08, quem está na pista pela Remates não entra na cobertura da Assessoria. É o único pregão de setembro que já existe no HastaPro.</p>
      </div>
    </div>
  </div>
  ${foot(6)}
</section>

<!-- ══ 5. FIM DE SEMANA 12–13 ══ -->
<section class="page">
  <div class="head"><h2>12 e 13/09 · AZ, EAO e Katayama — R$ ${brl0(AZ.totais.vgv + EAO.totais.vgv + KAT.totais.vgv)} em ${AZ.totais.lotes + EAO.totais.lotes + KAT.totais.lotes} lotes</h2><div class="n">05 · Fim de semana</div></div>
  <p class="small" style="margin-bottom:2mm">Resumo da conferência entregue em 14/09 ("Conferência dos lançamentos — 11 a 13/09"); o detalhe lote a lote, os não-arremates e as provas estão lá. Os três totais batem com o resumo que a equipe postou no Financeiro às 22h de domingo.</p>
  ${[AZ, EAO, KAT].map(ev => `
  <h3>${dm(ev.data)} · ${esc(ev.nome)} — R$ ${brl0(ev.totais.vgv)} <span class="muted" style="font-family:Inter;text-transform:none;letter-spacing:0;font-weight:400;font-size:9px">· ${esc(ev.leiloeira)} · ${esc(ev.acordo)}${ev.metaVenda ? ' · meta R$ ' + brl0(ev.metaVenda) + ' → ' + pct(ev.pctMeta, 0) : ''}</span></h3>
  <table class="lotes">${colsLotes}${cabLotes}
    ${ev.lotes.map(l => linha(l)).join('')}
    ${total(ev, 3)}
  </table>`).join('')}
  <p class="small">${esc(KAT.atribuicaoNota)}</p>
  ${foot(7)}
</section>

<!-- ══ 6. POR ASSESSOR + META ══ -->
<section class="page">
  <div class="head"><h2>Por assessor e o que falta para a meta</h2><div class="n">06 · Assessores · Meta</div></div>
  <table>
    <tr><th>Assessor</th><th class="num">%</th><th class="num">Lotes</th><th class="num">Cab.</th><th class="num">VGV</th>${D.eventos.filter(e => e.lotes.length).map(e => `<th class="num">${esc(e.key === 'aratau' ? 'Arataú' : e.key === 'jacamim' ? 'Jacamim' : e.key === 'marcondes' ? 'Marcond.' : e.key === 'katayama' ? 'Katayama' : e.key.toUpperCase())}</th>`).join('')}<th class="num">Comissão</th></tr>
    ${D.porAssessor.map(a => `<tr><td style="white-space:nowrap">${esc(a.nome)}</td><td class="num">${pct(a.pct)}</td><td class="num">${a.lotes}</td><td class="num">${a.cabecas}</td><td class="num"><strong>R$ ${brl0(a.vgv)}</strong></td>${D.eventos.filter(e => e.lotes.length).map(e => `<td class="num">${a.eventos[e.key] ? brl0(a.eventos[e.key].vgv) : '—'}</td>`).join('')}<td class="num"><strong>R$ ${brl(a.comissao)}</strong></td></tr>`).join('')}
    <tr class="total"><td colspan="2">Equipe</td><td class="num">${T.lotes}</td><td class="num">${T.cabecas}</td><td class="num">R$ ${brl0(T.vgv)}</td>${D.eventos.filter(e => e.lotes.length).map(e => `<td class="num">${brl0(e.totais.vgv)}</td>`).join('')}<td class="num">R$ ${brl(T.comissao)}</td></tr>
  </table>
  <p class="small">Percentuais da folha: 2% para todos, Laila 1%. Nane acumula para 28/12. Peralta e Marcelo Carneiro estão inativos na folha (2%) — os títulos deles são decisão. Douglas tem ${brl0(KAT.totais.vgv)} do Katayama por correlação. Nenhum comprador do mês está na lista de direcionamento do Rusa, exceto o lt 96 (fora) e o vendedor do lt 46 do Arataú. <strong>Não gerar CP antes das listagens oficiais.</strong></p>

  <div class="cols2">
    <div class="box" style="margin-top:2mm">
      <div class="t">A meta de setembro</div>
      <table style="margin:0">
        <tr><td>Meta de vendas do mês (Marcelo, 03/09)</td><td class="num"><strong>R$ ${brl(M.valor)}</strong></td></tr>
        <tr><td>Realizado até 13/09 (${T.eventosComVenda} pregões)</td><td class="num">R$ ${brl(M.realizado)} · ${pct(M.pct, 1)}</td></tr>
        <tr><td>Falta</td><td class="num">R$ ${brl(M.falta)}</td></tr>
        <tr><td>Meta de venda somada dos ${D.restante.length} pregões restantes (planilha)</td><td class="num">R$ ${brl(D.metaRestante)}</td></tr>
        <tr class="total"><td>Se todos baterem a meta, o mês fecha em</td><td class="num">R$ ${brl(r2(M.realizado + D.metaRestante))} · ${pct((M.realizado + D.metaRestante) / M.valor, 0)}</td></tr>
      </table>
      <p class="small" style="margin:2mm 0 0">Os 8 pregões realizados tinham meta somada de R$ ${brl0(D.eventos.reduce((s, e) => s + (e.metaVenda || 0), 0))} e entregaram ${pct(T.vgv / D.eventos.reduce((s, e) => s + (e.metaVenda || 0), 0), 0)} — o Arataú (${pct(ARA.pctMeta, 0)}) e o Jacamim (${pct(JAC.pctMeta, 0)}) carregaram; AZ ${pct(AZ.pctMeta, 0)}, EAO touros ${pct(EAO.lotes.filter(l => l.sexo === 'M').reduce((s, l) => s + l.vgv, 0) / (EAO.metaVenda || 1), 0)}, Mafra ${pct(MAF.pctMeta, 0)}, Crispim 0%.</p>
    </div>
    <div class="box" style="margin-top:2mm">
      <div class="t">O que ainda vem (14 a 28/09)</div>
      <table style="margin:0; font-size:8.5px">
        <tr><th>Data</th><th>Pregão</th><th class="num">Meta venda</th></tr>
        ${D.restante.map(r => `<tr><td>${dm(r.data)}</td><td>${esc(corta(r.nome, 40))}</td><td class="num">${r.metaVenda ? 'R$ ' + brl0(r.metaVenda) : '—'}</td></tr>`).join('')}
      </table>
    </div>
  </div>
  ${foot(8)}
</section>

<!-- ══ 7. CORREÇÕES + PENDÊNCIAS ══ -->
<section class="page">
  <div class="head"><h2>O que falta para virar fechamento definitivo</h2><div class="n">07 · Correções · Pendências</div></div>
  <div class="cols2">
    <div class="box" style="margin-top:0">
      <div class="t">No sistema (nada foi alterado ainda)</div>
      <ol style="margin:0">${D.correcoes.map(c => `<li><strong>${esc(c.o)}</strong> <span class="muted">${esc(corta(c.por, 170))}</span></li>`).join('')}</ol>
      <p class="small" style="margin:2mm 0 0">Hoje o ERP tem ${D.sistema.fechamentos.length} fechamentos em setembro (${D.sistema.fechamentos.map(f => `${esc(corta(f.nome, 28))} ${dm(f.data)} · R$ ${brl0(f.vgv_total)}`).join(' · ')}) e ${D.sistema.vendasCapturadas} fichas capturadas, ${D.sistema.semVinculo} sem leilão vinculado.</p>
    </div>
    <div class="box" style="margin-top:0">
      <div class="t">Pendências — quem responde o quê</div>
      <table style="margin:0; font-size:8.4px">
        ${D.pendencias.map(p => `<tr><td>${esc(p.p)}<br><span class="muted">${esc(p.impacto)}</span></td><td style="white-space:nowrap">${esc(p.quem)}</td></tr>`).join('')}
      </table>
    </div>
  </div>
  <div class="box dark" style="margin-top:1mm">
    <div class="t">Resumo para o chefe</div>
    <p style="margin:0">Setembro até 13/09: <strong>R$ ${brl(T.vgv)} em ${T.lotes} lotes</strong> (${T.cabecas} cabeças) em ${T.eventosComVenda} pregões — Jacamim ${brl0(JAC.totais.vgv)}, Flor do Arataú ${brl0(ARA.totais.vgv)}, EAO ${brl0(EAO.totais.vgv)}, AZ ${brl0(AZ.totais.vgv)}, Katayama ${brl0(KAT.totais.vgv)}, Mafra ${brl0(MAF.totais.vgv)}, Marcondes ${brl0(MAR.totais.vgv)}, Shopping Visual ${brl0(VIS.totais.vgv)} — <strong>${pct(M.pct, 1)} da meta de R$ ${brl0(M.valor)}</strong>, com R$ ${brl(T.comissao)} de comissão provisória.
    Douglas fez R$ ${brl0(ass('Douglas')?.vgv)} (${pct(ass('Douglas').vgv / T.vgv, 0)} do mês). Fora do número: o IBC do Fábio (sem valores) e o lt 96 do Douglas (sem leilão).
    Nada disto está no HastaPro ainda; no ERP só o Mafra está certo. Os dois lotes que exigem decisão sua: o lt 46 do Arataú (condomínio do Douglas, vendedor da lista do Rusa) e o lt 1 do Jacamim ("Daniele Coutinho vendeu").</p>
  </div>
  ${foot(9)}
</section>
</body></html>`

fs.writeFileSync(path.join(OUT, 'relatorio.html'), html)
const DESK = path.join(os.homedir(), 'Desktop', 'Fechamento setembro 2026 (ate 13-09)')
fs.mkdirSync(DESK, { recursive: true })
const destino = path.join(DESK, 'Bula - Fechamento Leiloes Setembro 2026 (ate 13-09).pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
const overflow = await page.evaluate(() => [...document.querySelectorAll('.page')].map((p, i) => ({ pagina: i + 1, sobra: p.scrollHeight - p.clientHeight })))
for (const o of overflow) if (o.sobra > 0) console.warn(`⚠ página ${o.pagina} transborda ${o.sobra}px`)
if (overflow.every(o => o.sobra <= 0)) console.log('paginas OK (sem transbordo)')
await page.pdf({ path: destino, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
await browser.close()
const pdf = await PDFDocument.load(fs.readFileSync(destino))
console.log('paginas no PDF:', pdf.getPageCount(), '(esperado', (html.match(/<section class="page/g) || []).length + ')')
fs.copyFileSync(destino, path.join(OUT, 'Fechamento-Setembro-2026-ate-13-09.pdf'))
console.log('PDF →', destino)
