/**
 * POST /api/whatsapp/central/templates/sync
 *
 * Atualiza o status Meta (PENDING→APPROVED/REJECTED…) dos templates já
 * submetidos, consultando a Graph API. Operador clica "Sincronizar status" na
 * aba Templates depois de submeter, ou periodicamente.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { isWhatsappCloudApiConfigured, syncMetaTemplateStatuses } from '@/lib/whatsapp-cloud-api'

export async function POST() {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    if (!isWhatsappCloudApiConfigured()) {
        return NextResponse.json(
            { error: 'WhatsApp Cloud API não configurada.' },
            { status: 400 },
        )
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    try {
        const result = await syncMetaTemplateStatuses(supabase)
        return NextResponse.json({ success: true, ...result })
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : 'Falha ao sincronizar com a Meta' },
            { status: 502 },
        )
    }
}
