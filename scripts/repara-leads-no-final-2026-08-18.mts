/**
 * Conserta a LEADS GERAIS depois do bug "os leads estão caindo no final".
 *
 * O conector do Meta despeja o lead cru no FIM da aba; até hoje a auto-cura
 * reescrevia a linha NO LUGAR, então o lead ficava formatado mas parado na
 * última linha — fora da ordem decrescente que a equipe lê. O código já foi
 * corrigido (normalizeMetaRawRows agora move para o topo); este script arruma
 * o que ficou para trás:
 *
 *   1. move para o topo, em ordem decrescente de Data, o bloco de leads
 *      parados no fim (16–18/08), preservando a cor de cada linha;
 *   2. grava o CPF na coluna própria nos leads do form novo (Expogenética),
 *      onde o CPF tinha ido parar na coluna Nome.
 *
 *   npx tsx scripts/repara-leads-no-final-2026-08-18.mts            # simulação
 *   npx tsx scripts/repara-leads-no-final-2026-08-18.mts --aplicar  # escreve
 */
import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const { google } = await import('googleapis')
const { getSheetInfo } = await import('../src/lib/jmp-sheets')

const APLICAR = process.argv.includes('--aplicar')
const TAB = 'LEADS GERAIS'
/** Nasceram depois disto e ficaram presos no fim (o despejo começou em 16/08). */
const CORTE = new Date(2026, 7, 16, 21, 0).getTime()
/** Onde o bloco entra: a linha 2 já é o lead mais novo (18/08, 18:00). */
const DESTINO_LINHA = 3

const info = (await getSheetInfo())!
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
const auth = new google.auth.JWT({
  email: creds.client_email, key: String(creds.private_key).replace(/\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })

const grid = await sheets.spreadsheets.get({
  spreadsheetId: info.spreadsheetId,
  ranges: [`'${TAB}'`],
  includeGridData: true,
  fields: 'sheets(properties(sheetId,title),data(rowData(values(formattedValue,effectiveFormat/backgroundColorStyle))))',
})
const aba = grid.data.sheets![0]
const sheetId = aba.properties!.sheetId!
const rowData = aba.data![0].rowData ?? []
const linhas = rowData.map(r => (r.values ?? []).map(c => String(c.formattedValue ?? '')))
const cores = rowData.map(r => (r.values ?? []).map(c => c.effectiveFormat?.backgroundColorStyle ?? null))
const header = linhas[0] ?? []
const col = (nome: string) => header.findIndex(h => h.trim().toLowerCase() === nome)
const iData = col('data'), iNome = col('nome'), iCpf = col('cpf'), iCpfBr = col('cpf_(brazil)')
if (iData < 0 || iNome < 0) throw new Error('cabeçalho sem Data/Nome — abortado')

const quando = (s: string) => {
  const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})/)
  return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime() : NaN
}
// Bloco preso no FIM: sobe a partir da última linha enquanto a data for
// recente. Só o rabo da aba entra — o miolo (consolidação antiga, fora de
// ordem por outros motivos) não é mexido.
const presos: { linha: number; row: string[]; t: number }[] = []
// O grid vem com as linhas vazias do fim da aba; a última COM dado é o começo.
let ultima = linhas.length
while (ultima > 1 && !(linhas[ultima - 1] ?? []).some(c => String(c ?? '').trim())) ultima--
for (let i = ultima; i >= DESTINO_LINHA; i--) {
  const row = linhas[i - 1] ?? []
  const t = quando(row[iData] ?? '')
  if (isNaN(t) || t < CORTE) break
  presos.unshift({ linha: i, row, t })
}
if (!presos.length) { console.log('nada preso no fim — planilha já está em ordem.'); process.exit(0) }
console.log(`bloco preso: L${presos[0].linha}..L${presos[presos.length - 1].linha} (${presos.length} linhas)`)

// CPF que foi parar no Nome (form "BULA PERPETUO v1", com cpf_(brazil)).
const ehDoc = (v: string) => /^\d{11}$|^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(String(v || '').trim())
const ordenadas = [...presos].sort((a, b) => b.t - a.t)
const largura = Math.max(header.length, ...ordenadas.map(p => p.row.length))
const valores = ordenadas.map(p => {
  const row = Array.from({ length: largura }, (_, i) => p.row[i] ?? '')
  if (ehDoc(row[iNome])) {
    const cpf = row[iNome].trim()
    if (iCpf >= 0) row[iCpf] = cpf
    if (iCpfBr >= 0) row[iCpfBr] = cpf
    const iObs = col('observações')
    if (iObs >= 0 && !row[iObs]) {
      row[iObs] = 'Nome não veio do Meta (form novo com CPF, corrigido em 18/08) — confirmar no 1º contato.'
    }
    console.log(`  CPF resgatado para a coluna própria: L${p.linha} ${cpf} (${row[col('e-mail')] || row[col('whatsapp')]})`)
  }
  return row
})
ordenadas.forEach(p => console.log(`  move L${p.linha}: ${p.row[iData]} — ${p.row[iNome]}`))

if (!APLICAR) { console.log('\nSIMULAÇÃO — nada foi escrito. Use --aplicar.'); process.exit(0) }

const n = ordenadas.length
const inicio0 = DESTINO_LINHA - 1
const requests: object[] = [
  { insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: inicio0, endIndex: inicio0 + n }, inheritFromBefore: false } },
  {
    updateCells: {
      start: { sheetId, rowIndex: inicio0, columnIndex: 0 },
      rows: ordenadas.map((p, k) => ({
        values: valores[k].map((v, c) => ({
          ...(v ? { userEnteredValue: { stringValue: v } } : {}),
          userEnteredFormat: { backgroundColorStyle: cores[p.linha - 1]?.[c] ?? { themeColor: 'BACKGROUND' } },
        })),
      })),
      fields: 'userEnteredValue,userEnteredFormat.backgroundColorStyle',
    },
  },
  // originais desceram n linhas; apaga de baixo para cima
  ...presos.map(p => p.linha - 1 + n).sort((a, b) => b - a)
    .map(startIndex => ({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex, endIndex: startIndex + 1 } } })),
]
await sheets.spreadsheets.batchUpdate({ spreadsheetId: info.spreadsheetId, requestBody: { requests } })
console.log(`\nOK: ${n} lead(s) movidos para o topo (a partir da linha ${DESTINO_LINHA}).`)
