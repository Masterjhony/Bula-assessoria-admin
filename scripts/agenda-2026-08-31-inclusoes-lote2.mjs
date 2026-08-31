// Segundo lote de inclusões de 31/08/2026 — artes encaminhadas pelo Marcelo na
// DM (sessão Baileys `joao-automation`, 5531994149161) logo depois do lote 1:
//
// 12:39 — 10º LEILÃO NELORE FLOR DO ARATAÚ & CONVIDADOS, 05/09 (sábado), 12h,
//         Tatersal da Coopermar Maracajá, Novo Repartimento/PA. PRESENCIAL.
//         35 touros + 20 fêmeas Nelore PO, doadoras especiais, aspirações e
//         matriz pintada PO. Convidados: Nelore Itajaí e Nelore Galopeira.
//         Leiloeira Magnos Leilões (leiloeiro Diego Castro), transmissão ao
//         vivo no canal Magnos Leilões, assessoria GR Assessoria Pecuária.
//         O 9º (07/06/2026) já existia no banco; este é o registro do 10º.
//
// 12:45 — 2º LEILÃO PARCERIA NELORE PREMIUM, 26/09 (sábado), 12h (BSB),
//         Sindicato Rural de Redenção/PA. PRESENCIAL. Touros e fêmeas 100%
//         genotipados (ANCP, PMGZ, AVAL, Progenar). Parceria Alto Brasil
//         Agropecuária & Nelore Marcovel; leiloeira Programa Leilões;
//         transmissão Remate Web.
//
// Os dois convivem com o que já estava nas datas (TOUROS JACAMIN em 05/09 e
// NELORE ABBA em 26/09) — são leilões diferentes.
//
// ⚠ CAPA: a arte do Flor do Arataú veio em STORY 9:16 (900x1600), fora do
// padrão feed 4:5 da agenda ([[capa-agenda-formato-feed-4x5]]). Fica cadastrada
// assim para o card não nascer sem imagem, mas precisa da versão feed — igual
// ao KatiSpera (17/10). A do Nelore Premium veio 1086x1448 (3:4), dentro do
// padrão.
//
// Uso: node scripts/agenda-2026-08-31-inclusoes-lote2.mjs [--dry]

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
    data: '2026-09-05',
    dia_semana: 'sábado',
    nome: '10º LEILÃO NELORE FLOR DO ARATAÚ & CONVIDADOS',
    nomePublico: '10º Leilão Nelore Flor do Arataú & Convidados',
    hora: '12:00',
    criador: 'NELORE FLOR DO ARATAÚ',
    presencial: 'PRESENCIAL',
    local: 'NOVO REPARTIMENTO/PA',
    leiloeira: 'MAGNOS LEILÕES',
    raca: 'NELORE',
    sexo: 'MACHOS E FÊMEAS',
    qtd_animais: '35 TOUROS + 20 FÊMEAS',
    animais: 55,
    tipo: 'NELORE',
    transmissao: 'Ao vivo no canal Magnos Leilões',
    condicao: '10º Leilão Nelore Flor do Arataú & Convidados. Presencial, sábado 05/09/2026 às 12h, no '
      + 'Tatersal da Coopermar Maracajá, Novo Repartimento/PA. Oferta: 35 touros Nelore PO e 20 fêmeas '
      + 'Nelore PO, além de doadoras especiais, aspirações e matriz pintada PO. Animais avaliados, 100% RGD '
      + 'e 100% genotipados (PMGZ/ABCZ). Realização Nelore Flor do Arataú, com os convidados Nelore Itajaí e '
      + 'Nelore Galopeira; leiloeira Magnos Leilões (leiloeiro Diego Castro); transmissão ao vivo no canal '
      + 'Magnos Leilões; assessoria GR Assessoria Pecuária.',
    capa: join(root, 'outputs', 'agenda-2026-08-31', '2026-09-05-flor-do-aratau-10o-leilao-arte.jpeg'),
    capaMime: 'image/jpeg',
    path: 'escala-2026/2026-09-05-10o-leilao-nelore-flor-do-aratau-arte.jpeg',
  },
  {
    data: '2026-09-26',
    dia_semana: 'sábado',
    nome: '2º LEILÃO PARCERIA NELORE PREMIUM',
    nomePublico: '2º Leilão Parceria Nelore Premium',
    hora: '12:00',
    criador: 'ALTO BRASIL AGROPECUÁRIA & NELORE MARCOVEL',
    presencial: 'PRESENCIAL',
    local: 'REDENÇÃO/PA',
    leiloeira: 'PROGRAMA LEILÕES',
    raca: 'NELORE',
    sexo: 'MACHOS E FÊMEAS',
    qtd_animais: null,
    animais: 0,
    tipo: 'NELORE',
    transmissao: 'Remate Web',
    condicao: '2º Leilão Parceria Nelore Premium. Presencial, sábado 26/09/2026 às 12h (horário de Brasília), '
      + 'no Sindicato Rural de Redenção/PA. Touros e fêmeas 100% genotipados, com avaliações ANCP, PMGZ, AVAL '
      + 'e Progenar. Parceria Alto Brasil Agropecuária & Nelore Marcovel; leiloeira Programa Leilões; '
      + 'transmissão Remate Web.',
    capa: join(root, 'outputs', 'agenda-2026-08-31', '2026-09-26-nelore-premium-2o-leilao-parceria-arte.jpeg'),
    capaMime: 'image/jpeg',
    path: 'escala-2026/2026-09-26-2o-leilao-parceria-nelore-premium-arte.jpeg',
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

  let coverUrl = null
  const bytes = readFileSync(leilao.capa)
  if (dry) {
    console.log(`  [dry] subiria ${(bytes.length / 1024).toFixed(1)} KB -> leilao-covers/${leilao.path}`)
  } else {
    const { error } = await supabase.storage.from('leilao-covers').upload(leilao.path, bytes, {
      contentType: leilao.capaMime,
      upsert: true,
      cacheControl: '31536000',
    })
    if (error) throw new Error(`UPLOAD ${leilao.path}: ${error.message}`)
    coverUrl = supabase.storage.from('leilao-covers').getPublicUrl(leilao.path).data.publicUrl
    console.log(`  capa: ${coverUrl}`)
  }

  const { data: crono, error: cronoSelErr } = await supabase
    .from('cronograma_leiloes')
    .select('*')
    .eq('nome', leilao.nome)
    .eq('data', leilao.data)
    .maybeSingle()
  if (cronoSelErr) throw new Error(`SELECT cronograma_leiloes: ${cronoSelErr.message}`)

  const cronoId = crono?.id ?? randomUUID()
  const cronoPatch = {
    id: cronoId,
    data: leilao.data,
    nome: leilao.nome,
    dia_semana: keep(leilao.dia_semana, crono?.dia_semana),
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

  let pub = null
  for (const candidato of [leilao.nomePublico, leilao.nome]) {
    const { data, error } = await supabase
      .from('bula_leiloes')
      .select('*')
      .eq('nome', candidato)
      .eq('data', leilao.data)
      .maybeSingle()
    if (error) throw new Error(`SELECT bula_leiloes: ${error.message}`)
    if (data) { pub = data; break }
  }

  const pubPatch = {
    id: pub?.id ?? randomUUID(),
    nome: pub?.nome || leilao.nomePublico,
    data: leilao.data,
    tipo: pub?.tipo && pub.tipo !== 'Leilao' ? pub.tipo : leilao.tipo,
    local: keep(leilao.local, pub?.local) ?? '',
    animais: Number(pub?.animais) || leilao.animais || 0,
    status: pub?.status || 'confirmado',
    horario: keep(leilao.hora, pub?.horario) ?? '',
    modelo: keep(leilao.presencial, pub?.modelo) ?? '',
    leiloeira: keep(leilao.leiloeira, pub?.leiloeira) ?? '',
    transmissao: keep(leilao.transmissao, pub?.transmissao) ?? '',
    condicao: keep(leilao.condicao, pub?.condicao) ?? '',
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

  const horaEvento = cronoPatch.hora || '09:00'
  const startAt = `${leilao.data}T${horaEvento}:00-03:00`
  const detalhes = [
    cronoPatch.criador ? `Criador: ${cronoPatch.criador}` : '',
    cronoPatch.leiloeira ? `Leiloeira: ${cronoPatch.leiloeira}` : '',
    pubPatch.local ? `Local: ${pubPatch.local}` : '',
    cronoPatch.raca ? `Raca: ${cronoPatch.raca}` : '',
    cronoPatch.sexo ? `Sexo: ${cronoPatch.sexo}` : '',
    pubPatch.transmissao ? `Transmissao: ${pubPatch.transmissao}` : '',
  ].filter(Boolean).join('\n')

  const evento = {
    title: pubPatch.nome,
    description: detalhes,
    event_type: 'leilao',
    status: 'planejado',
    priority: 'media',
    start_at: startAt,
    end_at: cronoPatch.hora ? new Date(new Date(startAt).getTime() + 2 * 60 * 60 * 1000).toISOString() : null,
    all_day: !cronoPatch.hora,
    location: pubPatch.local || cronoPatch.presencial || null,
    color: '#A68B4B',
    notes: 'Cadastrado a partir da arte oficial em 31/08/2026, a pedido do Marcelo no WhatsApp '
      + '(scripts/agenda-2026-08-31-inclusoes-lote2.mjs).',
    linked_leilao_id: cronoId,
  }

  if (dry) {
    console.log(`  [dry] agenda_events: substituiria o evento de ${cronoId} -> ${startAt}`)
  } else {
    await supabase.from('agenda_events').delete().eq('linked_leilao_id', cronoId)
    const { error } = await supabase.from('agenda_events').insert(evento)
    if (error) throw new Error(`INSERT agenda_events: ${error.message}`)
    console.log(`  agenda_events: evento recriado (${startAt})`)
  }
}

console.log('\nOK — lote 2 de 31/08 processado.')
