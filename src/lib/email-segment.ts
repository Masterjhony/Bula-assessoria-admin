/**
 * Resolve um segmento JSON em uma query Supabase contra `crm_leads`.
 * Sempre aplica:
 *   - email IS NOT NULL e não vazio (espelha "has_phone" do WhatsApp)
 *   - email contém '@' (validação básica)
 *   - optout_email = false (compliance — opt-out NUNCA recebe campanha)
 *
 * Filtros suportados em `segment` (mesmo padrão do whatsapp-segment):
 *   interesse_principal: string | string[]
 *   stage: string | string[]
 *   status: string | string[]
 *   tags_whatsapp_includes: string  (filtro JSONB pós-query)
 *   updated_after: ISO date
 *   has_optout_whatsapp: boolean — true inclui só leads em opt-out WhatsApp
 *     (útil pra "alcançar quem optou-out do whatsapp por outro canal")
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface EmailSegmentFilters {
    interesse_principal?: string | string[]
    stage?: string | string[]
    status?: string | string[]
    tags_whatsapp_includes?: string
    updated_after?: string
    has_optout_whatsapp?: boolean
}

export async function resolveEmailSegment(
    supabase: SupabaseClient,
    segment: EmailSegmentFilters,
): Promise<Array<{ id: string; nome: string; email: string }>> {
    let q = supabase
        .from('crm_leads')
        .select('id, nome, email, tags_whatsapp')
        .eq('optout_email', false)
        .not('email', 'is', null)
        .neq('email', '')
        .like('email', '%@%')

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
    if (typeof segment.has_optout_whatsapp === 'boolean') {
        q = q.eq('optout_whatsapp', segment.has_optout_whatsapp)
    }

    const { data, error } = await q.limit(2000)
    if (error) throw new Error(error.message)

    let rows = (data ?? []) as Array<{
        id: string
        nome: string
        email: string
        tags_whatsapp: string[] | null
    }>

    if (segment.tags_whatsapp_includes) {
        const tag = segment.tags_whatsapp_includes
        rows = rows.filter(r => Array.isArray(r.tags_whatsapp) && r.tags_whatsapp.includes(tag))
    }

    // Dedup por e-mail
    const seen = new Set<string>()
    const out: Array<{ id: string; nome: string; email: string }> = []
    for (const r of rows) {
        const e = (r.email ?? '').trim().toLowerCase()
        if (!e || seen.has(e)) continue
        seen.add(e)
        out.push({ id: r.id, nome: r.nome, email: e })
    }
    return out
}
