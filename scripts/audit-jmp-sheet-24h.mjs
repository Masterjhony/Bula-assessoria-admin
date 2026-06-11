// Auditoria: a planilha "Leads JMP" perdeu algum lead nas últimas 24h?
// Landing: CRM é o livro-razão (rota grava CRM → depois planilha best-effort).
//   → lead no CRM e ausente na planilha = planilha falhou naquele momento.
// Meta: lista as chegadas na planilha (timestamps) para análise de continuidade.
// Somente LEITURA. Uso: node scripts/audit-jmp-sheet-24h.mjs
import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
import pg from 'pg'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const { rows: cfg } = await db.query("select value from jmp_config where key='sheets'")
const spreadsheetId = cfg[0].value.spreadsheetId

// ── 1. Leads da landing nas últimas 24h (livro-razão = CRM) ──
const { rows: crmLeads } = await db.query(`
    select id, nome, email, celular, telefone, created_at, data_entrada
    from crm_leads
    where source = 'jmp-landing'
      and coalesce(data_entrada, created_at) >= now() - interval '24 hours'
    order by coalesce(data_entrada, created_at) asc
`)
await db.end()

const creds = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
})
const sheets = google.sheets({ version: 'v4', auth })
const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Leads JMP!A2:AN' })
const rows = (res.data.values ?? [])

const digits = (v) => String(v || '').replace(/\D/g, '').replace(/^55/, '')
const sheetIds = new Set(), sheetEmails = new Set(), sheetPhones = new Set()
for (const r of rows) {
    const leadId = String(r[10] || '').trim()       // K Lead ID
    const email = String(r[3] || '').trim().toLowerCase() // D
    const fone = digits(r[4])                        // E
    if (leadId) sheetIds.add(leadId)
    if (email) sheetEmails.add(email)
    if (fone) sheetPhones.add(fone)
}

console.log(`Leads da LANDING no CRM (últimas 24h): ${crmLeads.length}`)
const missing = []
for (const l of crmLeads) {
    const inSheet = sheetIds.has(l.id)
        || (l.email && sheetEmails.has(String(l.email).toLowerCase()))
        || (digits(l.celular || l.telefone) && sheetPhones.has(digits(l.celular || l.telefone)))
    const dt = new Date(l.data_entrada || l.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    if (!inSheet) missing.push({ ...l, dt })
    console.log(`  ${inSheet ? '✓' : '✗ FALTA NA PLANILHA'} ${dt} — ${l.nome} (${l.email || l.celular || l.telefone || 's/ contato'})`)
}

console.log(`\nResultado landing: ${missing.length === 0 ? 'NENHUM lead perdido — planilha recebeu todos ✓' : missing.length + ' lead(s) do CRM ausente(s) na planilha ✗'}`)

// ── 2. Chegadas do META na planilha nas últimas 24h ──
const cutoff = Date.now() - 24 * 3600 * 1000
const metaArrivals = []
for (const r of rows) {
    const metaId = String(r[18] || '').trim()        // S id
    const created = String(r[19] || '').trim()       // T created_time
    if (!metaId || !created) continue
    const t = new Date(created)
    if (!isNaN(t) && t.getTime() >= cutoff) {
        metaArrivals.push({ t, nome: String(r[2] || '').trim(), plataforma: String(r[29] || r[12] || '').trim() })
    }
}
metaArrivals.sort((a, b) => a.t - b.t)
console.log(`\nLeads do META na planilha (últimas 24h): ${metaArrivals.length}`)
let prev = null
for (const m of metaArrivals) {
    const gap = prev ? Math.round((m.t - prev) / 60000) : null
    console.log(`  ${m.t.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — ${m.nome} [${m.plataforma}]${gap != null ? ` (+${gap} min)` : ''}`)
    prev = m.t
}
console.log('\nObs.: a completude do lado do Meta só é verificável no Gerenciador de Anúncios')
console.log('(Central de Leads) — a planilha registra o que o conector entregou.')
