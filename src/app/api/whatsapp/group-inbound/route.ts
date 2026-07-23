/**
 * /api/whatsapp/group-inbound — mensagens recebidas em GRUPOS via VPS (Baileys).
 *
 * O VPS encaminha toda mensagem de grupo (de terceiros) para cá. Hoje o único
 * consumidor é a automação de cadastro em leiloeiras: se o grupo é o grupo de
 * cadastros de uma leiloeira (leiloeiras.whatsapp_group_id), detectamos a
 * decisão ("aprovado"/"recusado"), atualizamos o status e fechamos o ciclo
 * (cliente avisado pela API oficial + confirmação no grupo + aviso interno).
 * Grupos não mapeados são ignorados em silêncio.
 *
 * Autenticação: header `x-webhook-secret` = WHATSAPP_GROUP_TASK_SECRET
 * (mesmo contrato do /api/whatsapp/inbound).
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleLeiloeiraGroupMessage } from '@/lib/leiloeira-whatsapp-cadastro'
import { handleLanceGroupMessage } from '@/lib/whatsapp-lances'
import { ingestOperationalSignal } from '@/lib/operational-center'

export const maxDuration = 30

export async function POST(req: NextRequest) {
    const SECRET = process.env.WHATSAPP_GROUP_TASK_SECRET || ''
    const auth = req.headers.get('x-webhook-secret')
    if (!SECRET || auth !== SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: {
        session?: string; group_jid?: string; group_name?: string; participant?: string; name?: string
        body?: string; quoted_body?: string; message_id?: string; ts?: number
        media?: {
            bucket?: string | null; path?: string | null; type?: string | null
            mime?: string | null; filename?: string | null; size?: number | null
            ingest_error?: string | null
        } | null
    }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const groupJid = (body.group_jid || '').trim()
    const text = (body.body || '').trim()
    if (!groupJid || (!text && !body.media?.path)) {
        return NextResponse.json({ error: 'group_jid e conteúdo são obrigatórios' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Dedup por message_id (o Baileys pode redisparar o upsert): registramos
    // cada inbound de grupo em whatsapp_messages (auditoria) e usamos o registro
    // como trava. `phone` recebe o JID do grupo — o inbox de clientes filtra fora.
    const messageId = (body.message_id || '').trim()
    if (messageId) {
        const { data: dup } = await supabase
            .from('whatsapp_messages')
            .select('id')
            .eq('direction', 'inbound')
            .eq('origin', 'group-inbound')
            .eq('reason', messageId)
            .limit(1)
        if (dup?.length) return NextResponse.json({ ok: true, deduped: true })
    }
    const logBody = text || `[${body.media?.type || 'arquivo'}]`
    const { data: logged } = await supabase.from('whatsapp_messages').insert({
        phone: groupJid,
        name: body.group_name || 'Grupo',
        body: logBody,
        direction: 'inbound',
        status: 'received',
        channel: 'baileys',
        inbox_id: body.session || 'joao',
        intent: 'bot',
        origin: 'group-inbound',
        reason: messageId || null,
        media_url: body.media?.bucket === 'whatsapp-media' ? body.media.path : null,
        media_type: body.media?.type || null,
        media_mime: body.media?.mime || null,
        media_filename: body.media?.filename || null,
        media_ingest_error: body.media?.ingest_error || null,
        media_ingested_at: body.media?.path ? new Date().toISOString() : null,
    }).select('id').maybeSingle()

    after(() => ingestOperationalSignal(supabase, {
        inboxId: body.session || 'joao',
        sessionId: body.session || 'joao',
        chatJid: groupJid,
        chatName: body.group_name || null,
        senderJid: body.participant || null,
        senderName: body.name || null,
        isGroup: true,
        direction: 'inbound',
        body: logBody,
        quotedBody: body.quoted_body || null,
        externalMessageId: messageId || null,
        whatsappMessageId: logged?.id || null,
        occurredAt: typeof body.ts === 'number' ? new Date(body.ts * 1000).toISOString() : null,
        media: body.media ? {
            bucket: body.media.bucket || 'whatsapp-media', path: body.media.path,
            type: body.media.type, mime: body.media.mime, filename: body.media.filename,
            size: body.media.size,
        } : null,
    }).catch(error => {
        console.warn('[group-inbound] triagem operacional falhou:', error instanceof Error ? error.message : error)
    }))

    const outcome = text ? await handleLeiloeiraGroupMessage(supabase, {
        groupJid,
        participant: body.participant || null,
        senderName: body.name || null,
        text,
        quotedText: body.quoted_body || null,
    }) : { kind: 'ignored', reason: 'media_only' }

    // Lances do pregão ao vivo (grupo "Lances Bula Assessoria") → vendas.
    const lance = text ? await handleLanceGroupMessage(supabase, {
        groupJid,
        text,
        quotedText: body.quoted_body || null,
        messageId: messageId || null,
        ts: typeof body.ts === 'number' ? body.ts : null,
    }) : { kind: 'ignored', reason: 'media_only' }

    return NextResponse.json({ ok: true, outcome, lance })
}
