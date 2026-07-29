// Retroage os leads que já estão SÓ na aba "LEADS SAO GERALDO" para a aba-arquivo
// "LEADS BULA - PERPETUO", marcados com o form_name do lançamento.
//
// Por que só a aba-arquivo: quem distribui para "LEADS TOUROS" / "LEADS DOUGLAS"
// / "LEADS JOAO ANTONIO" é syncTourosLandingTabs() (src/lib/jmp-sheets.ts), que
// relê a aba-arquivo a cada passada do cron /api/jmp/sheet-perpetuo. Duplicar
// essa lógica aqui é o caminho curto para as duas divergirem — este script só
// coloca o lead na fonte e deixa o cron fazer o resto (ou rode o cron na mão).
//
// Idempotente pelo Lead ID: rodar de novo não duplica.
//
// Uso:
//   node scripts/backfill-saogeraldo-perpetuo.mjs           → dry-run (só relata)
//   node scripts/backfill-saogeraldo-perpetuo.mjs --apply    → grava de verdade
import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')

const SG_TAB = 'LEADS SAO GERALDO'
const PERPETUO_TAB = 'LEADS BULA - PERPETUO'
// Precisa bater EXATAMENTE com SAO_GERALDO_FORM_NAME em src/lib/jmp-sheets.ts —
// é a chave que a varredura usa para reconhecer o lead do lançamento.
const FORM_NAME = 'Landing Leilão Touros São Geraldo e 7P'

const norm = v => String(v || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '')

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
const titles = (meta.data.sheets ?? []).map(s => s.properties?.title)
for (const t of [SG_TAB, PERPETUO_TAB]) {
  if (!titles.includes(t)) { console.error(`aba "${t}" não existe`); process.exit(1) }
}
const perpetuoSheetId = (meta.data.sheets ?? [])
  .find(s => s.properties?.title === PERPETUO_TAB).properties.sheetId

// ── Origem: a aba do lançamento ──────────────────────────────────────────────
const sgVals = (await sheets.spreadsheets.values.get({
  spreadsheetId, range: `${SG_TAB}!A1:AZ`,
})).data.values ?? []
const sgHeader = (sgVals[0] ?? []).map(h => norm(h))
const sgCol = name => sgHeader.indexOf(norm(name))
const at = (row, i) => (i >= 0 ? String(row[i] ?? '').trim() : '')

const iSg = {
  data: sgCol('Data'), nome: sgCol('Nome'), whatsapp: sgCol('WhatsApp'), email: sgCol('E-mail'),
  uf: sgCol('UF'), cidade: sgCol('Cidade'), momento: sgCol('Momento'), cabecas: sgCol('Cabeças'),
  ie: sgCol('Inscrição Estadual'), qtd: sgCol('Qtd. de touros'), leadId: sgCol('Lead ID'),
  utmSource: sgCol('utm_source'), utmCampaign: sgCol('utm_campaign'),
  utmContent: sgCol('utm_content'), adId: sgCol('ad-id'),
}
if (iSg.nome < 0 || iSg.leadId < 0) {
  console.error(`aba "${SG_TAB}" sem coluna Nome/Lead ID — layout inesperado`); process.exit(1)
}

// ── Destino: Lead IDs já presentes na aba-arquivo (dedup) ────────────────────
const pHeader = ((await sheets.spreadsheets.values.get({
  spreadsheetId, range: `${PERPETUO_TAB}!A1:BL1`,
})).data.values ?? [[]])[0] ?? []
const pNorm = pHeader.map(h => norm(h))
const iLeadId = pNorm.indexOf(norm('Lead ID'))
if (iLeadId < 0) { console.error(`aba "${PERPETUO_TAB}" sem coluna "Lead ID"`); process.exit(1) }
const colLetter = n => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) } return s }
const idCol = colLetter(iLeadId + 1)
const jaTem = new Set((((await sheets.spreadsheets.values.get({
  spreadsheetId, range: `${PERPETUO_TAB}!${idCol}2:${idCol}`,
})).data.values ?? [])).map(r => String(r[0] ?? '').trim()).filter(Boolean))

/** "31/07/2026 14:05" (pt-BR, como fmtDate grava) → ISO. Sem data → ''. */
function isoDeDataBr(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2}))?/.exec(String(s ?? '').trim())
  if (!m) return ''
  const [, dd, mm, yyyy, hh = '00', mi = '00'] = m
  // A aba grava em America/Sao_Paulo (UTC−3); o created_time do PERPETUO é ISO.
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:00-03:00`
}

const novos = []
const pulados = []
for (const r of sgVals.slice(1)) {
  if (!r.some(c => String(c ?? '').trim())) continue
  const leadId = at(r, iSg.leadId)
  const nome = at(r, iSg.nome)
  if (!nome) continue
  if (leadId && jaTem.has(leadId)) { pulados.push(nome); continue }
  if (leadId) jaTem.add(leadId)

  const utmSource = at(r, iSg.utmSource)
  const qtd = at(r, iSg.qtd)
  const ie = at(r, iSg.ie)
  const valores = new Map(Object.entries({
    'Atendido por': '',
    'Data': at(r, iSg.data),
    'Nome': nome,
    'E-mail': at(r, iSg.email),
    'WhatsApp': at(r, iSg.whatsapp),
    'UF': at(r, iSg.uf),
    'Cidade': at(r, iSg.cidade),
    'Momento': at(r, iSg.momento),
    'Cabeças': at(r, iSg.cabecas),
    'Inscrição Estadual': ie,
    'Interesse': 'touros-po',
    'Lead ID': leadId,
    'Qtd. desejada': qtd,
    'utm_source': utmSource,
    'utm_medium': '',
    'utm_campaign': at(r, iSg.utmCampaign),
    'utm_content': at(r, iSg.utmContent),
    'ad-id': at(r, iSg.adId),
    'id': leadId,
    'created_time': isoDeDataBr(at(r, iSg.data)),
    'ad_id': at(r, iSg.adId),
    'ad_name': at(r, iSg.utmContent),
    'campaign_name': at(r, iSg.utmCampaign),
    'form_name': FORM_NAME,
    'platform': utmSource || 'site',
    'seu_momento_na_pecuaria': at(r, iSg.momento),
    'você_tem_inscrição_estadual?': ie,
    'qual_o_seu_interesse?': 'touros-po',
    'de_acordo_com_seu_interesse,_qual_a_quantidade_de_animais_desejada?': qtd,
    'full_name': nome,
    'email': at(r, iSg.email),
    'phone': at(r, iSg.whatsapp),
    'state': at(r, iSg.uf),
    'lead de teste': 'Não',
    'lead_status': 'CREATED',
  }).map(([k, v]) => [norm(k), v]))
  novos.push({ nome, uf: at(r, iSg.uf), linha: pHeader.map(h => valores.get(norm(h)) ?? '') })
}

console.log(`aba "${SG_TAB}": ${sgVals.length - 1} linhas`)
console.log(`já na aba-arquivo: ${pulados.length}`)
console.log(`a retroagir: ${novos.length}`)
for (const n of novos.slice(0, 10)) console.log(`  • ${n.nome} (${n.uf || 'sem UF'})`)
if (novos.length > 10) console.log(`  … +${novos.length - 10}`)

if (!novos.length) { console.log('nada a fazer.'); process.exit(0) }
if (!APPLY) { console.log('\ndry-run — rode com --apply para gravar.'); process.exit(0) }

await sheets.spreadsheets.batchUpdate({
  spreadsheetId,
  requestBody: {
    requests: [{
      appendCells: {
        sheetId: perpetuoSheetId,
        rows: novos.map(n => ({
          values: n.linha.map(v => (v ? { userEnteredValue: { stringValue: String(v) } } : {})),
        })),
        fields: 'userEnteredValue',
      },
    }],
  },
})
console.log(`\n✓ ${novos.length} leads gravados em "${PERPETUO_TAB}".`)
console.log('Agora rode o cron para distribuir nas abas de trabalho:')
console.log('  curl -H "Authorization: Bearer $CRON_SECRET" https://bulaassessoria.com/api/jmp/sheet-perpetuo')
