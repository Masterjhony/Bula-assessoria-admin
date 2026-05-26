/**
 * /api/whatsapp/central/flows/[id]/activate
 *   POST → torna esse fluxo o único ativo. Desativa qualquer outro ativo.
 *
 * Operação em 2 passos para respeitar a constraint UNIQUE (is_active=true).
 * Não é transação ideal (Supabase JS não expõe transações), mas o intervalo
 * entre desativar e ativar é milisegundos — o índice parcial UNIQUE garante
 * que mesmo se houver concorrência, o pior caso é um erro 23505 visível.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { validateGraph, type FlowGraphV2 } from '@/lib/whatsapp-flow-engine'

export async function POST(
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

    // Valida que o fluxo existe e tem grafo executável antes de ativar — não
    // queremos colocar um grafo quebrado em produção e parar o bot.
    const { data: target } = await supabase
        .from('whatsapp_flows')
        .select('id, graph, is_active')
        .eq('id', id)
        .maybeSingle()
    if (!target) return NextResponse.json({ error: 'Fluxo não encontrado' }, { status: 404 })

    if (target.is_active) {
        return NextResponse.json({ success: true, already_active: true })
    }

    const validation = validateGraph(target.graph as FlowGraphV2)
    if (!validation.valid) {
        return NextResponse.json(
            { error: 'Grafo do fluxo é inválido — corrija antes de ativar', validation },
            { status: 400 }
        )
    }

    // 1) desativa o atual ativo (se houver)
    const { error: deErr } = await supabase
        .from('whatsapp_flows')
        .update({ is_active: false })
        .eq('is_active', true)
    if (deErr) return NextResponse.json({ error: deErr.message }, { status: 500 })

    // 2) ativa o novo e marca timestamp de ativação (pra histórico/rollback)
    const { error: actErr } = await supabase
        .from('whatsapp_flows')
        .update({ is_active: true, last_activated_at: new Date().toISOString() })
        .eq('id', id)
    if (actErr) return NextResponse.json({ error: actErr.message }, { status: 500 })

    return NextResponse.json({ success: true, validation })
}
