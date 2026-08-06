// Aplica a migration 0064 (whatsapp_agente_pendencias) e mostra os telefones
// de crm_config.responsaveis para montar a allowlist do agente interno.
// Uso: node scripts/aplica-agente-whatsapp-2026-08-06.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await client.connect()

const ddl = readFileSync(join(root, 'supabase/migrations/0064_whatsapp_agente.sql'), 'utf-8')
await client.query(ddl)
console.log('migration 0064 aplicada ✔')

const { rows } = await client.query(
    "SELECT value->'responsaveis' AS responsaveis FROM site_settings WHERE key = 'crm_config'",
)
console.log('responsaveis (crm_config):')
for (const r of rows[0]?.responsaveis ?? []) {
    console.log(` - ${r.name ?? '?'}: ${r.whatsapp ?? '(sem whatsapp)'}`)
}

const { rows: cfg } = await client.query(
    "SELECT value FROM site_settings WHERE key = 'whatsapp_agente'",
)
console.log('config whatsapp_agente atual:', cfg[0]?.value ?? '(não existe ainda)')

await client.end()
