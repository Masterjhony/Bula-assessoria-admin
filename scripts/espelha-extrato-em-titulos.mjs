/**
 * ESPELHA O EXTRATO CONCILIADO EM TÍTULOS (18/08/2026).
 *
 * PROBLEMA (diagnóstico de 18/08): o ERP só passou a ser usado como contas a
 * pagar/receber em julho/2026. De janeiro a junho quase tudo foi lançado
 * direto na conciliação, sem título:
 *
 *   mês     títulos CP    saídas no extrato   saídas com título
 *   jan          0              93                   0
 *   fev          0             110                   1
 *   mar          4              92                   1
 *   abr         11              58                   0
 *   mai          8              70                   3
 *   jun         10              81                   5
 *   jul         51              53                  22
 *   ago         72              37                  16
 *
 * Resultado: 81% das saídas (R$ 1,31 mi) e R$ 1,24 mi de entradas nunca
 * apareceram em Contas a Pagar/Receber. O painel mostrava "Pago R$ 663 mil ·
 * 63% do total" quando de fato saíram R$ 1,63 mi — número enganoso, e a DRE
 * por competência não tinha histórico nenhum.
 *
 * CORREÇÃO: para cada movimento bancário conciliado SEM título, cria o título
 * correspondente já baixado (pago/recebido), com vencimento = data do
 * movimento, e vincula os dois. O extrato continua sendo a verdade; o CP/CR
 * passa a ser o espelho completo dele + o previsto à frente.
 *
 * Fora do espelho (não são obrigação/direito):
 *   · transferências internas e aplicação/resgate;
 *   · movimentos que já têm título vinculado.
 *
 * Todo título criado leva a tag 'espelho-extrato' e o id do movimento na
 * observação — dá para auditar e reverter em bloco.
 *
 * Dry-run por padrão; --apply grava.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
const REVERTER = process.argv.includes('--reverter')

const r2 = n => Math.round(Number(n || 0) * 100) / 100
const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const dia = d => String(d || '').slice(0, 10)
const TAG = 'espelho-extrato'

async function all(table, cols, filtro = q => q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filtro(sb.from(table).select(cols)).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

/* ── reversão (se preciso desfazer) ───────────────────────────────────────── */
if (REVERTER) {
  const cps = await all('erp_contas_pagar', 'id,tags')
  const crs = await all('erp_contas_receber', 'id,tags')
  const alvoCp = cps.filter(t => Array.isArray(t.tags) && t.tags.includes(TAG)).map(t => t.id)
  const alvoCr = crs.filter(t => Array.isArray(t.tags) && t.tags.includes(TAG)).map(t => t.id)
  console.log(`Reverter: ${alvoCp.length} CP + ${alvoCr.length} CR criados pelo espelho`)
  if (APPLY) {
    for (let i = 0; i < alvoCp.length; i += 100) {
      await sb.from('erp_movimentos_bancarios').update({ conta_pagar_id: null }).in('conta_pagar_id', alvoCp.slice(i, i + 100))
      await sb.from('erp_contas_pagar').delete().in('id', alvoCp.slice(i, i + 100))
    }
    for (let i = 0; i < alvoCr.length; i += 100) {
      await sb.from('erp_movimentos_bancarios').update({ conta_receber_id: null }).in('conta_receber_id', alvoCr.slice(i, i + 100))
      await sb.from('erp_contas_receber').delete().in('id', alvoCr.slice(i, i + 100))
    }
    console.log('REVERTIDO.')
  } else console.log('DRY-RUN da reversão. Use --apply.')
  process.exit(0)
}

/* ── espelhamento ─────────────────────────────────────────────────────────── */
const cats = await all('erp_categorias', 'id,nome')
const catNome = new Map(cats.map(c => [c.id, c.nome]))
const ehTransferencia = id => /transfer/i.test(catNome.get(id) || '')
const ehAplicacao = id => /aplica|resgate/i.test(catNome.get(id) || '')

const movs = await all('erp_movimentos_bancarios',
  'id,data,tipo,valor,categoria_id,centro_custo_id,descricao,conta_pagar_id,conta_receber_id,conta_bancaria_id,pessoa_id')

const saidas = movs.filter(m => m.tipo === 'saida' && !m.conta_pagar_id && !ehTransferencia(m.categoria_id) && !ehAplicacao(m.categoria_id))
const entradas = movs.filter(m => m.tipo === 'entrada' && !m.conta_receber_id && !ehTransferencia(m.categoria_id) && !ehAplicacao(m.categoria_id))

const porMes = arr => {
  const m = new Map()
  for (const x of arr) {
    const k = dia(x.data).slice(0, 7)
    const cur = m.get(k) || { n: 0, v: 0 }
    cur.n++; cur.v += Number(x.valor || 0)
    m.set(k, cur)
  }
  return [...m.entries()].sort()
}

console.log('=== SAÍDAS sem título (viram Contas a Pagar já pagas) ===')
for (const [k, v] of porMes(saidas)) console.log(`  ${k}: ${String(v.n).padStart(3)} títulos · ${brl(v.v)}`)
console.log(`  TOTAL: ${saidas.length} títulos · ${brl(saidas.reduce((s, m) => s + Number(m.valor || 0), 0))}`)

console.log('\n=== ENTRADAS sem título (viram Contas a Receber já recebidas) ===')
for (const [k, v] of porMes(entradas)) console.log(`  ${k}: ${String(v.n).padStart(3)} títulos · ${brl(v.v)}`)
console.log(`  TOTAL: ${entradas.length} títulos · ${brl(entradas.reduce((s, m) => s + Number(m.valor || 0), 0))}`)

const descricaoDe = (m) => {
  const d = String(m.descricao || '').replace(/\s+/g, ' ').trim()
  return (d || `${m.tipo === 'saida' ? 'Pagamento' : 'Recebimento'} conciliado`).slice(0, 240)
}

if (!APPLY) {
  console.log('\nDRY-RUN. Use --apply para gravar. (--reverter --apply desfaz tudo)')
  process.exit(0)
}

let okCp = 0, okCr = 0, erros = 0
for (const m of saidas) {
  const payload = {
    descricao: descricaoDe(m),
    valor: r2(m.valor),
    vencimento: dia(m.data),
    emissao: dia(m.data),
    status: 'pago',
    valor_pago: r2(m.valor),
    data_pagamento: dia(m.data),
    categoria_id: m.categoria_id,
    centro_custo_id: m.centro_custo_id,
    fornecedor_id: m.pessoa_id,
    conta_bancaria_id: m.conta_bancaria_id,
    tags: [TAG],
    observacoes: `[18/08/2026] Título criado a partir do extrato conciliado (movimento ${m.id}) — o ERP só passou a registrar contas a pagar em jul/2026; este lançamento completa o histórico.`,
  }
  const { data, error } = await sb.from('erp_contas_pagar').insert(payload).select('id').single()
  if (error) { erros++; if (erros <= 5) console.error('  ERRO CP: ' + error.message); continue }
  await sb.from('erp_movimentos_bancarios').update({ conta_pagar_id: data.id }).eq('id', m.id)
  okCp++
  if (okCp % 100 === 0) console.log(`  ... ${okCp} contas a pagar criadas`)
}
for (const m of entradas) {
  const payload = {
    descricao: descricaoDe(m),
    valor: r2(m.valor),
    vencimento: dia(m.data),
    emissao: dia(m.data),
    status: 'recebido',
    valor_recebido: r2(m.valor),
    data_recebimento: dia(m.data),
    categoria_id: m.categoria_id,
    centro_custo_id: m.centro_custo_id,
    cliente_id: m.pessoa_id,
    conta_bancaria_id: m.conta_bancaria_id,
    observacoes: `[18/08/2026] Título criado a partir do extrato conciliado (movimento ${m.id}) — completa o histórico anterior ao uso do módulo.`,
  }
  const { data, error } = await sb.from('erp_contas_receber').insert(payload).select('id').single()
  if (error) { erros++; if (erros <= 5) console.error('  ERRO CR: ' + error.message); continue }
  await sb.from('erp_movimentos_bancarios').update({ conta_receber_id: data.id }).eq('id', m.id)
  okCr++
  if (okCr % 50 === 0) console.log(`  ... ${okCr} contas a receber criadas`)
}
console.log(`\n-> ${okCp} contas a pagar e ${okCr} contas a receber criadas${erros ? ` · ${erros} erros` : ''}`)
console.log('APLICADO.')
