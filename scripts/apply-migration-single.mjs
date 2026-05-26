// Aplica UMA migration específica passada via argumento.
// Uso: node scripts/apply-migration-single.mjs 0004_leiloes.sql

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const arg = process.argv[2]
if (!arg) {
  console.error('Uso: node scripts/apply-migration-single.mjs <nome.sql>')
  process.exit(1)
}

const envFile = join(root, '.env.local')
const env = Object.fromEntries(
  readFileSync(envFile, 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const url = env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL ausente em .env.local')
  process.exit(1)
}

const migrationsDir = join(root, 'supabase', 'migrations')
const available = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
if (!available.includes(arg)) {
  console.error(`Migration "${arg}" não encontrada em supabase/migrations/`)
  console.error('Disponíveis:', available.join(', '))
  process.exit(1)
}

const sql = readFileSync(join(migrationsDir, arg), 'utf-8')
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
console.log(`Conectado. Aplicando ${arg}...`)

try {
  await client.query(sql)
  console.log(`OK: ${arg}`)
} catch (e) {
  console.error(`Falha em ${arg}:`, e.message)
  await client.end()
  process.exit(1)
}

const { rows: tables } = await client.query(
  "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
)
console.log('\nTabelas em public após aplicar:')
console.log(tables.map((r) => '  - ' + r.table_name).join('\n'))

await client.end()
console.log('\nDone.')
