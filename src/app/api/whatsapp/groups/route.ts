/**
 * /api/whatsapp/groups
 *   GET  → lista os grupos de que a sessão Baileys participa (id + nome).
 *          Usado para descobrir o JID do grupo destino.
 *   POST → envia uma mensagem de texto para um grupo { groupId, message }.
 *          Loga em whatsapp_messages (auditoria) com origin='group-manual'.
 *
 * Envio a grupo NÃO passa pelo gateway/guard rails 1:1 — é um disparo interno
 * para um grupo conhecido da equipe. Admin-gated.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { fetchVpsGroups, sendVpsGroup } from '@/lib/whatsapp-vps'

export async function GET() {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    try {
        const groups = await fetchVpsGroups()
        // Mais previsível para a UI: ordena por nome.
        groups.sort((a, b) => (a.subject || '').localeCompare(b.subject || '', 'pt-BR'))
        return NextResponse.json({ groups })
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 502 })
    }
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body: { groupId?: unknown; message?: unknown; subject?: unknown }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }

    const groupId = String(body.groupId || '').trim()
    const message = String(body.message || '').trim()
    const subject = typeof body.subject === 'string' ? body.subject : null
    if (!groupId) return NextResponse.json({ error: 'groupId obrigatório' }, { status: 400 })
    if (!message) return NextResponse.json({ error: 'message obrigatório' }, { status: 400 })

    const result = await sendVpsGroup(groupId, message)
    const jid = result.jid || (groupId.includes('@') ? groupId : `${groupId}@g.us`)

    // Auditoria (best-effort): registra o disparo. `phone` recebe o JID do grupo.
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    void supabase.from('whatsapp_messages').insert({
        phone: jid,
        name: subject || 'Grupo',
        body: message,
        direction: 'outbound',
        status: result.queued ? 'queued' : 'failed',
        channel: 'baileys',
        intent: 'bot',
        origin: 'group-manual',
        error_msg: result.error ?? null,
    }).then(({ error }) => {
        if (error) console.warn('[whatsapp/groups] log falhou:', error.message)
    })

    if (!result.queued) {
        return NextResponse.json({ error: result.error || 'falha ao enviar' }, { status: 502 })
    }
    return NextResponse.json({ queued: true, jid })
}
