/**
 * Submete à Meta o template UTILITY `bula_material` com HEADER de DOCUMENTO (PDF).
 * É o mold "manda o catálogo/material" — reutilizável em qualquer leilão: no disparo
 * você anexa o PDF que quiser; o template só define o formato.
 *
 * Header de mídia exige um `header_handle` (arquivo-EXEMPLO) no ato da criação —
 * a Meta usa só como amostra de formato, não é o que o cliente recebe. Este script:
 *   1. gera um PDF-modelo mínimo válido
 *   2. sobe pela Resumable Upload API (/{APP_ID}/uploads) e pega o handle
 *   3. cria o template com HEADER DOCUMENT + BODY {{1}}=nome {{2}}=leilão + FOOTER
 *
 *   node scripts/submit-template-material-pdf.mjs           # dry-run (gera PDF e para)
 *   node scripts/submit-template-material-pdf.mjs --submit  # sobe o handle e submete
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
function loadEnv(file) {
  const p = path.join(ROOT, file)
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
}
loadEnv('.env.local')

const SUBMIT = process.argv.slice(2).includes('--submit')
const GRAPH = (process.env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v25.0').replace(/^v?/, 'v')
const WABA = process.env.WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID || process.env.WABA_ID
const TOKEN = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN
const APP_ID = process.env.META_APP_ID || process.env.WHATSAPP_CLOUD_APP_ID || '2406166973231233' // derivado via debug_token
if (!WABA || !TOKEN) { console.error('faltam WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID / _ACCESS_TOKEN'); process.exit(1) }

const NAME = 'bula_material'
const LANG = 'pt_BR'
const CATEGORY = 'UTILITY'
const HEADER_FORMAT = 'DOCUMENT'
const BODY_TEXT = `Olá, {{1}}! 📄

Segue o material do *{{2}}* que combinamos.

Qualquer dúvida sobre os lotes, condições de pagamento ou frete, é só me chamar por aqui.`
const FOOTER_TEXT = 'Bula Assessoria'
const BODY_EXAMPLE = ['João', 'Leilão de Touros e Matrizes Naviraí']

// ── PDF-modelo mínimo válido (com xref/offsets corretos) ─────────────────────
function buildSamplePdf() {
  const content = `BT /F1 16 Tf 24 72 Td (Catalogo - modelo Bula Assessoria) Tj ET`
  const objs = [
    `<</Type /Catalog /Pages 2 0 R>>`,
    `<</Type /Pages /Kids [3 0 R] /Count 1>>`,
    `<</Type /Page /Parent 2 0 R /MediaBox [0 0 320 160] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>> >> >>`,
    `<</Length ${Buffer.byteLength(content)}>>\nstream\n${content}\nendstream`,
    `<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>`,
  ]
  let pdf = `%PDF-1.4\n`
  const offsets = []
  objs.forEach((o, i) => {
    offsets[i] = Buffer.byteLength(pdf, 'latin1')
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  const n = objs.length + 1
  pdf += `xref\n0 ${n}\n0000000000 65535 f \n`
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<</Size ${n} /Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`
  return Buffer.from(pdf, 'latin1')
}

async function uploadHandle(buf) {
  // 1) inicia a sessão de upload
  const startUrl = `https://graph.facebook.com/${GRAPH}/${APP_ID}/uploads` +
    `?file_name=catalogo-modelo.pdf&file_length=${buf.length}&file_type=application/pdf&access_token=${encodeURIComponent(TOKEN)}`
  const startRes = await fetch(startUrl, { method: 'POST', signal: AbortSignal.timeout(30000) })
  const startJson = await startRes.json().catch(() => null)
  if (!startRes.ok || !startJson?.id) throw new Error(`falha ao iniciar upload: ${startJson?.error?.message || `HTTP ${startRes.status}`}`)
  const sessionId = startJson.id // "upload:..."

  // 2) envia os bytes e recebe o handle
  const upRes = await fetch(`https://graph.facebook.com/${GRAPH}/${sessionId}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${TOKEN}`, file_offset: '0' },
    body: buf,
    signal: AbortSignal.timeout(60000),
  })
  const upJson = await upRes.json().catch(() => null)
  if (!upRes.ok || !upJson?.h) throw new Error(`falha ao subir bytes: ${upJson?.error?.message || `HTTP ${upRes.status}`}`)
  return upJson.h
}

async function main() {
  const pdf = buildSamplePdf()
  console.log(`Template: ${NAME}  (${CATEGORY} / ${LANG})   header=${HEADER_FORMAT}(PDF)   {{1}}=nome  {{2}}=leilão`)
  console.log(`APP_ID: ${APP_ID}   PDF-modelo: ${pdf.length} bytes\n`)
  console.log('Prévia do corpo:')
  console.log('─'.repeat(60))
  console.log('[📄 documento anexado no disparo]\n')
  console.log(BODY_TEXT.replace('{{1}}', BODY_EXAMPLE[0]).replace('{{2}}', BODY_EXAMPLE[1]))
  console.log(`\n_${FOOTER_TEXT}_`)
  console.log('─'.repeat(60))

  if (!SUBMIT) {
    console.log('\n[DRY-RUN] PDF-modelo gerado, nada enviado. Rode com --submit para subir o handle e submeter.')
    return
  }

  console.log('\nSubindo o PDF-modelo...')
  const handle = await uploadHandle(pdf)
  console.log(`  handle: ${handle.slice(0, 40)}…`)

  const payload = {
    name: NAME, category: CATEGORY, language: LANG,
    components: [
      { type: 'HEADER', format: HEADER_FORMAT, example: { header_handle: [handle] } },
      { type: 'BODY', text: BODY_TEXT, example: { body_text: [BODY_EXAMPLE] } },
      { type: 'FOOTER', text: FOOTER_TEXT },
    ],
  }
  const res = await fetch(`https://graph.facebook.com/${GRAPH}/${WABA}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    console.error(`\n✗ Meta rejeitou: ${json?.error?.message || `HTTP ${res.status}`}`)
    process.exit(1)
  }
  console.log(`\n✓ Submetido — id=${json.id}  status=${json.status || 'PENDING'}  category=${json.category || CATEGORY}`)
}

main().catch(e => { console.error(`\n✗ ${e.message}`); process.exit(1) })
