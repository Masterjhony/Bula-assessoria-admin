// Cria a coluna "Etapa" (com o dropdown LEAD/MQL/CONEXÃO/QUALIFICAÇÃO/
// INFORMAÇÃO CAPTADAS/CADASTRO OK) como PRIMEIRA coluna de uma aba de trabalho
// da campanha de touros — igual à que a equipe já usa na "LEADS BULA - PERPETUO".
//
// A validação é COPIADA da PERPETUO (copyPaste PASTE_DATA_VALIDATION) em vez de
// recriada: as cores dos chips do dropdown são um recurso de UI que a API v4 não
// devolve na leitura, mas viajam na cópia server-side.
//
// Idempotente: se a aba já tiver "Etapa" na coluna A, só reaplica a validação.
//
// Uso:
//   node scripts/adiciona-coluna-etapa-touros.mjs                     → dry-run
//   node scripts/adiciona-coluna-etapa-touros.mjs --apply
//   node scripts/adiciona-coluna-etapa-touros.mjs --apply --tab "LEADS DOUGLAS"
import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const tabArg = process.argv.indexOf('--tab')
const TAB = tabArg > -1 ? process.argv[tabArg + 1] : 'LEADS TOUROS'
const FONTE = 'LEADS BULA - PERPETUO' // aba onde a equipe já montou o dropdown
const COL = 'Etapa'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const { rows: cfg } = await db.query("select value from jmp_config where key='sheets'")
await db.end()
const spreadsheetId = cfg[0]?.value?.spreadsheetId
if (!spreadsheetId) { console.error('jmp_config sheets ausente'); process.exit(1) }

const creds = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
const auth = new google.auth.JWT({
  email: creds.client_email,
  key: creds.private_key.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })

const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
const alvo = (meta.data.sheets ?? []).find(s => s.properties?.title === TAB)
const fonte = (meta.data.sheets ?? []).find(s => s.properties?.title === FONTE)
if (!alvo) { console.error(`aba "${TAB}" não existe`); process.exit(1) }
if (!fonte) { console.error(`aba "${FONTE}" não existe`); process.exit(1) }
const sheetId = alvo.properties.sheetId
const fonteId = fonte.properties.sheetId
const totalLinhas = alvo.properties.gridProperties.rowCount

// A validação da PERPETUO mora na coluna A (linha 2 em diante).
const fonteHeader = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${FONTE}!A1:A1` })).data.values?.[0] ?? []
if (String(fonteHeader[0] ?? '').trim().toLowerCase() !== COL.toLowerCase()) {
  console.error(`a coluna A da "${FONTE}" não é "${COL}" (é "${fonteHeader[0]}") — abortando`)
  process.exit(1)
}
const dv = (await sheets.spreadsheets.get({
  spreadsheetId, ranges: [`${FONTE}!A2:A2`], includeGridData: true,
  fields: 'sheets(data(rowData(values(dataValidation))))',
})).data.sheets[0].data[0].rowData?.[0]?.values?.[0]?.dataValidation
if (!dv) { console.error(`sem dataValidation em ${FONTE}!A2 — abortando`); process.exit(1) }
console.log('dropdown da fonte:', dv.condition.values.map(v => v.userEnteredValue).join(' | '))

const header = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A1:AZ1` })).data.values?.[0] ?? []
const jaTem = String(header[0] ?? '').trim().toLowerCase() === COL.toLowerCase()
console.log(`aba "${TAB}": ${header.length} colunas — ${jaTem ? 'já tem "Etapa" na coluna A (só reaplica a validação)' : 'vai inserir "Etapa" como coluna A'}`)
console.log('header atual:', header.slice(0, 4).join(' | '), '…')

if (!APPLY) { console.log('\n[dry-run] rode com --apply.'); process.exit(0) }

const requests = []
if (!jaTem) {
  // Nova coluna A. inheritFromBefore:false → herda o formato da coluna à
  // direita (cabeçalho cinza/negrito), então o cabeçalho já nasce igual.
  requests.push({
    insertDimension: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
      inheritFromBefore: false,
    },
  })
  requests.push({
    updateCells: {
      start: { sheetId, rowIndex: 0, columnIndex: 0 },
      rows: [{ values: [{ userEnteredValue: { stringValue: COL } }] }],
      fields: 'userEnteredValue',
    },
  })
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 170 },
      fields: 'pixelSize',
    },
  })
}
// Dropdown em toda a coluna (linha 2 até o fim da grade). A cópia leva as cores
// dos chips junto — recriar a regra na mão perderia a cor.
requests.push({
  copyPaste: {
    source: { sheetId: fonteId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 },
    destination: { sheetId, startRowIndex: 1, endRowIndex: totalLinhas, startColumnIndex: 0, endColumnIndex: 1 },
    pasteType: 'PASTE_DATA_VALIDATION',
  },
})
// O filtro tem que enxergar a coluna nova.
requests.push({ setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0 } } } })

await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })

const depois = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A1:AZ1` })).data.values?.[0] ?? []
const conf = (await sheets.spreadsheets.get({
  spreadsheetId, ranges: [`${TAB}!A2:A3`], includeGridData: true,
  fields: 'sheets(data(rowData(values(dataValidation))))',
})).data.sheets[0].data[0].rowData ?? []
console.log('\nheader agora:', depois.slice(0, 4).join(' | '), '…')
console.log('validação em A2:', JSON.stringify(conf[0]?.values?.[0]?.dataValidation?.condition?.values?.map(v => v.userEnteredValue) ?? null))
console.log('validação em A3:', JSON.stringify(conf[1]?.values?.[0]?.dataValidation?.condition?.values?.map(v => v.userEnteredValue) ?? null))
