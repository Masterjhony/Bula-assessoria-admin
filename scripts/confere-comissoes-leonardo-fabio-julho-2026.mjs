// Conferência das comissões de julho/2026 de Leonardo Serafim e Fábio Omena Gaia
// (pagamento previsto 25/08/2026) contra QUATRO fontes cruzadas lote a lote:
//   1. as planilhas dos próprios assessores
//   2. HastaPro (LOT_PISTEIRO / LOT_TOTAL, FIL 2 e FIL 01)
//   3. os fechamentos do ERP (por_assessor[] e lances[])
//   4. os títulos de contas a pagar já abertos para hoje
// O lote 39 da 2ª etapa Naviraí ainda foi conferido no PDF de fechamento da própria
// leiloeira, que desempata HastaPro × ERP.
//
// Uso: node scripts/confere-comissoes-leonardo-fabio-julho-2026.mjs
import { join } from 'node:path'
import { homedir } from 'node:os'
import fs from 'node:fs'
import { chromium } from 'playwright'

const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = (n) => Math.round(Number(n)).toLocaleString('pt-BR')
const PCT = 0.02

// ── LEONARDO ─────────────────────────────────────────────────────────────────
// pl = planilha dele · hp = HastaPro (LOT_TOTAL) · erp = fechamento do ERP
const LEO = [
  { d: '05/07', ev: 'Naviraí Matrizes',        lo: '91', an: 1, cp: 'Romualdo H. Tavares de Miranda', pl: 58500, hp: 58500, erp: 58500, g: 'ok' },
  { d: '07/07', ev: 'Kriz Reprodutores',       lo: '19', an: 1, cp: 'Angela Cardoso Batista',         pl: 19500, hp: 19500, erp: null,  g: 'semfech' },
  { d: '07/07', ev: 'Kriz Reprodutores',       lo: '20', an: 1, cp: 'Angela Cardoso Batista',         pl: 18000, hp: 18000, erp: null,  g: 'semfech' },
  { d: '11/07', ev: 'EAO Baviera Fêmeas',      lo: '26', an: 1, cp: 'Romualdo H. Tavares de Miranda', pl: 49500, hp: 49500, erp: null,  g: 'troca' },
  { d: '11/07', ev: 'EAO Baviera Fêmeas',      lo: '30', an: 1, cp: 'Romualdo H. Tavares de Miranda', pl: 46500, hp: 46500, erp: null,  g: 'troca' },
  { d: '16/07', ev: 'Naviraí 2ª etapa',        lo: '25', an: 1, cp: 'Felipe Buainain Balbuena',       pl: 30600, hp: 30600, erp: 30600, g: 'ok' },
  { d: '18/07', ev: 'Guadalupe Fêmeas',        lo: '20', an: 1, cp: 'Romualdo H. Tavares de Miranda', pl: 40500, hp: 40500, erp: 40500, g: 'ok' },
  // no ERP no nome dele, mas de outra pessoa no HastaPro
  { d: '11/07', ev: 'EAO Baviera Fêmeas',      lo: '19',  an: 1, cp: 'Luiz Carlos Freitas (Tresmar)',  pl: null, hp: null, erp: 60000, g: 'dofabio' },
  { d: '14/07', ev: 'Santa Cruz 1ª etapa',     lo: '116', an: 1, cp: 'Francisca Valéria (Água Limpa)', pl: null, hp: null, erp: 25500, g: 'dodouglas' },
  { d: '26/07', ev: 'Genética Aditiva 2ª et.', lo: '15, 56, 71, 81', an: 4, cp: 'Santini Basso · Thiago Passos', pl: null, hp: null, erp: 99900, g: 'davaleria' },
  { d: '26/07', ev: 'Genética Aditiva 2ª et.', lo: '11, 88, 92',     an: 3, cp: 'Izanelio Rezende Jr · Jahir Schulter', pl: null, hp: null, erp: 73500, g: 'daregiane' },
  { d: '26/07', ev: 'Genética Aditiva 2ª et.', lo: '29',  an: 1, cp: 'Celso Camargo',                  pl: null, hp: null, erp: 30000, g: 'dofabio' },
]

// ── FÁBIO OMENA ──────────────────────────────────────────────────────────────
const FAB = [
  { d: '05/07', ev: 'Naviraí Matrizes',        lo: '20',  an: 1, cp: 'Joerson Ferronato',             pl: 24000, hp: 24000, erp: 24000, g: 'ok' },
  { d: '11/07', ev: 'EAO Baviera Fêmeas',      lo: '19',  an: 1, cp: 'Luiz Carlos Freitas (Tresmar)', pl: 60000, hp: 60000, erp: null,  g: 'troca' },
  { d: '11/07', ev: 'EAO Baviera Fêmeas',      lo: 'M04', an: 3, cp: 'Jaime Rodrigues (Nelore JR)',   pl: null,  hp: 86400, erp: 86400, g: 'faltapl' },
  { d: '12/07', ev: 'EAO Baviera Machos',      lo: '417', an: 1, cp: 'Nael',                          pl: 22500, hp: 22500, erp: 22500, g: 'ok' },
  { d: '12/07', ev: 'EAO Baviera Machos',      lo: '456', an: 1, cp: 'Paulo de Moraes',               pl: 21000, hp: 21000, erp: 21000, g: 'ok' },
  { d: '14/07', ev: 'Santa Cruz 1ª etapa',     lo: '144', an: 1, cp: 'João Batista G. dos Santos',    pl: 21000, hp: 23100, erp: 23100, g: 'lance' },
  { d: '14/07', ev: 'Santa Cruz 1ª etapa',     lo: '32',  an: 2, cp: 'João Batista G. dos Santos',    pl: 24000, hp: 48000, erp: 48000, g: 'qtd' },
  { d: '14/07', ev: 'Santa Cruz 1ª etapa',     lo: '35',  an: 1, cp: 'João Batista G. dos Santos',    pl: 27000, hp: 27000, erp: 27000, g: 'ok' },
  { d: '16/07', ev: 'Naviraí 2ª etapa',        lo: '39',  an: 1, cp: 'Sr. Jefte (Cotegipe/BA)',       pl: 43200, hp: 21600, erp: 43200, g: 'dobra' },
  { d: '19/07', ev: 'Santa Cruz 3ª etapa',     lo: '45',  an: 2, cp: 'Lúcio Barros Lima',             pl: 49200, hp: 49200, erp: null,  g: 'adefinir' },
  { d: '19/07', ev: 'Santa Cruz 3ª etapa',     lo: '46',  an: 2, cp: 'Lúcio Barros Lima',             pl: 49200, hp: 49200, erp: null,  g: 'adefinir' },
  { d: '19/07', ev: 'Santa Cruz 3ª etapa',     lo: '47',  an: 2, cp: 'Lúcio Barros Lima',             pl: 49200, hp: 49200, erp: null,  g: 'adefinir' },
  { d: '19/07', ev: 'Guadalupe Touros',        lo: '25',  an: 1, cp: 'Reinaldo Tavares (N. S. Fátima)', pl: 21000, hp: null, erp: 21000, g: 'semhasta' },
  { d: '26/07', ev: 'Genética Aditiva 2ª et.', lo: '29',  an: 1, cp: 'Celso Camargo',                 pl: 30000, hp: 30000, erp: null,  g: 'troca' },
  { d: '26/07', ev: 'Genética Aditiva 2ª et.', lo: '42',  an: 1, cp: 'Gabriel Peruchi',               pl: null,  hp: 32100, erp: 32100, g: 'faltapl' },
]

// devido: o lote é do assessor salvo quando o HastaPro aponta outro pisteiro.
const ALHEIO = new Set(['dofabio', 'dodouglas', 'davaleria', 'daregiane'])
const devidoVgv = (r) => ALHEIO.has(r.g) ? 0 : (r.hp ?? r.erp ?? r.pl ?? 0)
const soma = (L, k, f = () => true) => L.filter(f).reduce((s, r) => s + (r[k] || 0), 0)
const somaDev = (L) => L.reduce((s, r) => s + devidoVgv(r), 0)

const LEO_PL = soma(LEO, 'pl'), LEO_DEV = somaDev(LEO)
const FAB_PL = soma(FAB, 'pl'), FAB_DEV = somaDev(FAB), FAB_HP = soma(FAB, 'hp')

// títulos de contas a pagar já abertos para 25/08/2026 (lidos do ERP)
const CP_LEO = [
  ['Naviraí Matrizes – 05/07',              1170, 'ok'],
  ['Santa Cruz 1ª etapa – 14/07',            510, 'cancelar'],
  ['EAO Baviera — Fêmeas – 11/07',          1200, 'subir'],
  ['Genética Aditiva 2ª etapa – 26/07',     4068, 'cancelar'],
  ['Guadalupe Agropecuária Fêmeas – 18/07',  810, 'ok'],
  ['2ª etapa Naviraí Matrizes – 16/07',      612, 'ok'],
]
const CP_FAB = [
  ['Naviraí Matrizes – 05/07',               480, 'ok'],
  ['EAO Baviera — Fêmeas – 11/07',          3648, 'baixar'],
  ['EAO Baviera — Machos – 12/07',           870, 'ok'],
  ['Santa Cruz 1ª etapa – 14/07',           1962, 'ok'],
  ['2ª etapa Naviraí Matrizes – 16/07',      864, 'baixar'],
  ['Guadalupe Agropecuária Touros – 19/07',  420, 'ok'],
  ['Genética Aditiva 2ª etapa – 26/07',      642, 'subir'],
]
const CP_LEO_TOT = CP_LEO.reduce((s, c) => s + c[1], 0)
const CP_FAB_TOT = CP_FAB.reduce((s, c) => s + c[1], 0)

const ck = (nome, a, b) => { if (Math.abs(a - b) > 0.005) throw new Error(`TRAVA ${nome}: ${a} != ${b}`) }
ck('planilha Leonardo',  LEO_PL * PCT, 5262)
ck('devido Leonardo',    LEO_DEV * PCT, 5262)
ck('CP aberto Leonardo', CP_LEO_TOT, 8370)
ck('planilha Fábio',     FAB_PL * PCT, 8826)
ck('HastaPro Fábio',     FAB_HP, 543300)
ck('devido Fábio',       FAB_DEV * PCT, 11286)
ck('CP aberto Fábio',    CP_FAB_TOT, 8886)

const PONTE_LEO = [
  ['Planilha do Leonardo', LEO_PL * PCT, '', '7 lotes · VGV 263.100 × 2% — bate lote a lote com o HastaPro, sem uma diferença'],
  ['= Devido ao Leonardo por julho/2026', LEO_DEV * PCT, 'total', 'os mesmos 7 lotes, o mesmo VGV, o mesmo valor'],
]
const PONTE_FAB = [
  ['Planilha do Fábio', FAB_PL * PCT, '', '11 linhas · VGV 441.300 × 2% — a aritmética das linhas dele está certa'],
  ['+ Lote M04 · EAO Baviera Fêmeas 11/07', 86400 * PCT, 'mais', '3 animais, R$ 86.400 para o Jaime Rodrigues (Nelore JR/BA). Está no HastaPro no nome dele e no fechamento do ERP — só não entrou na planilha'],
  ['+ Lote 42 · Genética Aditiva 26/07', 32100 * PCT, 'mais', 'R$ 32.100 do Gabriel Peruchi (ES). Também está nas duas fontes e já tem título aberto — a planilha lista só o lote 29'],
  ['+ Lote 32 · Santa Cruz 1ª etapa 14/07', 24000 * PCT, 'mais', 'ele lançou 1 animal; o lote tem 2 (R$ 800 × 30 × 2 = 48.000)'],
  ['+ Lote 144 · Santa Cruz 1ª etapa 14/07', 2100 * PCT, 'mais', 'ele lançou lance de 700; o registrado é 770 → 23.100'],
  ['− Lote 39 · 2ª etapa Naviraí 16/07', -21600 * PCT, 'menos', 'ele lançou 2 animais; o fechamento assinado da leiloeira e o HastaPro dizem 1 animal → 21.600'],
  ['= Devido ao Fábio por julho/2026', FAB_DEV * PCT, 'total', 'VGV 564.300 × 2% · 15 lotes — 2.460,00 a mais do que ele pediu'],
]

const TAG = {
  ok:        ['confere', ''],
  semfech:   ['sem fechamento', 'alert'],
  troca:     ['ERP trocou', 'alert'],
  dofabio:   ['é do Fábio', 'alert'],
  dodouglas: ['é do Douglas', 'alert'],
  davaleria: ['é da Valéria', 'alert'],
  daregiane: ['é da Regiane', 'alert'],
  faltapl:   ['faltou na planilha', 'warn'],
  lance:     ['lance a menor', 'warn'],
  qtd:       ['2 animais', 'warn'],
  dobra:     ['ERP dobrou', 'alert'],
  adefinir:  ['ERP: "a definir"', 'alert'],
  semhasta:  ['fora do HastaPro', 'warn'],
}
const tag = (g) => `<span class="tag ${TAG[g][1]}">${TAG[g][0]}</span>`
const cel = (v) => v == null ? '<span class="nil">—</span>' : brl0(v)
const linhas = (L) => L.map((r) => `<tr class="${r.g === 'ok' ? '' : 'x'}">
  <td>${r.d}</td><td>${r.ev}</td><td class="lo">${r.lo}</td><td class="val">${r.an}</td>
  <td class="cp">${r.cp}</td>
  <td class="val ${r.pl == null ? '' : 'b'}">${cel(r.pl)}</td>
  <td class="val">${cel(r.hp)}</td>
  <td class="val">${cel(r.erp)}</td>
  <td class="val b">${devidoVgv(r) ? brl0(devidoVgv(r)) : '<span class="nil">—</span>'}</td>
  <td>${tag(r.g)}</td></tr>`).join('')
const rodape = (L) => `<tfoot><tr>
  <td colspan="5">VGV · ${L.length} lotes</td>
  <td class="val">${brl0(soma(L, 'pl'))}</td><td class="val">${brl0(soma(L, 'hp'))}</td><td class="val">${brl0(soma(L, 'erp'))}</td><td class="val">${brl0(somaDev(L))}</td><td></td></tr>
<tr><td colspan="5">Comissão a 2%</td>
  <td class="val">${brl(soma(L, 'pl') * PCT)}</td><td class="val">${brl(soma(L, 'hp') * PCT)}</td><td class="val">${brl(soma(L, 'erp') * PCT)}</td><td class="val">${brl(somaDev(L) * PCT)}</td><td></td></tr></tfoot>`
const cabeca = `<thead><tr>
  <th style="width:5%">Data</th><th style="width:16%">Leilão</th><th style="width:7%">Lote</th><th class="val" style="width:3.5%">An.</th>
  <th style="width:20%">Comprador</th>
  <th class="val" style="width:8.5%">Planilha</th><th class="val" style="width:8.5%">HastaPro</th><th class="val" style="width:8.5%">ERP</th>
  <th class="val" style="width:8.5%">Devido</th><th style="width:11%">Situação</th></tr></thead>`
const ponteHtml = (P) => `<table class="ponte"><tbody>${P.map(([l, v, t, e]) => `<tr class="${t === 'total' ? 'total' : ''}">
  <td class="lbl" style="width:29%">${l}</td><td class="val" style="width:11%">${brl(v)}</td><td class="exp">${e}</td></tr>`).join('')}</tbody></table>`
const ACAO = { ok: ['manter', ''], cancelar: ['cancelar', 'alert'], subir: ['aumentar', 'warn'], baixar: ['reduzir', 'warn'] }
const cpHtml = (CP, extra) => `<table><thead><tr><th style="width:34%">Título aberto para 25/08/2026</th><th class="val" style="width:11%">Hoje</th><th class="val" style="width:11%">Correto</th><th style="width:9%">Ação</th><th>Por quê</th></tr></thead><tbody>
${CP.map(([l, v, a]) => `<tr class="${a === 'ok' ? '' : 'x'}"><td>${l}</td><td class="val b">${brl(v)}</td><td class="val">${extra[l] ? brl(extra[l][0]) : brl(v)}</td><td><span class="tag ${ACAO[a][1]}">${ACAO[a][0]}</span></td><td class="exp">${extra[l] ? extra[l][1] : 'confere com o HastaPro'}</td></tr>`).join('')}
</tbody></table>`

const EX_LEO = {
  'Santa Cruz 1ª etapa – 14/07': [0, 'lote 116 (Francisca Valéria, R$ 25.500) — no HastaPro o pisteiro é o <strong>Douglas Bispo</strong>, e foi assim que a comissão dele de julho foi fechada. O Leonardo não pede este lote'],
  'EAO Baviera — Fêmeas – 11/07': [1920, 'o ERP deu ao Leonardo o lote 19 (do Fábio) e ao Fábio os lotes 26 e 30 (do Leonardo). Os dois estão trocados; as duas planilhas concordam com o HastaPro'],
  'Genética Aditiva 2ª etapa – 26/07': [0, '8 lotes lançados no nome dele. No HastaPro nenhum é: 4 são da <strong>Valéria Borges</strong> (99.900), 3 da <strong>Regiane Abreu</strong> (73.500) e o lote 29 é do <strong>Fábio</strong> (30.000). Ele também não pede nada aqui'],
}
const EX_FAB = {
  'EAO Baviera — Fêmeas – 11/07': [2928, 'os lotes 26 e 30 (96.000) são do Leonardo; os do Fábio são o 19 e o M04 (146.400)'],
  '2ª etapa Naviraí Matrizes – 16/07': [432, 'lote 39 lançado com 2 animais. O PDF de fechamento da leiloeira e o HastaPro registram <strong>1 animal</strong>, R$ 21.600'],
  'Genética Aditiva 2ª etapa – 26/07': [1242, 'só o lote 42 entrou. O lote 29 (Celso Camargo, R$ 30.000) está no HastaPro no nome dele e foi lançado no Leonardo'],
}

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Comissões de Julho — Leonardo e Fábio</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 12mm 9mm; }
  * { box-sizing: border-box; }
  body { font-family: Inter, -apple-system, Segoe UI, sans-serif; color: #17181A; font-size: 9px; line-height: 1.45; margin: 0; background: #fff; }
  header { margin-bottom: 12px; }
  h1 { font-family: Oswald, Inter, sans-serif; text-transform: uppercase; letter-spacing: .04em; font-size: 20px; font-weight: 600; margin: 0 0 3px; }
  h2 { font-family: Oswald, Inter, sans-serif; text-transform: uppercase; letter-spacing: .05em; font-size: 11px; font-weight: 600; margin: 17px 0 7px; padding-bottom: 3px; border-bottom: 1px solid #17181A; }
  h2.pess { font-size: 13px; border-bottom-width: 2px; margin-top: 22px; }
  .meta { color: #5B5E63; font-size: 8.5px; }
  .accent { height: 3px; width: 54px; background: #C9A84C; margin-top: 7px; }
  .resumo { display: flex; gap: 8px; margin: 13px 0 4px; }
  .card { flex: 1; border: 1px solid #D9DADD; border-radius: 4px; padding: 8px 10px; }
  .card .lbl { font-size: 7.2px; text-transform: uppercase; letter-spacing: .05em; color: #5B5E63; }
  .card .num { font-size: 15px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .card .qt { font-size: 7.3px; color: #8A8D92; margin-top: 2px; line-height: 1.35; }
  .card.total { background: #17181A; color: #fff; border-color: #17181A; }
  .card.total .lbl, .card.total .qt { color: #B9BBBF; }
  .card.warn { border-top: 3px solid #C9A84C; }
  .card.risc .num { text-decoration: line-through; color: #8A8D92; }
  table { width: 100%; border-collapse: collapse; font-size: 8.2px; }
  th { text-align: left; font-size: 7.4px; text-transform: uppercase; letter-spacing: .04em; color: #5B5E63; font-weight: 600; border-bottom: 1px solid #17181A; padding: 4px 3px; }
  td { padding: 3.3px 3px; border-bottom: .5px solid #E7E8EA; vertical-align: top; }
  tr { break-inside: avoid; }
  tr.x td { background: #FBFAF7; }
  .val { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  th.val { text-align: right; }
  .b { font-weight: 700; }
  .lo { font-weight: 600; }
  .cp { color: #4A4C50; }
  .nil { color: #C3C5C8; }
  tfoot td { border-top: 1.5px solid #17181A; border-bottom: none; font-weight: 700; padding-top: 6px; }
  .tag { display: inline-block; font-size: 6.5px; text-transform: uppercase; letter-spacing: .04em; border: .5px solid #E7E8EA; color: #A8ABAF; padding: 0 4px; border-radius: 2px; white-space: nowrap; }
  .tag.warn { border-color: #C9A84C; color: #9c7f2f; font-weight: 700; }
  .tag.alert { border-color: #17181A; color: #17181A; font-weight: 700; }
  .ponte td { padding: 5px 6px; }
  .ponte .lbl { font-weight: 600; }
  .exp { color: #5B5E63; font-size: 7.8px; }
  .ponte tr.total td { border-top: 1.5px solid #17181A; border-bottom: none; font-weight: 700; background: #F6F6F4; }
  .nota { margin-top: 13px; padding: 10px 12px; background: #F6F6F4; border-left: 3px solid #C9A84C; font-size: 8.4px; color: #3A3C40; border-radius: 0 3px 3px 0; break-inside: avoid; }
  .nota ul { margin: 5px 0 0; padding-left: 15px; }
  .nota li { margin-bottom: 4px; }
  .nota strong { color: #17181A; }
  footer { margin-top: 16px; padding-top: 7px; border-top: .5px solid #D9DADD; color: #8A8D92; font-size: 7.5px; display: flex; justify-content: space-between; }
</style></head><body>

<header>
  <h1>Comissões de Julho — Leonardo Serafim e Fábio Omena</h1>
  <div class="meta">Competência <strong>julho/2026</strong> · pagamento previsto <strong>25/08/2026</strong><br>
  Quatro fontes cruzadas lote a lote: as planilhas dos dois × HastaPro (<em>LOT_PISTEIRO</em> / <em>LOT_TOTAL</em>, FIL 2 e FIL 01) × os fechamentos do ERP × os títulos de contas a pagar já abertos para hoje. O lote em disputa da 2ª etapa Naviraí foi desempatado no PDF de fechamento da própria leiloeira.</div>
  <div class="accent"></div>
</header>

<div class="resumo">
  <div class="card"><div class="lbl">Leonardo — devido</div><div class="num">R$ ${brl(LEO_DEV * PCT)}</div><div class="qt">7 lotes · VGV ${brl0(LEO_DEV)}<br><strong>a planilha dele está certa</strong></div></div>
  <div class="card risc"><div class="lbl">Leonardo — o sistema ia pagar</div><div class="num">R$ ${brl(CP_LEO_TOT)}</div><div class="qt">6 títulos abertos<br>${brl(CP_LEO_TOT - LEO_DEV * PCT)} a mais</div></div>
  <div class="card warn"><div class="lbl">Fábio — devido</div><div class="num">R$ ${brl(FAB_DEV * PCT)}</div><div class="qt">15 lotes · VGV ${brl0(FAB_DEV)}<br>pediu ${brl(FAB_PL * PCT)} — <strong>${brl(FAB_DEV * PCT - FAB_PL * PCT)} a menos</strong></div></div>
  <div class="card total"><div class="lbl">A pagar hoje — os dois</div><div class="num">R$ ${brl(LEO_DEV * PCT + FAB_DEV * PCT)}</div><div class="qt">contra ${brl(CP_LEO_TOT + CP_FAB_TOT)} lançados<br>líquido: ${brl(LEO_DEV * PCT + FAB_DEV * PCT - CP_LEO_TOT - CP_FAB_TOT)}</div></div>
</div>

<div class="nota">
<strong>Resumo em uma linha.</strong> As duas planilhas estão honestas — nenhum dos dois pediu um lote que não é seu. Quem está errado é o <strong>ERP</strong>: no EAO Baviera Fêmeas ele trocou os lotes dos dois entre si, no Genética Aditiva 2ª etapa lançou 8 lotes de outras pessoas no nome do Leonardo, dobrou um lote do Fábio na Naviraí e deixou R$ 147.600 dele como <em>"a definir"</em>. Corrigindo tudo, paga-se <strong>${brl(LEO_DEV * PCT + FAB_DEV * PCT)}</strong> em vez de ${brl(CP_LEO_TOT + CP_FAB_TOT)} — o Leonardo recebe ${brl(LEO_DEV * PCT)} (${brl(CP_LEO_TOT - LEO_DEV * PCT)} a menos) e o Fábio ${brl(FAB_DEV * PCT)} (${brl(FAB_DEV * PCT - CP_FAB_TOT)} a mais).
</div>

<h2 class="pess">Leonardo Serafim — a planilha dele fecha nos 7 lotes</h2>
${ponteHtml(PONTE_LEO)}
<div class="meta" style="margin-top:6px">Os 7 lotes que ele listou são exatamente os 7 lotes que o HastaPro traz com <em>LOT_PISTEIRO</em> no nome dele em julho, e cada valor bate ao centavo. <strong>Não há uma única diferença a corrigir na planilha.</strong></div>

<h2>Lote a lote — o que é dele e o que o ERP pendurou no nome dele</h2>
<table>${cabeca}<tbody>${linhas(LEO)}</tbody>${rodape(LEO)}</table>
<div class="meta" style="margin-top:6px">As cinco últimas linhas <strong>não são dele</strong>: estão nos fechamentos do ERP no nome do Leonardo, mas o HastaPro aponta outro pisteiro em cada uma — e ele mesmo não as pediu.</div>

<h2>O que precisa mudar nos títulos de hoje — Leonardo</h2>
${cpHtml(CP_LEO, EX_LEO)}
<div class="nota">
<strong>Falta um título.</strong> Os lotes 19 e 20 do Kriz Reprodutores (07/07, R$ 37.500 → <strong>R$ 750,00</strong>) não têm conta a pagar nenhuma, porque o leilão do Kriz <strong>não tem fechamento no ERP</strong> — ele roda na filial 01 e caiu no mesmo buraco já mapeado dos leilões concluídos sem fechamento. O HastaPro registra os dois lotes no nome dele, e a comissão do Douglas de julho já foi fechada incluindo os lotes de Kriz dele pelo mesmo critério. <strong>Criar o título de R$ 750,00.</strong>
<ul>
<li>Manter: ${brl(1170 + 810 + 612)} (Naviraí 05/07, Guadalupe Fêmeas, Naviraí 2ª) · Aumentar: EAO Fêmeas de 1.200,00 para <strong>1.920,00</strong></li>
<li>Cancelar: Santa Cruz 1ª (510,00) e Genética Aditiva 2ª (<strong>4.068,00</strong>) · Criar: Kriz 07/07 (750,00)</li>
<li>Total corrigido: <strong>R$ ${brl(LEO_DEV * PCT)}</strong> — o valor exato da planilha dele.</li>
</ul></div>

<h2 class="pess">Fábio Omena — ele pediu R$ ${brl(FAB_DEV * PCT - FAB_PL * PCT)} a menos do que tem direito</h2>
${ponteHtml(PONTE_FAB)}

<h2>Lote a lote — os 15 lotes de julho no nome dele</h2>
<table>${cabeca}<tbody>${linhas(FAB)}</tbody>${rodape(FAB)}</table>
<div class="meta" style="margin-top:6px">O HastaPro traz 14 lotes (VGV ${brl0(FAB_HP)}). O 15º é o lote 25 do Guadalupe Touros: aquele leilão <strong>foi cadastrado no HastaPro sem nenhum lote</strong>, então só o fechamento do ERP registra a venda — e ela confere com a planilha dele, inclusive o comprador.</div>

<h2>O que precisa mudar nos títulos de hoje — Fábio</h2>
${cpHtml(CP_FAB, EX_FAB)}
<div class="nota">
<strong>Falta o maior título dele.</strong> Os lotes 45, 46 e 47 do Santa Cruz 3ª etapa (19/07) — 6 animais do Lúcio Barros Lima, <strong>R$ 147.600</strong> → <strong>R$ 2.952,00</strong> — estão no fechamento do ERP com assessor <em>"A definir"</em>, e por isso nenhum título foi gerado. No HastaPro os três lotes têm <em>LOT_PISTEIRO</em> = Fabio de Omena Gaia, e ele os pede na planilha (agrupados numa linha só, com o valor certo). <strong>Atribuir ao Fábio e criar o título de R$ 2.952,00.</strong>
<ul>
<li>Manter: ${brl(480 + 870 + 1962 + 420)} · Reduzir: EAO Fêmeas para 2.928,00 e Naviraí 2ª para 432,00 · Aumentar: Genética Aditiva para 1.242,00</li>
<li>Criar: Santa Cruz 3ª etapa 19/07 (<strong>2.952,00</strong>)</li>
<li>Total corrigido: <strong>R$ ${brl(FAB_DEV * PCT)}</strong>.</li>
</ul></div>

<h2>Três pontos que dependem de decisão sua</h2>
<div class="nota" style="border-left-color:#17181A">
<ul>
<li><strong>Lote 60 do Guadalupe Touros (19/07) — R$ 21.000, comissão R$ 420,00.</strong> Está lançado como <em>"Nane / Fábio Omena"</em>, comprador "Sr. Reinaldo e dona Maria Tavares" — a mesma família do lote 25, que é do Fábio. O título existe, mas com vencimento em <strong>28/12/2026</strong>, arrastado pela regra de acúmulo da Nane. Se a venda é dividida, o Fábio deveria receber 210,00 hoje. <strong>Não incluí nos ${brl(FAB_DEV * PCT)} até você definir a divisão.</strong></li>
<li><strong>O lote 39 da Naviraí 2ª etapa.</strong> A planilha do Fábio e o ERP dizem 2 animais (43.200); o HastaPro e o <strong>PDF de fechamento assinado pela leiloeira</strong> dizem 1 animal a R$ 720 × 30 = 21.600. Adotei o fechamento da leiloeira, que é o documento que rege o faturamento. Se ele apresentar prova do 2º animal, sobem 432,00.</li>
<li><strong>Os lotes do Kriz na filial 01.</strong> Continuam invisíveis para o ERP enquanto o leilão não tiver fechamento. Vale gerar o fechamento do Kriz de 07/07 em vez de lançar o título solto — senão o mesmo buraco reaparece em agosto.</li>
</ul></div>

<h2>O que causou os erros do ERP — e o que fazer para não repetir</h2>
<div class="nota">
<ul>
<li><strong>A troca no EAO Baviera Fêmeas.</strong> Nos <em>lances[]</em> do fechamento, os lotes 26 e 30 têm comprador "A identificar · Fazenda São Gerônimo · MG" e o lote 19 "A identificar · Fazenda Correntes · MS". Com o comprador não identificado, a atribuição do assessor saiu invertida. No HastaPro os compradores estão nomeados: <strong>Romualdo Tavares de Miranda</strong> nos lotes 26 e 30 — o cliente histórico do Leonardo, que também comprou com ele na Naviraí e no Guadalupe — e <strong>Luiz Carlos Freitas</strong> no lote 19.</li>
<li><strong>Os 8 lotes do Genética Aditiva.</strong> Todo lote sem assessor claro caiu no primeiro nome da lista. Valéria Borges e Regiane Abreu são pisteiras registradas no HastaPro naquele leilão e não aparecem em nenhum fechamento — vale conferir se elas têm comissão de julho a receber e não foi lançada.</li>
<li><strong>A dobra do lote 39.</strong> É a armadilha conhecida do parser de lances multi-animal. O <em>LOT_TOTAL</em> do HastaPro e o PDF da leiloeira são o lastro; a contagem de animais da captura do grupo não é.</li>
<li><strong>Regra prática:</strong> antes de gerar os títulos do dia 25, rodar o alinhamento de <em>por_assessor</em> contra o <em>LOT_PISTEIRO</em> do HastaPro. Dos 13 títulos abertos hoje para os dois, <strong>6 estavam errados</strong> e 2 faltavam.</li>
</ul></div>

<footer><span>Bula Assessoria · conferência de comissões — competência julho/2026</span><span>gerado em 25/08/2026 · fontes: HastaPro (leitura), ERP Bula, planilhas dos assessores, fechamento Naviraí 2ª etapa</span></footer>
</body></html>`

const out = join(homedir(), 'Desktop', 'Comissoes-Julho-2026-Leonardo-e-Fabio')
fs.mkdirSync(out, { recursive: true })
const htmlPath = join(out, 'Comissoes-Julho-2026-Leonardo-e-Fabio.html')
fs.writeFileSync(htmlPath, html, 'utf8')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: join(out, 'Comissoes-Julho-2026-Leonardo-e-Fabio.pdf'), format: 'A4', printBackground: true })
await browser.close()

console.log('LEONARDO  planilha', brl(LEO_PL * PCT), '| devido', brl(LEO_DEV * PCT), '| CP aberto', brl(CP_LEO_TOT))
console.log('FABIO     planilha', brl(FAB_PL * PCT), '| devido', brl(FAB_DEV * PCT), '| CP aberto', brl(CP_FAB_TOT))
console.log('TOTAL a pagar', brl(LEO_DEV * PCT + FAB_DEV * PCT), 'contra', brl(CP_LEO_TOT + CP_FAB_TOT), 'lancados')
console.log('->', out)
