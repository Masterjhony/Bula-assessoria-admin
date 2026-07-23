/**
 * GET/POST /api/cron/followup-callback
 *
 * Dispara os "callbacks agendados": leads que pediram pra retomar depois
 * ("amanhã de manhã", "semana que vem"…). O concierge grava a data em
 * `extra_data.followup_due_at` (via followup-schedule.ts). Este cron varre os
 * vencidos e envia a reabertura pelo gateway — que sozinho manda TEXTO LIVRE se
 * a janela de 24h ainda estiver aberta, ou o TEMPLATE (bula_retomada_agendada /
 * bula_habilitacao_link) se já fechou.
 *
 * Auth: Bearer CRON_SECRET (Vercel injeta), OU user-agent vercel-cron (sem
 * secret), OU sessão admin, OU POST com header x-cron-secret = SERVICE_ROLE_KEY.
 *
 * Idempotência: ao enviar, zera followup_due_at e carimba followup_sent_at.
 * Se o lead voltar a falar antes, o próprio concierge zera o followup_due_at.
 * Envio retido/falho mantém a data (retenta no próximo ciclo); após 3 falhas
 * seguidas desiste (followup_failed_at) pra não martelar template não aprovado.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { sendOutbound } from '@/lib/whatsapp-gateway'
import { pickFollowupPlan } from '@/lib/followup-schedule'

export const maxDuration = 120

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const LOCK_KEY = 'crm_followup_callback_lock'
const LOCK_MS = 4 * 60_000
const MAX_ATTEMPTS = 3

async function acquireLock(supabase: ReturnType<typeof svc>): Promise<boolean> {
    const { data } = await supabase.from('site_settings').select('value').eq('key', LOCK_KEY).maybeSingle()
    const at = (data?.value as { at?: string } | null)?.at
    if (at && Date.now() - new Date(at).getTime() < LOCK_MS) return false
    await supabase.from('site_settings').upsert(
        { key: LOCK_KEY, value: { at: new Date().toISOString() }, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
    )
    return true
}
async function releaseLock(supabase: ReturnType<typeof svc>): Promise<void> {
    await supabase.from('site_settings').upsert(
        { key: LOCK_KEY, value: { at: null }, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
    ).then(() => undefined, () => undefined)
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization') || ''
    const ua = req.headers.get('user-agent') || ''
    const cronSecretOk = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
    const cronUaOk = !process.env.CRON_SECRET && /vercel-cron/i.test(ua)
    const auth = await requireAdmin()
    if (!cronSecretOk && !cronUaOk && !auth.ok) {
        return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
    }
    return run({ limit: 40, dryRun: false })
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin()
    const secret = req.headers.get('x-cron-secret')
    const secretOk = !!secret && secret === process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!auth.ok && !secretOk) {
        return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
    }
    let body: { limit?: number; dryRun?: boolean } = {}
    try { body = await req.json() } catch { /* corpo opcional */ }
    const limit = Math.min(Math.max(Number(body.limit) || 40, 1), 200)
    return run({ limit, dryRun: !!body.dryRun })
}

interface LeadRow {
    id: string
    nome: string | null
    telefone: string | null
    celular: string | null
    extra_data: Record<string, unknown> | null
    optout_whatsapp: boolean | null
    handoff_humano: boolean | null
    arquivado: boolean | null
}

async function run({ limit, dryRun }: { limit: number; dryRun: boolean }) {
    const supabase = svc()
    if (!dryRun && !(await acquireLock(supabase))) {
        return NextResponse.json({ ok: true, skipped: 'locked' })
    }
    try {
        const nowIso = new Date().toISOString()

        // Vencidos: followup_due_at <= agora. ISO UTC ordena lexicograficamente,
        // então a comparação de string bate com a cronológica. Pagina (o cap de
        // 1000 do PostgREST já duplicou lead nesse projeto).
        const rows: LeadRow[] = []
        for (let off = 0; ; off += 1000) {
            const { data, error } = await supabase
                .from('crm_leads')
                .select('id, nome, telefone, celular, extra_data, optout_whatsapp, handoff_humano, arquivado')
                .not('extra_data->>followup_due_at', 'is', null)
                .lte('extra_data->>followup_due_at', nowIso)
                .order('id', { ascending: true })
                .range(off, off + 999)
            if (error) return NextResponse.json({ error: error.message }, { status: 500 })
            if (!data?.length) break
            rows.push(...(data as LeadRow[]))
            if (data.length < 1000) break
        }

        const results: Array<{ id: string; status: string; reason?: string }> = []
        let sent = 0, skipped = 0, errors = 0, processed = 0

        for (const lead of rows) {
            if (processed >= limit) break
            const xd = (lead.extra_data ?? {}) as Record<string, unknown>
            const due = String(xd.followup_due_at || '')

            if (lead.arquivado || lead.optout_whatsapp || lead.handoff_humano) {
                if (!dryRun) await clearDue(supabase, lead.id, xd)
                results.push({ id: lead.id, status: 'skip', reason: 'arquivado/optout/handoff' }); skipped++; continue
            }
            // Já atendido para esta mesma data (reagendar apaga followup_sent_at).
            const sentAt = typeof xd.followup_sent_at === 'string' ? xd.followup_sent_at : ''
            if (sentAt && sentAt >= due) {
                if (!dryRun) await clearDue(supabase, lead.id, xd)
                results.push({ id: lead.id, status: 'skip', reason: 'ja_enviado' }); skipped++; continue
            }
            const phone = (lead.celular || lead.telefone || '').trim()
            if (!phone) {
                if (!dryRun) await clearDue(supabase, lead.id, xd)
                results.push({ id: lead.id, status: 'skip', reason: 'sem_telefone' }); skipped++; continue
            }

            processed++
            const plan = pickFollowupPlan(lead)
            if (dryRun) { results.push({ id: lead.id, status: 'would_send', reason: plan.templateName }); continue }

            try {
                const r = await sendOutbound(supabase, {
                    to: { phone, leadId: lead.id, name: lead.nome ?? null },
                    text: plan.text,
                    templateName: plan.templateName,
                    templateLanguage: 'pt_BR',
                    templateParams: plan.templateParams,
                    intent: 'crm_reply',
                    channelHint: 'cloud',
                    origin: 'followup-callback',
                    botStep: plan.botStep,
                })
                if (r.status === 'sent' || r.status === 'queued') {
                    await markSent(supabase, lead.id, xd, nowIso)
                    results.push({ id: lead.id, status: r.status, reason: plan.templateName }); sent++
                } else {
                    // Retido (fora de horário) ou falho: mantém a data e retenta,
                    // mas conta a tentativa pra desistir de template não aprovado.
                    await bumpAttempt(supabase, lead.id, xd, nowIso, r.reason)
                    results.push({ id: lead.id, status: 'held', reason: r.reason }); skipped++
                }
            } catch (e) {
                await bumpAttempt(supabase, lead.id, xd, nowIso, e instanceof Error ? e.message : 'erro')
                results.push({ id: lead.id, status: 'error', reason: e instanceof Error ? e.message : 'erro' }); errors++
            }
        }

        return NextResponse.json({
            ok: true, dryRun, due_total: rows.length, processed,
            remaining: Math.max(0, rows.length - processed), sent, skipped, errors, results,
        })
    } finally {
        if (!dryRun) await releaseLock(supabase)
    }
}

async function patchExtra(supabase: ReturnType<typeof svc>, id: string, extra: Record<string, unknown>) {
    await supabase.from('crm_leads').update({ extra_data: extra }).eq('id', id)
}
async function clearDue(supabase: ReturnType<typeof svc>, id: string, xd: Record<string, unknown>) {
    const next = { ...xd }
    delete next.followup_due_at
    delete next.followup_attempts
    await patchExtra(supabase, id, next)
}
async function markSent(supabase: ReturnType<typeof svc>, id: string, xd: Record<string, unknown>, nowIso: string) {
    const next = { ...xd }
    delete next.followup_due_at
    delete next.followup_attempts
    next.followup_sent_at = nowIso
    await patchExtra(supabase, id, next)
}
async function bumpAttempt(
    supabase: ReturnType<typeof svc>, id: string, xd: Record<string, unknown>, nowIso: string, reason?: string,
) {
    const attempts = (Number(xd.followup_attempts) || 0) + 1
    const next: Record<string, unknown> = { ...xd, followup_attempts: attempts }
    if (attempts >= MAX_ATTEMPTS) {
        delete next.followup_due_at
        next.followup_failed_at = nowIso
        next.followup_failed_reason = reason || 'sem_status'
    }
    await patchExtra(supabase, id, next)
}
