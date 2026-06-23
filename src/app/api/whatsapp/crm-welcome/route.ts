/**
 * GET/PUT /api/whatsapp/crm-welcome — mensagem automática de boas-vindas.
 *
 * Lê e edita o texto + on/off do disparo automático que sai pelo número
 * conectado (Baileys) para todo lead novo. Fonte de verdade em
 * `site_settings.crm_whatsapp_welcome` (ver src/lib/crm-welcome.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { loadCrmWelcome, saveCrmWelcome } from '@/lib/crm-welcome'

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
}

export async function GET() {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const config = await loadCrmWelcome(admin())
    return NextResponse.json(config)
}

export async function PUT(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body: { enabled?: unknown; message?: unknown }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }

    if (body.message !== undefined && typeof body.message !== 'string') {
        return NextResponse.json({ error: 'message deve ser texto' }, { status: 400 })
    }
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
        return NextResponse.json({ error: 'enabled deve ser booleano' }, { status: 400 })
    }

    const saved = await saveCrmWelcome(admin(), {
        enabled: body.enabled as boolean | undefined,
        message: body.message as string | undefined,
    })
    return NextResponse.json(saved)
}
