/**
 * Submete à Meta o template MARKETING GENÉRICO "leilão ao vivo" — reutilizável em
 * QUALQUER leilão nosso. Em vez de um template por leilão, é um só com o nome do
 * leilão como variável ({{2}}), então toda vez que entrarmos ao vivo basta disparar
 * passando o nome (scripts/disparo-leilao-ao-vivo.mjs --leilao "...").
 *
 * Variáveis:  {{1}} = 1º nome do lead   ·   {{2}} = nome do leilão
 *
 * Formato pensado p/ APROVAR RÁPIDO (padrões Meta p/ MARKETING):
 *   - HEADER TEXT curto, sem emoji/asterisco/quebra (a Meta rejeita esses no header)
 *   - BODY com 2 variáveis + example.body_text (obrigatório)
 *   - FOOTER com a marca; o WhatsApp injeta o opt-out de marketing
 *   - Sem botão de URL (acelera a análise)
 *   - Saudação neutra ("Olá") p/ servir manhã/tarde/noite
 *
 *   node scripts/submit-template-leilao-ao-vivo-generico.mjs           # dry-run
 *   node scripts/submit-template-leilao-ao-vivo-generico.mjs --submit  # envia à Meta
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
const WABA = process.env.WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WABA_ID
const TOKEN = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN
if (!WABA || !TOKEN) { console.error('faltam WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID / _ACCESS_TOKEN'); process.exit(1) }

// ── template ─────────────────────────────────────────────────────────────────
const NAME = 'bula_leilao_ao_vivo'
const LANGUAGE = 'pt_BR'
const CATEGORY = 'MARKETING'

const HEADER_TEXT = 'Estamos AO VIVO agora'
// {{1}} = 1º nome · {{2}} = nome do leilão. Negrito com *asteriscos* (WhatsApp).
const BODY_TEXT = `Olá, {{1}}! 🐂

Estamos *AO VIVO* com o *{{2}}*.

✅ 30x no boleto
✅ Frete grátis

É só entrar para assistir e dar os seus lances. Te esperamos no leilão!`
const FOOTER_TEXT = 'Bula Assessoria'
// exemplo dos {{1}} e {{2}} exigido pela Meta
const BODY_EXAMPLE = ['João', 'Leilão de Touros e Matrizes Naviraí']

const payload = {
  name: NAME,
  category: CATEGORY,
  language: LANGUAGE,
  components: [
    { type: 'HEADER', format: 'TEXT', text: HEADER_TEXT },
    { type: 'BODY', text: BODY_TEXT, example: { body_text: [BODY_EXAMPLE] } },
    { type: 'FOOTER', text: FOOTER_TEXT },
  ],
}

console.log(`Template: ${NAME}  (${CATEGORY} / ${LANGUAGE})   {{1}}=nome  {{2}}=leilão\n`)
console.log('Prévia (com valores de exemplo):')
console.log('─'.repeat(60))
console.log(`*${HEADER_TEXT}*\n`)
console.log(BODY_TEXT.replace('{{1}}', BODY_EXAMPLE[0]).replace('{{2}}', BODY_EXAMPLE[1]))
console.log(`\n_${FOOTER_TEXT}_`)
console.log('─'.repeat(60))

if (!SUBMIT) {
  console.log('\n[DRY-RUN] Nada submetido. Rode com --submit para enviar à Meta.')
  process.exit(0)
}

const res = await fetch(`https://graph.facebook.com/${GRAPH}/${WABA}/message_templates`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(30000),
})
const json = await res.json().catch(() => null)
if (!res.ok) {
  console.error(`\n✗ Meta rejeitou: ${json?.error?.message || `HTTP ${res.status}`}` +
    `${json?.error?.error_user_msg ? ` — ${json.error.error_user_msg}` : ''}`)
  process.exit(1)
}
console.log(`\n✓ Submetido à Meta.  id=${json.id}  status=${json.status || 'PENDING'}  category=${json.category || CATEGORY}`)
console.log(`\nQuando aprovar, dispare com:\n  node scripts/disparo-leilao-ao-vivo.mjs --leilao "Leilão de Touros e Matrizes Naviraí" --send`)
