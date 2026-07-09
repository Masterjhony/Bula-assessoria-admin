import { google } from 'googleapis'
import { supabaseAdmin } from './supabase'

// Integração com Google Sheets: cada lead do formulário JMP vira uma linha na
// aba "Leads JMP" de uma planilha criada pela service account (a mesma de
// GA4/Calendar). O id da planilha fica em jmp_config(key='sheets').

const CONFIG_KEY = 'sheets'
const TAB = 'Leads JMP'
// Aba "cópia" que recebe os leads do formulário Meta "BULA PERPETUO" — mesmo
// layout cru da "Leads JMP" (cabeçalho padrão + bloco de metadados do Meta).
// Só LEMOS dela (sem reescrever) para alimentar o CRM.
export const LEADS_BULA_TAB = 'Cópia de LEADS BULA'
// Aba "organizada" para onde despejamos, em layout limpo e fixo, cada lead que
// chega cru na "Cópia de LEADS BULA". O conector do Meta não tem como entregar
// formatado, então o app reescreve em colunas estáveis aqui (append-only,
// idempotente por `id`). Ver syncBulaLeadsToPerpetuoTab().
export const LEADS_BULA_PERPETUO_TAB = 'LEADS BULA - PERPETUO'
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

async function readHeaderRow(sheets: SheetsClient, spreadsheetId: string, tab: string = TAB): Promise<string[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:${columnName(HEADER_READ_COLUMNS)}1`,
  })
  return ((res.data.values?.[0] ?? []) as unknown[]).map((value) => String(value ?? '').trim())
}

async function updateHeaderRow(sheets: SheetsClient, spreadsheetId: string, headerRow: string[], tab: string = TAB): Promise<void> {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1:${columnName(headerRow.length)}1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headerRow] },
  })
}

async function getTabSheetId(sheets: SheetsClient, spreadsheetId: string, tab: string = TAB): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
  const found = meta.data.sheets?.find((sheet) => sheet.properties?.title === tab)
  const sheetId = found?.properties?.sheetId
  if (sheetId == null) throw new Error(`Aba "${tab}" não encontrada.`)
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
  /** "Fêmeas (11/07), Touros (12/07)" — pregões escolhidos na landing do EAO. */
  leiloesDescricao?: string | null
  /** Consentimento explícito de contato via WhatsApp (checkbox do formulário). */
  whatsappConsent?: boolean
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

/**
 * Índice de um cabeçalho do bloco de metadados do Meta (S..AN por padrão)
 * pelo nome exato; cai na posição legada se o cabeçalho não existir.
 */
function metaHeaderIndex(headerRow: string[], name: string, fallback: number): number {
  const i = headerRow.findIndex((h) => String(h || '').trim().toLowerCase() === name)
  return i >= 0 ? i : fallback
}

/**
 * Monta a linha completa no layout padrão + metadados Meta. Resolve TODAS as
 * colunas pelo cabeçalho (nunca por posição fixa) — mover/reordenar colunas
 * na planilha não quebra a normalização.
 */
function buildNormalizedMetaRow(p: RawMetaLead, headerRow: string[], layout: HeaderLayout, width: number): string[] {
  const interesse = META_INTERESSE.get(p.interesse.toLowerCase()) || p.interesse
  // Interesse fora do vocabulário da landing (ex.: "sêmen"): mantém o rótulo
  // cru e a quantidade sem substantivo ("1 a 5").
  const noun = META_NOUN.get(interesse) || ''
  const qtdBase = META_QTD.get(p.qtd)
  const testPrefix = isMetaTestLead(p) ? '[TESTE META] ' : ''
  const out = Array.from({ length: width }, () => '')
  const set = (header: HeaderName, value: string) => {
    const index = layout.indexes.get(header)
    if (index != null) out[index] = value
  }
  out[0] = p.atendidoPor // coluna manual "Atendido por" (sempre a primeira)
  set('Data', fmtDate(new Date(p.created)))
  set('Nome', testPrefix + p.fullName)
  set('E-mail', p.email)
  set('WhatsApp', metaPhoneToWhatsApp(p.phone))
  set('UF', metaStateToUF(p.state))
  set('Momento', META_MOMENTO.get(p.momento.toLowerCase()) || p.momento)
  set('Cabeças', META_CABECAS.get(p.cabecas) || p.cabecas)
  set('Interesse', interesse)
  set('Qtd. desejada', qtdBase ? `${qtdBase}${noun ? ' ' + noun : ''}` : p.qtd)
  set('utm_source', p.platform)
  set('utm_campaign', p.campaignName)
  set('utm_content', p.adName)
  set('ad-id', p.adId)
  set('Inscrição Estadual', p.temIe ? (p.temIe.toLowerCase() === 'sim' ? 'Sim' : 'Não') : '')
  // Bloco de metadados do Meta (cabeçalhos próprios da integração)
  const m = (name: string, fallback: number, value: string) => { out[metaHeaderIndex(headerRow, name, fallback)] = value }
  m('id', 18, p.id); m('created_time', 19, p.created); m('ad_id', 20, p.adId); m('ad_name', 21, p.adName)
  m('adset_id', 22, p.adsetId); m('adset_name', 23, p.adsetName); m('campaign_id', 24, p.campaignId); m('campaign_name', 25, p.campaignName)
  m('form_id', 26, p.formId); m('form_name', 27, p.formName); m('is_organic', 28, p.isOrganic); m('platform', 29, p.platform)
  m('lead_status', 39, p.leadStatus)
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
    const headerRow = await readHeaderRow(sheets, info.spreadsheetId)
    const layout = getHeaderLayout(headerRow)
    const width = Math.max(headerRow.length, layout.lastColumn, 40)
    const endColumn = columnName(width)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: info.spreadsheetId,
      range: `${TAB}!A2:${endColumn}`,
    })
    const values = (res.data.values ?? []) as string[][]
    const updates: { range: string; values: string[][] }[] = []
    values.forEach((row, index) => {
      const parsed = parseRawMetaLead(row)
      if (!parsed) return
      const rowNumber = index + 2
      updates.push({
        range: `${TAB}!A${rowNumber}:${endColumn}${rowNumber}`,
        values: [buildNormalizedMetaRow(parsed, headerRow, layout, width)],
      })
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

/**
 * Converte as linhas cruas da aba (matriz de valores) em SheetLeadRow. Linha
 * crua do Meta é normalizada EM MEMÓRIA (sem reescrever a planilha); linha já no
 * layout padrão segue como está. Em ambos os casos a leitura é por cabeçalho,
 * nunca por posição fixa — mover colunas na planilha não quebra a leitura.
 */
function mapSheetValuesToLeadRows(values: string[][], headerRow: string[], layout: HeaderLayout): SheetLeadRow[] {
  const width = Math.max(headerRow.length, layout.lastColumn, 40)
  return values
    .map((raw, index) => {
      const parsed = parseRawMetaLead(raw)
      const row = parsed ? buildNormalizedMetaRow(parsed, headerRow, layout, width) : raw
      return { row, rowNumber: index + 2 }
    })
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
  return { info, rows: mapSheetValuesToLeadRows(values, headerRow, layout) }
}

/**
 * Lê leads de uma aba SECUNDÁRIA que recebe os mesmos dumps crus do Meta que a
 * "Leads JMP" (mesmo cabeçalho/layout), porém SEM reescrever a planilha — a aba
 * é mantida pela equipe e pode ter outras automações/colunas que não devemos
 * tocar. Linhas cruas do Meta são normalizadas em memória. Retorna [] se a aba
 * não existir ou a planilha/credenciais não estiverem configuradas.
 *
 * `onlyMetaForm`: considera APENAS as linhas no formato cru do Meta (id `l:<n>`
 * + timestamp ISO), ou seja, os leads que CHEGAM pelo formulário do Meta —
 * ignorando blocos de histórico antigo já normalizados que a equipe tenha
 * colado na aba. Use quando a aba mistura "leads chegando" com histórico.
 */
export async function readSecondaryTabLeadRows(
  tab: string,
  opts: { onlyMetaForm?: boolean } = {},
): Promise<{ info: SheetInfo | null; rows: SheetLeadRow[] }> {
  const info = await getStoredInfo()
  if (!info) return { info: null, rows: [] }
  const auth = getAuth()
  if (!auth) return { info, rows: [] }

  const sheets = google.sheets({ version: 'v4', auth })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: info.spreadsheetId, includeGridData: false })
  if (!meta.data.sheets?.some(s => s.properties?.title === tab)) return { info, rows: [] }

  const headerRow = await readHeaderRow(sheets, info.spreadsheetId, tab)
  const layout = getHeaderLayout(headerRow)
  const endColumn = columnName(Math.max(layout.lastColumn, HEADER_READ_COLUMNS))
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: info.spreadsheetId,
    range: `${tab}!A2:${endColumn}`,
  })
  let values = (res.data.values ?? []) as string[][]
  if (opts.onlyMetaForm) values = values.filter(row => parseRawMetaLead(row) != null)
  return { info, rows: mapSheetValuesToLeadRows(values, headerRow, layout) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Espelho organizado: "Cópia de LEADS BULA" (cru) → "LEADS BULA - PERPETUO".
//
// O conector do Meta despeja os leads crus/desalinhados e — segundo quem
// configura o Meta — não há como entregar formatado. Em vez de tentar "curar"
// a aba bruta (que a equipe e o próprio Meta mexem), reescrevemos cada lead em
// uma aba dedicada, com layout fixo e legível. Append-only e idempotente pelo
// `id` do Meta: rodar de novo nunca duplica, e a coluna "Atendido por" (e
// qualquer edição da equipe nas linhas já existentes) fica intacta.
//
// Layout exato definido pelo dono (40 colunas A..AN): bloco padrão legível +
// metadados crus do Meta + perguntas cruas do formulário + flags.
// ─────────────────────────────────────────────────────────────────────────────

const PERPETUO_HEADER = [
  'Atendido por', 'Data', 'Nome', 'E-mail', 'WhatsApp', 'UF', 'Cidade', 'Momento', 'Cabeças',
  'Inscrição Estadual', 'Interesse', 'Lead ID', 'Qtd. desejada', 'utm_source', 'utm_medium',
  'utm_campaign', 'utm_content', 'ad-id', 'id', 'created_time', 'ad_id', 'ad_name', 'adset_id',
  'adset_name', 'campaign_id', 'campaign_name', 'form_id', 'form_name', 'is_organic', 'platform',
  'seu_momento_na_pecuaria', 'você_tem_inscrição_estadual?', 'qual_o_seu_interesse?',
  'de_acordo_com_seu_interesse,_qual_a_quantidade_de_animais_desejada?',
  'full_name', 'email', 'phone', 'state', 'lead de teste', 'lead_status',
] as const

/**
 * Valores de uma linha do PERPETUO, indexados pelo cabeçalho NORMALIZADO — assim
 * a escrita resolve por nome de coluna (reordenar colunas na aba não quebra).
 * O bloco "legível" reusa exatamente a mesma normalização da auto-cura; as
 * colunas cruas (seu_momento_na_pecuaria, full_name, phone, ...) recebem o valor
 * original do Meta, sem transformar.
 */
function buildPerpetuoValues(p: RawMetaLead): Map<string, string> {
  const interesse = META_INTERESSE.get(p.interesse.toLowerCase()) || p.interesse
  const noun = META_NOUN.get(interesse) || ''
  const qtdBase = META_QTD.get(p.qtd)
  const test = isMetaTestLead(p)
  const testPrefix = test ? '[TESTE META] ' : ''
  const entries: [string, string][] = [
    ['Atendido por', p.atendidoPor],
    ['Data', fmtDate(new Date(p.created))],
    ['Nome', testPrefix + p.fullName],
    ['E-mail', p.email],
    ['WhatsApp', metaPhoneToWhatsApp(p.phone)],
    ['UF', metaStateToUF(p.state)],
    ['Cidade', ''],
    ['Momento', META_MOMENTO.get(p.momento.toLowerCase()) || p.momento],
    ['Cabeças', META_CABECAS.get(p.cabecas) || p.cabecas],
    ['Inscrição Estadual', p.temIe ? (p.temIe.toLowerCase() === 'sim' ? 'Sim' : 'Não') : ''],
    ['Interesse', interesse],
    ['Lead ID', p.id],
    ['Qtd. desejada', qtdBase ? `${qtdBase}${noun ? ' ' + noun : ''}` : p.qtd],
    ['utm_source', p.platform],
    ['utm_medium', ''],
    ['utm_campaign', p.campaignName],
    ['utm_content', p.adName],
    ['ad-id', p.adId],
    ['id', p.id],
    ['created_time', p.created],
    ['ad_id', p.adId],
    ['ad_name', p.adName],
    ['adset_id', p.adsetId],
    ['adset_name', p.adsetName],
    ['campaign_id', p.campaignId],
    ['campaign_name', p.campaignName],
    ['form_id', p.formId],
    ['form_name', p.formName],
    ['is_organic', p.isOrganic],
    ['platform', p.platform],
    ['seu_momento_na_pecuaria', p.momento],
    ['você_tem_inscrição_estadual?', p.temIe],
    ['qual_o_seu_interesse?', p.interesse],
    ['de_acordo_com_seu_interesse,_qual_a_quantidade_de_animais_desejada?', p.qtd],
    ['full_name', p.fullName],
    ['email', p.email],
    ['phone', p.phone],
    ['state', p.state],
    ['lead de teste', test ? 'Sim' : 'Não'],
    ['lead_status', p.leadStatus],
  ]
  return new Map(entries.map(([k, v]) => [normalizeHeaderText(k), v ?? '']))
}

/** Monta a linha alinhada ao cabeçalho REAL da aba (colunas faltantes viram ''). */
function buildPerpetuoRow(p: RawMetaLead, headerRow: string[]): string[] {
  const values = buildPerpetuoValues(p)
  return headerRow.map(h => values.get(normalizeHeaderText(h)) ?? '')
}

/** Núcleo do telefone (8 últimos dígitos, sem DDI) para dedup tolerante. */
function phoneNucleo(raw: string): string {
  const d = String(raw || '').replace(/\D/g, '').replace(/^55/, '')
  return d.length >= 8 ? d.slice(-8) : ''
}
function emailKey(raw: string): string {
  return String(raw || '').trim().toLowerCase()
}

/**
 * Mapeia uma linha que NÃO veio do form do Meta (já em layout por cabeçalho na
 * bruta — Instagram Direct e quaisquer manuais) para o layout do PERPETUO,
 * casando coluna por nome de cabeçalho. As colunas exclusivas do Meta (id,
 * metadados, perguntas cruas) ficam vazias.
 */
function buildRowFromHeaderedSource(srcRow: string[], srcHeader: string[], dstHeader: string[]): string[] {
  const values = new Map<string, string>()
  srcHeader.forEach((h, i) => {
    const key = normalizeHeaderText(h)
    if (key && !values.has(key)) values.set(key, String(srcRow[i] ?? '').trim())
  })
  return dstHeader.map(h => values.get(normalizeHeaderText(h)) ?? '')
}

/**
 * Espelha TODOS os leads da aba "Cópia de LEADS BULA" para a aba organizada
 * "LEADS BULA - PERPETUO" (cria a aba/cabeçalho se faltar):
 *   • linhas no formato cru do Meta (l:<id>) → parseadas e normalizadas;
 *   • demais linhas (Instagram Direct e quaisquer manuais já em layout por
 *     coluna) → mapeadas por cabeçalho.
 * Só ACRESCENTA o que ainda não está lá — idempotente por `id` do Meta e, na
 * falta dele, por e-mail/telefone (consolida o mesmo lead em 1 linha mesmo que
 * tenha chegado por canais diferentes). Preserva "Atendido por" e edições
 * manuais (nunca reescreve linha existente). Lança em erro de Sheets p/ o cron
 * logar; auth/planilha ausente degrada pra no-op.
 */
export async function syncBulaLeadsToPerpetuoTab(): Promise<{
  appended: number; total: number; skipped: number; reason?: string
}> {
  const info = await getStoredInfo()
  if (!info) return { appended: 0, total: 0, skipped: 0, reason: 'not_provisioned' }
  const auth = getAuth()
  if (!auth) return { appended: 0, total: 0, skipped: 0, reason: 'no_credentials' }

  const sheets = google.sheets({ version: 'v4', auth })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: info.spreadsheetId, includeGridData: false })
  const titles = (meta.data.sheets ?? []).map(s => s.properties?.title)
  if (!titles.includes(LEADS_BULA_TAB)) return { appended: 0, total: 0, skipped: 0, reason: 'source_tab_missing' }

  // 1. Lê a bruta COM cabeçalho (preciso dele p/ as linhas que já chegam em
  //    layout por coluna, como as do Instagram Direct).
  const srcAll = ((await sheets.spreadsheets.values.get({
    spreadsheetId: info.spreadsheetId,
    range: `${LEADS_BULA_TAB}!A1:${columnName(HEADER_READ_COLUMNS)}`,
  })).data.values ?? []) as string[][]
  const srcHeader = (srcAll[0] ?? []).map(v => String(v ?? '').trim())
  const srcRows = srcAll.slice(1).filter(r => r.some(c => String(c ?? '').trim()))

  // 2. Garante a aba de destino + cabeçalho (só escreve o header se estiver vazio).
  if (!titles.includes(LEADS_BULA_PERPETUO_TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: info.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: LEADS_BULA_PERPETUO_TAB } } }] },
    })
  }
  let header = await readHeaderRow(sheets, info.spreadsheetId, LEADS_BULA_PERPETUO_TAB)
  if (!header.some(Boolean)) {
    header = [...PERPETUO_HEADER]
    await sheets.spreadsheets.values.update({
      spreadsheetId: info.spreadsheetId,
      range: `${LEADS_BULA_PERPETUO_TAB}!A1:${columnName(header.length)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [header] },
    })
  }

  // 3. Índices de dedup/validação no layout do PERPETUO (resolvidos por nome).
  const normHeader = header.map(normalizeHeaderText)
  const idCol = normHeader.indexOf('id')
  const nomeCol = normHeader.indexOf('nome')
  const emailCols = normHeader.flatMap((h, i) => h === 'email' ? [i] : [])      // "E-mail" e "email"
  const phoneCols = normHeader.flatMap((h, i) => (h === 'whatsapp' || h === 'phone') ? [i] : [])
  const identity = (row: string[]) => {
    const id = idCol >= 0 ? String(row[idCol] ?? '').trim() : ''
    let email = ''
    for (const i of emailCols) { const v = emailKey(String(row[i] ?? '')); if (v) { email = v; break } }
    let phone = ''
    for (const i of phoneCols) { const v = phoneNucleo(String(row[i] ?? '')); if (v) { phone = v; break } }
    const nome = nomeCol >= 0 ? String(row[nomeCol] ?? '').trim() : ''
    return { id, email, phone, nome }
  }

  // 4. Identidades já presentes no PERPETUO (idempotência entre execuções).
  const endCol = columnName(Math.max(header.length, HEADER_READ_COLUMNS))
  const dstRows = ((await sheets.spreadsheets.values.get({
    spreadsheetId: info.spreadsheetId,
    range: `${LEADS_BULA_PERPETUO_TAB}!A2:${endCol}`,
  })).data.values ?? []) as string[][]
  const seenId = new Set<string>(), seenEmail = new Set<string>(), seenPhone = new Set<string>()
  for (const r of dstRows) {
    const k = identity(r)
    if (k.id) seenId.add(k.id)
    if (k.email) seenEmail.add(k.email)
    if (k.phone) seenPhone.add(k.phone)
  }

  // 5. Monta cada candidata (Meta cru → parse; demais → mapeia por cabeçalho) e
  //    acrescenta só as inéditas (dedup por id OU e-mail OU telefone).
  const fresh: string[][] = []
  let total = 0
  for (const raw of srcRows) {
    const metaLead = parseRawMetaLead(raw)
    const candidate = metaLead
      ? buildPerpetuoRow(metaLead, header)
      : buildRowFromHeaderedSource(raw, srcHeader, header)
    const k = identity(candidate)
    if (!k.nome && !k.email && !k.phone) continue // linha sem lead reconhecível
    total++
    if ((k.id && seenId.has(k.id)) || (k.email && seenEmail.has(k.email)) || (k.phone && seenPhone.has(k.phone))) continue
    if (k.id) seenId.add(k.id)
    if (k.email) seenEmail.add(k.email)
    if (k.phone) seenPhone.add(k.phone)
    fresh.push(candidate)
  }

  if (!fresh.length) return { appended: 0, total, skipped: total }

  const sheetId = await getTabSheetId(sheets, info.spreadsheetId, LEADS_BULA_PERPETUO_TAB)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: info.spreadsheetId,
    requestBody: {
      requests: [{
        appendCells: {
          sheetId,
          rows: fresh.map(r => ({ values: r.map(v => ({ userEnteredValue: { stringValue: String(v ?? '') } })) })),
          fields: 'userEnteredValue',
        },
      }],
    },
  })
  console.log(`[jmp-sheets] PERPETUO: ${fresh.length} lead(s) novos espelhados (de ${total} na bruta)`)
  return { appended: fresh.length, total, skipped: total - fresh.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// Aba por campanha: "Leads EAO" (só os leads da campanha EAO, layout limpo).
//
// Espelho ADICIONAL e independente do PERPETUO: lê a mesma bruta ("Cópia de
// LEADS BULA"), filtra as linhas do Meta cujo campaign_id é o da campanha EAO e
// as escreve numa aba dedicada, em colunas legíveis. Não altera em nada o
// PERPETUO nem a leitura do CRM — é só uma "vista" organizada por campanha.
// Append-only e idempotente pelo Lead ID (rodar de novo nunca duplica).
// ─────────────────────────────────────────────────────────────────────────────

export const LEADS_EAO_TAB = 'Leads EAO'
/** Campanha "LEADS - FORMS INST EAO" (conta CA2 - Bula 360). */
const EAO_CAMPAIGN_ID = '120249047242270708'

// Cabeçalho limpo — só o que interessa pra operação da campanha (sem o dump cru
// de metadados do Meta que existe no PERPETUO).
//
// A aba recebe DUAS fontes: os leads do Meta (espelhados por syncEaoLeadsToTab)
// e os leads do formulário da landing (appendLeadToEaoSheet). As duas últimas
// colunas só existem para a landing — nas linhas vindas do Meta ficam vazias,
// porque buildEaoRow resolve por nome de coluna e devolve '' no que não conhece.
const EAO_HEADER = [
  'Data', 'Nome', 'E-mail', 'WhatsApp', 'UF', 'Cidade', 'Momento', 'Cabeças',
  'Inscrição Estadual', 'Interesse', 'Qtd. desejada', 'Lead ID', 'Campanha', 'Anúncio',
  'Leilão de interesse', 'Consentimento WhatsApp',
] as const
type EaoHeaderName = (typeof EAO_HEADER)[number]

/** Monta a linha da aba "Leads EAO" alinhada ao cabeçalho REAL (resolve por nome). */
function buildEaoRow(p: RawMetaLead, header: string[]): string[] {
  const interesse = META_INTERESSE.get(p.interesse.toLowerCase()) || p.interesse
  const noun = META_NOUN.get(interesse) || ''
  const qtdBase = META_QTD.get(p.qtd)
  const testPrefix = isMetaTestLead(p) ? '[TESTE META] ' : ''
  const values = new Map<string, string>([
    ['data', fmtDate(new Date(p.created))],
    ['nome', testPrefix + p.fullName],
    ['email', p.email],
    ['whatsapp', metaPhoneToWhatsApp(p.phone)],
    ['uf', metaStateToUF(p.state)],
    ['cidade', ''],
    ['momento', META_MOMENTO.get(p.momento.toLowerCase()) || p.momento],
    ['cabecas', META_CABECAS.get(p.cabecas) || p.cabecas],
    ['inscricaoestadual', p.temIe ? (p.temIe.toLowerCase() === 'sim' ? 'Sim' : 'Não') : ''],
    ['interesse', interesse],
    ['qtddesejada', qtdBase ? `${qtdBase}${noun ? ' ' + noun : ''}` : p.qtd],
    ['leadid', p.id],
    ['campanha', p.campaignName],
    ['anuncio', p.adName],
  ])
  return header.map(h => values.get(normalizeHeaderText(h)) ?? '')
}

/**
 * Espelha os leads da campanha EAO (da bruta "Cópia de LEADS BULA") para a aba
 * dedicada "Leads EAO", em layout limpo. Cria a aba/cabeçalho se faltarem. Só
 * ACRESCENTA o que ainda não está lá (idempotente pelo Lead ID do Meta), nunca
 * reescreve linha existente. Best-effort: auth/planilha ausente degrada pra
 * no-op; erro de Sheets sobe para o cron logar. Não toca no PERPETUO.
 */
export async function syncEaoLeadsToTab(): Promise<{
  appended: number; total: number; skipped: number; reason?: string
}> {
  const info = await getStoredInfo()
  if (!info) return { appended: 0, total: 0, skipped: 0, reason: 'not_provisioned' }
  const auth = getAuth()
  if (!auth) return { appended: 0, total: 0, skipped: 0, reason: 'no_credentials' }

  const sheets = google.sheets({ version: 'v4', auth })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: info.spreadsheetId, includeGridData: false })
  const titles = (meta.data.sheets ?? []).map(s => s.properties?.title)
  if (!titles.includes(LEADS_BULA_TAB)) return { appended: 0, total: 0, skipped: 0, reason: 'source_tab_missing' }

  // Fonte: mesma bruta que alimenta o PERPETUO.
  const srcAll = ((await sheets.spreadsheets.values.get({
    spreadsheetId: info.spreadsheetId,
    range: `${LEADS_BULA_TAB}!A1:${columnName(HEADER_READ_COLUMNS)}`,
  })).data.values ?? []) as string[][]
  const srcRows = srcAll.slice(1).filter(r => r.some(c => String(c ?? '').trim()))

  // Garante a aba de destino + cabeçalho (só escreve o header se estiver vazio).
  if (!titles.includes(LEADS_EAO_TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: info.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: LEADS_EAO_TAB } } }] },
    })
  }
  let header = await readHeaderRow(sheets, info.spreadsheetId, LEADS_EAO_TAB)
  if (!header.some(Boolean)) {
    header = [...EAO_HEADER]
    await sheets.spreadsheets.values.update({
      spreadsheetId: info.spreadsheetId,
      range: `${LEADS_EAO_TAB}!A1:${columnName(header.length)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [header] },
    })
  }

  // Idempotência: Lead IDs já presentes na aba.
  const idCol = header.map(normalizeHeaderText).indexOf('leadid')
  const dstRows = ((await sheets.spreadsheets.values.get({
    spreadsheetId: info.spreadsheetId,
    range: `${LEADS_EAO_TAB}!A2:${columnName(header.length)}`,
  })).data.values ?? []) as string[][]
  const seen = new Set<string>()
  for (const r of dstRows) {
    const id = idCol >= 0 ? String(r[idCol] ?? '').trim() : ''
    if (id) seen.add(id)
  }

  // Só as linhas do Meta cuja campanha é a EAO, ainda não espelhadas.
  const fresh: string[][] = []
  let total = 0
  for (const raw of srcRows) {
    const p = parseRawMetaLead(raw)
    if (!p || p.campaignId !== EAO_CAMPAIGN_ID) continue
    total++
    if (p.id && seen.has(p.id)) continue
    if (p.id) seen.add(p.id)
    fresh.push(buildEaoRow(p, header))
  }
  if (!fresh.length) return { appended: 0, total, skipped: total }

  const sheetId = await getTabSheetId(sheets, info.spreadsheetId, LEADS_EAO_TAB)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: info.spreadsheetId,
    requestBody: {
      requests: [{
        appendCells: {
          sheetId,
          rows: fresh.map(r => ({ values: r.map(v => ({ userEnteredValue: { stringValue: String(v ?? '') } })) })),
          fields: 'userEnteredValue',
        },
      }],
    },
  })
  console.log(`[jmp-sheets] Leads EAO: ${fresh.length} lead(s) novos espelhados (de ${total} na bruta)`)
  return { appended: fresh.length, total, skipped: total - fresh.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura das CORES de fundo da aba "Leads JMP" + da aba "Cadastro JMP".
//
// A equipe pinta a linha de cada lead conforme o estágio do atendimento:
//   • sem cor (branco) → não entrou em contato ainda  → ENTRADA
//   • vermelho         → não respondeu                → CONEXÃO
//   • amarelo          → respondeu                    → QUALIFICAÇÃO
//   • verde            → enviou os dados p/ cadastro   → INFORMAÇÕES CAPTADAS
// A aba "Cadastro JMP" tem os cadastros já prontos → CADASTRO (e, aprovado, vira
// cliente). Estas funções alimentam a sincronização planilha → CRM.
// ─────────────────────────────────────────────────────────────────────────────

export const CADASTRO_TAB = 'Cadastro JMP'

export type SheetColor = 'none' | 'red' | 'yellow' | 'green'
export interface SheetLeadRowColored extends SheetLeadRow {
  color: SheetColor
}

type CellData = {
  effectiveFormat?: { backgroundColor?: { red?: number; green?: number; blue?: number } | null } | null
  userEnteredFormat?: { backgroundColorStyle?: { rgbColor?: { red?: number; green?: number; blue?: number } | null } | null } | null
}

/** Classifica um RGB (0..1) em vermelho/amarelo/verde com tolerância a tons pastel. */
function classifyFill(c?: { red?: number; green?: number; blue?: number } | null): SheetColor {
  if (!c) return 'none'
  const r = c.red ?? 1, g = c.green ?? 1, b = c.blue ?? 1
  if (r > 0.92 && g > 0.92 && b > 0.92) return 'none'   // branco / sem preenchimento
  if (r > 0.6 && g < 0.6 && b < 0.6) return 'red'        // vermelho
  if (r > 0.6 && g > 0.6 && b < 0.6) return 'yellow'     // amarelo
  if (g > 0.55 && r < 0.78 && b < 0.7) return 'green'    // verde
  return 'none'
}

function classifyCell(cell?: CellData): SheetColor {
  if (!cell) return 'none'
  const bg = cell.effectiveFormat?.backgroundColor ?? cell.userEnteredFormat?.backgroundColorStyle?.rgbColor
  return classifyFill(bg)
}

/**
 * Lê as linhas da aba "Leads JMP" junto com a cor de fundo de cada linha. Usa a
 * cor da célula "Nome"; se ela estiver branca, varre A..R pela primeira célula
 * colorida (a equipe às vezes pinta só uma coluna). Reaproveita readSheetLeadRows
 * (que auto-cura linhas do Meta) e casa as cores por número de linha.
 */
export async function readSheetLeadRowsWithColor(): Promise<{ info: SheetInfo; rows: SheetLeadRowColored[] }> {
  const { info, rows } = await readSheetLeadRows()
  const auth = getAuth()
  if (!auth) return { info, rows: rows.map(r => ({ ...r, color: 'none' as SheetColor })) }

  const sheets = google.sheets({ version: 'v4', auth })
  const headerRow = await readHeaderRow(sheets, info.spreadsheetId)
  const layout = getHeaderLayout(headerRow)
  const nameIdx = layout.indexes.get('Nome') ?? 1
  const width = Math.max(layout.lastColumn, 18)
  const endColumn = columnName(width)

  const grid = await sheets.spreadsheets.get({
    spreadsheetId: info.spreadsheetId,
    ranges: [`${TAB}!A2:${endColumn}`],
    fields: 'sheets(data(rowData(values(effectiveFormat(backgroundColor),userEnteredFormat(backgroundColorStyle)))))',
  })
  const rowData = grid.data.sheets?.[0]?.data?.[0]?.rowData ?? []
  const colorByRow = new Map<number, SheetColor>()
  rowData.forEach((rd, index) => {
    const cells = (rd.values ?? []) as CellData[]
    let color = classifyCell(cells[nameIdx])
    if (color === 'none') {
      for (let i = 0; i < Math.min(cells.length, 18); i++) {
        const c = classifyCell(cells[i])
        if (c !== 'none') { color = c; break }
      }
    }
    colorByRow.set(index + 2, color)
  })

  return { info, rows: rows.map(r => ({ ...r, color: colorByRow.get(r.rowNumber) ?? 'none' })) }
}

export interface CadastroSheetRow {
  rowNumber: number
  nome: string
  email: string | null
  whatsapp: string | null
  uf: string | null
  cidade: string | null
  cpf: string | null
  inscricaoEstadual: string | null
  cabecas: string | null
  interesse: string | null
  momento: string | null
}

// Aba "Cadastro JMP": layout livre (montado pela equipe). Resolvemos cada campo
// pelo cabeçalho, tolerando variações de nome — não dependemos de posição fixa.
const CADASTRO_FIELD_ALIASES: Record<keyof Omit<CadastroSheetRow, 'rowNumber'>, string[]> = {
  nome: ['nome', 'nomecompleto', 'cliente', 'razaosocial'],
  email: ['email'],
  whatsapp: ['whatsapp', 'whats', 'telefone', 'celular', 'contato', 'fone'],
  uf: ['uf', 'estado'],
  cidade: ['cidade', 'municipio'],
  cpf: ['cpf', 'cpfcnpj', 'cnpj', 'documento'],
  inscricaoEstadual: ['inscricaoestadual', 'ie', 'inscestadual', 'inscricao'],
  cabecas: ['cabecas', 'quantidadeanimais', 'qtdanimais', 'rebanho', 'animais'],
  interesse: ['interesse', 'oquebusca', 'busca'],
  momento: ['momento', 'momentopecuaria'],
}

function resolveCadastroLayout(headerRow: string[]): Map<keyof Omit<CadastroSheetRow, 'rowNumber'>, number> {
  const normalized = headerRow.map(normalizeHeaderText)
  const map = new Map<keyof Omit<CadastroSheetRow, 'rowNumber'>, number>()
  for (const [field, aliases] of Object.entries(CADASTRO_FIELD_ALIASES) as [keyof Omit<CadastroSheetRow, 'rowNumber'>, string[]][]) {
    const idx = normalized.findIndex(h => h && aliases.some(a => h === a || h.startsWith(a)))
    if (idx >= 0) map.set(field, idx)
  }
  return map
}

/**
 * Lê os cadastros prontos da aba "Cadastro JMP". Retorna [] se a aba não existir
 * ou a planilha não estiver conectada (best-effort — nunca quebra o chamador).
 */
export async function readCadastroSheetRows(): Promise<{ info: SheetInfo | null; rows: CadastroSheetRow[] }> {
  const info = await getStoredInfo()
  if (!info) return { info: null, rows: [] }
  const auth = getAuth()
  if (!auth) return { info, rows: [] }

  const sheets = google.sheets({ version: 'v4', auth })
  // A aba pode não existir ainda — confirma antes de ler.
  const meta = await sheets.spreadsheets.get({ spreadsheetId: info.spreadsheetId, includeGridData: false })
  const hasTab = meta.data.sheets?.some(s => s.properties?.title === CADASTRO_TAB)
  if (!hasTab) return { info, rows: [] }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: info.spreadsheetId,
    range: `${CADASTRO_TAB}!A1:${columnName(HEADER_READ_COLUMNS)}1`,
  })
  const headerRow = ((headerRes.data.values?.[0] ?? []) as unknown[]).map(v => String(v ?? '').trim())
  const layout = resolveCadastroLayout(headerRow)
  if (!layout.has('nome')) return { info, rows: [] }

  const endColumn = columnName(Math.max(headerRow.length, HEADER_READ_COLUMNS))
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: info.spreadsheetId,
    range: `${CADASTRO_TAB}!A2:${endColumn}`,
  })
  const values = (res.data.values ?? []) as string[][]
  const get = (row: string[], field: keyof Omit<CadastroSheetRow, 'rowNumber'>): string => {
    const idx = layout.get(field)
    return idx == null ? '' : cell(row, idx)
  }
  const rows = values
    .map((row, index) => ({
      rowNumber: index + 2,
      nome: get(row, 'nome'),
      email: blankToNull(get(row, 'email')),
      whatsapp: blankToNull(get(row, 'whatsapp')),
      uf: blankToNull(get(row, 'uf')),
      cidade: blankToNull(get(row, 'cidade')),
      cpf: blankToNull(get(row, 'cpf')),
      inscricaoEstadual: blankToNull(get(row, 'inscricaoEstadual')),
      cabecas: blankToNull(get(row, 'cabecas')),
      interesse: blankToNull(get(row, 'interesse')),
      momento: blankToNull(get(row, 'momento')),
    }))
    .filter(r => r.nome)

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
  // AWAIT obrigatório: em serverless (Vercel) trabalho não-aguardado é
  // congelado quando a resposta sai — com `void` a normalização nunca rodava.
  await normalizeMetaRawRows()

  return { skipped: false }
}

// ── Leads da LANDING na aba "Leads EAO" ────────────────────────────────────
// A mesma aba que syncEaoLeadsToTab alimenta com os leads do Meta recebe também
// os leads do formulário de eao.bulaassessoria.com. Não colidem: o espelho do
// Meta é idempotente pelo Lead ID (id do Meta) e nunca reescreve linha alheia;
// as linhas da landing carregam o uuid do crm_leads.
//
// Layout próprio: começa em "Data" na coluna A (NÃO tem o "Atendido por" da aba
// Leads JMP) e não recebe o despejo cru do Meta — por isso não reusa
// ensureSheetLayout, cujo alinhamento é específico daquele layout.

/**
 * Garante que a aba tenha todas as colunas de EAO_HEADER. Colunas que faltam
 * são acrescentadas no FIM — nunca sobrescrevemos uma coluna já preenchida
 * (a equipe pode ter adicionado as suas).
 */
async function ensureEaoLayout(sheets: SheetsClient, spreadsheetId: string): Promise<Map<EaoHeaderName, number>> {
  const headerRow = await readHeaderRow(sheets, spreadsheetId, LEADS_EAO_TAB)

  const next = headerRow.some(Boolean) ? [...headerRow] : [...EAO_HEADER]
  for (const header of EAO_HEADER) {
    if (next.some((h) => normalizeHeaderText(String(h ?? '')) === normalizeHeaderText(header))) continue
    next.push(header)
  }

  if (next.join(' ') !== headerRow.join(' ')) {
    await updateHeaderRow(sheets, spreadsheetId, next, LEADS_EAO_TAB)
  }

  const indexes = new Map<EaoHeaderName, number>()
  next.forEach((h, i) => {
    const match = EAO_HEADER.find((e) => normalizeHeaderText(e) === normalizeHeaderText(String(h ?? '')))
    if (match && !indexes.has(match)) indexes.set(match, i)
  })
  return indexes
}

/** Grava o lead da landing do EAO na aba dedicada da campanha. */
export async function appendLeadToEaoSheet(lead: SheetLead): Promise<{ skipped: boolean; reason?: string }> {
  const info = await getStoredInfo()
  if (!info) return { skipped: true, reason: 'not_provisioned' }
  const auth = getAuth()
  if (!auth) {
    console.error('[jmp-sheets] append EAO PULADO (credenciais ausentes/inválidas) — lead não foi para a planilha:', lead.nome)
    return { skipped: true, reason: 'no_credentials' }
  }

  const sheets = google.sheets({ version: 'v4', auth })
  const indexes = await ensureEaoLayout(sheets, info.spreadsheetId)

  const row = Array.from({ length: Math.max(...indexes.values()) + 1 }, () => '')
  const set = (header: EaoHeaderName, value: string | null | undefined) => {
    const index = indexes.get(header)
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
  set('Inscrição Estadual', lead.inscricaoEstadual)
  set('Interesse', lead.interesse)
  set('Qtd. desejada', lead.oQueBusca)
  set('Lead ID', lead.leadId)
  // A aba da equipe chama de "Campanha"/"Anúncio" o que a landing manda como
  // utm_campaign / utm_content (o criativo). ad_id entra como reserva.
  set('Campanha', lead.utm_campaign)
  set('Anúncio', lead.utm_content || lead.ad_id)
  set('Leilão de interesse', lead.leiloesDescricao)
  set('Consentimento WhatsApp', lead.whatsappConsent ? 'Sim' : 'Não')

  // appendCells (e não values.append) pelo mesmo motivo da aba Leads JMP:
  // o append clássico usa detecção de tabela e desloca linhas quando há
  // células órfãs abaixo da tabela.
  const sheetId = await getTabSheetId(sheets, info.spreadsheetId, LEADS_EAO_TAB)
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

  return { skipped: false }
}
