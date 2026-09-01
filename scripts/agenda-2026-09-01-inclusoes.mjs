// Inclusões de 01/09/2026 — dois pedidos que chegaram no mesmo dia.
//
// (A) 2º LEILÃO GENÉTICA CAMPARINO — 27/09, cartaz que o João baixou
//     (F:\WhatsApp Image 2026-09-01 at 13.36.31.jpeg, salvo em
//     outputs/agenda-2026-09-01/2026-09-27-2o-leilao-genetica-camparino-arte.jpeg).
//     Arte 1284x1600 (0,802) — feed 4:5, dentro do padrão ([[capa-agenda-formato-feed-4x5]]).
//     Tudo abaixo sai LIDO DA ARTE: domingo 10h (Brasília), leiloeira EB Leilões,
//     transmissão Terraviva, retransmissão EBweb/YouTube, oferta de reprodutores
//     (Nelore, Nelore Mocho, Sindi e Gir) e fêmeas (Nelore e Nelore Mocho).
//     A arte NÃO traz cidade/UF nem diz se é presencial ou virtual — `local` e
//     `presencial` ficam VAZIOS de propósito. Não inventar.
//
// (B) Os cinco leilões que o Marcelo mandou no grupo (01/09, 09:39), depois da
//     reunião com o Felipe Mota: "os que conseguiremos atender com qualidade",
//     com o pedido "favor colocar na nossa agenda oficial".
//       03/09 — 14 Touros Nelore Crispim
//       15/09 — 40 Touros Nelore Buriti
//       17/09 — 30 Fêmeas Nelore Buriti
//       19/09 — 40 touros Barra do Dia
//       24/09 — 30 Fêmeas FB Agro
//     Dessa mensagem só saem data, oferta e criatório. NÃO há arte, horário,
//     leiloeira, cidade nem modalidade — todos esses campos ficam VAZIOS, para
//     serem preenchidos quando o cartaz chegar. O card da agenda sem `img` cai
//     no fallback de marca (logo Bula + dia em dourado, mesmo aspect 4:5), então
//     entrar sem capa não entorta a grade.
//
// Nenhum dos seis existia em `cronograma_leiloes` nem em `bula_leiloes` — conferido
// por data e por nome antes de escrever ([[agenda-publica-janela-d60]]: consultar
// as tabelas antes de tratar "faltando" como inclusão).
//
// Convivência de data conferida: 19/09 já tem o 2º DIA - BC AGROFEIRA FAZENDA
// RECANTO e 27/09 já tem PARANÃ TOUROS e o PRIMAVERA GENÉTICA ADITIVA - FÊMEAS.
// São leilões diferentes e convivem na data, como o 20/09 já faz.
//
// ⚠ Duas grafias de criador para o João confirmar (afetam a vitrine de criatórios
// parceiros, que agrupa por `criador`):
//   - GENÉTICA CAMPARINO x FAZENDA CAMPARINO (os 4 leilões Camparino de 2026 estão
//     como FAZENDA CAMPARINO / NAVIRAÍ E CAMPARINO, e são pela Programa Leilões —
//     este é pela EB Leilões);
//   - FB AGRO x FAZENDA BELA ROSA (o 2º LEILÃO VIRTUAL FB AGRO de 02/04 está como
//     FAZENDA BELA ROSA).
// Ficou o literal da fonte. Se for o mesmo criatório, é um UPDATE de uma coluna.
//
// Uso: node scripts/agenda-2026-09-01-inclusoes.mjs [--dry]

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

// ⚠ `condicao` é campo PÚBLICO — sai no card da agenda e na página do leilão.
// A primeira versão deste script gravava aqui a procedência ("lista passada pelo
// Marcelo... horário e leiloeira entram quando o cartaz for divulgado") e o Marcelo
// mandou tirar no mesmo dia, 15:19: "Tira essas escritas, deixa só o restante".
// Nota de procedência e ressalva de cadastro ficam no comentário do script e no
// `notes` do `agenda_events`, que é interno. Limpeza: agenda-2026-09-01-limpa-metatexto.mjs.
const ORIGEM_MARCELO = ''

const LEILOES = [
  // (A) — cartaz na mão, cadastro completo.
  {
    data: '2026-09-27',
    dia_semana: 'domingo',
    nome: '2º LEILÃO GENÉTICA CAMPARINO',
    nomePublico: '2º Leilão Genética Camparino',
    hora: '10:00',
    criador: 'GENÉTICA CAMPARINO',
    presencial: null,
    local: null,
    leiloeira: 'EB LEILÕES',
    raca: 'NELORE, NELORE MOCHO, SINDI E GIR',
    sexo: 'MACHOS E FÊMEAS',
    qtd_animais: null,
    animais: 0,
    tipo: 'NELORE',
    transmissao: 'Terraviva (retransmissão EBweb e YouTube @ebleiloes)',
    condicao: '2º Leilão Genética Camparino — "O legado continua!". Domingo, 27/09/2026, às 10h (horário de '
      + 'Brasília). Oferta de reprodutores Nelore, Nelore Mocho, Sindi e Gir e de fêmeas Nelore e Nelore Mocho. '
      + 'Leiloeira EB Leilões; transmissão Terraviva, com retransmissão EBweb e YouTube @ebleiloes. Leilão '
      + 'oficial Pró-Genética e Leilão & Shopping homologados. Assessoria Melhorar+, Carvalho e Bula '
      + 'Assessoria Pecuária; animais segurados pelo Leilão Protegido; vídeos FV5; patrocínio Vitasal.',
    capa: join(root, 'outputs', 'agenda-2026-09-01', '2026-09-27-2o-leilao-genetica-camparino-arte.jpeg'),
    capaMime: 'image/jpeg',
    path: 'escala-2026/2026-09-27-2o-leilao-genetica-camparino-arte.jpeg',
  },

  // (B) — lista do Marcelo. Sem arte: só data, oferta e criatório.
  {
    data: '2026-09-03',
    dia_semana: 'quinta-feira',
    nome: 'TOUROS NELORE CRISPIM',
    nomePublico: 'Touros Nelore Crispim',
    hora: null,
    criador: 'NELORE CRISPIM',
    presencial: null,
    local: null,
    leiloeira: null,
    raca: 'NELORE',
    sexo: 'MACHOS',
    qtd_animais: '14 TOUROS',
    animais: 14,
    tipo: 'NELORE',
    transmissao: null,
    condicao: ORIGEM_MARCELO,
    capa: null,
  },
  {
    data: '2026-09-15',
    dia_semana: 'terça-feira',
    nome: 'TOUROS NELORE BURITI',
    nomePublico: 'Touros Nelore Buriti',
    hora: null,
    criador: 'NELORE BURITI',
    presencial: null,
    local: null,
    leiloeira: null,
    raca: 'NELORE',
    sexo: 'MACHOS',
    qtd_animais: '40 TOUROS',
    animais: 40,
    tipo: 'NELORE',
    transmissao: null,
    condicao: ORIGEM_MARCELO,
    capa: null,
  },
  {
    data: '2026-09-17',
    dia_semana: 'quinta-feira',
    nome: 'FÊMEAS NELORE BURITI',
    nomePublico: 'Fêmeas Nelore Buriti',
    hora: null,
    criador: 'NELORE BURITI',
    presencial: null,
    local: null,
    leiloeira: null,
    raca: 'NELORE',
    sexo: 'FÊMEAS',
    qtd_animais: '30 FÊMEAS',
    animais: 30,
    tipo: 'NELORE',
    transmissao: null,
    condicao: ORIGEM_MARCELO,
    capa: null,
  },
  {
    data: '2026-09-19',
    dia_semana: 'sábado',
    nome: 'TOUROS BARRA DO DIA',
    nomePublico: 'Touros Barra do Dia',
    hora: null,
    criador: 'NELORE BARRA DO DIA',
    presencial: null,
    local: null,
    leiloeira: null,
    raca: 'NELORE',
    sexo: 'MACHOS',
    qtd_animais: '40 TOUROS',
    animais: 40,
    tipo: 'NELORE',
    transmissao: null,
    condicao: ORIGEM_MARCELO,
    capa: null,
  },
  {
    data: '2026-09-24',
    dia_semana: 'quinta-feira',
    nome: 'FÊMEAS FB AGRO',
    nomePublico: 'Fêmeas FB Agro',
    hora: null,
    criador: 'FB AGRO',
    presencial: null,
    local: null,
    leiloeira: null,
    raca: 'NELORE',
    sexo: 'FÊMEAS',
    qtd_animais: '30 FÊMEAS',
    animais: 30,
    tipo: 'NELORE',
    transmissao: null,
    condicao: ORIGEM_MARCELO,
    capa: null,
  },
]

// Só grava onde o banco está vazio: edição manual anterior sempre vence.
const keep = (novo, atual) => {
  if (atual != null && String(atual).trim() !== '') return atual
  return novo
}

for (const leilao of LEILOES) {
  console.log(`\n=== ${leilao.data} — ${leilao.nome} ===`)

  let coverUrl = null
  if (leilao.capa) {
    if (!existsSync(leilao.capa)) {
      console.error(`  !! capa nao encontrada: ${leilao.capa} — pulando`)
      continue
    }
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
  } else {
    console.log('  sem arte ainda — card entra no fallback de marca da agenda')
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
    cronoPatch.qtd_animais ? `Qtd.: ${cronoPatch.qtd_animais}` : '',
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
    notes: leilao.capa
      ? 'Cadastrado a partir da arte oficial em 01/09/2026 (scripts/agenda-2026-09-01-inclusoes.mjs).'
      : 'Cadastrado em 01/09/2026 a partir da lista do Marcelo no grupo — sem arte ainda '
        + '(scripts/agenda-2026-09-01-inclusoes.mjs).',
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

console.log('\nOK — inclusoes de 01/09 processadas.')
