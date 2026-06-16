import http from 'node:http'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import QRCode from 'qrcode'

// ── Config (via env) ────────────────────────────────────────────────────────
const PORT = Number(process.env.WHATSAPP_SERVER_PORT || process.env.PORT || 3001)
const AUTH_DIR = process.env.AUTH_DIR || './auth'

// Jitter anti-ban: intervalo ALEATÓRIO entre envios (quebra o fingerprint de
// disparo automático). Substitui o atraso fixo antigo. Mantém compat: se só
// DELAY_BETWEEN_SENDS_MS for passado, vira o piso do jitter.
const MIN_DELAY_MS = Number(process.env.MIN_DELAY_MS || process.env.DELAY_BETWEEN_SENDS_MS || 8000)
const MAX_DELAY_MS = Number(process.env.MAX_DELAY_MS || 25000)

// Webhook de inbound: o Next (Central WhatsApp) roda o fluxo do bot e devolve a
// resposta. Sem NEXT_API_URL+WEBHOOK_SECRET, a sessão só envia (não responde).
const NEXT_API_URL = (process.env.NEXT_API_URL || '').replace(/\/$/, '')
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || process.env.WHATSAPP_GROUP_TASK_SECRET || ''
const INBOUND_ENABLED = Boolean(NEXT_API_URL && WEBHOOK_SECRET)

// Guard de acesso: quando API_TOKEN está setado, todo request (exceto OPTIONS)
// precisa do header `x-vps-token` correspondente. Imprescindível com a porta
// exposta num IP público — sem isso qualquer um poderia enviar mensagens ou ler
// o QR (e sequestrar a sessão). O Next envia esse token em WHATSAPP_SERVER_TOKEN.
const API_TOKEN = process.env.API_TOKEN || ''

let socket = null
let connectionStatus = 'connecting'
let currentQr = null
let currentQrDataUrl = null
let processing = false
const queue = []

function json(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  res.end(JSON.stringify(body))
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', chunk => {
      raw += chunk
      if (raw.length > 5_000_000) {
        reject(new Error('body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch { reject(new Error('invalid json')) }
    })
    req.on('error', reject)
  })
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55')) return digits
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`
  return digits
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Atraso aleatório entre [MIN, MAX] — jitter anti-ban. */
function jitter() {
  const lo = Math.max(0, MIN_DELAY_MS)
  const hi = Math.max(lo, MAX_DELAY_MS)
  return lo + Math.floor(Math.random() * (hi - lo + 1))
}

// ── Envio ───────────────────────────────────────────────────────────────────

/** Monta o(s) payload(s) Baileys para um item da fila (texto/mídia/enquete). */
function buildContents(item) {
  const contents = []
  const message = String(item.message || '').trim()
  const media = item.media && item.media.url ? item.media : null
  const poll = item.poll && item.poll.question && Array.isArray(item.poll.options) && item.poll.options.length >= 2
    ? item.poll
    : null

  if (media) {
    const type = ['image', 'video', 'audio', 'document'].includes(media.type) ? media.type : 'document'
    const content = { caption: media.caption || message || undefined }
    if (type === 'image') content.image = { url: media.url }
    else if (type === 'video') content.video = { url: media.url }
    else if (type === 'audio') { content.audio = { url: media.url }; delete content.caption }
    else { content.document = { url: media.url }; content.fileName = media.filename || 'arquivo'; content.mimetype = media.mime || 'application/octet-stream' }
    contents.push(content)
  } else if (message) {
    contents.push({ text: message })
  }

  if (poll) {
    contents.push({
      poll: {
        name: poll.question,
        values: poll.options.slice(0, 12),
        selectableCount: Math.min(Math.max(1, poll.selectable_count || 1), poll.options.length),
      },
    })
  }
  return contents
}

async function sendItem(item) {
  if (!socket || connectionStatus !== 'connected') throw new Error('whatsapp_disconnected')
  const normalized = normalizePhone(item.phone)
  if (!normalized) throw new Error('invalid_phone')

  const jid = `${normalized}@s.whatsapp.net`
  const exists = await socket.onWhatsApp(jid)
  if (!exists?.[0]?.exists) throw new Error('not_on_whatsapp')

  const contents = buildContents(item)
  if (contents.length === 0) throw new Error('empty_message')
  for (const content of contents) {
    await socket.sendMessage(jid, content)
  }
}

async function processQueue() {
  if (processing) return
  processing = true
  try {
    while (queue.length > 0) {
      const item = queue.shift()
      try {
        await sendItem(item)
        console.log(`[crm-whatsapp] enviado para ${normalizePhone(item.phone)}`)
      } catch (error) {
        console.error(`[crm-whatsapp] falha ao enviar para ${normalizePhone(item.phone)}:`, error.message)
      }
      if (queue.length > 0) await sleep(jitter())
    }
  } finally {
    processing = false
  }
}

// ── Inbound → Next (fluxo do bot) ────────────────────────────────────────────

function extractText(msg) {
  const m = msg.message
  if (!m) return ''
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  ).trim()
}

async function handleInbound(msg) {
  if (!INBOUND_ENABLED) return
  const jid = msg.key?.remoteJid || ''
  // Só conversa individual (ignora grupos, status, broadcast) e nada que eu enviei.
  if (msg.key?.fromMe) return
  if (!jid.endsWith('@s.whatsapp.net')) return

  const text = extractText(msg)
  if (!text) return

  const phone = normalizePhone(jid.split('@')[0])
  const name = msg.pushName || ''

  try {
    const res = await fetch(`${NEXT_API_URL}/api/whatsapp/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
      body: JSON.stringify({ phone, name, body: text, message_id: msg.key?.id }),
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) {
      console.error(`[crm-whatsapp] inbound webhook HTTP ${res.status}`)
      return
    }
    const data = await res.json().catch(() => ({}))
    if (data.reply) {
      queue.push({ phone, message: data.reply })
      void processQueue()
    }
  } catch (error) {
    console.error('[crm-whatsapp] inbound webhook falhou:', error.message)
  }
}

// ── Sessão Baileys ───────────────────────────────────────────────────────────
async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  socket = makeWASocket({
    auth: state,
    browser: Browsers.macOS('Bula CRM'),
    printQRInTerminal: false,
    version,
  })

  socket.ev.on('creds.update', saveCreds)

  socket.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update
    if (qr) {
      connectionStatus = 'qr'
      currentQr = qr
      currentQrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 })
      console.log('[crm-whatsapp] QR Code gerado')
    }
    if (connection === 'open') {
      connectionStatus = 'connected'
      currentQr = null
      currentQrDataUrl = null
      console.log('[crm-whatsapp] conectado')
      void processQueue()
    }
    if (connection === 'connecting') {
      connectionStatus = currentQr ? 'qr' : 'connecting'
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const loggedOut = statusCode === DisconnectReason.loggedOut
      connectionStatus = 'disconnected'
      socket = null
      console.log(`[crm-whatsapp] desconectado${loggedOut ? ' (logout)' : ''}`)
      if (!loggedOut) {
        setTimeout(() => {
          connectionStatus = 'connecting'
          void startSocket().catch(error => console.error('[crm-whatsapp] reconnect:', error))
        }, 3000)
      }
    }
  })

  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      try { await handleInbound(msg) } catch (e) { console.error('[crm-whatsapp] handleInbound:', e.message) }
    }
  })
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { json(res, 204, {}); return }

    // Guard de token (quando configurado). Bloqueia tudo, menos OPTIONS.
    if (API_TOKEN && req.headers['x-vps-token'] !== API_TOKEN) {
      json(res, 401, { error: 'unauthorized' })
      return
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    if (req.method === 'GET' && url.pathname === '/status') {
      json(res, 200, { status: connectionStatus, qr: currentQrDataUrl })
      return
    }
    if (req.method === 'GET' && (url.pathname === '/queue' || url.pathname === '/health')) {
      json(res, 200, {
        status: connectionStatus,
        queueSize: queue.length,
        processing,
        inbound_enabled: INBOUND_ENABLED,
        jitter_ms: [MIN_DELAY_MS, MAX_DELAY_MS],
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/send-direct') {
      const body = await readJson(req)
      const phone = normalizePhone(body.phone)
      const message = String(body.message || '').trim()
      if (!phone || (!message && !body.media)) {
        json(res, 400, { error: 'phone e (message ou media) são obrigatórios' })
        return
      }
      queue.push({ phone, message, media: body.media || null, poll: body.poll || null })
      void processQueue()
      json(res, 200, { queued: true, position: queue.length })
      return
    }

    if (req.method === 'POST' && url.pathname === '/campaign-send') {
      const body = await readJson(req)
      const recipients = Array.isArray(body.recipients) ? body.recipients : []
      if (recipients.length === 0) {
        json(res, 400, { error: 'recipients vazio' })
        return
      }
      let queued = 0
      for (const r of recipients) {
        const phone = normalizePhone(r.phone)
        if (!phone) continue
        queue.push({
          phone,
          message: r.message || r.caption || '',
          media: body.media || r.media || null,
          poll: body.poll || r.poll || null,
        })
        queued++
      }
      void processQueue()
      json(res, 200, { queued, campaign_id: body.campaign_id || null, queue_size: queue.length })
      return
    }

    json(res, 404, { error: 'not_found' })
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(PORT, () => {
  console.log(`[crm-whatsapp] servidor em http://0.0.0.0:${PORT}`)
  console.log(`[crm-whatsapp] auth dir: ${AUTH_DIR} · inbound: ${INBOUND_ENABLED ? 'on' : 'off'} · jitter: ${MIN_DELAY_MS}-${MAX_DELAY_MS}ms`)
})

void startSocket().catch(error => {
  connectionStatus = 'disconnected'
  console.error('[crm-whatsapp] erro ao iniciar:', error)
})
