// Segunda leva de 01/09/2026 — os cartazes chegaram para dois dos cinco leilões
// que tinham entrado só com data e oferta (scripts/agenda-2026-09-01-inclusoes.mjs).
//
// Diferente do script de inclusão, aqui a arte SOBRESCREVE o que estava no banco:
// os cards foram criados a partir da lista do Marcelo no grupo e o cartaz é a fonte
// mais forte — inclusive para o nome e para a identidade do leilão.
//
// (1) 15/09 — TOUROS NELORE BURITI  ->  LEILÃO GERAÇÃO ELITE
//     "Nelore Buriti apresenta: Leilão Geração Elite — o legado da seleção encontra
//     uma nova geração." 15 de setembro, 19h00. Plataforma e-rural, oferecimento
//     erural pay, assessoria Bula, transmissão erural.net e YouTube @erural_br.
//     Mesmo criatório e mesma data da lista do Marcelo — só ganhou nome de cartaz,
//     horário e leiloeira. A oferta (40 touros) continua vindo da lista dele; o
//     cartaz não traz quantidade.
//     Arte 1080x1350 (0,800) — feed 4:5.
//
// (2) 17/09 — FÊMEAS NELORE BURITI  ->  1º LEILÃO FAZENDA BELA AURORA
//     ⚠ TROCA DE IDENTIDADE, não é só renomear. A lista do Marcelo dizia "30 Fêmeas
//     Nelore Buriti" no dia 17, mas o cartaz desse dia é do NELORE BELA AURORA:
//     "1º Leilão Fazenda Bela Aurora — onde nasce uma bela genética. Fêmeas Nelore
//     P.O.", 17 de setembro às 19h, mesma estrutura e-rural/Bula. O João confirmou
//     ao mandar a arte: "17 tava fêmeas bambu eu acho, mas é esse Aurora".
//     Por isso `criador` sai de NELORE BURITI para NELORE BELA AURORA. A quantidade
//     (30 fêmeas) fica: é o que o Marcelo listou para atender NAQUELE DIA, e o dia
//     não mudou. O cartaz não traz quantidade.
//     Arte 1080x1440 (0,750) — dentro da faixa de feed, o card usa object-contain.
//
// `presencial`/`modelo` continuam VAZIOS nos dois: o rodapé traz plataforma e
// transmissão e-rural, mas nenhum dos cartazes escreve "virtual" nem dá endereço.
// Mesmo critério do Camparino. Não inventar — é um clique no admin depois.
//
// Falta ainda a arte do 2º LEILÃO NELORE CRISPIM (03/09): ela aparece no print que
// o João mandou, mas o arquivo não foi parar na pasta de downloads — só as duas
// daqui. Esse card segue sem capa até o arquivo chegar.
//
// Uso: node scripts/agenda-2026-09-01-artes-erural.mjs [--dry]

import { existsSync, readFileSync } from 'node:fs'
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

const TRANSMISSAO_ERURAL = 'erural.net e YouTube @erural_br'

const ATUALIZACOES = [
  {
    data: '2026-09-15',
    // Como o card ainda está com o nome provisório, é por ele que se acha o par.
    nomeAtual: 'TOUROS NELORE BURITI',
    nomePublicoAtual: 'Touros Nelore Buriti',

    nome: 'LEILÃO GERAÇÃO ELITE',
    nomePublico: 'Leilão Geração Elite',
    hora: '19:00',
    criador: 'NELORE BURITI',
    leiloeira: 'E-RURAL',
    raca: 'NELORE',
    sexo: 'MACHOS',
    qtd_animais: '40 TOUROS',
    animais: 40,
    tipo: 'NELORE',
    transmissao: TRANSMISSAO_ERURAL,
    condicao: 'Leilão Geração Elite — "o legado da seleção encontra uma nova geração". Terça-feira, '
      + '15/09/2026, às 19h. Realização Nelore Buriti; oferta de 40 touros. Plataforma e-rural, com '
      + 'oferecimento erural pay e assessoria da Bula Assessoria Pecuária. Transmissão em erural.net e no '
      + 'YouTube @erural_br. Comercial e-rural (16) 99742-0031.',
    capa: join(root, 'outputs', 'agenda-2026-09-01', '2026-09-15-leilao-geracao-elite-nelore-buriti-arte.jpeg'),
    capaMime: 'image/jpeg',
    path: 'escala-2026/2026-09-15-leilao-geracao-elite-nelore-buriti-arte.jpeg',
  },
  {
    data: '2026-09-17',
    nomeAtual: 'FÊMEAS NELORE BURITI',
    nomePublicoAtual: 'Fêmeas Nelore Buriti',

    nome: '1º LEILÃO FAZENDA BELA AURORA',
    nomePublico: '1º Leilão Fazenda Bela Aurora',
    hora: '19:00',
    criador: 'NELORE BELA AURORA',
    leiloeira: 'E-RURAL',
    raca: 'NELORE P.O.',
    sexo: 'FÊMEAS',
    qtd_animais: '30 FÊMEAS',
    animais: 30,
    tipo: 'NELORE',
    transmissao: TRANSMISSAO_ERURAL,
    condicao: '1º Leilão Fazenda Bela Aurora — "onde nasce uma bela genética". Quinta-feira, 17/09/2026, '
      + 'às 19h. Oferta de fêmeas Nelore P.O. do Nelore Bela Aurora (30 fêmeas atendidas pela Bula). '
      + 'Plataforma e-rural, com oferecimento erural pay e assessoria da Bula Assessoria Pecuária. '
      + 'Transmissão em erural.net e no YouTube @erural_br. Comercial e-rural (16) 99742-0031.',
    capa: join(root, 'outputs', 'agenda-2026-09-01', '2026-09-17-1o-leilao-fazenda-bela-aurora-arte.jpeg'),
    capaMime: 'image/jpeg',
    path: 'escala-2026/2026-09-17-1o-leilao-fazenda-bela-aurora-arte.jpeg',
  },
]

for (const item of ATUALIZACOES) {
  console.log(`\n=== ${item.data} — ${item.nomeAtual} -> ${item.nome} ===`)

  if (!existsSync(item.capa)) {
    console.error(`  !! capa nao encontrada: ${item.capa} — pulando`)
    continue
  }

  const { data: crono, error: cronoSelErr } = await supabase
    .from('cronograma_leiloes')
    .select('*')
    .eq('data', item.data)
    .in('nome', [item.nomeAtual, item.nome])
    .maybeSingle()
  if (cronoSelErr) throw new Error(`SELECT cronograma_leiloes: ${cronoSelErr.message}`)
  if (!crono) {
    console.error(`  !! nao achei "${item.nomeAtual}" em ${item.data} no cronograma — pulando`)
    continue
  }

  let coverUrl = null
  const bytes = readFileSync(item.capa)
  if (dry) {
    console.log(`  [dry] subiria ${(bytes.length / 1024).toFixed(1)} KB -> leilao-covers/${item.path}`)
  } else {
    const { error } = await supabase.storage.from('leilao-covers').upload(item.path, bytes, {
      contentType: item.capaMime,
      upsert: true,
      cacheControl: '31536000',
    })
    if (error) throw new Error(`UPLOAD ${item.path}: ${error.message}`)
    coverUrl = supabase.storage.from('leilao-covers').getPublicUrl(item.path).data.publicUrl
    console.log(`  capa: ${coverUrl}`)
  }

  // A arte manda: aqui os campos do cartaz sobrescrevem mesmo.
  const cronoPatch = {
    nome: item.nome,
    hora: item.hora,
    criador: item.criador,
    leiloeira: item.leiloeira,
    raca: item.raca,
    sexo: item.sexo,
    qtd_animais: item.qtd_animais,
    img: coverUrl ?? crono.img ?? null,
  }
  if (dry) {
    console.log('  [dry] cronograma_leiloes UPDATE:', JSON.stringify(cronoPatch))
  } else {
    const { error } = await supabase.from('cronograma_leiloes').update(cronoPatch).eq('id', crono.id)
    if (error) throw new Error(`UPDATE cronograma_leiloes: ${error.message}`)
    console.log(`  cronograma_leiloes: atualizado (${crono.id})`)
  }

  // O par público é achado pelo vínculo explícito; nome é fallback porque ele muda aqui.
  let pub = null
  {
    const { data, error } = await supabase.from('bula_leiloes').select('*').eq('cronograma_id', crono.id).maybeSingle()
    if (error) throw new Error(`SELECT bula_leiloes por cronograma_id: ${error.message}`)
    pub = data
  }
  if (!pub) {
    const { data, error } = await supabase
      .from('bula_leiloes')
      .select('*')
      .eq('data', item.data)
      .in('nome', [item.nomePublicoAtual, item.nomeAtual, item.nomePublico, item.nome])
      .maybeSingle()
    if (error) throw new Error(`SELECT bula_leiloes por nome: ${error.message}`)
    pub = data
  }
  if (!pub) {
    console.error(`  !! nao achei o par publico de ${item.data} — pulando bula_leiloes`)
    continue
  }

  const pubPatch = {
    nome: item.nomePublico,
    tipo: item.tipo,
    animais: item.animais,
    horario: item.hora,
    leiloeira: item.leiloeira,
    transmissao: item.transmissao,
    condicao: item.condicao,
    img: coverUrl ?? pub.img ?? '',
    cronograma_id: crono.id,
  }
  if (dry) {
    console.log('  [dry] bula_leiloes UPDATE:', JSON.stringify(pubPatch))
  } else {
    const { error } = await supabase.from('bula_leiloes').update(pubPatch).eq('id', pub.id)
    if (error) throw new Error(`UPDATE bula_leiloes: ${error.message}`)
    console.log(`  bula_leiloes: atualizado (${pub.id})`)
  }

  const startAt = `${item.data}T${item.hora}:00-03:00`
  const detalhes = [
    `Criador: ${item.criador}`,
    `Leiloeira: ${item.leiloeira}`,
    `Raca: ${item.raca}`,
    `Sexo: ${item.sexo}`,
    `Qtd.: ${item.qtd_animais}`,
    `Transmissao: ${item.transmissao}`,
  ].join('\n')

  const evento = {
    title: item.nomePublico,
    description: detalhes,
    event_type: 'leilao',
    status: 'planejado',
    priority: 'media',
    start_at: startAt,
    end_at: new Date(new Date(startAt).getTime() + 2 * 60 * 60 * 1000).toISOString(),
    all_day: false,
    location: pub.local || null,
    color: '#A68B4B',
    notes: 'Atualizado com a arte oficial em 01/09/2026 (scripts/agenda-2026-09-01-artes-erural.mjs).',
    linked_leilao_id: crono.id,
  }

  if (dry) {
    console.log(`  [dry] agenda_events: substituiria o evento de ${crono.id} -> ${startAt}`)
  } else {
    await supabase.from('agenda_events').delete().eq('linked_leilao_id', crono.id)
    const { error } = await supabase.from('agenda_events').insert(evento)
    if (error) throw new Error(`INSERT agenda_events: ${error.message}`)
    console.log(`  agenda_events: evento recriado (${startAt})`)
  }
}

console.log('\nOK — artes e-rural de 01/09 aplicadas.')
