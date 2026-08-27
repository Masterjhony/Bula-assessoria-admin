/**
 * Repara o lead 1614193106884911 (27/08/2026, "LEAD - PERPETUO TOURO"), que
 * entrou na planilha com o CPF na coluna Nome.
 *
 * Causa: o lead digitou "18" no campo Nome. O parseRawMetaLead só deslocava a
 * coluna do nome quando a candidata tinha letra, então com "18" ele não
 * deslocou e leu o CPF como nome — e o "18" se perdeu. Corrigido no
 * jmp-sheets.ts (CPF antes do e-mail já prova o layout); este script só desfaz
 * o estrago da linha que passou antes da correção.
 *
 * Valores conferidos na linha crua ANTES da absorção (colunas 17..21 do despejo
 * do conector): nome="18", cpf="165.076.777-36", e-mail=leonardosm736@…,
 * telefone=+5524999548425, UF=RJ.
 *
 * Escreve SÓ as células Nome/full_name/cpf, e só em linha cujo Lead ID confere.
 * Não cria, não apaga e não move linha nenhuma. Rodar sem flag = simulação.
 *
 * Uso: npx tsx scripts/repara-lead-cpf-no-nome-2026-08-27.mts [--apply]
 */
import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const { google } = await import('googleapis')
const { getSheetInfo } = await import('../src/lib/jmp-sheets')

const APLICA = process.argv.includes('--apply')
const LEAD_ID = '1614193106884911'
const NOME_CORRETO = '18'
const CPF_CORRETO = '165.076.777-36'
const CPF_ERRADO_NO_NOME = /^165\.?076\.?777-?36$/

const info = await getSheetInfo()
if (!info) { console.error('planilha não provisionada'); process.exit(1) }
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
const auth = new google.auth.JWT({
  email: creds.client_email,
  key: String(creds.private_key).replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })

function colName(i: number): string {
  let n = i + 1, s = ''
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}
const norm = (h: unknown) => String(h ?? '').trim().toLowerCase()

const meta = await sheets.spreadsheets.get({ spreadsheetId: info.spreadsheetId, includeGridData: false })
const updates: { range: string; values: string[][] }[] = []

for (const s of meta.data.sheets ?? []) {
  const tab = s.properties!.title!
  const grid = ((await sheets.spreadsheets.values.get({
    spreadsheetId: info.spreadsheetId, range: `'${tab}'!A1:BN`,
  })).data.values ?? []) as string[][]
  if (!grid.length) continue
  const head = grid[0].map(norm)
  const iId = head.findIndex(h => h === 'lead id' || h === 'id')
  if (iId < 0) continue

  grid.forEach((row, k) => {
    if (k === 0) return
    // Casa por QUALQUER coluna de id: a base tem "Lead ID" e "id" duplicados.
    const ids = head.flatMap((h, i) => (h === 'lead id' || h === 'id') ? [String(row[i] ?? '').trim()] : [])
    if (!ids.includes(LEAD_ID)) return
    const linha = k + 1
    for (const [alvo, valor] of [['nome', NOME_CORRETO], ['full_name', NOME_CORRETO], ['cpf', CPF_CORRETO]] as const) {
      const i = head.indexOf(alvo)
      if (i < 0) continue
      const atual = String(row[i] ?? '').trim()
      // Só mexe onde está o defeito: nome com o CPF, ou a coluna de CPF vazia.
      const defeituoso = alvo === 'cpf' ? atual === '' : CPF_ERRADO_NO_NOME.test(atual)
      if (!defeituoso) { console.log(`  ${tab}!${colName(i)}${linha} (${alvo}) já está "${atual}" — não mexe`); continue }
      console.log(`  ${tab}!${colName(i)}${linha} (${alvo}): "${atual}" → "${valor}"`)
      updates.push({ range: `'${tab}'!${colName(i)}${linha}`, values: [[valor]] })
    }
  })
}

if (!updates.length) { console.log('\nNada a reparar.'); process.exit(0) }
if (!APLICA) { console.log(`\nSIMULAÇÃO — ${updates.length} célula(s). Rode com --apply para gravar.`); process.exit(0) }
await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: info.spreadsheetId,
  requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
})
console.log(`\n${updates.length} célula(s) gravada(s).`)
