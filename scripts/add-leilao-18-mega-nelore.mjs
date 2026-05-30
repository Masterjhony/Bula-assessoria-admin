// Adiciona/atualiza o 18o Mega Leilao Nelore Para (Redencao/PA, 30/05/2026).
//
// Origem: conversa de 30/05/2026 com Marcelo Primo Carneiro no WhatsApp:
// "Esse foi o 18 Mega Leilao Nelore Para" e "Nao estava na agenda, adiciona
// la tambem. Comemos mosca."
//
// Uso: node scripts/add-leilao-18-mega-nelore.mjs

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

const DATA = '2026-05-30'
const NOME_PUBLICO = '18o Mega Leilao Nelore Para'
const NOME_CRONO = '18O MEGA LEILAO NELORE PARA'

const publicPayload = {
  nome: NOME_PUBLICO,
  data: DATA,
  tipo: '60 touros - Nelore e Nelore Mocho',
  local: 'Redencao/PA',
  animais: 60,
  expectativa: 0,
  meta_bula: 0,
  realizado_bula: 0,
  status: 'concluido',
  img: '',
  horario: '12:00',
  transmissao: '',
  modelo: 'PRESENCIAL',
  leiloeira: '',
  condicao: '30 parcelas',
  frete_gratis: '',
  acordo_comissao: '',
  catalogo_url: null,
  tasks: [],
}

const cronoPayload = {
  data: DATA,
  dia_semana: 'Sabado',
  hora: '12:00',
  nome: NOME_CRONO,
  criador: '',
  presencial: 'PRESENCIAL',
  leiloeira: '',
  raca: 'Nelore / Nelore Mocho',
  qtd_animais: 60,
  sexo: 'MACHOS',
  comissao: '',
  contrato: 'NAO',
  recebido: 'NAO',
}

async function upsertByNameDate(table, payload, select = 'id') {
  const { data: existing, error: selErr } = await supabase
    .from(table)
    .select(select)
    .eq('nome', payload.nome)
    .eq('data', payload.data)
    .maybeSingle()

  if (selErr) throw new Error(`SELECT ${table}: ${selErr.message}`)

  if (existing) {
    const { error } = await supabase.from(table).update(payload).eq('id', existing.id)
    if (error) throw new Error(`UPDATE ${table}: ${error.message}`)
    return { id: existing.id, action: 'atualizado' }
  }

  const { data: inserted, error } = await supabase.from(table).insert(payload).select('id').single()
  if (error) throw new Error(`INSERT ${table}: ${error.message}`)
  return { id: inserted.id, action: 'criado' }
}

const publico = await upsertByNameDate('bula_leiloes', publicPayload)
console.log(`bula_leiloes: ${publico.action} (id=${publico.id})`)

const crono = await upsertByNameDate('cronograma_leiloes', cronoPayload)
console.log(`cronograma_leiloes: ${crono.action} (id=${crono.id})`)

const startAt = `${DATA}T12:00:00-03:00`
const agendaPayload = {
  id: randomUUID(),
  title: NOME_CRONO,
  description: [
    'Criador: Nelore FPA / Fazenda Paraiso do Acara',
    'Raca: Nelore / Nelore Mocho',
    'Qtd.: 60',
    'Sexo: MACHOS',
    'Condicao confirmada no WhatsApp: 30 parcelas.',
  ].join('\n'),
  event_type: 'leilao',
  status: 'concluido',
  priority: 'media',
  start_at: startAt,
  end_at: `${DATA}T14:00:00-03:00`,
  all_day: false,
  location: 'Redencao/PA',
  color: '#A68B4B',
  notes: `Adicionado manualmente por ${basename(import.meta.url)} a partir da conversa de WhatsApp com Marcelo Primo Carneiro em 30/05/2026.`,
  linked_leilao_id: crono.id,
}

const { error: delAgendaErr } = await supabase
  .from('agenda_events')
  .delete()
  .eq('linked_leilao_id', crono.id)

if (delAgendaErr) throw new Error(`DELETE agenda_events: ${delAgendaErr.message}`)

const { error: insAgendaErr } = await supabase.from('agenda_events').insert(agendaPayload)
if (insAgendaErr) throw new Error(`INSERT agenda_events: ${insAgendaErr.message}`)

console.log(`agenda_events: recriado para cronograma (linked_leilao_id=${crono.id})`)
console.log('\nOK - 18o Mega Leilao Nelore Para adicionado na agenda/admin como concluido.')
