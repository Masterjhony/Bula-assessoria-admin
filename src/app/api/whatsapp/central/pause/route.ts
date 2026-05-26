/**
 * /api/whatsapp/central/pause
 *
 *   GET → estado atual { paused, paused_at, paused_by }
 *   PUT → seta { paused: boolean } (admin only)
 *
 * Quando pausada, a Central permanece conectada (número segue logado no VPS),
 * mas o /api/whatsapp/inbound e o /api/whatsapp/render-welcome devolvem
 * `{ silent: true, reason: 'paused' }`. Nenhum fluxo automatizado é executado.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { PAUSE_KEY, readPauseState, type PauseState } from '@/lib/whatsapp-pause'

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

export async function GET() {
    const state = await readPauseState()
    return NextResponse.json(state)
}

export async function PUT(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body: { paused?: unknown }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    if (typeof body.paused !== 'boolean') {
        return NextResponse.json({ error: '`paused` deve ser boolean' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const next: PauseState = {
        paused: body.paused,
        paused_at: body.paused ? now : null,
        paused_by: body.paused ? auth.userId : null,
    }

    const supabase = getSupabase()
    const { error } = await supabase.from('site_settings').upsert({
        key: PAUSE_KEY,
        value: next,
        description: 'Pausa global da Central WhatsApp (mantém conexão, bloqueia disparos automatizados)',
        updated_at: now,
    }, { onConflict: 'key' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(next)
}
