// Inclusão de 09/09/2026 — SHOPPING NAVIRAÍ - EDIÇÃO MARABÁ (15 a 20/09).
//
// Fonte: a arte que o João baixou (F:\navirai leilao.jpeg, guardada em
// outputs/agenda-2026-09-09/2026-09-15-shopping-navirai-edicao-maraba-arte-story.jpeg).
// Tudo abaixo sai LIDO DO CARTAZ: "MARABÁ, PA — 15 A 20 DE SETEMBRO",
// "SHOPPING NAVIRAÍ — EDIÇÃO MARABÁ", "EM OFERTA: MATRIZES E REPRODUTORES /
// biotipo aliado à avaliação genética", "DURANTE A XXXVIII EXPOAMA".
// Realização: NAVIRAÍ (O Zebu do Brasil) e BOI VERDE AGRONEGÓCIOS.
//
// O cartaz NÃO traz hora nem quantidade de animais — ficam VAZIOS de propósito,
// o card entra como dia inteiro ([[agenda-leilao-sem-arte-fallback]]: não inventar).
// `leiloeira` também fica VAZIA: isto é um SHOPPING (venda direta durante a
// exposição), e no cartaz a PROGRAMA LEILÕES aparece na faixa de PATROCINADORES,
// não como leiloeira do evento. Os 10 eventos anteriores da Naviraí no banco têm
// leiloeira PROGRAMA LEILÕES — mas histórico de outro evento não é fonte para este.
// Se o João confirmar, é um UPDATE de uma linha nas duas tabelas.
//
// ⚠ UMA linha só, na data de ABERTURA (15/09). O shopping roda 6 dias corridos
// dentro da Expoama — é venda contínua, não 6 pregões. A janela inteira está em
// `condicao` (campo PÚBLICO, [[condicao-e-campo-publico-sem-nota-interna]]) e o
// evento interno em `agenda_events` cobre 15→20/09 como all-day. O molde de
// "1º DIA / 2º DIA" (BC Agrofeira) é para leilões com pregão em cada dia.
//
// CAPA: a arte veio STORY (925x1600 = 0,578) e a agenda só aceita feed 4:5
// ([[capa-agenda-formato-feed-4x5]]). O cartaz NÃO é recortado — recorte comeria a
// data no topo ou a faixa de realização/patrocínio no rodapé. Entra inteiro,
// centralizado, num canvas 1024x1280, com o mesmo tratamento de laterais que o
// `AgendaGrid.tsx` aplica em tempo real (preto + a própria arte em cover, blur,
// opacidade 35%) — molde de scripts/agenda-2026-09-03-nelore-visual-capa-feed.mjs.
//
// Não existia em `cronograma_leiloes` nem em `bula_leiloes` — conferido por data
// (10–25/09) e por nome (ilike '%navira%', '%marab%', '%expoama%', '%shopping%')
// antes de escrever ([[agenda-publica-janela-d60]]).
//
// Convivência de data conferida: 15/09 já tem GERAÇÃO ELITE (19h) e ASPIRAÇÕES EAO
// (20h) — eventos diferentes, convivem na data como o 12, o 19 e o 20/09 já fazem.
//
// Uso: node scripts/agenda-2026-09-09-shopping-navirai-maraba.mjs [--dry]

import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

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

const DATA = '2026-09-15'
const DATA_FIM = '2026-09-20'
const NOME_CRONO = 'SHOPPING NAVIRAÍ - EDIÇÃO MARABÁ'
const NOME_PUB = 'Shopping Naviraí — Edição Marabá'
const COVER_PATH = 'escala-2026/2026-09-15-shopping-navirai-edicao-maraba-feed.jpeg'

const STORY = join(root, 'outputs', 'agenda-2026-09-09',
  '2026-09-15-shopping-navirai-edicao-maraba-arte-story.jpeg')
const FEED = join(root, 'outputs', 'agenda-2026-09-09',
  '2026-09-15-shopping-navirai-edicao-maraba-feed-4x5.jpeg')

const LEILAO = {
  data: DATA,
  dia_semana: 'terça-feira',
  nome: NOME_CRONO,
  nomePublico: NOME_PUB,
  hora: null,
  criador: 'NAVIRAÍ / BOI VERDE AGRONEGÓCIOS',
  presencial: 'PRESENCIAL',
  local: 'XXXVIII Expoama — Marabá/PA',
  leiloeira: null,
  raca: 'NELORE',
  sexo: 'MACHOS E FÊMEAS',
  qtd_animais: null,
  animais: 0,
  tipo: 'NELORE',
  transmissao: null,
  condicao: 'Shopping Naviraí — Edição Marabá, de 15 a 20 de setembro de 2026, durante a XXXVIII Expoama, '
    + 'em Marabá/PA. Em oferta: matrizes e reprodutores, biotipo aliado à avaliação genética. '
    + 'Realização Naviraí e Boi Verde Agronegócios.',
}

// ── 1. Monta a capa feed 4:5 a partir da story (idempotente: sempre regenera).
if (!existsSync(STORY)) {
  console.error(`arte de origem nao encontrada: ${STORY}`)
  process.exit(1)
}

const W = 1024, H = 1280
const { width: sw, height: sh } = await sharp(STORY).metadata()
if (sw / sh > 0.76) {
  console.error(`a arte de origem ja tem ${(sw / sh).toFixed(3)} de proporcao — este molde e para story estreita`)
  process.exit(1)
}

const backdrop = await sharp(STORY)
  .resize(Math.round(W * 1.1), Math.round(H * 1.1), { fit: 'cover', position: 'centre' })
  .extract({ left: Math.round(W * 0.05), top: Math.round(H * 0.05), width: W, height: H })
  .blur(40)
  .ensureAlpha(0.35)
  .png().toBuffer()

const cartaz = sh === H
  ? await sharp(STORY).png().toBuffer()
  : await sharp(STORY).resize({ height: H }).png().toBuffer()
const { width: cw } = await sharp(cartaz).metadata()

await sharp({ create: { width: W, height: H, channels: 3, background: '#000000' } })
  .composite([
    { input: backdrop, left: 0, top: 0 },
    { input: cartaz, left: Math.round((W - cw) / 2), top: 0 },
  ])
  .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
  .toFile(FEED)

const m = await sharp(FEED).metadata()
const ratio = m.width / m.height
console.log(`feed montado: ${m.width}x${m.height} = ${ratio.toFixed(3)}`)
if (ratio < 0.76 || ratio > 0.83) {
  console.error('!! fora da faixa de feed 4:5 (0,76-0,83) — abortando')
  process.exit(1)
}

// ── 2. Sobe no bucket.
const bytes = readFileSync(FEED)
let coverUrl = null
if (dry) {
  console.log(`[dry] subiria ${(bytes.length / 1024).toFixed(1)} KB -> leilao-covers/${COVER_PATH}`)
} else {
  const { error } = await supabase.storage.from('leilao-covers').upload(COVER_PATH, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
    cacheControl: '31536000',
  })
  if (error) throw new Error(`UPLOAD ${COVER_PATH}: ${error.message}`)
  coverUrl = supabase.storage.from('leilao-covers').getPublicUrl(COVER_PATH).data.publicUrl
  console.log(`capa: ${coverUrl}`)
}

// ── 3. Grava nas DUAS tabelas + agenda_events.
// Só grava onde o banco está vazio: edição manual anterior sempre vence.
const keep = (novo, atual) => {
  if (atual != null && String(atual).trim() !== '') return atual
  return novo
}

console.log(`\n=== ${LEILAO.data} — ${LEILAO.nome} ===`)

const { data: crono, error: cronoSelErr } = await supabase
  .from('cronograma_leiloes')
  .select('*')
  .eq('nome', LEILAO.nome)
  .eq('data', LEILAO.data)
  .maybeSingle()
if (cronoSelErr) throw new Error(`SELECT cronograma_leiloes: ${cronoSelErr.message}`)

const cronoId = crono?.id ?? randomUUID()
const cronoPatch = {
  id: cronoId,
  data: LEILAO.data,
  nome: LEILAO.nome,
  dia_semana: keep(LEILAO.dia_semana, crono?.dia_semana),
  hora: keep(LEILAO.hora, crono?.hora),
  criador: keep(LEILAO.criador, crono?.criador),
  presencial: keep(LEILAO.presencial, crono?.presencial),
  leiloeira: keep(LEILAO.leiloeira, crono?.leiloeira),
  raca: keep(LEILAO.raca, crono?.raca),
  qtd_animais: keep(LEILAO.qtd_animais, crono?.qtd_animais),
  sexo: keep(LEILAO.sexo, crono?.sexo),
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
for (const candidato of [LEILAO.nomePublico, LEILAO.nome]) {
  const { data, error } = await supabase
    .from('bula_leiloes')
    .select('*')
    .eq('nome', candidato)
    .eq('data', LEILAO.data)
    .maybeSingle()
  if (error) throw new Error(`SELECT bula_leiloes: ${error.message}`)
  if (data) { pub = data; break }
}

const pubPatch = {
  id: pub?.id ?? randomUUID(),
  nome: pub?.nome || LEILAO.nomePublico,
  data: LEILAO.data,
  tipo: pub?.tipo && pub.tipo !== 'Leilao' ? pub.tipo : LEILAO.tipo,
  local: keep(LEILAO.local, pub?.local) ?? '',
  animais: Number(pub?.animais) || LEILAO.animais || 0,
  status: pub?.status || 'confirmado',
  horario: keep(LEILAO.hora, pub?.horario) ?? '',
  modelo: keep(LEILAO.presencial, pub?.modelo) ?? '',
  leiloeira: keep(LEILAO.leiloeira, pub?.leiloeira) ?? '',
  transmissao: keep(LEILAO.transmissao, pub?.transmissao) ?? '',
  condicao: keep(LEILAO.condicao, pub?.condicao) ?? '',
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

// Sem hora no cartaz -> all-day; e o shopping ocupa a semana inteira (15 -> 20/09).
const detalhes = [
  cronoPatch.criador ? `Criador: ${cronoPatch.criador}` : '',
  cronoPatch.leiloeira ? `Leiloeira: ${cronoPatch.leiloeira}` : '',
  pubPatch.local ? `Local: ${pubPatch.local}` : '',
  cronoPatch.raca ? `Raca: ${cronoPatch.raca}` : '',
  cronoPatch.sexo ? `Sexo: ${cronoPatch.sexo}` : '',
  cronoPatch.qtd_animais ? `Qtd.: ${cronoPatch.qtd_animais}` : '',
  'Periodo: 15 a 20/09/2026 (durante a XXXVIII Expoama)',
].filter(Boolean).join('\n')

const evento = {
  title: pubPatch.nome,
  description: detalhes,
  event_type: 'leilao',
  status: 'planejado',
  priority: 'media',
  start_at: `${DATA}T00:00:00-03:00`,
  end_at: `${DATA_FIM}T23:59:00-03:00`,
  all_day: true,
  location: pubPatch.local || cronoPatch.presencial || null,
  color: '#A68B4B',
  notes: 'Cadastrado a partir da arte oficial em 09/09/2026 '
    + '(scripts/agenda-2026-09-09-shopping-navirai-maraba.mjs). Shopping de 6 dias dentro da Expoama: '
    + 'entra como UMA linha na data de abertura, com a janela em `condicao`. '
    + 'Cartaz sem hora e sem leiloeira — a Programa Leiloes aparece so como patrocinadora.',
  linked_leilao_id: cronoId,
}

if (dry) {
  console.log(`  [dry] agenda_events: substituiria o evento de ${cronoId} -> ${DATA} a ${DATA_FIM}`)
} else {
  await supabase.from('agenda_events').delete().eq('linked_leilao_id', cronoId)
  const { error } = await supabase.from('agenda_events').insert(evento)
  if (error) throw new Error(`INSERT agenda_events: ${error.message}`)
  console.log(`  agenda_events: evento recriado (${DATA} a ${DATA_FIM}, dia inteiro)`)
}

console.log('\nOK — Shopping Naviraí Edição Marabá processado.')
