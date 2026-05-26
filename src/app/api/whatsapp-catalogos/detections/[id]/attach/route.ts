/**
 * Anexa MANUALMENTE uma detecção a um leilão do cronograma.
 * Body: { cronograma_id: uuid, overwrite?: boolean }
 *
 * Esse endpoint serve para:
 *   - Detecções que ficaram em `ambiguous` ou `no_match` e o operador escolhe.
 *   - Sobrescrever um catálogo já anexado (com `overwrite=true`).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { getR2DownloadUrl } from '@/lib/r2'

export const dynamic = 'force-dynamic'

function sb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
    const { id } = await params

    const { cronograma_id, overwrite } = await req.json().catch(() => ({}))
    if (!cronograma_id || typeof cronograma_id !== 'string') {
        return NextResponse.json({ error: 'cronograma_id é obrigatório' }, { status: 400 })
    }

    const client = sb()

    const { data: detection, error: errDet } = await client
        .from('whatsapp_catalog_detections')
        .select('id, r2_key, file_name, group_name')
        .eq('id', id)
        .single()
    if (errDet || !detection) {
        return NextResponse.json({ error: 'detecção não encontrada' }, { status: 404 })
    }
    if (!detection.r2_key) {
        return NextResponse.json({ error: 'detecção não tem arquivo R2 (r2_key vazio)' }, { status: 400 })
    }

    const { data: leilao, error: errLeil } = await client
        .from('cronograma_leiloes')
        .select('id, nome, catalogo_url')
        .eq('id', cronograma_id)
        .single()
    if (errLeil || !leilao) {
        return NextResponse.json({ error: 'leilão não encontrado' }, { status: 404 })
    }
    const hadCatalog = !!leilao.catalogo_url
    if (hadCatalog && !overwrite) {
        return NextResponse.json({
            error: 'leilão já tem catálogo. Use overwrite=true para substituir.',
            existing: leilao.catalogo_url,
        }, { status: 409 })
    }

    // Gera URL R2 válida por 7 dias (limite S3). A URL é regerada quando
    // alguém abrir o catálogo via UI; aqui salvamos a versão atual.
    const presigned = await getR2DownloadUrl(detection.r2_key, {
        expiresInSeconds: 7 * 24 * 3600,
        downloadAs: detection.file_name,
    })

    const nowIso = new Date().toISOString()
    const { error: errUpd } = await client
        .from('cronograma_leiloes')
        .update({
            catalogo_url: presigned,
            catalogo_anexado_em: nowIso,
            catalogo_origem: detection.group_name || 'whatsapp-catalogos',
        })
        .eq('id', cronograma_id)
    if (errUpd) {
        return NextResponse.json({ error: errUpd.message }, { status: 500 })
    }

    await client
        .from('whatsapp_catalog_detections')
        .update({
            match_status: 'manual',
            match_method: 'manual',
            cronograma_id,
            attached: true,
            attached_at: nowIso,
            attached_by: gate.userId,
            overwrote_existing: hadCatalog,
        })
        .eq('id', id)

    return NextResponse.json({ ok: true, cronograma_id, leilao: leilao.nome })
}
