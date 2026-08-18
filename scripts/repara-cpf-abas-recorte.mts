/**
 * Complemento do repara-leads-no-final: nas abas-recorte (TOUROS/FEMEAS/...),
 * os mesmos 3 leads do form novo estão com o CPF na coluna Nome. Grava o CPF na
 * coluna CPF/CNPJ (onde ela existe) e deixa o aviso em Observações. Não mexe em
 * mais nada.
 *
 *   npx tsx scripts/repara-cpf-abas-recorte.mts [--aplicar]
 */
import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const { google } = await import('googleapis')
const { getSheetInfo } = await import('../src/lib/jmp-sheets')
const APLICAR = process.argv.includes('--aplicar')
const AVISO = 'Nome não veio do Meta (form novo com CPF, corrigido em 18/08) — confirmar no 1º contato.'
const info = (await getSheetInfo())!
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
const auth = new google.auth.JWT({ email: creds.client_email, key: String(creds.private_key).replace(/\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ehDoc = (v: string) => /^\d{11}$|^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(String(v || '').trim())
const colLetra = (i: number) => { let n = i + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }
const updates: { range: string; values: string[][] }[] = []
for (const tab of ['TOUROS', 'FEMEAS', 'EMBRIÕES', 'OUTROS']) {
  const v = ((await sheets.spreadsheets.values.get({ spreadsheetId: info.spreadsheetId, range: `'${tab}'!A1:BL` })).data.values ?? []) as string[][]
  const H = (v[0] ?? []).map(h => String(h ?? '').trim())
  const idx = (n: string) => H.findIndex(h => h.toLowerCase() === n)
  const iNome = idx('nome'), iCpf = idx('cpf/cnpj'), iObs = idx('observações')
  v.slice(1).forEach((r, k) => {
    const linha = k + 2
    if (!ehDoc(String(r[iNome] ?? ''))) return
    const cpf = String(r[iNome]).trim()
    if (iCpf >= 0 && !String(r[iCpf] ?? '').trim()) updates.push({ range: `'${tab}'!${colLetra(iCpf)}${linha}`, values: [[cpf]] })
    if (iObs >= 0 && !String(r[iObs] ?? '').trim()) updates.push({ range: `'${tab}'!${colLetra(iObs)}${linha}`, values: [[AVISO]] })
    console.log(`${tab}!L${linha}: ${cpf}${iCpf < 0 ? ' (aba sem coluna CPF/CNPJ — só o aviso)' : ''}`)
  })
}
if (!updates.length) { console.log('nada a corrigir.'); process.exit(0) }
console.log(`${updates.length} célula(s) a gravar`)
if (!APLICAR) { console.log('SIMULAÇÃO — use --aplicar.'); process.exit(0) }
await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: info.spreadsheetId, requestBody: { valueInputOption: 'RAW', data: updates } })
console.log('OK.')
