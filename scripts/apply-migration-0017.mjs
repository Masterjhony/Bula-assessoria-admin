// Aplica a migration 0017 (coluna crm_leads.tem_inscricao_estadual) no banco.
// Uso: node scripts/apply-migration-0017.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

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

const sql = readFileSync(join(root, 'supabase', 'migrations', '0017_crm_tem_inscricao_estadual.sql'), 'utf-8')

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
try {
  await client.query(sql)
  const { rows } = await client.query(
    `select column_name, data_type from information_schema.columns
       where table_name = 'crm_leads' and column_name = 'tem_inscricao_estadual'`,
  )
  console.log('Migration 0017 aplicada. Coluna:', rows)
} finally {
  await client.end()
}
