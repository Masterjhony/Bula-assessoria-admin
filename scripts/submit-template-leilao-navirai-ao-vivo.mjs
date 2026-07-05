/**
 * Submete à Meta o template MARKETING "leilão ao vivo — Naviraí" (o disparo que o
 * Marcelo pediu: "Faz um disparo falando que estamos ao vivo").
 *
 * Estrutura pensada pra APROVAR RÁPIDO (padrões da Meta p/ template MARKETING):
 *   - HEADER TEXT curto (sem variável) → não exige example de header
 *   - BODY com 1 variável {{1}} (1º nome) + example.body_text obrigatório
 *   - FOOTER com a marca (assinatura) — WhatsApp já injeta o opt-out de marketing
 *   - Sem botão de URL (evita validação de link e acelera a análise)
 *   - Texto claro, sem promessa enganosa, sem typo (o print trazia "GATIS")
 *
 *   node scripts/submit-template-leilao-navirai-ao-vivo.mjs           # dry-run (mostra o payload)
 *   node scripts/submit-template-leilao-navirai-ao-vivo.mjs --submit  # envia pra Meta
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
const NAME = 'leilao_navirai_ao_vivo_20260705'
const LANGUAGE = 'pt_BR'
const CATEGORY = 'MARKETING'

// HEADER TEXT da Meta: sem emoji, sem asteriscos, sem quebra de linha.
const HEADER_TEXT = 'Leilão de Touros e Matrizes Naviraí AO VIVO'
// {{1}} = 1º nome do lead. Negrito com *asteriscos* (formatação do WhatsApp).
const BODY_TEXT = `Bom dia, {{1}}! 🐂

Estamos *AO VIVO* com o *Leilão de Touros e Matrizes Naviraí*.

✅ 30x no boleto
✅ Frete grátis

É só entrar para assistir e dar os seus lances. Te esperamos no leilão!`
const FOOTER_TEXT = 'Bula Assessoria'
const BODY_EXAMPLE = ['João'] // exemplo do {{1}} exigido pela Meta

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

console.log(`Template: ${NAME}  (${CATEGORY} / ${LANGUAGE})\n`)
console.log('Prévia:')
console.log('─'.repeat(60))
console.log(`*${HEADER_TEXT}*\n`)
console.log(BODY_TEXT.replace('{{1}}', 'João'))
console.log(`\n_${FOOTER_TEXT}_`)
console.log('─'.repeat(60))
console.log(`\nPayload enviado à Meta:\n${JSON.stringify(payload, null, 2)}`)

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
  console.error(`\n✗ Meta rejeitou a submissão: ${json?.error?.message || `HTTP ${res.status}`}` +
    `${json?.error?.error_user_msg ? ` — ${json.error.error_user_msg}` : ''}`)
  process.exit(1)
}
console.log(`\n✓ Submetido à Meta.  id=${json.id}  status=${json.status || 'PENDING'}  category=${json.category || CATEGORY}`)
console.log('Acompanhe a aprovação em: Central WhatsApp › Templates › "Sincronizar status".')
