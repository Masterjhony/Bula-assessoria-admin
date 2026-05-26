/**
 * /api/email/central/metrics
 * Métricas operacionais da Central de E-mail (totais, últimas 7d, distribuições).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'

export async function GET() {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [
        totalCampaigns,
        activeCampaigns,
        sentLast7d,
        failedLast7d,
        totalOptouts,
        optoutsLast7d,
        leadsWithEmail,
    ] = await Promise.all([
        supabase.from('email_campaigns').select('id', { count: 'exact', head: true }),
        supabase.from('email_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'enviando'),
        supabase.from('email_messages').select('id', { count: 'exact', head: true })
            .eq('status', 'sent').gte('created_at', sevenDaysAgo),
        supabase.from('email_messages').select('id', { count: 'exact', head: true })
            .eq('status', 'failed').gte('created_at', sevenDaysAgo),
        supabase.from('email_optouts').select('email', { count: 'exact', head: true }),
        supabase.from('email_optouts').select('email', { count: 'exact', head: true })
            .gte('created_at', sevenDaysAgo),
        supabase.from('crm_leads').select('id', { count: 'exact', head: true })
            .not('email', 'is', null).neq('email', '').eq('optout_email', false),
    ])

    return NextResponse.json({
        total_campaigns: totalCampaigns.count ?? 0,
        active_campaigns: activeCampaigns.count ?? 0,
        sent_last_7d: sentLast7d.count ?? 0,
        failed_last_7d: failedLast7d.count ?? 0,
        total_optouts: totalOptouts.count ?? 0,
        optouts_last_7d: optoutsLast7d.count ?? 0,
        leads_with_email: leadsWithEmail.count ?? 0,
    })
}
