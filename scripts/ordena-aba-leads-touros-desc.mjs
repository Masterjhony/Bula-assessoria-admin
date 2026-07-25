// Inverte UMA VEZ a ordem das linhas da aba "LEADS TOUROS" (planilha Leads JMP):
// os cadastros mais recentes passam a ficar em cima, os mais antigos embaixo.
// A partir daí quem mantém a ordem é o código (src/lib/jmp-sheets.ts insere as
// linhas novas no topo).
//
// A inversão é feita por moveDimension (mover linhas), NÃO por reescrita de
// valores: cores, notas, filtros e as colunas da equipe ("Atendido por",
// "Observações") viajam junto com a linha.
//
// Uso:
//   node scripts/ordena-aba-leads-touros-desc.mjs           → dry-run (só relata)
//   node scripts/ordena-aba-leads-touros-desc.mjs --apply    → inverte de verdade
//   node scripts/ordena-aba-leads-touros-desc.mjs --apply --tab "LEADS DOUGLAS"
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { google } from 'googleapis'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const tabArg = process.argv.indexOf('--tab')
const TAB = tabArg > -1 ? process.argv[tabArg + 1] : 'LEADS TOUROS'

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
const sheet = (meta.data.sheets ?? []).find(s => s.properties?.title === TAB)
if (!sheet) { console.error(`aba "${TAB}" não existe`); process.exit(1) }
const sheetId = sheet.properties.sheetId

const vals = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A1:AZ` })).data.values ?? []
const header = vals[0] ?? []
const dados = vals.slice(1)
const iData = header.findIndex(h => String(h).trim().toLowerCase() === 'data')
const iNome = header.findIndex(h => String(h).trim().toLowerCase() === 'nome')

console.log(`aba "${TAB}" (sheetId=${sheetId}): ${dados.length} linhas de dados, ${header.length} colunas`)
console.log('topo atual :', dados[0]?.[iData], '|', dados[0]?.[iNome])
console.log('fim atual  :', dados.at(-1)?.[iData], '|', dados.at(-1)?.[iNome])

if (dados.length < 2) { console.log('nada a inverter.'); process.exit(0) }

// Backup dos valores antes de mexer (a inversão é reversível rodando de novo,
// mas o backup é a rede de segurança se algo sair diferente do esperado).
mkdirSync('outputs', { recursive: true })
const stamp = new Date().toISOString().slice(0, 10)
const backup = `outputs/backup-${TAB.toLowerCase().replace(/\s+/g, '-')}-${stamp}.json`
writeFileSync(backup, JSON.stringify({ tab: TAB, spreadsheetId, values: vals }, null, 2))
console.log('backup dos valores:', backup)

if (!APPLY) {
  console.log('\n[dry-run] rode com --apply para inverter a ordem das linhas.')
  process.exit(0)
}

// Reversão por movimentos: pega a ÚLTIMA linha e joga para logo abaixo das já
// movidas, N-1 vezes. As requests de um batchUpdate são aplicadas em sequência,
// cada uma enxergando o resultado da anterior — o efeito é inverter o bloco.
// Índices 0-based; a linha 0 é o cabeçalho, então os dados vão de 1 a n e a
// última linha está SEMPRE no índice n (o bloco não muda de tamanho).
const n = dados.length
const requests = []
for (let k = 0; k < n - 1; k++) {
  requests.push({
    moveDimension: {
      source: { sheetId, dimension: 'ROWS', startIndex: n, endIndex: n + 1 },
      destinationIndex: 1 + k,
    },
  })
}

// A API aceita muitas requests por chamada, mas fatiar evita payload gigante.
const LOTE = 200
for (let i = 0; i < requests.length; i += LOTE) {
  const fatia = requests.slice(i, i + LOTE)
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: fatia } })
  console.log(`  movidas ${Math.min(i + LOTE, requests.length)}/${requests.length}`)
}

const depois = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A1:AZ` })).data.values ?? []
const d2 = depois.slice(1)
console.log('\ntopo agora :', d2[0]?.[iData], '|', d2[0]?.[iNome])
console.log('fim agora  :', d2.at(-1)?.[iData], '|', d2.at(-1)?.[iNome])
console.log(`linhas: ${d2.length} (antes ${dados.length})`)
