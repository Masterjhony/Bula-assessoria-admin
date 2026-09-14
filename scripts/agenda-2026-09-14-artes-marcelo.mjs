// Artes de 14/09/2026 — o Marcelo mandou na DM (10:40) os cartazes de três leilões
// e-rural: "Providencia esses leilões na agenda". Dois já existiam só com data e
// oferta, da lista dele de 01/09 (scripts/agenda-2026-09-01-inclusoes.mjs); o
// terceiro é novo.
//
// As três artes vieram em STORY 9:16 (900x1600 = 0,563). A agenda precisa de feed
// 4:5 ([[capa-agenda-formato-feed-4x5]]) e recortar comeria o topo (data/hora) ou o
// rodapé (plataforma, transmissão, comercial). Então cada cartaz entra INTEIRO,
// centralizado num canvas 1024x1280, com as laterais no mesmo tratamento que o
// `AgendaGrid.tsx` (~linha 171) aplica ao vivo em imagem fora do 4:5: fundo preto +
// a própria arte em cover, blur e opacity-35 — molde de
// scripts/agenda-2026-09-03-nelore-visual-capa-feed.mjs. Espelhar borda e edge-clamp
// já foram testados e descartados; não tentar de novo. Se o criatório mandar o feed
// original depois, ele vence o montado (re-upload + UPDATE img nas duas tabelas).
//
// (1) 19/09 — TOUROS BARRA DO DIA  ->  3º LEILÃO NELORE BARRA DO DIA
//     Sábado, 19 de setembro, 13h30. "40 touros Nelore P.O.", avaliação ANCP e PMGZ.
//     Plataforma e-rural, oferecimento erural pay, assessoria Bula Assessoria
//     Pecuária + Acurácia Assessoria Pecuária. Transmissão erural.net / @erural_br,
//     comercial e-rural (16) 99742-0031. Mesmo criatório e oferta da lista do
//     Marcelo — ganhou nome de cartaz, horário e leiloeira.
//
// (2) 20/09 — NOVO: 3º LEILÃO LS COLLECTION — LEILÃO EXCLUSIVO
//     Domingo, 20 SET às 10h30. Agropecuária LS (desde 1988). "Fêmeas Nelore LS —
//     quando seleção, tempo e legado se transformam em coleção." Plataforma e-rural,
//     LEILOEIRA Bula Remates (o cartaz escreve assim, na casa de leiloeira),
//     oferecimento erural pay. Transmissão e comercial e-rural iguais aos outros.
//     O cartaz NÃO traz quantidade — `qtd_animais` fica vazio e `animais` 0.
//     Convive na data com o 2º LEILÃO MARAMBAIA & MARCA 33 (12:00, Bula Remates),
//     são leilões diferentes. Conferido por data e nome antes de inserir.
//
// (3) 24/09 — FÊMEAS FB AGRO  ->  LEILÃO EVOLUÇÃO FB AGRO
//     Quinta-feira, 24 de set, 19h00. Realização FB Agro Agrícola e Pecuária.
//     "30 fêmeas Nelore P.O." Plataforma e-rural, assessoria Bula Remates (grafia
//     do cartaz), oferecimento erural pay. Transmissão e comercial e-rural.
//
// `leiloeira`: nos e-rural sem leiloeira nomeada fica E-RURAL, como no Geração Elite
// e no Bela Aurora (scripts/agenda-2026-09-01-artes-erural.mjs). No LS Collection o
// cartaz nomeia a Bula Remates nessa casa, então vai BULA REMATES.
// `presencial`/`modelo`/`local` continuam VAZIOS nos três: nenhum cartaz escreve
// "virtual" nem dá endereço. Não inventar — é um clique no admin depois.
// `condicao` é campo PÚBLICO: só descrição comercial, nada de procedência
// ([[condicao-e-campo-publico-sem-nota-interna]]).
//
// Origem das artes: DM do Marcelo Carneiro, operational_items de 14/09 13:40-13:41
// UTC, bucket whatsapp-media/baileys/joao-automation/553194149161/{3B80C221FA447A1BCF67,
// 3B64D6D1EDCA87802904,3B652C44D0CDEC6339D0}.jpg. Stories guardadas ao lado dos feeds
// em outputs/agenda-2026-09-14/.
//
// Uso: node scripts/agenda-2026-09-14-artes-marcelo.mjs [--dry]

import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const dry = process.argv.includes('--dry')
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const OUT = join(root, 'outputs', 'agenda-2026-09-14')

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

const LEILOES = [
  {
    data: '2026-09-19',
    dia_semana: 'sábado',
    // Como o card ainda está com o nome provisório da lista, é por ele que se acha o par.
    nomeAtual: 'TOUROS BARRA DO DIA',
    nomePublicoAtual: 'Touros Barra do Dia',

    nome: '3º LEILÃO NELORE BARRA DO DIA',
    nomePublico: '3º Leilão Nelore Barra do Dia',
    hora: '13:30',
    criador: 'NELORE BARRA DO DIA',
    leiloeira: 'E-RURAL',
    raca: 'NELORE P.O.',
    sexo: 'MACHOS',
    qtd_animais: '40 TOUROS',
    animais: 40,
    tipo: 'NELORE',
    transmissao: TRANSMISSAO_ERURAL,
    condicao: '3º Leilão Nelore Barra do Dia. Sábado, 19/09/2026, às 13h30. Oferta de 40 touros Nelore P.O. '
      + 'com avaliação ANCP e PMGZ. Plataforma e-rural, com oferecimento erural pay e assessoria da Bula '
      + 'Assessoria Pecuária e da Acurácia Assessoria Pecuária. Transmissão em erural.net e no YouTube '
      + '@erural_br. Comercial e-rural (16) 99742-0031.',
    slug: '2026-09-19-3o-leilao-nelore-barra-do-dia',
  },
  {
    data: '2026-09-20',
    dia_semana: 'domingo',
    nomeAtual: null,
    nomePublicoAtual: null,

    nome: '3º LEILÃO LS COLLECTION',
    nomePublico: '3º Leilão LS Collection',
    hora: '10:30',
    criador: 'AGROPECUÁRIA LS',
    leiloeira: 'BULA REMATES',
    raca: 'NELORE',
    sexo: 'FÊMEAS',
    qtd_animais: null,
    animais: 0,
    tipo: 'NELORE',
    transmissao: TRANSMISSAO_ERURAL,
    condicao: '3º Leilão LS Collection — Leilão Exclusivo. "Quando seleção, tempo e legado se transformam em '
      + 'coleção." Domingo, 20/09/2026, às 10h30. Oferta de fêmeas Nelore LS, da Agropecuária LS (desde 1988). '
      + 'Plataforma e-rural, leiloeira Bula Remates, com oferecimento erural pay. Transmissão em erural.net e '
      + 'no YouTube @erural_br. Comercial e-rural (16) 99742-0031.',
    slug: '2026-09-20-3o-leilao-ls-collection',
  },
  {
    data: '2026-09-24',
    dia_semana: 'quinta-feira',
    nomeAtual: 'FÊMEAS FB AGRO',
    nomePublicoAtual: 'Fêmeas FB Agro',

    nome: 'LEILÃO EVOLUÇÃO FB AGRO',
    nomePublico: 'Leilão Evolução FB Agro',
    hora: '19:00',
    criador: 'FB AGRO',
    leiloeira: 'E-RURAL',
    raca: 'NELORE P.O.',
    sexo: 'FÊMEAS',
    qtd_animais: '30 FÊMEAS',
    animais: 30,
    tipo: 'NELORE',
    transmissao: TRANSMISSAO_ERURAL,
    condicao: 'Leilão Evolução FB Agro. Quinta-feira, 24/09/2026, às 19h. Realização FB Agro Agrícola e '
      + 'Pecuária; oferta de 30 fêmeas Nelore P.O. Plataforma e-rural, com oferecimento erural pay e assessoria '
      + 'Bula Remates. Transmissão em erural.net e no YouTube @erural_br. Comercial e-rural (16) 99742-0031.',
    slug: '2026-09-24-leilao-evolucao-fb-agro',
  },
]

// ── Monta o 4:5 a partir da story (idempotente: sempre regenera).
const W = 1024, H = 1280
async function montaFeed(story, feed) {
  const { width: sw, height: sh } = await sharp(story).metadata()
  if (sw / sh > 0.70) throw new Error(`${story} nao e story (${sw}x${sh}) — este molde e para 9:16`)

  const backdrop = await sharp(story)
    .resize(Math.round(W * 1.1), Math.round(H * 1.1), { fit: 'cover', position: 'centre' })
    .extract({ left: Math.round(W * 0.05), top: Math.round(H * 0.05), width: W, height: H })
    .blur(40)
    .ensureAlpha(0.35)
    .png().toBuffer()

  const cartaz = sh === H
    ? await sharp(story).png().toBuffer()
    : await sharp(story).resize({ height: H }).png().toBuffer()
  const { width: cw } = await sharp(cartaz).metadata()

  await sharp({ create: { width: W, height: H, channels: 3, background: '#000000' } })
    .composite([
      { input: backdrop, left: 0, top: 0 },
      { input: cartaz, left: Math.round((W - cw) / 2), top: 0 },
    ])
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toFile(feed)

  const m = await sharp(feed).metadata()
  const ratio = m.width / m.height
  if (ratio < 0.76 || ratio > 0.83) throw new Error(`feed fora da faixa 4:5: ${m.width}x${m.height}`)
  return `${m.width}x${m.height} = ${ratio.toFixed(3)}`
}

for (const item of LEILOES) {
  console.log(`\n=== ${item.data} — ${item.nomeAtual ?? '(novo)'} -> ${item.nome} ===`)

  const story = join(OUT, `${item.slug}-arte-story.jpg`)
  const feed = join(OUT, `${item.slug}-feed-4x5.jpeg`)
  const path = `escala-2026/${item.slug}-feed.jpeg`
  if (!existsSync(story)) {
    console.error(`  !! story nao encontrada: ${story} — pulando`)
    continue
  }
  console.log(`  feed montado: ${await montaFeed(story, feed)}`)

  // ── Capa no bucket.
  const bytes = readFileSync(feed)
  let coverUrl = null
  if (dry) {
    console.log(`  [dry] subiria ${(bytes.length / 1024).toFixed(1)} KB -> leilao-covers/${path}`)
  } else {
    const { error } = await supabase.storage.from('leilao-covers').upload(path, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
      cacheControl: '31536000',
    })
    if (error) throw new Error(`UPLOAD ${path}: ${error.message}`)
    coverUrl = supabase.storage.from('leilao-covers').getPublicUrl(path).data.publicUrl
    console.log(`  capa: ${coverUrl}`)
  }

  // ── cronograma_leiloes: acha pelo nome provisório OU pelo definitivo (re-run).
  const nomesCrono = [item.nome, item.nomeAtual].filter(Boolean)
  const { data: crono, error: cronoSelErr } = await supabase
    .from('cronograma_leiloes')
    .select('*')
    .eq('data', item.data)
    .in('nome', nomesCrono)
    .maybeSingle()
  if (cronoSelErr) throw new Error(`SELECT cronograma_leiloes: ${cronoSelErr.message}`)
  if (!crono && item.nomeAtual) {
    console.error(`  !! nao achei "${item.nomeAtual}" em ${item.data} no cronograma — pulando`)
    continue
  }

  // A arte manda: os campos do cartaz sobrescrevem o que veio da lista.
  const cronoId = crono?.id ?? randomUUID()
  const cronoPatch = {
    id: cronoId,
    data: item.data,
    nome: item.nome,
    dia_semana: crono?.dia_semana || item.dia_semana,
    hora: item.hora,
    criador: item.criador,
    presencial: crono?.presencial ?? null,
    leiloeira: item.leiloeira,
    raca: item.raca,
    sexo: item.sexo,
    qtd_animais: item.qtd_animais ?? crono?.qtd_animais ?? null,
    img: coverUrl ?? crono?.img ?? null,
  }
  if (dry) {
    console.log(`  [dry] cronograma_leiloes ${crono ? 'UPDATE' : 'INSERT'}:`, JSON.stringify(cronoPatch))
  } else {
    const { error } = await supabase.from('cronograma_leiloes').upsert(cronoPatch, { onConflict: 'id' })
    if (error) throw new Error(`UPSERT cronograma_leiloes: ${error.message}`)
    console.log(`  cronograma_leiloes: ${crono ? 'atualizado' : 'criado'} (${cronoId})`)
  }

  // ── bula_leiloes: o par público vem pelo vínculo explícito; nome é fallback porque ele muda.
  let pub = null
  if (crono) {
    const { data, error } = await supabase.from('bula_leiloes').select('*').eq('cronograma_id', crono.id).maybeSingle()
    if (error) throw new Error(`SELECT bula_leiloes por cronograma_id: ${error.message}`)
    pub = data
  }
  if (!pub) {
    const nomesPub = [item.nomePublico, item.nome, item.nomePublicoAtual, item.nomeAtual].filter(Boolean)
    const { data, error } = await supabase
      .from('bula_leiloes')
      .select('*')
      .eq('data', item.data)
      .in('nome', nomesPub)
      .maybeSingle()
    if (error) throw new Error(`SELECT bula_leiloes por nome: ${error.message}`)
    pub = data
  }
  if (!pub && item.nomeAtual) {
    console.error(`  !! nao achei o par publico de ${item.data} — pulando bula_leiloes`)
    continue
  }

  const pubPatch = {
    id: pub?.id ?? randomUUID(),
    nome: item.nomePublico,
    data: item.data,
    tipo: item.tipo,
    local: pub?.local ?? '',
    animais: item.animais || Number(pub?.animais) || 0,
    status: pub?.status || 'confirmado',
    horario: item.hora,
    modelo: pub?.modelo ?? '',
    leiloeira: item.leiloeira,
    transmissao: item.transmissao,
    condicao: item.condicao,
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

  // ── agenda_events: recria o evento com o horário do cartaz.
  const startAt = `${item.data}T${item.hora}:00-03:00`
  const detalhes = [
    `Criador: ${item.criador}`,
    `Leiloeira: ${item.leiloeira}`,
    `Raca: ${item.raca}`,
    `Sexo: ${item.sexo}`,
    item.qtd_animais ? `Qtd.: ${item.qtd_animais}` : '',
    `Transmissao: ${item.transmissao}`,
  ].filter(Boolean).join('\n')

  const evento = {
    title: item.nomePublico,
    description: detalhes,
    event_type: 'leilao',
    status: 'planejado',
    priority: 'media',
    start_at: startAt,
    end_at: new Date(new Date(startAt).getTime() + 2 * 60 * 60 * 1000).toISOString(),
    all_day: false,
    location: pubPatch.local || null,
    color: '#A68B4B',
    notes: crono
      ? 'Atualizado com a arte oficial mandada pelo Marcelo em 14/09/2026 (scripts/agenda-2026-09-14-artes-marcelo.mjs). Capa montada em 4:5 a partir da story.'
      : 'Cadastrado a partir da arte oficial mandada pelo Marcelo em 14/09/2026 (scripts/agenda-2026-09-14-artes-marcelo.mjs). Capa montada em 4:5 a partir da story.',
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

console.log('\nOK — artes de 14/09 aplicadas.')
