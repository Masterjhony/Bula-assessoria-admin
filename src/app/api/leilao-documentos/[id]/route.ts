/**
 * Um documento de leilão (catálogo / ordem de entrada).
 *
 * PATCH  { publico?, principal?, titulo?, tipo? }
 *        `publico` controla o que aparece na agenda em bulaassessoria.com.
 *        `principal` promove o documento a "o catálogo" do leilão — é ele que
 *        vira `catalogo_url` no cronograma E em bula_leiloes.
 * DELETE remove o documento e reescreve o catalogo_url do leilão.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { definirPrincipal, removerDocumento, sincronizarCatalogoUrl } from '@/lib/leilao-documentos'

export const dynamic = 'force-dynamic'

function sb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

const TIPOS = ['catalogo', 'ordem_entrada', 'outro']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
    const { id } = await params

    const body = await req.json().catch(() => ({})) as {
        publico?: boolean; principal?: boolean; titulo?: string; tipo?: string
    }

    const client = sb()
    const { data: doc } = await client
        .from('leilao_documentos')
        .select('id, cronograma_id')
        .eq('id', id)
        .maybeSingle()
    if (!doc) return NextResponse.json({ error: 'documento não encontrado' }, { status: 404 })

    const patch: Record<string, unknown> = {}
    if (typeof body.publico === 'boolean') patch.publico = body.publico
    if (typeof body.titulo === 'string' && body.titulo.trim()) patch.titulo = body.titulo.trim()
    if (body.tipo && TIPOS.includes(body.tipo)) patch.tipo = body.tipo

    if (Object.keys(patch).length > 0) {
        const { error } = await client.from('leilao_documentos').update(patch).eq('id', id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (body.principal === true) {
        await definirPrincipal(client, doc.cronograma_id, id)
    }

    const catalogo_url = await sincronizarCatalogoUrl(client, doc.cronograma_id)
    const { data: atualizado } = await client
        .from('leilao_documentos')
        .select('*')
        .eq('id', id)
        .maybeSingle()

    return NextResponse.json({ ok: true, documento: atualizado, catalogo_url })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
    const { id } = await params

    try {
        await removerDocumento(sb(), id)
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'falha' }, { status: 500 })
    }
    return NextResponse.json({ deleted: true })
}
