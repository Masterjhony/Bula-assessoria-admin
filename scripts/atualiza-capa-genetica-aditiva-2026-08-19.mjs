// Troca a capa do 9º Leilão Genética Aditiva ExpoGenética (19/08/2026) pela arte
// oficial do leilão. A capa anterior era o card de agradecimento do 23º Mega
// Leilão, que apenas anunciava esta data.
//
// Origem: F:\genet adit.jpeg (recebida em 03/08/2026).
// Caminho novo no Storage de propósito: reaproveitar o mesmo path serviria a
// imagem antiga pelo cache do CDN.
//
// Uso: node scripts/atualiza-capa-genetica-aditiva-2026-08-19.mjs

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

const DATA = '2026-08-19'
const NOME = '9º LEILÃO GENÉTICA ADITIVA EXPOGENÉTICA'
const COVER_SRC = 'F:\\genet adit.jpeg'
const COVER_PATH = 'escala-2026/2026-08-19-9o-genetica-aditiva-expogenetica-arte-oficial.jpeg'
// A arte oficial credita a retransmissão, que o card de agradecimento não trazia.
const TRANSMISSAO = 'Canal do Criador (retransmissão Lance Rural e Remate Web)'

if (!existsSync(COVER_SRC)) {
  console.error(`Capa nao encontrada: ${COVER_SRC}`)
  process.exit(1)
}

const fileBytes = readFileSync(COVER_SRC)
console.log(`Subindo capa (${(fileBytes.length / 1024).toFixed(1)} KB) -> leilao-covers/${COVER_PATH}`)
const { error: uploadError } = await supabase.storage.from('leilao-covers').upload(COVER_PATH, fileBytes, {
  contentType: 'image/jpeg',
  upsert: true,
})
if (uploadError) throw new Error(`UPLOAD capa: ${uploadError.message}`)

const { data: publicUrlData } = supabase.storage.from('leilao-covers').getPublicUrl(COVER_PATH)
const coverUrl = publicUrlData.publicUrl
console.log(`Capa publica: ${coverUrl}`)

const { data: crono, error: cronoSelErr } = await supabase
  .from('cronograma_leiloes')
  .select('id')
  .eq('nome', NOME)
  .eq('data', DATA)
  .maybeSingle()
if (cronoSelErr) throw new Error(`SELECT cronograma_leiloes: ${cronoSelErr.message}`)
if (!crono) throw new Error(`Leilão não encontrado em cronograma_leiloes: ${NOME} (${DATA})`)

const { error: cronoUpdErr } = await supabase
  .from('cronograma_leiloes')
  .update({ img: coverUrl })
  .eq('id', crono.id)
if (cronoUpdErr) throw new Error(`UPDATE cronograma_leiloes: ${cronoUpdErr.message}`)
console.log(`cronograma_leiloes: capa atualizada (id=${crono.id})`)

const { data: bula, error: bulaUpdErr } = await supabase
  .from('bula_leiloes')
  .update({ img: coverUrl, transmissao: TRANSMISSAO })
  .eq('nome', NOME)
  .eq('data', DATA)
  .select('id')
if (bulaUpdErr) throw new Error(`UPDATE bula_leiloes: ${bulaUpdErr.message}`)
if (!bula?.length) throw new Error(`Leilão não encontrado em bula_leiloes: ${NOME} (${DATA})`)
console.log(`bula_leiloes: capa + transmissão atualizadas (id=${bula[0].id})`)

console.log('\nOK — capa do 9º Leilão Genética Aditiva ExpoGenética trocada pela arte oficial.')
