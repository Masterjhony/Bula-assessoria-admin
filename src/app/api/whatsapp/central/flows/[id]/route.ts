/**
 * /api/whatsapp/central/flows/[id]
 *   GET    → fluxo completo (metadata + graph) pra carregar no editor
 *   PUT    → atualiza name/description e/ou graph (com validateGraph)
 *   DELETE → remove fluxo. Não permite deletar o ativo nem o último restante.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { buildDefaultGraph, validateGraph, type FlowGraphV2 } from '@/lib/whatsapp-flow-engine'
import type { FlowSettings } from '@/lib/whatsapp-flow-settings'

const FLOW_SELECT = 'id, name, description, graph, settings, is_active, created_by, created_at, updated_at, last_activated_at'

function isGraphEmpty(g: unknown): boolean {
    if (!g || typeof g !== 'object') return true
    const obj = g as Record<string, unknown>
    return !Array.isArray(obj.nodes) || (obj.nodes as unknown[]).length === 0
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { id } = await params
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
        .from('whatsapp_flows')
        .select(FLOW_SELECT)
        .eq('id', id)
        .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Fluxo não encontrado' }, { status: 404 })

    // Auto-cura: a migration semeia "Padrão" com placeholder vazio quando
    // site_settings.whatsapp_flow_v2 não existia. Na primeira leitura,
    // se o grafo está vazio, persiste buildDefaultGraph() e devolve já curado.
    if (isGraphEmpty(data.graph)) {
        const def = buildDefaultGraph()
        const seeded: FlowGraphV2 = {
            ...def,
            updatedAt: new Date().toISOString(),
            updatedBy: auth.userId,
        }
        const { data: healed } = await supabase
            .from('whatsapp_flows')
            .update({ graph: seeded })
            .eq('id', id)
            .select(FLOW_SELECT)
            .single()
        const flow = healed ?? { ...data, graph: seeded }
        return NextResponse.json({ flow, validation: validateGraph(seeded), healed: true })
    }

    const validation = validateGraph(data.graph as FlowGraphV2)
    return NextResponse.json({ flow: data, validation })
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { id } = await params

    let body: {
        name?: string
        description?: string | null
        graph?: FlowGraphV2
        settings?: FlowSettings
    }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const update: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim()
    if (body.description !== undefined) update.description = body.description?.trim() || null
    if (body.settings !== undefined && body.settings !== null && typeof body.settings === 'object') {
        update.settings = body.settings
    }

    let validation = null
    if (body.graph) {
        validation = validateGraph(body.graph)
        if (!validation.valid) {
            return NextResponse.json(
                { error: 'Grafo inválido', validation },
                { status: 400 }
            )
        }
        update.graph = body.graph
    }

    if (Object.keys(update).length === 0) {
        return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
    }

    const { data, error } = await supabase
        .from('whatsapp_flows')
        .update(update)
        .eq('id', id)
        .select(FLOW_SELECT)
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, flow: data, validation })
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { id } = await params
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: target } = await supabase
        .from('whatsapp_flows')
        .select('id, is_active')
        .eq('id', id)
        .maybeSingle()
    if (!target) return NextResponse.json({ error: 'Fluxo não encontrado' }, { status: 404 })
    if (target.is_active) {
        return NextResponse.json(
            { error: 'Não dá pra deletar o fluxo ativo. Ative outro fluxo antes.' },
            { status: 409 }
        )
    }

    // Nunca deixa zero fluxos — sempre precisa existir pelo menos 1
    const { count } = await supabase
        .from('whatsapp_flows')
        .select('id', { count: 'exact', head: true })
    if ((count ?? 0) <= 1) {
        return NextResponse.json(
            { error: 'Não dá pra deletar o último fluxo restante.' },
            { status: 409 }
        )
    }

    const { error } = await supabase.from('whatsapp_flows').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
}
