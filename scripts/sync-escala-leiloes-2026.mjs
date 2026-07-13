import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { unzipSync, strFromU8 } from 'fflate'
import XLSX from 'xlsx'

const dry = process.argv.includes('--dry')
const keepExtras = process.argv.includes('--keep-extras')
const skipImages = process.argv.includes('--skip-images')
const monthsArg = process.argv.find((arg) => arg.startsWith('--months='))
const syncMonths = new Set(
  (monthsArg?.slice('--months='.length) ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^20\d{2}-(0[1-9]|1[0-2])$/.test(value)),
)
if (monthsArg && syncMonths.size === 0) {
  console.error('Filtro --months invalido. Use, por exemplo, --months=2026-07,2026-08.')
  process.exit(1)
}
const explicitFile = process.argv.find((arg) => arg.endsWith('.xlsx'))
const sourceFile = explicitFile ?? readdirSync('.').find((f) => f.startsWith('ESCALA') && f.endsWith('.xlsx'))

if (!sourceFile) {
  console.error('Planilha ESCALA*.xlsx nao encontrada no diretorio do projeto.')
  process.exit(1)
}

const localEnvFile = join('.', '.env.local')
const localEnv = existsSync(localEnvFile) ? Object.fromEntries(
  readFileSync(localEnvFile, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
) : {}
const env = { ...localEnv, ...process.env }

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Variaveis NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente ou em .env.local')
  process.exit(1)
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const strip = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()

const compact = (value) => strip(value).replace(/\s+/g, '')
const pad = (n) => String(n).padStart(2, '0')

function sheetYear(sheetName) {
  return sheetName.match(/20\d{2}/)?.[0] ?? '2026'
}

function parseSheetDate(value, year) {
  const s = String(value ?? '').trim()
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/)
  if (!m) return null
  const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : year
  return `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`
}

function parseHour(value) {
  let s = String(value ?? '').trim()
  if (!s) return ''
  s = s.replace(/[hH]/g, ':').replace(/\s+/g, '')
  if (/^\d{1,2}$/.test(s)) return `${pad(Number(s))}:00`
  const m = s.match(/^(\d{1,2}):(\d{1,2})/)
  if (m) return `${pad(Number(m[1]))}:${pad(Number(m[2]))}`
  return s
}

function clean(value) {
  return String(value ?? '').trim()
}

function isMeaningfulSheetValue(value) {
  const normalized = clean(value)
  return Boolean(normalized) && !/^\?+$/.test(normalized) && normalized !== '-'
}

function sheetOrExisting(value, existing, fallback = '') {
  if (isMeaningfulSheetValue(value)) return clean(value)
  if (existing != null && clean(existing)) return existing
  return fallback
}

function parseMoney(value) {
  if (!isMeaningfulSheetValue(value)) return null
  let normalized = clean(value).replace(/R\$\s?/gi, '').replace(/\s/g, '')
  if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(normalized)) normalized = normalized.replace(/\./g, '')
  else normalized = normalized.replace(/[^\d.-]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function slug(value) {
  return strip(value).toLowerCase().replace(/\s+/g, '-').replace(/^-+|-+$/g, '') || 'leilao'
}

// Colunas de checklist que o chefe mantem na planilha (formato novo, ex.: JUNHO).
// Chave = cabecalho normalizado (strip); label = como aparece no checklist do sistema.
const CHECKLIST_COLUMNS = [
  ['CATALOGO', 'Catálogo'],
  ['VIDEOS CURRAL', 'Vídeos de curral'],
  ['LOGO PNG', 'Logo (PNG)'],
  ['AVALIACAO', 'Avaliação'],
  ['DIVULGACAO CLIENTES PERFIL', 'Divulgação: clientes perfil'],
  ['DIVULGACAO GRUPO', 'Divulgação: grupo'],
  ['DIVULGACAO INSTAGRAM', 'Divulgação: Instagram'],
  ['LEILAO REALIZADO', 'Leilão realizado'],
  ['FECHAMENTO REALIZADO', 'Fechamento realizado'],
  ['CONTAS A RECEBER E A PAGAR', 'Contas a receber e a pagar'],
]
const CHECKLIST_GROUP = 'Produção & Divulgação'
// Abas sem o bloco de checklist (ex.: julho em diante) recebem o mesmo
// checklist em branco, para a equipe preencher pelo sistema. Não semeia meses
// já passados/concluidos.
const SEED_CHECKLIST_FROM = '2026-07-01'

function truthy(value) {
  return /^(TRUE|VERDADEIRO|SIM|X|✓|OK)$/i.test(String(value ?? '').trim())
}

function checklistIndexes(headerRow) {
  const header = headerRow.map(strip)
  const cols = []
  for (const [key, label] of CHECKLIST_COLUMNS) {
    const idx = header.indexOf(key)
    if (idx >= 0) cols.push({ idx, label, key })
  }
  return cols
}

// Constroi o grupo de checklist a partir das colunas TRUE/FALSE da linha.
function checklistFromRow(row, checklistCols) {
  // So consideramos "checklist da planilha" quando a aba usa o bloco completo
  // (varias colunas de divulgacao/producao, ex.: JUNHO). Uma coluna solta de
  // CATALOGO nas abas antigas nao e checklist.
  if (checklistCols.length < 3) return null
  const tasks = checklistCols.map(({ idx, label, key }) => ({
    id: `plan-${slug(key)}`,
    nome: label,
    ini: '',
    fim: '',
    resp: { ini: '', nome: '' },
    subs: [],
    done: truthy(row[idx]),
    observacao: '',
    anexos: [],
  }))
  return { nome: CHECKLIST_GROUP, cor: '#111827', subtitulo: 'Sincronizado da planilha', origem: 'planilha', tasks }
}

// Checklist padrao (mesmos itens de junho) todo desmarcado, para abas que nao
// trazem o bloco na planilha.
function blankChecklistGroup() {
  const tasks = CHECKLIST_COLUMNS.map(([key, label]) => ({
    id: `plan-${slug(key)}`,
    nome: label,
    ini: '',
    fim: '',
    resp: { ini: '', nome: '' },
    subs: [],
    done: false,
    observacao: '',
    anexos: [],
  }))
  return { nome: CHECKLIST_GROUP, cor: '#111827', subtitulo: 'Checklist padrão', origem: 'seed', tasks }
}

// Regras de checklist no bula_leiloes.tasks:
// - aba com bloco de checklist (junho): a planilha é a fonte, sobrescreve o grupo;
// - aba sem bloco, leilão de julho em diante: semeia o checklist em branco UMA vez
//   (só se ainda não existir), preservando o que a equipe marcar depois;
// - sempre preserva grupos criados manualmente (outros nomes).
function mergeChecklist(existing, row) {
  const base = Array.isArray(existing) ? existing : []
  if (row.checklist) {
    const kept = base.filter((g) => g && g.nome !== CHECKLIST_GROUP)
    return [...kept, row.checklist]
  }
  if (row.data >= SEED_CHECKLIST_FROM && !base.some((g) => g && g.nome === CHECKLIST_GROUP)) {
    return [...base, blankChecklistGroup()]
  }
  return base
}

function headerIndexes(headerRow) {
  const header = headerRow.map(strip)
  const aliases = {
    data: ['MES', 'DIA'],
    dia_semana: ['DIA DA SEMANA'],
    hora: ['HORA'],
    nome: ['LEILAO'],
    criador: ['CRIADOR'],
    presencial: ['PRESENCIAL'],
    leiloeira: ['LEILOEIRA'],
    raca: ['RACA'],
    qtd_animais: ['QTD ANIMAIS'],
    sexo: ['SEXO'],
    condicao: ['CONDICAO'],
    frete_gratis: ['FRETE GRATIS'],
    comissao: ['NEGOCIACAO DE COMISSAO', 'COMISSAO', 'ACORDO'],
    contrato: ['CONTRATO'],
    faturamento_previsto: ['FATURAMENTO PREVISTO'],
    faturamento_realizado: ['FATURAMENTO REALIZADO'],
    venda_bula: ['VENDA BULA ASSESSORIA'],
    comissao_receber: ['COMISSAO A RECEBER'],
    comissao_prevista: ['COMISSAO PREVISTA'],
    recebido: ['RECEBIDO'],
    catalogo_url: ['CATALOGO'],
    fechamento: ['FECHAMENTO'],
    fechamento_link: ['LINK'],
  }
  const indexes = Object.fromEntries(
    Object.entries(aliases)
      .map(([key, names]) => [key, header.findIndex((h) => names.includes(h))])
      .filter(([, idx]) => idx >= 0),
  )
  // A planilha exportada pelo Google preserva a coluna de horário, mas em
  // algumas abas o cabeçalho da coluna C vem vazio. O layout público da escala
  // usa coluna C para horário nesses casos.
  if (indexes.hora == null && header[2] === '') indexes.hora = 2
  return indexes
}

function parseWorkbook(file) {
  const wb = XLSX.readFile(file, { raw: false, cellDates: true })
  const rows = []

  for (let sheetIndex = 0; sheetIndex < wb.SheetNames.length; sheetIndex += 1) {
    const sheetName = wb.SheetNames[sheetIndex]
    const sheet = wb.Sheets[sheetName]
    // blankrows: true garante que o indice do array == linha absoluta (0-based)
    // da planilha, necessario para casar as imagens (ancoradas por linha).
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: true })
    const idx = headerIndexes(data[1] ?? [])
    const checklistCols = checklistIndexes(data[1] ?? [])
    const year = sheetYear(sheetName)

    for (let i = 2; i < data.length; i += 1) {
      const row = data[i]
      const nome = clean(row[idx.nome])
      const dataIso = parseSheetDate(row[idx.data], year)
      if (!nome || !dataIso) continue

      rows.push({
        data: dataIso,
        dia_semana: clean(row[idx.dia_semana]),
        hora: parseHour(row[idx.hora]),
        nome,
        criador: clean(row[idx.criador]),
        presencial: clean(row[idx.presencial]),
        leiloeira: clean(row[idx.leiloeira]),
        raca: clean(row[idx.raca]),
        qtd_animais: clean(row[idx.qtd_animais]),
        sexo: clean(row[idx.sexo]),
        condicao: clean(row[idx.condicao]),
        frete_gratis: clean(row[idx.frete_gratis]),
        comissao: clean(row[idx.comissao]),
        contrato: clean(row[idx.contrato]),
        faturamento_previsto: clean(row[idx.faturamento_previsto]),
        faturamento_realizado: clean(row[idx.faturamento_realizado]),
        venda_bula: clean(row[idx.venda_bula]),
        comissao_receber: clean(row[idx.comissao_receber]),
        comissao_prevista: clean(row[idx.comissao_prevista]),
        recebido: clean(row[idx.recebido]),
        catalogo_url: clean(row[idx.catalogo_url]),
        checklist: checklistFromRow(row, checklistCols),
        sheet_name: sheetName,
        sheet_index: sheetIndex,
        abs_row: i,
        image_url: null,
        sheet_row: i + 1,
      })
    }
  }

  rows.sort((a, b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora) || a.nome.localeCompare(b.nome))
  return rows
}

function rowKey(row) {
  return `${row.data}|${compact(row.hora)}|${compact(row.nome)}|${compact(row.criador)}`
}

// ---------------------------------------------------------------------------
// Extracao das capas embutidas no .xlsx (imagens ancoradas por linha).
// O Google exporta cada capa como um drawing ancorado na linha do leilao.
// ---------------------------------------------------------------------------
function buildSheetFileMap(zip) {
  const wbXml = strFromU8(zip['xl/workbook.xml'])
  const relsXml = strFromU8(zip['xl/_rels/workbook.xml.rels'])
  const relTarget = {}
  for (const m of relsXml.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) relTarget[m[1]] = m[2]
  const map = {} // sheetName -> "xl/worksheets/sheetN.xml"
  for (const m of wbXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g)) {
    const target = relTarget[m[2]]
    if (target) map[m[1]] = target.startsWith('xl/') ? target : `xl/${target.replace(/^\.\.\//, '')}`
  }
  return map
}

function sheetImageAnchors(zip, wsFile) {
  const wsRelsPath = wsFile.replace(/xl\/worksheets\/(.+)$/, 'xl/worksheets/_rels/$1.rels')
  if (!zip[wsRelsPath]) return []
  const drawTarget = strFromU8(zip[wsRelsPath]).match(/Target="([^"]*drawing\d+\.xml)"/)?.[1]
  if (!drawTarget) return []
  const drawFile = `xl/drawings/${basename(drawTarget)}`
  if (!zip[drawFile]) return []
  const drawNo = basename(drawTarget).match(/drawing(\d+)\.xml/)?.[1]
  const drawRelsPath = `xl/drawings/_rels/drawing${drawNo}.xml.rels`
  const relMap = {}
  if (zip[drawRelsPath]) {
    for (const m of strFromU8(zip[drawRelsPath]).matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) {
      relMap[m[1]] = `xl/media/${basename(m[2])}`
    }
  }
  const xml = strFromU8(zip[drawFile])
  const anchors = []
  for (const a of xml.split(/<xdr:(?:two|one)CellAnchor/).slice(1)) {
    const row = a.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)
    const embed = a.match(/r:embed="(rId\d+)"/)
    if (row && embed && relMap[embed[1]]) anchors.push({ row: Number(row[1]), media: relMap[embed[1]] })
  }
  return anchors
}

async function processImage(bytes, ext) {
  // Comprime as capas (algumas passam de 1,5 MB) mantendo qualidade de card.
  try {
    const sharp = (await import('sharp')).default
    const out = await sharp(Buffer.from(bytes))
      .rotate()
      .resize({ width: 1080, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
    return { buffer: out, ext: 'webp', contentType: 'image/webp' }
  } catch {
    const ct = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream'
    return { buffer: Buffer.from(bytes), ext, contentType: ct }
  }
}

// Sobe as capas para o bucket leilao-covers e preenche row.image_url.
// Deduplica por conteudo (mesmo flyer reaproveitado em varios leiloes).
async function attachImages(sourceRows, file) {
  const zip = unzipSync(new Uint8Array(readFileSync(file)))
  const sheetFileMap = buildSheetFileMap(zip)
  // (sheet_index, abs_row) -> media path dentro do zip
  const byRow = new Map()
  const wb = XLSX.readFile(file, { bookSheets: true })
  wb.SheetNames.forEach((name, index) => {
    const wsFile = sheetFileMap[name]
    if (!wsFile) return
    for (const anchor of sheetImageAnchors(zip, wsFile)) {
      byRow.set(`${index}|${anchor.row}`, anchor.media)
    }
  })

  const uploadedByHash = new Map() // hash -> public url
  let uploaded = 0
  let reused = 0
  for (const row of sourceRows) {
    const media = byRow.get(`${row.sheet_index}|${row.abs_row}`)
    if (!media || !zip[media]) continue
    const bytes = zip[media]
    const hash = createHash('sha1').update(Buffer.from(bytes)).digest('hex').slice(0, 10)
    if (uploadedByHash.has(hash)) {
      row.image_url = uploadedByHash.get(hash)
      reused += 1
      continue
    }
    const srcExt = (media.split('.').pop() || 'png').toLowerCase()
    const { buffer, ext, contentType } = await processImage(bytes, srcExt)
    const path = `escala-2026/${row.data}-${slug(row.nome)}-${hash}.${ext}`
    if (!dry) {
      const { error } = await supabase.storage
        .from('leilao-covers')
        .upload(path, buffer, { contentType, upsert: true, cacheControl: '31536000' })
      if (error && !/exists/i.test(error.message)) throw error
    }
    const { data: pub } = supabase.storage.from('leilao-covers').getPublicUrl(path)
    row.image_url = pub.publicUrl
    uploadedByHash.set(hash, pub.publicUrl)
    uploaded += 1
  }
  const withImg = sourceRows.filter((r) => r.image_url).length
  console.log(`Capas: ${uploaded} enviadas, ${reused} reaproveitadas, ${withImg} leiloes com capa da planilha`)
  const withoutImg = sourceRows.filter((row) => !row.image_url)
  if (withoutImg.length > 0) {
    console.log(`Sem capa embutida (${withoutImg.length}): ${withoutImg.map((row) => `${row.data} ${row.nome}`).join(' | ')}`)
  }
}

function grams(value) {
  const s = compact(value)
  const out = new Map()
  for (let i = 0; i < s.length - 1; i += 1) {
    const g = s.slice(i, i + 2)
    out.set(g, (out.get(g) ?? 0) + 1)
  }
  return out
}

function dice(a, b) {
  const ca = compact(a)
  const cb = compact(b)
  if (!ca || !cb) return 0
  if (ca === cb) return 1
  if (ca.length < 2 || cb.length < 2) return 0
  const ga = grams(ca)
  const gb = grams(cb)
  let inter = 0
  for (const [g, n] of ga) inter += Math.min(n, gb.get(g) ?? 0)
  return (2 * inter) / ((ca.length - 1) + (cb.length - 1))
}

function matchExisting(sourceRows, dbRows) {
  const candidates = []
  for (let si = 0; si < sourceRows.length; si += 1) {
    for (let di = 0; di < dbRows.length; di += 1) {
      const s = sourceRows[si]
      const d = dbRows[di]
      if (s.data !== d.data) continue
      const nameScore = Math.max(dice(s.nome, d.nome), dice(s.nome, d.criador), dice(s.criador, d.nome))
      const hourScore = compact(s.hora) === compact(d.hora) ? 0.05 : 0
      if (nameScore >= 0.72 || rowKey(s) === rowKey(d)) {
        candidates.push({ si, di, score: nameScore + hourScore })
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score)

  const usedSource = new Set()
  const usedDb = new Set()
  const pairs = new Map()
  for (const c of candidates) {
    if (usedSource.has(c.si) || usedDb.has(c.di)) continue
    usedSource.add(c.si)
    usedDb.add(c.di)
    pairs.set(c.si, dbRows[c.di])
  }
  return { pairs, usedDb }
}

function statusForDate(dateIso) {
  return dateIso < todaySaoPaulo() ? 'concluido' : 'confirmado'
}

function todaySaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type) => parts.find((p) => p.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function toAgendaStart(row) {
  const hour = row.hora || '09:00'
  return `${row.data}T${hour}:00-03:00`
}

function addHoursIso(startIso, hours) {
  return new Date(new Date(startIso).getTime() + hours * 60 * 60 * 1000).toISOString()
}

function toPublicLeilao(row, existing) {
  const qtd = Number.parseInt(String(row.qtd_animais).replace(/\D/g, ''), 10)
  const expectativa = parseMoney(row.faturamento_previsto)
  const realizadoBula = parseMoney(row.venda_bula)
  return {
    nome: row.nome,
    data: row.data,
    tipo: sheetOrExisting(row.raca || row.sexo, existing?.tipo, 'Leilao'),
    local: sheetOrExisting(row.presencial, existing?.local),
    animais: Number.isFinite(qtd) ? qtd : Number(existing?.animais) || 0,
    expectativa: expectativa ?? (Number(existing?.expectativa) || 0),
    meta_bula: Number(existing?.meta_bula) || 0,
    realizado_bula: realizadoBula ?? (Number(existing?.realizado_bula) || 0),
    status: existing?.status || statusForDate(row.data),
    horario: sheetOrExisting(row.hora, existing?.horario),
    transmissao: existing?.transmissao || '',
    modelo: sheetOrExisting(row.presencial, existing?.modelo),
    leiloeira: sheetOrExisting(row.leiloeira, existing?.leiloeira),
    condicao: sheetOrExisting(row.condicao, existing?.condicao),
    frete_gratis: sheetOrExisting(row.frete_gratis, existing?.frete_gratis),
    acordo_comissao: sheetOrExisting(row.comissao, existing?.acordo_comissao),
    catalogo_url: sheetOrExisting(row.catalogo_url, existing?.catalogo_url, null),
    tasks: existing?.tasks ?? [],
  }
}

const allSourceRows = parseWorkbook(sourceFile)
const sourceRows = syncMonths.size > 0
  ? allSourceRows.filter((row) => syncMonths.has(row.data.slice(0, 7)))
  : allSourceRows
const duplicateKeys = sourceRows
  .map(rowKey)
  .filter((key, idx, all) => all.indexOf(key) !== idx)

if (duplicateKeys.length > 0) {
  console.error('Ha linhas duplicadas na planilha pela chave data/hora/nome/criador:')
  for (const key of [...new Set(duplicateKeys)].slice(0, 20)) console.error(`  ${key}`)
  process.exit(1)
}

console.log(`Fonte: ${basename(sourceFile)}`)
console.log(`Linhas de leilao na planilha: ${sourceRows.length}`)
console.log(`Meses: ${syncMonths.size > 0 ? [...syncMonths].sort().join(', ') : 'ano inteiro'}`)
console.log(`Modo: ${dry ? 'dry-run' : 'escrita real'}${keepExtras ? ' (mantendo extras)' : ''}`)

if (!skipImages) {
  await attachImages(sourceRows, sourceFile)
} else {
  console.log('Capas: pulado (--skip-images)')
}

if (process.env.DEBUG_SYNC) {
  const withChk = sourceRows.filter((r) => r.checklist)
  console.log(`\n[DEBUG] leiloes com checklist da planilha: ${withChk.length}`)
  for (const r of withChk.slice(0, 2)) {
    console.log(`  ${r.data} ${r.nome}`)
    for (const t of r.checklist.tasks) console.log(`    [${t.done ? 'x' : ' '}] ${t.nome}`)
  }
  console.log('\n[DEBUG] amostra de capas:')
  for (const r of sourceRows.filter((r) => r.image_url).slice(0, 4)) console.log(`  ${r.data} ${r.nome} -> ${r.image_url}`)
  console.log('')
}

const { data: currentRowsAll, error: cronoError } = await supabase
  .from('cronograma_leiloes')
  .select('*')
  .gte('data', '2026-01-01')
  .lt('data', '2027-01-01')
if (cronoError) throw cronoError
const currentRows = (currentRowsAll ?? []).filter((row) =>
  syncMonths.size === 0 || syncMonths.has(String(row.data).slice(0, 7)),
)

const { pairs, usedDb } = matchExisting(sourceRows, currentRows)
const agreementRows = sourceRows
  .map((row, index) => ({ row, existing: pairs.get(index) }))
  .filter(({ row }) => isMeaningfulSheetValue(row.comissao))
const agreementChanges = agreementRows.filter(({ row, existing }) =>
  strip(row.comissao) !== strip(existing?.comissao),
)
console.log(`Acordos: ${agreementRows.length} informados na planilha, ${agreementChanges.length} preenchimentos/atualizacoes no cronograma`)

const cronogramaPayload = sourceRows.map((row, index) => {
  const existing = pairs.get(index)
  return {
    id: existing?.id ?? randomUUID(),
    data: row.data,
    dia_semana: sheetOrExisting(row.dia_semana, existing?.dia_semana),
    hora: sheetOrExisting(row.hora, existing?.hora),
    nome: row.nome,
    criador: sheetOrExisting(row.criador, existing?.criador),
    // Modalidade e editavel no painel admin (Modalidade/Modelo). A planilha so
    // semeia o valor no primeiro insert; em registros ja existentes, preserva o
    // que esta no banco para nao sobrescrever ajustes manuais a cada sync.
    presencial: existing ? existing.presencial : row.presencial,
    leiloeira: sheetOrExisting(row.leiloeira, existing?.leiloeira),
    raca: sheetOrExisting(row.raca, existing?.raca),
    qtd_animais: sheetOrExisting(row.qtd_animais, existing?.qtd_animais),
    sexo: sheetOrExisting(row.sexo, existing?.sexo),
    comissao: sheetOrExisting(row.comissao, existing?.comissao),
    contrato: sheetOrExisting(row.contrato, existing?.contrato),
    faturamento_previsto: sheetOrExisting(row.faturamento_previsto, existing?.faturamento_previsto),
    faturamento_realizado: sheetOrExisting(row.faturamento_realizado, existing?.faturamento_realizado),
    venda_bula: sheetOrExisting(row.venda_bula, existing?.venda_bula),
    comissao_receber: sheetOrExisting(row.comissao_receber || row.comissao_prevista, existing?.comissao_receber),
    recebido: sheetOrExisting(row.recebido, existing?.recebido),
    catalogo_url: sheetOrExisting(row.catalogo_url, existing?.catalogo_url, null),
    // A capa da planilha vence; sem capa na planilha, preserva a atual.
    img: row.image_url || existing?.img || null,
  }
})

const extraCronograma = currentRows.filter((_, index) => !usedDb.has(index))
console.log(`Cronograma: ${pairs.size} atualizacoes, ${sourceRows.length - pairs.size} insercoes, ${extraCronograma.length} extras no banco`)

if (!dry && extraCronograma.length > 0 && !keepExtras) {
  const ids = extraCronograma.map((row) => row.id)
  await supabase.from('agenda_events').delete().in('linked_leilao_id', ids)
  const { error } = await supabase.from('cronograma_leiloes').delete().in('id', ids)
  if (error) throw error
}

let syncedCronograma = cronogramaPayload
if (!dry) {
  const { data, error } = await supabase
    .from('cronograma_leiloes')
    .upsert(cronogramaPayload, { onConflict: 'id' })
    .select('*')
  if (error) throw error
  syncedCronograma = data
}

const syncedById = new Map(syncedCronograma.map((row) => [row.id, row]))
const sourceWithIds = sourceRows.map((row, index) =>
  syncedById.get(cronogramaPayload[index].id) ?? { ...row, id: cronogramaPayload[index].id },
)

const { data: currentPublicAll, error: publicError } = await supabase
  .from('bula_leiloes')
  .select('*')
  .gte('data', '2026-01-01')
  .lt('data', '2027-01-01')
if (publicError) throw publicError
const currentPublic = (currentPublicAll ?? []).filter((row) =>
  syncMonths.size === 0 || syncMonths.has(String(row.data).slice(0, 7)),
)

const { pairs: publicPairs, usedDb: usedPublic } = matchExisting(sourceRows, currentPublic)
const publicPayload = sourceRows.map((row, index) => {
  const existing = publicPairs.get(index)
  const cronograma = syncedById.get(cronogramaPayload[index].id)
  const pub = toPublicLeilao(row, existing)
  return {
    id: existing?.id ?? randomUUID(),
    ...pub,
    // Vinculo explicito com a linha da planilha (mesma source row). Precisa,
    // sem adivinhacao: o card e a edicao usam este id para parear.
    cronograma_id: cronograma?.id ?? null,
    // Modalidade/local sao editaveis no admin e lidos pela agenda publica.
    // Em registros existentes, preserva o que esta no banco (edicao manual
    // vence); a planilha so semeia esses campos no primeiro insert.
    modelo: existing ? existing.modelo : pub.modelo,
    local: existing ? existing.local : pub.local,
    // A capa da planilha vence; sem capa nova, preserva a atual (admin/cronograma).
    img: row.image_url || existing?.img || cronograma?.img || '',
    catalogo_url: sheetOrExisting(row.catalogo_url, existing?.catalogo_url || cronograma?.catalogo_url, null),
    transmissao: existing?.transmissao || '',
    // Checklist "Produção & Divulgação": junho vem da planilha; julho em diante
    // recebe o mesmo checklist em branco (semeado uma vez). Preserva grupos manuais.
    tasks: mergeChecklist(existing?.tasks ?? [], row),
  }
})
const extraPublic = currentPublic.filter((_, index) => !usedPublic.has(index))
console.log(`Publico: ${publicPairs.size} atualizacoes, ${sourceRows.length - publicPairs.size} insercoes, ${extraPublic.length} extras no banco`)

if (!dry && extraPublic.length > 0 && !keepExtras) {
  const { error } = await supabase.from('bula_leiloes').delete().in('id', extraPublic.map((row) => row.id))
  if (error) throw error
}

if (!dry) {
  const { error } = await supabase.from('bula_leiloes').upsert(publicPayload, { onConflict: 'id' })
  if (error) throw error
}

const agendaIds = sourceWithIds.filter((row) => row.id).map((row) => row.id)
console.log(`Agenda admin: ${agendaIds.length} eventos de leilao derivados do cronograma`)

if (!dry) {
  if (agendaIds.length > 0) {
    const { error } = await supabase.from('agenda_events').delete().in('linked_leilao_id', agendaIds)
    if (error) throw error
  }

  const agendaPayload = sourceWithIds.map((row) => {
    const startAt = toAgendaStart(row)
    const details = [
      row.criador ? `Criador: ${row.criador}` : '',
      row.leiloeira ? `Leiloeira: ${row.leiloeira}` : '',
      row.raca ? `Raca: ${row.raca}` : '',
      row.qtd_animais ? `Qtd.: ${row.qtd_animais}` : '',
      row.sexo ? `Sexo: ${row.sexo}` : '',
      row.comissao ? `Comissao: ${row.comissao}` : '',
    ].filter(Boolean)

    return {
      title: row.nome,
      description: details.join('\n'),
      event_type: 'leilao',
      status: row.data < todaySaoPaulo() ? 'concluido' : 'planejado',
      priority: 'media',
      start_at: startAt,
      end_at: row.hora ? addHoursIso(startAt, 2) : null,
      all_day: !row.hora,
      location: row.presencial || row.leiloeira || null,
      color: '#A68B4B',
      notes: `Sincronizado da planilha ${basename(sourceFile)} (${row.sheet_name}, linha ${row.sheet_row}).`,
      linked_leilao_id: row.id,
    }
  })

  const { error } = await supabase.from('agenda_events').insert(agendaPayload)
  if (error) throw error
}

const byMonth = sourceRows.reduce((acc, row) => {
  const key = row.data.slice(0, 7)
  acc[key] = (acc[key] ?? 0) + 1
  return acc
}, {})
console.log('Por mes:', byMonth)
console.log('OK')
