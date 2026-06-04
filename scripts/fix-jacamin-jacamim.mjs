// Corrige a grafia "JACAMIN" -> "JACAMIM" nas tabelas que alimentam a agenda.
// Atinge bula_leiloes.nome e cronograma_leiloes.nome/criador.
//
// Uso:
//   node scripts/fix-jacamin-jacamim.mjs           (apenas lista o que seria alterado)
//   node scripts/fix-jacamin-jacamim.mjs --apply   (aplica as correcoes)

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const APPLY = process.argv.includes('--apply')
const fix = (v) => (typeof v === 'string' ? v.replace(/JACAMIN\b/gi, (m) => m.slice(0, -1) + (m.endsWith('n') ? 'm' : 'M')) : v)

async function run(table, fields) {
  const orFilter = fields.map((f) => `${f}.ilike.%JACAMIN%`).join(',')
  const { data, error } = await supabase.from(table).select(['id', ...fields].join(',')).or(orFilter)
  if (error) throw new Error(`SELECT ${table}: ${error.message}`)

  console.log(`\n[${table}] ${data.length} linha(s) com "JACAMIN"`)
  for (const row of data) {
    const patch = {}
    for (const f of fields) {
      const next = fix(row[f])
      if (next !== row[f]) patch[f] = next
    }
    if (Object.keys(patch).length === 0) continue
    console.log(`  id=${row.id}`)
    for (const [f, val] of Object.entries(patch)) console.log(`    ${f}: ${JSON.stringify(row[f])} -> ${JSON.stringify(val)}`)
    if (APPLY) {
      const { error: upErr } = await supabase.from(table).update(patch).eq('id', row.id)
      if (upErr) throw new Error(`UPDATE ${table} id=${row.id}: ${upErr.message}`)
    }
  }
}

await run('bula_leiloes', ['nome'])
await run('cronograma_leiloes', ['nome', 'criador'])

console.log(APPLY ? '\nCorrecoes aplicadas.' : '\n(dry-run) Rode com --apply para gravar.')
