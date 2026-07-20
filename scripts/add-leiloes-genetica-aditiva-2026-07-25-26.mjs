// Adiciona/atualiza as duas etapas do 23º Mega Leilão Genética Aditiva:
//   1ª ETAPA — 25/07/2026 (sábado)  — Fêmeas Nelore PO — Virtual 12h (Brasília)
//   2ª ETAPA — 26/07/2026 (domingo) — Touros Nelore PO — Virtual 9h (Brasília)
//
// Origem: artes enviadas no grupo por Marcelo Primo Carneiro (20/07) —
// F:\genetica ad.jpeg (fêmeas) e F:\gead2.jpeg (touros).
//
// Uso: node scripts/add-leiloes-genetica-aditiva-2026-07-25-26.mjs

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

const ETAPAS = [
  {
    data: '2026-07-25',
    diaSemana: 'sábado',
    hora: '12:00',
    nomePublico: '23º Mega Leilão Genética Aditiva — 1ª Etapa (Fêmeas Nelore PO)',
    // Mesmo nome do público (a menos de caixa): o criador na agenda pública
    // casa cronograma×bula por data|nome|hora normalizados (eventKey).
    nomeCrono: '23º MEGA LEILÃO GENÉTICA ADITIVA — 1ª ETAPA (FÊMEAS NELORE PO)',
    sexo: 'FÊMEAS',
    tipo: 'Fêmeas Nelore PO — bezerras, novilhas, vacas e doadoras',
    coverSrc: 'F:\\genetica ad.jpeg',
    coverPath: 'escala-2026/2026-07-25-genetica-aditiva-1a-etapa-femeas.jpeg',
    ofertaDescricao: 'Oferta indicada na arte: bezerras, novilhas, vacas e doadoras (Fêmeas Nelore PO).',
  },
  {
    data: '2026-07-26',
    diaSemana: 'domingo',
    hora: '09:00',
    nomePublico: '23º Mega Leilão Genética Aditiva — 2ª Etapa (Touros Nelore PO)',
    nomeCrono: '23º MEGA LEILÃO GENÉTICA ADITIVA — 2ª ETAPA (TOUROS NELORE PO)',
    sexo: 'MACHOS',
    tipo: 'Touros Nelore PO — repasse e central',
    coverSrc: 'F:\\gead2.jpeg',
    coverPath: 'escala-2026/2026-07-26-genetica-aditiva-2a-etapa-touros.jpeg',
    ofertaDescricao: 'Oferta indicada na arte: touros de repasse e de central (Touros Nelore PO).',
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

for (const etapa of ETAPAS) {
  if (!existsSync(etapa.coverSrc)) {
    console.error(`Capa nao encontrada: ${etapa.coverSrc}`)
    process.exit(1)
  }
}

for (const etapa of ETAPAS) {
  console.log(`\n── ${etapa.nomeCrono} (${etapa.data}) ──`)

  const fileBytes = readFileSync(etapa.coverSrc)
  console.log(`Subindo capa (${(fileBytes.length / 1024).toFixed(1)} KB) -> leilao-covers/${etapa.coverPath}`)
  const { error: uploadError } = await supabase.storage.from('leilao-covers').upload(etapa.coverPath, fileBytes, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (uploadError) throw new Error(`UPLOAD capa: ${uploadError.message}`)

  const { data: publicUrlData } = supabase.storage.from('leilao-covers').getPublicUrl(etapa.coverPath)
  const coverUrl = publicUrlData.publicUrl
  console.log(`Capa publica: ${coverUrl}`)

  const crono = await upsertByNameDate('cronograma_leiloes', {
    data: etapa.data,
    dia_semana: etapa.diaSemana,
    hora: etapa.hora,
    nome: etapa.nomeCrono,
    criador: 'GENÉTICA ADITIVA',
    presencial: 'VIRTUAL',
    leiloeira: 'PROGRAMA LEILÕES',
    raca: 'NELORE',
    qtd_animais: null,
    sexo: etapa.sexo,
    comissao: '',
    contrato: '',
    faturamento_previsto: null,
    faturamento_realizado: null,
    venda_bula: null,
    comissao_receber: null,
    recebido: '',
    catalogo_url: null,
    img: coverUrl,
  })
  console.log(`cronograma_leiloes: ${crono.action} (id=${crono.id})`)

  const publico = await upsertByNameDate('bula_leiloes', {
    nome: etapa.nomePublico,
    data: etapa.data,
    tipo: etapa.tipo,
    local: '',
    animais: 0,
    expectativa: 0,
    meta_bula: 0,
    realizado_bula: 0,
    status: 'confirmado',
    img: coverUrl,
    horario: etapa.hora,
    transmissao: 'Canal do Criador',
    modelo: 'VIRTUAL',
    leiloeira: 'Programa Leilões',
    condicao: 'Pagamento em 30 parcelas (2+2+2+2+2+20)',
    frete_gratis: 'Sim (conforme regulamento)',
    acordo_comissao: '',
    catalogo_url: null,
    tasks: [],
    cronograma_id: crono.id,
  })
  console.log(`bula_leiloes: ${publico.action} (id=${publico.id})`)

  const agendaPayload = {
    id: randomUUID(),
    title: etapa.nomeCrono,
    description: [
      'Criador: GENÉTICA ADITIVA',
      'Leiloeira: PROGRAMA LEILÕES',
      'Raça: NELORE PO',
      `Sexo: ${etapa.sexo}`,
      etapa.ofertaDescricao,
      'Transmissão: Canal do Criador (retransmissão Lance Rural e Remate Web).',
      'Frete grátis conforme regulamento; pagamento em 30 parcelas (2+2+2+2+2+20).',
    ].join('\n'),
    event_type: 'leilao',
    status: 'planejado',
    priority: 'media',
    start_at: `${etapa.data}T${etapa.hora}:00-03:00`,
    end_at: `${etapa.data}T23:59:00-03:00`,
    all_day: false,
    location: '',
    color: '#A68B4B',
    notes: `Adicionado por ${basename(import.meta.url)} a partir da arte ${etapa.coverSrc} (pedido do Marcelo no grupo, 20/07).`,
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

console.log('\nOK — 23º Mega Leilão Genética Aditiva (1ª e 2ª etapas) incluído na agenda/admin com capas.')
