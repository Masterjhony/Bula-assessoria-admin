// Capa do 10º LEILÃO NELORE FLOR DO ARATAÚ (05/09/2026) trocada pela versão
// FEED — arquivo que o João baixou (F:\flor de aratu bom.jpeg), salvo em
// outputs/agenda-2026-08-31/2026-09-05-flor-do-aratau-10o-leilao-feed.jpeg.
//
//   antes  900x1600 (0,56 — story 9:16)  ...-arte.jpeg
//   depois 900x1198 (0,75 — feed 3:4)    ...-feed.jpeg
//
// Mesmo evento e mesma informação; a versão feed ainda traz a Bula na fileira
// de assessorias (a story mostrava só a GR Assessoria Pecuária).
//
// Resolve uma das duas pendências de formato abertas em 31/08 — sobra o
// KatiSpera (17/10), que segue em story. Ver [[capa-agenda-formato-feed-4x5]].
//
// A arte antiga NÃO é apagada do bucket `leilao-covers`: só deixa de ser
// referenciada, então dá pra voltar atrás trocando a URL de novo.
//
// Uso: node scripts/agenda-2026-08-31-capa-aratau-feed.mjs [--dry]

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

const DATA = '2026-09-05'
const ARTE = join(root, 'outputs', 'agenda-2026-08-31', '2026-09-05-flor-do-aratau-10o-leilao-feed.jpeg')
const PATH = 'escala-2026/2026-09-05-10o-leilao-nelore-flor-do-aratau-feed.jpeg'
// O nome difere entre as tabelas: cronograma em caixa-alta, agenda publica com
// o titulo do cartaz. Casa pelos dois.
const NOMES = ['10º LEILÃO NELORE FLOR DO ARATAÚ & CONVIDADOS', '10º Leilão Nelore Flor do Arataú & Convidados']

if (!existsSync(ARTE)) {
  console.error(`arte nao encontrada: ${ARTE}`)
  process.exit(1)
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
  console.log(`capa feed: ${coverUrl}`)
}

for (const tabela of ['cronograma_leiloes', 'bula_leiloes']) {
  const { data, error } = await supabase
    .from(tabela)
    .select('id, nome, img')
    .eq('data', DATA)
    .in('nome', NOMES)
  if (error) throw new Error(`SELECT ${tabela}: ${error.message}`)
  if (!data?.length) { console.log(`  ${tabela}: linha nao encontrada — pulando`); continue }
  if (data.length > 1) throw new Error(`${tabela}: ${data.length} linhas casaram em ${DATA} — conferir na mao.`)
  const linha = data[0]
  console.log(`  ${tabela} (${linha.id}) — ${linha.nome}`)
  console.log(`    antes: ${linha.img || '(vazio)'}`)
  if (dry) {
    console.log('    [dry] gravaria a URL da versao feed')
    continue
  }
  const { error: upErr } = await supabase.from(tabela).update({ img: coverUrl }).eq('id', linha.id)
  if (upErr) throw new Error(`UPDATE ${tabela}: ${upErr.message}`)
  console.log(`    depois: ${coverUrl}`)
}

console.log('\nOK — capa do Flor do Arataú (05/09) trocada para o formato feed.')
