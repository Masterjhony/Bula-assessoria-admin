// Lista todos os templates da WABA com tipo de header (mídia ou texto) e status.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const GRAPH = (process.env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v25.0').replace(/^v?/, 'v')
const WABA = process.env.WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID || process.env.WABA_ID
const TOKEN = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN

const all = []
let url = `https://graph.facebook.com/${GRAPH}/${WABA}/message_templates?fields=name,status,category,components&limit=100`
while (url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
  const json = await res.json()
  if (!res.ok) { console.error(JSON.stringify(json.error || json).slice(0, 300)); process.exit(1) }
  all.push(...(json.data || []))
  url = json.paging?.next || null
}

const rows = all.map((t) => {
  const h = t.components?.find((c) => c.type === 'HEADER')
  const header = h ? h.format : '—'
  return { name: t.name, status: t.status, category: t.category, header }
})
const ord = { VIDEO: 0, IMAGE: 1, DOCUMENT: 2, TEXT: 3, '—': 4 }
rows.sort((a, b) => (ord[a.header] ?? 9) - (ord[b.header] ?? 9) || a.name.localeCompare(b.name))
for (const r of rows) console.log(`${r.header.padEnd(9)} ${r.status.padEnd(9)} ${r.category.padEnd(10)} ${r.name}`)
console.log(`\nTotal: ${rows.length} · com mídia: ${rows.filter((r) => ['VIDEO', 'IMAGE', 'DOCUMENT'].includes(r.header)).length}`)
