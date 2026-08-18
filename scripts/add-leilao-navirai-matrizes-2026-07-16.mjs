// Adiciona/atualiza o Navirai Matrizes (16/07/2026).
//
// Origem: capa enviada no arquivo F:\16 julho.jpeg.
//
// Uso: node scripts/add-leilao-navirai-matrizes-2026-07-16.mjs

import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios em .env.local')
  process.exit(1)
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DATA = '2026-07-16'
const HORA = ''
const NOME_PUBLICO = 'Naviraí Matrizes'
const NOME_CRONO = 'NAVIRAÍ MATRIZES'
const CRIADOR = 'NAVIRAÍ'
const LEILOEIRA = 'PROGRAMA LEILÕES'
const COVER_SRC = 'F:\\16 julho.jpeg'
const COVER_PATH = 'escala-2026/2026-07-16-navirai-matrizes.jpeg'

if (!existsSync(COVER_SRC)) {
  console.error(`Capa nao encontrada: ${COVER_SRC}`)
  process.exit(1)
}

async function upsertByNameDate(table, payload) {
  const { data: existing, error: selectError } = await supabase
    .from(table)
    .select('id')
    .eq('nome', payload.nome)
    .eq('data', payload.data)
    .maybeSingle()

  if (selectError) throw new Error(`SELECT ${table}: ${selectError.message}`)

  if (existing) {
    const { error } = await supabase.from(table).update(payload).eq('id', existing.id)
    if (error) throw new Error(`UPDATE ${table}: ${error.message}`)
    return { action: 'atualizado', id: existing.id }
  }

  const { data: inserted, error } = await supabase.from(table).insert(payload).select('id').single()
  if (error) throw new Error(`INSERT ${table}: ${error.message}`)
  return { action: 'criado', id: inserted.id }
}

const fileBytes = readFileSync(COVER_SRC)
console.log(`Subindo capa (${(fileBytes.length / 1024).toFixed(1)} KB) -> leilao-covers/${COVER_PATH}`)

const { error: uploadError } = await supabase.storage.from('leilao-covers').upload(COVER_PATH, fileBytes, {
  contentType: 'image/jpeg',
  upsert: true,
})

if (uploadError) throw new Error(`UPLOAD capa: ${uploadError.message}`)

const { data: publicUrlData } = supabase.storage.from('leilao-covers').getPublicUrl(COVER_PATH)
const coverUrl = publicUrlData.publicUrl
console.log(`Capa publica: ${coverUrl}`)

const cronoPayload = {
  data: DATA,
  dia_semana: 'quinta',
  hora: HORA,
  nome: NOME_CRONO,
  criador: CRIADOR,
  presencial: 'VIRTUAL',
  leiloeira: LEILOEIRA,
  raca: 'NELORE',
  qtd_animais: null,
  sexo: 'FÊMEAS',
  comissao: '',
  contrato: '',
  faturamento_previsto: null,
  faturamento_realizado: null,
  venda_bula: null,
  comissao_receber: null,
  recebido: '',
  catalogo_url: null,
  img: coverUrl,
}

const crono = await upsertByNameDate('cronograma_leiloes', cronoPayload)
console.log(`cronograma_leiloes: ${crono.action} (id=${crono.id})`)

const publicPayload = {
  nome: NOME_PUBLICO,
  data: DATA,
  tipo: 'Matrizes prenhas e paridas',
  local: '',
  animais: 0,
  expectativa: 0,
  meta_bula: 0,
  realizado_bula: 0,
  status: 'confirmado',
  img: coverUrl,
  horario: HORA,
  transmissao: 'Canal Rural',
  modelo: 'VIRTUAL',
  leiloeira: 'Programa Leilões',
  condicao: '',
  frete_gratis: '',
  acordo_comissao: '',
  catalogo_url: null,
  tasks: [],
  cronograma_id: crono.id,
}

const publico = await upsertByNameDate('bula_leiloes', publicPayload)
console.log(`bula_leiloes: ${publico.action} (id=${publico.id})`)

const agendaPayload = {
  id: randomUUID(),
  title: NOME_CRONO,
  description: [
    `Criador: ${CRIADOR}`,
    `Leiloeira: ${LEILOEIRA}`,
    'Raça: NELORE',
    'Sexo: FÊMEAS',
    'Oferta indicada na arte: doadoras, novilhas precoces, primíparas e multíparas prenhas e paridas.',
    'Transmissão indicada na arte: Canal Rural.',
  ].join('\n'),
  event_type: 'leilao',
  status: 'planejado',
  priority: 'media',
  start_at: `${DATA}T00:00:00-03:00`,
  end_at: '2026-07-17T00:00:00-03:00',
  all_day: true,
  location: '',
  color: '#A68B4B',
  notes: `Adicionado manualmente por ${basename(import.meta.url)} a partir da capa ${COVER_SRC}. A arte nao informa horario.`,
  linked_leilao_id: crono.id,
}

const { error: deleteAgendaError } = await supabase
  .from('agenda_events')
  .delete()
  .eq('linked_leilao_id', crono.id)

if (deleteAgendaError) throw new Error(`DELETE agenda_events: ${deleteAgendaError.message}`)

const { error: insertAgendaError } = await supabase.from('agenda_events').insert(agendaPayload)
if (insertAgendaError) throw new Error(`INSERT agenda_events: ${insertAgendaError.message}`)

console.log(`agenda_events: recriado para cronograma (linked_leilao_id=${crono.id})`)
console.log('\nOK - Navirai Matrizes adicionado na agenda/admin com capa.')
