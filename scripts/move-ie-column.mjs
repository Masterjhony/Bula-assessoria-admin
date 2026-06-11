// Move a coluna "Inscrição Estadual" para logo depois de "Cabeças" na aba
// "Leads JMP" (pedido da equipe: IE perto das informações de qualificação).
// moveDimension preserva valores E formatação célula a célula.
// Uso: node scripts/move-ie-column.mjs [--apply]
import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const { rows: cfg } = await db.query("select value from jmp_config where key='sheets'")
await db.end()
const spreadsheetId = cfg[0].value.spreadsheetId

const creds = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })
const TAB = 'Leads JMP'

const colName = (i) => { let n = i + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }

const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A1:AZ1` })
const header = (res.data.values?.[0] ?? []).map(v => String(v ?? '').trim())
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const ieIdx = header.findIndex(h => norm(h) === 'inscricaoestadual')
const cabIdx = header.findIndex(h => norm(h) === 'cabecas')
if (ieIdx < 0 || cabIdx < 0) { console.error('Cabeçalho IE/Cabeças não encontrado:', header.join(' | ')); process.exit(1) }
if (ieIdx === cabIdx + 1) { console.log('IE já está logo depois de Cabeças — nada a fazer.'); process.exit(0) }

console.log(`IE está em ${colName(ieIdx)}; Cabeças em ${colName(cabIdx)}.`)
console.log(`Plano: mover coluna ${colName(ieIdx)} para a posição ${colName(cabIdx + 1)} (logo após Cabeças).`)
if (!APPLY) { console.log('DRY-RUN — rode com --apply para mover.'); process.exit(0) }

const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
const sheetId = meta.data.sheets.find(s => s.properties.title === TAB).properties.sheetId

// destinationIndex no moveDimension é a posição ANTES da remoção da origem.
await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
        requests: [{
            moveDimension: {
                source: { sheetId, dimension: 'COLUMNS', startIndex: ieIdx, endIndex: ieIdx + 1 },
                destinationIndex: cabIdx + 1,
            },
        }],
    },
})

const after = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A1:AZ1` })
console.log('\nNovo cabeçalho:')
;(after.data.values?.[0] ?? []).forEach((h, i) => { if (String(h).trim()) console.log(`  ${colName(i)}: ${h}`) })
