/**
 * /api/email/central/campaigns/[id]
 *   GET    → detalhes da campanha + amostra de destinatários (até 100) + steps
 *   PUT    → edita campos (apenas em rascunho)
 *   DELETE → permite remover apenas campanhas em rascunho
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'

const CAMPAIGN_SELECT_FULL =
    'id, name, description, segment, template_id, subject, body_html, body_text, ' +
    'from_name, reply_to, status, total_recipients, sent_count, failed_count, ' +
    'optout_skip_count, stop_on_optout, stop_on_interest, audience_tag, ' +
    'started_at, finished_at, created_at, updated_at'

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id } = await params

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const [campRes, recipRes, stepsRes] = await Promise.all([
        supabase
            .from('email_campaigns')
            .select(CAMPAIGN_SELECT_FULL)
            .eq('id', id)
            .single(),
        supabase
            .from('email_campaign_recipients')
            .select('id, email, name, status, error_msg, sent_at, created_at, current_step, next_send_at, stopped_at, stopped_reason')
            .eq('campaign_id', id)
            .order('created_at', { ascending: false })
            .limit(100),
        supabase
            .from('email_campaign_steps')
            .select('id, step_order, delay_value, delay_unit, template_id, subject, body_html, body_text, is_active, created_at, updated_at')
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
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id } = await params

    type Body = {
        name?: string
        description?: string | null
        segment?: Record<string, unknown>
        template_id?: string | null
        subject?: string | null
        body_html?: string | null
        body_text?: string | null
        from_name?: string | null
        reply_to?: string | null
        stop_on_optout?: boolean
        stop_on_interest?: boolean
        audience_tag?: string | null
    }

    let body: Body
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: existing } = await supabase
        .from('email_campaigns')
        .select('id, status')
        .eq('id', id)
        .single()
    if (!existing) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
    if (existing.status !== 'rascunho') {
        return NextResponse.json(
            { error: `Apenas campanhas em rascunho podem ser editadas (status atual: ${existing.status}).` },
            { status: 409 },
        )
    }

    const update: Record<string, unknown> = {}
    if (typeof body.name === 'string') update.name = body.name.trim()
    if (body.description !== undefined) update.description = body.description?.trim() || null
    if (body.segment !== undefined) update.segment = body.segment ?? {}
    if (body.template_id !== undefined) update.template_id = body.template_id || null
    if (body.subject !== undefined) update.subject = body.subject?.trim() || null
    if (body.body_html !== undefined) update.body_html = body.body_html?.trim() || null
    if (body.body_text !== undefined) update.body_text = body.body_text?.trim() || null
    if (body.from_name !== undefined) update.from_name = body.from_name?.trim() || null
    if (body.reply_to !== undefined) update.reply_to = body.reply_to?.trim() || null
    if (body.audience_tag !== undefined) update.audience_tag = body.audience_tag?.trim() || null
    if (typeof body.stop_on_optout   === 'boolean') update.stop_on_optout   = body.stop_on_optout
    if (typeof body.stop_on_interest === 'boolean') update.stop_on_interest = body.stop_on_interest

    const { data, error } = await supabase
        .from('email_campaigns')
        .update(update)
        .eq('id', id)
        .select(CAMPAIGN_SELECT_FULL)
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, campaign: data })
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id } = await params

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: c } = await supabase
        .from('email_campaigns')
        .select('status')
        .eq('id', id)
        .single()
    if (!c) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
    if (c.status !== 'rascunho') {
        return NextResponse.json({ error: 'Apenas campanhas em rascunho podem ser deletadas.' }, { status: 409 })
    }

    const { error } = await supabase.from('email_campaigns').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
}
