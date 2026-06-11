// Contagem de leads gerados HOJE (fuso Brasília), por origem.
// Uso: node scripts/leads-hoje.mjs
import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
import pg from 'pg'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()

const bySource = await db.query(`
  select coalesce(source,'(sem source)') as origem, count(*)::int as n
  from crm_leads
  where (coalesce(data_entrada, created_at) at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
  group by 1 order by 2 desc`)

console.log('— CRM (hoje, fuso Brasília) —')
let total = 0
bySource.rows.forEach(x => { total += x.n; console.log(`  ${x.origem}: ${x.n}`) })
console.log(`  TOTAL no CRM: ${total}`)

const byHour = await db.query(`
  select extract(hour from (coalesce(data_entrada, created_at) at time zone 'America/Sao_Paulo'))::int as hora, count(*)::int as n
  from crm_leads
  where (coalesce(data_entrada, created_at) at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
    and source = 'jmp-landing'
  group by 1 order by 1`)
console.log('\n— Landing por hora —')
console.log('  ' + byHour.rows.map(x => `${String(x.hora).padStart(2, '0')}h:${x.n}`).join('  '))

const mql = await db.query(`
  select count(*)::int as n from crm_leads
  where (coalesce(data_entrada, created_at) at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
    and is_mql = true`)
console.log(`\n— MQLs de hoje (≥100 cab. + I.E.): ${mql.rows[0].n} —`)
await db.end()

// Meta lead forms: vivem só na planilha (coluna T = created_time)
const creds = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
})
const sheets = google.sheets({ version: 'v4', auth })
const res = await sheets.spreadsheets.values.get({ spreadsheetId: '1caFGyHlqF-fic0y5zsnO1GRty4J61upMcjVI8e8V5F8', range: 'Leads JMP!S2:T' })
const rows = res.data.values ?? []
const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const metaToday = rows.filter(r => {
    const t = new Date(String(r[1] || ''))
    return !isNaN(t) && t.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) === today
}).length
console.log(`\n— Meta lead forms (planilha, hoje): ${metaToday} —`)
console.log(`\n>>> TOTAL GERADO HOJE: ${total + metaToday} (${total} CRM + ${metaToday} Meta forms)`)
