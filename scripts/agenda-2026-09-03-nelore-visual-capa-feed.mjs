// Capa do NELORE VISUAL - SHOPPING DE GENÉTICA (12/09) — monta o feed 4:5 a partir
// da story e liga nas duas tabelas.
//
// O criatório só mandou a arte em STORY (720x1280 = 0,563). A agenda precisa de 4:5
// ([[capa-agenda-formato-feed-4x5]]) e o João mandou dar um jeito de usar essa mesma
// arte. Recortar pra 4:5 comeria o topo (logo + data) ou o rodapé (Fazenda Visual +
// QR de localização) — o cartaz usa a altura toda. Então o cartaz NÃO é tocado: ele
// entra inteiro, centralizado, num canvas 1024x1280.
//
// O preenchimento das laterais é o MESMO tratamento que `AgendaGrid.tsx` (~linha 171)
// já aplica em tempo real para imagem fora do 4:5 — fundo preto + a própria arte em
// `cover` com scale-110, blur-2xl e opacity-35 — só que embutido no arquivo. Fica na
// linguagem do site e o resultado é estável em qualquer superfície que use `img`
// (card da agenda, página do leilão, compartilhamento), não só no grid.
//
// Duas alternativas foram testadas e descartadas, para não serem tentadas de novo:
//   - espelhar a faixa da borda: duplica o logo à esquerda e o selo "40 TOUROS" à
//     direita, porque o cartaz tem elemento colado na margem — vira fantasma;
//   - esticar a coluna da borda (edge-clamp): sem fantasma, mas deixa faixas
//     horizontais e a emenda ainda aparece onde a borda do cartaz é clara.
//
// Uso: node scripts/agenda-2026-09-03-nelore-visual-capa-feed.mjs [--dry]

import { existsSync, readFileSync } from 'node:fs'
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

const DATA = '2026-09-12'
const NOME_CRONO = 'NELORE VISUAL - SHOPPING DE GENÉTICA'
const NOME_PUB = 'Nelore Visual — Shopping de Genética'
const PATH = 'escala-2026/2026-09-12-nelore-visual-shopping-de-genetica-feed.jpeg'

const STORY = join(root, 'outputs', 'agenda-2026-09-03',
  '2026-09-12-nelore-visual-shopping-de-genetica-arte-story.jpeg')
const FEED = join(root, 'outputs', 'agenda-2026-09-03',
  '2026-09-12-nelore-visual-shopping-de-genetica-feed-4x5.jpeg')

if (!existsSync(STORY)) {
  console.error(`arte de origem nao encontrada: ${STORY}`)
  process.exit(1)
}

// ── 1. Monta o 4:5 (idempotente: sempre regenera a partir da story).
const W = 1024, H = 1280
const { width: sw, height: sh } = await sharp(STORY).metadata()
if (sw >= W) {
  console.error(`a arte de origem ja tem ${sw}px de largura — este molde e para story estreita`)
  process.exit(1)
}

const backdrop = await sharp(STORY)
  .resize(Math.round(W * 1.1), Math.round(H * 1.1), { fit: 'cover', position: 'centre' })
  .extract({ left: Math.round(W * 0.05), top: Math.round(H * 0.05), width: W, height: H })
  .blur(40)
  .ensureAlpha(0.35)
  .png().toBuffer()

// A story ocupa a altura toda; se nao for exatamente H, normaliza pela altura.
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

// ── 3. Liga nas DUAS tabelas.
for (const [tabela, nomes] of [
  ['cronograma_leiloes', [NOME_CRONO]],
  ['bula_leiloes', [NOME_PUB, NOME_CRONO]],
]) {
  let alvo = null
  for (const nome of nomes) {
    const { data, error } = await supabase.from(tabela).select('id,nome,img').eq('nome', nome).eq('data', DATA).maybeSingle()
    if (error) throw new Error(`SELECT ${tabela}: ${error.message}`)
    if (data) { alvo = data; break }
  }
  if (!alvo) {
    console.error(`!! ${tabela}: nao achei o leilao em ${DATA}`)
    continue
  }
  if (dry) {
    console.log(`[dry] ${tabela} (${alvo.id}): img "${alvo.img || 'vazio'}" -> feed`)
    continue
  }
  const { error } = await supabase.from(tabela).update({ img: coverUrl }).eq('id', alvo.id)
  if (error) throw new Error(`UPDATE ${tabela}: ${error.message}`)
  console.log(`${tabela}: img atualizada (${alvo.id})`)
}

console.log('\nOK — capa feed do Nelore Visual no ar.')
