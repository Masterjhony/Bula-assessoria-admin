/**
 * /api/agendamentos/sync
 *
 * Puxa eventos do Google Calendar (calendar configurado em
 * site_settings.agendamentos_calendar) e materializa em `agendamentos`.
 *
 * Auth:
 *   - GET: cron externo via `Authorization: Bearer ${CRON_SECRET}` OU
 *     `x-webhook-secret: ${WHATSAPP_GROUP_TASK_SECRET}` (mesmo padrão dos
 *     outros crons).
 *   - POST: requer admin logado (botão "Sincronizar agora" no painel).
 *
 * Idempotência: o sync usa `google_event_id` como chave única; pode rodar
 * em paralelo (Supabase serializa o upsert por linha).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { syncAgendamentos } from '@/lib/agendamentos-sync'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

function isCronAuthorized(req: NextRequest): boolean {
    const cronSecret = process.env.CRON_SECRET
    const groupSecret = process.env.WHATSAPP_GROUP_TASK_SECRET
    const authHeader = req.headers.get('authorization') ?? ''
    const webhookHeader = req.headers.get('x-webhook-secret') ?? ''
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
    if (groupSecret && webhookHeader === groupSecret) return true
    return false
}

function serviceClient() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
}

export async function GET(req: NextRequest) {
    if (!isCronAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const supabase = serviceClient()
    const pastDays = parseOptionalInt(req.nextUrl.searchParams.get('past_days'))
    const futureDays = parseOptionalInt(req.nextUrl.searchParams.get('future_days'))
    const updatedMin = req.nextUrl.searchParams.get('updated_min') ?? undefined
    const result = await syncAgendamentos(supabase, {
        pastDays: pastDays ?? undefined,
        futureDays: futureDays ?? undefined,
        updatedMin,
    })
    return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
    const admin = await requireAdmin()
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status })

    // Em chamada via UI, usa o client autenticado pra que RLS valide;
    // operações de upsert via service role manteriam funcionando, mas usamos
    // o de auth pra consistência com o resto do painel.
    const supabase = await createClient()
    const body = (await req.json().catch(() => ({}))) as {
        past_days?: number
        future_days?: number
        updated_min?: string
    }
    const result = await syncAgendamentos(supabase, {
        pastDays: body.past_days,
        futureDays: body.future_days,
        updatedMin: body.updated_min,
    })
    return NextResponse.json(result)
}

function parseOptionalInt(v: string | null | undefined): number | null {
    if (!v) return null
    const n = Number(v)
    return Number.isFinite(n) ? Math.trunc(n) : null
}
