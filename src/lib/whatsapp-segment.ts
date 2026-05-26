/**
 * Resolve um segmento JSON em uma query Supabase contra `crm_leads`.
 * Sempre aplica:
 *   - telefone IS NOT NULL e não vazio
 *   - optout_whatsapp = false (compliance — opt-out NUNCA recebe campanha)
 *
 * Filtros suportados em `segment`:
 *   interesse_principal: string | string[]
 *   stage: string | string[]
 *   status: string | string[]
 *   has_phone: true (default — sempre)
 *   tags_whatsapp_includes: string  (procura na coluna jsonb)
 *   updated_after: ISO date         (leads modificados depois de X)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface SegmentFilters {
    interesse_principal?: string | string[]
    stage?: string | string[]
    status?: string | string[]
    has_phone?: boolean
    tags_whatsapp_includes?: string
    updated_after?: string
}

export async function resolveSegment(
    supabase: SupabaseClient,
    segment: SegmentFilters
): Promise<Array<{ id: string; nome: string; telefone: string }>> {
    let q = supabase
        .from('crm_leads')
        .select('id, nome, telefone, tags_whatsapp')
        .eq('optout_whatsapp', false)
        .not('telefone', 'is', null)
        .neq('telefone', '')

    if (segment.interesse_principal) {
        if (Array.isArray(segment.interesse_principal)) {
            q = q.in('interesse_principal', segment.interesse_principal)
        } else {
            q = q.eq('interesse_principal', segment.interesse_principal)
        }
    }
    if (segment.stage) {
        if (Array.isArray(segment.stage)) q = q.in('stage', segment.stage)
        else q = q.eq('stage', segment.stage)
    }
    if (segment.status) {
        if (Array.isArray(segment.status)) q = q.in('status', segment.status)
        else q = q.eq('status', segment.status)
    }
    if (segment.updated_after) {
        q = q.gte('updated_at', segment.updated_after)
    }

    const { data, error } = await q.limit(2000)
    if (error) throw new Error(error.message)

    let rows = (data ?? []) as Array<{ id: string; nome: string; telefone: string; tags_whatsapp: string[] | null }>

    if (segment.tags_whatsapp_includes) {
        const tag = segment.tags_whatsapp_includes
        rows = rows.filter(r => Array.isArray(r.tags_whatsapp) && r.tags_whatsapp.includes(tag))
    }

    // Dedup por telefone — algum lead histórico pode ter sido cadastrado mais de uma vez
    const seen = new Set<string>()
    const out: Array<{ id: string; nome: string; telefone: string }> = []
    for (const r of rows) {
        if (!r.telefone || seen.has(r.telefone)) continue
        seen.add(r.telefone)
        out.push({ id: r.id, nome: r.nome, telefone: r.telefone })
    }
    return out
}
