// Resgata os leads do FORMULÁRIO INSTANTÂNEO do Meta que o conector despejou
// CRUS na aba "LEADS TOUROS", e regrava normalizados na "LEADS SAO GERALDO".
//
// POR QUE ELES EXISTEM: a entrega do Formulário Instantâneo do conjunto
// "LEADS - SAO GERALDO" foi apontada para a aba de trabalho em vez da aba bruta
// que o normalizador varre. O conector escreve por POSIÇÃO, e a aba tem outro
// cabeçalho — então a linha inteira entra deslocada:
//
//   coluna A "Etapa"         recebe  l:<id>
//   coluna B "Atendido por"  recebe  created_time (ISO)
//   coluna D "Nome"          recebe  ad_name
//   coluna E "WhatsApp"      recebe  as:<adset_id>
//   coluna H "Zona"          recebe  campaign_name
//
// O lead vira invisível: não aparece para assessor nenhum porque nem o nome
// está na coluna Nome. Ver .planning/leilao-sao-geraldo/LEADS-INSTANTFORM-DESALINHADOS.md
//
// ESTE SCRIPT NÃO CONSERTA A ORIGEM. Enquanto a entrega do Instant Form não for
// reapontada no Meta, lead novo continua caindo desalinhado. Isto aqui é o
// resgate do que já caiu.
//
// NÃO APAGA NADA. Grava na aba certa e imprime quais linhas da LEADS TOUROS
// devem ser apagadas à mão, depois de você conferir.
//
// Idempotente pelo `id` do Meta (que é estável): rodar de novo não duplica.
//
// Uso:
//   node scripts/resgata-leads-instantform-saogeraldo.mjs            → dry-run
//   node scripts/resgata-leads-instantform-saogeraldo.mjs --apply
//   node scripts/resgata-leads-instantform-saogeraldo.mjs --tab "LEADS DOUGLAS"
import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const tabArg = process.argv.indexOf('--tab')
const ORIGEM = tabArg > -1 ? process.argv[tabArg + 1] : 'LEADS TOUROS'
const DESTINO = 'LEADS SAO GERALDO'

// ── MAPA DAS RESPOSTAS DO FORMULÁRIO ────────────────────────────────────────
// As posições 0-11 são metadados do Meta e são fixas. As de 12 em diante são as
// RESPOSTAS, e a ordem delas depende de como cada formulário instantâneo foi
// montado. O default abaixo é o do formulário do PERPÉTUO (o mesmo que
// parseRawMetaLead() assume em src/lib/jmp-sheets.ts:462-463).
//
// O do São Geraldo pode ser diferente. O dry-run imprime a linha crua indexada
// exatamente para você conferir antes de gravar. Se estiver trocado, ajuste
// AQUI — é o único lugar que precisa mudar.
const MAPA = {
  momento: 12, cabecas: 13, temIe: 14, interesse: 15, qtd: 16,
  fullName: 17, email: 18, phone: 19, state: 20,
}

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

const norm = (s) => String(s ?? '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const strip = (s, p) => (String(s ?? '').startsWith(p) ? String(s).slice(p.length) : String(s ?? ''))
const colName = (n) => { let s = '', x = n; while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26) } return s }

// Mesma régua de MQL do servidor: ≥100 cabeças E tem inscrição estadual.
const ehMql = (cabecas, ie) => {
  const piso = Number(String(cabecas ?? '').replace(/\./g, '').match(/\d+/)?.[0] ?? 0)
  return piso >= 100 && norm(ie) === 'sim'
}

const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
const titulos = (meta.data.sheets ?? []).map(s => s.properties?.title)
if (!titulos.includes(ORIGEM)) { console.error(`aba "${ORIGEM}" não existe`); process.exit(1) }
if (!titulos.includes(DESTINO)) { console.error(`aba "${DESTINO}" não existe`); process.exit(1) }

const cruas = ((await sheets.spreadsheets.values.get({
  spreadsheetId, range: `${ORIGEM}!A2:AN`,
})).data.values ?? [])

// Linha crua do Meta = id "l:<n>" na coluna A E timestamp ISO na coluna B.
// Mesma detecção de parseRawMetaLead(); as duas condições juntas para não
// confundir com uma célula que a equipe tenha digitado.
const alvos = []
cruas.forEach((row, i) => {
  if (!/^l:\d+/.test(String(row[0] ?? ''))) return
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(row[1] ?? ''))) return
  alvos.push({ linha: i + 2, row })
})

console.log(`aba "${ORIGEM}": ${cruas.length} linhas, ${alvos.length} cruas do Meta\n`)
if (!alvos.length) { console.log('nada a resgatar.'); process.exit(0) }

const headerDestino = ((await sheets.spreadsheets.values.get({
  spreadsheetId, range: `${DESTINO}!1:1`,
})).data.values ?? [[]])[0].map(String)
const idx = (nome) => headerDestino.findIndex(h => norm(h) === norm(nome))

// Já presentes no destino, pelo Lead ID — idempotência.
const jaLa = new Set()
const iLead = idx('Lead ID')
if (iLead >= 0) {
  const rows = ((await sheets.spreadsheets.values.get({
    spreadsheetId, range: `${DESTINO}!A2:${colName(headerDestino.length)}`,
  })).data.values ?? [])
  for (const r of rows) { const v = String(r[iLead] ?? '').trim(); if (v) jaLa.add(v) }
}

const novas = []
const resumo = []
for (const { linha, row } of alvos) {
  const f = (i) => String(row[i] ?? '').trim()
  const id = strip(f(0), 'l:')
  const p = {
    id, created: f(1), adId: strip(f(2), 'ag:'), adName: f(3),
    campaignName: f(7), formName: f(9), platform: f(11),
    momento: f(MAPA.momento), cabecas: f(MAPA.cabecas), temIe: f(MAPA.temIe),
    qtd: f(MAPA.qtd), fullName: f(MAPA.fullName), email: f(MAPA.email),
    phone: f(MAPA.phone), state: f(MAPA.state),
  }

  console.log(`── linha ${linha} · id ${id} · ${p.campaignName}`)
  // Dump indexado: é isto que você confere antes do --apply. Se [17] não for
  // nome de gente e [19] não for telefone, o MAPA do topo está errado.
  row.forEach((c, i) => { const v = String(c ?? '').trim(); if (v) console.log(`   [${i}] ${v}`) })

  if (jaLa.has(id)) { console.log('   → já está na LEADS SAO GERALDO, pulando\n'); continue }

  const mql = ehMql(p.cabecas, p.temIe)
  const out = Array.from({ length: headerDestino.length }, () => '')
  const set = (nome, valor) => { const i = idx(nome); if (i >= 0) out[i] = String(valor ?? '') }
  set('Data', p.created ? new Date(p.created).toLocaleString('pt-BR') : '')
  set('Nome', p.fullName)
  set('WhatsApp', p.phone)
  set('E-mail', p.email)
  set('UF', p.state)
  set('Momento', p.momento)
  set('Cabeças', p.cabecas)
  set('Inscrição Estadual', p.temIe)
  set('Qtd. de touros', p.qtd)
  set('Lead ID', id)
  set('utm_source', p.platform)
  set('utm_campaign', p.campaignName)
  set('utm_content', p.adName)
  set('ad-id', p.adId)
  set('Observações', `resgatado de ${ORIGEM} linha ${linha} · instant form "${p.formName}"`)

  novas.push(out)
  resumo.push({ linha, id, nome: p.fullName, whatsapp: p.phone, mql })
  console.log(`   → ${p.fullName || '(sem nome no MAPA atual)'} · ${p.phone || '(sem telefone)'} · ${mql ? 'MQL' : 'lead'}\n`)
}

console.log('─'.repeat(60))
console.table(resumo)
console.log(`${novas.length} para gravar em "${DESTINO}" · ${alvos.length - novas.length} já lá`)

if (!APPLY) {
  console.log('\nDRY-RUN. Confira o dump indexado acima (o [17] é nome? o [19] é telefone?).')
  console.log('Se estiver certo: rode de novo com --apply')
  process.exit(0)
}
if (!novas.length) { console.log('nada novo a gravar.'); process.exit(0) }

const destinoId = (meta.data.sheets ?? []).find(s => s.properties?.title === DESTINO).properties.sheetId
await sheets.spreadsheets.batchUpdate({
  spreadsheetId,
  requestBody: {
    requests: [{
      appendCells: {
        sheetId: destinoId,
        rows: novas.map(r => ({ values: r.map(v => (v ? { userEnteredValue: { stringValue: v } } : {})) })),
        fields: 'userEnteredValue',
      },
    }],
  },
})
console.log(`\n✓ ${novas.length} linhas gravadas em "${DESTINO}"`)
console.log(`\nAgora, À MÃO em "${ORIGEM}", apague as linhas: ${resumo.map(r => r.linha).join(', ')}`)
console.log('(o script não apaga nada de propósito — a aba é da equipe)')
