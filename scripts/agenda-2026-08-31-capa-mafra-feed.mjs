// "Trocar por formato feed" — pedido do Marcelo no WhatsApp em 31/08/2026,
// 12:06 (sessão Baileys `joao-automation`, DM 5531994149161).
//
// Ele encaminhou a arte do TOUROS PREMIUM NELORE MAFRA — EDIÇÃO UBERABA
// (06/09) na versão FEED. A capa que estava na agenda era a versão STORY:
//
//   antes  930x1600  (9:16, story)  ...-9304536d87.webp
//   depois 1024x1280 (4:5,  feed)   ...-feed.jpeg
//
// O Mafra era a ÚNICA capa em 9:16 da agenda — todas as outras já estão em
// 4:5 (0,76 a 0,83). Por isso o card dele destoava na grade.
//
// A capa antiga NÃO é apagada do bucket `leilao-covers`: só deixa de ser
// referenciada, então dá pra voltar atrás trocando a URL de novo.
//
// Uso: node scripts/agenda-2026-08-31-capa-mafra-feed.mjs [--dry]

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

const DATA = '2026-09-06'
const NOME = 'TOUROS PREMIUM NELORE MAFRA - EDIÇÃO UBERABA'
const ARTE = join(root, 'outputs', 'agenda-2026-08-31', '2026-09-06-nelore-mafra-touros-premium-feed.jpeg')
const PATH = 'escala-2026/2026-09-06-touros-premium-nelore-mafra-edicao-uberaba-feed.jpeg'

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
    .eq('nome', NOME)
    .maybeSingle()
  if (error) throw new Error(`SELECT ${tabela}: ${error.message}`)
  if (!data) { console.log(`  ${tabela}: linha nao encontrada — pulando`); continue }
  console.log(`  ${tabela} (${data.id})`)
  console.log(`    antes: ${data.img || '(vazio)'}`)
  if (dry) {
    console.log('    [dry] gravaria a URL da versao feed')
    continue
  }
  const { error: upErr } = await supabase.from(tabela).update({ img: coverUrl }).eq('id', data.id)
  if (upErr) throw new Error(`UPDATE ${tabela}: ${upErr.message}`)
  console.log(`    depois: ${coverUrl}`)
}

console.log('\nOK — capa do Mafra (06/09) trocada para o formato feed.')
