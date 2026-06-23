// Aplica as migrations 0036 e 0037 diretamente no Postgres do Supabase usando
// DATABASE_URL do .env.local. Idempotente (CREATE ... IF NOT EXISTS / DROP POLICY
// IF EXISTS / UPDATE), então rodar mais de uma vez é seguro.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function loadEnv() {
  const raw = readFileSync(join(root, '.env.local'), 'utf8')
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const env = loadEnv()
const connectionString = env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL ausente no .env.local')

const files = [
  'supabase/migrations/0036_crm_info_captured_lost_stages.sql',
  'supabase/migrations/0037_crm_lead_documentos.sql',
]

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })

const run = async () => {
  await client.connect()
  console.log('Conectado ao Postgres do Supabase.')
  for (const rel of files) {
    const sql = readFileSync(join(root, rel), 'utf8')
    process.stdout.write(`\n→ Aplicando ${rel} ... `)
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('COMMIT')
      console.log('OK')
    } catch (e) {
      await client.query('ROLLBACK')
      console.log('FALHOU')
      throw e
    }
  }

  // Verificações pós-migração.
  const docs = await client.query(`SELECT to_regclass('public.crm_lead_documentos') AS t`)
  console.log('\nTabela crm_lead_documentos:', docs.rows[0].t ? 'criada ✓' : 'AUSENTE ✗')
  const perdidos = await client.query(`SELECT count(*)::int AS n FROM public.crm_leads WHERE status = 'PERDIDOS'`)
  console.log('Leads em PERDIDOS:', perdidos.rows[0].n)
  const cfg = await client.query(`SELECT jsonb_array_length(value->'stages') AS n FROM public.site_settings WHERE key='crm_config'`)
  console.log('Etapas em crm_config:', cfg.rows[0]?.n ?? '(sem config salva)')
}

run()
  .then(() => client.end())
  .then(() => console.log('\nMigrations aplicadas com sucesso.'))
  .catch(async (e) => {
    console.error('\nERRO:', e.message)
    try { await client.end() } catch {}
    process.exit(1)
  })
