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
const { getSheetInfo, parseRawMetaLead, metaStateToUF } = await import('../src/lib/jmp-sheets')

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
// Lead real de 27/08 (l:1614193106884911): digitou "18" no campo Nome. Antes da
// correção o parser não deslocava (a coluna do nome não tinha letra) e gravava
// o CPF na coluna Nome da planilha. Esperado: nome="18", cpf="165.076.777-36".
const nomeSoDigitos = ['l:1614193106884911', '2026-08-27T12:36:30-05:00', 'ag:120249993192200708', 'video-perpetuo-touros03',
  'as:120249993192190708', 'CA - PERPETUO TOUROS INSTANTANEO — Teste 01', 'c:120249455058620708', 'LEAD - PERPETUO TOURO',
  'f:2095233067761284', 'Formulário BULA PERPETUO v1', 'false', 'ig',
  'não_trabalho,_quero_aprender', '0-50', 'não', 'touros', '6-10',
  '18', '165.076.777-36', 'leonardosm736@gmail.com', 'p:+5524999548425', 'RJ', 'form-insta-perpetuo']
for (const [rotulo, row] of [['sem CPF', semCpf], ['com CPF', comCpf], ['CPF em branco', cpfVazio], ['nome só dígitos', nomeSoDigitos]] as [string, string[]][]) {
  const p = parseRawMetaLead(row)
  console.log(`${rotulo}: nome="${p?.fullName}" cpf="${p?.cpf}" email="${p?.email}" fone="${p?.phone}" uf="${p?.state}" interesse="${p?.interesse}" qtd="${p?.qtd}" cabeças="${p?.cabecas}" ie="${p?.temIe}" status="${p?.leadStatus}"`)
}

// ── UF: o campo "estado" do form é texto livre ─────────────────────────────
// Os 9 primeiros são leads REAIS de 27/08 a 31/08 que entraram sem Zona (logo,
// sem assessor). Os demais são as travas: nome curto no meio da frase não vale,
// e sem texto nem DDD o valor cru é devolvido — não se inventa UF.
const casosUF: [string, string, string][] = [
  ['MI', 'p:+5599985399738', 'MA'],
  ['Presidente medici ro', 'p:+5569992463771', 'RO'],
  ['Mt Juína', 'p:+5566999444085', 'MT'],
  ['Rio de janeiro rj', 'p:+5521983839975', 'RJ'],
  ['Góis', 'p:+5564984227535', 'GO'],
  ['Terra Rica - Pr', 'p:+5544991055361', 'PR'],
  ['Amazonas  apui', 'p:+5516096433779', 'AM'],
  ['Brasilia', 'p:+5561996907614', 'DF'],
  ['Virgem da Lapa', 'p:+5533999692888', 'MG'],
  ['SP', '', 'SP'],
  ['São Paulo', '', 'SP'],
  ['Mato Grosso do Sul', '', 'MS'],
  ['Pará de Minas', 'p:+5537999999999', 'MG'],
  ['Belém Pará', 'p:+5591999999999', 'PA'],
  ['', 'p:+5567999999999', 'MS'],
  ['Bananalândia', 'p:+5511999999999', 'SP'],
  ['Bananalândia', '', 'Bananalândia'],
]
let falhas = 0
for (const [estado, fone, esperado] of casosUF) {
  const obtido = metaStateToUF(estado, fone)
  const ok = obtido === esperado
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHA'} UF "${estado}" + ${fone || '(sem fone)'} → "${obtido}"${ok ? '' : ` (esperado "${esperado}")`}`)
}
if (falhas) { console.error(`
${falhas} caso(s) de UF falharam.`); process.exitCode = 1 }

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
