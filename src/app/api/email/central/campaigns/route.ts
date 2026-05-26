/**
 * /api/email/central/campaigns
 *   GET  → lista campanhas + contadores agregados (steps, stopped)
 *   POST → cria nova campanha em rascunho
 *
 * Espelha /api/whatsapp/central/campaigns mas com payload de e-mail
 * (subject + body_html + body_text + from_name + reply_to).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'

const CAMPAIGN_SELECT =
    'id, name, description, segment, template_id, subject, body_html, body_text, ' +
    'from_name, reply_to, status, total_recipients, sent_count, failed_count, ' +
    'optout_skip_count, stop_on_optout, stop_on_interest, audience_tag, ' +
    'started_at, finished_at, created_at, updated_at'

export async function GET() {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data, error } = await supabase
        .from('email_campaigns')
        .select(CAMPAIGN_SELECT)
        .order('created_at', { ascending: false })
        .limit(100)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    type CampaignRow = { id: string } & Record<string, unknown>
    const campaigns = (data ?? []) as unknown as CampaignRow[]
    if (campaigns.length > 0) {
        const ids = campaigns.map(c => c.id)
        const [stepsRes, stopRes] = await Promise.all([
            supabase
                .from('email_campaign_steps')
                .select('campaign_id')
                .in('campaign_id', ids),
            supabase
                .from('email_campaign_recipients')
                .select('campaign_id')
                .in('campaign_id', ids)
                .not('stopped_at', 'is', null),
        ])
        const countBy = (rows: unknown): Record<string, number> => {
            const acc: Record<string, number> = {}
            const list = Array.isArray(rows) ? rows as Array<{ campaign_id: string }> : []
            for (const r of list) acc[r.campaign_id] = (acc[r.campaign_id] ?? 0) + 1
            return acc
        }
        const stepsByCamp = countBy(stepsRes.data)
        const stoppedByCamp = countBy(stopRes.data)
        for (const c of campaigns) {
            c.steps_count   = stepsByCamp[c.id]   ?? 0
            c.stopped_count = stoppedByCamp[c.id] ?? 0
        }
    }

    return NextResponse.json({ campaigns })
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    type Body = {
        name: string
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

    if (!body.name?.trim()) {
        return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 })
    }

    // Aceita campanha sem subject/body próprios se houver template
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

    const { data, error } = await supabase
        .from('email_campaigns')
        .insert({
            name: body.name.trim(),
            description: body.description?.trim() ?? null,
            segment: body.segment ?? {},
            template_id: body.template_id ?? null,
            subject: body.subject?.trim() || null,
            body_html: body.body_html?.trim() || null,
            body_text: body.body_text?.trim() || null,
            from_name: body.from_name?.trim() || null,
            reply_to: body.reply_to?.trim() || null,
            audience_tag: body.audience_tag?.trim() || null,
            status: 'rascunho',
            created_by: auth.userId,
            ...(typeof body.stop_on_optout   === 'boolean' ? { stop_on_optout:   body.stop_on_optout   } : {}),
            ...(typeof body.stop_on_interest === 'boolean' ? { stop_on_interest: body.stop_on_interest } : {}),
        })
        .select('id')
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, id: data.id })
}
