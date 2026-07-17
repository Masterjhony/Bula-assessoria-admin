// Teste de disparo: template bula_padrao_lote_video (Cloud API oficial) com o
// GIF do lote 7 do Guadalupe pro próprio contato do João — validação visual
// antes de decidir por um disparo massivo.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ROOT = 'F:/Projetos/Desktop/web-bula'
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const GRAPH = (process.env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v25.0').replace(/^v?/, 'v')
const PHONE_ID = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID
const TOKEN = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const TO = '553784044850' // Eu (você) — +55 37 8404-4850
const NOME = 'João'
const GIF = process.argv[2] // caminho do lote007.mp4

const PARAMS = [
  NOME,
  'bezerras, doadoras e aspirações Nelore PO (seleção A++)',
  '*HOJE, às 20h*, no 20º Leilão Guadalupe',
  'elevar a genética do seu rebanho — 30x no boleto e frete grátis',
]
const render = p => `Fala, ${p[0]}! Olha eu aqui mais uma vez… 😁\n\nPassando para te mostrar o padrão de ${p[1]} que estará disponível ${p[2]}.\n\nBora mexer! Aproveite a oportunidade para ${p[3]}. 🤩`

// ── mídia: sobe o clipe pro bucket whatsapp-media e assina (padrão dos disparos)
const buf = fs.readFileSync(GIF)
if (buf.length > 16 * 1024 * 1024) throw new Error('vídeo excede 16MB do WhatsApp')
const dest = `disparos/guadalupe-2026-07-17/${Date.now()}-lote007.mp4`
const { error: upErr } = await supabase.storage.from('whatsapp-media').upload(dest, buf, { contentType: 'video/mp4', upsert: true })
if (upErr) throw new Error(`upload: ${upErr.message}`)
const { data: signed } = await supabase.storage.from('whatsapp-media').createSignedUrl(dest, 7 * 86400)
if (!signed?.signedUrl) throw new Error('URL assinada falhou')
console.log('mídia ok:', dest)

// ── envio do template
const payload = {
  messaging_product: 'whatsapp', recipient_type: 'individual', to: TO, type: 'template',
  template: {
    name: 'bula_padrao_lote_video', language: { code: 'pt_BR' },
    components: [
      { type: 'header', parameters: [{ type: 'video', video: { link: signed.signedUrl } }] },
      { type: 'body', parameters: PARAMS.map(t => ({ type: 'text', text: t })) },
    ],
  },
}
const res = await fetch(`https://graph.facebook.com/${GRAPH}/${PHONE_ID}/messages`, {
  method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload), signal: AbortSignal.timeout(30000),
})
const json = await res.json().catch(() => null)
let status = 'failed', messageId = null, errMsg = null
if (res.ok) { status = 'sent'; messageId = json?.messages?.[0]?.id ?? null }
else errMsg = json?.error?.message ? `${json.error.message} (code ${json.error.code})` : `HTTP ${res.status}`
console.log(status === 'sent' ? `✓ enviado (${messageId})` : `✗ falhou: ${errMsg}`)

// ── log no cockpit (mesmo formato dos disparos reais)
await supabase.from('whatsapp_messages').insert({
  phone: TO, name: 'João (teste)', body: render(PARAMS),
  direction: 'outbound', status, channel: 'cloud', intent: 'campaign',
  origin: 'teste-guadalupe-template:2026-07-17',
  media_url: dest, media_type: 'video', media_mime: 'video/mp4', media_filename: 'lote007.mp4',
  reason: messageId ?? (status === 'failed' ? 'send_failed' : null), error_msg: errMsg,
})
if (status !== 'sent') process.exit(1)
