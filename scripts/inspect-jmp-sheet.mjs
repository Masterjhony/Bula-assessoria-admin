// Inspeção da planilha "Leads JMP" — estrutura, linhas Meta cruas, colunas S+.
// Somente LEITURA. Uso: node scripts/inspect-jmp-sheet.mjs
import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
import pg from 'pg'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const { rows: cfg } = await db.query("select value from jmp_config where key='sheets'")
await db.end()
const spreadsheetId = cfg[0]?.value?.spreadsheetId
if (!spreadsheetId) { console.error('jmp_config sheets ausente'); process.exit(1) }
console.log('spreadsheetId:', spreadsheetId)

const creds = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })

function colName(i) { let n = i + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }

// abas
const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
console.log('\nAbas:', meta.data.sheets.map(s => `"${s.properties.title}" (${s.properties.gridProperties.rowCount}x${s.properties.gridProperties.columnCount})`).join(' | '))

const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Leads JMP!A1:BZ300' })
const values = res.data.values ?? []
console.log('\nTotal de linhas com dados:', values.length)

// header
const header = values[0] ?? []
console.log('\n── HEADER (linha 1) ──')
header.forEach((h, i) => { if (String(h).trim()) console.log(`  ${colName(i)}: ${h}`) })

// classifica linhas
const isMetaRaw = (row) => {
    const joined = row.slice(0, 4).join(' ')
    return /(^|\s)l:\d{6,}/.test(joined) || /^\d{4}-\d{2}-\d{2}T/.test(String(row[0] ?? '')) || /^l:\d+/.test(String(row[0] ?? '')) || /^l:\d+/.test(String(row[1] ?? ''))
}
const metaRows = [], normalRows = []
values.slice(1).forEach((row, i) => {
    const rowNum = i + 2
    if (!row.some(c => String(c).trim())) return
    if (isMetaRaw(row)) metaRows.push({ rowNum, row }); else normalRows.push({ rowNum, row })
})
console.log(`\nLinhas normais: ${normalRows.length} | Linhas Meta cruas: ${metaRows.length}`)

console.log('\n── LINHAS META CRUAS (verbatim, célula a célula) ──')
for (const { rowNum, row } of metaRows) {
    console.log(`\nLinha ${rowNum}:`)
    row.forEach((c, i) => { if (String(c).trim()) console.log(`  ${colName(i)}: ${JSON.stringify(String(c))}`) })
}

// colunas S+ nas linhas normais (amostra)
console.log('\n── COLUNAS S+ NAS LINHAS NORMAIS (até 8 amostras com conteúdo) ──')
let shown = 0
for (const { rowNum, row } of normalRows) {
    const extra = row.slice(18) // S = índice 18
    if (extra.some(c => String(c).trim()) && shown < 8) {
        shown++
        console.log(`Linha ${rowNum}:`)
        extra.forEach((c, i) => { if (String(c).trim()) console.log(`  ${colName(i + 18)}: ${JSON.stringify(String(c))}`) })
    }
}
if (!shown) console.log('  (nenhuma linha normal tem conteúdo da coluna S em diante)')

// amostra de linha normal completa
console.log('\n── AMOSTRA: 2 linhas normais completas ──')
for (const { rowNum, row } of normalRows.slice(0, 2)) {
    console.log(`Linha ${rowNum}:`)
    row.forEach((c, i) => { if (String(c).trim()) console.log(`  ${colName(i)}: ${JSON.stringify(String(c))}`) })
}
