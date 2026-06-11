// Reimporta para a planilha "Leads JMP" os leads da landing que estão no CRM
// mas não chegaram à planilha (perdidos durante a queda da service account).
// Também remove o lead-sonda de diagnóstico do CRM e da fila de e-mails.
// Uso: node scripts/backfill-jmp-sheet.mjs [--apply]
import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const PROBE_EMAIL = 'sonda-claude-planilha@example.com'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const { rows: cfg } = await db.query("select value from jmp_config where key='sheets'")
const spreadsheetId = cfg[0].value.spreadsheetId

const creds = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })

// leads da landing (últimas 36h, margem) no CRM
const { rows: crmLeads } = await db.query(`
    select id, nome, email, celular, telefone, estado, cidade, momento_pecuaria,
           quantidade_animais, interesse, o_que_busca, tem_inscricao_estadual,
           created_at, data_entrada
    from crm_leads
    where source = 'jmp-landing'
      and coalesce(data_entrada, created_at) >= now() - interval '36 hours'
    order by coalesce(data_entrada, created_at) asc
`)

// já presentes na planilha (Lead ID / email / fone)
const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Leads JMP!A2:AN' })
const rows = res.data.values ?? []
const digits = (v) => String(v || '').replace(/\D/g, '').replace(/^55/, '')
const sheetIds = new Set(), sheetEmails = new Set(), sheetPhones = new Set()
for (const r of rows) {
    if (String(r[10] || '').trim()) sheetIds.add(String(r[10]).trim())
    if (String(r[3] || '').trim()) sheetEmails.add(String(r[3]).trim().toLowerCase())
    if (digits(r[4])) sheetPhones.add(digits(r[4]))
}

const fmt = (d) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(d))

const missing = crmLeads.filter(l => {
    if ((l.email || '').toLowerCase() === PROBE_EMAIL) return false
    return !(sheetIds.has(l.id)
        || (l.email && sheetEmails.has(l.email.toLowerCase()))
        || (digits(l.celular || l.telefone) && sheetPhones.has(digits(l.celular || l.telefone))))
})

console.log(`Leads a reimportar: ${missing.length}`)
const newRows = missing.map(l => {
    const out = Array.from({ length: 40 }, () => '')
    out[1] = fmt(l.data_entrada || l.created_at)        // B Data
    out[2] = l.nome || ''                               // C Nome
    out[3] = l.email || ''                              // D E-mail
    out[4] = l.celular || l.telefone || ''              // E WhatsApp
    out[5] = l.estado || ''                             // F UF
    out[6] = l.cidade || ''                             // G Cidade
    out[7] = l.momento_pecuaria || ''                   // H Momento
    out[8] = l.quantidade_animais || ''                 // I Cabeças
    out[9] = l.interesse || ''                          // J Interesse
    out[10] = l.id                                      // K Lead ID
    out[11] = l.o_que_busca || ''                       // L Qtd. desejada
    // M-Q (utm): irrecuperáveis — só existiam no corpo da requisição original
    out[17] = l.tem_inscricao_estadual || ''            // R Inscrição Estadual
    return out
})
newRows.forEach(r => console.log(`  + ${r[1]} — ${r[2]} (${r[3]})`))

if (!APPLY) { console.log('\nDRY-RUN. Rode com --apply para gravar.'); await db.end(); process.exit(0) }

if (newRows.length) {
    await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Leads JMP!A:AN',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: newRows },
    })
    console.log(`\n[apply] ${newRows.length} leads reimportados para a planilha`)
}

// remove a sonda de diagnóstico (CRM + fila de e-mails)
const { rows: probe } = await db.query('select id from crm_leads where email=$1', [PROBE_EMAIL])
if (probe.length) {
    for (const p of probe) {
        await db.query('delete from jmp_email_queue where lead_id=$1', [p.id]).catch(() => { })
        await db.query('delete from crm_leads where id=$1', [p.id])
    }
    console.log(`[cleanup] sonda removida do CRM (${probe.length} registro)`)
}
await db.end()
