// Cria (se não existir) o bucket `lote-gifs` no Supabase Storage e lembra de
// aplicar as policies da migration 0044. Idempotente.
//
// Uso: node scripts/setup-lote-gifs-bucket.mjs

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

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
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios em .env.local')
  process.exit(1)
}

const BUCKET = 'lote-gifs'
const CONFIG = {
  public: true,
  fileSizeLimit: 25 * 1024 * 1024, // 25 MB (vídeos curtos)
  allowedMimeTypes: ['video/mp4', 'video/webm', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'],
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const { data: buckets, error: listErr } = await supabase.storage.listBuckets()
if (listErr) {
  console.error('Erro ao listar buckets:', listErr.message)
  process.exit(1)
}

if (buckets?.some((b) => b.name === BUCKET)) {
  console.log(`Bucket "${BUCKET}" já existe — apenas garante config pública.`)
  const { error } = await supabase.storage.updateBucket(BUCKET, CONFIG)
  if (error) console.warn('Aviso ao atualizar bucket:', error.message)
} else {
  const { error } = await supabase.storage.createBucket(BUCKET, CONFIG)
  if (error) {
    console.error('Falha ao criar bucket:', error.message)
    process.exit(1)
  }
  console.log(`Bucket "${BUCKET}" criado (público, até 25MB, vídeo/gif/imagem).`)
}

console.log('\nLembrete: rode também a migration 0044 para criar as policies:')
console.log('  node scripts/apply-migration-single.mjs 0044_lote_gifs_bucket.sql')
