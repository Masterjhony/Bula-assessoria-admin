/**
 * /api/whatsapp/central/flows
 *   GET  → lista fluxos nomeados (com flag is_active)
 *   POST → cria novo fluxo:
 *            - { name, description?, clone_from? } — clona o grafo de outro
 *              fluxo se clone_from estiver presente, senão cria com grafo
 *              default (buildDefaultGraph()).
 *
 * Não ativa o fluxo recém-criado — a ativação é explícita via /:id/activate.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import {
    buildDefaultGraph,
    validateGraph,
    type FlowGraphV2,
} from '@/lib/whatsapp-flow-engine'

const FLOW_SELECT = 'id, name, description, is_active, created_at, updated_at, last_activated_at, settings, created_by'

export async function GET() {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
        .from('whatsapp_flows')
        .select(FLOW_SELECT)
        .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ flows: data ?? [] })
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body: { name?: string; description?: string | null; clone_from?: string | null }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    if (!body.name?.trim()) {
        return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Decide o grafo inicial: clone do indicado ou default em código
    let graph: FlowGraphV2 = buildDefaultGraph()
    if (body.clone_from) {
        const { data: source } = await supabase
            .from('whatsapp_flows')
            .select('graph')
            .eq('id', body.clone_from)
            .maybeSingle()
        if (source?.graph) graph = source.graph as FlowGraphV2
    }

    const validation = validateGraph(graph)
    if (!validation.valid) {
        return NextResponse.json(
            { error: 'Grafo inicial inválido', validation },
            { status: 400 }
        )
    }

    const { data, error } = await supabase
        .from('whatsapp_flows')
        .insert({
            name: body.name.trim(),
            description: body.description?.trim() || null,
            graph,
            is_active: false,
            created_by: auth.userId,
        })
        .select(FLOW_SELECT)
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, flow: data })
}
