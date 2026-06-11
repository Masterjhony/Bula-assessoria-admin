import http from 'node:http'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import QRCode from 'qrcode'

const PORT = Number(process.env.WHATSAPP_SERVER_PORT || process.env.PORT || 3001)
const AUTH_DIR = process.env.AUTH_DIR || './auth'
const DELAY_BETWEEN_SENDS_MS = Number(process.env.DELAY_BETWEEN_SENDS_MS || 4000)

let socket = null
let connectionStatus = 'connecting'
let currentQr = null
let currentQrDataUrl = null
let processing = false
const queue = []

function json(res, statusCode, body) {
  const payload = JSON.stringify(body)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  res.end(payload)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', chunk => {
      raw += chunk
      if (raw.length > 1_000_000) {
        reject(new Error('body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('invalid json'))
      }
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

async function sendDirect({ phone, message }) {
  if (!socket || connectionStatus !== 'connected') {
    throw new Error('whatsapp_disconnected')
  }

  const normalized = normalizePhone(phone)
  if (!normalized) throw new Error('invalid_phone')

  const jid = `${normalized}@s.whatsapp.net`
  const exists = await socket.onWhatsApp(jid)
  if (!exists?.[0]?.exists) throw new Error('not_on_whatsapp')

  await socket.sendMessage(jid, { text: message })
}

async function processQueue() {
  if (processing) return
  processing = true
  try {
    while (queue.length > 0) {
      const item = queue.shift()
      try {
        await sendDirect(item)
        console.log(`[crm-whatsapp] enviado para ${normalizePhone(item.phone)}`)
      } catch (error) {
        console.error(`[crm-whatsapp] falha ao enviar para ${normalizePhone(item.phone)}:`, error.message)
      }
      if (queue.length > 0) await sleep(DELAY_BETWEEN_SENDS_MS)
    }
  } finally {
    processing = false
  }
}

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
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      json(res, 204, {})
      return
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    if (req.method === 'GET' && url.pathname === '/status') {
      json(res, 200, {
        status: connectionStatus,
        qr: currentQrDataUrl,
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/queue') {
      json(res, 200, {
        queueSize: queue.length,
        processing,
        delayBetweenSendsMs: DELAY_BETWEEN_SENDS_MS,
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/send-direct') {
      const body = await readJson(req)
      const phone = normalizePhone(body.phone)
      const message = String(body.message || '').trim()

      if (!phone || !message) {
        json(res, 400, { error: 'phone e message sao obrigatorios' })
        return
      }

      queue.push({ phone, message })
      void processQueue()

      json(res, 200, {
        queued: true,
        position: queue.length,
      })
      return
    }

    json(res, 404, { error: 'not_found' })
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(PORT, () => {
  console.log(`[crm-whatsapp] servidor local em http://localhost:${PORT}`)
  console.log(`[crm-whatsapp] auth dir: ${AUTH_DIR}`)
})

void startSocket().catch(error => {
  connectionStatus = 'disconnected'
  console.error('[crm-whatsapp] erro ao iniciar:', error)
})
