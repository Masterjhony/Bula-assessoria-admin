/**
 * /api/whatsapp/central/campaigns/[id]
 *   GET    → detalhes da campanha + amostra de destinatários (até 100) + steps
 *   PUT    → edita campos da campanha (só em rascunho)
 *   DELETE → permite remover apenas campanhas em rascunho
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import {
    normalizeMediaAndPoll,
    TemplatePayloadError,
    type TemplateMediaPollInput,
} from '@/lib/whatsapp-template-payload'

const CAMPAIGN_SELECT_FULL =
    'id, name, description, segment, template_id, body, status, ' +
    'total_recipients, sent_count, failed_count, optout_skip_count, ' +
    'started_at, finished_at, created_at, updated_at, ' +
    'media_url, media_type, media_mime, media_filename, media_caption, ' +
    'stop_on_reply, stop_on_optout, stop_on_handoff, stop_on_interest, ' +
    'reply_tag, reply_handoff'

export async function GET(
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

    const [campRes, recipRes, stepsRes] = await Promise.all([
        supabase
            .from('whatsapp_campaigns')
            .select(CAMPAIGN_SELECT_FULL)
            .eq('id', id)
            .single(),
        supabase
            .from('whatsapp_campaign_recipients')
            .select('id, phone, name, status, error_msg, sent_at, created_at, current_step, next_send_at, replied_at, stopped_at, stopped_reason')
            .eq('campaign_id', id)
            .order('created_at', { ascending: false })
            .limit(100),
        supabase
            .from('whatsapp_campaign_steps')
            .select('id, step_order, delay_value, delay_unit, template_id, body, media_url, media_type, media_mime, media_filename, media_caption, is_active')
            .eq('campaign_id', id)
            .order('step_order', { ascending: true }),
    ])

    if (campRes.error) return NextResponse.json({ error: campRes.error.message }, { status: 404 })
    return NextResponse.json({
        campaign: campRes.data,
        recipients: recipRes.data ?? [],
        steps: stepsRes.data ?? [],
    })
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id } = await params

    type Body = {
        name?: string
        description?: string | null
        segment?: Record<string, unknown>
        template_id?: string | null
        body?: string | null
        stop_on_reply?: boolean
        stop_on_optout?: boolean
        stop_on_handoff?: boolean
        stop_on_interest?: boolean
        reply_tag?: string | null
        reply_handoff?: boolean
    } & TemplateMediaPollInput

    let body: Body
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: existing } = await supabase
        .from('whatsapp_campaigns')
        .select('id, status')
        .eq('id', id)
        .single()
    if (!existing) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
    if (existing.status !== 'rascunho') {
        return NextResponse.json(
            { error: `Apenas campanhas em rascunho podem ser editadas (status atual: ${existing.status}).` },
            { status: 409 }
        )
    }

    let mediaPoll
    try {
        mediaPoll = normalizeMediaAndPoll(body)
    } catch (e) {
        if (e instanceof TemplatePayloadError) {
            return NextResponse.json({ error: e.message }, { status: 400 })
        }
        throw e
    }

    const update: Record<string, unknown> = {
        media_url: mediaPoll.media_url,
        media_type: mediaPoll.media_type,
        media_mime: mediaPoll.media_mime,
        media_filename: mediaPoll.media_filename,
        media_caption: mediaPoll.media_caption,
    }
    if (typeof body.name === 'string') update.name = body.name.trim()
    if (body.description !== undefined) update.description = body.description?.trim() || null
    if (body.segment !== undefined) update.segment = body.segment ?? {}
    if (body.template_id !== undefined) update.template_id = body.template_id || null
    if (body.body !== undefined) update.body = body.body?.trim() || null
    if (typeof body.stop_on_reply    === 'boolean') update.stop_on_reply    = body.stop_on_reply
    if (typeof body.stop_on_optout   === 'boolean') update.stop_on_optout   = body.stop_on_optout
    if (typeof body.stop_on_handoff  === 'boolean') update.stop_on_handoff  = body.stop_on_handoff
    if (typeof body.stop_on_interest === 'boolean') update.stop_on_interest = body.stop_on_interest
    if (body.reply_tag !== undefined) update.reply_tag = body.reply_tag?.trim() || null
    if (typeof body.reply_handoff === 'boolean') update.reply_handoff = body.reply_handoff

    const { data, error } = await supabase
        .from('whatsapp_campaigns')
        .update(update)
        .eq('id', id)
        .select(CAMPAIGN_SELECT_FULL)
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, campaign: data })
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

    const { data: c } = await supabase
        .from('whatsapp_campaigns')
        .select('status')
        .eq('id', id)
        .single()
    if (!c) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
    if (c.status !== 'rascunho') {
        return NextResponse.json({ error: 'Apenas campanhas em rascunho podem ser deletadas.' }, { status: 409 })
    }

    const { error } = await supabase.from('whatsapp_campaigns').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
}
