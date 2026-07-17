// Envia TODOS os templates APROVADOS da WABA pro contato do João (553784044850),
// um a um, pra avaliar visualmente como cada um chega no WhatsApp.
//
// Variáveis: usa os exemplos registrados na própria Meta (example.body_text),
// trocando a 1ª por "João". Headers de mídia usam criativos do Guadalupe 17/07:
//   IMAGE → capa do catálogo · VIDEO → GIF do lote 7 · DOCUMENT → PDF lotes A++
//
// Uso: node scripts/teste-todos-templates-2026-07-17.mjs <dir-com-midias> [--send] [--only nome1,nome2]
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ROOT = process.cwd()
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const GRAPH = (process.env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v25.0').replace(/^v?/, 'v')
const WABA = process.env.WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID || process.env.WABA_ID
const PHONE_ID = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID
const TOKEN = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const TO = '553784044850'
const THROTTLE_MS = 3000
const [mediaDir, ...flags] = process.argv.slice(2)
const SEND = flags.includes('--send')
const onlyIdx = flags.indexOf('--only')
const only = onlyIdx >= 0 ? new Set(flags[onlyIdx + 1].split(',')) : null

// ── mídias de exemplo (sobe 1x e assina) ────────────────────────────────────
async function subir(file, contentType) {
  const buf = fs.readFileSync(path.join(mediaDir, file))
  const dest = `disparos/teste-templates-2026-07-17/${file}`
  const { error } = await supabase.storage.from('whatsapp-media').upload(dest, buf, { contentType, upsert: true })
  if (error) throw new Error(`upload ${file}: ${error.message}`)
  const { data } = await supabase.storage.from('whatsapp-media').createSignedUrl(dest, 7 * 86400)
  return data.signedUrl
}

// ── templates aprovados da WABA ─────────────────────────────────────────────
async function listarAprovados() {
  const out = []
  let url = `https://graph.facebook.com/${GRAPH}/${WABA}/message_templates?fields=name,status,language,components&limit=100`
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
    const json = await res.json()
    if (!res.ok) throw new Error(JSON.stringify(json.error || json).slice(0, 300))
    out.push(...(json.data || []))
    url = json.paging?.next || null
  }
  return out.filter((t) => t.status === 'APPROVED')
}

function renderBody(text, params) {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? `{{${n}}}`)
}

const media = {
  IMAGE: SEND ? await subir('capa-guadalupe.jpg', 'image/jpeg') : 'dry',
  VIDEO: SEND ? await subir('lote007.mp4', 'video/mp4') : 'dry',
  DOCUMENT: SEND ? await subir('catalogo-app.pdf', 'application/pdf') : 'dry',
}

const templates = (await listarAprovados()).filter((t) => !only || only.has(t.name))
console.log(`${templates.length} templates aprovados · ${SEND ? '🚨 ENVIO REAL' : 'DRY-RUN'}\n`)

let sent = 0, failed = 0
for (const [i, t] of templates.entries()) {
  const comps = []
  let bodyTxt = ''
  let params = []
  for (const c of t.components) {
    if (c.type === 'HEADER') {
      if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format)) {
        const p = { type: c.format.toLowerCase(), [c.format.toLowerCase()]: { link: media[c.format] } }
        if (c.format === 'DOCUMENT') p.document.filename = 'Catalogo Guadalupe - Lotes A++.pdf'
        comps.push({ type: 'header', parameters: [p] })
      } else if (c.format === 'TEXT' && /\{\{1\}\}/.test(c.text || '')) {
        const ex = c.example?.header_text?.[0] || 'Bula'
        comps.push({ type: 'header', parameters: [{ type: 'text', text: ex }] })
      }
    }
    if (c.type === 'BODY') {
      bodyTxt = c.text || ''
      const nVars = Math.max(0, ...[...bodyTxt.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))
      params = (c.example?.body_text?.[0] || []).slice(0, nVars)
      while (params.length < nVars) params.push(`exemplo ${params.length + 1}`)
      if (nVars >= 1) params[0] = 'João'
      if (nVars > 0) comps.push({ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) })
    }
    if (c.type === 'BUTTONS') {
      (c.buttons || []).forEach((b, bi) => {
        if (b.type === 'URL' && /\{\{1\}\}/.test(b.url || '')) {
          const ex = b.example?.[0]?.replace(b.url.replace('{{1}}', ''), '') || 'x'
          comps.push({ type: 'button', sub_type: 'url', index: String(bi), parameters: [{ type: 'text', text: ex }] })
        }
      })
    }
  }

  const preview = renderBody(bodyTxt, params)
  console.log(`\n───── ${i + 1}/${templates.length} ${t.name} [${t.language}]`)
  console.log(preview.split('\n').map((l) => `  ${l}`).join('\n'))
  if (!SEND) continue

  const payload = {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: TO, type: 'template',
    template: { name: t.name, language: { code: t.language }, components: comps },
  }
  let status = 'failed', messageId = null, errMsg = null
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH}/${PHONE_ID}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(30000),
    })
    const json = await res.json().catch(() => null)
    if (res.ok) { status = 'sent'; messageId = json?.messages?.[0]?.id ?? null }
    else errMsg = json?.error?.message ? `${json.error.message} (code ${json.error.code})` : `HTTP ${res.status}`
  } catch (e) { errMsg = e?.message || 'fetch_error' }

  const headerMedia = t.components.find((c) => c.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format))
  await supabase.from('whatsapp_messages').insert({
    phone: TO, name: 'João (teste templates)', body: `[${t.name}]\n${preview}`,
    direction: 'outbound', status, channel: 'cloud', intent: 'campaign',
    origin: 'teste-todos-templates:2026-07-17',
    media_type: headerMedia ? headerMedia.format.toLowerCase() : null,
    reason: messageId ?? (status === 'failed' ? 'send_failed' : null), error_msg: errMsg,
  })
  console.log(status === 'sent' ? '  ✓ enviado' : `  ✗ FALHOU: ${errMsg}`)
  if (status === 'sent') sent++; else failed++
  if (i < templates.length - 1) await new Promise((r) => setTimeout(r, THROTTLE_MS))
}
console.log(`\n=== FIM === ${SEND ? `enviados ${sent} · falhas ${failed}` : '(dry-run)'}`)
