// Reprocessa OFFLINE os dumps brutos de history sync salvos por server.js
// (HISTORY_DUMP_DIR). Resolve @lid → telefone pelo mesmo mapa LID↔PN persistido
// no auth da sessão e reenvia as conversas 1:1 ao Next — SEM exigir novo re-link.
//
// Uso:
//   node replay-history.mjs [sessionId] [--dir ./history-dumps] [--auth ./auth-sessions/<id>] [--dry]
//   node replay-history.mjs --file ./history-dumps/joao-....json [--auth ...]
//
// Env necessárias (herda de /opt/whatsapp-crm/.env ou do ambiente):
//   NEXT_API_URL, WEBHOOK_SECRET (ou WHATSAPP_GROUP_TASK_SECRET)

import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { useMultiFileAuthState } from '@whiskeysockets/baileys'

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (name, def = null) => {
  const i = argv.indexOf(name)
  return i >= 0 ? (argv[i + 1] ?? true) : def
}
const DRY = argv.includes('--dry')
const sessionId = argv.find(a => !a.startsWith('--') && argv.indexOf(a) === 0) || 'joao'
const DUMP_DIR = flag('--dir', process.env.HISTORY_DUMP_DIR || './history-dumps')
const ONE_FILE = flag('--file', null)
const AUTH_DIR = flag('--auth', `${process.env.SESSIONS_DIR || './auth-sessions'}/${sessionId}`)

// ── env (.env simples) ────────────────────────────────────────────────────────
if (!process.env.NEXT_API_URL && existsSync('./.env')) {
  for (const line of (await readFile('./.env', 'utf8')).split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const NEXT_API_URL = (process.env.NEXT_API_URL || '').replace(/\/$/, '')
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || process.env.WHATSAPP_GROUP_TASK_SECRET || ''
if (!DRY && (!NEXT_API_URL || !WEBHOOK_SECRET)) {
  console.error('Faltam NEXT_API_URL / WEBHOOK_SECRET (ou rode com --dry).')
  process.exit(1)
}

// ── helpers (espelham server.js) ──────────────────────────────────────────────
const normalizePhone = value => {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55')) return digits
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`
  return digits
}
const unwrap = m => !m ? m : (
  m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message ||
  m.viewOnceMessageV2Extension?.message || m.documentWithCaptionMessage?.message ||
  m.editedMessage?.message || m.protocolMessage?.editedMessage || m.deviceSentMessage?.message || m
)
const extractText = msg => {
  const m = unwrap(msg.message)
  if (!m) return ''
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption ||
    m.videoMessage?.caption || m.documentMessage?.caption || m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title || m.templateButtonReplyMessage?.selectedDisplayText || ''
}

// ── carrega mapa LID→PN da sessão ─────────────────────────────────────────────
const { state } = await useMultiFileAuthState(AUTH_DIR)
async function resolveLidToPhone(lidJids) {
  const map = new Map()
  const users = [...new Set(lidJids.map(j => j.split('@')[0].split(':')[0]))]
  const keys = users.map(u => `${u}_reverse`)
  const stored = await state.keys.get('lid-mapping', keys)
  for (const j of lidJids) {
    const u = j.split('@')[0].split(':')[0]
    const pn = stored[`${u}_reverse`]
    if (pn) map.set(j, normalizePhone(String(pn).split('@')[0].split(':')[0]))
  }
  return map
}

// ── coleta dumps ──────────────────────────────────────────────────────────────
let files = []
if (ONE_FILE) files = [ONE_FILE]
else {
  const all = await readdir(DUMP_DIR).catch(() => [])
  files = all.filter(f => f.startsWith(`${sessionId}-`) && f.endsWith('.json')).sort().map(f => `${DUMP_DIR}/${f}`)
}
if (!files.length) { console.error(`Nenhum dump encontrado (dir=${DUMP_DIR}, session=${sessionId}).`); process.exit(1) }
console.log(`Replay: ${files.length} dump(s), auth=${AUTH_DIR}, dry=${DRY}`)

// ── processa: dedup global por message_id ─────────────────────────────────────
const seen = new Set()
const batch = []
let grupo = 0, outro = 0, lidSemMapa = 0, semTexto = 0
for (const file of files) {
  const messages = JSON.parse(await readFile(file, 'utf8'))
  const lidJids = [...new Set(messages.map(m => m.key?.remoteJid || '').filter(j => j.endsWith('@lid')))]
  const lidMap = await resolveLidToPhone(lidJids)
  for (const msg of messages) {
    const jid = msg.key?.remoteJid || ''
    if (jid.endsWith('@g.us')) { grupo++; continue }
    let phone = ''
    if (jid.endsWith('@s.whatsapp.net')) phone = normalizePhone(jid.split('@')[0].split(':')[0])
    else if (jid.endsWith('@lid')) {
      phone = lidMap.get(jid) || ''
      if (!phone) {
        const alt = msg.key?.remoteJidAlt || ''
        if (alt.endsWith('@s.whatsapp.net')) phone = normalizePhone(alt.split('@')[0].split(':')[0])
      }
    } else { outro++; continue }
    if (!phone) { lidSemMapa++; continue }
    const text = extractText(msg)
    if (!text) { semTexto++; continue }
    const id = msg.key?.id
    if (id && seen.has(id)) continue
    if (id) seen.add(id)
    const tsRaw = msg.messageTimestamp
    const ts = tsRaw ? Number(typeof tsRaw === 'object' && tsRaw.toNumber ? tsRaw.toNumber() : tsRaw) : null
    batch.push({ phone, name: msg.pushName || '', body: text, from_me: !!msg.key?.fromMe, message_id: id, ts: ts && Number.isFinite(ts) ? ts : null })
  }
}

const contatos = new Set(batch.map(b => b.phone)).size
console.log(`Resumo: grupo=${grupo} outro=${outro} lidSemMapa=${lidSemMapa} semTexto=${semTexto} 1:1_prontas=${batch.length} (contatos únicos=${contatos})`)
if (DRY) {
  console.log('Amostra:', batch.slice(0, 8).map(b => ({ phone: b.phone, from_me: b.from_me, body: b.body.slice(0, 40) })))
  console.log('DRY — nada enviado.')
  process.exit(0)
}
if (!batch.length) { console.log('Nada a enviar.'); process.exit(0) }

let enviadas = 0
for (let i = 0; i < batch.length; i += 200) {
  const chunk = batch.slice(i, i + 200)
  const res = await fetch(`${NEXT_API_URL}/api/whatsapp/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
    body: JSON.stringify({ session: sessionId, messages: chunk }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) console.error(`chunk ${i} HTTP ${res.status}`)
  else enviadas += chunk.length
  process.stdout.write(`\r${enviadas}/${batch.length} enviadas`)
}
console.log(`\nOK — ${enviadas} msgs 1:1 reenviadas ao CRM (${contatos} contatos).`)
