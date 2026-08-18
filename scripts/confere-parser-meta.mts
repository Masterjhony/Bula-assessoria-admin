/**
 * Confere o parser de linha crua do Meta contra as linhas cruas que estiverem
 * na planilha AGORA (e contra dois casos fixos: form com CPF e sem CPF).
 * Só lê — não escreve nada.
 */
import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const { google } = await import('googleapis')
const { getSheetInfo, parseRawMetaLead } = await import('../src/lib/jmp-sheets')

// ── casos fixos ────────────────────────────────────────────────────────────
const semCpf = ['l:111', '2026-08-17T09:18:00-03:00', 'ag:1', 'video-femeas-perpetuo02', 'as:1', 'adset', 'c:1',
  'LEADS - PERPETUO FEMEAS', 'f:1', 'Formulário BULA PERPETUO v0', 'false', 'fb',
  'trabalho_com_pecuária_de_corte', '51-100', 'sim', 'touros_po', '1-5',
  'Manoel Teixeira', 'globoeditorial@yahoo.com.br', 'p:+5531986093284', 'Minas Gerais', 'CREATED']
const comCpf = ['l:222', '2026-08-18T17:00:57-03:00', 'ag:2', 'video-expogenetica03', 'as:2', 'adset', 'c:2',
  'LEADS - Expogenética', 'f:2', 'Formulário BULA PERPETUO v1', 'false', 'fb',
  'trabalho_com_pecuária_de_corte', '101-300', 'sim', 'touros_po', '1-5',
  'Hernani Oliveira', '258.224.466-04', 'hernanioliveira1951@gmail.com', 'p:+5519998395958', 'São Paulo', 'form-insta-perpetuo']
const cpfVazio = [...comCpf]; cpfVazio[18] = ''
for (const [rotulo, row] of [['sem CPF', semCpf], ['com CPF', comCpf], ['CPF em branco', cpfVazio]] as [string, string[]][]) {
  const p = parseRawMetaLead(row)
  console.log(`${rotulo}: nome="${p?.fullName}" cpf="${p?.cpf}" email="${p?.email}" fone="${p?.phone}" uf="${p?.state}" interesse="${p?.interesse}" qtd="${p?.qtd}" cabeças="${p?.cabecas}" ie="${p?.temIe}" status="${p?.leadStatus}"`)
}

// ── linhas cruas de verdade que estiverem na planilha ──────────────────────
const info = await getSheetInfo()
if (!info) process.exit(0)
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
const auth = new google.auth.JWT({ email: creds.client_email, key: String(creds.private_key).replace(/\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
const sheets = google.sheets({ version: 'v4', auth })
const meta = await sheets.spreadsheets.get({ spreadsheetId: info.spreadsheetId })
for (const s of meta.data.sheets ?? []) {
  const tab = s.properties!.title!
  const v = ((await sheets.spreadsheets.values.get({ spreadsheetId: info.spreadsheetId, range: `'${tab}'!A1:BL` })).data.values ?? []) as string[][]
  v.forEach((row, i) => {
    const p = parseRawMetaLead(row)
    if (p) console.log(`CRUA ${tab}!L${i + 1}: nome="${p.fullName}" cpf="${p.cpf}" email="${p.email}" fone="${p.phone}" uf="${p.state}" interesse="${p.interesse}" status="${p.leadStatus}"`)
  })
}
