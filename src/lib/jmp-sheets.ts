import { google } from 'googleapis'
import { supabaseAdmin } from './supabase'

// Integração com Google Sheets: cada lead do formulário JMP vira uma linha na
// aba "Leads JMP" de uma planilha criada pela service account (a mesma de
// GA4/Calendar). O id da planilha fica em jmp_config(key='sheets').

const CONFIG_KEY = 'sheets'
const TAB = 'Leads JMP'
const SHARE_EMAIL = 'formuladoboi@gmail.com'
const MANUAL_HEADER = 'Atendido por'
const HEADER = ['Data', 'Nome', 'E-mail', 'WhatsApp', 'UF', 'Cidade', 'Momento', 'Cabeças', 'Interesse', 'Lead ID', 'Qtd. desejada', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ad-id', 'Inscrição Estadual'] as const
const SHEET_HEADER = [MANUAL_HEADER, ...HEADER] as const
const HEADER_READ_COLUMNS = 64

type SheetsClient = ReturnType<typeof google.sheets>
type HeaderName = (typeof HEADER)[number]
type HeaderLayout = {
  headerRow: string[]
  indexes: Map<HeaderName, number>
  lastColumn: number
}

/**
 * Interpreta o JSON da service account tolerando o formato "colado errado":
 * o valor salvo no painel da Vercel pode vir com quebras de linha REAIS dentro
 * da string do private_key (JSON inválido — foi a causa de a planilha parar de
 * receber leads silenciosamente). Fallback: extrai client_email/private_key
 * por regex direto do texto.
 */
function parseServiceAccount(raw: string): { client_email: string; private_key: string } | null {
  try {
    return JSON.parse(raw) as { client_email: string; private_key: string }
  } catch { /* tenta o fallback abaixo */ }
  const email = raw.match(/"client_email"\s*:\s*"([^"]+)"/)?.[1]
  const key = raw.match(/"private_key"\s*:\s*"([\s\S]*?)"\s*[,}]/)?.[1]
  if (!email || !key) return null
  return { client_email: email, private_key: key }
}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  const creds = parseServiceAccount(raw)
  if (!creds) {
    // Loga ALTO: sem isso a integração morre silenciosa e leads somem da planilha.
    console.error('[jmp-sheets] GOOGLE_SERVICE_ACCOUNT_JSON inválido (JSON não parseia) — integração com a planilha DESATIVADA.')
    return null
  }
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, '\n'),
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  })
}

function columnName(index: number): string {
  let n = index
  let name = ''
  while (n > 0) {
    const mod = (n - 1) % 26
    name = String.fromCharCode(65 + mod) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

function normalizeHeaderText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

const HEADER_ALIASES = new Map<string, HeaderName>(
  HEADER.map((header) => [normalizeHeaderText(header), header]),
)

HEADER_ALIASES.set('email', 'E-mail')
HEADER_ALIASES.set('whats', 'WhatsApp')
HEADER_ALIASES.set('whatsapp', 'WhatsApp')
HEADER_ALIASES.set('leadid', 'Lead ID')
HEADER_ALIASES.set('qtd', 'Qtd. desejada')
HEADER_ALIASES.set('qtddesejada', 'Qtd. desejada')
HEADER_ALIASES.set('quantidadedesejada', 'Qtd. desejada')
HEADER_ALIASES.set('adid', 'ad-id')
HEADER_ALIASES.set('inscricaoestadual', 'Inscrição Estadual')

function resolveHeaderName(value: string): HeaderName | null {
  return HEADER_ALIASES.get(normalizeHeaderText(value)) ?? null
}

function isManualHeader(value: string): boolean {
  return normalizeHeaderText(value) === normalizeHeaderText(MANUAL_HEADER)
}

function getHeaderLayout(headerRow: string[]): HeaderLayout {
  const indexes = new Map<HeaderName, number>()
  headerRow.forEach((value, index) => {
    const header = resolveHeaderName(value)
    if (header && !indexes.has(header)) indexes.set(header, index)
  })

  const maxHeaderIndex = Math.max(-1, ...Array.from(indexes.values()))
  return {
    headerRow,
    indexes,
    lastColumn: Math.max(headerRow.length, maxHeaderIndex + 1, SHEET_HEADER.length),
  }
}

async function readHeaderRow(sheets: SheetsClient, spreadsheetId: string): Promise<string[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TAB}!A1:${columnName(HEADER_READ_COLUMNS)}1`,
  })
  return ((res.data.values?.[0] ?? []) as unknown[]).map((value) => String(value ?? '').trim())
}

async function updateHeaderRow(sheets: SheetsClient, spreadsheetId: string, headerRow: string[]): Promise<void> {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB}!A1:${columnName(headerRow.length)}1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headerRow] },
  })
}

async function getTabSheetId(sheets: SheetsClient, spreadsheetId: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
  const tab = meta.data.sheets?.find((sheet) => sheet.properties?.title === TAB)
  const sheetId = tab?.properties?.sheetId
  if (sheetId == null) throw new Error(`Aba "${TAB}" não encontrada.`)
  return sheetId
}

function isLegacyHeaderStartingAtColumnA(headerRow: string[]): boolean {
  return HEADER.slice(0, 3).every((header, index) => resolveHeaderName(headerRow[index] ?? '') === header)
}

async function ensureSheetLayout(sheets: SheetsClient, spreadsheetId: string): Promise<HeaderLayout> {
  let headerRow = await readHeaderRow(sheets, spreadsheetId)

  if (!headerRow.some(Boolean)) {
    const initial = [...SHEET_HEADER]
    await updateHeaderRow(sheets, spreadsheetId, initial)
    return getHeaderLayout(initial)
  }

  if (isLegacyHeaderStartingAtColumnA(headerRow)) {
    const sheetId = await getTabSheetId(sheets, spreadsheetId)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          insertDimension: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
            inheritFromBefore: false,
          },
        }],
      },
    })
    headerRow = await readHeaderRow(sheets, spreadsheetId)
  }

  const nextHeader = [...headerRow]
  if (!nextHeader[0]?.trim() || isManualHeader(nextHeader[0])) {
    nextHeader[0] = MANUAL_HEADER
  }

  let layout = getHeaderLayout(nextHeader)
  for (const [index, header] of HEADER.entries()) {
    if (layout.indexes.has(header)) continue

    const preferredIndex = index + 1
    if (!String(nextHeader[preferredIndex] ?? '').trim()) {
      nextHeader[preferredIndex] = header
    } else {
      nextHeader.push(header)
    }
    layout = getHeaderLayout(nextHeader)
  }

  if (nextHeader.join('\u0000') !== headerRow.join('\u0000')) {
    await updateHeaderRow(sheets, spreadsheetId, nextHeader)
  }

  return getHeaderLayout(nextHeader)
}

export interface SheetInfo {
  spreadsheetId: string
  url: string
}

async function getStoredInfo(): Promise<SheetInfo | null> {
  const { data } = await supabaseAdmin()
    .from('jmp_config')
    .select('value')
    .eq('key', CONFIG_KEY)
    .maybeSingle()
  const v = data?.value as { spreadsheetId?: string; url?: string } | null
  return v?.spreadsheetId ? { spreadsheetId: v.spreadsheetId, url: v.url || `https://docs.google.com/spreadsheets/d/${v.spreadsheetId}` } : null
}

export async function getSheetInfo(): Promise<SheetInfo | null> {
  return getStoredInfo()
}

/** Cria a planilha (uma vez), compartilha com o dono e guarda o id. */
export async function getOrCreateSheet(): Promise<SheetInfo> {
  const existing = await getStoredInfo()
  if (existing) return existing

  const auth = getAuth()
  if (!auth) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON ausente — configure a service account.')

  const sheets = google.sheets({ version: 'v4', auth })
  const drive = google.drive({ version: 'v3', auth })

  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: 'Leads JMP — Bula Assessoria' },
      sheets: [{ properties: { title: TAB } }],
    },
  })
  const spreadsheetId = created.data.spreadsheetId!
  const url = created.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [[...SHEET_HEADER]] },
  })

  // Compartilha como editor com o dono (best-effort — não falha a criação).
  try {
    await drive.permissions.create({
      fileId: spreadsheetId,
      sendNotificationEmail: false,
      requestBody: { role: 'writer', type: 'user', emailAddress: SHARE_EMAIL },
    })
  } catch (e) {
    console.error('[jmp-sheets] share failed:', e)
  }

  await supabaseAdmin()
    .from('jmp_config')
    .upsert({ key: CONFIG_KEY, value: { spreadsheetId, url }, updated_at: new Date().toISOString() })

  return { spreadsheetId, url }
}

function parseSpreadsheetId(s: string): string | null {
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (m) return m[1]
  const t = s.trim()
  return /^[a-zA-Z0-9-_]{20,}$/.test(t) ? t : null
}

/**
 * Conecta uma planilha EXISTENTE (link ou ID) — fallback caso a service
 * account não consiga criar arquivos (cota de Drive). A planilha precisa estar
 * compartilhada com a service account como Editor. Garante a aba + cabeçalho.
 */
export async function connectExistingSheet(idOrUrl: string): Promise<SheetInfo> {
  const id = parseSpreadsheetId(idOrUrl)
  if (!id) throw new Error('Link/ID de planilha inválido.')
  const auth = getAuth()
  if (!auth) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON ausente — configure a service account.')

  const sheets = google.sheets({ version: 'v4', auth })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
  const hasTab = meta.data.sheets?.some((s) => s.properties?.title === TAB)
  if (!hasTab) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    })
  }
  await ensureSheetLayout(sheets, id)
  const url = `https://docs.google.com/spreadsheets/d/${id}`
  await supabaseAdmin().from('jmp_config').upsert({ key: CONFIG_KEY, value: { spreadsheetId: id, url }, updated_at: new Date().toISOString() })
  return { spreadsheetId: id, url }
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
  }).format(d)
}

export interface SheetLead {
  nome: string
  email: string
  whatsapp: string
  uf: string | null
  cidade: string | null
  momento: string | null
  cabecas: string | null
  interesse: string | null
  oQueBusca?: string | null
  inscricaoEstadual?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  ad_id?: string | null
  leadId?: string | null
  createdAt?: Date
}

export interface SheetLeadRow {
  rowNumber: number
  data: string
  nome: string
  email: string
  whatsapp: string
  uf: string | null
  cidade: string | null
  momento: string | null
  cabecas: string | null
  interesse: string | null
  leadId: string | null
  oQueBusca: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  ad_id: string | null
  inscricaoEstadual: string | null
}

function cell(row: string[], idx: number): string {
  return String(row[idx] ?? '').trim()
}

function blankToNull(v: string): string | null {
  return v.trim() ? v.trim() : null
}

function cellByHeader(row: string[], layout: HeaderLayout, header: HeaderName): string {
  const index = layout.indexes.get(header)
  return index == null ? '' : cell(row, index)
}

function isUnnormalizedMetaRow(row: string[], layout: HeaderLayout): boolean {
  const data = cellByHeader(row, layout, 'Data')
  const nome = cellByHeader(row, layout, 'Nome')
  return data.startsWith('l:') && /^\d{4}-\d{2}-\d{2}T/.test(nome)
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalização das linhas cruas do Meta Ads.
//
// O lead form do Meta (campanha "Leilão JMP") grava na MESMA aba, mas despeja
// os 21 campos do seu schema (id, created_time, ad/adset/campaign, perguntas,
// full_name, email, phone, state) a partir da coluna A — desalinhado do layout
// padrão. A convenção correta (já usada nas linhas saudáveis) é:
//   A–R  = dados padronizados, no mesmo vocabulário da landing
//   S–AN = metadados do Meta (cabeçalhos próprios), lead_status em AN
// `normalizeMetaRawRows` reescreve as linhas cruas in place (só valores —
// formatação/cores e a coluna A "Atendido por" das demais linhas ficam
// intactas). Chamado de forma oportunista em appendLeadToSheet e
// readSheetLeadRows, então a planilha se "auto-cura" continuamente.
// ─────────────────────────────────────────────────────────────────────────────

const META_MOMENTO = new Map([
  ['não_trabalho,_quero_aprender', 'nao-trabalho-quero-aprender'],
  ['nao_trabalho,_quero_aprender', 'nao-trabalho-quero-aprender'],
  ['trabalho_com_pecuária_de_corte', 'pecuaria-de-corte'],
  ['trabalho_com_pecuaria_de_corte', 'pecuaria-de-corte'],
  ['trabalho_com_corte_e_po', 'corte-e-po'],
  ['sou_criador_renomado_de_po', 'criador-renomado-po'],
])
const META_CABECAS = new Map([
  ['0-50', '0-50'], ['51-100', '50-100'], ['101-300', '100-300'],
  ['301-500', '300-500'], ['500+', '500+'], ['nenhuma', 'nenhuma'],
])
const META_INTERESSE = new Map([
  ['bezerras_po', 'bezerras-po'], ['touros_po', 'touros-po'],
  ['matrizes_po', 'matrizes-po'], ['não_sei', 'nao-sei'], ['nao_sei', 'nao-sei'],
])
const META_NOUN = new Map([
  ['bezerras-po', 'bezerras'], ['touros-po', 'touros'],
  ['matrizes-po', 'matrizes'], ['nao-sei', 'animais'],
])
const META_QTD = new Map([
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

function deaccent(s: string): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function metaStateToUF(state: string): string {
  const s = deaccent(state)
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase()
  return UF_BY_NAME.get(s.toLowerCase()) || String(state || '').trim()
}

function metaPhoneToWhatsApp(raw: string): string {
  const digits = String(raw || '').replace(/^p:/, '').replace(/\D/g, '').replace(/^55/, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return digits ? `(${digits.slice(0, 2)}) ${digits.slice(2)}` : ''
}

function stripPrefix(v: string, prefix: string): string {
  return v.startsWith(prefix) ? v.slice(prefix.length) : v
}

interface RawMetaLead {
  atendidoPor: string
  id: string; created: string; adId: string; adName: string
  adsetId: string; adsetName: string; campaignId: string; campaignName: string
  formId: string; formName: string; isOrganic: string; platform: string
  momento: string; cabecas: string; temIe: string; interesse: string; qtd: string
  fullName: string; email: string; phone: string; state: string; leadStatus: string
}

/**
 * Detecta e interpreta uma linha crua do Meta. O id "l:<n>" pode estar em A
 * (linhas atuais) ou em B (linhas antigas, deslocadas quando a coluna
 * "Atendido por" foi inserida — nesse caso A é preservada).
 */
function parseRawMetaLead(row: string[]): RawMetaLead | null {
  let offset: number | null = null
  let atendidoPor = ''
  if (/^l:\d+/.test(String(row[0] ?? ''))) offset = 0
  else if (/^l:\d+/.test(String(row[1] ?? ''))) { offset = 1; atendidoPor = String(row[0] ?? '').trim() }
  if (offset == null) return null
  const off = offset
  const f = (i: number) => String(row[off + i] ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}T/.test(f(1))) return null
  return {
    atendidoPor,
    id: stripPrefix(f(0), 'l:'), created: f(1), adId: stripPrefix(f(2), 'ag:'), adName: f(3),
    adsetId: stripPrefix(f(4), 'as:'), adsetName: f(5), campaignId: stripPrefix(f(6), 'c:'), campaignName: f(7),
    formId: stripPrefix(f(8), 'f:'), formName: f(9), isOrganic: f(10), platform: f(11),
    momento: f(12), cabecas: f(13), temIe: f(14), interesse: f(15), qtd: f(16),
    fullName: f(17), email: f(18), phone: f(19), state: f(20),
    leadStatus: String(row[39] ?? '').trim() || f(21) || 'CREATED',
  }
}

function isMetaTestLead(p: RawMetaLead): boolean {
  return /test lead|dummy data/i.test([p.fullName, p.momento, p.email].join(' ')) || p.email === 'test@meta.com'
}

/** Monta a linha completa A..AN no layout padrão + metadados Meta. */
function buildNormalizedMetaRow(p: RawMetaLead): string[] {
  const interesse = META_INTERESSE.get(p.interesse.toLowerCase()) || p.interesse
  // Interesse fora do vocabulário da landing (ex.: "sêmen"): mantém o rótulo
  // cru e a quantidade sem substantivo ("1 a 5").
  const noun = META_NOUN.get(interesse) || ''
  const qtdBase = META_QTD.get(p.qtd)
  const testPrefix = isMetaTestLead(p) ? '[TESTE META] ' : ''
  const out = Array.from({ length: 40 }, () => '') // A..AN
  out[0] = p.atendidoPor
  out[1] = fmtDate(new Date(p.created))
  out[2] = testPrefix + p.fullName
  out[3] = p.email
  out[4] = metaPhoneToWhatsApp(p.phone)
  out[5] = metaStateToUF(p.state)
  out[7] = META_MOMENTO.get(p.momento.toLowerCase()) || p.momento
  out[8] = META_CABECAS.get(p.cabecas) || p.cabecas
  out[9] = interesse
  out[11] = qtdBase ? `${qtdBase}${noun ? ' ' + noun : ''}` : p.qtd
  out[12] = p.platform
  out[14] = p.campaignName
  out[15] = p.adName
  out[16] = p.adId
  out[17] = p.temIe ? (p.temIe.toLowerCase() === 'sim' ? 'Sim' : 'Não') : ''
  out[18] = p.id; out[19] = p.created; out[20] = p.adId; out[21] = p.adName
  out[22] = p.adsetId; out[23] = p.adsetName; out[24] = p.campaignId; out[25] = p.campaignName
  out[26] = p.formId; out[27] = p.formName; out[28] = p.isOrganic; out[29] = p.platform
  out[39] = p.leadStatus
  return out
}

/**
 * Reescreve in place as linhas cruas do Meta no layout padrão. Best-effort:
 * falha vira warn (nunca quebra o fluxo de quem chamou). Retorna quantas
 * linhas foram normalizadas.
 */
export async function normalizeMetaRawRows(): Promise<number> {
  try {
    const info = await getStoredInfo()
    if (!info) return 0
    const auth = getAuth()
    if (!auth) return 0
    const sheets = google.sheets({ version: 'v4', auth })
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: info.spreadsheetId,
      range: `${TAB}!A2:AN`,
    })
    const values = (res.data.values ?? []) as string[][]
    const updates: { range: string; values: string[][] }[] = []
    values.forEach((row, index) => {
      const parsed = parseRawMetaLead(row)
      if (!parsed) return
      const rowNumber = index + 2
      updates.push({ range: `${TAB}!A${rowNumber}:AN${rowNumber}`, values: [buildNormalizedMetaRow(parsed)] })
    })
    if (!updates.length) return 0
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: info.spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: updates },
    })
    console.log(`[jmp-sheets] ${updates.length} linha(s) do Meta normalizadas na planilha`)
    return updates.length
  } catch (e) {
    console.warn('[jmp-sheets] normalizeMetaRawRows falhou:', e instanceof Error ? e.message : e)
    return 0
  }
}

export async function readSheetLeadRows(): Promise<{ info: SheetInfo; rows: SheetLeadRow[] }> {
  const info = await getStoredInfo()
  if (!info) throw new Error('Planilha de leads JMP não conectada.')
  const auth = getAuth()
  if (!auth) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON ausente — configure a service account.')

  // Auto-cura: realinha eventuais linhas cruas do Meta antes de ler, para que
  // esses leads apareçam na Validação (e possam ser importados para o CRM).
  await normalizeMetaRawRows()

  const sheets = google.sheets({ version: 'v4', auth })
  const headerRow = await readHeaderRow(sheets, info.spreadsheetId)
  const layout = getHeaderLayout(headerRow)
  const endColumn = columnName(Math.max(layout.lastColumn, HEADER_READ_COLUMNS))
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: info.spreadsheetId,
    range: `${TAB}!A2:${endColumn}`,
  })

  const values = (res.data.values ?? []) as string[][]
  const rows = values
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => !isUnnormalizedMetaRow(row, layout))
    .map(({ row, rowNumber }) => ({
      rowNumber,
      data: cellByHeader(row, layout, 'Data'),
      nome: cellByHeader(row, layout, 'Nome'),
      email: cellByHeader(row, layout, 'E-mail'),
      whatsapp: cellByHeader(row, layout, 'WhatsApp'),
      uf: blankToNull(cellByHeader(row, layout, 'UF')),
      cidade: blankToNull(cellByHeader(row, layout, 'Cidade')),
      momento: blankToNull(cellByHeader(row, layout, 'Momento')),
      cabecas: blankToNull(cellByHeader(row, layout, 'Cabeças')),
      interesse: blankToNull(cellByHeader(row, layout, 'Interesse')),
      leadId: blankToNull(cellByHeader(row, layout, 'Lead ID')),
      oQueBusca: blankToNull(cellByHeader(row, layout, 'Qtd. desejada')),
      utm_source: blankToNull(cellByHeader(row, layout, 'utm_source')),
      utm_medium: blankToNull(cellByHeader(row, layout, 'utm_medium')),
      utm_campaign: blankToNull(cellByHeader(row, layout, 'utm_campaign')),
      utm_content: blankToNull(cellByHeader(row, layout, 'utm_content')),
      ad_id: blankToNull(cellByHeader(row, layout, 'ad-id')),
      inscricaoEstadual: blankToNull(cellByHeader(row, layout, 'Inscrição Estadual')),
    }))
    .filter(row => row.nome || row.email || row.whatsapp)

  return { info, rows }
}

/** Acrescenta o lead na planilha. Só grava se a planilha já foi conectada. */
export async function appendLeadToSheet(lead: SheetLead): Promise<{ skipped: boolean; reason?: string }> {
  const info = await getStoredInfo()
  if (!info) return { skipped: true, reason: 'not_provisioned' }
  const auth = getAuth()
  if (!auth) {
    // Skip silencioso esconde perda de leads — deixa rastro no log.
    console.error('[jmp-sheets] append PULADO (credenciais ausentes/inválidas) — lead não foi para a planilha:', lead.nome)
    return { skipped: true, reason: 'no_credentials' }
  }

  const sheets = google.sheets({ version: 'v4', auth })

  const layout = await ensureSheetLayout(sheets, info.spreadsheetId)
  const row = Array.from({ length: layout.lastColumn }, () => '')
  const set = (header: HeaderName, value: string | null | undefined) => {
    const index = layout.indexes.get(header)
    if (index != null) row[index] = value ?? ''
  }

  set('Data', fmtDate(lead.createdAt ?? new Date()))
  set('Nome', lead.nome)
  set('E-mail', lead.email)
  set('WhatsApp', lead.whatsapp)
  set('UF', lead.uf)
  set('Cidade', lead.cidade)
  set('Momento', lead.momento)
  set('Cabeças', lead.cabecas)
  set('Interesse', lead.interesse)
  set('Lead ID', lead.leadId)
  set('Qtd. desejada', lead.oQueBusca)
  set('utm_source', lead.utm_source)
  set('utm_medium', lead.utm_medium)
  set('utm_campaign', lead.utm_campaign)
  set('utm_content', lead.utm_content)
  set('ad-id', lead.ad_id)
  set('Inscrição Estadual', lead.inscricaoEstadual)

  // appendCells em vez de values.append: o append clássico usa "detecção de
  // tabela" e, quando alguém deixa uma célula órfã abaixo da tabela, passa a
  // gravar os leads deslocados (linhas distantes, colunas erradas) — foi assim
  // que leads "sumiram" da planilha em 11/06. appendCells grava sempre após a
  // última linha com dados da aba, alinhado à coluna A.
  const sheetId = await getTabSheetId(sheets, info.spreadsheetId)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: info.spreadsheetId,
    requestBody: {
      requests: [{
        appendCells: {
          sheetId,
          rows: [{ values: row.map((v) => ({ userEnteredValue: { stringValue: String(v ?? '') } })) }],
          fields: 'userEnteredValue',
        },
      }],
    },
  })

  // Auto-cura oportunista: cada lead da landing também realinha eventuais
  // linhas cruas que o Meta tenha despejado desde a última passagem.
  void normalizeMetaRawRows()

  return { skipped: false }
}
