/**
 * Submete à Meta o template MARKETING `bula_leilao_convite_video` — o convite
 * do João com HEADER de VÍDEO (dinâmico) e TUDO que muda como variável, para
 * ser reutilizável em qualquer leilão sem submeter/esperar aprovação de novo.
 *
 * Header de mídia exige um `header_handle` (vídeo-EXEMPLO) no ato da criação — a
 * Meta usa só como amostra de formato, NÃO é o que o cliente recebe (no disparo
 * você anexa o vídeo do leilão da vez). Este script:
 *   1. sobe o vídeo-modelo pela Resumable Upload API (/{APP_ID}/uploads)
 *   2. pega o handle
 *   3. cria o template com HEADER VIDEO + BODY {{1..5}} + FOOTER
 *
 * Variáveis do BODY:
 *   {{1}} = 1º nome do lead        (ex.: João)
 *   {{2}} = nome do leilão         (ex.: Leilão de Touros Nelore Kriz)
 *   {{3}} = horário                (ex.: 20:00)
 *   {{4}} = condição pgto/frete    (ex.: 30X NO BOLETO • FRETE GRÁTIS)
 *   {{5}} = categoria/objetivo     (ex.: touros PO)
 *
 *   node scripts/submit-template-leilao-convite-video.mjs           # dry-run (preview)
 *   node scripts/submit-template-leilao-convite-video.mjs --submit  # sobe o vídeo e submete
 *   node scripts/submit-template-leilao-convite-video.mjs --submit --video "F:/outro.mp4"
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

const args = process.argv.slice(2)
const SUBMIT = args.includes('--submit')
const videoIdx = args.indexOf('--video')
const VIDEO_PATH = videoIdx >= 0 ? args[videoIdx + 1] : 'F:/videooo.mp4'

const GRAPH = (process.env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v25.0').replace(/^v?/, 'v')
const WABA = process.env.WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID || process.env.WABA_ID
const TOKEN = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN
const APP_ID = process.env.META_APP_ID || process.env.WHATSAPP_CLOUD_APP_ID || '2406166973231233'
if (!WABA || !TOKEN) { console.error('faltam WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID / _ACCESS_TOKEN'); process.exit(1) }

const NAME = 'bula_leilao_convite_video'
const LANG = 'pt_BR'
const CATEGORY = 'MARKETING'
const HEADER_FORMAT = 'VIDEO'
// Começa com texto fixo (a Meta rejeita body iniciado por variável) e termina
// com "?" (idem para fim). Sem variáveis adjacentes. *negrito* com asteriscos.
const BODY_TEXT = `Olá, {{1}}! 😉

João Antônio, da Bula Assessoria aqui!

Passando para te convidar para o nosso *{{2}}*, que acontecerá às *{{3}}* (horário de Brasília).

*{{4}}*

Como está seu momento? Precisando repor {{5}} pra próxima safra? Me chama aqui que eu te passo os detalhes.`
const FOOTER_TEXT = 'Bula Assessoria'
const BODY_EXAMPLE = ['João', 'Leilão de Touros Nelore Kriz', '20:00', '30X NO BOLETO • FRETE GRÁTIS', 'touros PO']

async function uploadHandle(buf, fileName, fileType) {
  // 1) inicia a sessão de upload
  const startUrl = `https://graph.facebook.com/${GRAPH}/${APP_ID}/uploads` +
    `?file_name=${encodeURIComponent(fileName)}&file_length=${buf.length}&file_type=${encodeURIComponent(fileType)}&access_token=${encodeURIComponent(TOKEN)}`
  const startRes = await fetch(startUrl, { method: 'POST', signal: AbortSignal.timeout(30000) })
  const startJson = await startRes.json().catch(() => null)
  if (!startRes.ok || !startJson?.id) throw new Error(`falha ao iniciar upload: ${startJson?.error?.message || `HTTP ${startRes.status}`}`)
  const sessionId = startJson.id // "upload:..."

  // 2) envia os bytes e recebe o handle
  const upRes = await fetch(`https://graph.facebook.com/${GRAPH}/${sessionId}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${TOKEN}`, file_offset: '0' },
    body: buf,
    signal: AbortSignal.timeout(120000),
  })
  const upJson = await upRes.json().catch(() => null)
  if (!upRes.ok || !upJson?.h) throw new Error(`falha ao subir bytes: ${upJson?.error?.message || `HTTP ${upRes.status}`}`)
  return upJson.h
}

function preview() {
  let b = BODY_TEXT
  BODY_EXAMPLE.forEach((v, i) => { b = b.replaceAll(`{{${i + 1}}}`, v) })
  console.log(`Template: ${NAME}  (${CATEGORY} / ${LANG})   header=${HEADER_FORMAT}`)
  console.log(`Vídeo-modelo: ${VIDEO_PATH}`)
  console.log(`Variáveis: {{1}}=nome  {{2}}=leilão  {{3}}=horário  {{4}}=condição  {{5}}=categoria\n`)
  console.log('─'.repeat(60))
  console.log('[🎬 vídeo anexado no disparo]\n')
  console.log(b)
  console.log(`\n_${FOOTER_TEXT}_`)
  console.log('─'.repeat(60))
}

async function main() {
  preview()

  if (!fs.existsSync(VIDEO_PATH)) {
    console.error(`\n✗ vídeo-modelo não encontrado: ${VIDEO_PATH}`)
    process.exit(1)
  }
  const buf = fs.readFileSync(VIDEO_PATH)
  console.log(`\nVídeo-modelo: ${(buf.length / 1024 / 1024).toFixed(1)} MB`)

  if (!SUBMIT) {
    console.log('\n[DRY-RUN] nada enviado. Rode com --submit para subir o vídeo e submeter à Meta.')
    return
  }

  console.log('Subindo o vídeo-modelo (Resumable Upload)…')
  const handle = await uploadHandle(buf, path.basename(VIDEO_PATH), 'video/mp4')
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
    if (json?.error?.error_user_msg) console.error(`  detalhe: ${json.error.error_user_msg}`)
    process.exit(1)
  }
  console.log(`\n✓ Submetido — id=${json.id}  status=${json.status || 'PENDING'}  category=${json.category || CATEGORY}`)
  console.log('  Acompanhe a aprovação (normalmente minutos a algumas horas).')
}

main().catch(e => { console.error(`\n✗ ${e.message}`); process.exit(1) })
