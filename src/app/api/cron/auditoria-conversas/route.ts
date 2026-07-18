/**
 * /api/cron/auditoria-conversas — auditor noturno do atendimento IA.
 *
 * Roda de madrugada (vercel.json) e audita as conversas do dia ANTERIOR no
 * fuso de MS; aceita ?dia=YYYY-MM-DD para reprocessar um dia específico.
 * Resultado vai para crm_conversa_auditorias (aba "Auditoria IA" do CRM).
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (Vercel envia automaticamente).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAuditoriaDoDia } from '@/lib/concierge-auditoria'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

function authorized(req: NextRequest): boolean {
    const cronSecret = process.env.CRON_SECRET
    const auth = req.headers.get('authorization') ?? ''
    return Boolean(cronSecret && auth === `Bearer ${cronSecret}`)
}

/** Ontem no fuso de MS (UTC-4), formato YYYY-MM-DD. */
function ontemMS(): string {
    const agora = new Date(Date.now() - 4 * 3600_000)
    const ontem = new Date(agora.getTime() - 24 * 3600_000)
    return ontem.toISOString().slice(0, 10)
}

async function run(req: NextRequest) {
    if (!authorized(req)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const url = new URL(req.url)
    const dia = url.searchParams.get('dia')?.trim() || ontemMS()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
        return NextResponse.json({ error: 'dia inválido (YYYY-MM-DD)' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const r = await runAuditoriaDoDia(supabase, dia)
    return NextResponse.json({ ok: true, dia, ...r })
}

export async function GET(req: NextRequest) { return run(req) }
export async function POST(req: NextRequest) { return run(req) }
