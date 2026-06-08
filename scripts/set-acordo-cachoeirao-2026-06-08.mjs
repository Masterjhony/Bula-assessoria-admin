// (2026-06-08) Acordo do "Destaques da Safra Nelore Cachoeirão" (03/06):
// 1% do faturamento total do leilão (confirmado pelo chefe).
//   Receita Bula = 1% × R$ 1.128.900 = R$ 11.289,00.
// Comissão por assessor segue pendente (regra própria, não % do VGV).
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const { data: row } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,faturamento_total_leilao,vgv_total,comissao_assessoria')
  .eq('data', '2026-06-03').ilike('nome', '%cachoeir%').maybeSingle()
if (!row) { console.error('Fechamento Cachoeirao (03/06) nao encontrado.'); process.exit(1) }

const receita = Math.round(0.01 * Number(row.faturamento_total_leilao) * 100) / 100
const comissao = Number(row.comissao_assessoria) // null se ainda nao lancada
const patch = {
  acordo_pct_faturamento: 0.01,
  acordo_pct_venda_cobertura: null,
  acordo_descricao: '1% do faturamento total do leilao',
  receita_bula: receita,
  // sobra_bruta fica pendente ate a comissao por assessor ser lancada
  sobra_bruta: Number.isFinite(comissao) ? Math.round((receita - comissao) * 100) / 100 : null,
  updated_at: new Date().toISOString(),
}
const { error } = await sb.from('bula_leilao_fechamento').update(patch).eq('id', row.id)
if (error) { console.error('UPDATE:', error.message); process.exit(1) }
console.log(`ok ${row.nome}`)
console.log(`   acordo: 1% do faturamento | faturamento ${brl(row.faturamento_total_leilao)}`)
console.log(`   receita Bula = ${brl(receita)} | comissao ${Number.isFinite(comissao) ? brl(comissao) : 'PENDENTE'} | sobra ${patch.sobra_bruta == null ? 'PENDENTE' : brl(patch.sobra_bruta)}`)
