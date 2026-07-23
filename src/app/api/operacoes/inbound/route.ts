/** Inbound passivo da sessão Baileys de coleta (`joao-automation`).
 * Não cria lead, não responde e não altera o CRM: somente aplica a allowlist da
 * Central Operacional e retoma planos que aguardavam este telefone.
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/whatsapp-central'
import { ingestOperationalSignal } from '@/lib/operational-center'
import { resumeOperationalPlansForReply } from '@/lib/operational-executor'

export const maxDuration = 120

export async function POST(req: NextRequest) {
    const secret = process.env.WHATSAPP_GROUP_TASK_SECRET || ''
    if (!secret || req.headers.get('x-webhook-secret') !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    let body: {
        session?: string; phone?: string; name?: string; body?: string
        message_id?: string; from_me?: boolean; ts?: number | null
        media?: {
            bucket?: string | null; path?: string | null; type?: string | null
            mime?: string | null; filename?: string | null; size?: number | null
            ingest_error?: string | null
        } | null
    }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const phone = normalizePhone(body.phone || '')
    const text = (body.body || '').trim() || (body.media?.type ? `[${body.media.type}]` : '')
    if (!phone || !text) return NextResponse.json({ error: 'phone e conteúdo são obrigatórios' }, { status: 400 })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    if (body.from_me) return NextResponse.json({ ok: true, silent: true, reason: 'outbound_ignored' })

    after(async () => {
        const results = await Promise.allSettled([
            ingestOperationalSignal(supabase, {
                inboxId: body.session || 'joao-automation',
                sessionId: body.session || 'joao-automation',
                phone,
                chatName: body.name || null,
                senderName: body.name || null,
                isGroup: false,
                direction: 'inbound',
                body: text,
                externalMessageId: body.message_id || null,
                occurredAt: body.ts ? new Date(body.ts * 1000).toISOString() : null,
                media: body.media ? {
                    bucket: body.media.bucket || 'whatsapp-media', path: body.media.path,
                    type: body.media.type, mime: body.media.mime, filename: body.media.filename,
                    size: body.media.size,
                } : null,
            }),
            resumeOperationalPlansForReply(supabase, phone, text, body.message_id || null),
        ])
        for (const result of results) {
            if (result.status === 'rejected') console.warn('[operacoes/inbound]', result.reason)
        }
    })
    return NextResponse.json({ ok: true, accepted: true })
}
