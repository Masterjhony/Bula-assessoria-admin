import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'

const WHATSAPP_SERVER_URL = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001'

type Row = {
    id: string
    created_at: string
    phone: string | null
    name: string | null
    body: string | null
    status: string | null
    lead_id: string | null
}

async function fetchServer(path: string, timeoutMs = 3000): Promise<unknown | null> {
    try {
        const res = await fetch(`${WHATSAPP_SERVER_URL}${path}`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(timeoutMs),
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

export async function GET() {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [recentRes, last24hRes, statusRes, queueRes] = await Promise.all([
        supabase
            .from('whatsapp_messages')
            .select('id, created_at, phone, name, body, status, lead_id')
            .eq('origin', 'crm-assessor')
            .eq('bot_step', 'assessor-notification')
            .order('created_at', { ascending: false })
            .limit(20),
        supabase
            .from('whatsapp_messages')
            .select('status')
            .eq('origin', 'crm-assessor')
            .eq('bot_step', 'assessor-notification')
            .gte('created_at', since24h),
        fetchServer('/status'),
        fetchServer('/queue'),
    ])

    if (recentRes.error) {
        return NextResponse.json({ error: recentRes.error.message }, { status: 500 })
    }
    if (last24hRes.error) {
        return NextResponse.json({ error: last24hRes.error.message }, { status: 500 })
    }

    const counters_24h = {
        sent: 0,
        queued: 0,
        failed: 0,
    }

    for (const row of last24hRes.data ?? []) {
        if (row.status === 'sent') counters_24h.sent++
        else if (row.status === 'queued') counters_24h.queued++
        else if (row.status === 'failed') counters_24h.failed++
    }

    return NextResponse.json({
        counters_24h,
        recent: (recentRes.data ?? []) as Row[],
        server: {
            reachable: statusRes !== null,
            status: (statusRes as { status?: string } | null)?.status ?? null,
            queue_size: (queueRes as { queueSize?: number } | null)?.queueSize ?? null,
            processing: (queueRes as { processing?: boolean } | null)?.processing ?? null,
        },
    })
}
