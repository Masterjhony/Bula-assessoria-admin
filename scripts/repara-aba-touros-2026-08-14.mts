/**
 * Conserta a aba TOUROS depois do despejo do conector do Meta em 13/08/2026.
 *
 * O QUE ACONTECEU (reconstruído da própria planilha):
 *   1. O conector do Meta inseriu um lead CRU na linha 1 da TOUROS, empurrando
 *      o cabeçalho para a linha 2.
 *   2. ensureTourosLayout() leu a linha 1, achou que aquele lead era o
 *      cabeçalho e ACRESCENTOU as 21 colunas canônicas depois dele — a aba foi
 *      de 45 para 66 colunas (as fantasmas em AS..BM).
 *   3. Com o cabeçalho apontando para AS..BM, o dedup não reconheceu NENHUM
 *      dos 431 leads já presentes: o cron reacrescentou a aba inteira no topo,
 *      gravando nas colunas fantasma. O cabeçalho real foi parar na linha 433.
 *
 * O QUE ESTE SCRIPT FAZ (nesta ordem, e só se a planilha estiver exatamente no
 * estado acima — qualquer divergência aborta antes de escrever):
 *   1. apaga as 431 linhas fantasma (2..432), conferindo uma a uma que são
 *      cópias das linhas reais;
 *   2. apaga as colunas fantasma AS..BM;
 *   3. absorve o lead cru da linha 1 na LEADS GERAIS e some com a linha —
 *      pelo caminho normal (absorveDumpsCrusDoMeta), não na mão;
 *   4. devolve o rótulo "Etapa" à coluna A do cabeçalho;
 *   5. roda o syncAbasPorInteresse() para conferir que a aba voltou a
 *      reconhecer os próprios leads (append esperado: ~0).
 *
 *   npx tsx scripts/repara-aba-touros-2026-08-14.mts            # simulação
 *   npx tsx scripts/repara-aba-touros-2026-08-14.mts --aplicar  # escreve
 */
import fs from 'node:fs'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const { google } = await import('googleapis')
const { getSheetInfo, absorveDumpsCrusDoMeta, syncAbasPorInteresse } = await import('../src/lib/jmp-sheets')

const APLICAR = process.argv.includes('--aplicar')
const TAB = 'TOUROS'
const PRIMEIRA_FANTASMA = 2      // linha (1-based) da primeira cópia
const ULTIMA_FANTASMA = 432      // linha (1-based) da última cópia
const LINHA_CABECALHO = 433      // onde o cabeçalho real está hoje
const COL_FANTASMA_INI = 44      // AS (0-based)

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '')
const nucleo = (t: unknown) => {
  const d = String(t ?? '').replace(/\D/g, '')
  const s = d.startsWith('55') ? d.slice(2) : d
  return s.length >= 10 ? s.slice(-8) : ''
}
const chave = (id: string, tel: string, nome: string) =>
  id.trim() ? `id:${id.trim()}` : (nucleo(tel) ? `tel:${nucleo(tel)}` : `nome:${norm(nome)}`)

const info = await getSheetInfo()
if (!info) throw new Error('jmp_config.sheets ausente — planilha não provisionada.')
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
const auth = new google.auth.JWT({
  email: creds.client_email,
  key: String(creds.private_key).replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })
const spreadsheetId = info.spreadsheetId
console.log('planilha:', spreadsheetId, APLICAR ? '(APLICANDO)' : '(simulação)')

const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
const sheetId = meta.data.sheets?.find(s => s.properties?.title === TAB)?.properties?.sheetId
if (sheetId == null) throw new Error(`aba ${TAB} não encontrada`)

const values = ((await sheets.spreadsheets.values.get({
  spreadsheetId, range: `${TAB}!A1:BN2000`,
})).data.values ?? []) as string[][]
const at = (linha: number) => values[linha - 1] ?? []

// ── 1. Conferências: só mexemos se a aba estiver no estado esperado ─────────
const problemas: string[] = []

if (!/^l:\d+/.test(String(at(1)[0] ?? ''))) {
  problemas.push('a linha 1 não é um despejo cru do Meta (l:<id> na coluna A)')
}

const cabecalhoReal = at(LINHA_CABECALHO).map(String)
const iReal = (nome: string) => cabecalhoReal.findIndex(h => norm(h) === norm(nome))
for (const c of ['Nome', 'WhatsApp', 'Lead ID', 'Data']) {
  if (iReal(c) < 0) problemas.push(`o cabeçalho da linha ${LINHA_CABECALHO} não tem a coluna "${c}"`)
}

const cabecalhoFantasma = at(1).slice(COL_FANTASMA_INI).map(String)
const iFant = (nome: string) => cabecalhoFantasma.findIndex(h => norm(h) === norm(nome))
if (iFant('Nome') < 0 || iFant('WhatsApp') < 0) {
  problemas.push(`as colunas fantasma a partir de ${COL_FANTASMA_INI} não têm Nome/WhatsApp`)
}

// As linhas reais são as que ficaram abaixo do cabeçalho.
const reais = new Set<string>()
for (let l = LINHA_CABECALHO + 1; l <= values.length; l++) {
  const r = at(l)
  reais.add(chave(String(r[iReal('Lead ID')] ?? ''), String(r[iReal('WhatsApp')] ?? ''), String(r[iReal('Nome')] ?? '')))
}

// Toda linha fantasma precisa ser (a) vazia nas colunas de verdade e
// (b) cópia de uma linha real. Se UMA sequer não for, abortamos: seria perder
// lead, e nenhum conserto vale isso.
let fantasmas = 0
for (let l = PRIMEIRA_FANTASMA; l <= ULTIMA_FANTASMA; l++) {
  const r = at(l)
  const sujaNoReal = r.slice(0, COL_FANTASMA_INI).some(c => String(c ?? '').trim())
  if (sujaNoReal) { problemas.push(`linha ${l} tem conteúdo nas colunas reais (A..AR) — não é fantasma`); continue }
  const g = r.slice(COL_FANTASMA_INI)
  const k = chave(String(g[iFant('Lead ID')] ?? ''), String(g[iFant('WhatsApp')] ?? ''), String(g[iFant('Nome')] ?? ''))
  if (k === 'nome:') continue // linha em branco
  if (!reais.has(k)) problemas.push(`linha ${l} (${g[iFant('Nome')]}) NÃO tem par abaixo do cabeçalho`)
  fantasmas++
}

// Nada de valor pode estar nas colunas fantasma das linhas reais.
for (let l = LINHA_CABECALHO + 1; l <= values.length; l++) {
  const extra = at(l).slice(COL_FANTASMA_INI).filter(c => String(c ?? '').trim())
  if (extra.length) problemas.push(`linha ${l} tem dado nas colunas fantasma: ${extra.join(' | ')}`)
}

console.log(`\nlinhas fantasma conferidas: ${fantasmas} | linhas reais: ${reais.size}`)
if (problemas.length) {
  console.error('\nABORTADO — a aba não está no estado esperado:')
  for (const p of problemas.slice(0, 20)) console.error('  •', p)
  if (problemas.length > 20) console.error(`  … e mais ${problemas.length - 20}`)
  process.exit(1)
}
console.log('conferência OK: as fantasmas são cópias e as colunas AS..BM estão vazias nas linhas reais.')

if (!APLICAR) {
  console.log('\nSimulação. Rode com --aplicar para:')
  console.log(`  1. apagar as linhas ${PRIMEIRA_FANTASMA}..${ULTIMA_FANTASMA}`)
  console.log(`  2. apagar as colunas ${COL_FANTASMA_INI}..${at(1).length - 1} (AS..BM)`)
  console.log('  3. absorver o lead cru da linha 1 na LEADS GERAIS (absorveDumpsCrusDoMeta)')
  console.log('  4. devolver "Etapa" à coluna A do cabeçalho')
  process.exit(0)
}

// ── 2. Backup do estado atual antes de qualquer escrita ────────────────────
const backup = `outputs/backup-aba-touros-2026-08-14.json`
fs.mkdirSync('outputs', { recursive: true })
fs.writeFileSync(backup, JSON.stringify({ spreadsheetId, tab: TAB, values }, null, 2))
console.log('backup do estado atual:', backup)

// ── 3. Apaga fantasmas (linhas primeiro, depois colunas) ────────────────────
await sheets.spreadsheets.batchUpdate({
  spreadsheetId,
  requestBody: {
    requests: [
      {
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: PRIMEIRA_FANTASMA - 1, endIndex: ULTIMA_FANTASMA },
        },
      },
      {
        deleteDimension: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: COL_FANTASMA_INI, endIndex: at(1).length },
        },
      },
    ],
  },
})
console.log(`\napagadas ${ULTIMA_FANTASMA - PRIMEIRA_FANTASMA + 1} linhas e ${at(1).length - COL_FANTASMA_INI} colunas fantasma.`)

// ── 3. O lead cru da linha 1 volta pelo caminho normal ──────────────────────
const absorvido = await absorveDumpsCrusDoMeta()
console.log('absorveDumpsCrusDoMeta:', JSON.stringify(absorvido))

// ── 4. "Etapa" de volta na coluna A do cabeçalho ────────────────────────────
const cab = ((await sheets.spreadsheets.values.get({
  spreadsheetId, range: `${TAB}!A1:BN1`,
})).data.values ?? [[]])[0] ?? []
if (!String(cab[0] ?? '').trim()) {
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: `${TAB}!A1`, valueInputOption: 'RAW', requestBody: { values: [['Etapa']] },
  })
  console.log('coluna A do cabeçalho: "Etapa" restaurada.')
}

// ── 5. Confere que o dedup voltou a enxergar os leads ───────────────────────
const sync = await syncAbasPorInteresse()
console.log('syncAbasPorInteresse:', JSON.stringify(sync))

const depois = ((await sheets.spreadsheets.values.get({
  spreadsheetId, range: `${TAB}!A1:BN2000`,
})).data.values ?? []) as string[][]
console.log(`\nTOUROS agora: ${depois.length} linhas, ${(depois[0] ?? []).length} colunas`)
console.log('cabeçalho:', JSON.stringify((depois[0] ?? []).slice(0, 24)))
console.log('linha 2   :', JSON.stringify((depois[1] ?? []).slice(0, 12)))
