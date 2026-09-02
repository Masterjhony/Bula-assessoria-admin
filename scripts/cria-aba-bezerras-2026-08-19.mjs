/**
 * Cria a aba BEZERRAS na planilha de leads e move para ela os leads de
 * "Bezerras PO" que hoje vivem na FEMEAS.
 *
 * Por que existe: até 19/08/2026 abaDoInteresse() mandava bezerras E matrizes
 * para a mesma aba (bezerra também é fêmea). O dono pediu a separação — é outro
 * produto e outra conversa. O código já foi mudado (src/lib/jmp-sheets.ts), mas
 * o cron é APPEND-ONLY: sem este script os leads de bezerras ficariam nas duas
 * abas (velhos na FEMEAS, novos na BEZERRAS).
 *
 * Como move sem perder nada: duplica a aba FEMEAS (duplicateSheet preserva
 * formatação, cor das linhas, validação da coluna "Etapa", largura e filtro),
 * apaga da cópia tudo que NÃO é bezerra e da FEMEAS tudo que É. Depois remove
 * da BEZERRAS as colunas da fila do SDR de fêmeas que ficaram vazias — elas são
 * de outro funil.
 *
 * Uso:  node scripts/cria-aba-bezerras-2026-08-19.mjs           (simulação)
 *       node scripts/cria-aba-bezerras-2026-08-19.mjs --apply
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { google } from 'googleapis'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const ORIGEM = 'FEMEAS'
const DESTINO = 'BEZERRAS'
/** Colunas que só existem na FEMEAS (fila do SDR). Ver FEMEAS_COLUNAS_PROPRIAS. */
const COLUNAS_SDR_FEMEAS = [
  'CPF/CNPJ', 'Categoria de interesse', 'Projeto', 'Régua automática',
  '1º toque em', 'Aprovado', 'Motivo da recusa', 'Reunião agendada', 'Assessor da reunião',
]

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)

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
const S = v => String(v ?? '').trim()
const norm = v => S(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
const abas = meta.data.sheets.map(s => s.properties)
const femeas = abas.find(p => p.title === ORIGEM)
if (!femeas) throw new Error(`aba ${ORIGEM} não existe na planilha`)
if (abas.some(p => p.title === DESTINO)) {
  throw new Error(`a aba ${DESTINO} já existe — este script só roda uma vez. Confira à mão antes de repetir.`)
}

const vals = (await sheets.spreadsheets.values.get({
  spreadsheetId, range: `'${ORIGEM}'!A1:BZ20000`,
})).data.values ?? []
if (vals.length < 2) throw new Error(`aba ${ORIGEM} vazia`)

const head = vals[0].map(S)
const iInteresse = head.findIndex(h => norm(h) === 'interesse')
if (iInteresse < 0) throw new Error(`aba ${ORIGEM} sem coluna "Interesse"`)

// Índices 0-based de linha de DADOS (linha da planilha = índice + 2).
const linhas = vals.slice(1)
const ehBezerra = r => /bezerr/i.test(S(r[iInteresse]))
const temConteudo = r => r.some(c => S(c) !== '')
const idxBezerras = [], idxOutras = []
linhas.forEach((r, i) => {
  if (!temConteudo(r)) return
  ;(ehBezerra(r) ? idxBezerras : idxOutras).push(i)
})

console.log(`${ORIGEM}: ${linhas.filter(temConteudo).length} leads — ${idxBezerras.length} de bezerras, ${idxOutras.length} ficam.`)
if (!idxBezerras.length) { console.log('Nada a mover.'); process.exit(0) }

const contagem = {}
for (const i of idxBezerras) {
  const k = S(linhas[i][iInteresse]) || '(vazio)'
  contagem[k] = (contagem[k] ?? 0) + 1
}
console.log('Interesses que vão para a BEZERRAS:', contagem)

// Colunas do SDR que estão vazias em TODAS as linhas que vão sair: só essas
// somem da aba nova (se alguma tiver dado, o dado viaja junto).
const colsSdrVazias = COLUNAS_SDR_FEMEAS
  .map(nome => ({ nome, i: head.findIndex(h => norm(h) === norm(nome)) }))
  .filter(c => c.i >= 0 && idxBezerras.every(r => S(linhas[r][c.i]) === ''))
console.log(`Colunas do SDR removidas da ${DESTINO}: ${colsSdrVazias.map(c => c.nome).join(', ') || '(nenhuma)'}`)

if (!APPLY) {
  console.log('\nSIMULAÇÃO — nada foi escrito. Rode com --apply para aplicar.')
  process.exit(0)
}

// Backup do estado atual da FEMEAS antes de mexer.
mkdirSync('outputs', { recursive: true })
const backup = `outputs/backup-aba-femeas-antes-bezerras-2026-08-19.json`
writeFileSync(backup, JSON.stringify({ tab: ORIGEM, head, rows: linhas }, null, 2), 'utf-8')
console.log(`Backup: ${backup}`)

/** Faixas contíguas [inicio, fim) em índices de linha de dados, de baixo p/ cima. */
const faixas = idxs => {
  const s = [...idxs].sort((a, b) => a - b)
  const out = []
  for (const i of s) {
    const ultima = out[out.length - 1]
    if (ultima && ultima[1] === i) ultima[1] = i + 1
    else out.push([i, i + 1])
  }
  return out.reverse()
}
/** deleteDimension em ROWS, considerando o cabeçalho (linha 0 da grade). */
const deleteLinhas = (sheetId, idxs) => faixas(idxs).map(([a, b]) => ({
  deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: a + 1, endIndex: b + 1 } },
}))

// 1) Duplica a FEMEAS logo ao lado dela, já com o nome final.
const dup = await sheets.spreadsheets.batchUpdate({
  spreadsheetId,
  requestBody: {
    requests: [{
      duplicateSheet: {
        sourceSheetId: femeas.sheetId,
        insertSheetIndex: femeas.index + 1,
        newSheetName: DESTINO,
      },
    }],
  },
})
const novoId = dup.data.replies[0].duplicateSheet.properties.sheetId
console.log(`Aba ${DESTINO} criada (sheetId ${novoId}).`)

// 2) Na BEZERRAS: fora tudo que não é bezerra + as colunas do SDR vazias.
const limpezaDestino = [
  ...deleteLinhas(novoId, idxOutras),
  ...colsSdrVazias.map(c => c.i).sort((a, b) => b - a).map(i => ({
    deleteDimension: { range: { sheetId: novoId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 } },
  })),
]
await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: limpezaDestino } })
console.log(`${DESTINO}: ${idxOutras.length} linhas de matrizes removidas, ${colsSdrVazias.length} colunas do SDR removidas.`)

// 3) Na FEMEAS: fora as bezerras (agora já estão salvas na aba nova).
await sheets.spreadsheets.batchUpdate({
  spreadsheetId,
  requestBody: { requests: deleteLinhas(femeas.sheetId, idxBezerras) },
})
console.log(`${ORIGEM}: ${idxBezerras.length} linhas de bezerras removidas.`)

// 4) Confere o que ficou em cada aba.
for (const tab of [ORIGEM, DESTINO]) {
  const v = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!A1:BZ20000` })).data.values ?? []
  const h = (v[0] ?? []).map(S)
  const ii = h.findIndex(x => norm(x) === 'interesse')
  const dados = v.slice(1).filter(r => r.some(c => S(c) !== ''))
  const porInteresse = {}
  for (const r of dados) { const k = S(r[ii]) || '(vazio)'; porInteresse[k] = (porInteresse[k] ?? 0) + 1 }
  console.log(`${tab}: ${dados.length} leads`, porInteresse)
}
