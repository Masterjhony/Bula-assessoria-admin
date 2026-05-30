// Registra o acordo comercial do 2º Leilão LS Now (LS Agropecuária): 3% do
// faturamento total. Lado ERP (bula_acordos_criadores) + nota da agenda
// (cronograma_leiloes.comissao). Pela fronteira de dados, o acordo NÃO vai
// no fechamento — só a nota textual lá foi ajustada para 3%.
//
// Idempotente. Uso: node scripts/set-acordo-ls-now.mjs

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
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── 1. Acordo no ERP (bula_acordos_criadores) ────────────────
const ACORDO = {
  contraparte: 'LS Agropecuária',
  tipo: 'criador',
  pct_faturamento: 0.03,
  pct_venda_cobertura: null,
  descricao: '3% do faturamento total do leilão (2º Leilão LS Now)',
}
{
  const { data: ex, error: selErr } = await supabase
    .from('bula_acordos_criadores')
    .select('id')
    .ilike('contraparte', ACORDO.contraparte)
    .maybeSingle()
  if (selErr) { console.error('SELECT acordo:', selErr.message); process.exit(1) }
  if (ex) {
    const { error } = await supabase.from('bula_acordos_criadores')
      .update({ ...ACORDO, updated_at: new Date().toISOString() }).eq('id', ex.id)
    if (error) { console.error('UPDATE acordo:', error.message); process.exit(1) }
    console.log(`acordo: atualizado (id=${ex.id}) → LS Agropecuária 3%`)
  } else {
    const { data: ins, error } = await supabase.from('bula_acordos_criadores')
      .insert(ACORDO).select('id').single()
    if (error) { console.error('INSERT acordo:', error.message); process.exit(1) }
    console.log(`acordo: criado (id=${ins.id}) → LS Agropecuária 3%`)
  }
}

// ── 2. Nota da agenda (cronograma_leiloes.comissao) ──────────
// Atualiza as duas pernas do LS Now (touros 30/05 + collection 31/05).
{
  const { data: rows, error } = await supabase
    .from('cronograma_leiloes')
    .select('id, data, nome, comissao')
    .ilike('nome', '%LS NOW%')
  const { data: rows2 } = await supabase
    .from('cronograma_leiloes')
    .select('id, data, nome, comissao')
    .ilike('nome', '%LS COLLECTION%')
  if (error) { console.error('SELECT cronograma:', error.message); process.exit(1) }
  const all = [...(rows || []), ...(rows2 || [])]
  for (const r of all) {
    const { error: e } = await supabase.from('cronograma_leiloes')
      .update({ comissao: '3% do faturamento' }).eq('id', r.id)
    if (e) { console.error(`UPDATE cronograma ${r.nome}:`, e.message); continue }
    console.log(`cronograma: ${r.data} | ${r.nome} → comissao "3% do faturamento"`)
  }
}

const receita = 0.03 * 1_197_000
console.log(`\nReceita Bula (ERP) = 3% × R$ 1.197.000 = R$ ${receita.toLocaleString('pt-BR')}`)
