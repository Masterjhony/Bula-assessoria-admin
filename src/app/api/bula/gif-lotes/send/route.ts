/**
 * Envio dos GIFs de lotes pelo Baileys (VPS).
 *
 * GET  → status da sessão Baileys (banner da página)
 * POST { phone, items: [{ lote, caption, media_url, media_type }] }
 *      → enfileira cada item no VPS /send-direct (mídia + legenda no MESMO
 *        envio, como o padrão de divulgação pede) e loga em whatsapp_messages.
 *
 * O jitter anti-ban entre envios é do próprio VPS (fila com 8–25s).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { WHATSAPP_SERVER_URL, vpsHeaders } from '@/lib/whatsapp-vps'

export const maxDuration = 120

interface SendItem {
  lote?: number | string
  caption: string
  media_url?: string | null
  media_type?: 'video' | 'image' | null
  /** Dimensões do vídeo — sem elas o iOS renderiza o GIF com aspect errado. */
  media_width?: number | null
  media_height?: number | null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const res = await fetch(`${WHATSAPP_SERVER_URL}/health`, {
      headers: vpsHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const body = await res.json().catch(() => ({}))
    return NextResponse.json({ status: body.status ?? 'unknown', queue: body.queueSize ?? null })
  } catch {
    return NextResponse.json({ status: 'unreachable', queue: null })
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null) as { phone?: string; group_id?: string; items?: SendItem[] } | null
  const phone = String(body?.phone || '').replace(/\D/g, '')
  const groupId = String(body?.group_id || '').trim()
  const items = (body?.items ?? []).filter(i => i && String(i.caption || '').trim())
  if ((!phone && !groupId) || items.length === 0) {
    return NextResponse.json({ error: 'phone (ou group_id) e items são obrigatórios' }, { status: 400 })
  }
  if (items.length > 60) {
    return NextResponse.json({ error: 'Máximo de 60 envios por chamada' }, { status: 400 })
  }

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const endpoint = groupId ? '/send-group' : '/send-direct'
  const results: Array<{ lote?: number | string; queued: boolean; error?: string }> = []

  for (const item of items) {
    const media = item.media_url
      ? {
          type: item.media_type === 'image' ? 'image' : 'video',
          url: item.media_url,
          caption: item.caption,
          // vídeo curto exibido como GIF no WhatsApp (loop, sem som)
          ...(item.media_type !== 'image' ? { gif: true } : {}),
          ...(item.media_width ? { width: item.media_width } : {}),
          ...(item.media_height ? { height: item.media_height } : {}),
        }
      : null
    const payload: Record<string, unknown> = groupId
      ? { groupId, message: media ? '' : item.caption, media }
      : { phone, message: media ? '' : item.caption, media }

    let queued = false
    let error: string | undefined
    try {
      const res = await fetch(`${WHATSAPP_SERVER_URL}${endpoint}`, {
        method: 'POST',
        headers: vpsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      })
      const resBody = await res.json().catch(() => ({} as Record<string, unknown>))
      queued = res.ok && !!resBody.queued
      if (!queued) error = String(resBody.error || `http_${res.status}`)
    } catch (e) {
      error = e instanceof Error ? e.message : 'vps_unreachable'
    }

    results.push({ lote: item.lote, queued, error })
    void admin.from('whatsapp_messages').insert({
      phone: phone || groupId,
      name: groupId ? 'Grupo' : 'Contato',
      body: `[gif-lotes${item.lote ? ` L${item.lote}` : ''}] ${item.caption.slice(0, 400)}`,
      direction: 'outbound',
      status: queued ? 'queued' : 'failed',
      channel: 'baileys',
      origin: 'gif-lotes',
      error_msg: error ?? null,
    }).then(({ error: logErr }) => {
      if (logErr) console.warn('[gif-lotes] log falhou:', logErr.message)
    })
  }

  const ok = results.filter(r => r.queued).length
  return NextResponse.json({ queued: ok, failed: results.length - ok, results })
}
