/**
 * /api/whatsapp/central/campaigns/[id]/steps
 *   GET  → lista steps (1..N) da campanha, ordenados por step_order
 *   POST → cria novo step ao final da sequência da campanha
 *
 * O passo 0 é o conteúdo da própria campanha (em whatsapp_campaigns).
 * Esta rota cobre apenas os steps adicionais 1+, usados como follow-up.
 *
 * Steps só podem ser criados/editados/removidos enquanto a campanha está
 * em "rascunho" — depois de disparada, alterar steps em andamento seria
 * fonte de bugs sutis (recipients no meio da sequência veriam mensagens
 * inconsistentes).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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

    const { data, error } = await supabase
        .from('whatsapp_campaign_steps')
        .select(STEP_SELECT)
        .eq('campaign_id', id)
        .order('step_order', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ steps: data ?? [] })
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { id } = await params

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

    // Garante que a campanha existe e está em rascunho
    const { data: campaign } = await supabase
        .from('whatsapp_campaigns')
        .select('id, status')
        .eq('id', id)
        .single()
    if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
    if (campaign.status !== 'rascunho') {
        return NextResponse.json(
            { error: `Steps só podem ser criados em campanhas em rascunho (status atual: ${campaign.status}).` },
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

    const hasText = !!body.body?.trim()
    const hasMedia = !!mediaPoll.media_url
    if (!body.template_id && !hasText && !hasMedia) {
        return NextResponse.json(
            { error: 'Step precisa de template, mensagem própria ou mídia.' },
            { status: 400 }
        )
    }

    const delay_value = Number.isFinite(body.delay_value) ? Math.max(0, Math.floor(body.delay_value!)) : 1
    const delay_unit = (body.delay_unit && ['minutes', 'hours', 'days'].includes(body.delay_unit))
        ? body.delay_unit
        : 'days'

    // step_order = max(existentes) + 1
    const { data: maxRow } = await supabase
        .from('whatsapp_campaign_steps')
        .select('step_order')
        .eq('campaign_id', id)
        .order('step_order', { ascending: false })
        .limit(1)
        .maybeSingle()
    const nextOrder = (maxRow?.step_order ?? 0) + 1

    const { data, error } = await supabase
        .from('whatsapp_campaign_steps')
        .insert({
            campaign_id: id,
            step_order: nextOrder,
            delay_value,
            delay_unit,
            template_id: body.template_id ?? null,
            body: body.body?.trim() ?? null,
            media_url: mediaPoll.media_url,
            media_type: mediaPoll.media_type,
            media_mime: mediaPoll.media_mime,
            media_filename: mediaPoll.media_filename,
            media_caption: mediaPoll.media_caption,
            is_active: body.is_active !== false,
        })
        .select(STEP_SELECT)
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, step: data })
}
