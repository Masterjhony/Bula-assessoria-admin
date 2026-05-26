/**
 * Carregamento de fluxos nomeados.
 *
 * Fonte da verdade: tabela `whatsapp_flows` (CRUD via /api/whatsapp/central/flows).
 * EXATAMENTE uma linha tem `is_active=true` por vez.
 *
 * Fallback em cascata (para transição suave e robustez):
 *   1. linha `whatsapp_flows` com is_active=true
 *   2. legacy `site_settings.whatsapp_flow_v2`
 *   3. `buildDefaultGraph()` (default em código)
 *
 * Consumidores: /api/whatsapp/inbound, /api/whatsapp/render-welcome.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildDefaultGraph, type FlowGraphV2 } from './whatsapp-flow-engine'
import type { FlowSettings } from './whatsapp-flow-settings'

function isValidGraph(v: unknown): v is FlowGraphV2 {
    if (!v || typeof v !== 'object') return false
    const g = v as Record<string, unknown>
    return g.version === 2 && Array.isArray(g.nodes) && Array.isArray(g.edges)
}

function asSettings(v: unknown): FlowSettings {
    if (!v || typeof v !== 'object') return {}
    return v as FlowSettings
}

/**
 * Retorna o grafo do fluxo ativo. Garante sempre devolver algo válido —
 * em caso de banco indisponível ou fluxo malformado, cai no default em código.
 */
export async function loadActiveFlow(supabase: SupabaseClient): Promise<FlowGraphV2> {
    // 1. Tabela whatsapp_flows
    const { data: row } = await supabase
        .from('whatsapp_flows')
        .select('graph')
        .eq('is_active', true)
        .maybeSingle()
    if (row && isValidGraph(row.graph) && (row.graph as FlowGraphV2).nodes.length > 0) {
        return row.graph as FlowGraphV2
    }

    // 2. Legacy site_settings.whatsapp_flow_v2
    const { data: legacy } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'whatsapp_flow_v2')
        .maybeSingle()
    if (legacy && isValidGraph(legacy.value)) {
        return legacy.value as FlowGraphV2
    }

    // 3. Default em código
    return buildDefaultGraph()
}

/**
 * Mesma cascata do loadActiveFlow + settings do fluxo ativo. Quando o ativo
 * vem do whatsapp_flows, lê settings da própria linha. Caso caia no legacy
 * ou no default em código, devolve settings={} (todo default).
 *
 * Use isso em handlers que precisam consultar parâmetros (horário permitido,
 * rate limit, etc.) sem fazer 2 queries.
 */
export async function loadActiveFlowWithSettings(
    supabase: SupabaseClient,
): Promise<{ graph: FlowGraphV2; settings: FlowSettings }> {
    const { data: row } = await supabase
        .from('whatsapp_flows')
        .select('graph, settings')
        .eq('is_active', true)
        .maybeSingle()
    if (row && isValidGraph(row.graph) && (row.graph as FlowGraphV2).nodes.length > 0) {
        return { graph: row.graph as FlowGraphV2, settings: asSettings(row.settings) }
    }

    const { data: legacy } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'whatsapp_flow_v2')
        .maybeSingle()
    if (legacy && isValidGraph(legacy.value)) {
        return { graph: legacy.value as FlowGraphV2, settings: {} }
    }

    return { graph: buildDefaultGraph(), settings: {} }
}

/** Carrega o fluxo por id (qualquer status). Usado pela aba Fluxo ao editar. */
export async function loadFlowById(supabase: SupabaseClient, id: string): Promise<FlowGraphV2 | null> {
    const { data } = await supabase
        .from('whatsapp_flows')
        .select('graph')
        .eq('id', id)
        .maybeSingle()
    if (!data) return null
    return isValidGraph(data.graph) ? (data.graph as FlowGraphV2) : null
}
