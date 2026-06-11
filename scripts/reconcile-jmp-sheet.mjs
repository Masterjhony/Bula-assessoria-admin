// Conciliação da planilha "Leads JMP": realinha as linhas cruas do Meta
// (valores despejados a partir da coluna A) para o layout padrão:
//   A-R  = dados padronizados (mesmo formato das linhas da landing)
//   S-AN = metadados do Meta (id, created_time, ad/adset/campaign, lead_status)
// Convenção já usada pelas linhas Meta corretas (ex.: 48, 52, 62, 66, 72).
//
// Preserva: coluna A (Atendido por), cores/formatação (só valores são tocados),
// todas as demais linhas. Cria um backup da aba antes de aplicar.
// Linha de TESTE do Meta (dummy "<test lead...>") é removida (fica no backup).
//
// Uso: node scripts/reconcile-jmp-sheet.mjs           (dry-run, só mostra)
//      node scripts/reconcile-jmp-sheet.mjs --apply   (aplica)
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

// ── mapeamentos Meta → vocabulário da landing (colunas H, I, J, L, R) ──
const MOMENTO = new Map([
    ['não_trabalho,_quero_aprender', 'nao-trabalho-quero-aprender'],
    ['nao_trabalho,_quero_aprender', 'nao-trabalho-quero-aprender'],
    ['trabalho_com_pecuária_de_corte', 'pecuaria-de-corte'],
    ['trabalho_com_pecuaria_de_corte', 'pecuaria-de-corte'],
    ['trabalho_com_corte_e_po', 'corte-e-po'],
    ['sou_criador_renomado_de_po', 'criador-renomado-po'],
])
const CABECAS = new Map([
    ['0-50', '0-50'], ['51-100', '50-100'], ['101-300', '100-300'],
    ['301-500', '300-500'], ['500+', '500+'], ['nenhuma', 'nenhuma'],
])
const INTERESSE = new Map([
    ['bezerras_po', 'bezerras-po'], ['touros_po', 'touros-po'],
    ['matrizes_po', 'matrizes-po'], ['não_sei', 'nao-sei'], ['nao_sei', 'nao-sei'],
])
const NOUN = new Map([
    ['bezerras-po', 'bezerras'], ['touros-po', 'touros'],
    ['matrizes-po', 'matrizes'], ['nao-sei', 'animais'],
])
const QTD = new Map([
    ['0-5', '1 a 5'], ['1-5', '1 a 5'], ['6-10', '6 a 10'],
    ['11-20', '11 a 20'], ['21-50', '21 a 50'], ['50+', 'Mais de 50'],
])
const UF_BY_NAME = new Map(Object.entries({
    'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA', 'ceara': 'CE',
    'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO', 'maranhao': 'MA',
    'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', 'para': 'PA',
    'paraiba': 'PB', 'parana': 'PR', 'pernambuco': 'PE', 'piaui': 'PI', 'rio de janeiro': 'RJ',
    'rio grande do norte': 'RN', 'rio grande do sul': 'RS', 'rondonia': 'RO', 'roraima': 'RR',
    'santa catarina': 'SC', 'sao paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO',
}))
const deaccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
function toUF(state) {
    const s = deaccent(state)
    if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase()
    return UF_BY_NAME.get(s.toLowerCase()) || String(state || '').trim()
}
function fmtPhone(raw) {
    const digits = String(raw || '').replace(/^p:/, '').replace(/\D/g, '').replace(/^55/, '')
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
    return digits ? `(${digits.slice(0, 2)}) ${digits.slice(2)}` : ''
}
function fmtData(iso) {
    const d = new Date(iso)
    if (isNaN(d)) return String(iso || '')
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(d)
}
const strip = (v, p) => String(v || '').startsWith(p) ? String(v).slice(p.length) : String(v || '')

// Campos do Meta na ordem do cabeçalho S..AN (22 campos):
// id, created_time, ad_id, ad_name, adset_id, adset_name, campaign_id,
// campaign_name, form_id, form_name, is_organic, platform, momento, cabecas,
// tem_ie, interesse, qtd, full_name, email, phone, state, lead_status
function parseRaw(row) {
    // offset: id "l:..." pode estar em A (linhas novas) ou B (linha deslocada
    // pela inserção histórica da coluna A) — nesse caso A guarda "Atendido por".
    let off = null, atendidoPor = ''
    if (/^l:\d+/.test(String(row[0] || ''))) off = 0
    else if (/^l:\d+/.test(String(row[1] || ''))) { off = 1; atendidoPor = String(row[0] || '').trim() }
    if (off == null) return null
    const f = (i) => String(row[off + i] ?? '').trim()
    return {
        atendidoPor,
        id: strip(f(0), 'l:'), created: f(1), adId: strip(f(2), 'ag:'), adName: f(3),
        adsetId: strip(f(4), 'as:'), adsetName: f(5), campaignId: strip(f(6), 'c:'), campaignName: f(7),
        formId: strip(f(8), 'f:'), formName: f(9), isOrganic: f(10), platform: f(11),
        momento: f(12), cabecas: f(13), temIe: f(14), interesse: f(15), qtd: f(16),
        fullName: f(17), email: f(18), phone: f(19), state: f(20),
        leadStatus: String(row[39] ?? '').trim() || f(21) || 'CREATED', // AN quando presente
    }
}
const isTestLead = (p) => /test lead|dummy data/i.test([p.fullName, p.momento, p.email].join(' ')) || p.email === 'test@meta.com'

function buildRow(p) {
    const interesse = INTERESSE.get(p.interesse.toLowerCase()) || p.interesse
    // Interesse fora do vocabulário da landing (ex.: "sêmen", só no form do
    // Meta): mantém o rótulo cru e a quantidade sem substantivo ("1 a 5").
    const noun = NOUN.get(interesse) || ''
    const qtdBase = QTD.get(p.qtd)
    const out = Array.from({ length: 40 }, () => '') // A..AN
    out[0] = p.atendidoPor                                      // A  Atendido por (preservado)
    out[1] = fmtData(p.created)                                 // B  Data
    out[2] = p.fullName                                         // C  Nome
    out[3] = p.email                                            // D  E-mail
    out[4] = fmtPhone(p.phone)                                  // E  WhatsApp
    out[5] = toUF(p.state)                                      // F  UF
    out[6] = ''                                                 // G  Cidade (Meta não coleta)
    out[7] = MOMENTO.get(p.momento.toLowerCase()) || p.momento  // H  Momento
    out[8] = CABECAS.get(p.cabecas) || p.cabecas                // I  Cabeças
    out[9] = interesse                                          // J  Interesse
    out[10] = ''                                                // K  Lead ID (CRM — preenchido na importação)
    out[11] = qtdBase ? `${qtdBase}${noun ? ' ' + noun : ''}` : p.qtd // L  Qtd. desejada
    out[12] = p.platform                                        // M  utm_source (ig/fb)
    out[13] = ''                                                // N  utm_medium
    out[14] = p.campaignName                                    // O  utm_campaign
    out[15] = p.adName                                          // P  utm_content
    out[16] = p.adId                                            // Q  ad-id
    out[17] = p.temIe ? (p.temIe.toLowerCase() === 'sim' ? 'Sim' : 'Não') : '' // R  Inscrição Estadual
    // S..AD: metadados Meta (convenção das linhas já corretas)
    out[18] = p.id; out[19] = p.created; out[20] = p.adId; out[21] = p.adName
    out[22] = p.adsetId; out[23] = p.adsetName; out[24] = p.campaignId; out[25] = p.campaignName
    out[26] = p.formId; out[27] = p.formName; out[28] = p.isOrganic; out[29] = p.platform
    out[39] = p.leadStatus                                      // AN lead_status
    return out
}

// ── lê a planilha ──
const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A1:AN400` })
const values = res.data.values ?? []
const raws = [], normals = []
values.forEach((row, i) => {
    if (i === 0) return
    const p = parseRaw(row)
    if (p) raws.push({ rowNum: i + 1, p })
    else if (row.some(c => String(c).trim())) normals.push({ rowNum: i + 1, row })
})

console.log(`Linhas cruas do Meta encontradas: ${raws.length}`)

// duplicatas vs linhas normais (email/telefone)
const seen = new Set()
for (const { row } of normals) {
    const email = String(row[3] || '').trim().toLowerCase()
    const fone = String(row[4] || '').replace(/\D/g, '')
    if (email) seen.add('e:' + email)
    if (fone) seen.add('f:' + fone)
}

const plans = []
for (const { rowNum, p } of raws) {
    if (isTestLead(p)) { plans.push({ rowNum, action: 'EXCLUIR (lead de TESTE do Meta)', p }); continue }
    const dupe = seen.has('e:' + p.email.toLowerCase()) || seen.has('f:' + fmtPhone(p.phone).replace(/\D/g, ''))
    plans.push({ rowNum, action: 'REALINHAR' + (dupe ? ' (⚠ possível duplicata)' : ''), p, newRow: buildRow(p) })
}

for (const plan of plans) {
    console.log(`\nLinha ${plan.rowNum}: ${plan.action}`)
    if (plan.newRow) {
        const r = plan.newRow
        console.log(`  A(Atendido)="${r[0]}" B(Data)="${r[1]}" C(Nome)="${r[2]}" D(Email)="${r[3]}" E(Whats)="${r[4]}" F(UF)="${r[5]}"`)
        console.log(`  H(Momento)="${r[7]}" I(Cabeças)="${r[8]}" J(Interesse)="${r[9]}" L(Qtd)="${r[11]}" M(utm_source)="${r[12]}" O(utm_campaign)="${r[14]}" P(utm_content)="${r[15]}" R(IE)="${r[17]}"`)
    } else {
        console.log(`  (dummy: nome="${plan.p.fullName}" email="${plan.p.email}")`)
    }
}

if (!APPLY) { console.log('\nDRY-RUN — nada foi alterado. Rode com --apply para aplicar.'); process.exit(0) }

const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
const tabSheet = meta.data.sheets.find(s => s.properties.title === TAB)

// ── backup da aba inteira (valores + formatação), salvo com --no-backup ──
if (!process.argv.includes('--no-backup')) {
    const stamp = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date()).replace(/[/:]/g, '-').replace(', ', ' ')
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ duplicateSheet: { sourceSheetId: tabSheet.properties.sheetId, newSheetName: `Backup ${stamp}` } }] },
    })
    console.log(`\n[backup] aba "Backup ${stamp}" criada`)
}

// ── aplica realinhamentos (valores apenas — formatação/cores intactas) ──
for (const plan of plans.filter(pl => pl.newRow)) {
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB}!A${plan.rowNum}:AN${plan.rowNum}`,
        valueInputOption: 'RAW',
        requestBody: { values: [plan.newRow] },
    })
    console.log(`[apply] linha ${plan.rowNum} realinhada`)
}

// ── exclui linhas de teste (de baixo pra cima, índices estáveis) ──
const toDelete = plans.filter(pl => !pl.newRow).sort((a, b) => b.rowNum - a.rowNum)
for (const plan of toDelete) {
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [{
                deleteDimension: {
                    range: { sheetId: tabSheet.properties.sheetId, dimension: 'ROWS', startIndex: plan.rowNum - 1, endIndex: plan.rowNum },
                },
            }],
        },
    })
    console.log(`[apply] linha ${plan.rowNum} (teste) excluída`)
}

console.log('\nConciliação aplicada com sucesso.')
