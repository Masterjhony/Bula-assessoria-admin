/**
 * /api/whatsapp/central/activity — telemetria do bot WhatsApp em runtime.
 * Usado pelo bloco "Atividade" da aba Conexão (Central WhatsApp) pra que o
 * operador confirme rapidamente se a Central está enviando mensagens.
 *
 * Retorna:
 *   - counters_24h: breakdown de envios/recebimentos das últimas 24h
 *   - recent: últimas N mensagens (preview leve)
 *   - vps: status + fila do servidor Baileys
 *   - last_inbound_at / last_outbound_at: heartbeat
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'

const WHATSAPP_SERVER_URL = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001'

type Row = {
    id: string
    created_at: string
    phone: string | null
    name: string | null
    body: string | null
    direction: 'inbound' | 'outbound'
    status: string | null
    origin: string | null
    bot_step: string | null
}

async function fetchVps(path: string, timeoutMs = 3000): Promise<unknown | null> {
    try {
        const res = await fetch(`${WHATSAPP_SERVER_URL}${path}`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(timeoutMs),
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

export async function GET() {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [recentRes, last24hRes, lastInboundRes, lastOutboundRes, vpsStatus, vpsQueue] = await Promise.all([
        supabase
            .from('whatsapp_messages')
            .select('id, created_at, phone, name, body, direction, status, origin, bot_step')
            .order('created_at', { ascending: false })
            .limit(30),
        supabase
            .from('whatsapp_messages')
            .select('direction, status, origin, bot_step')
            .gte('created_at', since24h),
        supabase
            .from('whatsapp_messages')
            .select('created_at')
            .eq('direction', 'inbound')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        supabase
            .from('whatsapp_messages')
            .select('created_at')
            .eq('direction', 'outbound')
            .in('status', ['sent', 'queued'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        fetchVps('/status'),
        fetchVps('/queue'),
    ])

    const rows24h = (last24hRes.data ?? []) as Pick<Row, 'direction' | 'status' | 'origin' | 'bot_step'>[]
    const counters_24h = {
        outbound_total: 0,
        welcome_sent: 0,
        welcome_queued: 0,
        welcome_failed: 0,
        welcome_skipped: 0,
        campaign_sent: 0,
        manual_sent: 0,
        inbound: 0,
    }
    for (const r of rows24h) {
        if (r.direction === 'inbound') {
            counters_24h.inbound++
            continue
        }
        counters_24h.outbound_total++
        if (r.bot_step === 'welcome') {
            if (r.status === 'sent') counters_24h.welcome_sent++
            else if (r.status === 'queued') counters_24h.welcome_queued++
            else if (r.status === 'failed') counters_24h.welcome_failed++
            else if (r.status === 'skipped') counters_24h.welcome_skipped++
        }
        if (r.origin === 'campanha' || r.origin === 'campaign') counters_24h.campaign_sent++
        if (r.origin === 'manual' || r.origin === 'admin-manual') counters_24h.manual_sent++
    }

    const recent: Row[] = (recentRes.data ?? []) as Row[]

    return NextResponse.json({
        counters_24h,
        recent,
        last_inbound_at: lastInboundRes.data?.created_at ?? null,
        last_outbound_at: lastOutboundRes.data?.created_at ?? null,
        vps: {
            status: (vpsStatus as { status?: string } | null)?.status ?? null,
            queue_size: (vpsQueue as { queueSize?: number } | null)?.queueSize ?? null,
            processing: (vpsQueue as { processing?: boolean } | null)?.processing ?? null,
            delay_ms: (vpsQueue as { delayBetweenSendsMs?: number } | null)?.delayBetweenSendsMs ?? null,
            reachable: vpsStatus !== null,
        },
    })
}
