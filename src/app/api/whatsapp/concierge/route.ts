/**
 * GET/PUT /api/whatsapp/concierge — atendimento automático por IA (concierge
 * de qualificação). Lê/edita on-off, modelo OpenRouter e persona em
 * `site_settings.crm_concierge` (ver src/lib/whatsapp-concierge.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { loadConciergeConfig, saveConciergeConfig, DEFAULT_CONCIERGE_PERSONA, DEFAULT_CONCIERGE_MODEL } from '@/lib/whatsapp-concierge'
import { isOpenRouterConfigured } from '@/lib/openrouter'

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
}

export async function GET() {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const config = await loadConciergeConfig(admin())
    return NextResponse.json({
        ...config,
        api_configured: isOpenRouterConfigured(),
        default_model: DEFAULT_CONCIERGE_MODEL,
        default_persona: DEFAULT_CONCIERGE_PERSONA,
    })
}

export async function PUT(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body: { enabled?: unknown; model?: unknown; persona?: unknown; thinkingSeconds?: unknown; handoffContact?: unknown; notifyGroupId?: unknown }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
        return NextResponse.json({ error: 'enabled deve ser booleano' }, { status: 400 })
    }
    if (body.model !== undefined && typeof body.model !== 'string') {
        return NextResponse.json({ error: 'model deve ser texto' }, { status: 400 })
    }
    if (body.persona !== undefined && typeof body.persona !== 'string') {
        return NextResponse.json({ error: 'persona deve ser texto' }, { status: 400 })
    }
    if (body.thinkingSeconds !== undefined && typeof body.thinkingSeconds !== 'number') {
        return NextResponse.json({ error: 'thinkingSeconds deve ser número' }, { status: 400 })
    }
    if (body.handoffContact !== undefined && typeof body.handoffContact !== 'string') {
        return NextResponse.json({ error: 'handoffContact deve ser texto' }, { status: 400 })
    }
    if (body.notifyGroupId !== undefined && typeof body.notifyGroupId !== 'string') {
        return NextResponse.json({ error: 'notifyGroupId deve ser texto' }, { status: 400 })
    }

    const saved = await saveConciergeConfig(admin(), {
        enabled: body.enabled as boolean | undefined,
        model: body.model as string | undefined,
        persona: body.persona as string | undefined,
        thinkingSeconds: body.thinkingSeconds as number | undefined,
        handoffContact: body.handoffContact as string | undefined,
        notifyGroupId: body.notifyGroupId as string | undefined,
    })
    return NextResponse.json({ ...saved, api_configured: isOpenRouterConfigured(), default_model: DEFAULT_CONCIERGE_MODEL })
}
