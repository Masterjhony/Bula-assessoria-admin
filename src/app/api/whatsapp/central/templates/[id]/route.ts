/**
 * /api/whatsapp/central/templates/[id]
 *   PUT    → atualiza template
 *   DELETE → arquiva (soft delete) — preserva histórico de uso
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import {
    normalizeMediaAndPoll,
    TemplatePayloadError,
    type TemplateMediaPollInput,
} from '@/lib/whatsapp-template-payload'

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id } = await params

    type Body = {
        title?: string
        category?: string
        body?: string
        variables?: string[]
        archived?: boolean
    } & TemplateMediaPollInput

    let body: Body
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const update: Record<string, unknown> = {}
    if (typeof body.title === 'string') update.title = body.title.trim()
    if (typeof body.category === 'string') update.category = body.category.trim()
    if (typeof body.body === 'string') update.body = body.body
    if (Array.isArray(body.variables)) update.variables = body.variables
    if (typeof body.archived === 'boolean') update.archived = body.archived

    // Mídia + enquete só são tocadas quando ALGUM campo relacionado foi
    // explicitamente enviado — evita zerar acidentalmente em updates parciais.
    const touchesMedia = ['media_url','media_type','media_mime','media_filename','media_caption']
        .some(k => k in body)
    const touchesPoll = ['poll_question','poll_options','poll_selectable_count']
        .some(k => k in body)
    if (touchesMedia || touchesPoll) {
        try {
            const normalized = normalizeMediaAndPoll(body)
            if (touchesMedia) {
                update.media_url = normalized.media_url
                update.media_type = normalized.media_type
                update.media_mime = normalized.media_mime
                update.media_filename = normalized.media_filename
                update.media_caption = normalized.media_caption
            }
            if (touchesPoll) {
                update.poll_question = normalized.poll_question
                update.poll_options = normalized.poll_options
                update.poll_selectable_count = normalized.poll_selectable_count
            }
        } catch (e) {
            if (e instanceof TemplatePayloadError) {
                return NextResponse.json({ error: e.message }, { status: 400 })
            }
            throw e
        }
    }

    const { error } = await supabase.from('whatsapp_templates').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id } = await params

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error } = await supabase
        .from('whatsapp_templates')
        .update({ archived: true })
        .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
}
