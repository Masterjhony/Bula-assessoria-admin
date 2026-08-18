// Adiciona/atualiza os dois leilões de 19/08/2026 (quarta) da ExpoGenética 2026:
//   12h — 9º Leilão Genética Aditiva ExpoGenética 2026 (doadoras + touros de central)
//   20h — Leilão Reserva ExpoGenética 2026 Santa Nice (bezerras, novilhas, doadoras prenhes)
//
// Origem: artes recebidas em 03/08/2026 —
// F:\leilao 1999.jpeg (Genética Aditiva) e F:\leilao dia 19.jpeg (Santa Nice).
//
// Uso: node scripts/add-leiloes-expogenetica-2026-08-19.mjs

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

// Mesmo checklist padrão que o sync da planilha semeia nos leilões novos.
const CHECKLIST_ITENS = [
  ['plan-catalogo', 'Catálogo'],
  ['plan-videos-curral', 'Vídeos de curral'],
  ['plan-logo-png', 'Logo (PNG)'],
  ['plan-avaliacao', 'Avaliação'],
  ['plan-divulgacao-clientes-perfil', 'Divulgação: clientes perfil'],
  ['plan-divulgacao-grupo', 'Divulgação: grupo'],
  ['plan-divulgacao-instagram', 'Divulgação: Instagram'],
  ['plan-leilao-realizado', 'Leilão realizado'],
  ['plan-fechamento-realizado', 'Fechamento realizado'],
  ['plan-contas-a-receber-e-a-pagar', 'Contas a receber e a pagar'],
]

function checklistPadrao() {
  return [
    {
      nome: 'Produção & Divulgação',
      cor: '#111827',
      subtitulo: 'Checklist padrão',
      origem: 'seed',
      tasks: CHECKLIST_ITENS.map(([id, nome]) => ({
        id,
        nome,
        ini: '',
        fim: '',
        resp: { ini: '', nome: '' },
        subs: [],
        done: false,
        observacao: '',
        anexos: [],
      })),
    },
  ]
}

const DATA = '2026-08-19'
const DIA_SEMANA = 'quarta-feira'

const LEILOES = [
  {
    hora: '12:00',
    nome: '9º LEILÃO GENÉTICA ADITIVA EXPOGENÉTICA',
    criador: 'GENÉTICA ADITIVA',
    raca: 'NELORE',
    sexo: 'FÊMEAS E MACHOS',
    tipo: 'NELORE',
    local: 'Tatersal Rubico de Carvalho',
    transmissao: 'Canal do Criador (retransmissão Lance Rural e Remate Web)',
    // Arte oficial do leilão (03/08). A primeira capa era o card de
    // agradecimento do 23º Mega Leilão, que só anunciava esta data.
    coverSrc: 'F:\\genet adit.jpeg',
    coverPath: 'escala-2026/2026-08-19-9o-genetica-aditiva-expogenetica-arte-oficial.jpeg',
    oferta: 'Oferta indicada na arte: doadoras de alto padrão genético e touros de central.',
    contatos: 'Informações na arte: Claudinei (67) 99984-6958 · Natiélly (67) 99982-8028 · Flávio (67) 98152-1488.',
  },
  {
    hora: '20:00',
    nome: 'LEILÃO RESERVA EXPOGENÉTICA SANTA NICE',
    criador: 'SANTA NICE',
    raca: 'NELORE PO',
    sexo: 'FÊMEAS',
    tipo: 'NELORE PO',
    local: '',
    transmissao: 'Canal Rural (retransmissão Lance Rural e Remate Web)',
    coverSrc: 'F:\\leilao dia 19.jpeg',
    coverPath: 'escala-2026/2026-08-19-reserva-expogenetica-santa-nice.jpeg',
    oferta: 'Oferta indicada na arte: bezerras, novilhas super precoces e doadoras prenhes — Nelore PO, 100% avaliados.',
    contatos: '',
  },
]

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

for (const l of LEILOES) {
  if (!existsSync(l.coverSrc)) {
    console.error(`Capa nao encontrada: ${l.coverSrc}`)
    process.exit(1)
  }
}

for (const l of LEILOES) {
  console.log(`\n── ${l.nome} (${DATA} ${l.hora}) ──`)

  const fileBytes = readFileSync(l.coverSrc)
  console.log(`Subindo capa (${(fileBytes.length / 1024).toFixed(1)} KB) -> leilao-covers/${l.coverPath}`)
  const { error: uploadError } = await supabase.storage.from('leilao-covers').upload(l.coverPath, fileBytes, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (uploadError) throw new Error(`UPLOAD capa: ${uploadError.message}`)

  const { data: publicUrlData } = supabase.storage.from('leilao-covers').getPublicUrl(l.coverPath)
  const coverUrl = publicUrlData.publicUrl
  console.log(`Capa publica: ${coverUrl}`)

  const crono = await upsertByNameDate('cronograma_leiloes', {
    data: DATA,
    dia_semana: DIA_SEMANA,
    hora: l.hora,
    nome: l.nome,
    criador: l.criador,
    presencial: '',
    leiloeira: 'PROGRAMA LEILOES',
    raca: l.raca,
    qtd_animais: null,
    sexo: l.sexo,
    comissao: '',
    contrato: '',
    faturamento_previsto: '',
    faturamento_realizado: '',
    venda_bula: '',
    comissao_receber: '',
    recebido: '',
    catalogo_url: null,
    img: coverUrl,
  })
  console.log(`cronograma_leiloes: ${crono.action} (id=${crono.id})`)

  const publico = await upsertByNameDate('bula_leiloes', {
    nome: l.nome,
    data: DATA,
    tipo: l.tipo,
    local: l.local,
    animais: 0,
    expectativa: 0,
    meta_bula: 0,
    realizado_bula: 0,
    status: 'confirmado',
    img: coverUrl,
    horario: l.hora,
    transmissao: l.transmissao,
    modelo: '',
    leiloeira: 'PROGRAMA LEILOES',
    condicao: '',
    frete_gratis: '',
    acordo_comissao: '',
    catalogo_url: null,
    tasks: checklistPadrao(),
    cronograma_id: crono.id,
  })
  console.log(`bula_leiloes: ${publico.action} (id=${publico.id})`)

  const agendaPayload = {
    id: randomUUID(),
    title: l.nome,
    description: [
      `Criador: ${l.criador}`,
      'Leiloeira: PROGRAMA LEILOES',
      `Raça: ${l.raca}`,
      `Sexo: ${l.sexo}`,
      l.local ? `Local: ${l.local}` : '',
      l.oferta,
      `Transmissão: ${l.transmissao}.`,
      'Durante a ExpoGenética 2026.',
      l.contatos,
    ]
      .filter(Boolean)
      .join('\n'),
    event_type: 'leilao',
    status: 'planejado',
    priority: 'media',
    start_at: `${DATA}T${l.hora}:00-03:00`,
    end_at: `${DATA}T23:59:00-03:00`,
    all_day: false,
    location: l.local,
    color: '#A68B4B',
    notes: `Adicionado por ${basename(import.meta.url)} a partir da arte ${l.coverSrc} (03/08/2026).`,
    linked_leilao_id: crono.id,
  }

  const { error: deleteAgendaError } = await supabase
    .from('agenda_events')
    .delete()
    .eq('linked_leilao_id', crono.id)
  if (deleteAgendaError) throw new Error(`DELETE agenda_events: ${deleteAgendaError.message}`)

  const { error: insertAgendaError } = await supabase.from('agenda_events').insert(agendaPayload)
  if (insertAgendaError) throw new Error(`INSERT agenda_events: ${insertAgendaError.message}`)
  console.log(`agenda_events: recriado (linked_leilao_id=${crono.id})`)
}

console.log('\nOK — leilões de 19/08/2026 (Genética Aditiva 12h e Santa Nice 20h) incluídos na agenda/admin com capas.')
