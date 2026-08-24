// Levanta os dados para a análise econômica da parceria com o Gustavo Rusa:
// o que ele reivindica em agosto, o que já foi pago em 2026, a taxa de acordo
// real de cada leilão e a margem da Bula lote a lote. SOMENTE LEITURA.
// Uso: node scripts/analise-parceria-rusa-2026.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const SC = 'C:/Users/Notebook-Acer/AppData/Local/Temp/claude/F--Projetos-Desktop-web-bula/b9eae285-f7bf-4e6a-a1db-cb933cb37306/scratchpad'
const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (n) => (Number(n) * 100).toFixed(2) + '%'

// ── 1) A planilha que ele mandou (agosto) ────────────────────────────────────
const wb = XLSX.readFile('F:/RUSA - AGOSTO.xlsx')
const dt = (s) => { const x = XLSX.SSF.parse_date_code(s); return `${x.y}-${String(x.m).padStart(2, '0')}-${String(x.d).padStart(2, '0')}` }
const dele = XLSX.utils.sheet_to_json(wb.Sheets['Página1'], { header: 1, raw: true, defval: '' })
  .slice(3).filter((r) => r[0] && String(r[0]).toUpperCase().includes('RUSA'))
  .map((r) => ({ data: dt(r[2]), leilao: String(r[1]).trim(), lote: String(r[3]), qtd: Number(r[5]), lance: Number(r[6]), parcelas: Number(r[7]), vgv: Number(r[8]), pctCom: Number(r[9]), comissao: Number(r[10]), comprador: String(r[11]).trim() }))
const vgvDele = dele.reduce((s, r) => s + r.vgv, 0)
const comDele = dele.reduce((s, r) => s + r.comissao, 0)

console.log('=== 1) O QUE O RUSA REIVINDICA EM AGOSTO ===')
console.log(`${dele.length} lotes · VGV ${brl(vgvDele)} · comissão ${brl(comDele)} (${pct(comDele / vgvDele)} médio)`)
const porComprador = {}
for (const r of dele) { const k = r.comprador; porComprador[k] = porComprador[k] || { lotes: 0, vgv: 0, com: 0 }; porComprador[k].lotes++; porComprador[k].vgv += r.vgv; porComprador[k].com += r.comissao }
for (const [k, v] of Object.entries(porComprador).sort((a, b) => b[1].vgv - a[1].vgv)) console.log(`   ${k.padEnd(20)} ${v.lotes} lotes · VGV ${brl(v.vgv).padStart(12)} · ${brl(v.com).padStart(10)}`)

// ── 2) Fechamentos e taxa de acordo real ─────────────────────────────────────
const { data: fechs } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,vgv_total,receita_bula,comissao_assessoria,lances,por_assessor,acordo_descricao,acordo_pct_venda_cobertura,acordo_pct_faturamento,faturamento_total_leilao')
  .gte('data', '2026-01-01').order('data')

const rusaLote = (l) => /RUSA/i.test(String(l.assessor || ''))
console.log('\n=== 2) TAXA DE ACORDO REAL POR LEILÃO (receita_bula ÷ VGV de cobertura) ===')
const comReceita = (fechs || []).filter((f) => Number(f.receita_bula) > 0 && Number(f.vgv_total) > 0)
const taxas = comReceita.map((f) => ({ nome: f.nome, data: f.data, t: Number(f.receita_bula) / Number(f.vgv_total), vgv: Number(f.vgv_total) }))
taxas.sort((a, b) => a.t - b.t)
const somaVgv = taxas.reduce((s, x) => s + x.vgv, 0)
const taxaPond = taxas.reduce((s, x) => s + x.t * x.vgv, 0) / somaVgv
const mediana = taxas[Math.floor(taxas.length / 2)].t
console.log(`${taxas.length} leilões com receita lançada · taxa média ponderada ${pct(taxaPond)} · mediana ${pct(mediana)}`)
const faixas = { 'até 3%': 0, '3–5%': 0, 'exatamente 5%': 0, '5–6,1%': 0, 'acima de 6,1%': 0 }
for (const x of taxas) {
  if (Math.abs(x.t - 0.05) < 0.0005) faixas['exatamente 5%'] += x.vgv
  else if (x.t <= 0.03) faixas['até 3%'] += x.vgv
  else if (x.t < 0.05) faixas['3–5%'] += x.vgv
  else if (x.t < 0.061) faixas['5–6,1%'] += x.vgv
  else faixas['acima de 6,1%'] += x.vgv
}
for (const [k, v] of Object.entries(faixas)) console.log(`   ${k.padEnd(16)} VGV ${brl(v).padStart(14)} (${pct(v / somaVgv)} do VGV com receita)`)

// ── 3) Lotes do Rusa já marcados no sistema, com margem ──────────────────────
console.log('\n=== 3) LOTES DO RUSA NO SISTEMA (2026) — margem da Bula lote a lote ===')
const IMPOSTO = 0.18
const linhas = []
for (const f of fechs || []) {
  const rs = (f.lances || []).filter(rusaLote)
  if (!rs.length) continue
  const vgvT = Number(f.vgv_total) || 0
  const t = vgvT && Number(f.receita_bula) > 0 ? Number(f.receita_bula) / vgvT : null
  const vgvR = rs.reduce((s, l) => s + Number(l.vgv || 0), 0)
  const comR = vgvR * 0.05
  const recR = t == null ? null : t * vgvR
  const margem = recR == null ? null : recR - comR - recR * IMPOSTO
  const margemSeAssessor = recR == null ? null : recR - vgvR * 0.02 - recR * IMPOSTO
  linhas.push({ data: f.data, nome: f.nome, lotes: rs.length, vgvR, comR, t, recR, margem, margemSeAssessor })
}
let tv = 0, tc = 0, tr = 0, tm = 0, tma = 0, semReceita = 0
for (const l of linhas) {
  tv += l.vgvR; tc += l.comR
  if (l.recR == null) { semReceita += l.vgvR; continue }
  tr += l.recR; tm += l.margem; tma += l.margemSeAssessor
  console.log(`  ${l.data} ${String(l.nome).slice(0, 40).padEnd(40)} ${l.lotes}L · VGV ${brl(l.vgvR).padStart(12)} · acordo ${pct(l.t).padStart(7)} · receita ${brl(l.recR).padStart(10)} · Rusa ${brl(l.comR).padStart(10)} · margem ${brl(l.margem).padStart(11)}`)
}
console.log(`\n  COM RECEITA LANÇADA: VGV ${brl(tv - semReceita)} · receita ${brl(tr)} · comissão Rusa ${brl(tc - semReceita * 0.05)} · imposto ${brl(tr * IMPOSTO)}`)
console.log(`  MARGEM DA BULA nesses lotes: ${brl(tm)}   |   se os mesmos lotes fossem de assessor (2%): ${brl(tma)}   |   diferença: ${brl(tma - tm)}`)
console.log(`  (sem receita lançada ainda: VGV ${brl(semReceita)} — agosto em aberto)`)

// ── 4) O que já saiu de caixa para ele em 2026 ───────────────────────────────
const { data: cps } = await sb.from('erp_contas_pagar').select('descricao,valor,status,vencimento,data_pagamento').ilike('descricao', '%RUSA%')
console.log('\n=== 4) CAIXA PARA O RUSA EM 2026 ===')
let pago = 0
for (const c of (cps || []).filter((x) => x.status === 'pago').sort((a, b) => String(a.data_pagamento).localeCompare(String(b.data_pagamento)))) {
  pago += Number(c.valor)
  console.log(`  pago ${c.data_pagamento} (venc ${c.vencimento}) ${brl(c.valor).padStart(11)}  ${String(c.descricao).slice(0, 62)}`)
}
console.log(`  TOTAL PAGO A ELE EM 2026: ${brl(pago)}`)

// ── 5) Prazo: quando a Bula recebe × quando paga o Rusa ──────────────────────
const { data: crs } = await sb.from('erp_contas_receber').select('descricao,valor,vencimento,data_recebimento,status,fechamento_id').gte('vencimento', '2026-06-01').limit(2000)
const comFech = (crs || []).filter((c) => c.fechamento_id)
const atraso = []
for (const c of comFech) {
  const f = (fechs || []).find((x) => x.id === c.fechamento_id)
  if (!f) continue
  const dias = (new Date(c.vencimento) - new Date(f.data)) / 86400000
  atraso.push({ leilao: f.data, venc: c.vencimento, dias, receb: c.data_recebimento, status: c.status, valor: Number(c.valor) })
}
const mediaDias = atraso.reduce((s, a) => s + a.dias, 0) / (atraso.length || 1)
const recebidos = atraso.filter((a) => a.data_recebimento || a.receb)
console.log('\n=== 5) PRAZO DE RECEBIMENTO DA BULA ===')
console.log(`  ${atraso.length} CR ligadas a fechamento · vencimento médio: leilão + ${mediaDias.toFixed(0)} dias`)
const realizados = atraso.filter((a) => a.receb)
if (realizados.length) {
  const d2 = realizados.reduce((s, a) => s + (new Date(a.receb) - new Date(a.leilao)) / 86400000, 0) / realizados.length
  console.log(`  ${realizados.length} já recebidas · recebimento real médio: leilão + ${d2.toFixed(0)} dias`)
}
console.log(`  em aberto: ${atraso.filter((a) => !a.receb).length} CR · ${brl(atraso.filter((a) => !a.receb).reduce((s, a) => s + a.valor, 0))}`)

mkdirSync(SC, { recursive: true })
writeFileSync(SC + '/rusa-analise.json', JSON.stringify({ dele, linhas, taxas, faixas, taxaPond, mediana, totais: { tv, tc, tr, tm, tma, semReceita, pago } }, null, 1))
console.log('\ndados salvos em ' + SC + '/rusa-analise.json')
