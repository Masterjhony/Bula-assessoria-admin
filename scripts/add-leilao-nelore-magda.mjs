// Adiciona/atualiza o Leilao Nelore Magda Na Origem (28/06/2026).
//
// Origem: imagem enviada por Marcelo Primo Carneiro no WhatsApp em 31/05/2026
// com a mensagem "Novo leilao dia 28/06".
//
// Uso: node scripts/add-leilao-nelore-magda.mjs

import { readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DATA = '2026-06-28'
const HORA = '14:00'
const NOME_PUBLICO = 'Leilão Nelore Magda Na Origem'
const NOME_CRONO = 'LEILÃO NELORE MAGDA NA ORIGEM'
const CRIADOR = 'NELORE MAGDA'
const COVER_SRC = join(root, 'work', 'nelore-magda-na-origem-cover-clean.jpg')
const COVER_PATH = 'whatsapp-2026/2026-06-28-leilao-nelore-magda-na-origem.jpg'

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

const publicPayload = {
  nome: NOME_PUBLICO,
  data: DATA,
  tipo: 'NELORE PADRÃO',
  local: 'Carlinda/MT',
  animais: 0,
  expectativa: 0,
  meta_bula: 0,
  realizado_bula: 0,
  status: 'confirmado',
  img: coverUrl,
  horario: HORA,
  transmissao: 'Canal Rural',
  modelo: 'VIRTUAL',
  leiloeira: 'Ricardo Nicolau Leilões',
  condicao: '',
  frete_gratis: '',
  acordo_comissao: '',
  catalogo_url: null,
  tasks: [],
}

const cronoPayload = {
  data: DATA,
  dia_semana: 'domingo',
  hora: HORA,
  nome: NOME_CRONO,
  criador: CRIADOR,
  presencial: 'VIRTUAL',
  leiloeira: 'RICARDO NICOLAU LEILÕES',
  raca: 'NELORE PADRÃO',
  qtd_animais: '',
  sexo: '',
  comissao: '',
  contrato: '',
  faturamento_previsto: '',
  faturamento_realizado: '',
  venda_bula: '',
  comissao_receber: '',
  recebido: '',
  catalogo_url: null,
  img: coverUrl,
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

const publico = await upsertByNameDate('bula_leiloes', publicPayload)
console.log(`bula_leiloes: ${publico.action} (id=${publico.id})`)

const crono = await upsertByNameDate('cronograma_leiloes', cronoPayload)
console.log(`cronograma_leiloes: ${crono.action} (id=${crono.id})`)

const agendaPayload = {
  id: randomUUID(),
  title: NOME_CRONO,
  description: [
    `Criador: ${CRIADOR}`,
    'Leiloeira: RICARDO NICOLAU LEILÕES',
    'Raca: NELORE PADRÃO',
    'Transmissao indicada na arte: Canal Rural',
    'Local indicado na arte: Carlinda/MT',
  ].join('\n'),
  event_type: 'leilao',
  status: 'planejado',
  priority: 'media',
  start_at: `${DATA}T14:00:00-03:00`,
  end_at: `${DATA}T16:00:00-03:00`,
  all_day: false,
  location: 'Carlinda/MT',
  color: '#A68B4B',
  notes: `Adicionado manualmente por ${basename(import.meta.url)} a partir de arte enviada por Marcelo Primo Carneiro no WhatsApp em 31/05/2026.`,
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
console.log('\nOK - Leilao Nelore Magda Na Origem adicionado na agenda/admin com capa.')
