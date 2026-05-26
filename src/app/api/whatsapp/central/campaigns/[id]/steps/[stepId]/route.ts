/**
 * /api/whatsapp/central/campaigns/[id]/steps/[stepId]
 *   PUT    → edita um step (só em rascunho)
 *   DELETE → remove um step (só em rascunho; reordena os step_order dos sucessores)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import {
    normalizeMediaAndPoll,
    TemplatePayloadError,
    type TemplateMediaPollInput,
} from '@/lib/whatsapp-template-payload'

const STEP_SELECT =
    'id, campaign_id, step_order, delay_value, delay_unit, ' +
    'template_id, body, ' +
    'media_url, media_type, media_mime, media_filename, media_caption, ' +
    'is_active, created_at, updated_at'

async function assertDraftCampaign(
    supabase: SupabaseClient,
    campaignId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    const { data } = await supabase
        .from('whatsapp_campaigns')
        .select('id, status')
        .eq('id', campaignId)
        .single()
    const c = data as { id: string; status: string } | null
    if (!c) return { ok: false, status: 404, error: 'Campanha não encontrada' }
    if (c.status !== 'rascunho') {
        return {
            ok: false,
            status: 409,
            error: `Steps só podem ser alterados em campanhas em rascunho (status atual: ${c.status}).`,
        }
    }
    return { ok: true }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; stepId: string }> }
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { id, stepId } = await params

    type Body = {
        delay_value?: number
        delay_unit?: 'minutes' | 'hours' | 'days'
        template_id?: string | null
        body?: string | null
        is_active?: boolean
    } & TemplateMediaPollInput

    let body: Body
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const guard = await assertDraftCampaign(supabase, id)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

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
        template_id: body.template_id ?? null,
        body: body.body?.trim() ?? null,
        media_url: mediaPoll.media_url,
        media_type: mediaPoll.media_type,
        media_mime: mediaPoll.media_mime,
        media_filename: mediaPoll.media_filename,
        media_caption: mediaPoll.media_caption,
        is_active: body.is_active !== false,
    }
    if (Number.isFinite(body.delay_value)) {
        update.delay_value = Math.max(0, Math.floor(body.delay_value!))
    }
    if (body.delay_unit && ['minutes', 'hours', 'days'].includes(body.delay_unit)) {
        update.delay_unit = body.delay_unit
    }

    const { data, error } = await supabase
        .from('whatsapp_campaign_steps')
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
    { params }: { params: Promise<{ id: string; stepId: string }> }
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { id, stepId } = await params
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const guard = await assertDraftCampaign(supabase, id)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    // Pega step_order do deletado pra recalcular os sucessores
    const { data: target } = await supabase
        .from('whatsapp_campaign_steps')
        .select('step_order')
        .eq('id', stepId)
        .eq('campaign_id', id)
        .maybeSingle()
    if (!target) return NextResponse.json({ error: 'Step não encontrado' }, { status: 404 })

    const { error: delErr } = await supabase
        .from('whatsapp_campaign_steps')
        .delete()
        .eq('id', stepId)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    // Reordena: todo step com step_order > deletado decrementa em 1
    const { data: successors } = await supabase
        .from('whatsapp_campaign_steps')
        .select('id, step_order')
        .eq('campaign_id', id)
        .gt('step_order', target.step_order)
        .order('step_order', { ascending: true })

    // Update sequencial pra respeitar o UNIQUE(campaign_id, step_order).
    // Volume é baixo (≤ 5-10 steps por campanha), então tudo bem.
    for (const s of successors ?? []) {
        await supabase
            .from('whatsapp_campaign_steps')
            .update({ step_order: s.step_order - 1 })
            .eq('id', s.id)
    }

    return NextResponse.json({ success: true })
}
