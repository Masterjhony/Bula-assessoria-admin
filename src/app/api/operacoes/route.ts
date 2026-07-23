import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'

export const maxDuration = 60

export async function GET(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const url = new URL(req.url)
    const area = url.searchParams.get('area')?.trim() || null

    let plansQuery = supabase
        .from('operational_plans')
        .select(`
            id, item_id, title, objective, requester, areas, status, priority, due_at,
            expected_outcome, context, risk_level, approval_scope, version, proposed_by,
            approved_at, execution_summary, last_error, created_at, updated_at,
            item:operational_items(id, source_label, source_sender_name, body, quoted_body, kind, occurred_at, media_bucket, media_path, media_type, media_mime, media_filename),
            steps:operational_plan_steps(id, position, action_type, title, description, status, requires_approval, separate_approval, target_source_id, target_label, target_phone, draft_body, approved_body, action_payload, result, error_message, executed_at)
        `)
        .order('created_at', { ascending: false })
        .limit(150)
    if (area) plansQuery = plansQuery.contains('areas', [area])

    let itemsQuery = supabase
        .from('operational_items')
        .select('id, source_id, source_label, source_sender_name, body, quoted_body, kind, areas, title, summary, confidence, priority, state, needs_review, classification_reason, occurred_at, media_bucket, media_path, media_type, media_mime, media_filename, media_size, created_at')
        .order('occurred_at', { ascending: false })
        .limit(150)
    if (area) itemsQuery = itemsQuery.contains('areas', [area])

    const saoPauloDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    const [plansRes, itemsRes, diaryRes, sourcesRes, controlRes, sendsRes] = await Promise.all([
        plansQuery,
        itemsQuery,
        supabase
            .from('operational_diary_entries')
            .select('id, item_id, plan_id, kind, areas, title, summary, status, occurred_at, source_evidence, created_at')
            .order('occurred_at', { ascending: false })
            .limit(150),
        supabase
            .from('operational_sources')
            .select('id, label, source_kind, inbox_id, phone, whatsapp_jid, areas, aliases, active, updated_at')
            .order('label'),
        supabase
            .from('operational_controls')
            .select('id, outbound_enabled, daily_limit, paused_reason, updated_at')
            .eq('id', 'joao')
            .maybeSingle(),
        supabase
            .from('operational_send_attempts')
            .select('id', { count: 'exact', head: true })
            .eq('inbox_id', 'joao')
            .in('status', ['claimed','sent','delivery_uncertain'])
            .gte('claimed_at', `${saoPauloDate}T00:00:00-03:00`),
    ])
    const error = plansRes.error || itemsRes.error || diaryRes.error || sourcesRes.error || controlRes.error || sendsRes.error
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const items = itemsRes.data || []
    // URLs assinadas só para os anexos que realmente serão exibidos na tela.
    const signedItems = await Promise.all(items.map(async item => {
        if (!item.media_bucket || !item.media_path) return item
        const { data } = await supabase.storage
            .from(item.media_bucket)
            .createSignedUrl(item.media_path, 60 * 60)
        return { ...item, media_signed_url: data?.signedUrl || null }
    }))

    const plans = plansRes.data || []
    const counts = {
        awaiting_approval: plans.filter(p => p.status === 'awaiting_approval').length,
        executing: plans.filter(p => ['approved','executing'].includes(p.status)).length,
        waiting: plans.filter(p => ['waiting','awaiting_step_approval','paused'].includes(p.status)).length,
        pending_items: items.filter(i => i.state === 'pending').length,
        completed_7d: plans.filter(p => p.status === 'completed' && Date.parse(p.updated_at) >= Date.now() - 7 * 86400_000).length,
        unresolved_sources: (sourcesRes.data || []).filter(s => s.source_kind === 'group' ? !s.whatsapp_jid : !s.phone).length,
    }
    return NextResponse.json({
        counts,
        plans,
        items: signedItems,
        diary: diaryRes.data || [],
        sources: sourcesRes.data || [],
        control: {
            ...(controlRes.data || { id: 'joao', outbound_enabled: false, daily_limit: 5, paused_reason: 'Controle ainda não configurado.' }),
            used_today: sendsRes.count || 0,
        },
    })
}
