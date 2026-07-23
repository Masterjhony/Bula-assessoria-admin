/**
 * Disparo de captação — 23º Mega Leilão Genética Aditiva (25-26/07/2026).
 * Template: bula_convite_evento_imagem (header = flyer oficial dos 2 leilões).
 *
 * Público (escolha ranqueada, top N):
 *   • sem opt-out, sem handoff, não arquivado, telefone válido;
 *   • ainda NÃO habilitado (sem cadastro aprovado) e não CLIENTE;
 *   • sem template/disparo recebido nos últimos 7 dias (fadiga);
 *   • ranking: termômetro (lead_score.prob) + interesse compatível (touros/
 *     matrizes/leilões) + tem I.E. + engajamento recente + etapa no funil.
 *
 *   node scripts/disparo-genetica-aditiva-2026-07-25.mjs             # dry-run
 *   node scripts/disparo-genetica-aditiva-2026-07-25.mjs --send      # envia
 *   node scripts/disparo-genetica-aditiva-2026-07-25.mjs --send --limit 100
 *   node scripts/disparo-genetica-aditiva-2026-07-25.mjs --log-only  # só registra no cockpit (backfill)
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const GRAPH = (env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v25.0').replace(/^v?/, 'v')

const args = process.argv.slice(2)
const SEND = args.includes('--send')
const LOG_ONLY = args.includes('--log-only')
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? Number(args[i + 1]) : 100 })()

const ORIGIN = 'disparo-genetica-aditiva-2026-07-25'
const TEMPLATE = 'bula_convite_evento_imagem'
const SANDBOX = new Set(['553784044850'])
const IMG_LOCAL = 'F:/genetica aditiva 2 leilos.jpeg'
const IMG_PATH = 'whatsapp-2026/genetica-aditiva-2-leiloes-2026-07-25.jpeg'

const PARAMS_FIXOS = [
  '23º Mega Leilão Genética Aditiva — Fêmeas e Touros Nelore PO',
  '25/07 (sábado, 12h — fêmeas) e 26/07 (domingo, 9h — touros), virtual',
  '30x no boleto e frete grátis',
]

const norm = (p) => {
  let d = String(p ?? '').replace(/\D/g, '')
  if (!d) return null
  if (!(d.startsWith('55') && d.length >= 12) && (d.length === 10 || d.length === 11)) d = `55${d}`
  return d.length >= 12 && d.length <= 13 ? d : null
}
const firstName = (nome) => {
  const t = String(nome ?? '').trim().split(/\s+/)[0]
  return /^[A-Za-zÀ-ÿ]{2,}$/.test(t) ? t[0].toUpperCase() + t.slice(1).toLowerCase() : 'produtor(a)'
}

// ── 1. Flyer oficial → bucket público (idempotente) ─────────────────────────
const buf = readFileSync(IMG_LOCAL)
await supabase.storage.from('leilao-covers').upload(IMG_PATH, buf, { contentType: 'image/jpeg', upsert: true })
const CAPA = supabase.storage.from('leilao-covers').getPublicUrl(IMG_PATH).data.publicUrl
console.log('capa:', CAPA, `(${(buf.length / 1024).toFixed(0)} KB)`)

// ── 2. Fadiga: quem já recebeu template/disparo nos últimos 7 dias ──────────
const since7d = new Date(Date.now() - 7 * 864e5).toISOString()
const fadiga = new Set()
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('whatsapp_messages')
    .select('phone, bot_step, origin')
    .eq('direction', 'outbound').gte('created_at', since7d)
    .range(from, from + 999)
  if (error) throw new Error(error.message)
  for (const m of data ?? []) {
    const isTemplate = String(m.bot_step ?? '').startsWith('template:')
      || /disparo|reengajamento/i.test(String(m.origin ?? ''))
    if (isTemplate) { const p = norm(m.phone); if (p) fadiga.add(p) }
  }
  if (!data || data.length < 1000) break
}
console.log('em fadiga (template <7d):', fadiga.size)

// ── 3. Leads candidatos (paginado — nunca confiar no cap de 1000) ───────────
const candidatos = new Map() // phone -> {lead, score}
let vistos = 0
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('crm_leads')
    .select('id, nome, telefone, celular, status, interesse_principal, interesse, o_que_busca, tem_inscricao_estadual, inscricao_estadual, optout_whatsapp, handoff_humano, arquivado, last_whatsapp_at, extra_data')
    .range(from, from + 999)
  if (error) throw new Error(error.message)
  for (const l of data ?? []) {
    vistos++
    if (l.optout_whatsapp || l.handoff_humano || l.arquivado) continue
    const phone = norm(l.celular) || norm(l.telefone)
    if (!phone || SANDBOX.has(phone) || fadiga.has(phone)) continue
    const xd = l.extra_data ?? {}
    if (xd.cadastro_aprovado === true || xd.cadastro_status === 'aprovado') continue
    const status = String(l.status ?? '').toUpperCase()
    if (status.includes('CLIENTE')) continue

    const interesse = String(l.interesse_principal ?? l.interesse ?? '').toLowerCase()
    const busca = String(l.o_que_busca ?? '').toLowerCase()
    const prob = Number(xd.lead_score?.prob ?? 0)
    const lastWa = l.last_whatsapp_at ? Date.now() - new Date(l.last_whatsapp_at).getTime() : Infinity
    const temIe = String(l.tem_inscricao_estadual ?? '').toLowerCase() === 'sim' || Boolean(String(l.inscricao_estadual ?? '').replace(/\D/g, ''))

    let score = prob * 40
    if (/touro|matriz|leil|interesse_amplo|femea|fêmea|bezerr/.test(interesse + ' ' + busca)) score += 25
    else if (interesse) score += 10
    if (temIe) score += 15
    if (lastWa < 30 * 864e5) score += 15
    else if (lastWa < 90 * 864e5) score += 8
    if (/QUALIFICA|INFORMA|CADASTRO/.test(status)) score += 10
    else if (status.includes('CONEX')) score += 6
    else if (status.includes('ENTRADA')) score += 3
    if (status.includes('PERDID')) score -= 10
    if (xd.aceitou_assessoria === true) score += 10

    const atual = candidatos.get(phone)
    if (!atual || score > atual.score) candidatos.set(phone, { lead: l, phone, score })
  }
  if (!data || data.length < 1000) break
}

const lista = [...candidatos.values()].sort((a, b) => b.score - a.score).slice(0, LIMIT)
console.log(`leads varridos: ${vistos} · candidatos: ${candidatos.size} · selecionados: ${lista.length}`)

const porStatus = {}
const porInteresse = {}
for (const c of lista) {
  const s = String(c.lead.status ?? '?').toUpperCase()
  porStatus[s] = (porStatus[s] ?? 0) + 1
  const i = String(c.lead.interesse_principal ?? c.lead.interesse ?? 'sem interesse').toLowerCase()
  porInteresse[i] = (porInteresse[i] ?? 0) + 1
}
console.log('por status:', JSON.stringify(porStatus))
console.log('por interesse:', JSON.stringify(porInteresse))
console.log('amostra top 10:', lista.slice(0, 10).map(c => `${firstName(c.lead.nome)} (${c.score.toFixed(0)})`).join(', '))

const renderBody = (nome) =>
  `[imagem: flyer Genética Aditiva]\nOlá, ${nome}! 🐂\n\nConvite da Bula: *${PARAMS_FIXOS[0]}*, dia *${PARAMS_FIXOS[1]}*.\n\nCondição: ${PARAMS_FIXOS[2]}.\n\nNossa equipe já apartou os destaques. Quer que eu te envie o catálogo e os lotes que valem a pena pro seu perfil?`
const logRow = (c) => ({
  phone: c.phone,
  name: String(c.lead.nome ?? '').trim() || c.phone,
  direction: 'outbound', body: renderBody(firstName(c.lead.nome)), status: 'sent',
  origin: ORIGIN, bot_step: `template:${TEMPLATE}`,
})

// Backfill do registro (o envio de 22/07 rodou, mas o insert do log falhou por
// falta do campo `name`, NOT NULL na tabela). Idempotente por (phone, origin).
if (LOG_ONLY) {
  let inseridos = 0, jaTinha = 0
  for (const c of lista) {
    const { data: existe } = await supabase.from('whatsapp_messages')
      .select('id').eq('phone', c.phone).eq('origin', ORIGIN).limit(1)
    if (existe?.length) { jaTinha++; continue }
    const { error } = await supabase.from('whatsapp_messages').insert(logRow(c))
    if (error) console.warn(`log ${c.phone}:`, error.message)
    else inseridos++
  }
  console.log(`\nLOG-ONLY: ${inseridos} registrados · ${jaTinha} já existiam.`)
  process.exit(0)
}

if (!SEND) { console.log('\nDRY-RUN — nada enviado. Rode com --send para disparar.'); process.exit(0) }

// ── 4. Envio com jitter anti-rajada ─────────────────────────────────────────
let enviados = 0, falhas = 0
for (const c of lista) {
  const nome = firstName(c.lead.nome)
  const params = [nome, ...PARAMS_FIXOS]
  const res = await fetch(`https://graph.facebook.com/${GRAPH}/${env.WHATSAPP_CLOUD_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WHATSAPP_CLOUD_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', recipient_type: 'individual', to: c.phone, type: 'template',
      template: {
        name: TEMPLATE, language: { code: 'pt_BR' },
        components: [
          { type: 'header', parameters: [{ type: 'image', image: { link: CAPA } }] },
          { type: 'body', parameters: params.map(text => ({ type: 'text', text })) },
        ],
      },
    }),
  }).catch(() => null)
  const body = await res?.json().catch(() => ({}))
  const ok = res?.ok && body?.messages?.[0]?.id
  if (ok) {
    enviados++
    await supabase.from('whatsapp_messages').insert(logRow(c))
      .then(r => { if (r.error) console.warn('log falhou:', r.error.message) })
  } else {
    falhas++
    console.warn(`FALHA ${c.phone}: ${body?.error?.message ?? res?.status ?? 'sem resposta'}`)
  }
  if ((enviados + falhas) % 20 === 0) console.log(`progresso: ${enviados} ok · ${falhas} falhas`)
  await new Promise(r => setTimeout(r, 1200 + Math.random() * 1500))
}
console.log(`\nCONCLUÍDO: ${enviados} enviados · ${falhas} falhas · origin=${ORIGIN}`)
