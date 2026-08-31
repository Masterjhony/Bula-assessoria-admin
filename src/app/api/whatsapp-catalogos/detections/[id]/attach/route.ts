/**
 * Anexa MANUALMENTE uma detecção a um leilão do cronograma.
 * Body: { cronograma_id: uuid, tipo?, titulo?, publico?, principal? }
 *
 * Um leilão aceita VÁRIOS documentos (catálogo Nelore + catálogo Tropa + ordem
 * de entrada), então anexar não conflita mais com o que já existe: entra como
 * mais um. `principal: true` promove este a "o catálogo" do leilão — é ele que
 * vira `catalogo_url` nas duas tabelas e abre a página pública.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { resolveCatalogDownloadUrl } from '@/lib/whatsapp-catalogs'
import { anexarDocumento, tituloDocumento, type TipoDocumentoLeilao } from '@/lib/leilao-documentos'

export const dynamic = 'force-dynamic'

function sb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

const TIPOS: TipoDocumentoLeilao[] = ['catalogo', 'ordem_entrada', 'outro']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
    const { id } = await params

    const body = await req.json().catch(() => ({})) as {
        cronograma_id?: string
        tipo?: string
        titulo?: string
        publico?: boolean
        principal?: boolean
        /** Compat: a UI antiga mandava overwrite para substituir o catálogo. */
        overwrite?: boolean
    }
    const cronograma_id = body.cronograma_id
    if (!cronograma_id || typeof cronograma_id !== 'string') {
        return NextResponse.json({ error: 'cronograma_id é obrigatório' }, { status: 400 })
    }

    const client = sb()

    const { data: detection, error: errDet } = await client
        .from('whatsapp_catalog_detections')
        .select('id, r2_key, file_name, file_size, group_name, content_hash, doc_tipo')
        .eq('id', id)
        .single()
    if (errDet || !detection) {
        return NextResponse.json({ error: 'detecção não encontrada' }, { status: 404 })
    }
    if (!detection.r2_key) {
        return NextResponse.json({ error: 'detecção não tem arquivo' }, { status: 400 })
    }

    const { data: leilao, error: errLeil } = await client
        .from('cronograma_leiloes')
        .select('id, nome, data')
        .eq('id', cronograma_id)
        .single()
    if (errLeil || !leilao) {
        return NextResponse.json({ error: 'leilão não encontrado' }, { status: 404 })
    }

    const tipoPedido = TIPOS.find(t => t === body.tipo)
    const tipo: TipoDocumentoLeilao =
        tipoPedido
        ?? (detection.doc_tipo === 'ordem_entrada' ? 'ordem_entrada' : 'catalogo')

    // URL Supabase pública (permanente) quando o produtor usou Storage; ou
    // presign R2 de 7 dias para chaves R2 legadas.
    const url = await resolveCatalogDownloadUrl(detection.r2_key, {
        expiresInSeconds: 7 * 24 * 3600,
        downloadAs: detection.file_name,
    })

    let resultado
    try {
        resultado = await anexarDocumento(client, {
            cronograma_id,
            url,
            tipo,
            titulo: body.titulo?.trim() || tituloDocumento(detection.file_name, tipo),
            file_name: detection.file_name,
            file_size: detection.file_size,
            content_hash: detection.content_hash,
            origem: detection.group_name || 'whatsapp',
            detection_id: id,
            publico: typeof body.publico === 'boolean' ? body.publico : undefined,
            tornarPrincipal: body.principal === true || body.overwrite === true,
        })
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'falha ao anexar' }, { status: 500 })
    }

    const nowIso = new Date().toISOString()
    await client
        .from('whatsapp_catalog_detections')
        .update({
            match_status: 'manual',
            match_method: 'manual',
            cronograma_id,
            attached: true,
            attached_at: nowIso,
            attached_by: gate.userId,
            error: null,
        })
        .eq('id', id)

    return NextResponse.json({
        ok: true,
        cronograma_id,
        leilao: leilao.nome,
        documento: resultado.documento,
        criado: resultado.criado,
        catalogo_url: resultado.catalogo_url,
    })
}
