/**
 * /api/whatsapp/central/flow  (LEGADO — opera sobre o fluxo ATIVO)
 *
 *   GET    → devolve o grafo do fluxo ativo
 *   PUT    → salva o grafo no fluxo ativo
 *   DELETE → reseta o grafo do fluxo ativo para buildDefaultGraph()
 *
 * Mantido pra não quebrar UIs antigas. UIs novas devem usar
 * /api/whatsapp/central/flows e /flows/[id] (suporte a múltiplos fluxos).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import {
    buildDefaultGraph,
    validateGraph,
    type FlowGraphV2,
} from '@/lib/whatsapp-flow-engine'
import { loadActiveFlow } from '@/lib/whatsapp-flows'

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

async function getActiveFlowId(): Promise<string | null> {
    const supabase = getSupabase()
    const { data } = await supabase
        .from('whatsapp_flows')
        .select('id')
        .eq('is_active', true)
        .maybeSingle()
    return data?.id ?? null
}

export async function GET() {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const supabase = getSupabase()
    const graph = await loadActiveFlow(supabase)
    const validation = validateGraph(graph)
    return NextResponse.json({ graph, validation })
}

export async function PUT(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body: FlowGraphV2
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (body.version !== 2 || !Array.isArray(body.nodes) || !Array.isArray(body.edges) || !body.startId) {
        return NextResponse.json({ error: 'Formato de grafo inválido' }, { status: 400 })
    }

    const validation = validateGraph(body)
    if (!validation.valid) {
        return NextResponse.json({ error: 'Grafo inválido', validation }, { status: 422 })
    }

    const toStore: FlowGraphV2 = {
        version: 2,
        startId: body.startId,
        nodes: body.nodes,
        edges: body.edges,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.userId,
    }

    const supabase = getSupabase()
    const activeId = await getActiveFlowId()
    if (activeId) {
        const { error } = await supabase
            .from('whatsapp_flows')
            .update({ graph: toStore })
            .eq('id', activeId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
        // Sem fluxo ativo, cria o primeiro como "Padrão" e ativa.
        const { error } = await supabase
            .from('whatsapp_flows')
            .insert({ name: 'Padrão', graph: toStore, is_active: true, created_by: auth.userId })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, graph: toStore, validation })
}

export async function DELETE() {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const def = buildDefaultGraph()
    const toStore = { ...def, updatedAt: new Date().toISOString(), updatedBy: auth.userId }
    const supabase = getSupabase()

    const activeId = await getActiveFlowId()
    if (activeId) {
        const { error } = await supabase
            .from('whatsapp_flows')
            .update({ graph: toStore })
            .eq('id', activeId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
        const { error } = await supabase
            .from('whatsapp_flows')
            .insert({ name: 'Padrão', graph: toStore, is_active: true, created_by: auth.userId })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, graph: toStore })
}
