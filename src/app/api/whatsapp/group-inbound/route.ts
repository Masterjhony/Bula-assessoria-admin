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

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleLeiloeiraGroupMessage } from '@/lib/leiloeira-whatsapp-cadastro'
import { handleLanceGroupMessage } from '@/lib/whatsapp-lances'

export const maxDuration = 30

export async function POST(req: NextRequest) {
    const SECRET = process.env.WHATSAPP_GROUP_TASK_SECRET || ''
    const auth = req.headers.get('x-webhook-secret')
    if (!SECRET || auth !== SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: {
        group_jid?: string; participant?: string; name?: string
        body?: string; quoted_body?: string; message_id?: string; ts?: number
    }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const groupJid = (body.group_jid || '').trim()
    const text = (body.body || '').trim()
    if (!groupJid || !text) {
        return NextResponse.json({ error: 'group_jid e body são obrigatórios' }, { status: 400 })
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
    void supabase.from('whatsapp_messages').insert({
        phone: groupJid,
        name: body.name || 'Grupo',
        body: text,
        direction: 'inbound',
        status: 'received',
        channel: 'baileys',
        intent: 'bot',
        origin: 'group-inbound',
        reason: messageId || null,
    }).then(({ error }) => {
        if (error) console.warn('[group-inbound] log falhou:', error.message)
    })

    const outcome = await handleLeiloeiraGroupMessage(supabase, {
        groupJid,
        participant: body.participant || null,
        senderName: body.name || null,
        text,
        quotedText: body.quoted_body || null,
    })

    // Lances do pregão ao vivo (grupo "Lances Bula Assessoria") → vendas.
    const lance = await handleLanceGroupMessage(supabase, {
        groupJid,
        text,
        quotedText: body.quoted_body || null,
        messageId: messageId || null,
        ts: typeof body.ts === 'number' ? body.ts : null,
    })

    return NextResponse.json({ ok: true, outcome, lance })
}
