/**
 * Disparo "ESTAMOS AO VIVO" — reutilizável em qualquer leilão nosso.
 *
 * Usa o template MARKETING genérico `bula_leilao_ao_vivo` ({{1}}=nome, {{2}}=leilão),
 * então NÃO precisa submeter nada por leilão: entrou ao vivo, roda passando o nome.
 *
 * Público (padrão): leads com telefone válido, NÃO arquivados, NÃO opt-out.
 * Filtros opcionais: --interesse leiloes,touros,matrizes  ·  --limit N
 * Dedup por leilão: ninguém recebe o MESMO leilão duas vezes (origin=leilao-ao-vivo:<slug>).
 *
 *   node scripts/disparo-leilao-ao-vivo.mjs --leilao "Leilão de Touros e Matrizes Naviraí"            # dry-run
 *   node scripts/disparo-leilao-ao-vivo.mjs --leilao "Leilão ..." --send                              # envia
 *   node scripts/disparo-leilao-ao-vivo.mjs --leilao "Leilão ..." --interesse leiloes,touros --send
 *   node scripts/disparo-leilao-ao-vivo.mjs --leilao "Leilão ..." --send --limit 300
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
const argVal = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null }
const LEILAO = argVal('--leilao')
const TEMPLATE_NAME = argVal('--template') || 'bula_leilao_ao_vivo'
const TEMPLATE_LANG = argVal('--lang') || 'pt_BR'
const LIMIT = (() => { const v = argVal('--limit'); return v ? Number(v) : Infinity })()
const INTERESSES = (() => { const v = argVal('--interesse'); return v ? v.split(',').map(s => s.trim()).filter(Boolean) : null })()

if (!LEILAO) { console.error('Informe o nome do leilão: --leilao "Leilão de Touros e Matrizes Naviraí"'); process.exit(1) }

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const GRAPH = (process.env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v25.0').replace(/^v?/, 'v')
const PHONE_ID = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID
const TOKEN = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN
if (!SUPA_URL || !SERVICE) { console.error('faltam credenciais Supabase'); process.exit(1) }
if (SEND && (!PHONE_ID || !TOKEN)) { console.error('faltam credenciais Cloud API pra enviar'); process.exit(1) }

const supabase = createClient(SUPA_URL, SERVICE)

const THROTTLE_MS = 1500
const slug = LEILAO.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
const ORIGIN = `leilao-ao-vivo:${slug}`
const BOT_STEP = 'leilao_ao_vivo'
// Espelho do corpo do template (só p/ log/exibição no cockpit).
const BODY_TMPL = `Olá, {nome}! 🐂\n\nEstamos *AO VIVO* com o *{leilao}*.\n\n✅ 30x no boleto\n✅ Frete grátis\n\nÉ só entrar para assistir e dar os seus lances. Te esperamos no leilão!`

// ── helpers ──────────────────────────────────────────────────────────────────
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
function isJunkPhone(phone) {
  const d = String(phone).replace(/\D/g, ''); const nat = d.startsWith('55') ? d.slice(2) : d
  return new Set(nat.split('')).size <= 2
}

async function pullLeads() {
  const rows = []
  let from = 0; const PAGE = 1000
  for (;;) {
    let q = supabase
      .from('crm_leads')
      .select('id, nome, telefone, celular, interesse_principal, optout_whatsapp, arquivado')
      .eq('arquivado', false)
      .eq('optout_whatsapp', false)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (INTERESSES) q = q.in('interesse_principal', INTERESSES)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return rows
}

// Quem já recebeu ESTE leilão (dedup por origin) — pra rodar de novo sem repetir.
async function pullAlreadySent() {
  const already = new Set()
  let from = 0; const PAGE = 1000
  for (;;) {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('phone')
      .eq('direction', 'outbound')
      .eq('origin', ORIGIN)
      .in('status', ['sent', 'queued'])
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) { const p = normalizePhone(r.phone || ''); if (p) already.add(p) }
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return already
}

async function main() {
  console.log(`Leilão: "${LEILAO}"   (slug=${slug})`)
  console.log(`Template: ${TEMPLATE_NAME} (${TEMPLATE_LANG})   {{1}}=nome  {{2}}=leilão`)
  console.log(`Modo: ${SEND ? 'ENVIO REAL' : 'DRY-RUN (nada é enviado)'}${INTERESSES ? ` | interesse: ${INTERESSES.join(', ')}` : ''}\n`)

  const leads = await pullLeads()
  const already = await pullAlreadySent()
  console.log(`Leads elegíveis (não arquivados, não opt-out${INTERESSES ? ', filtro de interesse' : ''}): ${leads.length}`)
  console.log(`Já receberam este leilão (dedup): ${already.size}`)

  const skipped = { semTelefone: 0, invalido: 0, lixo: 0, jaRecebeu: 0 }
  const seen = new Set()
  const audience = []
  for (const l of leads) {
    const phone = normalizePhone(l.telefone || l.celular)
    if (!l.telefone && !l.celular) { skipped.semTelefone++; continue }
    if (!phone) { skipped.invalido++; continue }
    if (isJunkPhone(phone)) { skipped.lixo++; continue }
    if (already.has(phone) || phoneVariants(phone).some(v => already.has(normalizePhone(v)))) { skipped.jaRecebeu++; continue }
    if (seen.has(phone)) continue
    seen.add(phone)
    const nome = (l.nome || '').trim()
    audience.push({ phone, leadId: l.id, nome: nome || null, fname: firstName(nome) || 'amigo(a)' })
  }

  console.log(`\nDescartados → sem telefone:${skipped.semTelefone}  inválido:${skipped.invalido}  lixo:${skipped.lixo}  já receberam:${skipped.jaRecebeu}`)
  console.log(`\nPÚBLICO FINAL: ${audience.length}`)
  console.log(`\nPrévia:\n${'─'.repeat(60)}\n${render(BODY_TMPL, { nome: audience[0]?.fname || 'Fulano', leilao: LEILAO })}\n${'─'.repeat(60)}`)

  if (!SEND) {
    console.log(`\n[DRY-RUN] Nada enviado. Rode com --send para disparar (throttle ${THROTTLE_MS}ms, cap ${LIMIT === Infinity ? '∞' : LIMIT}).`)
    return
  }

  const toSend = audience.slice(0, LIMIT === Infinity ? audience.length : LIMIT)
  console.log(`\n=== ENVIANDO para ${toSend.length} (throttle ${THROTTLE_MS}ms) ===`)
  let sent = 0, failed = 0
  for (let i = 0; i < toSend.length; i++) {
    const a = toSend[i]
    const bodyLog = render(BODY_TMPL, { nome: a.fname, leilao: LEILAO })
    const payload = {
      messaging_product: 'whatsapp', recipient_type: 'individual', to: a.phone, type: 'template',
      template: { name: TEMPLATE_NAME, language: { code: TEMPLATE_LANG },
        components: [{ type: 'body', parameters: [{ type: 'text', text: a.fname }, { type: 'text', text: LEILAO }] }] },
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
      status, channel: 'cloud', intent: 'campaign', origin: ORIGIN, bot_step: BOT_STEP,
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
