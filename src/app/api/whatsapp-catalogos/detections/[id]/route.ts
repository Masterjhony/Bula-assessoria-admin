/**
 * Detalhe / remoção de uma detecção.
 *
 * GET    → registro + URL R2 presigned para visualizar o PDF
 * DELETE → remove a detecção (não desanexa do leilão; isso é manual no cronograma)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { findMatches, resolveCatalogDownloadUrl } from '@/lib/whatsapp-catalogs'

export const dynamic = 'force-dynamic'

function sb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
    const { id } = await params

    const client = sb()
    const { data, error } = await client
        .from('whatsapp_catalog_detections')
        .select(`
            *,
            cronograma:cronograma_leiloes!whatsapp_catalog_detections_cronograma_id_fkey (
                id, data, nome, catalogo_url
            )
        `)
        .eq('id', id)
        .single()
    if (error || !data) return NextResponse.json({ error: 'não encontrado' }, { status: 404 })

    let file_url: string | null = null
    if (data.r2_key) {
        try {
            file_url = await resolveCatalogDownloadUrl(data.r2_key, {
                expiresInSeconds: 3600,
                downloadAs: data.file_name,
            })
        } catch {
            file_url = null
        }
    }

    // Recalcula candidatos atualizados (útil quando o cronograma mudou)
    const fresh = await findMatches(client, data.file_name, { limit: 5 })

    return NextResponse.json({ detection: data, file_url, fresh_candidates: fresh })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
    const { id } = await params

    const { error } = await sb()
        .from('whatsapp_catalog_detections')
        .delete()
        .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: true })
}
