/**
 * Pausa global da sessão de catálogos.
 *
 * Quando paused=true: a sessão permanece logada e seguimos logando arquivos
 * detectados, mas o auto-anexo é suspenso (todas as detecções ficam em
 * `pending` para o operador revisar manualmente).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { CATALOGS_PAUSE_KEY, readCatalogsPauseState } from '@/lib/whatsapp-catalogs'

export const dynamic = 'force-dynamic'

function sb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

export async function GET() {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
    const state = await readCatalogsPauseState(sb())
    return NextResponse.json(state)
}

export async function PUT(req: NextRequest) {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

    const { paused } = await req.json().catch(() => ({}))
    if (typeof paused !== 'boolean') {
        return NextResponse.json({ error: 'paused (boolean) é obrigatório' }, { status: 400 })
    }

    const value = {
        paused,
        paused_at: paused ? new Date().toISOString() : null,
        paused_by: paused ? gate.userId : null,
    }

    const { error } = await sb()
        .from('site_settings')
        .upsert({ key: CATALOGS_PAUSE_KEY, value }, { onConflict: 'key' })
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(value)
}
