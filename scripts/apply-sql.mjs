// Aplica UM arquivo SQL no banco (DATABASE_URL do .env.local), em transação.
//
// Diferente de apply-migration.mjs (que roda TODAS as migrations, só serve para
// banco novo), este aplica um único arquivo — seguro para migrations
// incrementais idempotentes em produção.
//
// Uso:
//   node scripts/apply-sql.mjs supabase/migrations/0030_whatsapp_gateway.sql
//   node scripts/apply-sql.mjs 0030          (resolve por prefixo do nome)

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const migrationsDir = join(root, 'supabase', 'migrations')

const env = Object.fromEntries(
    readFileSync(join(root, '.env.local'), 'utf-8')
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

function resolveFile(arg) {
    if (!arg) {
        console.error('Informe o arquivo SQL (ou prefixo numérico da migration).')
        process.exit(1)
    }
    try {
        readFileSync(arg)
        return arg
    } catch {
        /* tenta resolver por prefixo abaixo */
    }
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
    const hit = files.find((f) => f === arg || f.startsWith(arg) || basename(f, '.sql') === arg)
    if (!hit) {
        console.error(`Não achei migration para "${arg}" em ${migrationsDir}`)
        process.exit(1)
    }
    return join(migrationsDir, hit)
}

const file = resolveFile(process.argv[2])
const sql = readFileSync(file, 'utf-8')
console.log(`Aplicando ${basename(file)} ...`)

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    console.log(`OK — ${basename(file)} aplicada.`)
} catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(`ERRO — rollback. ${e.message}`)
    process.exitCode = 1
} finally {
    await client.end()
}
