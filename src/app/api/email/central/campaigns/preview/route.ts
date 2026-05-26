/**
 * /api/email/central/campaigns/preview
 * Body: { segment: EmailSegmentFilters }
 * Retorna a contagem e amostra (até 20) de leads que receberiam a campanha.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { resolveEmailSegment, type EmailSegmentFilters } from '@/lib/email-segment'

export async function POST(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body: { segment?: EmailSegmentFilters }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    try {
        const recipients = await resolveEmailSegment(supabase, body.segment ?? {})
        return NextResponse.json({
            total: recipients.length,
            sample: recipients.slice(0, 20),
        })
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro ao resolver segmento'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
