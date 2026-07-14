import http from 'node:http'
import { rm, mkdir, readdir, cp, access } from 'node:fs/promises'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import QRCode from 'qrcode'

// ── Config (via env) ────────────────────────────────────────────────────────
const PORT = Number(process.env.WHATSAPP_SERVER_PORT || process.env.PORT || 3001)

// Multi-sessão: cada inbox Baileys tem sua própria pasta de auth em
// `${SESSIONS_DIR}/${sessionId}`. AUTH_DIR é o layout LEGADO (sessão única) —
// mantido só para adoção automática no primeiro boot (ver adoptLegacyAuth).
const SESSIONS_DIR = process.env.SESSIONS_DIR || './auth-sessions'
const LEGACY_AUTH_DIR = process.env.AUTH_DIR || './auth'
// Sessão usada quando o chamador não informa `?session=` (compat retroativa:
// grupos das leiloeiras, notificação de assessor, campanhas, gif-lotes, etc.
// continuam operando este número).
const DEFAULT_SESSION_ID = process.env.DEFAULT_SESSION_ID || 'joao'

// Jitter anti-ban: intervalo ALEATÓRIO entre envios (quebra o fingerprint de
// disparo automático). Substitui o atraso fixo antigo. Mantém compat: se só
// DELAY_BETWEEN_SENDS_MS for passado, vira o piso do jitter.
const MIN_DELAY_MS = Number(process.env.MIN_DELAY_MS || process.env.DELAY_BETWEEN_SENDS_MS || 8000)
const MAX_DELAY_MS = Number(process.env.MAX_DELAY_MS || 25000)

// Tempo de vida do QR / código de pareamento antes do Baileys rotacionar a ref
// (e invalidar o código atual). Default do Baileys é 60s; subimos para dar mais
// folga em conexões lentas. OBS: o WhatsApp pode ter um teto próprio — se ele
// invalidar antes, é limite do lado do WhatsApp, não desta config.
const QR_TIMEOUT_MS = Number(process.env.QR_TIMEOUT_MS || 180000)

// Tolerância a latência alta (ex.: Starlink na roça): aumenta os timeouts do
// handshake/queries do Baileys para não estourar antes de a rede lenta responder.
const CONNECT_TIMEOUT_MS = Number(process.env.CONNECT_TIMEOUT_MS || 60000)
const QUERY_TIMEOUT_MS = Number(process.env.QUERY_TIMEOUT_MS || 120000)

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

const SESSION_ID_RE = /^[a-z0-9][a-z0-9-]{1,31}$/

// ── Estado por sessão ─────────────────────────────────────────────────────────
// Cada sessão (inbox Baileys) encapsula socket, status, QR, fila e pareamento
// próprios. A chave do Map é o sessionId (= whatsapp_inboxes.id no app).
/** @type {Map<string, Session>} */
const sessions = new Map()

/**
 * @typedef {Object} Session
 * @property {string} id
 * @property {import('@whiskeysockets/baileys').WASocket|null} socket
 * @property {string} connectionStatus
 * @property {string|null} currentQr
 * @property {string|null} currentQrDataUrl
 * @property {boolean} processing
 * @property {Array<object>} queue
 * @property {string|null} pairPhone
 * @property {string|null} pairingCode
 * @property {string} authDir
 */

/** Cria (ou retorna) o registro de estado de uma sessão. */
function createSession(id) {
  const existing = sessions.get(id)
  if (existing) return existing
  /** @type {Session} */
  const session = {
    id,
    socket: null,
    connectionStatus: 'connecting',
    currentQr: null,
    currentQrDataUrl: null,
    processing: false,
    queue: [],
    pairPhone: null,
    pairingCode: null,
    authDir: `${SESSIONS_DIR}/${id}`,
  }
  sessions.set(id, session)
  return session
}

function json(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
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
    else if (type === 'video') {
      content.video = { url: media.url }
      // `gif: true` → o WhatsApp exibe o vídeo como GIF (loop, sem som).
      // Usado pela página GIF de Lotes (divulgação de lotes de leilão).
      if (media.gif) content.gifPlayback = true
      // Dimensões explícitas: sem elas (e sem thumbnail) o iOS renderiza o
      // vídeo com proporção errada, cortando o quadro. O ffmpeg no VPS já
      // gera a thumbnail; width/height reforçam o aspect no proto.
      if (media.width) content.width = Number(media.width)
      if (media.height) content.height = Number(media.height)
    }
    else if (type === 'audio') { content.audio = { url: media.url }; delete content.caption }
    else {
      // Documento: nome vem como fileName (app) ou filename; o mimetype era
      // fixo em octet-stream -> WhatsApp entregava .bin. Agora infere pela
      // extensao quando o remetente nao manda mime explicito.
      const fname = media.fileName || media.filename || 'arquivo'
      const ext = (String(fname).split('.').pop() || '').toLowerCase()
      const extMime = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain', csv: 'text/csv', zip: 'application/zip' }[ext]
      content.document = { url: media.url }
      content.fileName = fname
      content.mimetype = media.mime || media.mimetype || media.contentType || extMime || 'application/octet-stream'
    }
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

/**
 * Resolve o JID de destino de um item da fila, usando o socket da sessão.
 *  - item.jid presente → destino explícito (grupo `...@g.us` ou JID pronto).
 *    Sem checagem onWhatsApp (grupos não respondem a ela).
 *  - senão → número individual: normaliza, confirma que existe no WhatsApp.
 */
async function resolveJid(session, item) {
  if (item.jid) {
    return String(item.jid).includes('@') ? String(item.jid) : `${item.jid}@g.us`
  }
  const normalized = normalizePhone(item.phone)
  if (!normalized) throw new Error('invalid_phone')
  const jid = `${normalized}@s.whatsapp.net`
  const exists = await session.socket.onWhatsApp(jid)
  if (!exists?.[0]?.exists) throw new Error('not_on_whatsapp')
  return jid
}

async function sendItem(session, item) {
  if (!session.socket || session.connectionStatus !== 'connected') throw new Error('whatsapp_disconnected')
  const jid = await resolveJid(session, item)

  const contents = buildContents(item)
  if (contents.length === 0) throw new Error('empty_message')
  for (const content of contents) {
    await session.socket.sendMessage(jid, content)
  }
}

async function processQueue(session) {
  if (session.processing) return
  session.processing = true
  try {
    while (session.queue.length > 0) {
      const item = session.queue.shift()
      const label = item.jid || normalizePhone(item.phone)
      try {
        await sendItem(session, item)
        console.log(`[${session.id}] enviado para ${label}`)
      } catch (error) {
        console.error(`[${session.id}] falha ao enviar para ${label}:`, error.message)
      }
      if (session.queue.length > 0) await sleep(jitter())
    }
  } finally {
    session.processing = false
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

/** contextInfo da mensagem (onde mora a citação), independente do tipo. */
function extractContextInfo(msg) {
  const m = msg.message
  if (!m) return null
  return (
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    null
  )
}

/**
 * Mensagem recebida num GRUPO → encaminha ao Next (/api/whatsapp/group-inbound).
 * Usado pelas automações de grupo (ex.: aprovação de cadastro nos grupos das
 * leiloeiras). O Next decide se o grupo interessa; aqui só encaminhamos texto
 * de terceiros (nunca o que nós mesmos enviamos — evita loop).
 */
async function handleGroupInbound(session, msg) {
  if (!INBOUND_ENABLED) return
  const jid = msg.key?.remoteJid || ''
  if (msg.key?.fromMe) return
  if (!jid.endsWith('@g.us')) return

  const text = extractText(msg)
  if (!text) return

  const ctx = extractContextInfo(msg)
  const quoted = ctx?.quotedMessage ? extractText({ message: ctx.quotedMessage }) : ''

  try {
    await fetch(`${NEXT_API_URL}/api/whatsapp/group-inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
      body: JSON.stringify({
        session: session.id,
        group_jid: jid,
        participant: msg.key?.participant || '',
        name: msg.pushName || '',
        body: text,
        quoted_body: quoted,
        message_id: msg.key?.id,
      }),
      signal: AbortSignal.timeout(25000),
    })
  } catch (error) {
    console.error(`[${session.id}] group-inbound webhook falhou:`, error.message)
  }
}

async function handleInbound(session, msg) {
  if (!INBOUND_ENABLED) return
  const jid = msg.key?.remoteJid || ''
  // Grupos têm rota própria; aqui só conversa individual, e nada que eu enviei.
  if (msg.key?.fromMe) return
  if (jid.endsWith('@g.us')) return handleGroupInbound(session, msg)
  if (!jid.endsWith('@s.whatsapp.net')) return

  const text = extractText(msg)
  if (!text) return

  const phone = normalizePhone(jid.split('@')[0])
  const name = msg.pushName || ''

  try {
    const res = await fetch(`${NEXT_API_URL}/api/whatsapp/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
      body: JSON.stringify({ session: session.id, phone, name, body: text, message_id: msg.key?.id }),
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) {
      console.error(`[${session.id}] inbound webhook HTTP ${res.status}`)
      return
    }
    const data = await res.json().catch(() => ({}))
    // O Next devolve `reply` só quando a automação está ligada para este inbox.
    // Inbox manual → `{silent:true}` sem reply → não respondemos (o humano assume).
    if (data.reply) {
      session.queue.push({ phone, message: data.reply })
      void processQueue(session)
    }
  } catch (error) {
    console.error(`[${session.id}] inbound webhook falhou:`, error.message)
  }
}

// ── Sessão Baileys ───────────────────────────────────────────────────────────
async function startSocket(session) {
  const { state, saveCreds } = await useMultiFileAuthState(session.authDir)
  const { version } = await fetchLatestBaileysVersion()

  session.socket = makeWASocket({
    auth: state,
    browser: Browsers.macOS('Bula CRM'),
    printQRInTerminal: false,
    qrTimeout: QR_TIMEOUT_MS,
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
    defaultQueryTimeoutMs: QUERY_TIMEOUT_MS,
    keepAliveIntervalMs: 25000,
    retryRequestDelayMs: 500,
    version,
  })

  session.socket.ev.on('creds.update', saveCreds)

  // Se há um número aguardando pareamento e a sessão ainda não foi registrada,
  // pede o código (em vez do QR). Pequeno atraso para o socket abrir o ws.
  if (session.pairPhone && !session.socket.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await session.socket.requestPairingCode(session.pairPhone)
        session.pairingCode = code
        console.log(`[${session.id}] pairing code para ${session.pairPhone}: ${code}`)
      } catch (error) {
        session.pairingCode = null
        console.error(`[${session.id}] requestPairingCode falhou:`, error.message)
      }
    }, 3000)
  }

  session.socket.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update
    // Log detalhado do handshake (diagnóstico de vínculo). Vai para
    // /var/log/whatsapp-crm.log (StandardOutput do systemd).
    console.log(`[conn:${session.id}] ${new Date().toISOString()} ` + JSON.stringify({
      connection,
      hasQr: !!qr,
      isNewLogin: update.isNewLogin,
      receivedPendingNotifications: update.receivedPendingNotifications,
      isOnline: update.isOnline,
      statusCode: lastDisconnect?.error?.output?.statusCode ?? null,
      err: lastDisconnect?.error?.message ?? null,
    }))
    if (qr) {
      session.connectionStatus = 'qr'
      session.currentQr = qr
      session.currentQrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 })
      console.log(`[${session.id}] QR Code gerado`)
    }
    if (connection === 'open') {
      session.connectionStatus = 'connected'
      session.currentQr = null
      session.currentQrDataUrl = null
      session.pairPhone = null
      session.pairingCode = null
      console.log(`[${session.id}] conectado`)
      void processQueue(session)
    }
    if (connection === 'connecting') {
      session.connectionStatus = session.currentQr ? 'qr' : 'connecting'
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const loggedOut = statusCode === DisconnectReason.loggedOut
      session.connectionStatus = 'disconnected'
      session.socket = null
      session.currentQr = null
      session.currentQrDataUrl = null
      console.log(`[${session.id}] desconectado${loggedOut ? ' (logout)' : ''}`)
      // Sessão removida (DELETE /sessions): não reconecta.
      if (!sessions.has(session.id)) return
      if (loggedOut) {
        // Sessão encerrada no aparelho: as credenciais em disco ficam inválidas.
        // Sem zerá-las, o socket nunca pede um QR novo e a sessão fica presa em
        // "disconnected". Limpa o auth e recomeça para gerar um QR fresco.
        rm(session.authDir, { recursive: true, force: true })
          .catch(error => console.error(`[${session.id}] limpar auth pós-logout:`, error.message))
          .finally(() => {
            setTimeout(() => {
              if (!sessions.has(session.id)) return
              session.connectionStatus = 'connecting'
              void startSocket(session).catch(error => console.error(`[${session.id}] restart pós-logout:`, error))
            }, 1500)
          })
      } else {
        setTimeout(() => {
          if (!sessions.has(session.id)) return
          session.connectionStatus = 'connecting'
          void startSocket(session).catch(error => console.error(`[${session.id}] reconnect:`, error))
        }, 3000)
      }
    }
  })

  // Sincronização de histórico: indica que o vínculo avançou para a fase de
  // sync (o "pesado"). Se aparece progresso, o link em si funcionou.
  session.socket.ev.on('messaging-history.set', ({ chats, contacts, messages, isLatest, progress, syncType }) => {
    console.log(`[history:${session.id}] ${new Date().toISOString()} ` + JSON.stringify({
      chats: chats?.length ?? 0,
      contacts: contacts?.length ?? 0,
      messages: messages?.length ?? 0,
      progress: progress ?? null,
      isLatest: isLatest ?? null,
      syncType: syncType ?? null,
    }))
  })

  session.socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      try { await handleInbound(session, msg) } catch (e) { console.error(`[${session.id}] handleInbound:`, e.message) }
    }
  })
}

// ── Bootstrap de sessões ──────────────────────────────────────────────────────
async function pathExists(p) {
  try { await access(p); return true } catch { return false }
}

/**
 * Primeiro boot no layout multi-sessão: se a sessão default ainda não existe em
 * SESSIONS_DIR mas há credenciais no layout LEGADO (./auth de sessão única),
 * copia-as para SESSIONS_DIR/<default> — assim o número já pareado (João) sobe
 * conectado, sem reparear. O ./auth legado é preservado como backup.
 */
async function adoptLegacyAuth() {
  const defaultDir = `${SESSIONS_DIR}/${DEFAULT_SESSION_ID}`
  const hasDefault = await pathExists(`${defaultDir}/creds.json`)
  const hasLegacy = await pathExists(`${LEGACY_AUTH_DIR}/creds.json`)
  if (!hasDefault && hasLegacy) {
    console.log(`[boot] adotando auth legado ${LEGACY_AUTH_DIR} → ${defaultDir}`)
    await cp(LEGACY_AUTH_DIR, defaultDir, { recursive: true })
  }
}

/** Descobre sessões existentes em disco e inicia todas (garante a default). */
async function bootstrapSessions() {
  await mkdir(SESSIONS_DIR, { recursive: true })
  await adoptLegacyAuth()

  const ids = new Set([DEFAULT_SESSION_ID])
  try {
    const entries = await readdir(SESSIONS_DIR, { withFileTypes: true })
    for (const e of entries) {
      if (e.isDirectory() && SESSION_ID_RE.test(e.name)) ids.add(e.name)
    }
  } catch (error) {
    console.error('[boot] readdir sessões falhou:', error.message)
  }

  for (const id of ids) {
    const session = createSession(id)
    void startSocket(session).catch(error => {
      session.connectionStatus = 'disconnected'
      console.error(`[${id}] erro ao iniciar:`, error)
    })
  }
  console.log(`[boot] sessões iniciadas: ${[...ids].join(', ')}`)
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

/** Lê `?session=` (ou usa a default). Retorna a sessão do Map (pode ser undefined). */
function resolveSession(url) {
  const raw = (url.searchParams.get('session') || '').trim()
  const id = raw || DEFAULT_SESSION_ID
  // A default é sempre garantida (criada on-demand se o boot ainda não terminou).
  if (id === DEFAULT_SESSION_ID) {
    const s = sessions.get(id)
    if (s) return s
    const created = createSession(id)
    void startSocket(created).catch(error => console.error(`[${id}] start on-demand:`, error))
    return created
  }
  return sessions.get(id)
}

function sessionSummary(s) {
  return {
    id: s.id,
    status: s.connectionStatus,
    hasQr: !!s.currentQrDataUrl,
    queueSize: s.queue.length,
    processing: s.processing,
    jid: s.socket?.user?.id ?? null,
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { json(res, 204, {}); return }

    // Guard de token (quando configurado). Bloqueia tudo, menos OPTIONS.
    if (API_TOKEN && req.headers['x-vps-token'] !== API_TOKEN) {
      json(res, 401, { error: 'unauthorized' })
      return
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    // ── Gestão de sessões (multi-inbox) ──────────────────────────────────────
    if (req.method === 'GET' && url.pathname === '/sessions') {
      json(res, 200, { sessions: [...sessions.values()].map(sessionSummary), default: DEFAULT_SESSION_ID })
      return
    }
    if (req.method === 'POST' && url.pathname === '/sessions') {
      const body = await readJson(req)
      const id = String(body.id || '').trim().toLowerCase()
      if (!SESSION_ID_RE.test(id)) {
        json(res, 400, { error: 'id inválido (use slug [a-z0-9-], 2–32 chars)' }); return
      }
      if (sessions.has(id)) { json(res, 409, { error: 'sessão já existe' }); return }
      const session = createSession(id)
      void startSocket(session).catch(error => {
        session.connectionStatus = 'disconnected'
        console.error(`[${id}] erro ao iniciar (nova sessão):`, error.message)
      })
      json(res, 201, { created: true, id, status: session.connectionStatus })
      return
    }
    if (req.method === 'DELETE' && url.pathname === '/sessions') {
      const id = (url.searchParams.get('session') || '').trim()
      if (!id) { json(res, 400, { error: 'session obrigatório' }); return }
      if (id === DEFAULT_SESSION_ID) { json(res, 403, { error: 'não é permitido remover a sessão default' }); return }
      const session = sessions.get(id)
      if (!session) { json(res, 404, { error: 'unknown_session' }); return }
      sessions.delete(id) // remove antes de encerrar → connection.update não reconecta
      try { session.socket?.end() } catch { /* ignore */ }
      try { await session.socket?.logout() } catch { /* pode já estar desconectado */ }
      await rm(session.authDir, { recursive: true, force: true }).catch(() => {})
      json(res, 200, { deleted: true, id })
      return
    }

    // ── Sessão-alvo das rotas abaixo (default quando ?session= ausente) ───────
    if (req.method === 'GET' && url.pathname === '/status') {
      const session = resolveSession(url)
      if (!session) { json(res, 404, { error: 'unknown_session' }); return }
      json(res, 200, { session: session.id, status: session.connectionStatus, qr: session.currentQrDataUrl, pairing_code: session.pairingCode })
      return
    }

    // Pareamento por número: gera um código de 8 caracteres para digitar no
    // WhatsApp (Aparelhos conectados → Conectar com número). Alternativa ao QR.
    if (req.method === 'POST' && url.pathname === '/pair') {
      const body = await readJson(req)
      const session = resolveSession(url) || (body.session ? sessions.get(String(body.session)) : null)
      if (!session) { json(res, 404, { error: 'unknown_session' }); return }
      const phone = normalizePhone(body.phone)
      if (!phone) { json(res, 400, { error: 'phone obrigatório (com DDD)' }); return }
      if (session.connectionStatus === 'connected') { json(res, 409, { error: 'sessão já conectada' }); return }

      // Recomeça com credenciais limpas para garantir uma sessão não-registrada
      // (requestPairingCode só funciona antes do registro).
      session.pairPhone = phone
      session.pairingCode = null
      try { await rm(session.authDir, { recursive: true, force: true }) } catch { /* dir pode não existir */ }
      if (session.socket) { try { session.socket.end() } catch { /* ignore */ } session.socket = null }
      session.connectionStatus = 'connecting'
      void startSocket(session).catch(error => console.error(`[${session.id}] pair restart:`, error.message))

      // Aguarda o código ser gerado (até ~13s).
      for (let i = 0; i < 26; i++) { if (session.pairingCode) break; await sleep(500) }
      if (session.pairingCode) { json(res, 200, { pairing_code: session.pairingCode, phone: session.pairPhone }); return }
      json(res, 202, { pending: true, message: 'código sendo gerado; consulte /status' })
      return
    }

    if (req.method === 'GET' && (url.pathname === '/queue' || url.pathname === '/health')) {
      const session = resolveSession(url)
      json(res, 200, {
        status: session?.connectionStatus ?? 'unknown',
        queueSize: session?.queue.length ?? 0,
        processing: session?.processing ?? false,
        inbound_enabled: INBOUND_ENABLED,
        jitter_ms: [MIN_DELAY_MS, MAX_DELAY_MS],
        sessions: [...sessions.keys()],
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/send-direct') {
      const body = await readJson(req)
      const session = resolveSession(url)
      if (!session) { json(res, 404, { error: 'unknown_session' }); return }
      const phone = normalizePhone(body.phone)
      const message = String(body.message || '').trim()
      if (!phone || (!message && !body.media)) {
        json(res, 400, { error: 'phone e (message ou media) são obrigatórios' })
        return
      }
      session.queue.push({ phone, message, media: body.media || null, poll: body.poll || null })
      void processQueue(session)
      json(res, 200, { queued: true, position: session.queue.length, session: session.id })
      return
    }

    // Lista os grupos de que a sessão participa — usado para descobrir o JID
    // (`...@g.us`) do grupo destino antes de enviar.
    if (req.method === 'GET' && url.pathname === '/groups') {
      const session = resolveSession(url)
      if (!session) { json(res, 404, { error: 'unknown_session' }); return }
      if (!session.socket || session.connectionStatus !== 'connected') {
        json(res, 503, { error: 'whatsapp_disconnected' })
        return
      }
      try {
        const participating = await session.socket.groupFetchAllParticipating()
        const groups = Object.values(participating || {}).map(g => ({
          id: g.id,
          subject: g.subject || '',
          size: Array.isArray(g.participants) ? g.participants.length : (g.size ?? null),
        }))
        json(res, 200, { groups })
      } catch (error) {
        json(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
      return
    }

    // Envia para um grupo. Aceita `groupId` (JID `...@g.us` ou só o id antes do @).
    if (req.method === 'POST' && url.pathname === '/send-group') {
      const body = await readJson(req)
      const session = resolveSession(url)
      if (!session) { json(res, 404, { error: 'unknown_session' }); return }
      const rawId = String(body.groupId || body.jid || '').trim()
      const message = String(body.message || '').trim()
      if (!rawId || (!message && !body.media)) {
        json(res, 400, { error: 'groupId e (message ou media) são obrigatórios' })
        return
      }
      const jid = rawId.includes('@') ? rawId : `${rawId}@g.us`
      session.queue.push({ jid, message, media: body.media || null, poll: body.poll || null })
      void processQueue(session)
      json(res, 200, { queued: true, position: session.queue.length, jid })
      return
    }

    if (req.method === 'POST' && url.pathname === '/campaign-send') {
      const body = await readJson(req)
      const session = resolveSession(url)
      if (!session) { json(res, 404, { error: 'unknown_session' }); return }
      const recipients = Array.isArray(body.recipients) ? body.recipients : []
      if (recipients.length === 0) {
        json(res, 400, { error: 'recipients vazio' })
        return
      }
      let queued = 0
      for (const r of recipients) {
        const phone = normalizePhone(r.phone)
        if (!phone) continue
        session.queue.push({
          phone,
          message: r.message || r.caption || '',
          media: body.media || r.media || null,
          poll: body.poll || r.poll || null,
        })
        queued++
      }
      void processQueue(session)
      json(res, 200, { queued, campaign_id: body.campaign_id || null, queue_size: session.queue.length })
      return
    }

    json(res, 404, { error: 'not_found' })
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(PORT, () => {
  console.log(`[crm-whatsapp] servidor em http://0.0.0.0:${PORT}`)
  console.log(`[crm-whatsapp] sessões: ${SESSIONS_DIR} · default: ${DEFAULT_SESSION_ID} · inbound: ${INBOUND_ENABLED ? 'on' : 'off'} · jitter: ${MIN_DELAY_MS}-${MAX_DELAY_MS}ms`)
})

void bootstrapSessions().catch(error => {
  console.error('[crm-whatsapp] erro no bootstrap de sessões:', error)
})
