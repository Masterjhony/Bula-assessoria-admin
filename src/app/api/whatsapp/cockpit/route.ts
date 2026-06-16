/**
 * GET /api/whatsapp/cockpit — saúde dos dois canais + uso do dia + guard rails.
 *
 * Alimenta o cockpit na aba WhatsApp do CRM: status/QR do Baileys (VPS),
 * número/qualidade da Cloud API, contadores diários vs cap, e o resumo dos
 * guard rails ativos.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import {
    loadGuardrails,
    dailyCount,
    effectiveDailyCap,
} from '@/lib/whatsapp-guardrails'
import {
    isWhatsappCloudApiConfigured,
    fetchWhatsappCloudPhoneNumber,
} from '@/lib/whatsapp-cloud-api'
import { WHATSAPP_SERVER_URL, vpsHeaders } from '@/lib/whatsapp-vps'

async function fetchServer(path: string, timeoutMs = 3000): Promise<Record<string, unknown> | null> {
    try {
        const res = await fetch(`${WHATSAPP_SERVER_URL}${path}`, {
            cache: 'no-store',
            headers: vpsHeaders(),
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
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const guardrails = await loadGuardrails(supabase)
    const tz = guardrails.business_hours.timezone
    const cloudConfigured = isWhatsappCloudApiConfigured()

    const [statusRes, queueRes, baileysToday, cloudToday, cloudPhone] = await Promise.all([
        fetchServer('/status'),
        fetchServer('/queue'),
        dailyCount(supabase, 'baileys', tz),
        dailyCount(supabase, 'cloud', tz),
        cloudConfigured
            ? fetchWhatsappCloudPhoneNumber().catch((e: unknown) => ({ __error: e instanceof Error ? e.message : 'erro' }))
            : Promise.resolve(null),
    ])

    const cloudPhoneObj = cloudPhone as Record<string, unknown> | null
    const cloudError = cloudPhoneObj && '__error' in cloudPhoneObj ? String(cloudPhoneObj.__error) : null

    return NextResponse.json({
        baileys: {
            reachable: statusRes !== null,
            status: (statusRes?.status as string | undefined) ?? 'disconnected',
            qr: (statusRes?.qr as string | undefined) ?? null,
            queue_size: (queueRes?.queueSize as number | undefined) ?? null,
            processing: (queueRes?.processing as boolean | undefined) ?? null,
            today: baileysToday,
            cap: effectiveDailyCap(guardrails, 'baileys'),
            warmup_active: !!guardrails.baileys.warmup_started_on,
        },
        cloud: {
            configured: cloudConfigured,
            error: cloudError,
            display_phone_number: (cloudPhoneObj?.display_phone_number as string | undefined) ?? null,
            verified_name: (cloudPhoneObj?.verified_name as string | undefined) ?? null,
            quality_rating: (cloudPhoneObj?.quality_rating as string | undefined) ?? null,
            today: cloudToday,
            cap: effectiveDailyCap(guardrails, 'cloud'),
        },
        guardrails: {
            enabled: guardrails.enabled,
            business_hours: guardrails.business_hours,
            dedup_hours: guardrails.dedup_hours,
            baileys: guardrails.baileys,
            cloud: guardrails.cloud,
        },
    })
}
