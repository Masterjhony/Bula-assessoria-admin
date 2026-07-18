/**
 * Reengaja o "limbo": leads que ESCREVERAM e ficaram SEM resposta (última
 * mensagem inbound, sem handoff/opt-out) — o pessoal que caiu no vão entre o
 * welcome-only e a IA entrar. Como estão >24h, o envio é por TEMPLATE aprovado
 * da Meta (Cloud API). Template: retomada_atendimento ({{1}}=nome, {{2}}=assunto).
 *
 * Espelha a lógica do inbox (/api/whatsapp/central/inbox) para o público e o log
 * do gateway (whatsapp-gateway.logOutbound) para o registro em whatsapp_messages,
 * pra a conversa aparecer certinho no cockpit.
 *
 *   node scripts/reengajar-limbo-aguardando.mjs            # dry-run (não envia)
 *   node scripts/reengajar-limbo-aguardando.mjs --send     # envia de verdade
 *   node scripts/reengajar-limbo-aguardando.mjs --send --limit 200
 *   node scripts/reengajar-limbo-aguardando.mjs --send --include-24h   # inclui quem está dentro da janela
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

// ── env ──────────────────────────────────────────────────────────────────────
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
const SEND = args.includes('--send')
const INCLUDE_24H = args.includes('--include-24h')
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? Number(args[i + 1]) : Infinity })()

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const GRAPH = (process.env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v25.0').replace(/^v?/, 'v')
const PHONE_ID = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID
const TOKEN = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN
if (!SUPA_URL || !SERVICE) { console.error('faltam credenciais Supabase'); process.exit(1) }
if (SEND && (!PHONE_ID || !TOKEN)) { console.error('faltam credenciais Cloud API pra enviar'); process.exit(1) }

const supabase = createClient(SUPA_URL, SERVICE)

// ── template ─────────────────────────────────────────────────────────────────
const TEMPLATE_NAME = 'retomada_atendimento'
const TEMPLATE_LANG = 'pt_BR'
const BODY_TMPL = 'Olá, {nome}! Aqui é da Bula Assessoria.\n\nRetomando nosso atendimento: ficou registrado que o assunto era {assunto}. Posso continuar por aqui e te fazer uma pergunta rápida para direcionar melhor?'
const FALLBACK_ASSUNTO = 'seu interesse na pecuária'
const BOT_STEP = 'reengajamento_retomada'      // tag própria p/ dedup
const ORIGIN = 'reengajamento-limbo'
const SINCE = '2026-05-01T00:00:00Z'           // janela de varredura das conversas
const THROTTLE_MS = 1500                        // jitter entre envios (anti-ban)

const INTERESSE_ASSUNTO = {
  touros: 'touros', matrizes: 'matrizes', embrioes: 'embriões', central_embrioes: 'embriões',
  semen: 'sêmen', leiloes: 'leilões', venda_genetica: 'genética', compra_venda_genetica: 'genética',
  oferta_genetica: 'genética', oportunidades: 'oportunidades na pecuária',
}

// ── helpers (espelham whatsapp-central) ──────────────────────────────────────
function normalizePhone(input) {
  if (!input) return null
  let c = String(input).replace(/\D/g, '')
  if (!c) return null
  if (c.startsWith('55') && c.length >= 12) { /* tem DDI */ }
  else if (c.length === 10 || c.length === 11) c = `55${c}`
  if (c.length < 12 || c.length > 13) return null
  return c
}
function phoneVariants(phone) {
  const v = new Set(); const d = String(phone).replace(/\D/g, ''); if (!d) return []
  v.add(d); if (d.startsWith('55')) v.add(d.slice(2)); else v.add(`55${d}`)
  const wo = d.startsWith('55') ? d.slice(2) : d
  if (wo.length === 11 && wo[2] === '9') { const x = wo.slice(0, 2) + wo.slice(3); v.add(x); v.add(`55${x}`) }
  else if (wo.length === 10) { const x = wo.slice(0, 2) + '9' + wo.slice(2); v.add(x); v.add(`55${x}`) }
  return [...v]
}
function firstName(full) { if (!full) return ''; return String(full).trim().split(/\s+/)[0] || '' }
function render(t, vars) { return t.replace(/\{(\w+)\}/g, (_m, k) => (vars[k] == null ? '' : String(vars[k]))) }

// ── 1. varre whatsapp_messages e reduz à última msg por telefone ─────────────
async function pullMessages() {
  const rows = []
  let from = 0
  const PAGE = 1000
  for (;;) {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('phone, name, direction, body, created_at, origin, intent, status')
      .not('phone', 'is', null)
      .gte('created_at', SINCE)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return rows
}

function buildLastByPhone(rows) {
  // rows já vêm desc (mais recente primeiro). Primeira vez que vejo um phone = última msg.
  const last = new Map()
  for (const m of rows) {
    if (m.origin === 'crm-assessor' || m.intent === 'assessor') continue // notif interna, fora do inbox
    if (m.direction === 'outbound' && m.status === 'failed') continue // envio que NÃO chegou (ex.: billing) não conta como resposta nossa
    const p = normalizePhone(m.phone || ''); if (!p) continue
    if (!last.has(p)) last.set(p, m)
  }
  return last
}

async function main() {
  console.log(`Modo: ${SEND ? 'ENVIO REAL' : 'DRY-RUN (nada é enviado)'}${INCLUDE_24H ? ' | inclui dentro de 24h' : ''}`)
  const rows = await pullMessages()
  console.log(`Mensagens varridas (desde ${SINCE.slice(0,10)}): ${rows.length}`)
  const last = buildLastByPhone(rows)

  // Candidatos do "limbo": última mensagem é inbound (lead falou por último, sem resposta).
  const nowMs = new Date(rows[0]?.created_at ?? SINCE).getTime()
  const candidates = [...last.entries()]
    .filter(([, m]) => m.direction === 'inbound')
    .map(([phone, m]) => ({ phone, name: m.name || null, lastText: (m.body || '').trim(), lastAt: m.created_at }))

  // ── 2. cruza com crm_leads (por variantes) ──
  const allVariants = [...new Set(candidates.flatMap(c => phoneVariants(c.phone)))]
  const leadByVariant = new Map()
  for (let i = 0; i < allVariants.length; i += 300) {
    const chunk = allVariants.slice(i, i + 300)
    const { data } = await supabase
      .from('crm_leads')
      .select('id, nome, telefone, interesse_principal, handoff_humano, optout_whatsapp, extra_data')
      .in('telefone', chunk)
    for (const l of data ?? []) if (l.telefone) leadByVariant.set(String(l.telefone).replace(/\D/g, ''), l)
  }
  const findLead = (phone) => {
    for (const v of phoneVariants(phone)) { const l = leadByVariant.get(v.replace(/\D/g, '')); if (l) return l }
    return null
  }

  // ── 3. dedup: quem já recebeu ESTE reengajamento ──
  const alreadySent = new Set()
  {
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('phone')
      .eq('direction', 'outbound')
      .eq('bot_step', BOT_STEP)
      .in('status', ['sent', 'queued'])
    for (const r of data ?? []) { const p = normalizePhone(r.phone || ''); if (p) alreadySent.add(p) }
  }

  // ── 4. monta público final ──
  const WINDOW = 24 * 3600_000
  const audience = []
  const skipped = { handoff: 0, optout: 0, already: 0, inside24h: 0 }
  for (const c of candidates) {
    const lead = findLead(c.phone)
    if (lead?.handoff_humano) { skipped.handoff++; continue }
    if (lead?.optout_whatsapp) { skipped.optout++; continue }
    if (alreadySent.has(c.phone)) { skipped.already++; continue }
    const inside = (nowMs - new Date(c.lastAt).getTime()) < WINDOW
    if (inside && !INCLUDE_24H) { skipped.inside24h++; continue }
    const nome = (lead?.nome || c.name || '').trim()
    const fname = firstName(nome) || 'amigo(a)'
    const assunto = INTERESSE_ASSUNTO[lead?.interesse_principal] || FALLBACK_ASSUNTO
    audience.push({
      phone: c.phone, leadId: lead?.id ?? null, nome: nome || null, fname, assunto,
      interesse: lead?.interesse_principal ?? null, hasLead: !!lead, inside24h: inside,
      lastAt: c.lastAt, lastText: c.lastText,
    })
  }
  audience.sort((a, b) => new Date(a.lastAt) - new Date(b.lastAt)) // mais antigos primeiro

  // ── relatório ──
  console.log(`\nCandidatos (última msg inbound, sem resposta): ${candidates.length}`)
  console.log(`Descartados → handoff:${skipped.handoff}  opt-out:${skipped.optout}  já reengajados:${skipped.already}  dentro de 24h:${skipped.inside24h}`)
  console.log(`PÚBLICO FINAL a reengajar: ${audience.length}`)
  const semInteresse = audience.filter(a => !INTERESSE_ASSUNTO[a.interesse]).length
  const semLead = audience.filter(a => !a.hasLead).length
  console.log(`  • com assunto do CRM: ${audience.length - semInteresse}   • fallback "${FALLBACK_ASSUNTO}": ${semInteresse}`)
  console.log(`  • sem lead casado no CRM (nome do WhatsApp): ${semLead}`)
  console.log(`\nAmostra (12 mais antigos):`)
  for (const a of audience.slice(0, 12)) {
    console.log(`  ${a.lastAt.slice(0,10)}  ${a.phone}  ${(a.fname).padEnd(14)} assunto="${a.assunto}"  msg="${a.lastText.slice(0,40)}"`)
  }

  if (!SEND) {
    console.log(`\n[DRY-RUN] Nada enviado. Rode com --send para disparar (throttle ${THROTTLE_MS}ms, cap ${LIMIT === Infinity ? '∞' : LIMIT}).`)
    return
  }

  // ── 5. envio real ──
  const toSend = audience.slice(0, LIMIT === Infinity ? audience.length : LIMIT)
  console.log(`\n=== ENVIANDO para ${toSend.length} (throttle ${THROTTLE_MS}ms) ===`)
  let sent = 0, failed = 0
  for (let i = 0; i < toSend.length; i++) {
    const a = toSend[i]
    const params = [a.fname, a.assunto]
    const bodyLog = render(BODY_TMPL, { nome: a.fname, assunto: a.assunto })
    const payload = {
      messaging_product: 'whatsapp', recipient_type: 'individual', to: a.phone, type: 'template',
      template: { name: TEMPLATE_NAME, language: { code: TEMPLATE_LANG },
        components: [{ type: 'body', parameters: params.map(text => ({ type: 'text', text })) }] },
    }
    let status = 'failed', messageId = null, errMsg = null
    try {
      const res = await fetch(`https://graph.facebook.com/${GRAPH}/${PHONE_ID}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(30000),
      })
      const json = await res.json().catch(() => null)
      if (res.ok) { status = 'sent'; messageId = json?.messages?.[0]?.id ?? null }
      else { errMsg = json?.error?.message ? `${json.error.message} (code ${json.error.code})` : `HTTP ${res.status}` }
    } catch (e) { errMsg = e?.message || 'fetch_error' }

    // log espelhando o gateway
    await supabase.from('whatsapp_messages').insert({
      phone: a.phone, name: a.nome || 'Contato', body: bodyLog, direction: 'outbound',
      status, channel: 'cloud', inbox_id: 'cloud', intent: 'crm_reply', origin: ORIGIN, bot_step: BOT_STEP,
      lead_id: a.leadId, campaign_id: null, reason: messageId ?? (status === 'failed' ? 'send_failed' : null),
      error_msg: errMsg,
    })
    if (status === 'sent') {
      sent++
      if (a.leadId) await supabase.from('crm_leads').update({ last_whatsapp_at: new Date().toISOString() }).eq('id', a.leadId)
    } else { failed++; console.log(`  ✗ ${a.phone} ${a.fname}: ${errMsg}`) }

    if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${toSend.length} (ok ${sent}, falhou ${failed})`)
    if (i < toSend.length - 1) await new Promise(r => setTimeout(r, THROTTLE_MS))
  }
  console.log(`\n=== FIM === enviados ${sent}  falhas ${failed}  (de ${toSend.length})`)
  if (audience.length > toSend.length) console.log(`Sobraram ${audience.length - toSend.length} fora do --limit; rode de novo p/ continuar (dedup pula os já enviados).`)
}

main().catch(e => { console.error(e); process.exit(1) })
