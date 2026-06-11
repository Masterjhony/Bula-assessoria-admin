// Cirurgia da planilha "Leads JMP": um fragmento órfão abaixo da tabela fez a
// API de append gravar leads deslocados (linhas ~163+, colunas E/F). Este
// script extrai esses leads (com UTMs), apaga o bloco torto (fragmento +
// originais deslocadas + duplicatas do backfill + sonda) e regrava cada lead
// UMA vez, alinhado, logo após a última linha boa da tabela principal.
// Uso: node scripts/fix-jmp-sheet-shifted.mjs [--apply]
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

const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A1:AN500` })
const values = res.data.values ?? []

// última linha da tabela principal: varre a partir da linha 2 até achar uma
// linha totalmente vazia (fim do bloco contíguo).
let lastGood = 1
for (let i = 1; i < values.length; i++) {
    if ((values[i] ?? []).some(c => String(c).trim())) lastGood = i + 1
    else break
}
console.log('Última linha boa da tabela principal:', lastGood)

// bloco torto: linhas não vazias abaixo do primeiro vão
const junk = []
for (let i = lastGood; i < values.length; i++) {
    if ((values[i] ?? []).some(c => String(c).trim())) junk.push({ rowNum: i + 1, row: values[i] })
}
console.log('Linhas no bloco torto:', junk.map(j => j.rowNum).join(', ') || '(nenhuma)')

// extrai leads deslocados: acha a célula de data dd/mm/aaaa → offset
const DATE_RE = /^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/
const recovered = new Map() // leadId|email -> row A..AN
const deleted = []
for (const { rowNum, row } of junk) {
    const dateIdx = row.findIndex(c => DATE_RE.test(String(c).trim()))
    if (dateIdx < 0) { deleted.push({ rowNum, why: 'fragmento sem data', preview: JSON.stringify(row.slice(0, 6)) }); continue }
    const f = (i) => String(row[dateIdx + i] ?? '').trim()
    const email = f(2).toLowerCase()
    const nome = f(1)
    if (email.includes('sonda-claude') || nome.startsWith('[SONDA')) { deleted.push({ rowNum, why: 'sonda de diagnóstico', preview: nome }); continue }
    const leadId = f(9)
    const key = leadId || email
    const out = Array.from({ length: 40 }, () => '')
    // B..R = 17 campos a partir da data
    for (let i = 0; i < 17; i++) out[1 + i] = f(i)
    const hasUtm = !!(out[12] || out[14])
    const prev = recovered.get(key)
    // preferir a versão COM utm (original); duplicata do backfill não tem
    if (!prev || (hasUtm && !(prev.hasUtm))) recovered.set(key, Object.assign(out, { hasUtm }))
    deleted.push({ rowNum, why: hasUtm ? 'original deslocada (recuperada c/ UTM)' : 'duplicata do backfill', preview: nome })
}

console.log('\n── Bloco a apagar ──')
deleted.forEach(d => console.log(`  L${d.rowNum}: ${d.why} — ${d.preview}`))
console.log('\n── Leads únicos a regravar (alinhados) ──')
const toWrite = [...recovered.values()].sort((a, b) => {
    const pd = (s) => { const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2})/); return m ? `${m[3]}${m[2]}${m[1]}${m[4]}${m[5]}` : '' }
    return pd(a[1]).localeCompare(pd(b[1]))
})
toWrite.forEach(r => console.log(`  ${r[1]} — ${r[2]} | utm_source="${r[12]}" utm_campaign="${r[14]}" ad-id="${r[16]}"`))

if (!APPLY) { console.log('\nDRY-RUN. Rode com --apply para aplicar.'); process.exit(0) }

const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
const sheetId = meta.data.sheets.find(s => s.properties.title === TAB).properties.sheetId

// 1) apaga o bloco torto (de baixo pra cima)
const delReqs = deleted.map(d => d.rowNum).sort((a, b) => b - a).map(rowNum => ({
    deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum } },
}))
await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: delReqs } })
console.log(`\n[apply] ${delReqs.length} linhas tortas apagadas`)

// 2) regrava os leads alinhados logo após a última linha boa
if (toWrite.length) {
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB}!A${lastGood + 1}:AN${lastGood + toWrite.length}`,
        valueInputOption: 'RAW',
        requestBody: { values: toWrite.map(r => r.slice(0, 40)) },
    })
    console.log(`[apply] ${toWrite.length} leads regravados nas linhas ${lastGood + 1}-${lastGood + toWrite.length}`)
}
console.log('\nCirurgia concluída.')
