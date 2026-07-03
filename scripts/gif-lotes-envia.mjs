// Envia GIFs de lotes (vídeo ~6s + legenda juntos) pelo Baileys (VPS).
//
// Job = JSON com { phone OU group_id, leilao, gifs_dir, lotes: [...] } — ver
// scripts/gif-lotes-navirai-2026-07-05.json como exemplo. Os MP4s são
// enviados ao bucket público `lote-gifs` e o VPS recebe a URL + caption.
//
// Uso:
//   node scripts/gif-lotes-envia.mjs <job.json> --dry-run      # só imprime
//   node scripts/gif-lotes-envia.mjs <job.json> --upload-only  # sobe GIFs
//   node scripts/gif-lotes-envia.mjs <job.json>                # envia tudo
//   node scripts/gif-lotes-envia.mjs <job.json> --only 2,3     # subconjunto
//
// A mesma lógica existe na UI (Ferramentas → GIF de Lotes); este script é a
// via de automação/lote grande (a UI usa para ajustes finos e casos avulsos).

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const VPS = env.WHATSAPP_SERVER_URL
const VPS_HEADERS = { 'x-vps-token': env.WHATSAPP_SERVER_TOKEN || '', 'Content-Type': 'application/json' }
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const [jobPath, ...flags] = process.argv.slice(2)
if (!jobPath) {
  console.error('Uso: node scripts/gif-lotes-envia.mjs <job.json> [--dry-run] [--only 2,3]')
  process.exit(1)
}
const dryRun = flags.includes('--dry-run')
const uploadOnly = flags.includes('--upload-only')
const onlyIdx = flags.indexOf('--only')
const only = onlyIdx >= 0 ? new Set(flags[onlyIdx + 1].split(',').map(Number)) : null

const job = JSON.parse(readFileSync(jobPath, 'utf-8'))
const lots = job.lotes.filter((l) => !only || only.has(Number(l.lote)))

// ── Legenda (mesmo padrão da página GIF de Lotes) ───────────────────────────

function idadeCurta(idade) {
  if (!idade) return null
  const m = idade.match(/(\d+)\s*ANOS?(?:\s*E?\s*(\d+)\s*M)?/i)
  if (!m) return idade.toLowerCase()
  const total = Number(m[1]) * 12 + Number(m[2] || 0)
  return total <= 36 ? `${total} meses` : `${Math.floor(total / 12)} anos`
}

function buildCaption(l, cond) {
  const linhas = [`🔥 LOTE ${l.lote} — ${l.nome}`, '']
  const resumo = [idadeCurta(l.idade), l.peso_atual_kg ? `${l.peso_atual_kg} kg` : null,
    l.pai ? `PAI: ${l.pai}` : null].filter(Boolean).join(' • ')
  if (resumo) linhas.push(`📌 ${resumo}`)
  if (l.cria) {
    const sexo = String(l.cria.sexo || '').toUpperCase() === 'MACHO' ? 'macho' : 'fêmea'
    const extra = [l.cria.peso_kg ? `${l.cria.peso_kg} kg` : null,
      l.cria.nascimento ? `nasc. ${l.cria.nascimento}` : null].filter(Boolean).join(' • ')
    linhas.push(`🍼 Cria ${sexo} ao pé${extra ? ` • ${extra}` : ''}`)
  }
  if (l.prenhe_de) {
    linhas.push(`🤰 Prenhe do ${l.prenhe_de}${l.previsao_parto ? ` • parto ${l.previsao_parto.slice(3)}` : ''}`)
  }
  linhas.push('')
  if (l.iabcz?.valor) linhas.push(`✨ iABCZ ${l.iabcz.valor} — DECA ${l.iabcz.deca}`)
  if (l.mgte?.valor) linhas.push(`✨ MGTe ${l.mgte.valor} — TOP ${l.mgte.top}%`)
  if (l.iqg?.valor) linhas.push(`✨ IQG ${l.iqg.valor} — TOP ${l.iqg.top}%`)
  linhas.push('')
  if (cond?.linhaPagamento) linhas.push(`🐄 ${cond.linhaPagamento}`)
  if (cond?.linhaFecho) linhas.push(`🤝 ${cond.linhaFecho}`)
  return linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ── Execução ────────────────────────────────────────────────────────────────

const health = await fetch(`${VPS}/health`, { headers: VPS_HEADERS }).then((r) => r.json())
console.log(`VPS: ${health.status} (fila ${health.queueSize})`)
if (!dryRun && !uploadOnly && health.status !== 'connected') {
  console.error('Sessão Baileys não conectada — escaneie o QR na Central WhatsApp e rode de novo.')
  process.exit(1)
}

let enviados = 0
for (const l of lots) {
  const caption = l.caption || buildCaption(l, job.condicoes)
  const file = join(job.gifs_dir, `lote${String(l.lote).padStart(3, '0')}.mp4`)

  if (dryRun) {
    console.log(`\n───── LOTE ${l.lote} ${existsSync(file) ? '(gif ok)' : '(SEM GIF!)'}\n${caption}`)
    continue
  }

  let mediaUrl = l.media_url || null
  if (!mediaUrl) {
    if (!existsSync(file)) { console.error(`lote ${l.lote}: sem GIF em ${file} — pulado`); continue }
    const path = `${job.slug || 'leilao'}/lote${String(l.lote).padStart(3, '0')}.mp4`
    const { error: upErr } = await supabase.storage.from('lote-gifs')
      .upload(path, readFileSync(file), { contentType: 'video/mp4', upsert: true })
    if (upErr) { console.error(`lote ${l.lote}: upload falhou — ${upErr.message}`); continue }
    mediaUrl = supabase.storage.from('lote-gifs').getPublicUrl(path).data.publicUrl
  }

  if (uploadOnly) { console.log(`lote ${l.lote}: ${mediaUrl}`); continue }

  const endpoint = job.group_id ? '/send-group' : '/send-direct'
  const dest = job.group_id ? { groupId: job.group_id } : { phone: job.phone }
  const res = await fetch(`${VPS}${endpoint}`, {
    method: 'POST',
    headers: VPS_HEADERS,
    body: JSON.stringify({
      ...dest,
      message: '',
      media: { type: 'video', url: mediaUrl, caption, gif: true },
    }),
  })
  const body = await res.json().catch(() => ({}))
  const ok = res.ok && body.queued
  console.log(`lote ${l.lote}: ${ok ? `na fila (#${body.position})` : `FALHOU ${body.error || res.status}`}`)
  if (ok) enviados++

  await supabase.from('whatsapp_messages').insert({
    phone: job.group_id || job.phone,
    name: job.contato || 'Contato',
    body: `[gif-lotes L${l.lote}] ${caption.slice(0, 400)}`,
    direction: 'outbound',
    status: ok ? 'queued' : 'failed',
    channel: 'baileys',
    origin: 'gif-lotes',
    error_msg: ok ? null : String(body.error || res.status),
  })
}

console.log(dryRun ? '\n(dry-run: nada enviado)' : `\n${enviados}/${lots.length} lotes na fila do WhatsApp.`)
