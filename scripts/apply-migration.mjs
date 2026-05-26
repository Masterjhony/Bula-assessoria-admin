import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

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
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
console.log('Migrations encontradas:', files)

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
console.log('Conectado.')

for (const f of files) {
  const sql = readFileSync(join(migrationsDir, f), 'utf-8')
  console.log(`\nAplicando ${f}...`)
  try {
    await client.query(sql)
    console.log(`OK: ${f}`)
  } catch (e) {
    console.error(`Falha em ${f}:`, e.message)
    await client.end()
    process.exit(1)
  }
}

const { rows: tables } = await client.query(
  "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
)
console.log('\nTabelas em public:', tables.map((r) => r.table_name).join(', '))

const { rows: funis } = await client.query('select slug, nome from public.crm_funis')
console.log('Funis seed:', funis)

await client.end()
console.log('\nDone.')
