/**
 * Endpoint consumido pela SEGUNDA sessão Baileys (catálogos) no VPS.
 *
 * O servidor catálogos faz GET aqui a cada N minutos para saber quais JIDs
 * monitorar. Auth via x-webhook-secret (mesmo da Central).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const secret = process.env.WHATSAPP_GROUP_TASK_SECRET || ''
    const header = req.headers.get('x-webhook-secret') || ''
    if (!secret || header !== secret) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
        .from('whatsapp_catalog_groups')
        .select('jid, nome, slug')
        .eq('ativo', true)
        .neq('jid', '')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ groups: data ?? [] })
}
