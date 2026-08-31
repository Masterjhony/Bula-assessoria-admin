// Flyer do LEILÃO TOUROS NELORE PARANÃ (27/09/2026) — pedido do João em
// 31/08/2026; arquivo veio dos downloads (F:\touros parana.jpeg) e está em
// outputs/agenda-2026-08-31/2026-09-27-touros-nelore-parana-arte.jpeg.
//
// O registro "PARANÃ TOUROS" existia como ESQUELETO desde 24/08 (veio do lote
// de inclusões daquele dia): só nome e data, todo o resto em branco e sem capa.
// Além da capa, este script preenche o que a arte afirma:
//
//   27/09/2026 · domingo · 09h (horário de Brasília/DF) · 100 touros Nelore PO
//   avaliados por PMGZ, ANCP, Embrapa, GenePlus e AVAL.
//
// ⚠ A arte NÃO informa leiloeira, local, modalidade nem transmissão — esses
// campos ficam em branco de propósito. Nada de deduzir modalidade a partir de
// campo vizinho ([[modalidade-leilao-3-campos-sync]]).
//
// Formato da arte: 1210x1600 (4:5) — dentro do padrão feed da agenda
// ([[capa-agenda-formato-feed-4x5]]).
//
// O nome fica como está ("PARANÃ TOUROS"): renomear para o título do cartaz é
// decisão do João/Marcelo, não efeito colateral de anexar a capa.
//
// Uso: node scripts/agenda-2026-08-31-capa-parana.mjs [--dry]

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

const DATA = '2026-09-27'
const NOME = 'PARANÃ TOUROS'
const ARTE = join(root, 'outputs', 'agenda-2026-08-31', '2026-09-27-touros-nelore-parana-arte.jpeg')
const PATH = 'escala-2026/2026-09-27-leilao-touros-nelore-parana-arte.jpeg'
const CONDICAO = 'Leilão Touros Nelore Paranã. Domingo 27/09/2026 às 9h (horário de Brasília/DF). '
  + 'Oferta de 100 touros Nelore PO, avaliados por PMGZ, ANCP, Embrapa, GenePlus e AVAL.'

if (!existsSync(ARTE)) {
  console.error(`arte nao encontrada: ${ARTE}`)
  process.exit(1)
}

// Só grava onde o banco está vazio: edição manual anterior sempre vence.
const keep = (novo, atual) => {
  if (atual != null && String(atual).trim() !== '') return atual
  return novo
}

const bytes = readFileSync(ARTE)
let coverUrl = null
if (dry) {
  console.log(`[dry] subiria ${(bytes.length / 1024).toFixed(1)} KB -> leilao-covers/${PATH}`)
} else {
  const { error } = await supabase.storage.from('leilao-covers').upload(PATH, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
    cacheControl: '31536000',
  })
  if (error) throw new Error(`UPLOAD ${PATH}: ${error.message}`)
  coverUrl = supabase.storage.from('leilao-covers').getPublicUrl(PATH).data.publicUrl
  console.log(`capa: ${coverUrl}`)
}

const { data: crono, error: cronoErr } = await supabase
  .from('cronograma_leiloes').select('*').eq('data', DATA).eq('nome', NOME).maybeSingle()
if (cronoErr) throw new Error(`SELECT cronograma_leiloes: ${cronoErr.message}`)
if (!crono) throw new Error(`cronograma_leiloes: ${NOME} (${DATA}) nao encontrado`)

const cronoPatch = {
  hora: keep('09:00', crono.hora),
  dia_semana: keep('domingo', crono.dia_semana),
  raca: keep('NELORE', crono.raca),
  sexo: keep('MACHOS', crono.sexo),
  qtd_animais: keep('100 TOUROS', crono.qtd_animais),
  img: coverUrl ?? crono.img,
}
if (dry) {
  console.log(`  [dry] cronograma_leiloes (${crono.id}):`, JSON.stringify(cronoPatch))
} else {
  const { error } = await supabase.from('cronograma_leiloes').update(cronoPatch).eq('id', crono.id)
  if (error) throw new Error(`UPDATE cronograma_leiloes: ${error.message}`)
  console.log(`  cronograma_leiloes atualizado (${crono.id})`)
}

const { data: pub, error: pubErr } = await supabase
  .from('bula_leiloes').select('*').eq('data', DATA).eq('nome', NOME).maybeSingle()
if (pubErr) throw new Error(`SELECT bula_leiloes: ${pubErr.message}`)
if (!pub) throw new Error(`bula_leiloes: ${NOME} (${DATA}) nao encontrado`)

const pubPatch = {
  tipo: pub.tipo && pub.tipo !== 'Leilao' ? pub.tipo : 'NELORE',
  horario: keep('09:00', pub.horario),
  animais: Number(pub.animais) || 100,
  condicao: keep(CONDICAO, pub.condicao),
  img: coverUrl ?? pub.img,
}
if (dry) {
  console.log(`  [dry] bula_leiloes (${pub.id}):`, JSON.stringify(pubPatch))
} else {
  const { error } = await supabase.from('bula_leiloes').update(pubPatch).eq('id', pub.id)
  if (error) throw new Error(`UPDATE bula_leiloes: ${error.message}`)
  console.log(`  bula_leiloes atualizado (${pub.id})`)
}

// O evento da agenda interna estava marcado 12:00 (default de quem nao tem
// hora); a arte diz 9h — realinha para nao ficar divergindo do card.
const startAt = `${DATA}T09:00:00-03:00`
if (dry) {
  console.log(`  [dry] agenda_events: moveria o evento de ${crono.id} para ${startAt}`)
} else {
  const { error } = await supabase.from('agenda_events').update({
    start_at: startAt,
    end_at: new Date(new Date(startAt).getTime() + 2 * 60 * 60 * 1000).toISOString(),
    all_day: false,
    description: 'Raca: NELORE\nSexo: MACHOS\nQtd.: 100 touros Nelore PO',
  }).eq('linked_leilao_id', crono.id)
  if (error) throw new Error(`UPDATE agenda_events: ${error.message}`)
  console.log(`  agenda_events realinhado (${startAt})`)
}

console.log('\nOK — flyer do Touros Nelore Paranã (27/09) anexado.')
