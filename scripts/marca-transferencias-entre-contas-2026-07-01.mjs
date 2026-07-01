// Marca como tipo='transferencia' (3º tipo, além de entrada/saida) os movimentos
// que são TRANSFERÊNCIA ENTRE CONTAS PRÓPRIAS — não são receita/despesa do
// negócio, só dinheiro andando entre as contas da Bula. 01/07/2026.
//   - contraparte = a própria BULA (CNPJ 34.791.630/0001-43): Bula<->Bula
//   - aplicação / resgate financeiro (conta corrente <-> investimento)
// O saldo por conta é armazenado (saldo_atual), então isso não altera saldo;
// só tira essas movimentações do resultado de entradas/saídas. A categoria é
// mantida (preserva a direção: Aplicação/Saída = saiu; Resgate/Entrada = entrou).
//
// Uso: node scripts/marca-transferencias-entre-contas-2026-07-01.mjs        (DRY)
//      APPLY=1 node scripts/marca-transferencias-entre-contas-2026-07-01.mjs

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
const CAT_TRANSF = ['Aplicacao Financeira', 'Resgate Aplicacao Financeira', 'Transferencias Internas - Saida', 'Transferencias Internas - Entrada']

const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('id,tipo,valor,descricao,pessoa:erp_pessoas!pessoa_id(documento),categoria:erp_categorias!categoria_id(nome)')
  .neq('tipo', 'transferencia')

function ehTransf(m) {
  const doc = (m.pessoa && m.pessoa.documento || '').replace(/\D/g, '')
  if (doc === '34791630000143') return true
  if (m.categoria && CAT_TRANSF.includes(m.categoria.nome)) return true
  if (/RESG\.APLIC|APLICACAO FINANCEIRA/i.test(m.descricao || '')) return true
  return false
}

let n = 0, tot = 0
for (const m of movs) {
  if (!ehTransf(m)) continue
  n++; tot += Number(m.valor)
  if (APPLY) await sb.from('erp_movimentos_bancarios').update({ tipo: 'transferencia', updated_at: new Date().toISOString() }).eq('id', m.id)
}
console.log(`\n${APPLY ? '=== APLICADO ===' : '=== DRY RUN ==='}`)
console.log(`Movimentos marcados como transferência entre contas: ${n} · volume ${brl(tot)}`)
console.log('(não altera saldo das contas; sai do cálculo de entradas/saídas)')
