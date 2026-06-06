import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const dry = process.argv.includes('--dry')
const keepExtras = process.argv.includes('--keep-extras')
const explicitFile = process.argv.find((arg) => arg.endsWith('.xlsx'))
const sourceFile = explicitFile ?? readdirSync('.').find((f) => f.startsWith('ESCALA') && f.endsWith('.xlsx'))

if (!sourceFile) {
  console.error('Planilha ESCALA*.xlsx nao encontrada no diretorio do projeto.')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync(join('.', '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Variaveis NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes em .env.local')
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

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false })
    const idx = headerIndexes(data[1] ?? [])
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
        recebido: clean(row[idx.recebido]),
        catalogo_url: clean(row[idx.catalogo_url]),
        sheet_name: sheetName,
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

function toPublicLeilao(row) {
  const qtd = Number.parseInt(String(row.qtd_animais).replace(/\D/g, ''), 10)
  return {
    nome: row.nome,
    data: row.data,
    tipo: row.raca || row.sexo || 'Leilao',
    local: row.presencial || '',
    animais: Number.isFinite(qtd) ? qtd : 0,
    expectativa: 0,
    meta_bula: 0,
    realizado_bula: 0,
    status: statusForDate(row.data),
    horario: row.hora,
    transmissao: '',
    modelo: row.presencial || '',
    leiloeira: row.leiloeira || '',
    condicao: row.condicao || '',
    frete_gratis: row.frete_gratis || '',
    acordo_comissao: row.comissao || '',
    catalogo_url: row.catalogo_url || null,
    tasks: [],
  }
}

const sourceRows = parseWorkbook(sourceFile)
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
console.log(`Modo: ${dry ? 'dry-run' : 'escrita real'}${keepExtras ? ' (mantendo extras)' : ''}`)

const { data: currentRows, error: cronoError } = await supabase
  .from('cronograma_leiloes')
  .select('*')
  .gte('data', '2026-01-01')
  .lt('data', '2027-01-01')
if (cronoError) throw cronoError

const { pairs, usedDb } = matchExisting(sourceRows, currentRows ?? [])
const currentById = new Map((currentRows ?? []).map((row) => [row.id, row]))

const cronogramaPayload = sourceRows.map((row, index) => {
  const existing = pairs.get(index)
  return {
    id: existing?.id ?? randomUUID(),
    data: row.data,
    dia_semana: row.dia_semana,
    hora: row.hora,
    nome: row.nome,
    criador: row.criador,
    // Modalidade e editavel no painel admin (Modalidade/Modelo). A planilha so
    // semeia o valor no primeiro insert; em registros ja existentes, preserva o
    // que esta no banco para nao sobrescrever ajustes manuais a cada sync.
    presencial: existing ? existing.presencial : row.presencial,
    leiloeira: row.leiloeira,
    raca: row.raca,
    qtd_animais: row.qtd_animais,
    sexo: row.sexo,
    comissao: row.comissao,
    contrato: row.contrato,
    faturamento_previsto: row.faturamento_previsto,
    faturamento_realizado: row.faturamento_realizado,
    venda_bula: row.venda_bula,
    comissao_receber: row.comissao_receber,
    recebido: row.recebido,
    catalogo_url: row.catalogo_url || existing?.catalogo_url || null,
    img: existing?.img ?? null,
  }
})

const extraCronograma = (currentRows ?? []).filter((_, index) => !usedDb.has(index))
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

const syncedByKey = new Map(syncedCronograma.map((row) => [rowKey(row), row]))
const sourceWithIds = sourceRows.map((row) => syncedByKey.get(rowKey(row)) ?? row)

const { data: currentPublic, error: publicError } = await supabase
  .from('bula_leiloes')
  .select('*')
  .gte('data', '2026-01-01')
  .lt('data', '2027-01-01')
if (publicError) throw publicError

const { pairs: publicPairs, usedDb: usedPublic } = matchExisting(sourceRows, currentPublic ?? [])
const publicPayload = sourceRows.map((row, index) => {
  const existing = publicPairs.get(index)
  const cronograma = syncedByKey.get(rowKey(row))
  const pub = toPublicLeilao(row)
  return {
    id: existing?.id ?? randomUUID(),
    ...pub,
    // Modalidade/local sao editaveis no admin e lidos pela agenda publica.
    // Em registros existentes, preserva o que esta no banco (edicao manual
    // vence); a planilha so semeia esses campos no primeiro insert.
    modelo: existing ? existing.modelo : pub.modelo,
    local: existing ? existing.local : pub.local,
    img: existing?.img || cronograma?.img || '',
    catalogo_url: existing?.catalogo_url || cronograma?.catalogo_url || row.catalogo_url || null,
    transmissao: existing?.transmissao || '',
    tasks: existing?.tasks ?? [],
  }
})
const extraPublic = (currentPublic ?? []).filter((_, index) => !usedPublic.has(index))
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
