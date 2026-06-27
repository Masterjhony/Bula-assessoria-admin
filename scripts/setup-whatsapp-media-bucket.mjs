// Cria (se não existir) o bucket PRIVADO `whatsapp-media` no Supabase Storage.
// Guarda a mídia inbound do WhatsApp (áudio/imagem/vídeo/documento) baixada da
// Graph API, acessível no inbox via signed URL. Só o server (service role) toca
// nesse bucket, então não precisa de policies RLS. Idempotente.
//
// Uso: node scripts/setup-whatsapp-media-bucket.mjs

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

const BUCKET = 'whatsapp-media'
// Bucket PRIVADO. Download via signed URL no server. Sem allowedMimeTypes: a
// Meta manda ogg/opus, m4a, 3gp etc. — restringir só geraria rejeição.
const CONFIG = {
  public: false,
  fileSizeLimit: 50 * 1024 * 1024, // 50 MB (cobre vídeo curto)
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
  console.log(`Bucket "${BUCKET}" criado (privado, até 50MB).`)
}

console.log('Pronto. Mídia inbound do WhatsApp passa a ser guardada aqui.')
