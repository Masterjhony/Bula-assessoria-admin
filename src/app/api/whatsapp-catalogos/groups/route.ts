/**
 * Grupos monitorados pela sessão de catálogos.
 *
 * GET  → lista todos (ativos primeiro)
 * POST → cria novo grupo { nome, jid?, slug?, descricao?, ativo? }
 *
 * O JID pode ficar vazio na criação — o operador escaneia o QR, espera a
 * sessão conectar, e o VPS expõe um endpoint /groups para listar os JIDs.
 * O operador então cola o JID aqui pra ativar o monitoramento daquele grupo.
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

export async function GET() {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

    const { data, error } = await sb()
        .from('whatsapp_catalog_groups')
        .select('*')
        .order('ativo', { ascending: false })
        .order('nome', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ groups: data ?? [] })
}

export async function POST(req: NextRequest) {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

    const body = await req.json().catch(() => ({}))
    const { nome, jid, slug, descricao, ativo } = body
    if (!nome || typeof nome !== 'string') {
        return NextResponse.json({ error: 'nome é obrigatório' }, { status: 400 })
    }

    const insert = {
        nome: nome.trim(),
        jid: typeof jid === 'string' ? jid.trim() : '',
        slug: typeof slug === 'string' ? slug.trim() : null,
        descricao: typeof descricao === 'string' ? descricao.trim() : null,
        ativo: typeof ativo === 'boolean' ? ativo : true,
    }

    const { data, error } = await sb()
        .from('whatsapp_catalog_groups')
        .insert(insert)
        .select('*')
        .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ group: data })
}
