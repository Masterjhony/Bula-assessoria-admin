// Artes baixadas em 25/08/2026 (pasta F:\).
//
// 1) 7º LEILÃO MEGA PREMIUM EAO — edição virtual, 13 a 15/09. Os três dias JÁ
//    estavam na agenda como esqueleto (só data e dia da semana). A arte enfim
//    dá horário, leiloeira, modalidade, transmissão e capa:
//      13/09 09h  touros, bezerras e matrizes
//      14/09 20h  matrizes e bezerras
//      15/09 20h  aspirações EAO e convidados
//    Os nomes NÃO são tocados: o de 13/09 no banco é "TOUROS E MATRIZES EAO" e
//    a arte diz "TOUROS, BEZERRAS E MATRIZES", mas renomear quebraria o
//    pareamento por nome+data que o relatório mensal e o fechamento usam. O
//    nome oficial do evento fica registrado na condicao.
//
// 2) LEILÃO PINTADO BRASIL 2026 — 08 a 11/10, Campo Grande/MS. Novo.
//    Entra como UM registro, no dia de abertura: a arte anuncia o evento de
//    quatro dias mas não diz que há pregão em cada um deles nem informa
//    horário — diferente da arte do EAO, que quebra dia a dia. Inventar quatro
//    leilões a partir disso seria inventar informação. A janela inteira fica na
//    condicao. Se houver pregão por dia, é desdobrar depois.
//
// A terceira imagem baixada (EXPOAMA, 15 a 20/09 em Marabá/PA) NÃO é leilão:
// é convite pra visitar o estande do Zebu do Brasil / Naviraí durante a feira.
// Não vira registro de leilão aqui.
//
// Uso: node scripts/agenda-2026-08-25.mjs [--dry]

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

const CAPA_EAO = 'F:\\WhatsApp Image 2026-08-25 at 09.02.07.jpeg'
const PATH_EAO = 'escala-2026/2026-09-13-7o-mega-premium-eao-virtual-arte-oficial.jpeg'
const TRANSM_EAO = 'Canal Rural e Lance Rural (retransmissão Remate Web, Agreste Estúdio e CTV)'
const LEILOEIRA_EAO = 'PROGRAMA LEILÕES / CENTRAL LEILÕES'
const RODAPE_EAO = 'Chancelado Pró-Genética; avaliação PMGZ, ANCP, Embrapa e GenePlus; '
  + 'apoio Agreste Leilões Rurais e Leilões & Agronegócios; seguro Leilão Protegido.'

const LEILOES = [
  // ── 7º Mega Premium EAO: enriquece o que ja existe ────────────
  {
    modo: 'enriquecer',
    data: '2026-09-13',
    nome: 'TOUROS E MATRIZES EAO',
    hora: '09:00',
    criador: 'EAO',
    presencial: 'VIRTUAL',
    local: 'VIRTUAL',
    leiloeira: LEILOEIRA_EAO,
    raca: 'NELORE',
    sexo: 'MACHOS E FÊMEAS',
    qtd_animais: null,
    transmissao: TRANSM_EAO,
    condicao: '7º Leilão Mega Premium EAO — edição virtual. 1º dia (13/09, 9h): touros, bezerras e matrizes. '
      + RODAPE_EAO,
    capa: CAPA_EAO,
    capaMime: 'image/jpeg',
    path: PATH_EAO,
  },
  {
    modo: 'enriquecer',
    data: '2026-09-14',
    nome: 'MATRIZES E BEZERRAS',
    hora: '20:00',
    criador: 'EAO',
    presencial: 'VIRTUAL',
    local: 'VIRTUAL',
    leiloeira: LEILOEIRA_EAO,
    raca: 'NELORE',
    sexo: 'FÊMEAS',
    qtd_animais: null,
    transmissao: TRANSM_EAO,
    condicao: '7º Leilão Mega Premium EAO — edição virtual. 2º dia (14/09, 20h): matrizes e bezerras. '
      + RODAPE_EAO,
    capa: CAPA_EAO,
    capaMime: 'image/jpeg',
    path: PATH_EAO,
  },
  {
    modo: 'enriquecer',
    data: '2026-09-15',
    nome: 'ASPIRAÇÕES EAO E CONVIDADOS',
    hora: '20:00',
    criador: 'EAO',
    presencial: 'VIRTUAL',
    local: 'VIRTUAL',
    leiloeira: LEILOEIRA_EAO,
    raca: 'NELORE',
    sexo: 'FÊMEAS',
    qtd_animais: null,
    transmissao: TRANSM_EAO,
    condicao: '7º Leilão Mega Premium EAO — edição virtual. 3º dia (15/09, 20h): aspirações EAO e convidados. '
      + RODAPE_EAO,
    capa: CAPA_EAO,
    capaMime: 'image/jpeg',
    path: PATH_EAO,
  },
  // ── Pintado Brasil: novo ──────────────────────────────────────
  {
    modo: 'criar',
    data: '2026-10-08',
    dia_semana: 'quinta-feira',
    nome: 'LEILÃO PINTADO BRASIL 2026',
    hora: null,
    criador: 'SÃO LOURENÇO',
    presencial: 'PRESENCIAL',
    local: 'CAMPO GRANDE/MS',
    leiloeira: 'PROGRAMA LEILÕES',
    raca: 'NELORE PINTADO',
    sexo: null,
    qtd_animais: null,
    transmissao: 'Canal Rural (retransmissão Remate Web e Lance Rural)',
    condicao: 'Evento de 08 a 11 de outubro de 2026, em Campo Grande/MS — "onde a raça e a excelência se encontram". '
      + 'Realização São Lourenço (Geraldo de Souza Carvalho Jr). Leilão oficial Nelore, vídeos FV5. '
      + 'A arte não informa horário nem se há pregão em cada um dos quatro dias, por isso está cadastrado '
      + 'como um registro no dia de abertura.',
    capa: 'F:\\WhatsApp Image 2026-08-24 at 22.40.16.jpeg',
    capaMime: 'image/jpeg',
    path: 'escala-2026/2026-10-08-leilao-pintado-brasil-2026-arte.jpeg',
  },
]

// Só grava onde o banco está vazio: edição manual anterior sempre vence.
const keep = (novo, atual) => {
  if (atual != null && String(atual).trim() !== '') return atual
  return novo
}

const capasSubidas = new Map()

for (const leilao of LEILOES) {
  console.log(`\n=== ${leilao.data} — ${leilao.nome} ===`)

  if (!existsSync(leilao.capa)) {
    console.error(`  !! capa nao encontrada: ${leilao.capa} — pulando`)
    continue
  }

  // A arte do EAO serve os tres dias: sobe uma vez so e reaproveita a URL.
  let coverUrl = capasSubidas.get(leilao.path) ?? null
  if (!coverUrl) {
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
      capasSubidas.set(leilao.path, coverUrl)
      console.log(`  capa: ${coverUrl}`)
    }
  } else {
    console.log('  capa: reaproveitada (mesma arte do dia anterior)')
  }

  const { data: crono, error: cronoSelErr } = await supabase
    .from('cronograma_leiloes')
    .select('*')
    .eq('nome', leilao.nome)
    .eq('data', leilao.data)
    .maybeSingle()
  if (cronoSelErr) throw new Error(`SELECT cronograma_leiloes: ${cronoSelErr.message}`)

  if (leilao.modo === 'enriquecer' && !crono) {
    console.error('  !! esperava encontrar em cronograma_leiloes e nao achei — pulando')
    continue
  }
  if (leilao.modo === 'criar' && crono) {
    console.log(`  ja existe em cronograma_leiloes (${crono.id}) — pulando`)
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
    animais: Number(pub?.animais) || 0,
    status: pub?.status || 'confirmado',
    horario: keep(leilao.hora, pub?.horario) ?? '',
    modelo: keep(leilao.presencial ?? '', pub?.modelo) ?? '',
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

  // Sem hora na fonte, o evento cai as 09:00 e fica como dia inteiro, mesma
  // convencao do sync-escala.
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
    title: leilao.nome,
    description: detalhes,
    event_type: 'leilao',
    status: 'planejado',
    priority: 'media',
    start_at: startAt,
    end_at: cronoPatch.hora ? new Date(new Date(startAt).getTime() + 2 * 60 * 60 * 1000).toISOString() : null,
    all_day: !cronoPatch.hora,
    location: pubPatch.local || cronoPatch.presencial || null,
    color: '#A68B4B',
    notes: 'Cadastrado a partir da arte oficial em 25/08/2026 (scripts/agenda-2026-08-25.mjs).',
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

console.log('\nOK — lote de 25/08 processado.')
