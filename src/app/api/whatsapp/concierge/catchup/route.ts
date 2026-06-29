/**
 * POST /api/whatsapp/concierge/catchup
 *
 * Atende o backlog: leads que escreveram, ainda estão DENTRO da janela de 24h
 * (dá pra responder texto livre pela API oficial) e ficaram SEM resposta (a
 * última mensagem é inbound). Roda o mesmo cérebro do concierge em cada um e
 * envia a próxima fala pelo gateway. Pula opt-out, handoff humano e quem já foi
 * respondido. NÃO aplica a janela de "pensar" (são casos já atrasados).
 *
 * Auth: sessão admin OU header `x-catchup-secret` = SUPABASE_SERVICE_ROLE_KEY
 * (para acionar via script/curl interno). Body: { limit?, dryRun? }.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { normalizePhone, classifyMessage } from '@/lib/whatsapp-central'
import { findLeadByPhone } from '@/lib/whatsapp-inbound'
import { loadConciergeConfig, runConcierge } from '@/lib/whatsapp-concierge'
import { sendOutbound } from '@/lib/whatsapp-gateway'

export const maxDuration = 300

const WINDOW_MS = 24 * 3_600_000

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin()
    const secret = req.headers.get('x-catchup-secret')
    const secretOk = !!secret && secret === process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!auth.ok && !secretOk) {
        return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
    }

    let body: { limit?: number; dryRun?: boolean } = {}
    try { body = await req.json() } catch { /* corpo opcional */ }
    const limit = Math.min(Math.max(Number(body.limit) || 30, 1), 100)
    const dryRun = !!body.dryRun

    const supabase = svc()

    const config = await loadConciergeConfig(supabase)
    if (!config.enabled) {
        return NextResponse.json({ error: 'concierge desligado — ligue no cockpit antes.' }, { status: 409 })
    }

    // Mensagens das últimas 24h (janela ativa). Reduz por telefone para a última.
    const since = new Date(Date.now() - WINDOW_MS).toISOString()
    const { data: rows, error } = await supabase
        .from('whatsapp_messages')
        .select('phone, direction, body, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(4000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Última mensagem por telefone (ordem asc → o último visto é o mais recente).
    const lastByPhone = new Map<string, { direction: string; body: string | null; created_at: string }>()
    for (const r of rows ?? []) {
        const p = normalizePhone(r.phone || '')
        if (!p) continue
        lastByPhone.set(p, { direction: r.direction, body: r.body, created_at: r.created_at })
    }

    // Candidatos: a última mensagem é inbound (aguardando nossa resposta).
    const candidates = [...lastByPhone.entries()]
        .filter(([, m]) => m.direction === 'inbound')
        .map(([phone, m]) => ({ phone, text: (m.body || '').trim(), at: m.created_at }))

    const results: Array<{ phone: string; status: string; reason?: string }> = []
    let sent = 0, skipped = 0, errors = 0

    let processed = 0
    for (const cand of candidates) {
        if (processed >= limit) break
        processed++

        // Opt-out determinístico: nunca mexer com quem pediu pra sair.
        if (classifyMessage(cand.text).kind === 'optout') {
            results.push({ phone: cand.phone, status: 'skip', reason: 'optout_msg' }); skipped++; continue
        }

        const lead = await findLeadByPhone(supabase, cand.phone)
        if (!lead) { results.push({ phone: cand.phone, status: 'skip', reason: 'no_lead' }); skipped++; continue }
        if (lead.optout_whatsapp) { results.push({ phone: cand.phone, status: 'skip', reason: 'optout' }); skipped++; continue }
        if (lead.handoff_humano) { results.push({ phone: cand.phone, status: 'skip', reason: 'handoff' }); skipped++; continue }

        if (dryRun) { results.push({ phone: cand.phone, status: 'would_send' }); continue }

        try {
            const c = await runConcierge(supabase, {
                lead, phone: cand.phone, senderName: lead.nome ?? '', text: cand.text, media: null, config,
            })
            if (!c.handled) { results.push({ phone: cand.phone, status: 'skip', reason: `unhandled_${c.reason}` }); skipped++; continue }
            if (c.silent) { results.push({ phone: cand.phone, status: 'skip', reason: c.reason }); skipped++; continue }

            const r = await sendOutbound(supabase, {
                to: { phone: cand.phone, leadId: lead.id, name: lead.nome ?? null },
                text: c.reply,
                intent: 'crm_reply',
                channelHint: 'cloud',
                origin: 'concierge-catchup',
                botStep: c.botStep,
            })
            if (r.status === 'sent' || r.status === 'queued') {
                results.push({ phone: cand.phone, status: r.status }); sent++
            } else {
                results.push({ phone: cand.phone, status: 'fail', reason: r.reason }); errors++
            }
        } catch (e) {
            results.push({ phone: cand.phone, status: 'error', reason: e instanceof Error ? e.message : 'erro' }); errors++
        }
    }

    return NextResponse.json({
        ok: true,
        dryRun,
        window_hours: 24,
        candidates_total: candidates.length,
        processed,
        remaining: Math.max(0, candidates.length - processed),
        sent, skipped, errors,
        results,
    })
}
