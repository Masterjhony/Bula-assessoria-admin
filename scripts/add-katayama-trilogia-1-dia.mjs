// Adiciona/atualiza o 1o dia do Leilao Katayama Trilogia (31/05/2026).
//
// Origem: observacao de Marcelo Primo Carneiro no WhatsApp em 31/05/2026:
// na agenda constavam somente 01/06 e 02/06, mas a arte/conversa indicavam
// tambem o 1o dia em 31/05.
//
// Uso: node scripts/add-katayama-trilogia-1-dia.mjs

import { readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(join(process.cwd(), '.env.local'), 'utf-8')
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

const DATA = '2026-05-31'
const HORA = '14:00'
const NOME = '1º DIA - LEILÃO KATAYAMA TRILOGIA'
const CRIADOR = 'NELORE KATAYAMA'
const COVER_URL =
  'https://nfjkzigvxegnhaxxbevt.supabase.co/storage/v1/object/public/leilao-covers/escala-2026/2026-06-01-2-dia-leilao-katayama-trilogia.jpg'

const publicPayload = {
  nome: NOME,
  data: DATA,
  tipo: 'NELORE PADRÃO',
  local: 'VIRTUAL',
  animais: 0,
  expectativa: 0,
  meta_bula: 0,
  realizado_bula: 0,
  status: 'confirmado',
  img: COVER_URL,
  horario: HORA,
  transmissao: '',
  modelo: 'VIRTUAL',
  leiloeira: 'PROGRAMA LEILÕES',
  condicao: '',
  frete_gratis: '',
  acordo_comissao: '5% da venda',
  catalogo_url: null,
  tasks: [],
}

const cronoPayload = {
  data: DATA,
  dia_semana: 'domingo',
  hora: HORA,
  nome: NOME,
  criador: CRIADOR,
  presencial: 'VIRTUAL',
  leiloeira: 'PROGRAMA LEILÕES',
  raca: 'NELORE PADRÃO',
  qtd_animais: '',
  sexo: '',
  comissao: '5% da venda',
  contrato: '',
  faturamento_previsto: '',
  faturamento_realizado: '',
  venda_bula: '',
  comissao_receber: '',
  recebido: '',
  catalogo_url: null,
  img: COVER_URL,
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

const startAt = `${DATA}T14:00:00-03:00`
const agendaPayload = {
  id: randomUUID(),
  title: NOME,
  description: [
    `Criador: ${CRIADOR}`,
    'Leiloeira: PROGRAMA LEILÕES',
    'Raca: NELORE PADRÃO',
    'Comissao: 5% da venda',
  ].join('\n'),
  event_type: 'leilao',
  status: 'planejado',
  priority: 'media',
  start_at: startAt,
  end_at: `${DATA}T16:00:00-03:00`,
  all_day: false,
  location: 'VIRTUAL',
  color: '#A68B4B',
  notes: `Adicionado manualmente por ${basename(import.meta.url)} a partir da observacao de Marcelo Primo Carneiro no WhatsApp em 31/05/2026.`,
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
console.log('\nOK - 1o dia do Leilao Katayama Trilogia adicionado na agenda/admin com capa.')
