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

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  let creds: { client_email: string; private_key: string }
  try {
    creds = JSON.parse(raw)
  } catch {
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

export async function readSheetLeadRows(): Promise<{ info: SheetInfo; rows: SheetLeadRow[] }> {
  const info = await getStoredInfo()
  if (!info) throw new Error('Planilha de leads JMP não conectada.')
  const auth = getAuth()
  if (!auth) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON ausente — configure a service account.')

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
  if (!auth) return { skipped: true, reason: 'no_credentials' }

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

  await sheets.spreadsheets.values.append({
    spreadsheetId: info.spreadsheetId,
    range: `${TAB}!A:${columnName(row.length)}`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  })
  return { skipped: false }
}
