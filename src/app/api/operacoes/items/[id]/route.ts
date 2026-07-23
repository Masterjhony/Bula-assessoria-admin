import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { generateOperationalPlan, type OperationalClassification, type OperationalSource } from '@/lib/operational-center'

function safeName(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 100)
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id } = await ctx.params
    let body: { action?: 'archive' | 'diary' | 'promote_media' | 'create_plan'; note?: string }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: item, error } = await supabase
        .from('operational_items')
        .select('*, source:operational_sources(*)')
        .eq('id', id)
        .single()
    if (error || !item) return NextResponse.json({ error: error?.message || 'Item não encontrado' }, { status: 404 })
    const now = new Date().toISOString()

    if (body.action === 'archive') {
        await supabase.from('operational_items').update({
            state: 'archived', needs_review: false, reviewed_by: auth.userId, reviewed_at: now, updated_at: now,
        }).eq('id', id)
        return NextResponse.json({ ok: true, state: 'archived' })
    }
    if (body.action === 'diary') {
        const { data: exists } = await supabase.from('operational_diary_entries').select('id').eq('item_id', id).limit(1)
        if (!exists?.length) {
            await supabase.from('operational_diary_entries').insert({
                item_id: id, kind: item.kind, areas: item.areas, title: item.title,
                summary: body.note?.trim() || item.summary || item.body, status: 'confirmed',
                occurred_at: item.occurred_at, created_by: auth.userId,
                source_evidence: { source: item.source_label, sender: item.source_sender_name, body: item.body },
            })
        }
        await supabase.from('operational_items').update({ state: 'routed', needs_review: false, reviewed_by: auth.userId, reviewed_at: now, updated_at: now }).eq('id', id)
        return NextResponse.json({ ok: true, state: 'routed' })
    }
    if (body.action === 'promote_media') {
        if (!item.media_bucket || !item.media_path) return NextResponse.json({ error: 'Item sem mídia armazenada' }, { status: 409 })
        const { data: file, error: downloadError } = await supabase.storage.from(item.media_bucket).download(item.media_path)
        if (downloadError || !file) return NextResponse.json({ error: downloadError?.message || 'Falha no download' }, { status: 500 })
        const date = new Date(item.occurred_at)
        const filename = safeName(item.media_filename || item.media_path.split('/').pop() || `arquivo-${id}`)
        const area = item.areas?.[0] || 'geral'
        const destination = `whatsapp/${area}/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${id}-${filename}`
        const { error: uploadError } = await supabase.storage.from('media').upload(destination, Buffer.from(await file.arrayBuffer()), {
            contentType: item.media_mime || file.type || 'application/octet-stream', upsert: false,
        })
        if (uploadError && !/already exists/i.test(uploadError.message)) return NextResponse.json({ error: uploadError.message }, { status: 500 })
        await supabase.from('operational_items').update({
            state: 'routed', needs_review: false, reviewed_by: auth.userId, reviewed_at: now, updated_at: now,
            metadata: { ...(item.metadata || {}), library_path: destination, promoted_at: now },
        }).eq('id', id)
        return NextResponse.json({ ok: true, state: 'routed', library_path: destination })
    }
    if (body.action === 'create_plan') {
        const source = item.source as OperationalSource | null
        if (!source) return NextResponse.json({ error: 'Fonte do item não encontrada' }, { status: 409 })
        const classification: OperationalClassification = {
            kind: item.kind, title: item.title, summary: item.summary || item.body,
            confidence: Number(item.confidence || 0.7), priority: item.priority,
            reason: item.classification_reason || 'Plano solicitado pelo operador',
            relevant: true, shouldPlan: true, shouldDiary: false,
        }
        const planId = await generateOperationalPlan(supabase, id, {
            inboxId: item.inbox_id, chatJid: item.source_chat_jid, chatName: item.source_label,
            senderJid: item.source_sender_jid, senderName: item.source_sender_name,
            isGroup: item.metadata?.is_group === true, direction: item.direction,
            body: item.body, quotedBody: item.quoted_body, externalMessageId: item.external_message_id,
            occurredAt: item.occurred_at,
        }, source, classification)
        return NextResponse.json({ ok: !!planId, plan_id: planId })
    }
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
}
