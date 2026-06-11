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

// já presentes na planilha (Lead ID / email / fone) — colunas resolvidas pelo cabeçalho
const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Leads JMP!A1:AZ' })
const all = res.data.values ?? []
const header = all[0] ?? []
const rows = all.slice(1)
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const idx = (name, fallback) => { const i = header.findIndex(h => norm(h) === norm(name)); return i >= 0 ? i : fallback }
const COL = {
    data: idx('Data', 1), nome: idx('Nome', 2), email: idx('E-mail', 3), fone: idx('WhatsApp', 4),
    uf: idx('UF', 5), cidade: idx('Cidade', 6), momento: idx('Momento', 7), cabecas: idx('Cabeças', 8),
    interesse: idx('Interesse', 9), leadId: idx('Lead ID', 10), qtd: idx('Qtd. desejada', 11),
    ie: idx('Inscrição Estadual', 17),
}
const digits = (v) => String(v || '').replace(/\D/g, '').replace(/^55/, '')
const sheetIds = new Set(), sheetEmails = new Set(), sheetPhones = new Set()
for (const r of rows) {
    if (String(r[COL.leadId] || '').trim()) sheetIds.add(String(r[COL.leadId]).trim())
    if (String(r[COL.email] || '').trim()) sheetEmails.add(String(r[COL.email]).trim().toLowerCase())
    if (digits(r[COL.fone])) sheetPhones.add(digits(r[COL.fone]))
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
    const out = Array.from({ length: Math.max(header.length, 40) }, () => '')
    out[COL.data] = fmt(l.data_entrada || l.created_at)
    out[COL.nome] = l.nome || ''
    out[COL.email] = l.email || ''
    out[COL.fone] = l.celular || l.telefone || ''
    out[COL.uf] = l.estado || ''
    out[COL.cidade] = l.cidade || ''
    out[COL.momento] = l.momento_pecuaria || ''
    out[COL.cabecas] = l.quantidade_animais || ''
    out[COL.interesse] = l.interesse || ''
    out[COL.leadId] = l.id
    out[COL.qtd] = l.o_que_busca || ''
    // utm: irrecuperáveis — só existiam no corpo da requisição original
    out[COL.ie] = l.tem_inscricao_estadual || ''
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
