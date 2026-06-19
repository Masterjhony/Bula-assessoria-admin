// Cria (se não existir) o bucket PRIVADO `cliente-documentos` no Supabase
// Storage e aplica as policies da migration 0034. Idempotente.
//
// Uso: node scripts/setup-cliente-documentos-bucket.mjs

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

const BUCKET = 'cliente-documentos'
// Documentos sensíveis: bucket PRIVADO. Download via signed URL no server.
const CONFIG = {
  public: false,
  fileSizeLimit: 25 * 1024 * 1024, // 25 MB
  allowedMimeTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const { data: buckets, error: listErr } = await supabase.storage.listBuckets()
if (listErr) {
  console.error('Erro ao listar buckets:', listErr.message)
  process.exit(1)
}

const exists = buckets?.some((b) => b.name === BUCKET)
if (exists) {
  console.log(`Bucket "${BUCKET}" já existe — apenas garante config (privado).`)
  const { error: upErr } = await supabase.storage.updateBucket(BUCKET, CONFIG)
  if (upErr) console.warn('Aviso ao atualizar bucket:', upErr.message)
} else {
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, CONFIG)
  if (createErr) {
    console.error('Falha ao criar bucket:', createErr.message)
    process.exit(1)
  }
  console.log(`Bucket "${BUCKET}" criado (privado, até 25MB, PDF/imagem/doc).`)
}

console.log('\nLembrete: rode também a migration 0034 para criar as policies:')
console.log('  node scripts/apply-migration-single.mjs 0034_cliente_documentos_bucket.sql')
