// Adiciona à agenda as 4 capas de leilão recebidas em 24/08/2026 (pasta F:\).
//
// Três já existiam no cronograma como esqueleto vindo da ESCALA (só data +
// dia da semana): TOUROS JACAMIN (05/09), REPRODUTORES NELORE AZ (12/09) e
// NELORE ABBA (26/09). Para essas, o script só ENRIQUECE os campos vazios e
// sobe a capa — o nome NÃO é tocado, porque o pareamento do sync-escala é por
// nome+data e renomear quebraria o match.
//
// A quarta (LEILÃO NELORE ASJ & CONVIDADOS ESPECIAIS, 30/08) não existe em
// lugar nenhum: é criada nas três tabelas (cronograma_leiloes, bula_leiloes,
// agenda_events). ATENÇÃO: como ela não está na planilha ESCALA, o próximo
// `node scripts/sync-escala-leiloes-2026.mjs` a APAGA como "extra no banco".
// Ou ela entra na ESCALA, ou o sync precisa rodar com --keep-extras.
//
// Uso: node scripts/adiciona-capas-agenda-2026-08-24.mjs [--dry]

import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const dry = process.argv.includes('--dry')
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

const LEILOES = [
  {
    // NOVO — não está na ESCALA.
    novo: true,
    data: '2026-08-30',
    nome: 'LEILÃO NELORE ASJ & CONVIDADOS ESPECIAIS',
    dia_semana: 'domingo',
    hora: '12:00',
    criador: 'AGROPECUÁRIA SÃO JOSÉ',
    presencial: 'PRESENCIAL',
    local: 'HARAS MUCURI',
    leiloeira: 'PROGRAMA LEILÕES',
    raca: 'NELORE',
    sexo: 'MACHOS E FÊMEAS',
    qtd_animais: null,
    animais: 0,
    transmissao: 'Remate Web (homologação Leilão&Shopping, chancela Pró-Genética)',
    condicao: 'Presencial com os animais no Haras Mucuri. Touros e fêmeas genotipados: novilhas prenhes, bezerras e matrizes paridas e prenhes.',
    capa: 'F:\\WhatsApp Image 2026-08-24 at 12.01.15.jpeg',
    path: 'escala-2026/2026-08-30-leilao-nelore-asj-convidados-especiais-arte-oficial.jpeg',
  },
  {
    // Existe como esqueleto: "TOUROS JACAMIN" (05/09). Nome preservado.
    data: '2026-09-05',
    nome: 'TOUROS JACAMIN',
    hora: '12:00',
    criador: 'FAZENDA JACAMIM',
    presencial: 'PRESENCIAL',
    local: 'NOVA MUTUM/MT',
    leiloeira: 'PROGRAMA LEILÕES',
    raca: 'NELORE',
    sexo: 'MACHOS',
    qtd_animais: null,
    animais: 0,
    transmissao: 'Canal Rural (retransmissão Lance Rural e Remate Web)',
    condicao: '10º Leilão Especial Touros — reprodutores Nelore PO, todos com RGD, 100% genotipados (PMGZ, ANCP, GenePlus, Aval). Homologado Leilão&Shopping, chancela Pró-Genética.',
    capa: 'F:\\WhatsApp Image 2026-08-23 at 00.21.17.jpeg',
    path: 'escala-2026/2026-09-05-touros-jacamim-10o-especial-touros-arte-oficial.jpeg',
  },
  {
    // Existe como esqueleto: "REPRODUTORES NELORE AZ" (12/09). Nome preservado.
    // A arte anuncia 13h no horário de Mato Grosso (UTC-4) = 14h de Brasília,
    // que é o fuso em que o resto da agenda está gravado.
    data: '2026-09-12',
    nome: 'REPRODUTORES NELORE AZ',
    hora: '14:00',
    criador: 'NELORE AZ',
    presencial: 'VIRTUAL',
    local: 'VIRTUAL',
    leiloeira: 'RICARDO NICOLAU LEILÕES',
    raca: 'NELORE',
    sexo: 'MACHOS',
    qtd_animais: null,
    animais: 0,
    transmissao: 'AgroCanal (SKY 554 HD) e pelo app',
    condicao: 'Leilão virtual. Início às 13h no horário de Mato Grosso (14h de Brasília). Avaliação PMGZ, DGT Brasil, GenePlus e ANCP. Assessoria técnica Prospere (Diego Gil). Membro Confraria da Carcaça Nelore.',
    capa: 'F:\\WhatsApp Image 2026-08-23 at 00.21.50.jpeg',
    path: 'escala-2026/2026-09-12-leilao-virtual-nelore-az-arte-oficial.jpeg',
  },
  {
    // Existe como esqueleto: "NELORE ABBA" (26/09). Nome preservado.
    // A arte não informa modalidade nem local — presencial/modelo ficam como
    // estão no banco (vazio) em vez de chutar.
    data: '2026-09-26',
    nome: 'NELORE ABBA',
    hora: '12:00',
    criador: 'ABBA NELORE',
    presencial: null,
    local: null,
    leiloeira: 'CONNECT LEILÕES',
    raca: 'NELORE',
    sexo: 'MACHOS E FÊMEAS',
    qtd_animais: '120 ANIMAIS GENOTIPADOS',
    animais: 120,
    transmissao: 'AgroCanal',
    condicao: '1º Leilão Nelore ABBA — "A primeira batida do martelo". 120 animais genotipados: aspirações, matrizes, novilhas, bezerras e touros PO. Avaliação ANCP, PMGZ, GenePlus, DGT Brasil e Ponta. Seguro Leilão Protegido (Denner).',
    capa: 'F:\\WhatsApp Image 2026-08-23 at 00.23.27.jpeg',
    path: 'escala-2026/2026-09-26-1o-leilao-nelore-abba-arte-oficial.jpeg',
  },
]

// Só grava onde o banco está vazio: edição manual anterior sempre vence.
const keep = (novo, atual) => {
  if (atual != null && String(atual).trim() !== '') return atual
  return novo
}

for (const leilao of LEILOES) {
  console.log(`\n=== ${leilao.data} — ${leilao.nome} ===`)

  if (!existsSync(leilao.capa)) {
    console.error(`  !! capa nao encontrada: ${leilao.capa} — pulando`)
    continue
  }

  const bytes = readFileSync(leilao.capa)
  let coverUrl = null
  if (dry) {
    console.log(`  [dry] subiria ${(bytes.length / 1024).toFixed(1)} KB -> leilao-covers/${leilao.path}`)
  } else {
    const { error } = await supabase.storage.from('leilao-covers').upload(leilao.path, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
      cacheControl: '31536000',
    })
    if (error) throw new Error(`UPLOAD ${leilao.path}: ${error.message}`)
    coverUrl = supabase.storage.from('leilao-covers').getPublicUrl(leilao.path).data.publicUrl
    console.log(`  capa: ${coverUrl}`)
  }

  // ── cronograma_leiloes ──────────────────────────────────────
  const { data: crono, error: cronoSelErr } = await supabase
    .from('cronograma_leiloes')
    .select('*')
    .eq('nome', leilao.nome)
    .eq('data', leilao.data)
    .maybeSingle()
  if (cronoSelErr) throw new Error(`SELECT cronograma_leiloes: ${cronoSelErr.message}`)

  if (!crono && !leilao.novo) {
    console.error('  !! esperava encontrar em cronograma_leiloes e nao achei — pulando')
    continue
  }

  const cronoId = crono?.id ?? randomUUID()
  const cronoPatch = {
    id: cronoId,
    data: leilao.data,
    nome: leilao.nome,
    dia_semana: keep(leilao.dia_semana ?? null, crono?.dia_semana),
    hora: keep(leilao.hora, crono?.hora),
    criador: keep(leilao.criador, crono?.criador),
    presencial: keep(leilao.presencial, crono?.presencial),
    leiloeira: keep(leilao.leiloeira, crono?.leiloeira),
    raca: keep(leilao.raca, crono?.raca),
    qtd_animais: keep(leilao.qtd_animais, crono?.qtd_animais),
    sexo: keep(leilao.sexo, crono?.sexo),
    img: coverUrl ?? crono?.img ?? null,
  }
  if (dry) {
    console.log(`  [dry] cronograma_leiloes ${crono ? 'UPDATE' : 'INSERT'}:`, JSON.stringify(cronoPatch))
  } else {
    const { error } = await supabase.from('cronograma_leiloes').upsert(cronoPatch, { onConflict: 'id' })
    if (error) throw new Error(`UPSERT cronograma_leiloes: ${error.message}`)
    console.log(`  cronograma_leiloes: ${crono ? 'atualizado' : 'criado'} (${cronoId})`)
  }

  // ── bula_leiloes (a agenda publica le daqui) ────────────────
  const { data: pub, error: pubSelErr } = await supabase
    .from('bula_leiloes')
    .select('*')
    .eq('nome', leilao.nome)
    .eq('data', leilao.data)
    .maybeSingle()
  if (pubSelErr) throw new Error(`SELECT bula_leiloes: ${pubSelErr.message}`)

  const pubPatch = {
    id: pub?.id ?? randomUUID(),
    nome: leilao.nome,
    data: leilao.data,
    tipo: pub?.tipo && pub.tipo !== 'Leilao' ? pub.tipo : leilao.raca,
    local: keep(leilao.local ?? '', pub?.local) ?? '',
    animais: Number(pub?.animais) || leilao.animais,
    status: pub?.status || 'confirmado',
    horario: keep(leilao.hora, pub?.horario),
    modelo: keep(leilao.presencial ?? '', pub?.modelo) ?? '',
    leiloeira: keep(leilao.leiloeira, pub?.leiloeira),
    transmissao: keep(leilao.transmissao, pub?.transmissao),
    condicao: keep(leilao.condicao, pub?.condicao),
    img: coverUrl ?? pub?.img ?? '',
    cronograma_id: cronoId,
  }
  if (dry) {
    console.log(`  [dry] bula_leiloes ${pub ? 'UPDATE' : 'INSERT'}:`, JSON.stringify(pubPatch))
  } else {
    const { error } = await supabase.from('bula_leiloes').upsert(pubPatch, { onConflict: 'id' })
    if (error) throw new Error(`UPSERT bula_leiloes: ${error.message}`)
    console.log(`  bula_leiloes: ${pub ? 'atualizado' : 'criado'} (${pubPatch.id})`)
  }

  // ── agenda_events (agenda interna) ──────────────────────────
  const startAt = `${leilao.data}T${cronoPatch.hora || '09:00'}:00-03:00`
  const endAt = new Date(new Date(startAt).getTime() + 2 * 60 * 60 * 1000).toISOString()
  const detalhes = [
    cronoPatch.criador ? `Criador: ${cronoPatch.criador}` : '',
    cronoPatch.leiloeira ? `Leiloeira: ${cronoPatch.leiloeira}` : '',
    cronoPatch.raca ? `Raca: ${cronoPatch.raca}` : '',
    cronoPatch.qtd_animais ? `Qtd.: ${cronoPatch.qtd_animais}` : '',
    cronoPatch.sexo ? `Sexo: ${cronoPatch.sexo}` : '',
    leilao.transmissao ? `Transmissao: ${leilao.transmissao}` : '',
  ].filter(Boolean).join('\n')

  const evento = {
    title: leilao.nome,
    description: detalhes,
    event_type: 'leilao',
    status: 'planejado',
    priority: 'media',
    start_at: startAt,
    end_at: endAt,
    all_day: false,
    location: cronoPatch.presencial || leilao.local || cronoPatch.leiloeira || null,
    color: '#A68B4B',
    notes: 'Cadastrado a partir da arte oficial recebida em 24/08/2026 (scripts/adiciona-capas-agenda-2026-08-24.mjs).',
    linked_leilao_id: cronoId,
  }

  if (dry) {
    console.log(`  [dry] agenda_events: substituiria o evento de ${cronoId}`)
  } else {
    await supabase.from('agenda_events').delete().eq('linked_leilao_id', cronoId)
    const { error } = await supabase.from('agenda_events').insert(evento)
    if (error) throw new Error(`INSERT agenda_events: ${error.message}`)
    console.log(`  agenda_events: evento recriado (${startAt})`)
  }
}

console.log('\nOK — 4 capas processadas.')
if (!dry) {
  console.log('\nLEMBRETE: LEILAO NELORE ASJ (30/08) nao esta na planilha ESCALA.')
  console.log('O proximo sync-escala-leiloes-2026.mjs vai apaga-lo como "extra no banco".')
}
