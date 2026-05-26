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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
    const { id } = await params

    const body = await req.json().catch(() => ({}))
    const patch: Record<string, unknown> = {}
    if (typeof body.nome === 'string') patch.nome = body.nome.trim()
    if (typeof body.jid === 'string') patch.jid = body.jid.trim()
    if (typeof body.slug === 'string') patch.slug = body.slug.trim()
    if (typeof body.descricao === 'string') patch.descricao = body.descricao.trim()
    if (typeof body.ativo === 'boolean') patch.ativo = body.ativo

    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 })
    }

    const { data, error } = await sb()
        .from('whatsapp_catalog_groups')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ group: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
    const { id } = await params

    const { error } = await sb()
        .from('whatsapp_catalog_groups')
        .delete()
        .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: true })
}
