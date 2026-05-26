/**
 * Lista de detecções de catálogo (PDFs capturados nos grupos).
 *
 * Filtros via query:
 *   ?status=pending|matched|ambiguous|no_match|attached|manual
 *   ?group_jid=<jid>
 *   ?q=<termo>            (busca em file_name, group_name, sender_name)
 *   ?limit=50  ?offset=0
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

function sb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

export async function GET(req: NextRequest) {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const groupJid = url.searchParams.get('group_jid')
    const q = url.searchParams.get('q')?.trim()
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)

    let query = sb()
        .from('whatsapp_catalog_detections')
        .select(`
            id, received_at, group_jid, group_name, sender_jid, sender_name, message_id,
            file_name, file_mime, file_size, r2_key,
            match_status, match_score, match_method, cronograma_id, candidates,
            attached, attached_at, attached_by, overwrote_existing,
            error, notes,
            cronograma:cronograma_leiloes!whatsapp_catalog_detections_cronograma_id_fkey (
                id, data, nome, catalogo_url
            )
        `, { count: 'exact' })
        .order('received_at', { ascending: false })
        .range(offset, offset + limit - 1)

    if (status) query = query.eq('match_status', status)
    if (groupJid) query = query.eq('group_jid', groupJid)
    if (q) {
        const term = `%${q.replace(/[%_]/g, '\\$&')}%`
        query = query.or(`file_name.ilike.${term},group_name.ilike.${term},sender_name.ilike.${term}`)
    }

    const { data, error, count } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
        detections: data ?? [],
        total: count ?? 0,
        limit,
        offset,
    })
}
