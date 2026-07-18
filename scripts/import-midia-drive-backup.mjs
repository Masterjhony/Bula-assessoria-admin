// Importa mídia (imagens/vídeos) da pasta "BACKUP BULA 2026" do Google Drive
// para o bucket `media` do Supabase Storage, preservando a estrutura de pastas
// em `drive-backup/<Pasta>/<Subpasta>/arquivo`.
//
// Curadoria (pra não lotar o Storage — plano Pro tem 100GB, o backup tem ~600GB):
//   - só formatos exibíveis na web: jpeg/png/webp/gif + mp4/mov/webm
//     (RAW .ARW/.CR2/.DNG, octet-stream e lixo "._*" do macOS ficam de fora)
//   - imagens < 150KB e vídeos < 1MB são ignorados (thumbnails/descartes)
//   - seleção round-robin entre as pastas de topo (Janeiro..Julho, Bula),
//     ~60% do teto pra imagens (maiores primeiro = mais qualidade) e o resto
//     pra vídeos (menores primeiro = posts editados, não brutos)
//
//   --max-file-mb <n>  ignora arquivos maiores que n MB (default 48; bucket aceita até 50)
//   --max-total-gb <n> teto total do import (default 10)
//   --dry-run          só inventaria e mostra o que seria importado
//   --limit <n>        importa no máximo n arquivos (teste)
//
// Idempotente: pula arquivos que já existem no bucket (mesmo caminho).
//
// Uso:
//   node scripts/import-midia-drive-backup.mjs --dry-run
//   node scripts/import-midia-drive-backup.mjs
//
// Requer em .env.local: GOOGLE_SERVICE_ACCOUNT_JSON (pasta compartilhada com o
// service account), NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { google } from 'googleapis'
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

const args = process.argv.slice(2)
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return def
  const v = args[i + 1]
  return v && !v.startsWith('--') ? Number(v) : def
}
const DRY_RUN = args.includes('--dry-run')
const MAX_FILE_MB = flag('max-file-mb', 48)
const MAX_TOTAL_GB = flag('max-total-gb', 10)
const LIMIT = flag('limit', Infinity)

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm'])
const MIN_IMAGE_BYTES = 150 * 1024
const MIN_VIDEO_BYTES = 1024 * 1024
const IMAGE_SHARE = 0.6

const ROOT_FOLDER = '15VbeKlM1SvSGzM6E8g-7aDHqTniR9qBf' // BACKUP BULA 2026
const BUCKET = 'media'
const PREFIX = 'drive-backup'

const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
const auth = new google.auth.GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
})
const drive = google.drive({ version: 'v3', auth })
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const mb = (b) => (b / 1024 / 1024).toFixed(1)
const sanitize = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._\- ]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '-')

// ── 1. Inventário recursivo ──────────────────────────────────────────────────
const all = []
async function walk(folderId, path) {
  let pageToken
  do {
    const r = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: 1000,
      pageToken,
      fields: 'nextPageToken, files(id,name,mimeType,size)',
    })
    for (const f of r.data.files) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        await walk(f.id, path ? `${path}/${f.name}` : f.name)
      } else {
        all.push({ id: f.id, path, name: f.name, mime: f.mimeType || '', size: Number(f.size || 0) })
      }
    }
    pageToken = r.data.nextPageToken
  } while (pageToken)
}

console.log('Inventariando BACKUP BULA 2026 no Drive...')
await walk(ROOT_FOLDER, '')

const media = all.filter((f) => f.mime.startsWith('image/') || f.mime.startsWith('video/'))
const totalAll = media.reduce((a, f) => a + f.size, 0)
console.log(`Arquivos no Drive: ${all.length} | mídia (img+vídeo): ${media.length} (${mb(totalAll)} MB)`)

const byFolder = {}
for (const f of media) {
  const top = f.path.split('/')[0] || '(raiz)'
  byFolder[top] = byFolder[top] || { n: 0, size: 0 }
  byFolder[top].n++
  byFolder[top].size += f.size
}
console.log('\nPor pasta:')
for (const [k, v] of Object.entries(byFolder)) console.log(`  ${k}: ${v.n} arquivos, ${mb(v.size)} MB`)

// ── 2. Curadoria ─────────────────────────────────────────────────────────────
const maxFile = MAX_FILE_MB * 1024 * 1024
const maxTotal = MAX_TOTAL_GB * 1024 * 1024 * 1024

const eligible = media.filter((f) => {
  if (f.name.startsWith('._')) return false
  if (f.size > maxFile) return false
  if (IMAGE_MIMES.has(f.mime)) return f.size >= MIN_IMAGE_BYTES
  if (VIDEO_MIMES.has(f.mime)) return f.size >= MIN_VIDEO_BYTES
  return false
})

// filas por pasta de topo: imagens maiores primeiro, vídeos menores primeiro
const folders = [...new Set(eligible.map((f) => f.path.split('/')[0] || '(raiz)'))]
const queues = {}
for (const top of folders) {
  const inFolder = eligible.filter((f) => (f.path.split('/')[0] || '(raiz)') === top)
  queues[top] = {
    images: inFolder.filter((f) => IMAGE_MIMES.has(f.mime)).sort((a, b) => b.size - a.size),
    videos: inFolder.filter((f) => VIDEO_MIMES.has(f.mime)).sort((a, b) => a.size - b.size),
  }
}

function roundRobin(kind, budget, selected, accStart) {
  let acc = accStart
  let progress = true
  while (progress && selected.length < LIMIT) {
    progress = false
    for (const top of folders) {
      if (selected.length >= LIMIT) break
      const q = queues[top][kind]
      const idx = q.findIndex((f) => acc + f.size <= budget)
      if (idx !== -1) {
        const [f] = q.splice(idx, 1)
        selected.push(f)
        acc += f.size
        progress = true
      }
    }
  }
  return acc
}

const selected = []
let acc = roundRobin('images', Math.floor(maxTotal * IMAGE_SHARE), selected, 0)
acc = roundRobin('videos', maxTotal, selected, acc)
// sobrou orçamento (poucos vídeos)? volta pras imagens
acc = roundRobin('images', maxTotal, selected, acc)

const nImg = selected.filter((f) => IMAGE_MIMES.has(f.mime)).length
console.log(`\nElegíveis pós-curadoria: ${eligible.length} | selecionados: ${selected.length} (${nImg} imagens, ${selected.length - nImg} vídeos)`)

console.log(`Seleção: ${mb(acc)} MB (caps: ${MAX_FILE_MB}MB/arquivo, ${MAX_TOTAL_GB}GB total)`)

if (DRY_RUN) {
  console.log('\n--dry-run: nada foi enviado. Amostra da seleção:')
  for (const f of selected.slice(0, 20)) console.log(`  ${mb(f.size)} MB  ${f.path}/${f.name}`)
  process.exit(0)
}

// ── 3. Lista o que já existe no bucket (dedup por caminho) ───────────────────
async function listExisting(prefix) {
  const existing = new Set()
  async function ls(p) {
    let offset = 0
    for (;;) {
      const { data, error } = await supabase.storage.from(BUCKET).list(p, { limit: 1000, offset })
      if (error) throw new Error(`list ${p}: ${error.message}`)
      if (!data?.length) break
      for (const it of data) {
        const full = p ? `${p}/${it.name}` : it.name
        if (it.id === null) await ls(full) // pasta
        else existing.add(full)
      }
      if (data.length < 1000) break
      offset += 1000
    }
  }
  await ls(prefix)
  return existing
}

console.log('\nVerificando o que já existe no bucket...')
const existing = await listExisting(PREFIX)
console.log(`Já no bucket: ${existing.size} arquivos`)

// ── 4. Download do Drive → upload no Storage ─────────────────────────────────
let sent = 0
let sentBytes = 0
let skipped = 0
let failed = 0

for (const f of selected) {
  const destPath = [PREFIX, ...f.path.split('/').filter(Boolean).map(sanitize), sanitize(f.name)].join('/')
  if (existing.has(destPath)) {
    skipped++
    continue
  }
  try {
    const res = await drive.files.get({ fileId: f.id, alt: 'media' }, { responseType: 'arraybuffer' })
    const buf = Buffer.from(res.data)
    const { error } = await supabase.storage.from(BUCKET).upload(destPath, buf, {
      contentType: f.mime,
      cacheControl: '31536000',
      upsert: false,
    })
    if (error) throw new Error(error.message)
    sent++
    sentBytes += buf.length
    if (sent % 25 === 0) console.log(`  ${sent}/${selected.length - skipped} enviados (${mb(sentBytes)} MB)...`)
  } catch (e) {
    failed++
    console.warn(`  FALHA ${destPath}: ${e.message}`)
  }
}

console.log(`\nConcluído: ${sent} enviados (${mb(sentBytes)} MB), ${skipped} já existiam, ${failed} falhas.`)
