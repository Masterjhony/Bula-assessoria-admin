/**
 * /api/email/central/campaigns/[id]/steps
 *   GET  → lista steps 1+ (passo 0 vive na própria campanha)
 *   POST → cria step 1+ (apenas em rascunho)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'

const STEP_SELECT =
    'id, step_order, delay_value, delay_unit, template_id, subject, body_html, body_text, is_active, created_at, updated_at'

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

    const { data, error } = await supabase
        .from('email_campaign_steps')
        .select(STEP_SELECT)
        .eq('campaign_id', id)
        .order('step_order', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ steps: data ?? [] })
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id } = await params

    type Body = {
        delay_value: number
        delay_unit: 'minutes' | 'hours' | 'days'
        template_id?: string | null
        subject?: string | null
        body_html?: string | null
        body_text?: string | null
    }

    let body: Body
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (typeof body.delay_value !== 'number' || body.delay_value < 0) {
        return NextResponse.json({ error: 'delay_value inválido' }, { status: 400 })
    }
    if (!['minutes', 'hours', 'days'].includes(body.delay_unit)) {
        return NextResponse.json({ error: 'delay_unit inválido' }, { status: 400 })
    }
    const hasOwnContent = !!body.subject?.trim() && !!body.body_html?.trim()
    if (!body.template_id && !hasOwnContent) {
        return NextResponse.json(
            { error: 'Selecione um template ou informe subject + body_html.' },
            { status: 400 },
        )
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Bloqueia edição se campanha não está em rascunho
    const { data: campaign } = await supabase
        .from('email_campaigns')
        .select('status')
        .eq('id', id)
        .single()
    if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
    if (campaign.status !== 'rascunho') {
        return NextResponse.json({ error: `Apenas campanhas em rascunho podem ter steps modificados.` }, { status: 409 })
    }

    // Próximo step_order disponível
    const { data: existingSteps } = await supabase
        .from('email_campaign_steps')
        .select('step_order')
        .eq('campaign_id', id)
        .order('step_order', { ascending: false })
        .limit(1)
    const nextOrder = (existingSteps?.[0]?.step_order ?? 0) + 1

    const { data, error } = await supabase
        .from('email_campaign_steps')
        .insert({
            campaign_id: id,
            step_order: nextOrder,
            delay_value: body.delay_value,
            delay_unit: body.delay_unit,
            template_id: body.template_id ?? null,
            subject: body.subject?.trim() || null,
            body_html: body.body_html?.trim() || null,
            body_text: body.body_text?.trim() || null,
        })
        .select(STEP_SELECT)
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, step: data })
}
