/** Checagem leve usada pelo VPS antes de baixar uma mídia. Evita copiar para o
 * Storage anexos de conversas pessoais que não pertencem à allowlist. */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveOperationalSource } from '@/lib/operational-center'
import { normalizePhone } from '@/lib/whatsapp-central'
import { loadAgenteConfigCached, agenteNumeroAutorizado } from '@/lib/whatsapp-agente-config'

export async function POST(req: NextRequest) {
    const secret = process.env.WHATSAPP_GROUP_TASK_SECRET || ''
    if (!secret || req.headers.get('x-webhook-secret') !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    let body: {
        session?: string; phone?: string; chat_jid?: string; chat_name?: string
        sender_name?: string; is_group?: boolean
    }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const source = await resolveOperationalSource(supabase, {
        inboxId: body.session || 'joao-automation',
        sessionId: body.session || 'joao-automation',
        phone: body.phone || null,
        chatJid: body.chat_jid || null,
        chatName: body.chat_name || null,
        senderName: body.sender_name || null,
        isGroup: !!body.is_group,
    })
    if (source) {
        return NextResponse.json({ allowed: true, source: { id: source.id, label: source.label, areas: source.areas } })
    }

    // Agente interno: áudio 1:1 da equipe pro número operacional precisa ser
    // baixado pelo VPS pra transcrição — sem este ramo o VPS descarta e a
    // mensagem de voz nunca chega no agente.
    if (!body.is_group && body.phone) {
        const cfg = await loadAgenteConfigCached(supabase)
        if (cfg.enabled && (body.session || '') === cfg.session) {
            const membro = agenteNumeroAutorizado(cfg, normalizePhone(body.phone) || '')
            if (membro) {
                return NextResponse.json({ allowed: true, source: { id: 'agente', label: 'Agente interno', areas: [] } })
            }
        }
    }

    return NextResponse.json({ allowed: false, source: null })
}
