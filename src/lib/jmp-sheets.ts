import { google } from 'googleapis'
import { supabaseAdmin } from './supabase'

// Integração com Google Sheets: cada lead do formulário JMP vira uma linha na
// aba "Leads JMP" de uma planilha criada pela service account (a mesma de
// GA4/Calendar). O id da planilha fica em jmp_config(key='sheets').

const CONFIG_KEY = 'sheets'

// ─────────────────────────────────────────────────────────────────────────────
// ESTRUTURA DA PLANILHA (31/07/2026, pedido do dono) — 5 abas, só isso:
//
//   LEADS GERAIS  base única: TODO lead novo cai aqui, com "Etapa" e
//                 "Atendido por" (colunas da equipe — o código nunca escreve
//                 nelas). É a antiga "LEADS BULA - PERPETUO", renomeada.
//   TOUROS | FEMEAS | EMBRIÕES | OUTROS
//                 recortes da LEADS GERAIS pelo campo "Interesse".
//
// As 14 abas antigas (landings separadas, abas por assessor, dumps crus do
// Meta, listas soltas) foram consolidadas na LEADS GERAIS por
// scripts/reestrutura-planilha-leads.mjs — deduplicadas por telefone/e-mail e
// sem os leads de teste. Manter esta lista fechada: aba nova que apareça (o
// conector do Meta recria a dele) é absorvida e removida pelo cron. Ver
// absorveDumpsCrusDoMeta().
// ─────────────────────────────────────────────────────────────────────────────
export const LEADS_GERAIS_TAB = 'LEADS GERAIS'
const TAB = LEADS_GERAIS_TAB
/**
 * A aba-arquivo e a base de leads viraram a MESMA aba. O nome antigo continua
 * exportado porque as rotas das landings importam por ele.
 */
export const LEADS_BULA_PERPETUO_TAB = LEADS_GERAIS_TAB
/** Nome anterior da base — usado só para reconhecer a planilha ainda não migrada. */
const LEADS_GERAIS_TAB_LEGADO = 'LEADS BULA - PERPETUO'
// Aba bruta do conector do Meta que existia até 07/2026. Não existe mais; a
// leitura resiste (devolve vazio) e o cron absorve qualquer dump cru que volte.
export const LEADS_BULA_TAB = 'Cópia de LEADS BULA'

/** Abas-recorte por interesse. A chave é o "balde" resolvido por abaDoInteresse(). */
export const ABAS_INTERESSE = {
  touros: 'TOUROS',
  femeas: 'FEMEAS',
  embrioes: 'EMBRIÕES',
  outros: 'OUTROS',
} as const
type BaldeInteresse = keyof typeof ABAS_INTERESSE
/** Todas as abas que a planilha deve ter — nada além disto sobrevive ao cron. */
const ABAS_OFICIAIS: string[] = [LEADS_GERAIS_TAB, ...Object.values(ABAS_INTERESSE)]

/**
 * Vocabulário de interesse exibido na planilha. O formulário do Meta e as
 * landings mandam slugs diferentes para a mesma coisa ("touros_po", "touros-po",
 * "Matrizes PO"); a planilha guarda UM rótulo por interesse, senão o recorte
 * por aba fura.
 */
const INTERESSE_LABEL = new Map<string, string>([
  ['touros', 'Touros'], ['tourospo', 'Touros'],
  ['bezerraspo', 'Bezerras PO'], ['bezerras', 'Bezerras PO'],
  ['matrizespo', 'Matrizes PO'], ['matrizes', 'Matrizes PO'], ['novilhas', 'Matrizes PO'],
  ['embrioes', 'Embriões'], ['embrioespo', 'Embriões'],
  ['semen', 'Sêmen'],
  ['naosei', 'Não sei ainda'], ['naoseiainda', 'Não sei ainda'],
  ['false', ''],
])

/** Slug/rótulo cru de interesse → rótulo canônico da planilha. */
export function rotulaInteresse(raw: string | null | undefined): string {
  const bruto = String(raw ?? '').trim()
  if (!bruto) return ''
  const k = normalizeHeaderText(bruto)
  const direto = INTERESSE_LABEL.get(k)
  if (direto != null) return direto
  if (/test lead|dummy data/i.test(bruto)) return ''
  if (k.includes('embri')) return 'Embriões'
  if (k.includes('touro')) return 'Touros'
  if (k.includes('bezerr')) return 'Bezerras PO'
  if (k.includes('matriz') || k.includes('novilh') || k.includes('femea')) return 'Matrizes PO'
  if (k.includes('semen') || k.includes('semem')) return 'Sêmen'
  if (k.includes('naosei')) return 'Não sei ainda'
  return bruto
}

/**
 * Aba-recorte do lead, decidida SÓ pela coluna "Interesse" — é o que a aba
 * promete ser. Já olhou também a "Qtd. desejada" e isso levou 2 leads de
 * bezerras para a TOUROS só porque a quantidade dizia "1 a 5 touros".
 * Um lead entra em UMA aba só; interesse vazio ou fora do vocabulário (sêmen,
 * "não sei ainda") cai em OUTROS, que é a aba de quem falta qualificar.
 */
export function abaDoInteresse(interesse: string): BaldeInteresse {
  const t = normalizeHeaderText(interesse)
  if (t.includes('touro')) return 'touros'
  if (t.includes('bezerr') || t.includes('matriz') || t.includes('novilh') || t.includes('femea')) return 'femeas'
  if (t.includes('embri')) return 'embrioes'
  return 'outros'
}
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
  /**
   * Rótulo do formulário de origem gravado na coluna `form_name` da aba-arquivo.
   * É por ele que syncTourosLandingTabs() separa os leads da landing dos leads
   * crus do Meta — e é por ele que distingue o perpétuo do lançamento São
   * Geraldo. Omitido = perpétuo (TOUROS_FORM_NAME).
   */
  formName?: string | null
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

// Vocabulário do que o Meta manda → o rótulo que a planilha usa. É o MESMO
// rótulo que a consolidação de 31/07 gravou nas 1.7k linhas antigas: se estes
// mapas voltarem a devolver slug ("nao-trabalho-quero-aprender", "0-50"), a
// coluna volta a ter dois vocabulários e o filtro da equipe racha em dois.
const META_MOMENTO = new Map([
  ['não_trabalho,_quero_aprender', 'Não trabalho, quero aprender'],
  ['nao_trabalho,_quero_aprender', 'Não trabalho, quero aprender'],
  ['trabalho_com_pecuária_de_corte', 'Pecuária de corte'],
  ['trabalho_com_pecuaria_de_corte', 'Pecuária de corte'],
  ['trabalho_com_corte_e_po', 'Corte e PO'],
  ['sou_criador_renomado_de_po', 'Criador renomado de PO'],
  ['criador_renomado_de_po', 'Criador renomado de PO'],
])
const META_CABECAS = new Map([
  ['0-50', '1 a 50 cabeças'], ['51-100', '51 a 100 cabeças'], ['101-300', '101 a 300 cabeças'],
  ['301-500', '301 a 500 cabeças'], ['500+', 'mais de 500 cabeças'], ['nenhuma', 'nenhuma'],
])
const META_INTERESSE = new Map([
  ['bezerras_po', 'bezerras-po'], ['touros_po', 'touros-po'],
  ['matrizes_po', 'matrizes-po'], ['não_sei', 'nao-sei'], ['nao_sei', 'nao-sei'],
])
/**
 * Substantivo da quantidade, resolvido pelo RÓTULO final do interesse — não
 * pelo slug cru. O Meta manda tanto "touros_po" quanto "touros"; indexar pelo
 * slug fazia o segundo cair fora do mapa e gravar "1 a 5" onde as outras
 * linhas dizem "1 a 5 touros".
 */
const META_NOUN = new Map([
  ['Bezerras PO', 'bezerras'], ['Touros', 'touros'],
  ['Matrizes PO', 'matrizes'], ['Embriões', 'embriões'],
])
const META_QTD = new Map([
  ['0-5', '1 a 5'], ['1-5', '1 a 5'], ['6-10', '6 a 10'],
  ['11-20', '11 a 20'], ['21-50', '21 a 50'], ['50+', 'mais de 50'],
  ['ainda_não_sei', 'ainda não sei'], ['ainda_nao_sei', 'ainda não sei'],
])

/** Plataforma do Meta → utm_source legível (a coluna tinha "ig" e "instagram"). */
function metaPlatformToUtmSource(platform: string): string {
  const p = String(platform || '').trim().toLowerCase()
  if (p === 'ig') return 'instagram'
  if (p === 'fb') return 'facebook'
  return p
}
const UF_BY_NAME = new Map(Object.entries({
  'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA', 'ceara': 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO', 'maranhao': 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', 'para': 'PA',
  'paraiba': 'PB', 'parana': 'PR', 'pernambuco': 'PE', 'piaui': 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', 'rondonia': 'RO', 'roraima': 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO',
}))

/**
 * Nome do Instagram costuma vir nas letras "estilizadas" do Unicode
 * (𝐈𝐯𝐚𝐧 𝐕𝐞𝐥𝐥𝐨𝐬𝐨, 𝓝𝓪𝓷𝓭𝓪). NFKC devolve a letra normal. Sem isso o nome fica
 * impossível de buscar na planilha e some na normalização — 14 leads reais
 * estavam sendo tratados como "teste" e não entravam nas abas de trabalho.
 */
const SMALL_CAPS = new Map(Object.entries({
  'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ꜰ': 'f', 'ɢ': 'g', 'ʜ': 'h', 'ɪ': 'i',
  'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p', 'ʀ': 'r', 'ꜱ': 's',
  'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z',
}))

export function nomeLegivel(raw: string | null | undefined): string {
  const base = String(raw ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
  // Small caps (ɢᴜꜱᴛᴀᴠᴏ ᴍɪʀᴀɴᴅᴀ) o NFKC não cobre: são letras fonéticas, não
  // variantes de compatibilidade. Convertidas na mão e recapitalizadas.
  const convertido = [...base].map(c => SMALL_CAPS.get(c) ?? c).join('')
  if (convertido === base) return base
  return convertido.replace(/(^|\s)(\p{L})/gu, (_m, sp: string, l: string) => sp + l.toUpperCase())
}

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
  fullName: string; cpf: string; email: string; phone: string; state: string; leadStatus: string
}

/**
 * "cpf_(brazil)" é campo NATIVO do Meta (não é pergunta) e o conector o despeja
 * entre o nome e o e-mail. Reconhecê-lo é obrigatório: sem isto o nome do lead
 * vira o CPF na planilha (18/08, form "BULA PERPETUO v1" da Expogenética).
 */
/** Status que o Meta usa na coluna lead_status (o resto é campo oculto do form). */
function ehLeadStatus(v: string): string {
  const s = String(v || '').trim()
  return /^(created|active|archived|converted|disqualified|contacted|closed)$/i.test(s) ? s.toUpperCase() : ''
}

function ehCpfOuCnpj(v: string): boolean {
  const d = String(v || '').replace(/\D/g, '')
  if (d.length !== 11 && d.length !== 14) return false
  // Só conta como documento se a célula não tiver letra nenhuma (nome não entra).
  return !/\p{L}/u.test(String(v || ''))
}

/**
 * Detecta e interpreta uma linha crua do Meta. O id "l:<n>" pode estar em A
 * (linhas atuais) ou em B (linhas antigas, deslocadas quando a coluna
 * "Atendido por" foi inserida — nesse caso A é preservada).
 */
export function parseRawMetaLead(row: string[]): RawMetaLead | null {
  let offset: number | null = null
  let atendidoPor = ''
  if (/^l:\d+/.test(String(row[0] ?? ''))) offset = 0
  else if (/^l:\d+/.test(String(row[1] ?? ''))) { offset = 1; atendidoPor = String(row[0] ?? '').trim() }
  if (offset == null) return null
  const off = offset
  const f = (i: number) => String(row[off + i] ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}T/.test(f(1))) return null
  const largura = row.length - off

  // ── Bloco das PERGUNTAS: tamanho VARIÁVEL ────────────────────────────────
  // O conector despeja os 12 campos fixos (id..platform), depois as respostas
  // do formulário — uma coluna por pergunta — e só então nome/e-mail/telefone.
  // Cada formulário tem o seu conjunto: o de São Geraldo veio com 6 perguntas
  // onde o do perpétuo tem 5, e ler por posição fixa jogou o NOME do lead na
  // coluna de e-mail ("Nome=50+", "E-mail=Vilmar Leal barbosa"). Por isso a
  // âncora é o TELEFONE, que o conector sempre escreve como "p:+55...".
  let iPhone = -1
  for (let i = 12; i < largura; i++) { if (/^p:/.test(f(i))) { iPhone = i; break } }
  if (iPhone < 0) {
    // Sem "p:" (lead de teste, telefone vazio): ancora pelo e-mail.
    for (let i = 12; i < largura; i++) { if (f(i).includes('@')) { iPhone = i + 1; break } }
  }
  if (iPhone < 14) iPhone = 19 // formulário fora do padrão: volta ao layout clássico
  const iEmail = iPhone - 1
  // Entre o nome e o e-mail pode haver o campo nativo "cpf_(brazil)" (os forms
  // de 2026 em diante pedem CPF). Se a célula anterior ao e-mail for documento
  // — ou o placeholder do lead de teste, ou simplesmente vazia porque o campo é
  // opcional —, o nome está uma coluna mais à esquerda. O CPF a gente aproveita.
  const ehColunaDeCpf = (v: string) => ehCpfOuCnpj(v) || /cpf/i.test(v)
  let iCpf = -1, iNome = iPhone - 2
  const temLetra = (v: string) => /\p{L}/u.test(v)
  // Resposta de pergunta ("0-50", "50+", "sim", "não") NUNCA é nome: enquanto a
  // coluna candidata a nome for uma delas, o bloco das perguntas ainda não
  // acabou e não há campo de CPF nenhum para deslocar.
  const ehRespostaDePergunta = (v: string) => /^(\d+\s*-\s*\d+|\d+\+|sim|nao)$/.test(deaccent(v).toLowerCase())
  if (iNome > 12 && !ehRespostaDePergunta(f(iNome - 1))) {
    if (ehColunaDeCpf(f(iNome))) {
      // CPF logo antes do e-mail já PROVA o layout — o nome é a coluna
      // anterior, tenha ela letras ou não. Exigir letras aqui escrevia o CPF na
      // coluna Nome sempre que o lead digitasse só números como nome: em 27/08
      // o lead 1614193106884911 entrou como "165.076.777-36" porque tinha
      // digitado "18" no nome.
      iCpf = iNome
      iNome -= 1
    } else if (!temLetra(f(iNome)) && temLetra(f(iNome - 1))) {
      // Campo de CPF opcional em branco: sem documento para provar o layout, só
      // desloca se a coluna anterior tiver cara de nome.
      iNome -= 1
    }
  }

  const perguntas: string[] = []
  for (let i = 12; i < iNome; i++) perguntas.push(f(i))
  const acha = (re: RegExp, desde = 0) => {
    for (let i = desde; i < perguntas.length; i++) if (re.test(deaccent(perguntas[i]).toLowerCase())) return i
    return -1
  }
  const iInteresse = acha(/touro|bezerr|matriz|embri|semen|semem|nao_sei|nao sei/)
  // "sim/não" é a inscrição estadual — mas um form com pergunta sim/não a mais
  // no começo confundiria: vale a ÚLTIMA antes do interesse.
  let iIe = -1
  perguntas.forEach((v, i) => {
    if (!/^(sim|nao)$/.test(deaccent(v).toLowerCase())) return
    if (iInteresse < 0 || i < iInteresse) iIe = i
  })
  if (iIe < 0) iIe = acha(/^(sim|nao)$/)
  const iMomento = acha(/trabalho|criador|aprender|corte|pecuaria/)
  // Faixa numérica ("0-50", "51-100", "50+"): antes do interesse é rebanho,
  // depois é a quantidade desejada — é a ordem de toda pergunta destes forms.
  const faixa = /^(\d+\s*-\s*\d+|\d+\+|nenhuma|ainda.*sei)$/
  let iCabecas = -1, iQtd = -1
  perguntas.forEach((v, i) => {
    if (!faixa.test(deaccent(v).toLowerCase())) return
    if (iInteresse >= 0 && i > iInteresse) { if (iQtd < 0) iQtd = i }
    else if (iCabecas < 0) iCabecas = i
  })
  const q = (i: number) => (i >= 0 ? perguntas[i] : '')

  return {
    atendidoPor,
    id: stripPrefix(f(0), 'l:'), created: f(1), adId: stripPrefix(f(2), 'ag:'), adName: f(3),
    adsetId: stripPrefix(f(4), 'as:'), adsetName: f(5), campaignId: stripPrefix(f(6), 'c:'), campaignName: f(7),
    formId: stripPrefix(f(8), 'f:'), formName: f(9), isOrganic: f(10), platform: f(11),
    momento: q(iMomento), cabecas: q(iCabecas), temIe: q(iIe), interesse: q(iInteresse), qtd: q(iQtd),
    fullName: f(iNome), cpf: iCpf >= 0 && ehCpfOuCnpj(f(iCpf)) ? f(iCpf) : '',
    email: f(iEmail), phone: f(iPhone), state: f(iPhone + 1),
    // Depois do estado o form novo ainda despeja campos ocultos ("canal"), que
    // não são status: só vale o que tem cara de status do Meta.
    leadStatus: ehLeadStatus(String(row[39] ?? '')) || ehLeadStatus(f(iPhone + 2)) || 'CREATED',
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
function buildNormalizedMetaRow(p: RawMetaLead, headerRow: string[], width: number): string[] {
  // Uma fonte só de vocabulário: as mesmas regras que montam a linha da base
  // (rótulos de Momento/Cabeças/Interesse, Zona, Origem, metadados de mídia).
  // Antes esta função tinha a cópia dela e escrevia "Atendido por" na coluna 0
  // — que na estrutura de 5 abas é a "Etapa", da equipe.
  const values = buildPerpetuoValues(p)
  const out = Array.from({ length: Math.max(width, headerRow.length) }, () => '')
  headerRow.forEach((h, i) => {
    const v = values.get(normalizeHeaderText(String(h ?? '')))
    if (v != null) out[i] = v
  })
  return out
}

// ── Trava da auto-cura ──────────────────────────────────────────────────────
// Um UPDATE ... WHERE no Postgres é atômico: quem consegue mudar a linha leva a
// trava. Expira sozinha em 2 min, então processo derrubado no meio não trava a
// planilha para sempre.
const HEAL_LOCK_KEY = 'sheets_heal_lock'
const HEAL_LOCK_MS = 120_000
const LIVRE = new Date(0).toISOString()

async function tomaTravaDeCura(): Promise<boolean> {
  try {
    const db = supabaseAdmin()
    // Garante a linha sem nunca zerar uma trava em uso.
    await db.from('jmp_config')
      .upsert({ key: HEAL_LOCK_KEY, value: {}, updated_at: LIVRE }, { onConflict: 'key', ignoreDuplicates: true })
    const { data } = await db.from('jmp_config')
      .update({ updated_at: new Date().toISOString() })
      .eq('key', HEAL_LOCK_KEY)
      .lt('updated_at', new Date(Date.now() - HEAL_LOCK_MS).toISOString())
      .select('key')
    return Boolean(data?.length)
  } catch (e) {
    // Sem banco não dá para coordenar — melhor não mexer na planilha.
    console.warn('[jmp-sheets] trava da auto-cura indisponível:', e instanceof Error ? e.message : e)
    return false
  }
}

async function liberaTravaDeCura(): Promise<void> {
  try {
    await supabaseAdmin().from('jmp_config').update({ updated_at: LIVRE }).eq('key', HEAL_LOCK_KEY)
  } catch { /* expira sozinha em 2 min */ }
}

/**
 * Normaliza as linhas cruas do Meta e as MOVE para o topo da LEADS GERAIS.
 *
 * Até 18/08 esta rotina reescrevia a linha in place. O conector do Meta despeja
 * no FIM da aba, então o lead ficava formatado mas parado na última linha — e,
 * já normalizado, o absorveDumpsCrusDoMeta não o reconhecia mais como cru e
 * nunca o levava para o topo. Resultado que a equipe viu: "os leads estão
 * caindo no final". Aqui a linha nova nasce no topo (a base é decrescente por
 * Data) e a linha crua original é apagada — tudo num batchUpdate só, que o
 * Google aplica na ordem ou não aplica nada: sem janela para duplicar.
 *
 * Roda sob trava: como agora ela APAGA linha por índice, duas execuções ao
 * mesmo tempo (o cron e um lead da landing, por exemplo) apagariam a linha
 * errada — a primeira inserção desloca os índices que a segunda leu. Com a
 * reescrita in place isso era inofensivo; aqui não é.
 *
 * Best-effort: falha vira warn (nunca quebra o fluxo de quem chamou). Retorna
 * quantas linhas foram normalizadas.
 */
export async function normalizeMetaRawRows(): Promise<number> {
  const trava = await tomaTravaDeCura()
  if (!trava) return 0
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
    const crus: { index: number; quando: number; row: string[] }[] = []
    values.forEach((row, index) => {
      const parsed = parseRawMetaLead(row)
      if (!parsed) return
      crus.push({
        index,
        quando: Date.parse(parsed.created) || 0,
        row: buildNormalizedMetaRow(parsed, headerRow, width),
      })
    })
    if (!crus.length) return 0
    const sheetId = await getTabSheetId(sheets, info.spreadsheetId, TAB)
    const n = crus.length
    // Mais novo primeiro, para o bloco entrar já na ordem da aba.
    const novas = [...crus].sort((a, b) => b.quando - a.quando).map(c => c.row)
    const requests: object[] = [
      {
        insertDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 1 + n },
          inheritFromBefore: false,
        },
      },
      {
        updateCells: {
          start: { sheetId, rowIndex: 1, columnIndex: 0 },
          rows: novas.map(r => ({ values: r.map(cellValue) })),
          fields: 'userEnteredValue',
        },
      },
      {
        // Lead novo entra sem cor = ENTRADA (a equipe pinta conforme atende).
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 1 + n },
          cell: { userEnteredFormat: { backgroundColorStyle: { themeColor: 'BACKGROUND' } } },
          fields: 'userEnteredFormat.backgroundColorStyle',
        },
      },
      // As linhas cruas desceram n posições com a inserção; apaga de baixo para
      // cima para um índice não deslocar o outro.
      ...crus
        .map(c => c.index + 1 + n)
        .sort((a, b) => b - a)
        .map(startIndex => ({
          deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex, endIndex: startIndex + 1 } },
        })),
    ]
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: info.spreadsheetId,
      requestBody: { requests },
    })
    console.log(`[jmp-sheets] ${n} linha(s) do Meta normalizadas e movidas para o topo`)
    return n
  } catch (e) {
    console.warn('[jmp-sheets] normalizeMetaRawRows falhou:', e instanceof Error ? e.message : e)
    return 0
  } finally {
    await liberaTravaDeCura()
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
      const row = parsed ? buildNormalizedMetaRow(parsed, headerRow, width) : raw
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
// Absorção dos despejos crus do conector do Meta.
//
// O conector é configurado POR FORMULÁRIO, fora do nosso controle, e despeja os
// leads crus/desalinhados na aba que estiver mapeada — inclusive dentro de uma
// aba de trabalho (foi o que aconteceu em 29/07: 14 linhas cruas caíram na
// "LEADS TOUROS", com `l:<id>` na coluna Etapa, e esses leads nunca chegaram na
// base). Como a planilha agora tem 5 abas e só 5, esta rotina:
//
//   1. lê TODA aba atrás de linha crua do Meta (`l:<id>` + timestamp ISO);
//   2. traduz cada lead para o layout da LEADS GERAIS e acrescenta lá o que
//      ainda não existe (dedup por id do Meta OU e-mail OU telefone);
//   3. apaga a linha crua de dentro das abas oficiais e remove a aba que o
//      conector tiver recriado.
//
// Aba criada pela equipe (sem cara de despejo do Meta) NÃO é removida — o cron
// não apaga trabalho de ninguém. Append-only na base: linha existente e as
// colunas da equipe ("Etapa", "Atendido por", "Observações") ficam intactas.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bloco de trabalho — IDÊNTICO nas 5 abas, para a equipe olhar sempre a mesma
 * coisa. "Etapa", "Atendido por" e "Observações" são da equipe: o código
 * escreve a linha nova com elas VAZIAS e nunca reescreve linha existente.
 */
const BLOCO_OPERACIONAL = [
  'Etapa', 'Atendido por', 'Data', 'Nome', 'WhatsApp', 'E-mail', 'UF', 'Zona', 'Cidade',
  'Momento', 'Cabeças', 'Inscrição Estadual', 'Interesse', 'Qtd. desejada', 'Lead ID',
  'Origem', 'utm_source', 'utm_campaign', 'utm_content', 'ad-id', 'Observações',
] as const

/** Só a LEADS GERAIS carrega os metadados de mídia (atribuição de campanha). */
const PERPETUO_HEADER = [
  ...BLOCO_OPERACIONAL,
  'utm_medium', 'id', 'created_time', 'ad_name', 'adset_name', 'campaign_name',
  'form_name', 'platform', 'lead de teste', 'lead_status',
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
  const noun = META_NOUN.get(rotulaInteresse(interesse)) || ''
  const qtdBase = META_QTD.get(p.qtd)
  const test = isMetaTestLead(p)
  const testPrefix = test ? '[TESTE META] ' : ''
  const entries: [string, string][] = [
    ['Atendido por', p.atendidoPor],
    ['Data', fmtDate(new Date(p.created))],
    ['Nome', testPrefix + nomeLegivel(p.fullName)],
    // O form pede CPF desde 08/2026: alimenta a coluna da equipe (CPF/CNPJ nas
    // abas-recorte) e as colunas cruas que o próprio conector criou.
    ['CPF/CNPJ', p.cpf],
    ['cpf', p.cpf],
    ['cpf_(brazil)', p.cpf],
    ['E-mail', p.email],
    ['WhatsApp', metaPhoneToWhatsApp(p.phone)],
    ['UF', metaStateToUF(p.state)],
    ['Zona', zonaDaUF(metaStateToUF(p.state))],
    ['Cidade', ''],
    ['Momento', META_MOMENTO.get(p.momento.toLowerCase()) || p.momento],
    ['Cabeças', META_CABECAS.get(p.cabecas) || p.cabecas],
    ['Inscrição Estadual', p.temIe ? (p.temIe.toLowerCase() === 'sim' ? 'Sim' : 'Não') : ''],
    ['Interesse', rotulaInteresse(interesse)],
    ['Origem', `Meta — ${p.campaignName || p.formName}`],
    ['Lead ID', p.id],
    ['Qtd. desejada', qtdBase ? `${qtdBase}${noun && qtdBase !== 'ainda não sei' ? ' ' + noun : ''}` : p.qtd],
    ['utm_source', metaPlatformToUtmSource(p.platform)],
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

/**
 * Origem legível do lead da landing (coluna "Origem"). O `form_name` é o que
 * separa as duas landings na base — aqui ele vira rótulo de gente.
 */
function rotulaOrigemLanding(formName: string): string {
  if (/s[ãa]o geraldo/i.test(formName)) return 'Landing São Geraldo'
  if (/eao|baviera/i.test(formName)) return 'Landing EAO'
  if (/touros/i.test(formName)) return 'Landing Touros'
  return formName
}

/**
 * Monta a linha dos cadastros feitos diretamente na landing de touros.
 * Preenche o bloco operacional (A..R) e também os campos crus equivalentes
 * (S..AN), mantendo a aba compatível com filtros/automações que leem o layout
 * original do formulário Meta.
 */
function buildPerpetuoLandingRow(lead: SheetLead, headerRow: string[]): string[] {
  const createdAt = lead.createdAt ?? new Date()
  const entries: [string, string][] = [
    ['Atendido por', ''],
    ['Data', fmtDate(createdAt)],
    ['Nome', nomeLegivel(lead.nome)],
    ['E-mail', lead.email],
    ['WhatsApp', lead.whatsapp],
    ['UF', lead.uf ?? ''],
    ['Zona', zonaDaUF(lead.uf ?? '')],
    ['Cidade', lead.cidade ?? ''],
    ['Momento', lead.momento ?? ''],
    ['Cabeças', lead.cabecas ?? ''],
    ['Inscrição Estadual', lead.inscricaoEstadual ?? ''],
    ['Interesse', rotulaInteresse(lead.interesse ?? 'touros-po')],
    ['Origem', rotulaOrigemLanding(lead.formName ?? TOUROS_FORM_NAME)],
    ['Lead ID', lead.leadId ?? ''],
    ['Qtd. desejada', lead.oQueBusca ?? ''],
    ['utm_source', lead.utm_source ?? ''],
    ['utm_medium', lead.utm_medium ?? ''],
    ['utm_campaign', lead.utm_campaign ?? ''],
    ['utm_content', lead.utm_content ?? ''],
    ['ad-id', lead.ad_id ?? ''],
    ['id', lead.leadId ?? ''],
    ['created_time', createdAt.toISOString()],
    ['ad_id', lead.ad_id ?? ''],
    ['ad_name', lead.utm_content ?? ''],
    ['campaign_name', lead.utm_campaign ?? ''],
    ['form_name', lead.formName ?? TOUROS_FORM_NAME],
    ['platform', lead.utm_source ?? 'site'],
    ['seu_momento_na_pecuaria', lead.momento ?? ''],
    ['você_tem_inscrição_estadual?', lead.inscricaoEstadual ?? ''],
    ['qual_o_seu_interesse?', lead.interesse ?? 'touros-po'],
    ['de_acordo_com_seu_interesse,_qual_a_quantidade_de_animais_desejada?', lead.oQueBusca ?? ''],
    ['full_name', lead.nome],
    ['email', lead.email],
    ['phone', lead.whatsapp],
    ['state', lead.uf ?? ''],
    ['lead de teste', 'Não'],
    ['lead_status', 'CREATED'],
  ]
  const values = new Map(entries.map(([key, value]) => [normalizeHeaderText(key), value]))
  return headerRow.map(header => values.get(normalizeHeaderText(header)) ?? '')
}

// ─────────────────────────────────────────────────────────────────────────────
// Reentrada nas escritas da planilha.
//
// 11/08: o primeiro lead da landing de fêmeas entrou na LEADS GERAIS e NÃO
// chegou à aba FEMEAS — a cópia para a fila do SDR morreu no meio e o erro só
// existiu no log. Sob tráfego pago é o pior modo de falha possível: o cadastro
// responde "ok" para quem preencheu e some da superfície onde a equipe trabalha.
//
// O que derruba um append aqui é quase sempre transitório: 429 de cota do
// Sheets (60 escritas/min por usuário — uma rajada de anúncio estoura), 5xx do
// Google e conexão cortada. Repetir resolve; o que não pode é repetir
// cegamente e duplicar a linha.
//
// Repetir É seguro porque toda função de append começa checando se o lead já
// está lá (Lead ID na LEADS GERAIS, chaveDoLead nas abas-recorte): se a
// primeira tentativa gravou e só a resposta se perdeu, a segunda devolve
// { skipped: true, reason: 'duplicate' } em vez de escrever de novo.
// ─────────────────────────────────────────────────────────────────────────────

/** Erro que vale repetir: cota, indisponibilidade do Google, conexão cortada. */
function erroTransitorioDoSheets(e: unknown): boolean {
  const err = e as { code?: unknown; status?: unknown; message?: unknown }
  const codigo = Number(err?.code ?? err?.status)
  if (codigo === 429 || (codigo >= 500 && codigo <= 599)) return true
  const msg = String(err?.message ?? '').toLowerCase()
  return /quota|rate limit|backenderror|internal error|timeout|etimedout|econnreset|socket hang up|eai_again/.test(msg)
}

/** Esperas entre as tentativas. Curtas: o lead está esperando a resposta. */
const ESPERAS_DE_RETRY = [500, 1500] as const

async function comRetryDeEscrita<T>(rotulo: string, escreve: () => Promise<T>): Promise<T> {
  let ultimo: unknown
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await escreve()
    } catch (e) {
      ultimo = e
      if (tentativa >= ESPERAS_DE_RETRY.length || !erroTransitorioDoSheets(e)) break
      console.error(
        `[jmp-sheets] ${rotulo}: erro transitório na tentativa ${tentativa + 1}, repetindo —`,
        e instanceof Error ? e.message : e,
      )
      await new Promise(r => setTimeout(r, ESPERAS_DE_RETRY[tentativa]))
    }
  }
  throw ultimo
}

/**
 * Grava imediatamente na aba organizada o lead capturado pela landing de
 * touros. O CRM continua sendo a fonte primária, mas o append é aguardado para
 * que a linha já esteja disponível à operação quando o formulário conclui.
 *
 * Idempotente pelo UUID do crm_leads: uma repetição do mesmo efeito colateral
 * não duplica a linha na planilha.
 */
export async function appendLeadToPerpetuoSheet(
  lead: SheetLead,
): Promise<{ skipped: boolean; reason?: string }> {
  return comRetryDeEscrita('LEADS GERAIS', () => gravaNaLeadsGerais(lead))
}

async function gravaNaLeadsGerais(
  lead: SheetLead,
): Promise<{ skipped: boolean; reason?: string }> {
  const info = await getStoredInfo()
  if (!info) return { skipped: true, reason: 'not_provisioned' }
  const auth = getAuth()
  if (!auth) {
    console.error('[jmp-sheets] append PERPETUO PULADO (credenciais ausentes/inválidas):', lead.nome)
    return { skipped: true, reason: 'no_credentials' }
  }

  const sheets = google.sheets({ version: 'v4', auth })
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: info.spreadsheetId,
    includeGridData: false,
  })
  const titles = (meta.data.sheets ?? []).map(sheet => sheet.properties?.title)
  if (!titles.includes(LEADS_BULA_PERPETUO_TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: info.spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: LEADS_BULA_PERPETUO_TAB } } }],
      },
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

  const leadIdIndex = header.map(normalizeHeaderText).indexOf('leadid')
  if (lead.leadId && leadIdIndex >= 0) {
    const leadIdColumn = columnName(leadIdIndex + 1)
    const currentIds = ((await sheets.spreadsheets.values.get({
      spreadsheetId: info.spreadsheetId,
      range: `${LEADS_BULA_PERPETUO_TAB}!${leadIdColumn}2:${leadIdColumn}`,
    })).data.values ?? []) as string[][]
    const alreadyExists = currentIds.some(row => String(row[0] ?? '').trim() === lead.leadId)
    if (alreadyExists) return { skipped: true, reason: 'duplicate' }
  }

  // Entra na linha 2, não no fim: a base é DECRESCENTE (mais recente em cima),
  // igual às abas-recorte. insertTourosRowsAtTop empurra as linhas existentes
  // inteiras (cor, nota, colunas da equipe) e replica a validação da Etapa.
  const row = buildPerpetuoLandingRow(lead, header)
  await insertTourosRowsAtTop(sheets, info.spreadsheetId, LEADS_BULA_PERPETUO_TAB, [row])

  return { skipped: false }
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
export async function absorveDumpsCrusDoMeta(): Promise<AbsorveResultado> {
  // Mesma trava da auto-cura: as duas apagam linha por índice na mesma aba, e
  // uma rodando dentro da outra faria o delete acertar a linha errada.
  const trava = await tomaTravaDeCura()
  if (!trava) return { appended: 0, total: 0, abasRemovidas: [], linhasLimpas: 0, reason: 'locked' }
  try {
    return await absorveDumpsCrusDoMetaSemTrava()
  } finally {
    await liberaTravaDeCura()
  }
}

interface AbsorveResultado {
  appended: number; total: number; abasRemovidas: string[]; linhasLimpas: number
  cabecalhosARestaurar?: string[]; reason?: string
}

async function absorveDumpsCrusDoMetaSemTrava(): Promise<AbsorveResultado> {
  const nada = { appended: 0, total: 0, abasRemovidas: [] as string[], linhasLimpas: 0 }
  const info = await getStoredInfo()
  if (!info) return { ...nada, reason: 'not_provisioned' }
  const auth = getAuth()
  if (!auth) return { ...nada, reason: 'no_credentials' }

  const sheets = google.sheets({ version: 'v4', auth })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: info.spreadsheetId, includeGridData: false })
  const abas = (meta.data.sheets ?? []).map(s => s.properties).filter(Boolean) as { title: string; sheetId: number }[]
  const titles = abas.map(a => a.title)
  const base = titles.includes(LEADS_GERAIS_TAB)
    ? LEADS_GERAIS_TAB
    : titles.includes(LEADS_GERAIS_TAB_LEGADO) ? LEADS_GERAIS_TAB_LEGADO : null
  if (!base) return { ...nada, reason: 'source_tab_missing' }

  let header = await readHeaderRow(sheets, info.spreadsheetId, base)
  if (!header.some(Boolean)) {
    header = [...PERPETUO_HEADER]
    await updateHeaderRow(sheets, info.spreadsheetId, header, base)
  }

  // Identidade do lead na base: id do Meta OU e-mail OU núcleo do telefone.
  const normHeader = header.map(normalizeHeaderText)
  const idCol = normHeader.indexOf('id')
  const nomeCol = normHeader.indexOf('nome')
  const emailCols = normHeader.flatMap((h, i) => h === 'email' ? [i] : [])
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

  const endCol = columnName(Math.max(header.length, HEADER_READ_COLUMNS))
  const dstRows = ((await sheets.spreadsheets.values.get({
    spreadsheetId: info.spreadsheetId, range: `${base}!A2:${endCol}`,
  })).data.values ?? []) as string[][]
  const seenId = new Set<string>(), seenEmail = new Set<string>(), seenPhone = new Set<string>()
  for (const r of dstRows) {
    const k = identity(r)
    if (k.id) seenId.add(k.id)
    if (k.email) seenEmail.add(k.email)
    if (k.phone) seenPhone.add(k.phone)
  }

  const fresh: string[][] = []
  let total = 0
  const considera = (candidate: string[]) => {
    const k = identity(candidate)
    if (!k.nome && !k.email && !k.phone) return
    total++
    if ((k.id && seenId.has(k.id)) || (k.email && seenEmail.has(k.email)) || (k.phone && seenPhone.has(k.phone))) return
    if (k.id) seenId.add(k.id)
    if (k.email) seenEmail.add(k.email)
    if (k.phone) seenPhone.add(k.phone)
    fresh.push(candidate)
  }

  const abasRemovidas: string[] = []
  const limpezas: { sheetId: number; linha: number }[] = []
  /** Abas cuja linha 1 foi comida pelo despejo e precisa voltar ao canônico. */
  const cabecalhosARestaurar: string[] = []
  for (const aba of abas) {
    const oficial = ABAS_OFICIAIS.includes(aba.title) || aba.title === base
    const values = ((await sheets.spreadsheets.values.get({
      spreadsheetId: info.spreadsheetId,
      range: `'${aba.title}'!A1:${columnName(HEADER_READ_COLUMNS)}`,
    })).data.values ?? []) as string[][]
    // A linha 1 também entra na varredura. O conector do Meta às vezes despeja
    // o lead EM CIMA dela e, enquanto esta rotina começava na linha 2, esse
    // lead ficava invisível aqui e virava "cabeçalho" lá no ensureTourosLayout
    // — a corrupção da TOUROS em 13/08 nasceu desse ponto cego.
    const linha1Crua = parseRawMetaLead(values[0] ?? []) != null
    const primeira = linha1Crua ? 0 : 1
    const srcHeader = (linha1Crua ? [] : (values[0] ?? [])).map(v => String(v ?? '').trim())
    const linhasCruas: number[] = []
    values.slice(primeira).forEach((raw, i) => {
      const metaLead = parseRawMetaLead(raw)
      if (metaLead) {
        considera(buildPerpetuoRow(metaLead, header))
        linhasCruas.push(i + primeira) // índice 0-based da linha na aba
      } else if (!oficial && raw.some(c => String(c ?? '').trim())) {
        considera(buildRowFromHeaderedSource(raw, srcHeader, header))
      }
    })

    if (oficial) {
      // Linha crua DENTRO de aba oficial: o lead já foi absorvido acima, a
      // linha some (é lixo desalinhado que suja a coluna Etapa da equipe).
      for (const linha of linhasCruas) {
        if (linha > 0) { limpezas.push({ sheetId: aba.sheetId, linha }); continue }
        // Linha 1: o despejo ocupou o lugar do cabeçalho. Só dá para APAGAR a
        // linha se o cabeçalho estiver logo abaixo (o conector inseriu uma
        // linha); se não estiver, ele foi sobrescrito e precisa ser
        // REESCRITO — apagar deixaria a aba sem cabeçalho nenhum.
        if (pareceCabecalho((values[1] ?? []).map(v => String(v ?? '').trim()))) {
          limpezas.push({ sheetId: aba.sheetId, linha })
        } else {
          cabecalhosARestaurar.push(aba.title)
        }
      }
      continue
    }
    // Aba de fora da estrutura: só removemos se for despejo do conector do
    // Meta (cabeçalho cru id/created_time ou linhas l:<id>). Aba que a equipe
    // criou fica onde está — o cron não apaga trabalho de ninguém.
    const cabecalhoCru = normalizeHeaderText(srcHeader[0] ?? '') === 'id'
      && normalizeHeaderText(srcHeader[1] ?? '') === 'createdtime'
    if (cabecalhoCru || linhasCruas.length) abasRemovidas.push(aba.title)
  }

  // `fresh` vem do mais antigo para o mais novo; a helper inverte e insere no
  // topo, mantendo a base decrescente.
  if (fresh.length) await insertTourosRowsAtTop(sheets, info.spreadsheetId, base, [...fresh].reverse())

  // Apaga de baixo para cima: apagar a linha 5 antes da 3 desloca a 3.
  // A inserção acima já empurrou a base para baixo — linha crua que estava LÁ
  // (é onde o conector despeja hoje) precisa do mesmo deslocamento, senão o
  // delete acerta um lead de verdade algumas linhas acima.
  const baseSheetId = abas.find(a => a.title === base)?.sheetId
  const requests: object[] = []
  const porAba = new Map<number, number[]>()
  for (const l of limpezas) {
    const linha = l.sheetId === baseSheetId ? l.linha + fresh.length : l.linha
    porAba.set(l.sheetId, [...(porAba.get(l.sheetId) ?? []), linha])
  }
  for (const [sheetId, linhas] of porAba) {
    for (const linha of [...linhas].sort((a, b) => b - a)) {
      requests.push({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: linha, endIndex: linha + 1 } } })
    }
  }
  for (const title of abasRemovidas) {
    const id = abas.find(a => a.title === title)?.sheetId
    if (id != null) requests.push({ deleteSheet: { sheetId: id } })
  }
  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: info.spreadsheetId, requestBody: { requests } })
  }

  // Reescreve a linha 1 das abas em que o despejo comeu o cabeçalho. O lead
  // que estava ali já foi absorvido na LEADS GERAIS acima, então sobrescrever
  // não perde nada — e sem cabeçalho a aba inteira fica ilegível pro código.
  for (const title of cabecalhosARestaurar) {
    await updateHeaderRow(sheets, info.spreadsheetId, cabecalhoCanonico(title), title)
    console.warn(`[jmp-sheets] cabeçalho da aba "${title}" restaurado: o conector do Meta havia escrito um lead na linha 1.`)
  }

  if (fresh.length || limpezas.length || abasRemovidas.length || cabecalhosARestaurar.length) {
    console.log(`[jmp-sheets] dumps do Meta absorvidos: +${fresh.length} lead(s), ${limpezas.length} linha(s) crua(s) limpa(s), abas removidas: ${abasRemovidas.join(', ') || '—'}, cabeçalhos restaurados: ${cabecalhosARestaurar.join(', ') || '—'}`)
  }
  return {
    appended: fresh.length, total, abasRemovidas, linhasLimpas: limpezas.length, cabecalhosARestaurar,
  }
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

/**
 * Acrescenta o lead da landing do JMP/EAO na planilha. Desde 31/07 a base é a
 * mesma das outras landings, então este caminho delega — antes ele montava a
 * linha por conta própria e o lead entrava no FIM da aba, sem Zona nem Origem.
 */
export async function appendLeadToSheet(lead: SheetLead): Promise<{ skipped: boolean; reason?: string }> {
  return appendLeadToPerpetuoSheet(lead)
}

// ─────────────────────────────────────────────────────────────────────────────
// Abas de TRABALHO da campanha de touros (touros.bulaassessoria.com)
//
// A "LEADS BULA - PERPETUO" é a aba-arquivo: recebe TODOS os leads (Meta +
// landing) e ninguém mexe nela — filtrar/ordenar/anotar lá arrisca o append.
// Estas três abas são cópias operacionais, alimentadas só com os leads que
// entraram pelo FORMULÁRIO DA LANDING de touros:
//
//   • "LEADS TOUROS"        → todos os leads da campanha (visão completa)
//   • "LEADS DOUGLAS"       → UFs das zonas do Douglas + do Leozinho
//   • "LEADS JOAO ANTONIO"  → as demais UFs (Nordeste exc. MA + Sudeste)
//
// Só ACRESCENTAM linhas e são idempotentes pelo Lead ID: rodar de novo nunca
// duplica e nunca reescreve linha existente — a equipe pode ordenar, filtrar,
// pintar e preencher "Atendido por"/"Observações" à vontade. Colunas extras
// criadas pela equipe são preservadas (ensureTourosLayout só ACRESCENTA no fim
// o que faltar).
//
// Onde a linha nova entra depende da aba (ver TOUROS_TABS_DESC): a "LEADS
// TOUROS" recebe no TOPO (mais recente primeiro, pedido da equipe 25/07); as
// outras duas seguem no fim.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TODAS as abas ficam em ordem DECRESCENTE (pedido da equipe 25/07, estendido
 * às 4 abas-recorte em 31/07): o lead novo entra na linha 2, empurrando os
 * antigos para baixo — quem abre a aba vê primeiro quem acabou de se cadastrar.
 */
const TABS_DESC = new Set<string>([...ABAS_OFICIAIS])

/** Marca as linhas da landing na aba-arquivo (form_name). Ver buildPerpetuoLandingRow. */
export const TOUROS_FORM_NAME = 'Landing Touros — Funil Perpétuo'

// Regra de zona → assessor (mesma de scripts/gera-planilha-por-assessor.mjs).
const ZONA_NORTE = new Set(['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'])
const ZONA_NORDESTE = new Set(['AL', 'BA', 'CE', 'PB', 'PE', 'PI', 'RN', 'SE']) // MA é exceção → Douglas
const ZONA_SUDESTE = new Set(['ES', 'MG', 'RJ', 'SP'])
const ZONA_SUL = new Set(['PR', 'RS', 'SC'])
const ZONA_CENTRO_OESTE = new Set(['DF', 'GO', 'MT', 'MS'])

function zonaDaUF(uf: string): string {
  const u = uf.trim().toUpperCase()
  if (u === 'MA') return 'Maranhão'
  if (ZONA_NORTE.has(u)) return 'Norte'
  if (ZONA_NORDESTE.has(u)) return 'Nordeste'
  if (ZONA_SUDESTE.has(u)) return 'Sudeste'
  if (ZONA_SUL.has(u)) return 'Sul'
  if (ZONA_CENTRO_OESTE.has(u)) return 'Centro-Oeste'
  return ''
}

// As abas-recorte usam o MESMO bloco da LEADS GERAIS, sem os metadados de
// mídia. "Etapa", "Atendido por" e "Observações" são da equipe — nunca escritos.
const TOUROS_HEADER = BLOCO_OPERACIONAL

/** Campos de um lead da landing, já normalizados, para montar a linha das abas. */
interface TourosLeadRow {
  data: string
  nome: string
  whatsapp: string
  email: string
  uf: string
  cidade: string
  momento: string
  cabecas: string
  inscricaoEstadual: string
  qtdTouros: string
  leadId: string
  utmSource: string
  utmCampaign: string
  utmContent: string
  adId: string
  /** Interesse já no vocabulário da planilha — é ele que decide a aba-recorte. */
  interesse: string
  /** Rótulo legível da origem ("Landing Touros", "Meta — <campanha>"). */
  origem: string
}

/** Monta a linha alinhada ao cabeçalho REAL da aba (resolve por nome de coluna). */
function buildTourosRow(lead: TourosLeadRow, header: string[]): string[] {
  const values = new Map<string, string>([
    ['data', lead.data],
    ['nome', lead.nome],
    ['whatsapp', lead.whatsapp],
    ['email', lead.email],
    ['uf', lead.uf],
    ['zona', zonaDaUF(lead.uf)],
    ['cidade', lead.cidade],
    ['momento', lead.momento],
    ['cabecas', lead.cabecas],
    ['inscricaoestadual', lead.inscricaoEstadual],
    ['interesse', lead.interesse],
    // "Qtd. desejada" é o nome atual; "Qtd. de touros" era o da aba antiga.
    ['qtddesejada', lead.qtdTouros],
    ['qtddetouros', lead.qtdTouros],
    ['leadid', lead.leadId],
    ['origem', lead.origem],
    ['utmsource', lead.utmSource],
    ['utmcampaign', lead.utmCampaign],
    ['utmcontent', lead.utmContent],
    ['adid', lead.adId],
  ])
  return header.map(h => values.get(normalizeHeaderText(h)) ?? '')
}

/** Lead da landing → shape das abas de trabalho. */
function tourosRowFromLead(lead: SheetLead): TourosLeadRow {
  return {
    data: fmtDate(lead.createdAt ?? new Date()),
    nome: nomeLegivel(lead.nome),
    whatsapp: lead.whatsapp,
    email: lead.email,
    uf: String(lead.uf ?? '').trim().toUpperCase(),
    cidade: lead.cidade ?? '',
    momento: lead.momento ?? '',
    cabecas: lead.cabecas ?? '',
    inscricaoEstadual: lead.inscricaoEstadual ?? '',
    qtdTouros: lead.oQueBusca ?? '',
    leadId: lead.leadId ?? '',
    interesse: rotulaInteresse(lead.interesse ?? 'touros-po'),
    origem: rotulaOrigemLanding(lead.formName ?? TOUROS_FORM_NAME),
    utmSource: lead.utm_source ?? '',
    utmCampaign: lead.utm_campaign ?? '',
    utmContent: lead.utm_content ?? '',
    adId: lead.ad_id ?? '',
  }
}

/**
 * Leads de teste não vão para as abas de trabalho — a equipe não deve ligar
 * para "teste". Pega tanto a flag do Meta quanto os nomes que a gente mesmo
 * usa nos testes do formulário.
 */
function isTourosTestLead(nome: string, flagTeste: string): boolean {
  if (String(flagTeste ?? '').trim().toLowerCase() === 'sim') return true
  const bruto = nomeLegivel(nome)
  if (!bruto) return true
  const n = normalizeHeaderText(bruto)
  // Nome que só tem símbolo/pontuação (".", "@bigode_jm") é lead de verdade
  // com nome mal preenchido — não é teste, e não pode sumir da aba da equipe.
  if (!n) return false
  return n.startsWith('teste') || n.startsWith('test') || n.includes('testeclaude')
}

/**
 * Deixa a aba usável desde o primeiro dia: cabeçalho congelado e em negrito +
 * filtro já ligado (a aba existe justamente para a equipe filtrar/ordenar).
 * Só roda na CRIAÇÃO — depois disso a formatação é da equipe.
 */
export async function formatTourosTab(
  sheets: SheetsClient, spreadsheetId: string, tab: string,
): Promise<void> {
  const sheetId = await getTabSheetId(sheets, spreadsheetId, tab)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
              },
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        // Sem endRowIndex: o filtro passa a valer também para as linhas novas.
        { setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0 } } } },
      ],
    },
  })
}

/**
 * Colunas sem as quais a linha 1 NÃO é cabeçalho de coisa nenhuma.
 *
 * O conector do Meta despeja o lead cru a partir da coluna A e, quando cai em
 * cima da linha 1, o que sobra ali é um lead — não um cabeçalho. Sem esta
 * checagem o ensureTourosLayout adotava a linha do lead como cabeçalho e
 * ACRESCENTAVA as colunas canônicas depois dela: em 13/08 a TOUROS ficou com
 * 66 colunas (as 21 de verdade repetidas em AS..BM), o dedup passou a ler
 * colunas vazias, não reconheceu NENHUM lead como já presente e o cron
 * reacrescentou a aba inteira — 431 linhas duplicadas empurrando o cabeçalho
 * real para a linha 433.
 */
const COLUNAS_DE_CABECALHO = ['Nome', 'WhatsApp'] as const

function pareceCabecalho(row: string[]): boolean {
  const nomes = new Set(row.map(c => normalizeHeaderText(String(c ?? ''))))
  return COLUNAS_DE_CABECALHO.every(c => nomes.has(normalizeHeaderText(c)))
}

/**
 * A aba está com a linha 1 fora do lugar. Falha ALTO de propósito: quem chama
 * (landing e cron) já trata o erro sem derrubar o lead — a LEADS GERAIS é
 * quem registra —, e o absorveDumpsCrusDoMeta conserta a linha 1 na passada
 * seguinte. Escrever mesmo assim é que não: foi o que corrompeu a TOUROS.
 */
class AbaDesalinhada extends Error {
  constructor(tab: string, detalhe: string) {
    super(`Aba "${tab}" desalinhada: ${detalhe}. Nada foi escrito.`)
    this.name = 'AbaDesalinhada'
  }
}

/** Cabeçalho canônico da aba, para reescrever a linha 1 quando ela for perdida. */
function cabecalhoCanonico(tab: string): string[] {
  return tab === LEADS_GERAIS_TAB || tab === LEADS_GERAIS_TAB_LEGADO
    ? [...PERPETUO_HEADER]
    : [...TOUROS_HEADER]
}

/**
 * Garante a aba + todas as colunas de TOUROS_HEADER. Cria a aba se faltar e
 * ACRESCENTA no fim as colunas ausentes — nunca sobrescreve/reordena o que já
 * existe (a equipe pode ter criado colunas próprias).
 */
async function ensureTourosLayout(
  sheets: SheetsClient, spreadsheetId: string, tab: string, existingTitles: (string | null | undefined)[],
): Promise<string[]> {
  if (!existingTitles.includes(tab)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1:${columnName(TOUROS_HEADER.length)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [[...TOUROS_HEADER]] },
    })
    await formatTourosTab(sheets, spreadsheetId, tab)
  }
  const headerRow = await readHeaderRow(sheets, spreadsheetId, tab)
  if (headerRow.some(Boolean) && !pareceCabecalho(headerRow)) {
    throw new AbaDesalinhada(tab, `a linha 1 não tem ${COLUNAS_DE_CABECALHO.join('/')} — parece um despejo cru do Meta`)
  }
  const next = headerRow.some(Boolean) ? [...headerRow] : [...TOUROS_HEADER]
  for (const header of TOUROS_HEADER) {
    if (next.some(h => normalizeHeaderText(String(h ?? '')) === normalizeHeaderText(header))) continue
    next.push(header)
  }
  if (next.join(' ') !== headerRow.join(' ')) {
    await updateHeaderRow(sheets, spreadsheetId, next, tab)
  }
  return next
}

/** Lead IDs já presentes na aba (idempotência do append). */
/**
 * Identidade do lead para dedup entre abas. O Lead ID é a chave boa; leads
 * antigos (importados das listas soltas na consolidação de 31/07) não têm ID,
 * então o núcleo do telefone entra como reserva — sem isso o cron
 * reacrescentaria esses leads a cada passada.
 */
function chaveDoLead(leadId: string, whatsapp: string, nome: string): string {
  const id = String(leadId ?? '').trim()
  if (id) return `id:${id}`
  const tel = phoneNucleo(whatsapp)
  if (tel) return `tel:${tel}`
  return `nome:${normalizeHeaderText(nome)}`
}

/** Chaves dos leads já presentes na aba (idempotência do append). */
async function tourosSeenKeys(
  sheets: SheetsClient, spreadsheetId: string, tab: string, header: string[],
): Promise<Set<string>> {
  const norm = header.map(normalizeHeaderText)
  const idCol = norm.indexOf('leadid')
  const telCol = norm.indexOf('whatsapp')
  const nomeCol = norm.indexOf('nome')
  const rows = ((await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A2:${columnName(header.length)}`,
  })).data.values ?? []) as string[][]
  const seen = new Set<string>()
  // Quantas linhas TÊM conteúdo, independentemente de o cabeçalho achá-lo:
  // é o contraste entre as duas contagens que denuncia desalinhamento.
  let comConteudo = 0
  for (const r of rows) {
    if (r.some(c => String(c ?? '').trim())) comConteudo++
    const id = idCol >= 0 ? String(r[idCol] ?? '').trim() : ''
    const tel = telCol >= 0 ? String(r[telCol] ?? '').trim() : ''
    const nome = nomeCol >= 0 ? String(r[nomeCol] ?? '').trim() : ''
    if (!id && !tel && !nome) continue
    // Grava as DUAS chaves quando dá: o mesmo lead pode ter entrado sem ID em
    // uma passada e com ID em outra.
    if (id) seen.add(`id:${id}`)
    if (phoneNucleo(tel)) seen.add(`tel:${phoneNucleo(tel)}`)
    else if (!id && nome) seen.add(`nome:${normalizeHeaderText(nome)}`)
  }
  // Aba cheia e nenhuma chave lida = o cabeçalho aponta para colunas que não
  // são as dos dados. Seguir daqui significa considerar TODO lead como novo e
  // reacrescentar a aba inteira — exatamente o que duplicou 431 linhas na
  // TOUROS em 13/08. Melhor não gravar nada e deixar o erro aparecer.
  if (comConteudo && !seen.size) {
    throw new AbaDesalinhada(tab, `${comConteudo} linha(s) com dado e nenhuma reconhecida pelo cabeçalho`)
  }
  return seen
}

/**
 * Célula de valor. Vazio vira célula REALMENTE vazia (sem userEnteredValue) —
 * gravar string vazia deixaria a coluna "Etapa" (dropdown da equipe) com um
 * valor em branco em vez do chip vazio.
 */
function cellValue(v: string): { userEnteredValue?: { stringValue: string } } {
  const s = String(v ?? '')
  return s ? { userEnteredValue: { stringValue: s } } : {}
}

async function appendTourosRows(
  sheets: SheetsClient, spreadsheetId: string, tab: string, rows: string[][],
): Promise<void> {
  if (!rows.length) return
  const sheetId = await getTabSheetId(sheets, spreadsheetId, tab)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        appendCells: {
          sheetId,
          rows: rows.map(r => ({ values: r.map(cellValue) })),
          fields: 'userEnteredValue',
        },
      }],
    },
  })
}

/**
 * Insere as linhas LOGO ABAIXO DO CABEÇALHO (linha 2) — é assim que as abas
 * em ordem decrescente recebem lead novo: o mais recente sempre em cima.
 * `rows` deve vir do mais novo para o mais antigo.
 *
 * Insere de verdade (insertDimension), não sobrescreve: as linhas existentes
 * descem inteiras, com cor/nota/colunas da equipe. Depois:
 *  · zera o fundo das linhas novas — sem isso elas herdariam a cor da linha
 *    que estava no topo, e nessas abas cor = status marcado pela equipe;
 *  · copia a VALIDAÇÃO da linha de baixo (a que era a primeira) para as novas,
 *    para o dropdown da coluna "Etapa" continuar valendo na linha nova. Copiar
 *    é de propósito: as cores dos chips não são expostas pela API, mas viajam
 *    numa cópia server-side.
 */
async function insertTourosRowsAtTop(
  sheets: SheetsClient, spreadsheetId: string, tab: string, rows: string[][],
): Promise<void> {
  if (!rows.length) return
  const sheetId = await getTabSheetId(sheets, spreadsheetId, tab)
  const largura = Math.max(...rows.map(r => r.length))
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          insertDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 1 + rows.length },
            inheritFromBefore: false,
          },
        },
        {
          updateCells: {
            start: { sheetId, rowIndex: 1, columnIndex: 0 },
            rows: rows.map(r => ({ values: r.map(cellValue) })),
            fields: 'userEnteredValue',
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 1 + rows.length },
            cell: { userEnteredFormat: { backgroundColorStyle: { themeColor: 'BACKGROUND' } } },
            fields: 'userEnteredFormat.backgroundColorStyle',
          },
        },
        {
          copyPaste: {
            source: {
              sheetId,
              startRowIndex: 1 + rows.length, endRowIndex: 2 + rows.length,
              startColumnIndex: 0, endColumnIndex: largura,
            },
            destination: {
              sheetId,
              startRowIndex: 1, endRowIndex: 1 + rows.length,
              startColumnIndex: 0, endColumnIndex: largura,
            },
            pasteType: 'PASTE_DATA_VALIDATION',
          },
        },
      ],
    },
  })
}

/**
 * Grava as linhas na aba respeitando a ordem dela: as abas de TABS_DESC
 * recebem no topo (mais recente primeiro), as demais no fim (append-only).
 * `rows` sempre chega do mais antigo para o mais novo.
 */
async function writeTourosRows(
  sheets: SheetsClient, spreadsheetId: string, tab: string, rows: string[][],
): Promise<void> {
  if (!rows.length) return
  if (TABS_DESC.has(tab)) {
    await insertTourosRowsAtTop(sheets, spreadsheetId, tab, [...rows].reverse())
    return
  }
  await appendTourosRows(sheets, spreadsheetId, tab, rows)
}

/**
 * Caminho rápido: depois de o lead entrar na LEADS GERAIS, copia-o para a
 * aba-recorte do interesse dele (TOUROS/FEMEAS/EMBRIÕES/OUTROS). Best-effort —
 * quem garante o registro é o append na LEADS GERAIS; se isto falhar, o
 * syncAbasPorInteresse() (cron) recupera na próxima passada.
 */
export async function appendLeadToInteresseTab(
  lead: SheetLead,
): Promise<{ skipped: boolean; reason?: string; tabs?: string[] }> {
  return comRetryDeEscrita('aba por interesse', () => gravaNaAbaDoInteresse(lead))
}

async function gravaNaAbaDoInteresse(
  lead: SheetLead,
): Promise<{ skipped: boolean; reason?: string; tabs?: string[] }> {
  const info = await getStoredInfo()
  if (!info) return { skipped: true, reason: 'not_provisioned' }
  const auth = getAuth()
  if (!auth) return { skipped: true, reason: 'no_credentials' }

  const row = tourosRowFromLead(lead)
  if (isTourosTestLead(row.nome, 'Não')) return { skipped: true, reason: 'test_lead' }

  const sheets = google.sheets({ version: 'v4', auth })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: info.spreadsheetId, includeGridData: false })
  const titles = (meta.data.sheets ?? []).map(s => s.properties?.title)

  const tab = ABAS_INTERESSE[abaDoInteresse(row.interesse)]
  const header = await ensureTourosLayout(sheets, info.spreadsheetId, tab, titles)
  const seen = await tourosSeenKeys(sheets, info.spreadsheetId, tab, header)
  if (seen.has(chaveDoLead(row.leadId, row.whatsapp, row.nome))) {
    return { skipped: true, reason: 'duplicate' }
  }
  await writeTourosRows(sheets, info.spreadsheetId, tab, [buildTourosRow(row, header)])
  return { skipped: false, tabs: [tab] }
}


// ─────────────────────────────────────────────────────────────────────────────
// Lançamento "Leilão Touros São Geraldo e 7P".
//
// Desde 29/07 o lead do lançamento segue o MESMO caminho da campanha de touros;
// desde 31/07 não há mais aba própria por campanha — todo lead vive na LEADS
// GERAIS e aparece na aba do INTERESSE dele. Quem quiser separar perpétuo ×
// leilão filtra a coluna "Origem" (ou o form_name), que continua marcando de
// qual landing o lead veio.
// ─────────────────────────────────────────────────────────────────────────────

/** Marca as linhas do lançamento na aba-arquivo (form_name). Ver SheetLead.formName. */
export const SAO_GERALDO_FORM_NAME = 'Landing Leilão Touros São Geraldo e 7P'

/** Colunas que são da equipe — o código só as MOVE entre as abas, nunca inventa. */
const COLUNAS_DA_EQUIPE = ['Etapa', 'Atendido por', 'Observações'] as const

/**
 * Espelha "Etapa"/"Atendido por"/"Observações" entre a base e a aba-recorte do
 * lead. Sem isto a LEADS GERAIS fica eternamente desatualizada: a equipe
 * trabalha na aba do interesse (em 31/07 eram 399 etapas preenchidas na TOUROS
 * contra 106 na base) e o dono lê a base.
 *
 * Regra: a aba-recorte é a fonte (é a superfície de trabalho). Quando ela está
 * vazia e a base tem valor, o valor volta pra ela — foi assim que as anotações
 * antigas, consolidadas na base, chegaram às abas novas.
 */
async function espelhaColunasDaEquipe(
  sheets: SheetsClient, spreadsheetId: string, base: string,
): Promise<{ paraBase: number; paraAba: number }> {
  const ler = async (tab: string) => ((await sheets.spreadsheets.values.get({
    spreadsheetId, range: `${tab}!A1:${columnName(HEADER_READ_COLUMNS)}`,
  })).data.values ?? []) as string[][]

  const baseVals = await ler(base)
  if (baseVals.length < 2) return { paraBase: 0, paraAba: 0 }
  const baseHeader = (baseVals[0] ?? []).map(h => normalizeHeaderText(String(h ?? '')))
  const idxDe = (header: string[], nome: string) => header.indexOf(normalizeHeaderText(nome))
  const bTel = idxDe(baseHeader, 'WhatsApp'), bId = idxDe(baseHeader, 'Lead ID'), bNome = idxDe(baseHeader, 'Nome')
  if (bTel < 0) return { paraBase: 0, paraAba: 0 }
  const chave = (r: string[], iId: number, iTel: number, iNome: number) =>
    chaveDoLead(String(r[iId] ?? ''), String(r[iTel] ?? ''), String(r[iNome] ?? ''))

  const baseLinhas = baseVals.slice(1)
  const porChave = new Map<string, number>()
  baseLinhas.forEach((r, i) => {
    const k = chave(r, bId, bTel, bNome)
    if (!porChave.has(k)) porChave.set(k, i)
  })

  const baseCols = COLUNAS_DA_EQUIPE.map(c => idxDe(baseHeader, c))
  const baseNovo = COLUNAS_DA_EQUIPE.map((_, ci) => baseLinhas.map(r => String(r[baseCols[ci]] ?? '')))
  let paraBase = 0, paraAba = 0
  const escritas: { range: string; values: string[][] }[] = []

  for (const tab of Object.values(ABAS_INTERESSE)) {
    const vals = await ler(tab)
    if (vals.length < 2) continue
    const header = (vals[0] ?? []).map(h => normalizeHeaderText(String(h ?? '')))
    const iTel = idxDe(header, 'WhatsApp'), iId = idxDe(header, 'Lead ID'), iNome = idxDe(header, 'Nome')
    if (iTel < 0) continue
    const cols = COLUNAS_DA_EQUIPE.map(c => idxDe(header, c))
    const linhas = vals.slice(1)
    const abaNovo = COLUNAS_DA_EQUIPE.map((_, ci) => linhas.map(r => String(r[cols[ci]] ?? '')))
    let mudouAba = false

    linhas.forEach((r, i) => {
      const b = porChave.get(chave(r, iId, iTel, iNome))
      if (b == null) return
      COLUNAS_DA_EQUIPE.forEach((_, ci) => {
        if (cols[ci] < 0 || baseCols[ci] < 0) return
        const naAba = String(r[cols[ci]] ?? '').trim()
        const naBase = baseNovo[ci][b].trim()
        if (naAba && naAba !== naBase) { baseNovo[ci][b] = naAba; paraBase++ }
        else if (!naAba && naBase) { abaNovo[ci][i] = naBase; mudouAba = true; paraAba++ }
      })
    })

    if (mudouAba) {
      COLUNAS_DA_EQUIPE.forEach((_, ci) => {
        if (cols[ci] < 0) return
        const col = columnName(cols[ci] + 1)
        escritas.push({ range: `${tab}!${col}2:${col}${linhas.length + 1}`, values: abaNovo[ci].map(v => [v]) })
      })
    }
  }

  if (paraBase) {
    COLUNAS_DA_EQUIPE.forEach((_, ci) => {
      if (baseCols[ci] < 0) return
      const col = columnName(baseCols[ci] + 1)
      escritas.push({ range: `${base}!${col}2:${col}${baseLinhas.length + 1}`, values: baseNovo[ci].map(v => [v]) })
    })
  }
  if (escritas.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId, requestBody: { valueInputOption: 'RAW', data: escritas },
    })
  }
  return { paraBase, paraAba }
}

/**
 * Varredura das abas-recorte: relê a LEADS GERAIS e acrescenta em
 * TOUROS/FEMEAS/EMBRIÕES/OUTROS o que ainda não está lá, pelo interesse de cada
 * lead. Idempotente — serve de backfill e de rede de segurança quando o append
 * do cadastro falha.
 *
 * Chave de dedup: o Lead ID quando existe e, na falta dele (leads antigos
 * importados de listas soltas), o núcleo do telefone. Sem esse fallback o lead
 * sem ID seria reacrescentado a cada passada do cron.
 */
export async function syncAbasPorInteresse(): Promise<{
  total: number
  appended: Record<string, number>
  espelho?: { paraBase: number; paraAba: number }
  falhas?: string[]
  reason?: string
}> {
  const vazio = Object.fromEntries(Object.values(ABAS_INTERESSE).map(t => [t, 0]))
  const info = await getStoredInfo()
  if (!info) return { total: 0, appended: vazio, reason: 'not_provisioned' }
  const auth = getAuth()
  if (!auth) return { total: 0, appended: vazio, reason: 'no_credentials' }

  const sheets = google.sheets({ version: 'v4', auth })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: info.spreadsheetId, includeGridData: false })
  const titles = (meta.data.sheets ?? []).map(s => s.properties?.title)
  const base = titles.includes(LEADS_GERAIS_TAB)
    ? LEADS_GERAIS_TAB
    : titles.includes(LEADS_GERAIS_TAB_LEGADO) ? LEADS_GERAIS_TAB_LEGADO : null
  if (!base) return { total: 0, appended: vazio, reason: 'source_tab_missing' }

  const src = ((await sheets.spreadsheets.values.get({
    spreadsheetId: info.spreadsheetId,
    range: `${base}!A1:${columnName(HEADER_READ_COLUMNS)}`,
  })).data.values ?? []) as string[][]
  const srcHeader = (src[0] ?? []).map(h => normalizeHeaderText(String(h ?? '')))
  const col = (name: string) => srcHeader.indexOf(normalizeHeaderText(name))
  const at = (r: string[], i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '')
  const idx = {
    data: col('Data'), nome: col('Nome'), email: col('E-mail'), whatsapp: col('WhatsApp'),
    uf: col('UF'), cidade: col('Cidade'), momento: col('Momento'), cabecas: col('Cabeças'),
    ie: col('Inscrição Estadual'), interesse: col('Interesse'), qtd: col('Qtd. desejada'),
    leadId: col('Lead ID'), origem: col('Origem'), utmSource: col('utm_source'),
    utmCampaign: col('utm_campaign'), utmContent: col('utm_content'), adId: col('ad-id'),
    teste: col('lead de teste'),
  }
  if (idx.nome < 0) return { total: 0, appended: vazio, reason: 'header_missing' }

  const leads: TourosLeadRow[] = []
  for (const r of src.slice(1)) {
    if (!r.some(c => String(c ?? '').trim())) continue
    const nome = at(r, idx.nome)
    if (isTourosTestLead(nome, at(r, idx.teste))) continue
    leads.push({
      data: at(r, idx.data), nome, whatsapp: at(r, idx.whatsapp), email: at(r, idx.email),
      uf: at(r, idx.uf).toUpperCase(), cidade: at(r, idx.cidade), momento: at(r, idx.momento),
      cabecas: at(r, idx.cabecas), inscricaoEstadual: at(r, idx.ie),
      interesse: rotulaInteresse(at(r, idx.interesse)), qtdTouros: at(r, idx.qtd),
      leadId: at(r, idx.leadId), origem: at(r, idx.origem),
      utmSource: at(r, idx.utmSource), utmCampaign: at(r, idx.utmCampaign),
      utmContent: at(r, idx.utmContent), adId: at(r, idx.adId),
    })
  }

  const appended: Record<string, number> = { ...vazio }
  const falhas: string[] = []
  for (const [balde, tab] of Object.entries(ABAS_INTERESSE)) {
    // Cada aba por sua conta: uma desalinhada (despejo do Meta na linha 1) não
    // pode impedir que as outras três recebam os leads do dia.
    try {
      const doTab = leads.filter(l => abaDoInteresse(l.interesse) === balde)
      const header = await ensureTourosLayout(sheets, info.spreadsheetId, tab, titles)
      const seen = await tourosSeenKeys(sheets, info.spreadsheetId, tab, header)
      const fresh: string[][] = []
      for (const lead of doTab) {
        const chave = chaveDoLead(lead.leadId, lead.whatsapp, lead.nome)
        if (seen.has(chave)) continue
        seen.add(chave)
        fresh.push(buildTourosRow(lead, header))
      }
      await writeTourosRows(sheets, info.spreadsheetId, tab, fresh)
      appended[tab] = fresh.length
    } catch (e) {
      console.error(`[jmp-sheets] aba "${tab}" não sincronizou:`, e instanceof Error ? e.message : e)
      falhas.push(tab)
    }
  }

  // Depois de distribuir, espelha o que a equipe anotou nas duas pontas.
  const espelho = await espelhaColunasDaEquipe(sheets, info.spreadsheetId, base).catch(e => {
    console.error('[jmp-sheets] espelho das colunas da equipe falhou:', e instanceof Error ? e.message : e)
    return { paraBase: 0, paraAba: 0 }
  })

  const novos = Object.values(appended).reduce((a, b) => a + b, 0)
  if (novos || espelho.paraBase || espelho.paraAba || falhas.length) {
    console.log(`[jmp-sheets] abas por interesse: ${JSON.stringify(appended)} (de ${leads.length} leads) | espelho: ${espelho.paraBase}→base, ${espelho.paraAba}→abas${falhas.length ? ` | FALHARAM: ${falhas.join(', ')}` : ''}`)
  }
  return { total: leads.length, appended, espelho, falhas }
}

// ─────────────────────────────────────────────────────────────────────────────
// Funil perpétuo de FÊMEAS (landing /femeas) — Fase 2 do plano.
//
// O lead de fêmeas segue o MESMO caminho das outras landings: entra na LEADS
// GERAIS (que é o registro) e aparece na aba do INTERESSE dele. Como a landing
// manda sempre `interesse: 'femeas-po'`, rotulaInteresse() devolve "Matrizes PO"
// e abaDoInteresse() manda para a aba FEMEAS — que já existe desde a
// consolidação de 31/07. Quem separa esta landing dos leads de fêmeas que vêm
// do formulário do Meta é a coluna "Origem" (FEMEAS_FORM_NAME).
//
// O plano previa criar uma aba nova, "LEADS FEMEAS", espelhando o que a landing
// do São Geraldo fazia. NÃO é mais o certo: aquilo virou a aba FEMEAS, e criar
// uma segunda aba de fêmeas daria ao SDR duas superfícies para a mesma fila —
// com o cron syncAbasPorInteresse() alimentando só uma delas.
//
// O que a aba FEMEAS ganha aqui são as colunas da FILA DO SDR: o funil de
// fêmeas é consultivo e o KPI é reunião agendada, então cadência de 1º toque,
// aprovação, motivo da recusa e agendamento precisam de coluna. Elas existem SÓ
// nesta aba — pendurá-las no BLOCO_OPERACIONAL espalharia a fila do SDR pelas
// abas TOUROS/EMBRIÕES/OUTROS, que são de outro funil.
// ─────────────────────────────────────────────────────────────────────────────

/** Marca as linhas desta landing na LEADS GERAIS (form_name) e na coluna "Origem". */
export const FEMEAS_FORM_NAME = 'Landing Fêmeas — Funil Perpétuo'

/**
 * Colunas que existem só na aba FEMEAS, acrescentadas DEPOIS do bloco comum.
 *
 * As quatro primeiras o código escreve; as cinco últimas são da operação e
 * nascem vazias — o código nunca escreve nelas, igual a "Etapa"/"Atendido
 * por"/"Observações". Cada uma existe por um motivo medido:
 *
 *   · "1º toque em"          → cadência, tratada na reunião como o fator
 *                              decisivo. Sem a coluna, "atende rápido" não é
 *                              verificável.
 *   · "Aprovado"             → o portão REAL do funil (quem decide é gente, a
 *                              triagem é manual por decisão de 05/08). É o
 *                              numerador da taxa de aprovação.
 *   · "Motivo da recusa"     → é o que ensina o formulário. Sem ele, decidir
 *                              quais campos de atrito ficam vira achismo.
 *   · "Reunião agendada"     → numerador do KPI da página.
 *   · "Assessor da reunião"  → distribui entre os 3 assessores no agendamento.
 *
 * "Régua automática" é o veredito do SERVIDOR (is_mql) gravado ao lado do
 * veredito humano de propósito: são coisas diferentes (um escolhe o valor da
 * conversão enviado ao Meta, o outro decide se vira reunião) e a única forma de
 * saber se a mídia está sendo treinada pelo sinal certo é confrontar as duas
 * colunas depois de algumas dezenas de leads.
 */
const FEMEAS_COLUNAS_PROPRIAS = [
  'CPF/CNPJ', 'Categoria de interesse', 'Projeto', 'Régua automática',
  '1º toque em', 'Aprovado', 'Motivo da recusa', 'Reunião agendada', 'Assessor da reunião',
] as const

/** Lead da landing de fêmeas: o mesmo shape das outras + os campos de atrito. */
export interface FemeasSheetLead extends SheetLead {
  /** CPF ou CNPJ, já mascarado. Habilita a compra em leilão. */
  cpf?: string | null
  /** Rótulo legível da categoria escolhida ("Novilhas", "Doadoras", ...). */
  categoria?: string | null
  /** Texto livre do projeto — é o campo que mais pesa na triagem do SDR. */
  projeto?: string | null
  /** Veredito da régua do servidor (is_mql). */
  reguaAutomatica?: boolean
}

/**
 * Garante a aba FEMEAS com o bloco comum MAIS as colunas da fila do SDR.
 * Reusa ensureTourosLayout para a parte comum (é ele que cria a aba, formata e
 * acrescenta coluna faltante) e só acrescenta o resto — assim o cron continua
 * dono do bloco comum e ninguém precisa editar função em produção.
 */
async function ensureFemeasLayout(
  sheets: SheetsClient, spreadsheetId: string, tab: string, existingTitles: (string | null | undefined)[],
): Promise<string[]> {
  const header = await ensureTourosLayout(sheets, spreadsheetId, tab, existingTitles)
  const next = [...header]
  for (const coluna of FEMEAS_COLUNAS_PROPRIAS) {
    if (next.some(h => normalizeHeaderText(String(h ?? '')) === normalizeHeaderText(coluna))) continue
    next.push(coluna)
  }
  if (next.length !== header.length) {
    await updateHeaderRow(sheets, spreadsheetId, next, tab)
  }
  return next
}

/** Linha da aba FEMEAS: o bloco comum + os campos que só esta landing coleta. */
function buildFemeasRow(lead: FemeasSheetLead, row: TourosLeadRow, header: string[]): string[] {
  const base = buildTourosRow(row, header)
  const proprios = new Map<string, string>([
    ['cpfcnpj', lead.cpf ?? ''],
    ['categoriadeinteresse', lead.categoria ?? ''],
    ['projeto', lead.projeto ?? ''],
    ['reguaautomatica', lead.reguaAutomatica == null ? '' : lead.reguaAutomatica ? 'Sim' : 'Não'],
  ])
  // As colunas da operação não estão no mapa: caem no '' do bloco comum e a
  // célula nasce REALMENTE vazia (ver cellValue).
  return header.map((h, i) => proprios.get(normalizeHeaderText(String(h ?? ''))) ?? base[i] ?? '')
}

/**
 * Caminho rápido do cadastro da landing de fêmeas: copia o lead para a aba
 * FEMEAS, que é a fila de trabalho do SDR. Best-effort de propósito — quem
 * garante o registro é o append na LEADS GERAIS (bloqueante na rota); se isto
 * falhar, o syncAbasPorInteresse() recupera na próxima passada do cron, só sem
 * as colunas próprias (o cron lê da base, que não as tem).
 *
 * Idempotente pela mesma chave das outras abas (Lead ID, telefone como reserva).
 */
export async function appendLeadToFemeasTab(
  lead: FemeasSheetLead,
): Promise<{ skipped: boolean; reason?: string; tab?: string }> {
  return comRetryDeEscrita('aba FEMEAS', () => gravaNaAbaFemeas(lead))
}

async function gravaNaAbaFemeas(
  lead: FemeasSheetLead,
): Promise<{ skipped: boolean; reason?: string; tab?: string }> {
  const info = await getStoredInfo()
  if (!info) return { skipped: true, reason: 'not_provisioned' }
  const auth = getAuth()
  if (!auth) return { skipped: true, reason: 'no_credentials' }

  const row = tourosRowFromLead(lead)
  if (isTourosTestLead(row.nome, 'Não')) return { skipped: true, reason: 'test_lead' }

  const sheets = google.sheets({ version: 'v4', auth })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: info.spreadsheetId, includeGridData: false })
  const titles = (meta.data.sheets ?? []).map(s => s.properties?.title)

  // A aba é fixa: esta função é só desta landing, e o interesse dela é sempre
  // fêmeas. Se um dia o interesse mudar de vocabulário, o lead continua caindo
  // na fila certa em vez de sumir numa aba que o SDR não abre.
  const tab = ABAS_INTERESSE.femeas
  const header = await ensureFemeasLayout(sheets, info.spreadsheetId, tab, titles)
  const seen = await tourosSeenKeys(sheets, info.spreadsheetId, tab, header)
  if (seen.has(chaveDoLead(row.leadId, row.whatsapp, row.nome))) {
    return { skipped: true, reason: 'duplicate' }
  }
  await writeTourosRows(sheets, info.spreadsheetId, tab, [buildFemeasRow(lead, row, header)])
  return { skipped: false, tab }
}

/**
 * Leitura CRUA de abas inteiras — cabeçalho + linhas, exatamente como estão.
 *
 * Existe para o painel de growth, que precisa de TODAS as colunas (inclusive as
 * que a equipe criou à mão: "Etapa", "Atendido por", e as colunas do conector
 * do Meta) e das abas de trabalho, não só da base. Difere de readLeadRows() em
 * dois pontos que importam: não mapeia para o layout canônico — devolve o que
 * está lá — e NÃO escreve nada na planilha (readLeadRows chama
 * normalizeMetaRawRows, que reescreve linhas cruas do conector).
 *
 * Aba que não existe volta vazia em vez de estourar.
 */
export async function readTabsRaw(
  tabs: string[],
): Promise<Record<string, { head: string[]; rows: string[][] }>> {
  const out: Record<string, { head: string[]; rows: string[][] }> = {}
  const info = await getStoredInfo()
  const auth = getAuth()
  if (!info || !auth) return out

  const sheets = google.sheets({ version: 'v4', auth })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: info.spreadsheetId, includeGridData: false })
  const existentes = new Set((meta.data.sheets ?? []).map(s => s.properties?.title).filter(Boolean) as string[])

  // Uma chamada só para todas as abas: batchGet evita N round-trips e mantém a
  // leitura consistente entre elas (a planilha é editada o tempo todo).
  const alvos = tabs.filter(t => existentes.has(t))
  if (!alvos.length) return out
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: info.spreadsheetId,
    ranges: alvos.map(t => `'${t}'`),
  })
  const faixas = res.data.valueRanges ?? []
  alvos.forEach((tab, i) => {
    const v = (faixas[i]?.values ?? []) as string[][]
    out[tab] = {
      head: v[0] ?? [],
      rows: v.slice(1).filter(r => r.some(c => String(c ?? '').trim() !== '')),
    }
  })
  return out
}
