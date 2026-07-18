/**
 * FOLLOW-UP do atendimento: resgata leads que SILENCIARAM depois da nossa
 * última mensagem (última msg é outbound, >24h sem resposta). É o complemento
 * do reengajar-limbo-aguardando.mjs (que cobre o caso inverso: lead escreveu e
 * ficou sem resposta). Juntos, fecham o ciclo — ninguém morre no silêncio.
 *
 * O template é escolhido pelo PONTO DO FUNIL em que a conversa parou
 * (aprendizado da campanha EAO: a maioria abandona no pedido de dados):
 *   • parou na HABILITAÇÃO (aceitou a assessoria, checklist incompleto)
 *       1º toque → bula_cadastro_retomada  ("falta só X, resolvo por aqui")
 *       2º toque (≥3d depois, ainda mudo) → bula_cadastro_duvida (confiança)
 *   • parou na conversa (descoberta/apresentação) → bula_pergunta_rapida
 *   • cadastro em análise / handoff / opt-out → não mexe.
 *
 * Regras de segurança:
 *   - só entra quem JÁ ESCREVEU pelo menos uma vez (UTILITY exige conversa
 *     iniciada; quem nunca respondeu é público de campanha, não de follow-up)
 *   - dedup por bot_step (rerodar nunca duplica) + cap de 2 follow-ups por fase
 *   - só envia se o template estiver APPROVED na WABA
 *   - dry-run por padrão
 *
 *   node scripts/followup-atendimento.mjs                # dry-run
 *   node scripts/followup-atendimento.mjs --send         # envia
 *   node scripts/followup-atendimento.mjs --send --limit 100
 *   node scripts/followup-atendimento.mjs --max-idle 30  # janela em dias (default 21)
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
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? Number(args[i + 1]) : Infinity })()
const MAX_IDLE_DAYS = (() => { const i = args.indexOf('--max-idle'); return i >= 0 ? Number(args[i + 1]) : 21 })()

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const GRAPH = (process.env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v25.0').replace(/^v?/, 'v')
const PHONE_ID = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID
const TOKEN = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN
const WABA = process.env.WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID || process.env.WABA_ID
if (!SUPA_URL || !SERVICE) { console.error('faltam credenciais Supabase'); process.exit(1) }
if (SEND && (!PHONE_ID || !TOKEN || !WABA)) { console.error('faltam credenciais Cloud API pra enviar'); process.exit(1) }

const supabase = createClient(SUPA_URL, SERVICE)

// ── templates por ponto do funil ─────────────────────────────────────────────
const LANG = 'pt_BR'
const ORIGIN = 'followup-atendimento'
const THROTTLE_MS = 1500
const WINDOW_MS = 24 * 3600_000
const ESCALATION_GAP_MS = 3 * 24 * 3600_000   // 2º toque de cadastro: ≥3 dias após o 1º
const SINCE_DAYS = Math.max(MAX_IDLE_DAYS + 7, 30)

const STEPS = {
  cadastro_1: { botStep: 'followup_cadastro', template: 'bula_cadastro_retomada' },
  cadastro_2: { botStep: 'followup_cadastro_2', template: 'bula_cadastro_duvida' },
  conversa: { botStep: 'followup_conversa', template: 'bula_pergunta_rapida' },
}

// Rótulo do checklist → frase curta pro {{2}} do bula_cadastro_retomada.
const FALTA_FRASE = [
  [/^cpf$/i, 'confirmar o número do seu CPF'],
  [/nome completo/i, 'o seu nome completo'],
  [/endereço/i, 'o seu endereço de correspondência'],
  [/inscrição estadual/i, 'a sua Inscrição Estadual (ou NIRF)'],
  [/nome da fazenda/i, 'o nome da fazenda de entrega'],
  [/cidade\/uf da fazenda/i, 'a cidade/UF da fazenda'],
]
function fraseDoQueFalta(missing) {
  const frases = (missing || [])
    .map(l => FALTA_FRASE.find(([re]) => re.test(String(l)))?.[1])
    .filter(Boolean)
  if (!frases.length) return 'confirmar o número do seu CPF'
  return frases.length === 1 ? frases[0] : `${frases[0]} e ${frases[1]}`
}

// Assunto do bula_pergunta_rapida por interesse/persona (espelha concierge-persona).
const INTERESSE_ASSUNTO = {
  touros: 'os touros que você está buscando', matrizes: 'as matrizes que você está buscando',
  embrioes: 'os embriões que você comentou', semen: 'o sêmen que você comentou',
  leiloes: 'os próximos leilões', venda_genetica: 'a genética que você comentou',
}
function assuntoDoLead(lead) {
  const byInteresse = INTERESSE_ASSUNTO[String(lead?.interesse_principal ?? '')]
  if (byInteresse) return byInteresse
  const momento = String(lead?.momento_pecuaria ?? '').toLowerCase().replace(/_/g, '-')
  if (momento === 'nao-trabalho-quero-aprender') return 'como você quer começar na criação'
  if (/po\b|p-o|criador-renomado/.test(momento)) return 'o que você está buscando para o plantel'
  return 'o que você está buscando para o rebanho'
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

// ── 1. varre whatsapp_messages (paginado — cap-1000 do PostgREST) ────────────
async function pullMessages(sinceIso) {
  const rows = []
  let from = 0
  const PAGE = 1000
  for (;;) {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('phone, name, direction, body, created_at, origin, intent, bot_step')
      .not('phone', 'is', null)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return rows
}

// ── 2. status dos templates na WABA (só envia APPROVED) ─────────────────────
async function fetchTemplateStatus() {
  const map = new Map()
  if (!WABA || !TOKEN) return map
  let url = `https://graph.facebook.com/${GRAPH}/${WABA}/message_templates?fields=name,status,components&limit=100`
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(30000) })
    const json = await res.json().catch(() => null)
    if (!res.ok) break
    for (const t of json?.data ?? []) {
      const body = (t.components ?? []).find(c => c.type === 'BODY')?.text ?? ''
      map.set(t.name, { status: t.status, body })
    }
    url = json?.paging?.next || null
  }
  return map
}

// Texto que o LEAD vê (corpo aprovado com {{n}} preenchidos) — é o que vai pro
// log do cockpit; placeholder "[template x]" na conversa confunde o time.
function renderTemplateBody(body, params) {
  return String(body || '').replace(/\{\{(\d)\}\}/g, (_m, n) => params[Number(n) - 1] ?? '')
}

async function main() {
  console.log(`Modo: ${SEND ? 'ENVIO REAL' : 'DRY-RUN (nada é enviado)'} | janela ${MAX_IDLE_DAYS}d`)
  const sinceIso = new Date(Date.now() - SINCE_DAYS * 24 * 3600_000).toISOString()
  const rows = await pullMessages(sinceIso)
  console.log(`Mensagens varridas (desde ${sinceIso.slice(0, 10)}): ${rows.length}`)

  // Última msg por telefone + quem já escreveu + follow-ups já enviados.
  const last = new Map()
  const everInbound = new Set()
  const sentSteps = new Map()   // phone → Map(botStep → lastAt)
  const followupSteps = new Set(Object.values(STEPS).map(s => s.botStep))
  for (const m of rows) {
    if (m.origin === 'crm-assessor' || m.intent === 'assessor') continue
    const p = normalizePhone(m.phone || ''); if (!p) continue
    if (!last.has(p)) last.set(p, m)
    if (m.direction === 'inbound') everInbound.add(p)
    if (m.direction === 'outbound' && followupSteps.has(m.bot_step)) {
      if (!sentSteps.has(p)) sentSteps.set(p, new Map())
      const s = sentSteps.get(p)
      if (!s.has(m.bot_step)) s.set(m.bot_step, m.created_at)
    }
  }

  // Candidatos: última msg é NOSSA (outbound), lead mudo, e ele já escreveu antes.
  const now = Date.now()
  const candidates = [...last.entries()]
    .filter(([p, m]) => m.direction === 'outbound' && everInbound.has(p))
    .map(([phone, m]) => ({ phone, name: m.name || null, lastAt: m.created_at, lastStep: m.bot_step || '' }))
    .filter(c => {
      const idle = now - new Date(c.lastAt).getTime()
      return idle >= WINDOW_MS && idle <= MAX_IDLE_DAYS * 24 * 3600_000
    })

  // ── cruza com crm_leads ──
  const allVariants = [...new Set(candidates.flatMap(c => phoneVariants(c.phone)))]
  const leadByVariant = new Map()
  for (let i = 0; i < allVariants.length; i += 300) {
    const chunk = allVariants.slice(i, i + 300)
    const { data } = await supabase
      .from('crm_leads')
      .select('id, nome, telefone, interesse_principal, momento_pecuaria, handoff_humano, optout_whatsapp, extra_data')
      .in('telefone', chunk)
    for (const l of data ?? []) if (l.telefone) leadByVariant.set(String(l.telefone).replace(/\D/g, ''), l)
  }
  const findLead = (phone) => {
    for (const v of phoneVariants(phone)) { const l = leadByVariant.get(v.replace(/\D/g, '')); if (l) return l }
    return null
  }

  // ── decide o toque certo por lead ──
  const audience = []
  const skipped = { semLead: 0, handoff: 0, optout: 0, emAnalise: 0, jaTocado: 0, aguardaGap: 0 }
  for (const c of candidates) {
    const lead = findLead(c.phone)
    if (!lead) { skipped.semLead++; continue }
    if (lead.handoff_humano) { skipped.handoff++; continue }
    if (lead.optout_whatsapp) { skipped.optout++; continue }
    const xd = lead.extra_data ?? {}
    const cadStatus = String(xd.cadastro_status ?? '')
    if (cadStatus === 'em_analise' || cadStatus === 'solicitado') { skipped.emAnalise++; continue }

    const naHabilitacao = xd.aceitou_assessoria === true && xd.habilitacao?.complete !== true
    const steps = sentSteps.get(c.phone) ?? new Map()
    let step = null
    let param2 = ''
    if (naHabilitacao) {
      if (!steps.has(STEPS.cadastro_1.botStep)) {
        step = STEPS.cadastro_1
        param2 = fraseDoQueFalta(xd.habilitacao?.missing)
      } else if (!steps.has(STEPS.cadastro_2.botStep)) {
        const gap = now - new Date(steps.get(STEPS.cadastro_1.botStep)).getTime()
        if (gap < ESCALATION_GAP_MS) { skipped.aguardaGap++; continue }
        step = STEPS.cadastro_2
        param2 = 'me manda só o CPF que eu adianto o resto para você'
      } else { skipped.jaTocado++; continue }
    } else {
      if (steps.has(STEPS.conversa.botStep)) { skipped.jaTocado++; continue }
      step = STEPS.conversa
      param2 = assuntoDoLead(lead)
    }

    const nome = (lead.nome || c.name || '').trim()
    audience.push({
      phone: c.phone, leadId: lead.id, fname: firstName(nome) || 'amigo(a)',
      step, param2, lastAt: c.lastAt,
    })
  }
  // Cadastro travado primeiro (mais perto do objetivo); dentro do step, mais antigo primeiro —
  // garante que um --limit apertado nunca corte os leads de habilitação.
  const stepRank = (a) => (a.step.botStep.startsWith('followup_cadastro') ? 0 : 1)
  audience.sort((a, b) => stepRank(a) - stepRank(b) || new Date(a.lastAt) - new Date(b.lastAt))

  // ── relatório ──
  const porStep = {}
  for (const a of audience) porStep[a.step.botStep] = (porStep[a.step.botStep] || 0) + 1
  console.log(`\nCandidatos (nossa msg por último, lead mudo >24h, já escreveu antes): ${candidates.length}`)
  console.log(`Descartados → sem lead:${skipped.semLead}  handoff:${skipped.handoff}  opt-out:${skipped.optout}  em análise:${skipped.emAnalise}  já tocado:${skipped.jaTocado}  aguardando gap 3d:${skipped.aguardaGap}`)
  console.log(`PÚBLICO FINAL: ${audience.length}  →  ${Object.entries(porStep).map(([k, v]) => `${k}:${v}`).join('  ') || '(vazio)'}`)
  console.log(`\nAmostra (12 mais antigos):`)
  for (const a of audience.slice(0, 12)) {
    console.log(`  ${a.lastAt.slice(0, 10)}  ${a.phone}  ${a.fname.padEnd(14)} ${a.step.template}  {{2}}="${a.param2}"`)
  }

  if (!SEND) {
    console.log(`\n[DRY-RUN] Nada enviado. Rode com --send para disparar (throttle ${THROTTLE_MS}ms).`)
    return
  }

  // ── template aprovado? ──
  const templates = await fetchTemplateStatus()
  const neededTemplates = [...new Set(audience.map(a => a.step.template))]
  const blocked = neededTemplates.filter(t => templates.get(t)?.status !== 'APPROVED')
  if (blocked.length) {
    console.log(`\n⚠ Templates ainda NÃO aprovados na WABA: ${blocked.map(t => `${t}(${templates.get(t)?.status || 'inexistente'})`).join(', ')}`)
    console.log('Envio segue só para os steps com template aprovado.')
  }
  const toSend = audience
    .filter(a => templates.get(a.step.template)?.status === 'APPROVED')
    .slice(0, LIMIT === Infinity ? audience.length : LIMIT)

  console.log(`\n=== ENVIANDO para ${toSend.length} (throttle ${THROTTLE_MS}ms) ===`)
  let sent = 0, failed = 0
  for (let i = 0; i < toSend.length; i++) {
    const a = toSend[i]
    const params = [a.fname, a.param2]
    const payload = {
      messaging_product: 'whatsapp', recipient_type: 'individual', to: a.phone, type: 'template',
      template: {
        name: a.step.template, language: { code: LANG },
        components: [{ type: 'body', parameters: params.map(text => ({ type: 'text', text })) }],
      },
    }
    let statusSend = 'failed', messageId = null, errMsg = null
    try {
      const res = await fetch(`https://graph.facebook.com/${GRAPH}/${PHONE_ID}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(30000),
      })
      const json = await res.json().catch(() => null)
      if (res.ok) { statusSend = 'sent'; messageId = json?.messages?.[0]?.id ?? null }
      else { errMsg = json?.error?.message ? `${json.error.message} (code ${json.error.code})` : `HTTP ${res.status}` }
    } catch (e) { errMsg = e?.message || 'fetch_error' }

    await supabase.from('whatsapp_messages').insert({
      phone: a.phone, name: a.fname,
      body: renderTemplateBody(templates.get(a.step.template)?.body, params) || `[template ${a.step.template}] ${a.param2}`,
      direction: 'outbound',
      status: statusSend, channel: 'cloud', inbox_id: 'cloud', intent: 'crm_reply', origin: ORIGIN, bot_step: a.step.botStep,
      lead_id: a.leadId, campaign_id: null, reason: messageId ?? (statusSend === 'failed' ? 'send_failed' : null),
      error_msg: errMsg,
    })
    if (statusSend === 'sent') {
      sent++
      await supabase.from('crm_leads').update({ last_whatsapp_at: new Date().toISOString() }).eq('id', a.leadId)
    } else { failed++; console.log(`  ✗ ${a.phone} ${a.fname}: ${errMsg}`) }

    if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${toSend.length} (ok ${sent}, falhou ${failed})`)
    if (i < toSend.length - 1) await new Promise(r => setTimeout(r, THROTTLE_MS))
  }
  console.log(`\n=== FIM === enviados ${sent}  falhas ${failed}  (de ${toSend.length})`)
}

main().catch(e => { console.error(e); process.exit(1) })
