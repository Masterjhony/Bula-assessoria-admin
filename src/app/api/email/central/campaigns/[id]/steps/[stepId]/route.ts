/**
 * /api/email/central/campaigns/[id]/steps/[stepId]
 *   PUT    → edita um step (apenas em rascunho)
 *   DELETE → remove um step (apenas em rascunho)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'

const STEP_SELECT =
    'id, step_order, delay_value, delay_unit, template_id, subject, body_html, body_text, is_active, created_at, updated_at'

async function assertEditable(
    supabase: SupabaseClient,
    campaignId: string,
): Promise<NextResponse | null> {
    const { data: campaign } = await supabase
        .from('email_campaigns')
        .select('status')
        .eq('id', campaignId)
        .single<{ status: string }>()
    if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
    if (campaign.status !== 'rascunho') {
        return NextResponse.json(
            { error: 'Apenas campanhas em rascunho podem ter steps modificados.' },
            { status: 409 },
        )
    }
    return null
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; stepId: string }> },
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id, stepId } = await params

    type Body = {
        delay_value?: number
        delay_unit?: 'minutes' | 'hours' | 'days'
        template_id?: string | null
        subject?: string | null
        body_html?: string | null
        body_text?: string | null
        is_active?: boolean
    }

    let body: Body
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const guard = await assertEditable(supabase, id)
    if (guard) return guard

    const update: Record<string, unknown> = {}
    if (typeof body.delay_value === 'number' && body.delay_value >= 0) update.delay_value = body.delay_value
    if (body.delay_unit && ['minutes', 'hours', 'days'].includes(body.delay_unit)) update.delay_unit = body.delay_unit
    if (body.template_id !== undefined) update.template_id = body.template_id || null
    if (body.subject !== undefined) update.subject = body.subject?.trim() || null
    if (body.body_html !== undefined) update.body_html = body.body_html?.trim() || null
    if (body.body_text !== undefined) update.body_text = body.body_text?.trim() || null
    if (typeof body.is_active === 'boolean') update.is_active = body.is_active

    const { data, error } = await supabase
        .from('email_campaign_steps')
        .update(update)
        .eq('id', stepId)
        .eq('campaign_id', id)
        .select(STEP_SELECT)
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Step não encontrado' }, { status: 404 })
    return NextResponse.json({ success: true, step: data })
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string; stepId: string }> },
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id, stepId } = await params

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const guard = await assertEditable(supabase, id)
    if (guard) return guard

    // Lê step pra saber step_order (necessário pra reordenar os seguintes)
    const { data: step } = await supabase
        .from('email_campaign_steps')
        .select('step_order')
        .eq('id', stepId)
        .eq('campaign_id', id)
        .single()
    if (!step) return NextResponse.json({ error: 'Step não encontrado' }, { status: 404 })

    const { error: delErr } = await supabase
        .from('email_campaign_steps')
        .delete()
        .eq('id', stepId)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    // Reordena os steps com order > removido (decrementa em 1)
    const { data: tailSteps } = await supabase
        .from('email_campaign_steps')
        .select('id, step_order')
        .eq('campaign_id', id)
        .gt('step_order', step.step_order)
        .order('step_order', { ascending: true })

    for (const s of tailSteps ?? []) {
        await supabase
            .from('email_campaign_steps')
            .update({ step_order: s.step_order - 1 })
            .eq('id', s.id)
    }

    return NextResponse.json({ success: true })
}
