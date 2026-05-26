/**
 * /api/agendamentos/settings
 *
 * GET / PUT da configuração de sincronia em site_settings.agendamentos_calendar.
 * Usado pela aba "Configuração" da página /sistema/agendamentos.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth-helpers'
import {
    DEFAULT_AGENDAMENTOS_SETTINGS,
    loadAgendamentosSettings,
    type AgendamentosCalendarSettings,
} from '@/lib/agendamentos-sync'
import { isGoogleCalendarConfigured } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

export async function GET() {
    const admin = await requireAdmin()
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status })
    const supabase = await createClient()
    const settings = await loadAgendamentosSettings(supabase)

    // Service account email pro operador adicionar manualmente no compartilhamento
    // do Google Calendar. Lemos do env porque o JSON completo é Sensitive.
    let serviceAccountEmail: string | null = null
    try {
        const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
        if (raw) {
            const parsed = JSON.parse(raw) as { client_email?: string }
            serviceAccountEmail = parsed.client_email ?? null
        }
    } catch {
        // ignore
    }

    return NextResponse.json({
        settings,
        google_configured: isGoogleCalendarConfigured(),
        service_account_email: serviceAccountEmail,
    })
}

export async function PUT(req: NextRequest) {
    const admin = await requireAdmin()
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status })

    const supabase = await createClient()
    const body = (await req.json().catch(() => ({}))) as Partial<AgendamentosCalendarSettings>

    const current = await loadAgendamentosSettings(supabase)
    const next: AgendamentosCalendarSettings = {
        ...DEFAULT_AGENDAMENTOS_SETTINGS,
        ...current,
        ...body,
    }

    // Sanitização leve
    next.sync_window_past_days = Math.max(0, Math.min(365, Number(next.sync_window_past_days) || 0))
    next.sync_window_future_days = Math.max(1, Math.min(365, Number(next.sync_window_future_days) || 1))
    next.google_calendar_id = (next.google_calendar_id || '').trim()
    next.calendly_event_url = (next.calendly_event_url || '').trim()

    const { error } = await supabase
        .from('site_settings')
        .upsert({ key: 'agendamentos_calendar', value: next }, { onConflict: 'key' })
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ settings: next })
}
