/**
 * Submetedor EM LOTE da biblioteca de templates-molde da Bula.
 *
 * Filosofia: poucos templates genéricos com variáveis ({{1}}, {{2}}…) que cobrem
 * uma ampla gama de situações — em vez de submeter um template por evento. Para
 * adicionar um mold novo no futuro, basta acrescentar um objeto em TEMPLATES.
 *
 * Regras da Meta embutidas no desenho (p/ aprovar rápido):
 *   - HEADER TEXT sem emoji/asterisco/quebra de linha
 *   - BODY pode ter emoji e *negrito*; toda variável precisa de exemplo
 *   - FOOTER curto com a marca (WhatsApp injeta o opt-out de marketing)
 *   - UTILITY p/ relacionamento (aprova rápido, sem limite de marketing) / MARKETING p/ promo
 *
 *   node scripts/submit-templates-biblioteca.mjs           # dry-run (mostra prévias)
 *   node scripts/submit-templates-biblioteca.mjs --submit  # envia todos à Meta
 *   node scripts/submit-templates-biblioteca.mjs --submit --only bula_oportunidade
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
const ONLY = (() => { const i = args.indexOf('--only'); return i >= 0 ? args[i + 1] : null })()
const GRAPH = (process.env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v25.0').replace(/^v?/, 'v')
const WABA = process.env.WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID || process.env.WABA_ID
const TOKEN = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN
if (!WABA || !TOKEN) { console.error('faltam WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID / _ACCESS_TOKEN'); process.exit(1) }

const LANG = 'pt_BR'
const FOOTER = 'Bula Assessoria'

// ── biblioteca de molds ──────────────────────────────────────────────────────
// vars: exemplos em ORDEM ({{1}}, {{2}}, …) — viram example.body_text.
const TEMPLATES = [
  {
    name: 'bula_leilao_convite',
    category: 'MARKETING',
    header: 'Convite para o próximo leilão',
    body: `Olá, {{1}}! 🐂

Vai acontecer o *{{2}}* em *{{3}}*.

Selecionamos touros e matrizes de alto padrão, com 30x no boleto e frete grátis.

Quer que eu te envie o catálogo e garanta o seu acesso?`,
    vars: ['João', 'Leilão de Touros e Matrizes Naviraí', '12/07 às 20h'],
  },
  {
    name: 'bula_leilao_ultima_chance',
    category: 'MARKETING',
    header: 'Últimos lotes no ar',
    body: `Olá, {{1}}! ⏰

Estão no ar os *últimos lotes* do *{{2}}*.

Se você ficou de olho em algum animal, agora é a hora — 30x no boleto e frete grátis.

Entra que eu te ajudo com o lance.`,
    vars: ['João', 'Leilão de Touros e Matrizes Naviraí'],
  },
  {
    name: 'bula_oportunidade',
    category: 'MARKETING',
    header: 'Oportunidade selecionada',
    body: `Olá, {{1}}! 🐂

Apareceu uma oportunidade em *{{2}}*: {{3}}.

Quer que eu te passe os detalhes, valores e condições?`,
    vars: ['João', 'touros Nelore P.O', '3 reprodutores avaliados, com pronta entrega'],
  },
  {
    name: 'bula_pos_leilao',
    category: 'UTILITY',
    header: 'Obrigado por acompanhar',
    body: `Olá, {{1}}!

Obrigado por acompanhar o *{{2}}*.

Arrematou algum lote ou quer que eu veja uma condição especial no particular? Posso te ajudar por aqui.`,
    vars: ['João', 'Leilão de Touros e Matrizes Naviraí'],
  },
]

function buildPayload(t) {
  const nVars = (t.body.match(/\{\{\s*\d+\s*\}\}/g) || []).length
  const components = [
    { type: 'HEADER', format: 'TEXT', text: t.header },
    { type: 'BODY', text: t.body, ...(nVars > 0 ? { example: { body_text: [t.vars.slice(0, nVars)] } } : {}) },
    { type: 'FOOTER', text: FOOTER },
  ]
  return { name: t.name, category: t.category, language: LANG, components }
}

function preview(t) {
  let b = t.body
  t.vars.forEach((v, i) => { b = b.replace(new RegExp(`\\{\\{\\s*${i + 1}\\s*\\}\\}`, 'g'), v) })
  return `*${t.header}*\n\n${b}\n\n_${FOOTER}_`
}

async function submitOne(t) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH}/${WABA}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload(t)),
    signal: AbortSignal.timeout(30000),
  })
  const json = await res.json().catch(() => null)
  if (res.ok) return { ok: true, id: json?.id, status: json?.status || 'PENDING' }
  const msg = json?.error?.message || `HTTP ${res.status}`
  const dup = /already exists/i.test(msg) || json?.error?.error_subcode === 2388023
  return { ok: false, dup, error: msg }
}

async function main() {
  const list = ONLY ? TEMPLATES.filter(t => t.name === ONLY) : TEMPLATES
  if (list.length === 0) { console.error(`Nenhum template chamado "${ONLY}".`); process.exit(1) }

  console.log(`${SUBMIT ? 'SUBMETENDO' : 'DRY-RUN'} — ${list.length} template(s) · idioma ${LANG}\n`)
  for (const t of list) {
    const nVars = (t.body.match(/\{\{\s*\d+\s*\}\}/g) || []).length
    console.log(`■ ${t.name}  (${t.category})  ${nVars} variável(is)`)
    console.log('─'.repeat(60))
    console.log(preview(t))
    console.log('─'.repeat(60))
    if (SUBMIT) {
      const r = await submitOne(t)
      if (r.ok) console.log(`  ✓ submetido — id=${r.id}  status=${r.status}`)
      else if (r.dup) console.log(`  • já existe na Meta (pulado)`)
      else console.log(`  ✗ falhou: ${r.error}`)
    }
    console.log('')
  }
  if (!SUBMIT) console.log('[DRY-RUN] Nada enviado. Rode com --submit para enviar todos à Meta.')
}

main().catch(e => { console.error(e); process.exit(1) })
