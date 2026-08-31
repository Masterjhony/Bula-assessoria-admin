/**
 * Detalhe / remoção de uma detecção.
 *
 * GET    → registro + URL do PDF + candidatos recalculados COM a evidência já
 *          lida do arquivo (não só o nome), + documentos do leilão casado.
 * DELETE → remove a detecção do histórico. Não desanexa o documento do leilão:
 *          isso é feito na tela do leilão, de propósito.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { findMatches, resolveCatalogDownloadUrl, evidenciaDaDeteccao } from '@/lib/whatsapp-catalogs'
import { listarDocumentos } from '@/lib/leilao-documentos'

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

    // Recalcula candidatos com a evidência do arquivo (útil quando o cronograma
    // mudou depois da análise).
    const fresh = await findMatches(client, data.file_name, {
        limit: 5,
        evidencia: evidenciaDaDeteccao(data),
        referencia: data.received_at ? new Date(data.received_at) : undefined,
    })

    const documentos = data.cronograma_id
        ? (await listarDocumentos(client, [data.cronograma_id])).get(data.cronograma_id) ?? []
        : []

    return NextResponse.json({ detection: data, file_url, fresh_candidates: fresh, documentos })
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
