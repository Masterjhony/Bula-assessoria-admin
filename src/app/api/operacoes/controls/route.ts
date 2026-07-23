import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'

export async function PATCH(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const body = await req.json().catch(() => ({})) as {
        outbound_enabled?: boolean
        daily_limit?: number
    }
    const patch: Record<string, unknown> = {
        updated_by: auth.userId,
        updated_at: new Date().toISOString(),
    }
    if (typeof body.outbound_enabled === 'boolean') {
        patch.outbound_enabled = body.outbound_enabled
        patch.paused_reason = body.outbound_enabled ? null : 'Pausado manualmente na Central Operacional.'
    }
    if (typeof body.daily_limit === 'number') {
        patch.daily_limit = Math.max(0, Math.min(5, Math.trunc(body.daily_limit)))
    }
    const { data, error } = await supabase
        .from('operational_controls')
        .update(patch)
        .eq('id', 'joao')
        .select('id, outbound_enabled, daily_limit, paused_reason, updated_at')
        .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.from('operational_diary_entries').insert({
        kind: 'controle_seguranca',
        areas: [],
        title: body.outbound_enabled ? 'Envios operacionais habilitados' : 'Envios operacionais pausados',
        summary: body.outbound_enabled
            ? `Kill switch liberado com limite de até ${data.daily_limit} mensagens por dia.`
            : 'O número permanece conectado para leitura, sem mensagens originadas pela Central.',
        status: 'confirmed',
        occurred_at: new Date().toISOString(),
        created_by: auth.userId,
        source_evidence: { control: 'joao', daily_limit: data.daily_limit },
    })
    return NextResponse.json({ ok: true, control: data })
}
