// Provisiona a landing JMP editável:
//   1. cria/atualiza o bucket público `jmp-landing` (Storage)
//   2. aplica a migration 0016 (tabela jmp_landing_content)
//   3. sobe as imagens atuais para o bucket e grava o registro inicial
//      (id='default') com URLs absolutas — assim a SPA e o painel já abrem
//      com o conteúdo de hoje.
//
// Idempotente. Uso: node scripts/setup-jmp-landing.mjs

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const DB_URL = env.DATABASE_URL
if (!SUPABASE_URL || !SERVICE_KEY || !DB_URL) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL em .env.local')
  process.exit(1)
}

const BUCKET = 'jmp-landing'
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// 1) bucket público
{
  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) { console.error('listBuckets:', error.message); process.exit(1) }
  const cfg = {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    // video/mp4: fundo em vídeo do hero (boiada, filmagem de drone da Bula).
    // Sem isso o upload devolve 415 invalid_mime_type, e rodar este script de
    // novo reverteria a allowlist e quebraria o vídeo já publicado.
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'application/pdf', 'video/mp4'],
  }
  if (buckets?.some((b) => b.name === BUCKET)) {
    await supabase.storage.updateBucket(BUCKET, cfg)
    console.log(`Bucket "${BUCKET}" ok (já existia).`)
  } else {
    const { error: e } = await supabase.storage.createBucket(BUCKET, cfg)
    if (e) { console.error('createBucket:', e.message); process.exit(1) }
    console.log(`Bucket "${BUCKET}" criado (público, até 10MB).`)
  }
}

// 2) migration 0016 (tabela)
{
  const sql = readFileSync(join(root, 'supabase/migrations/0016_jmp_landing_content.sql'), 'utf-8')
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  await client.query(sql)
  await client.end()
  console.log('Migration 0016 aplicada (tabela jmp_landing_content).')
}

// 3) seed: sobe imagens atuais e monta o registro inicial
const PUB = join(root, 'jmp-landing/public')
const mime = (f) => (f.endsWith('.png') ? 'image/png' : f.endsWith('.jpeg') || f.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream')

async function up(localRel, destPath) {
  const buf = readFileSync(join(PUB, localRel))
  const { error } = await supabase.storage.from(BUCKET).upload(destPath, buf, {
    contentType: mime(localRel), upsert: true,
  })
  if (error) { console.error(`upload ${destPath}:`, error.message); process.exit(1) }
  return supabase.storage.from(BUCKET).getPublicUrl(destPath).data.publicUrl
}

console.log('Subindo imagens atuais para o bucket...')
const heroBg = await up('foto-bulinha-bg.jpeg', 'seed/foto-bulinha-bg.jpeg')
const flyer13 = await up('flyer-13jun.png', 'seed/flyer-13jun.png')
const flyer14 = await up('flyer-14jun.png', 'seed/flyer-14jun.png')
const logoTouros = await up('logo-touros-jmp.png', 'seed/logo-touros-jmp.png')

const femeas = ['IMG_0062', 'IMG_0106', 'IMG_0109', 'IMG_0117']
const touros = ['IMG_0003', 'IMG_0006', 'IMG_0037', 'IMG_0059']
const femeasUrls = []
for (const n of femeas) femeasUrls.push(await up(`galeria-femeas/${n}.jpg`, `seed/galeria-femeas/${n}.jpg`))
const tourosUrls = []
for (const n of touros) tourosUrls.push(await up(`galeria-touros/${n}.jpg`, `seed/galeria-touros/${n}.jpg`))

const content = {
  hero: { backgroundUrl: heroBg, badge: 'Vagas limitadas · 13 e 14 de Junho' },
  whatsappGroupUrl: 'https://chat.whatsapp.com/JYxJPWfkoHHLZfosHlywN9',
  blocks: [
    {
      id: 'aparte-femeas',
      flyerUrl: flyer13,
      flyerAlt: 'Leilão Virtual Bezerras Nelore JMP Premium · 13 de Junho',
      subheading: 'Sábado · 13 de Junho · 240 Bezerras FIV',
      heading: 'Aparte das Fêmeas',
      youtubeUrl: '',
      playlistLabel: 'Playlist YouTube — fêmeas',
      fotos: femeasUrls.map((src, i) => ({
        src, alt: 'Aparte das fêmeas — Leilão Nelore JMP',
        ...(i === 3 ? { objectPosition: 'top' } : {}),
      })),
    },
    {
      id: 'aparte-touros',
      flyerUrl: flyer14,
      flyerAlt: '10º Leilão Nelore JMP · 1000 Touros · 14 de Junho',
      subheading: 'Domingo · 14 de Junho · 1.000 Touros PO',
      heading: 'Aparte dos Touros',
      logoUrl: logoTouros,
      logoAlt: '10ª Leilão Nelore JMP — Touros',
      youtubeUrl: '',
      playlistLabel: 'Playlist YouTube — touros',
      fotos: tourosUrls.map((src) => ({ src, alt: 'Aparte dos touros — Leilão Nelore JMP' })),
    },
  ],
}

// Só grava se ainda não houver registro (não sobrescreve edições do painel).
const client2 = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
await client2.connect()
const { rows } = await client2.query("SELECT 1 FROM public.jmp_landing_content WHERE id='default'")
if (rows.length) {
  console.log('Registro "default" já existe — seed NÃO sobrescreve (preserva edições).')
} else {
  await client2.query(
    "INSERT INTO public.jmp_landing_content (id, data) VALUES ('default', $1::jsonb)",
    [JSON.stringify(content)],
  )
  console.log('Registro inicial gravado com as imagens atuais.')
}
await client2.end()

console.log('\n✓ Setup JMP landing concluído.')
