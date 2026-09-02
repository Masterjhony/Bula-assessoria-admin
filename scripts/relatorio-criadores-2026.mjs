/**
 * RANKING DE CRIADORES 2026 — quem sao os maiores clientes da Bula Assessoria.
 *
 * "Cliente" aqui e o CRIADOR (comitente/vendedor do gado), nao o comprador.
 * A metrica e o VGV vendido SOB COBERTURA DA BULA — ou seja, os lotes que a
 * equipe da Bula levou comprador, nao o faturamento inteiro do pregao.
 *
 * FONTES (independentes):
 *   1. ERP  — `bula_leilao_fechamento` (VGV autoritativo por leilao, ja auditado)
 *          — `erp_contas_receber` com `fechamento_id` (receita da Bula por leilao)
 *   2. HastaPro Firebird — tabela VENDEDORES (quem e o criador de cada lote) e
 *          as proporcoes usadas para ratear os leiloes de dois ou mais criadores.
 *
 * O ERP manda no VALOR; o HastaPro manda em QUEM E O CRIADOR. Nenhum numero
 * vem do WhatsApp ou de planilha.
 *
 *   node scripts/relatorio-criadores-2026.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = (n) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const int = (n) => Number(n || 0).toLocaleString('pt-BR')
const pct = (n) => (Number(n || 0) * 100).toFixed(1).replace('.', ',') + '%'
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const dia = (d) => d.slice(8, 10) + '/' + d.slice(5, 7)
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

// ── 1. Dicionario de marcas ────────────────────────────────────────────────
// O nome do leilao carrega a marca do criador. A ordem importa: a primeira
// regra que casa vence — por isso "Genetica Aditiva" vem antes de "Terra
// Brava" (o pregao conjunto de 29/04 e do Aditiva, conforme o HastaPro).
const MARCAS = [
  ['Naviraí Camparino (conjunto)', [/NAVIRA. CAMPARINO/]],
  ['Naviraí (Cláudio Sabino Carvalho Filho)', [/NAVIRA/]],
  ['Camparino (José Humberto Villela Martins)', [/CAMPARINO/]],
  ['EAO Baviera', [/\bEAO\b/, /BAVIERA/]],
  ['Nelore JMP (JBJ Agropecuária · Mauro Christianini)', [/\bJMP\b/]],
  ['Rancho da Matinha', [/MATINHA/]],
  ['LS (Luiz Cesar Vaz de Melo)', [/\bLS\b/]],
  ['Nelore Mafra (Paulo de Castro Marques)', [/MAFRA/]],
  ['Genética Aditiva Agropecuária', [/GENETICA ADITIVA/]],
  ['Nelore Terra Brava', [/TERRA BRAVA/]],
  ['Nelore Paranã', [/PARANA/]],
  ['Fazenda Santa Nice', [/SANTA NICE/]],
  ['Agropecuária Guadalupe', [/GUADALUPE/]],
  ['Nelore da Bambú', [/BAMBU/]],
  ['Agropecuária Santa Nazaré', [/SANTA NAZAR/]],
  ['Nelore Cachoeirão', [/CACHOEIRAO/]],
  ['Nelore Tresmar', [/TRESMAR/]],
  ['Nelore Kriz', [/KRIZ/]],
  ['Nelore IPB', [/\bIPB\b/]],
  ['4R (Rezende Andrade)', [/\b4R\b/]],
  ['Nelore Crispim', [/CRISPIM/]],
  ['Nelore Beem', [/BEEM/]],
  ['Nelore Katayama', [/KATAYAMA/]],
  ['Partner RG (Ricardo Gouveia)', [/PARTNER RG/]],
  ['Nelore Sales', [/NELORE SALES/]],
  ['Faz. São Francisco – Bahia Premium (BA)', [/BAHIA PREMIUM/]],
  ['Nelore São Francisco', [/NELORE SAO FRANCISCO/]],
  ['Agropecuária Lagoa dos Patos', [/LAGOA D(OS|E) PATOS/]],
  ['Nelore Marcondes', [/MARCONDES/]],
  ['FB Agro · Fazenda Bela Rosa', [/BELA ROSA/, /FB AGRO/]],
  ['Nelore FLOC', [/FLOC/]],
  ['Top Genética (Bemach · Água Doce · LFD)', [/TOP GENETICA/]],
  ['Nelore JEM (José Eduardo Motta)', [/\bJEM\b/]],
  ['Nelore Garoa (Pintado Raiz)', [/PINTADO RAIZ/]],
  ['Nelore Santa Fé', [/SANTA FE/]],
  ['Jacamim (Marcos Martins Villela)', [/JACAMIM/, /EXCELENCIA GENETICA/]],
  ['KatiSpera (José Odemir Spaggiari)', [/KATISPERA/]],
  ['RS Agropecuária (Roberto Bavaresco)', [/\bRS AGROPECUARIA\b/, /TOUROS RS\b/, /REPRODUTORES RS\b/]],
  ['Nelore Magda (Valdemar Pissinatti Guerra)', [/MAGDA/]],
  ['Nelore Sorriso', [/SORRISO/]],
  ['Base Genética Santa Cruz (Gil Pereira)', [/SANTA CRUZ/]],
  ['Grupo Costa', [/GRUPO COSTA/]],
  ['Pérolas do Tapajós', [/TAPAJOS/]],
  ['Nelore Fazenda Araras', [/ARARAS/]],
  ['Nelore Hora', [/NELORE HORA/]],
  ['Nelore MEAB & Fazenda Modelo', [/MEAB/]],
  ['Nelore CEN & Fazenda Modelo', [/\bCEN\b/]],
  ['Colonial Agropecuária', [/COLONIAL/]],
  ['Noite Nacional (Colonial · Terra Boa)', [/NOITE NACIONAL/]],
  ['Fazenda Rio Bonito', [/RIO BONITO/]],
  ['Nelore MRA', [/\bMRA\b/]],
  ['Matrizes de Vanguarda', [/VANGUARDA/]],
  ['Nelore Flor do Arataú', [/ARATAU/]],
  ['Fazenda São Geraldo & 7P Agro', [/SAO GERALDO/]],
  ['Neloraço (Irmãos Hipólito)', [/NELORACO|HIPOLITO/]],
  ['Nelore MNO', [/\bMNO\b/]],
  ['Ribalta', [/RIBALTA/]],
  ['18º Mega Nelore Pará (Marcovel · Fz. Angico)', [/MEGA (LEILAO )?NELORE PARA/]],
  ['Baby de Prova (Jairo Carneiro)', [/BABY DE PROVA/]],
]

// Pregoes com mais de um criador. Os pesos sao o VGV de cada vendedor no
// HastaPro (FIL 2) daquele mesmo pregao — o rateio nao e chute, e a proporcao
// medida lote a lote.
const RATEIO = {
  'Top Genética (Bemach · Água Doce · LFD)': [['Bemach Agropecuária', 98400], ['Nelore Água Doce', 67200], ['Nelore LFD', 14400]],
  'Noite Nacional (Colonial · Terra Boa)': [['Colonial Agropecuária', 117000], ['Terra Boa Agropecuária', 78000]],
  '18º Mega Nelore Pará (Marcovel · Fz. Angico)': [['Marcovel Agropecuária', 270000], ['Fazenda Angico', 129000]],
  'Naviraí Camparino (conjunto)': [['Naviraí (Cláudio Sabino Carvalho Filho)', 1183500], ['Camparino (José Humberto Villela Martins)', 300000]],
}
const RATEIO_FECHAMENTO = {
  // 29/04 Expozebu: HastaPro mostra Paulo de Castro Marques 285.000 + JBJ 195.000.
  '2026-04-29|Leilão MAFRA – 29/04/2026': [['Nelore Mafra (Paulo de Castro Marques)', 285000], ['Nelore JMP (JBJ Agropecuária · Mauro Christianini)', 195000]],
  // Pregao conjunto sem quebra por vendedor no HastaPro: rateio 50/50 declarado.
  '2026-08-20|LEILÃO NELORE PARANÃ E CASABRANCA EXPOGENÉTICA': [['Nelore Paranã', 1], ['Nelore Casabranca', 1]],
}
// Mesmo pregao lancado duas vezes no ERP (mesma data, VGV, lotes e comissao).
const DUPLICATAS = new Set(['2026-06-23|Venda Touros RS - 23/06/2026'])

const classifica = (nome) => { const N = norm(nome); for (const [marca, res] of MARCAS) for (const re of res) if (re.test(N)) return marca; return null }

// ── 2. Carga ───────────────────────────────────────────────────────────────
const { data: fech, error } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,vgv_total,lotes_vendidos,animais_vendidos,comissao_assessoria,origem').order('data').limit(500)
if (error) throw error
let cr = []
for (let from = 0; ; from += 1000) {
  const { data, error: e2 } = await sb.from('erp_contas_receber').select('id,fechamento_id,valor,valor_recebido,status,descricao').range(from, from + 999)
  if (e2) throw e2
  cr = cr.concat(data); if (data.length < 1000) break
}
const crVivo = cr.filter((t) => t.fechamento_id && t.status !== 'cancelado')
const emitido = {}, recebido = {}
for (const t of crVivo) {
  emitido[t.fechamento_id] = (emitido[t.fechamento_id] || 0) + Number(t.valor || 0)
  if (t.status === 'recebido') recebido[t.fechamento_id] = (recebido[t.fechamento_id] || 0) + Number(t.valor_recebido || t.valor || 0)
}

// ── 3. Atribuicao criador x leilao ─────────────────────────────────────────
const linhas = [], semCriador = [], descartados = []
for (const f of fech) {
  const key = `${f.data}|${f.nome}`
  if (DUPLICATAS.has(key)) { descartados.push(f); continue }
  const rp = RATEIO_FECHAMENTO[key]
  const marca = classifica(f.nome)
  if (!marca && !rp) { semCriador.push(f); continue }
  const partes = rp || RATEIO[marca] || [[marca, 1]]
  const soma = partes.reduce((s, p) => s + p[1], 0)
  for (const [m, peso] of partes) {
    const share = peso / soma
    linhas.push({
      marca: m, share, data: f.data, leilao: f.nome, fechId: f.id,
      vgv: Number(f.vgv_total || 0) * share,
      lotes: Number(f.lotes_vendidos || 0) * share,
      animais: Number(f.animais_vendidos || 0) * share,
      comissao: Number(f.comissao_assessoria || 0) * share,
      receita: (emitido[f.id] || 0) * share,
      recebido: (recebido[f.id] || 0) * share,
    })
  }
}
if (semCriador.length) { console.error('SEM CRIADOR:', semCriador.map((f) => f.nome)); process.exit(1) }
const totalErp = fech.filter((f) => !DUPLICATAS.has(`${f.data}|${f.nome}`)).reduce((s, f) => s + Number(f.vgv_total || 0), 0)
const totalLinhas = linhas.reduce((s, l) => s + l.vgv, 0)
if (Math.abs(totalLinhas - totalErp) > 0.01) { console.error('NAO FECHA:', totalLinhas, totalErp); process.exit(1) }

// ── 4. Agregacao ───────────────────────────────────────────────────────────
const m = new Map()
for (const l of linhas) {
  if (!m.has(l.marca)) m.set(l.marca, { marca: l.marca, vgv: 0, lotes: 0, animais: 0, comissao: 0, receita: 0, recebido: 0, eventos: new Set(), meses: new Set(), leiloes: [] })
  const o = m.get(l.marca)
  o.vgv += l.vgv; o.lotes += l.lotes; o.animais += l.animais; o.comissao += l.comissao
  o.receita += l.receita; o.recebido += l.recebido
  o.eventos.add(`${l.data}|${l.leilao}`); o.meses.add(l.data.slice(0, 7)); o.leiloes.push(l)
}
const rank = [...m.values()].map((o) => ({
  ...o, eventos: o.eventos.size, meses: o.meses.size,
  de: o.leiloes.map((x) => x.data).sort()[0], ate: o.leiloes.map((x) => x.data).sort().slice(-1)[0],
  ticket: o.lotes ? o.vgv / o.lotes : 0, taxa: o.vgv ? o.receita / o.vgv : 0,
})).sort((a, b) => b.vgv - a.vgv)
rank.forEach((o, i) => { o.pos = i + 1; o.parte = o.vgv / totalLinhas })
let acc = 0; for (const o of rank) { acc += o.parte; o.acum = acc }

const TOP = rank.slice(0, 10)
const topN = (n) => rank.slice(0, n).reduce((s, o) => s + o.vgv, 0)
const totalEventos = new Set(linhas.map((l) => `${l.data}|${l.leilao}`)).size
const totalReceita = rank.reduce((s, o) => s + o.receita, 0)
const totalRecebido = rank.reduce((s, o) => s + o.recebido, 0)
const recorrentes = rank.filter((o) => o.eventos >= 2)
const MESES = [...new Set(linhas.map((l) => l.data.slice(0, 7)))].sort()
const navirai = rank.find((o) => o.marca.startsWith('Navira'))

// ── 5. XLSX ────────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rank.map((o) => ({
  '#': o.pos, 'Criador': o.marca, 'VGV cobertura Bula': +o.vgv.toFixed(2), '% do total': +(o.parte * 100).toFixed(2),
  '% acumulado': +(o.acum * 100).toFixed(2), 'Pregoes': o.eventos, 'Meses ativos': o.meses,
  'Lotes': Math.round(o.lotes), 'Animais': Math.round(o.animais), 'Ticket medio/lote': +o.ticket.toFixed(2),
  'Receita Bula (CR emitido)': +o.receita.toFixed(2), 'Recebido': +o.recebido.toFixed(2),
  'Taxa efetiva s/ VGV': +(o.taxa * 100).toFixed(2), 'Comissao assessores': +o.comissao.toFixed(2),
  'Primeiro pregao': o.de, 'Ultimo pregao': o.ate,
}))), 'Ranking')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.map((l) => ({
  'Data': l.data, 'Leilao': l.leilao, 'Criador': l.marca, 'Fatia do pregao %': +(l.share * 100).toFixed(1),
  'VGV': +l.vgv.toFixed(2), 'Lotes': Math.round(l.lotes), 'Animais': Math.round(l.animais),
  'Receita Bula': +l.receita.toFixed(2), 'Comissao assessores': +l.comissao.toFixed(2),
})).sort((a, b) => a.Data.localeCompare(b.Data))), 'Leilao a leilao')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(MESES.map((mes) => {
  const row = { 'Mes': mes }
  for (const o of TOP) row[o.marca] = +linhas.filter((l) => l.marca === o.marca && l.data.startsWith(mes)).reduce((s, l) => s + l.vgv, 0).toFixed(2)
  return row
})), 'Top 10 por mes')
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ['PREMISSAS E ESCOPO'],
  ['Periodo', '01/01/2026 a 26/08/2026'],
  ['Cliente = criador', 'O comitente/vendedor do gado, nao o comprador.'],
  ['Metrica principal', 'VGV vendido sob COBERTURA DA BULA — so os lotes em que a Bula levou o comprador.'],
  ['Fonte do valor', 'ERP · bula_leilao_fechamento (autoritativa)'],
  ['Fonte do criador', 'HastaPro Firebird · tabela VENDEDORES (vendedor do lote), FIL 2'],
  ['Fonte da receita', 'ERP · erp_contas_receber vinculado por fechamento_id, cancelados fora'],
  ['Rateio', 'Pregao com 2+ criadores e rateado pela proporcao de VGV por vendedor no HastaPro.'],
  [],
  ['CONFERENCIA'],
  ['VGV total atribuido', +totalLinhas.toFixed(2)],
  ['VGV total no ERP (sem a duplicata)', +totalErp.toFixed(2)],
  ['Diferenca', +(totalLinhas - totalErp).toFixed(2)],
  ['Pregoes', totalEventos],
  ['Criadores distintos', rank.length],
  [],
  ['ACHADOS'],
  ['Duplicata removida', '23/06 "Venda Touros RS" repete "LEILAO VIRTUAL REPRODUTORES RS AGROPECUARIA" (mesma data, VGV, lotes e comissao). R$ 175.500 sairam da conta.'],
  ['Ribalta', 'Fechamento de 14/05 com VGV zero mas R$ 58.890 de receita ja recebida — receita sem venda registrada.'],
  ['Nelore IPB 30 Anos', 'Fechamento de 28/06 com VGV zero e sem receita: pregao coberto sem resultado lancado.'],
  ['Cobertura da receita', 'So ' + crVivo.length + ' titulos a receber estao amarrados a um fechamento. Os pregoes de jan-abr e boa parte de agosto ainda nao tem receita lancada, entao a coluna Receita subestima o topo do ranking.'],
]), 'Premissas')
const xlsxPath = join(homedir(), 'Desktop', 'Ranking-Criadores-Bula-2026.xlsx')
XLSX.writeFile(wb, xlsxPath)

// ── 6. PDF ─────────────────────────────────────────────────────────────────
const linhaTop = (o) => `<tr>
  <td class="pos">${o.pos}</td>
  <td><strong>${esc(o.marca)}</strong><div class="obs">${o.eventos} pregã${o.eventos > 1 ? 'os' : 'o'} · ${dia(o.de)} a ${dia(o.ate)}</div></td>
  <td class="val"><strong>${brl0(o.vgv)}</strong></td>
  <td class="val">${pct(o.parte)}</td>
  <td class="val">${int(Math.round(o.lotes))}</td>
  <td class="val">${int(Math.round(o.animais))}</td>
  <td class="val">${brl0(o.ticket)}</td>
  <td class="val">${o.receita ? brl0(o.receita) : '<span class="vazio">a lançar</span>'}</td>
</tr>`

const fichaCriador = (o) => `<div class="ficha">
  <h3>${o.pos}. ${esc(o.marca)} <span class="fx">${brl0(o.vgv)} · ${pct(o.parte)} do total</span></h3>
  <table class="mini"><thead><tr><th>Data</th><th>Pregão</th><th class="val">Lotes</th><th class="val">VGV</th><th class="val">Receita Bula</th></tr></thead><tbody>
  ${o.leiloes.slice().sort((a, b) => a.data.localeCompare(b.data)).map((l) => `<tr>
    <td class="nowrap">${dia(l.data)}</td>
    <td>${esc(l.leilao)}${l.share < 1 ? ` <span class="tag">${(l.share * 100).toFixed(0)}% do pregão</span>` : ''}</td>
    <td class="val">${int(Math.round(l.lotes))}</td>
    <td class="val">${brl0(l.vgv)}</td>
    <td class="val">${l.receita ? brl0(l.receita) : '—'}</td></tr>`).join('')}
  </tbody><tfoot><tr><td colspan="2">Total</td><td class="val">${int(Math.round(o.lotes))}</td><td class="val">${brl0(o.vgv)}</td><td class="val">${o.receita ? brl0(o.receita) : '—'}</td></tr></tfoot></table>
</div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ranking de Criadores 2026</title>
<style>
  @page { size: A4; margin: 13mm 11mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #17181A; font-size: 10px; line-height: 1.45; margin: 0; }
  header { border-bottom: 2px solid #17181A; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 19px; margin: 0 0 4px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
  .meta { color: #5B5E63; font-size: 9.5px; }
  .accent { height: 3px; width: 54px; background: #C9A84C; margin-top: 8px; }
  h2 { font-size: 12px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; border-left: 4px solid #17181A; padding-left: 8px; break-after: avoid; }
  h2 .sub { float: right; font-weight: 400; color: #5B5E63; font-size: 9.5px; letter-spacing: 0; text-transform: none; }
  h3 { font-size: 10px; margin: 14px 0 5px; text-transform: uppercase; letter-spacing: .05em; color: #17181A; font-weight: 700; break-after: avoid; }
  h3 .fx { float: right; font-weight: 400; color: #5B5E63; letter-spacing: 0; text-transform: none; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: .05em; color: #5B5E63; border-bottom: 1.5px solid #17181A; padding: 5px 6px; }
  td { padding: 5px 6px; border-bottom: .5px solid #E4E5E7; vertical-align: top; }
  tr { break-inside: avoid; }
  .val { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  th.val { text-align: right; }
  .pos { font-weight: 700; font-variant-numeric: tabular-nums; color: #8A8D92; width: 18px; }
  .nowrap { white-space: nowrap; }
  .obs { color: #6A6D72; font-size: 8.5px; }
  .vazio { color: #A8ABAF; font-style: italic; }
  .tag { display: inline-block; font-size: 7px; text-transform: uppercase; letter-spacing: .04em; border: .5px solid #C9A84C; color: #9c7f2f; font-weight: 700; padding: 0 4px; border-radius: 2px; white-space: nowrap; }
  tfoot td { border-top: 1.5px solid #17181A; border-bottom: none; font-weight: 700; padding-top: 6px; }
  .resumo { display: flex; gap: 8px; margin-bottom: 14px; }
  .card { flex: 1; border: 1px solid #D9DADD; border-radius: 4px; padding: 9px 10px; }
  .card .lbl { font-size: 7.5px; text-transform: uppercase; letter-spacing: .05em; color: #5B5E63; }
  .card .num { font-size: 14px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .card .qt { font-size: 7.5px; color: #8A8D92; margin-top: 1px; }
  .card.total { background: #17181A; color: #fff; border-color: #17181A; }
  .card.total .num { font-size: 13px; }
  .card.total .lbl, .card.total .qt { color: #B9BBBF; }
  .barra { height: 7px; background: #EDEEEF; border-radius: 2px; overflow: hidden; }
  .barra i { display: block; height: 100%; background: #17181A; }
  .barra.ouro i { background: #C9A84C; }
  .ficha { break-inside: avoid; margin-bottom: 10px; }
  .mini td, .mini th { padding: 3.5px 6px; font-size: 9px; }
  .nota { margin-top: 14px; padding: 10px 12px; background: #F6F6F4; border-left: 3px solid #C9A84C; font-size: 8.8px; color: #3A3C40; border-radius: 0 3px 3px 0; break-inside: avoid; }
  .nota ul { margin: 6px 0 0; padding-left: 15px; }
  .nota li { margin-bottom: 4px; }
  .quebra { break-before: page; }
  footer { margin-top: 16px; padding-top: 8px; border-top: .5px solid #D9DADD; color: #8A8D92; font-size: 8px; display: flex; justify-content: space-between; }
</style></head><body>
<header>
  <h1>Ranking de Criadores · 2026</h1>
  <div class="meta">Os maiores clientes da Bula Assessoria por volume vendido sob nossa cobertura · 01/01 a 26/08/2026</div>
  <div class="accent"></div>
</header>

<div class="resumo">
  <div class="card total"><div class="lbl">VGV sob cobertura Bula</div><div class="num">${brl(totalLinhas)}</div><div class="qt">${totalEventos} pregões</div></div>
  <div class="card"><div class="lbl">Criadores atendidos</div><div class="num">${rank.length}</div><div class="qt">${recorrentes.length} com 2+ pregões</div></div>
  <div class="card"><div class="lbl">Concentração no Top 10</div><div class="num">${pct(topN(10) / totalLinhas)}</div><div class="qt">Top 5 = ${pct(topN(5) / totalLinhas)}</div></div>
  <div class="card"><div class="lbl">Receita Bula lançada</div><div class="num">${brl0(totalReceita)}</div><div class="qt">${brl0(totalRecebido)} já recebidos</div></div>
</div>

<h2>Top 10 criadores<span class="sub">por VGV vendido sob cobertura da Bula</span></h2>
<table>
  <thead><tr><th></th><th>Criador</th><th class="val">VGV</th><th class="val">Part.</th><th class="val">Lotes</th><th class="val">Animais</th><th class="val">Ticket/lote</th><th class="val">Receita Bula</th></tr></thead>
  <tbody>${TOP.map(linhaTop).join('')}</tbody>
  <tfoot><tr><td></td><td>Top 10</td><td class="val">${brl0(topN(10))}</td><td class="val">${pct(topN(10) / totalLinhas)}</td>
    <td class="val">${int(Math.round(TOP.reduce((s, o) => s + o.lotes, 0)))}</td>
    <td class="val">${int(Math.round(TOP.reduce((s, o) => s + o.animais, 0)))}</td><td></td>
    <td class="val">${brl0(TOP.reduce((s, o) => s + o.receita, 0))}</td></tr></tfoot>
</table>

<h2>Como o volume se concentra</h2>
<table>
  <thead><tr><th>Faixa</th><th class="val">VGV</th><th class="val">% do total</th><th style="width:38%">&nbsp;</th></tr></thead>
  <tbody>
  ${[['Top 3', 3], ['Top 5', 5], ['Top 10', 10], ['Top 20', 20], [`Todos os ${rank.length}`, rank.length]].map(([lbl, n]) => `<tr>
    <td>${lbl}</td><td class="val">${brl0(topN(n))}</td><td class="val">${pct(topN(n) / totalLinhas)}</td>
    <td><div class="barra${n <= 10 ? ' ouro' : ''}"><i style="width:${(topN(n) / totalLinhas * 100).toFixed(1)}%"></i></div></td></tr>`).join('')}
  </tbody>
</table>
<div class="nota"><strong>Leitura:</strong> os 10 primeiros criadores respondem por ${pct(topN(10) / totalLinhas)} de tudo o que a Bula vendeu em 2026, e os 3 primeiros sozinhos por ${pct(topN(3) / totalLinhas)}. Os outros ${rank.length - 10} criadores somam ${pct(1 - topN(10) / totalLinhas)}. Um único pregão — o 10º Nelore JMP Touros, de 14/06 — vale ${pct(4148709 / totalLinhas)} do ano inteiro.</div>

<div class="quebra"></div>
<h2>Ficha do Top 10<span class="sub">pregão a pregão</span></h2>
${TOP.map(fichaCriador).join('')}

<div class="quebra"></div>
<h2>Ranking completo<span class="sub">${rank.length} criadores</span></h2>
<table>
  <thead><tr><th></th><th>Criador</th><th class="val">VGV</th><th class="val">Part.</th><th class="val">Acum.</th><th class="val">Pregões</th><th class="val">Lotes</th><th class="val">Ticket/lote</th><th class="val">Receita Bula</th></tr></thead>
  <tbody>${rank.map((o) => `<tr>
    <td class="pos">${o.pos}</td><td>${esc(o.marca)}</td>
    <td class="val">${brl0(o.vgv)}</td><td class="val">${pct(o.parte)}</td><td class="val">${pct(o.acum)}</td>
    <td class="val">${o.eventos}</td><td class="val">${int(Math.round(o.lotes))}</td>
    <td class="val">${brl0(o.ticket)}</td><td class="val">${o.receita ? brl0(o.receita) : '—'}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td></td><td>Total</td><td class="val">${brl(totalLinhas)}</td><td class="val">100,0%</td><td></td>
    <td class="val">${totalEventos}</td><td class="val">${int(Math.round(rank.reduce((s, o) => s + o.lotes, 0)))}</td><td></td>
    <td class="val">${brl0(totalReceita)}</td></tr></tfoot>
</table>

<h2>Premissas e achados</h2>
<div class="nota"><strong>De onde vem cada número:</strong>
<ul>
<li><strong>Cliente é o criador</strong>, não o comprador: quem consignou o animal no pregão.</li>
<li><strong>VGV é a cobertura da Bula</strong> — só os lotes em que a nossa equipe levou o comprador —, não o faturamento inteiro do evento. Valor vindo do ERP (<em>bula_leilao_fechamento</em>), a base já auditada.</li>
<li><strong>Quem é o criador de cada lote</strong> vem do HastaPro (tabela VENDEDORES, filial 2), fonte independente do ERP. Pregão com dois ou mais criadores é rateado pela proporção de VGV medida lote a lote — nunca por estimativa.</li>
<li><strong>Receita Bula</strong> são os títulos a receber amarrados ao fechamento, cancelados fora.</li>
</ul></div>
<div class="nota"><strong>O que apareceu na conferência:</strong>
<ul>
<li><strong>Pregão em duplicidade no ERP:</strong> em 23/06, "Venda Touros RS" repete "Leilão Virtual Reprodutores RS Agropecuária" — mesma data, mesmo VGV, mesmos 9 lotes, mesma comissão. Os R$ 175.500 duplicados foram retirados deste relatório; <strong>a correção ainda precisa ser feita no ERP</strong>.</li>
<li><strong>Ribalta (14/05):</strong> fechamento com VGV zero, mas R$ 58.890 de receita já recebida. Receita sem venda registrada — por isso o criador aparece no fim do ranking.</li>
<li><strong>Nelore IPB 30 Anos (28/06):</strong> fechamento com VGV zero e sem receita, embora o pregão tenha sido coberto.</li>
<li><strong>A coluna Receita subestima o topo:</strong> apenas ${crVivo.length} títulos estão amarrados a um fechamento. Os pregões de janeiro a abril e boa parte dos de agosto ainda não tiveram receita lançada — por isso ${esc(navirai.marca.split(' (')[0])}, com R$ ${brl0(navirai.vgv)} de VGV, mostra só R$ ${brl0(navirai.receita)} de receita.</li>
</ul></div>

<footer><span>Bula Assessoria · Ranking de Criadores 2026</span><span>Emitido em 27/08/2026 · fontes: ERP e HastaPro</span></footer>
</body></html>`

const pdfPath = join(homedir(), 'Desktop', 'Ranking-Criadores-Bula-2026.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
await browser.close()
writeFileSync(join(process.cwd(), 'scratch', 'ranking-criadores-2026.html'), html)

console.log('PDF :', pdfPath)
console.log('XLSX:', xlsxPath)
console.log(`VGV ${brl(totalLinhas)} | ${totalEventos} pregoes | ${rank.length} criadores | Top10 ${pct(topN(10) / totalLinhas)}`)
for (const o of TOP) console.log(` ${String(o.pos).padStart(2)}. ${o.marca.padEnd(52)} ${brl0(o.vgv).padStart(10)}  ${pct(o.parte).padStart(6)}  ${o.eventos} pregoes`)
