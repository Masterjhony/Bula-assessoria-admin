import { google } from 'googleapis'
import { supabaseAdmin } from './supabase'

// Integração com Google Sheets: cada lead do formulário JMP vira uma linha na
// aba "Leads JMP" de uma planilha criada pela service account (a mesma de
// GA4/Calendar). O id da planilha fica em jmp_config(key='sheets').

const CONFIG_KEY = 'sheets'
const TAB = 'Leads JMP'
const SHARE_EMAIL = 'formuladoboi@gmail.com'
const HEADER = ['Data', 'Nome', 'E-mail', 'WhatsApp', 'UF', 'Cidade', 'Momento', 'Cabeças', 'Interesse', 'Lead ID', 'Qtd. desejada', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ad-id']

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
    requestBody: { values: [HEADER] },
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
  const head = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${TAB}!1:1` })
  if (!head.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: id, range: `${TAB}!A1`, valueInputOption: 'RAW', requestBody: { values: [HEADER] },
    })
  }
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
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  ad_id?: string | null
  leadId?: string | null
  createdAt?: Date
}

/** Acrescenta o lead na planilha. Só grava se a planilha já foi conectada. */
export async function appendLeadToSheet(lead: SheetLead): Promise<{ skipped: boolean; reason?: string }> {
  const info = await getStoredInfo()
  if (!info) return { skipped: true, reason: 'not_provisioned' }
  const auth = getAuth()
  if (!auth) return { skipped: true, reason: 'no_credentials' }

  const sheets = google.sheets({ version: 'v4', auth })

  // Planilhas criadas antes da coluna "Qtd. desejada" têm o cabeçalho curto —
  // atualiza-o (best-effort) para que a coluna nova fique rotulada.
  try {
    const head = await sheets.spreadsheets.values.get({ spreadsheetId: info.spreadsheetId, range: `${TAB}!1:1` })
    if ((head.data.values?.[0]?.length ?? 0) < HEADER.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: info.spreadsheetId, range: `${TAB}!A1`, valueInputOption: 'RAW', requestBody: { values: [HEADER] },
      })
    }
  } catch { /* não bloqueia o append do lead */ }

  const row = [
    fmtDate(lead.createdAt ?? new Date()),
    lead.nome, lead.email, lead.whatsapp,
    lead.uf ?? '', lead.cidade ?? '', lead.momento ?? '', lead.cabecas ?? '',
    lead.interesse ?? '', lead.leadId ?? '', lead.oQueBusca ?? '',
    lead.utm_source ?? '', lead.utm_medium ?? '', lead.utm_campaign ?? '',
    lead.utm_content ?? '', lead.ad_id ?? '',
  ]
  await sheets.spreadsheets.values.append({
    spreadsheetId: info.spreadsheetId,
    range: `${TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  })
  return { skipped: false }
}
