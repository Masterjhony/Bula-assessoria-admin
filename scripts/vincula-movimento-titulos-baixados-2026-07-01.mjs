// Coerência: títulos já "recebido/pago" mas SEM movimento bancário vinculado.
// Anexa o movimento correspondente (Sicoob OU Sicredi) por valor exato + data
// próxima da data de recebimento/pagamento (janela ±4d), 1:1 e sem ambiguidade.
// Não muda o status do título (já baixado) — só preenche a evidência bancária
// (conta_receber_id/conta_pagar_id no movimento + conciliado). 01/07/2026.
//
// Também corrige 2 tipos de incoerência:
//   - movimento com título FK mas status != 'conciliado' -> 'conciliado'.
//
// Uso: node scripts/vincula-movimento-titulos-baixados-2026-07-01.mjs        (DRY)
//      APPLY=1 node scripts/vincula-movimento-titulos-baixados-2026-07-01.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.env.APPLY === '1'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const cent = (n) => Math.round(Number(n || 0) * 100)
const days = (a, b) => (!a || !b) ? 9999 : Math.abs((+new Date(a + 'T00:00:00Z') - +new Date(b + 'T00:00:00Z')) / 86400000)

const [{ data: cr }, { data: cp }, { data: movs }, { data: contas }] = await Promise.all([
  sb.from('erp_contas_receber').select('id,descricao,valor,status,data_recebimento').eq('status', 'recebido'),
  sb.from('erp_contas_pagar').select('id,descricao,valor,status,data_pagamento').eq('status', 'pago'),
  sb.from('erp_movimentos_bancarios').select('id,data,valor,tipo,descricao,conta_bancaria_id,conta_receber_id,conta_pagar_id,status_conciliacao,conciliado'),
  sb.from('erp_contas_bancarias').select('id,nome'),
])
const bnome = new Map((contas || []).map((c) => [c.id, (c.nome || '').split(' ')[0]]))
const crLinked = new Set(movs.filter((m) => m.conta_receber_id).map((m) => m.conta_receber_id))
const cpLinked = new Set(movs.filter((m) => m.conta_pagar_id).map((m) => m.conta_pagar_id))
const entLivres = movs.filter((m) => m.tipo === 'entrada' && !m.conta_receber_id && !m.conta_pagar_id)
const saiLivres = movs.filter((m) => m.tipo === 'saida' && !m.conta_pagar_id && !m.conta_receber_id)

function match(titulos, pool, linked, refField) {
  const usados = new Set(), achados = [], semMov = []
  for (const t of titulos) {
    if (linked.has(t.id)) continue // já tem movimento
    const cands = pool.filter((m) => !usados.has(m.id) && cent(m.valor) === cent(t.valor) && days(m.data, t[refField]) <= 4)
      .sort((a, b) => days(a.data, t[refField]) - days(b.data, t[refField]))
    // exige unicidade: só 1 candidato a <=4d (ou o mais próximo bem melhor)
    if (cands.length === 1 || (cands.length > 1 && days(cands[0].data, t[refField]) + 2 <= days(cands[1].data, t[refField]))) {
      achados.push({ t, m: cands[0] }); usados.add(cands[0].id)
    } else semMov.push(t)
  }
  return { achados, semMov }
}

const R = match(cr, entLivres, crLinked, 'data_recebimento')
const P = match(cp, saiLivres, cpLinked, 'data_pagamento')

console.log(`\n=== ${APPLY ? 'APLICADO' : 'DRY RUN'} — anexar movimento a título já baixado ===`)
console.log(`CR recebido sem movimento: ${cr.filter(t=>!crLinked.has(t.id)).length} | vinculáveis agora: ${R.achados.length}`)
for (const a of R.achados) console.log(`  [${bnome.get(a.m.conta_bancaria_id)}] ${brl(a.t.valor).padStart(12)} ${a.m.data} | ${(a.t.descricao||'').slice(0,34)} <> ${(a.m.descricao||'').slice(0,28)}`)
console.log(`CP pago sem movimento: ${cp.filter(t=>!cpLinked.has(t.id)).length} | vinculáveis agora: ${P.achados.length}`)
for (const a of P.achados) console.log(`  [${bnome.get(a.m.conta_bancaria_id)}] ${brl(a.t.valor).padStart(12)} ${a.m.data} | ${(a.t.descricao||'').slice(0,34)} <> ${(a.m.descricao||'').slice(0,28)}`)

// incoerência: movimento com título FK mas status != conciliado
const incoer = movs.filter((m) => (m.conta_receber_id || m.conta_pagar_id) && m.status_conciliacao !== 'conciliado')
console.log(`\nMovimentos com título FK mas status != conciliado: ${incoer.length} (corrigir p/ conciliado)`)

if (APPLY) {
  for (const a of R.achados) await sb.from('erp_movimentos_bancarios').update({ conta_receber_id: a.t.id, conciliado: true, status_conciliacao: 'conciliado', updated_at: new Date().toISOString() }).eq('id', a.m.id)
  for (const a of P.achados) await sb.from('erp_movimentos_bancarios').update({ conta_pagar_id: a.t.id, conciliado: true, status_conciliacao: 'conciliado', updated_at: new Date().toISOString() }).eq('id', a.m.id)
  for (const m of incoer) await sb.from('erp_movimentos_bancarios').update({ status_conciliacao: 'conciliado', conciliado: true, updated_at: new Date().toISOString() }).eq('id', m.id)
  console.log(`\nGravado: ${R.achados.length} CR + ${P.achados.length} CP vinculados, ${incoer.length} status corrigidos.`)
}
