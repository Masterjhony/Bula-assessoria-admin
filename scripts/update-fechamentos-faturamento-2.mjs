// Atualiza faturamento_total_leilao de mais 3 fechamentos:
//   Matrizes de Vanguardia  → R$ 1.306.080
//   IPB Prime               → R$ 854.700
//   Pérolas do Cachoeirão   → R$ 1.340.000
//
// Idempotente: busca por nome (ilike) e atualiza só se houver match único.

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
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const updates = [
  { match: '%vanguardia%',  faturamento_total_leilao: 1_306_080 },
  { match: '%ipb prime%',   faturamento_total_leilao:   854_700 },
  { match: '%cachoeir%',    faturamento_total_leilao: 1_340_000 },
]

for (const u of updates) {
  const { data: rows, error } = await supabase
    .from('bula_leilao_fechamento')
    .select('id, nome, data, vgv_total, faturamento_total_leilao')
    .ilike('nome', u.match)
    .order('data', { ascending: false })
  if (error) { console.error(`SELECT "${u.match}":`, error.message); continue }
  if (!rows || rows.length === 0) { console.warn(`Não encontrado: ${u.match}`); continue }
  if (rows.length > 1) {
    console.warn(`Múltiplos resultados para ${u.match} — verifique:`)
    for (const r of rows) console.warn(`   ${r.data} | ${r.nome}`)
    continue
  }
  const row = rows[0]
  const { error: updErr } = await supabase
    .from('bula_leilao_fechamento')
    .update({ faturamento_total_leilao: u.faturamento_total_leilao, updated_at: new Date().toISOString() })
    .eq('id', row.id)
  if (updErr) { console.error(`UPDATE id=${row.id}:`, updErr.message); continue }
  const cob = (row.vgv_total && u.faturamento_total_leilao)
    ? `${((row.vgv_total / u.faturamento_total_leilao) * 100).toFixed(2)}%`
    : '—'
  console.log(`OK "${row.nome}" (${row.data}) → fat=R$ ${u.faturamento_total_leilao.toLocaleString('pt-BR')} | vgv=R$ ${Number(row.vgv_total).toLocaleString('pt-BR')} | cob=${cob}`)
}
