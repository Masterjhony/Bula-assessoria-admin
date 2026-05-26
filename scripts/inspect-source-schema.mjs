// Inspeciona o schema das tabelas no Supabase do fórmula
// para comparar com o schema do web-bula.
// Uso: node scripts/inspect-source-schema.mjs <tabela1> <tabela2> ...

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const formulaEnvPath = resolve(import.meta.dirname, '..', '..', 'formula_boi', 'formula_boi', '.env.local')

const env = Object.fromEntries(
  readFileSync(formulaEnvPath, 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const tables = process.argv.slice(2)
if (tables.length === 0) {
  console.error('Uso: node scripts/inspect-source-schema.mjs <tabela1> [<tabela2> ...]')
  process.exit(1)
}

for (const t of tables) {
  const { data, error } = await sb.from(t).select('*').limit(1)
  if (error) {
    console.log(`\n${t}: ERRO ${error.message}`)
    continue
  }
  if (!data || data.length === 0) {
    console.log(`\n${t}: vazia, sem amostra de colunas`)
    continue
  }
  console.log(`\n${t} (${Object.keys(data[0]).length} colunas):`)
  for (const [k, v] of Object.entries(data[0])) {
    const t = v === null ? 'null' : typeof v
    console.log(`  - ${k.padEnd(35)} ${t}`)
  }
}
