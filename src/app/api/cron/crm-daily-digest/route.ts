/**
 * /api/cron/crm-daily-digest — resumo diário do CRM no grupo interno (Baileys).
 *
 * Agendado no vercel.json para o fim do dia (22:30 UTC = 18:30 em MS). Também
 * aceita chamada manual com `?group=<jid>` para mandar a um grupo específico
 * (teste) em vez do grupo interno configurado no cockpit.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> OU x-webhook-secret ==
 * WHATSAPP_GROUP_TASK_SECRET (mesmo padrão do inactivity-sweep). O cron da
 * Vercel envia o Bearer automaticamente quando CRON_SECRET está setado.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendCrmDailyDigest } from '@/lib/crm-daily-digest'

export const maxDuration = 60

function authorized(req: NextRequest): boolean {
    const cronSecret = process.env.CRON_SECRET
    const groupSecret = process.env.WHATSAPP_GROUP_TASK_SECRET
    const auth = req.headers.get('authorization') ?? ''
    const webhook = req.headers.get('x-webhook-secret') ?? ''
    if (cronSecret && auth === `Bearer ${cronSecret}`) return true
    if (groupSecret && webhook === groupSecret) return true
    return false
}

async function run(req: NextRequest) {
    if (!authorized(req)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const group = new URL(req.url).searchParams.get('group')?.trim() || undefined

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const result = await sendCrmDailyDigest(supabase, { groupId: group })
    return NextResponse.json({ ok: result.sent, reason: result.reason, stats: result.stats })
}

export async function GET(req: NextRequest) {
    return run(req)
}
export async function POST(req: NextRequest) {
    return run(req)
}
