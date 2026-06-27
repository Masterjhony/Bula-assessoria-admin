// Reprocessa midias inbound do WhatsApp Cloud que ficaram sem arquivo.
//
// Uso:
//   node scripts/recover-whatsapp-inbound-media.mjs
//   node scripts/recover-whatsapp-inbound-media.mjs --id <whatsapp_messages.id>
//   node scripts/recover-whatsapp-inbound-media.mjs --id <id> --media-id <media_id_da_meta>
//   node scripts/recover-whatsapp-inbound-media.mjs --dry-run

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = join(import.meta.dirname, '..')
const env = Object.fromEntries(
    readFileSync(join(root, '.env.local'), 'utf-8')
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => {
            const i = l.indexOf('=')
            return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
        }),
)

const args = process.argv.slice(2)
const arg = (name) => {
    const idx = args.indexOf(name)
    return idx >= 0 ? args[idx + 1] : null
}

const dryRun = args.includes('--dry-run')
const onlyId = arg('--id')
const forcedMediaId = arg('--media-id')

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
const accessToken = env.WHATSAPP_CLOUD_ACCESS_TOKEN || env.WHATSAPP_ACCESS_TOKEN || env.META_WHATSAPP_ACCESS_TOKEN
const graphVersion = (env.WHATSAPP_CLOUD_GRAPH_VERSION || env.GRAPH_API_VERSION || 'v25.0').replace(/^([^v])/, 'v$1')
const bucket = 'whatsapp-media'

if (!supabaseUrl || !serviceKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes.')
if (!accessToken) throw new Error('WHATSAPP_CLOUD_ACCESS_TOKEN ausente.')
if (forcedMediaId && !onlyId) throw new Error('--media-id exige --id para evitar atualizar a mensagem errada.')

const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
})

function shortError(error) {
    const msg = error instanceof Error ? error.message : String(error)
    return msg.length > 500 ? `${msg.slice(0, 497)}...` : msg
}

function extFromMime(mime, type) {
    const m = String(mime || '').split(';')[0].trim()
    const map = {
        'audio/ogg': 'ogg',
        'audio/mpeg': 'mp3',
        'audio/mp4': 'm4a',
        'audio/amr': 'amr',
        'audio/aac': 'aac',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'video/mp4': 'mp4',
        'video/3gpp': '3gp',
        'application/pdf': 'pdf',
    }
    if (map[m]) return map[m]
    return { audio: 'ogg', image: 'jpg', video: 'mp4', document: 'bin' }[type] || 'bin'
}

function inferType(row) {
    if (row.media_type) return row.media_type
    const body = String(row.body || '').toLowerCase()
    if (body.includes('audio') || body.includes('áudio')) return 'audio'
    if (body.includes('imagem')) return 'image'
    if (body.includes('video') || body.includes('vídeo')) return 'video'
    if (body.includes('documento')) return 'document'
    return 'document'
}

async function downloadMetaMedia(mediaId) {
    const metaRes = await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(mediaId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    })
    const meta = await metaRes.json().catch(() => null)
    if (!metaRes.ok || !meta?.url) {
        const message = meta?.error?.message || `Meta Graph HTTP ${metaRes.status}`
        throw new Error(message)
    }

    const fileRes = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!fileRes.ok) throw new Error(`Download HTTP ${fileRes.status}`)
    const data = await fileRes.arrayBuffer()
    return {
        data,
        mime: meta.mime_type || fileRes.headers.get('content-type') || 'application/octet-stream',
    }
}

async function loadRows() {
    let query = supabase
        .from('whatsapp_messages')
        .select('id,phone,name,body,reason,created_at,media_url,media_type,media_mime,media_filename,media_meta_id,media_ingest_error')
        .eq('direction', 'inbound')
        .is('media_url', null)
        .order('created_at', { ascending: false })
        .limit(200)

    if (onlyId) {
        query = query.eq('id', onlyId)
    } else {
        query = query.not('media_meta_id', 'is', null)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data || []
}

const rows = await loadRows()
if (rows.length === 0) {
    console.log('Nenhuma midia pendente com media_meta_id.')
} else {
    let ok = 0
    let failed = 0
    for (const row of rows) {
        const mediaId = forcedMediaId || row.media_meta_id
        const type = inferType(row)
        if (!mediaId) {
            console.log(`SKIP ${row.id} ${row.phone}: sem media_meta_id.`)
            continue
        }

        try {
            console.log(`${dryRun ? 'DRY ' : ''}RECOVER ${row.id} ${row.phone} ${row.name || ''} media=${mediaId}`)
            if (dryRun) continue

            const { data, mime } = await downloadMetaMedia(mediaId)
            const ext = extFromMime(row.media_mime || mime, type)
            const safeId = String(row.reason || mediaId || row.id).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
            const path = `${row.phone}/${safeId}.${ext}`
            const { error: uploadError } = await supabase.storage
                .from(bucket)
                .upload(path, Buffer.from(data), { contentType: row.media_mime || mime, upsert: true })
            if (uploadError) throw new Error(uploadError.message)

            const { error: updateError } = await supabase
                .from('whatsapp_messages')
                .update({
                    media_url: path,
                    media_type: type,
                    media_mime: row.media_mime || mime,
                    media_meta_id: mediaId,
                    media_ingest_error: null,
                    media_ingested_at: new Date().toISOString(),
                })
                .eq('id', row.id)
            if (updateError) throw new Error(updateError.message)
            ok++
        } catch (e) {
            failed++
            const message = shortError(e)
            console.log(`FAIL ${row.id} ${row.phone}: ${message}`)
            await supabase
                .from('whatsapp_messages')
                .update({
                    media_meta_id: mediaId,
                    media_type: type,
                    media_ingest_error: message,
                })
                .eq('id', row.id)
        }
    }

    console.log(`Concluido: recuperadas=${ok} falhas=${failed}${dryRun ? ' (dry-run)' : ''}`)
}
