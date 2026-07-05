/**
 * Disparo para leads FRIOS COM INSCRIÇÃO ESTADUAL que NUNCA foram contatados.
 *
 * Público:
 *   - crm_leads na fila ENTRADA (pré-CRM) — quem já foi movido pro CRM
 *     (CONEXÃO em diante) já foi atendido e NÃO entra.
 *   - com telefone, NÃO arquivados, NÃO opt-out
 *   - COM Inscrição Estadual (tem_inscricao_estadual = "Sim" OU inscricao_estadual preenchida)
 *   - NUNCA contatados: sem nenhuma mensagem OUTBOUND em whatsapp_messages
 *     (qualquer variante do número) e last_whatsapp_at nulo.
 *
 * Como o lead nunca escreveu (janela de 24h fechada) o envio é business-initiated,
 * então usa TEMPLATE APROVADO da Meta pela Cloud API. Template escolhido:
 * `bula_qualificacao_interesse_po_20260624` (pt_BR, {{1}} = 1º nome) — é o welcome
 * de qualificação, desenhado exatamente para o lead que demonstrou interesse e
 * ainda não foi abordado. Loga em whatsapp_messages (bot_step='welcome') espelhando
 * o gateway, pra a conversa aparecer no cockpit e servir de dedup natural.
 *
 *   node scripts/disparo-leads-ie-nunca-contatados.mjs            # dry-run (não envia)
 *   node scripts/disparo-leads-ie-nunca-contatados.mjs --send     # envia de verdade
 *   node scripts/disparo-leads-ie-nunca-contatados.mjs --send --limit 200
 *   node scripts/disparo-leads-ie-nunca-contatados.mjs --min-cabecas 100   # só quem tem ≥100 cabeças
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
const REQUIRE_IE = !args.includes('--no-ie')   // por padrão exige I.E.; --no-ie libera (ranqueia por cabeças)
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? Number(args[i + 1]) : Infinity })()
const MIN_CABECAS = (() => { const i = args.indexOf('--min-cabecas'); return i >= 0 ? Number(args[i + 1]) : 0 })()

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const GRAPH = (process.env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v25.0').replace(/^v?/, 'v')
const PHONE_ID = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID
const TOKEN = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN
if (!SUPA_URL || !SERVICE) { console.error('faltam credenciais Supabase'); process.exit(1) }
if (SEND && (!PHONE_ID || !TOKEN)) { console.error('faltam credenciais Cloud API pra enviar'); process.exit(1) }

const supabase = createClient(SUPA_URL, SERVICE)

// ── template ─────────────────────────────────────────────────────────────────
const TEMPLATE_NAME = 'bula_qualificacao_interesse_po_20260624'
const TEMPLATE_LANG = 'pt_BR'
// Espelho do corpo aprovado (mantido em sync com src/lib/crm-welcome.ts) — só p/ log.
const BODY_TMPL = `Olá, {nome}! Tudo bem?

Aqui é o João da Bula Assessoria.

Vi que você demonstrou interesse em genética, assessoria ou oportunidades na pecuária, então queria entender melhor o seu momento para ver onde conseguimos ser mais úteis.

Hoje você já trabalha com gado P.O. ou está buscando entrar/melhorar nessa área?`
const BOT_STEP = 'welcome'                     // registra como 1º contato (welcome)
const ORIGIN = 'disparo-ie-frio'
const THROTTLE_MS = 1500                        // jitter entre envios (anti-ban)

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
// Lixo de cadastro: número com pouquíssima variação de dígitos (ex.: 31313131313, 11111...).
function isJunkPhone(phone) {
  const d = String(phone).replace(/\D/g, '')
  const nat = d.startsWith('55') ? d.slice(2) : d
  return new Set(nat.split('')).size <= 2
}
function render(t, vars) { return t.replace(/\{(\w+)\}/g, (_m, k) => (vars[k] == null ? '' : String(vars[k]))) }
function hasIE(flag, number) {
  const f = String(flag ?? '').trim().toLowerCase()
  const n = String(number ?? '').trim()
  return f === 'sim' || n.length > 0
}
function cabecasFloor(value) {
  if (value == null) return null
  const v = String(value).trim().toLowerCase()
  if (!v) return null
  if (v === 'nenhuma') return 0
  const m = v.match(/\d+/)
  return m ? Number(m[0]) : null
}
// Espelha normalizeCRMStatus (src/lib/crm-types.ts): vazio/'lead'/'sem status'/'entrada' = fila ENTRADA (pré-CRM).
function isEntrada(status) {
  const key = String(status ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  return key === '' || key === 'lead' || key === 'sem status' || key === 'entrada'
}

// ── 1. leads elegíveis (IE, com telefone, não arquivados, não opt-out) ────────
async function pullLeads() {
  const rows = []
  let from = 0
  const PAGE = 1000
  for (;;) {
    const { data, error } = await supabase
      .from('crm_leads')
      .select('id, nome, telefone, celular, status, tem_inscricao_estadual, inscricao_estadual, quantidade_animais, interesse_principal, last_whatsapp_at, handoff_humano, optout_whatsapp, arquivado')
      .eq('arquivado', false)
      .eq('optout_whatsapp', false)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return rows
}

// ── 2. conjunto de números que JÁ receberam algo (outbound) — "já contatados" ─
async function pullContactedPhones() {
  const contacted = new Set()
  let from = 0
  const PAGE = 1000
  for (;;) {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('phone')
      .eq('direction', 'outbound')
      .not('phone', 'is', null)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      for (const v of phoneVariants(r.phone || '')) contacted.add(v.replace(/\D/g, ''))
    }
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return contacted
}

async function main() {
  console.log(`Modo: ${SEND ? 'ENVIO REAL' : 'DRY-RUN (nada é enviado)'}${MIN_CABECAS ? ` | min-cabecas=${MIN_CABECAS}` : ''}`)
  const leads = await pullLeads()
  console.log(`Leads ativos (não arquivados, não opt-out): ${leads.length}`)
  const contacted = await pullContactedPhones()
  console.log(`Números já contatados (outbound histórico): ${contacted.size}`)

  const skipped = { semTelefone: 0, semIE: 0, jaContatado: 0, handoff: 0, poucasCabecas: 0, telefoneInvalido: 0, jaNoCrm: 0, lixo: 0 }
  const seen = new Set()
  const audience = []
  for (const l of leads) {
    // Só a fila ENTRADA (pré-CRM). Quem já foi movido pro CRM já foi atendido.
    if (!isEntrada(l.status)) { skipped.jaNoCrm++; continue }
    const raw = l.telefone || l.celular
    if (!raw) { skipped.semTelefone++; continue }
    const phone = normalizePhone(raw)
    if (!phone) { skipped.telefoneInvalido++; continue }
    if (isJunkPhone(phone)) { skipped.lixo++; continue }
    if (REQUIRE_IE && !hasIE(l.tem_inscricao_estadual, l.inscricao_estadual)) { skipped.semIE++; continue }
    if (l.handoff_humano) { skipped.handoff++; continue }
    if (MIN_CABECAS > 0) {
      const floor = cabecasFloor(l.quantidade_animais)
      if (floor == null || floor < MIN_CABECAS) { skipped.poucasCabecas++; continue }
    }
    // nunca contatado: last_whatsapp_at nulo E nenhuma variante já recebeu outbound
    if (l.last_whatsapp_at) { skipped.jaContatado++; continue }
    const already = phoneVariants(phone).some(v => contacted.has(v.replace(/\D/g, '')))
    if (already) { skipped.jaContatado++; continue }
    if (seen.has(phone)) continue
    seen.add(phone)
    const nome = (l.nome || '').trim()
    audience.push({ phone, leadId: l.id, nome: nome || null, fname: firstName(nome) || 'amigo(a)',
      cabecas: l.quantidade_animais || null, floor: cabecasFloor(l.quantidade_animais) ?? -1,
      ie: hasIE(l.tem_inscricao_estadual, l.inscricao_estadual) ? (l.inscricao_estadual || 'Sim') : '—' })
  }
  // Mais promissor primeiro: maior porte de rebanho.
  audience.sort((a, b) => b.floor - a.floor)

  // ── relatório ──
  console.log(`\nDescartados → já no CRM (fora de ENTRADA):${skipped.jaNoCrm}  sem telefone:${skipped.semTelefone}  telefone inválido:${skipped.telefoneInvalido}  lixo (nº falso):${skipped.lixo}  sem I.E.:${skipped.semIE}  já contatados:${skipped.jaContatado}  handoff:${skipped.handoff}${MIN_CABECAS ? `  <${MIN_CABECAS} cabeças:${skipped.poucasCabecas}` : ''}`)
  console.log(`\nPÚBLICO FINAL (ENTRADA${REQUIRE_IE ? ' + I.E.' : ''} + nunca contatado): ${audience.length}`)
  // Distribuição por faixa de rebanho
  const faixas = {}
  for (const a of audience) { const k = a.cabecas || '(sem info)'; faixas[k] = (faixas[k] || 0) + 1 }
  console.log(`Distribuição por cabeças: ${Object.entries(faixas).map(([k, n]) => `${k}=${n}`).join('  ')}`)
  console.log(`\nTemplate: ${TEMPLATE_NAME} (${TEMPLATE_LANG})  —  {{1}} = 1º nome`)
  console.log(`Prévia da mensagem:\n${'-'.repeat(60)}\n${render(BODY_TMPL, { nome: audience[0]?.fname || 'Fulano' })}\n${'-'.repeat(60)}`)
  console.log(`\nAmostra (15 primeiros):`)
  for (const a of audience.slice(0, 15)) {
    console.log(`  ${a.phone.padEnd(14)} ${(a.fname).padEnd(16)} cabeças=${String(a.cabecas ?? '-').padEnd(10)} IE=${a.ie}`)
  }

  if (!SEND) {
    console.log(`\n[DRY-RUN] Nada enviado. Rode com --send para disparar (throttle ${THROTTLE_MS}ms, cap ${LIMIT === Infinity ? '∞' : LIMIT}).`)
    return
  }

  // ── envio real ──
  const toSend = audience.slice(0, LIMIT === Infinity ? audience.length : LIMIT)
  console.log(`\n=== ENVIANDO para ${toSend.length} (throttle ${THROTTLE_MS}ms) ===`)
  let sent = 0, failed = 0
  for (let i = 0; i < toSend.length; i++) {
    const a = toSend[i]
    const bodyLog = render(BODY_TMPL, { nome: a.fname })
    const payload = {
      messaging_product: 'whatsapp', recipient_type: 'individual', to: a.phone, type: 'template',
      template: { name: TEMPLATE_NAME, language: { code: TEMPLATE_LANG },
        components: [{ type: 'body', parameters: [{ type: 'text', text: a.fname }] }] },
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

    await supabase.from('whatsapp_messages').insert({
      phone: a.phone, name: a.nome || 'Contato', body: bodyLog, direction: 'outbound',
      status, channel: 'cloud', intent: 'bot', origin: ORIGIN, bot_step: BOT_STEP,
      lead_id: a.leadId, campaign_id: null, reason: messageId ?? (status === 'failed' ? 'send_failed' : null),
      error_msg: errMsg,
    })
    if (status === 'sent') {
      sent++
      await supabase.from('crm_leads').update({ last_whatsapp_at: new Date().toISOString() }).eq('id', a.leadId)
    } else { failed++; console.log(`  ✗ ${a.phone} ${a.fname}: ${errMsg}`) }

    if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${toSend.length} (ok ${sent}, falhou ${failed})`)
    if (i < toSend.length - 1) await new Promise(r => setTimeout(r, THROTTLE_MS))
  }
  console.log(`\n=== FIM === enviados ${sent}  falhas ${failed}  (de ${toSend.length})`)
  if (audience.length > toSend.length) console.log(`Sobraram ${audience.length - toSend.length} fora do --limit; rode de novo p/ continuar (dedup pula os já enviados).`)
}

main().catch(e => { console.error(e); process.exit(1) })
