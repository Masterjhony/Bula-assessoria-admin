/**
 * Audience tags da Central WhatsApp.
 *
 * Algumas listas/campanhas seguem um fluxo de mensagens próprio (ex.: "Academia
 * do Nelore P.O" usa um menu institucional 1–6). O engine decide qual fluxo
 * aplicar olhando para `crm_leads.tags_whatsapp`. Para evitar classificações
 * erradas, sempre que uma campanha usar um template institucional precisamos
 * garantir que o lead esteja taggeado ANTES dele responder.
 *
 * Este módulo centraliza:
 *   - O mapeamento template-slug → audience tag (ex.: 'welcome-academia-nelore-po'
 *     → 'grupo_academia_nelore_po').
 *   - Helpers para aplicar/remover a tag em um conjunto de leads de forma
 *     idempotente (não duplica, não sobrescreve outras tags).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ACADEMIA_TAG, LISTA_MATHEUS_TAG } from './whatsapp-central'

/**
 * Slugs de templates que indicam que o lead pertence a uma audiência
 * institucional. Quando um envio (campanha ou manual) usa um destes slugs,
 * a tag correspondente é aplicada automaticamente ao(s) lead(s).
 *
 * Mantenha apenas slugs **iniciadores de fluxo** aqui (welcome/follow-up que
 * apresentam o menu da audiência). Templates intermediários (triagens,
 * confirmações) NÃO devem entrar — eles já dependem da tag estar marcada
 * para serem escolhidos pelo engine.
 */
export const TEMPLATE_AUDIENCE_TAG: Record<string, string> = {
    // Academia do Nelore P.O
    'welcome-academia-nelore-po': ACADEMIA_TAG,
    'follow-up-academia-24h':     ACADEMIA_TAG,
    'follow-up-academia-final':   ACADEMIA_TAG,
    // Welcome institucional do Matheus (apresentação + menu numérico 1..6)
    'welcome-matheus-institucional': LISTA_MATHEUS_TAG,
}

/** Audience tags reconhecidas pelo sistema (whitelist para o lead-action manual). */
export const KNOWN_AUDIENCE_TAGS: ReadonlySet<string> = new Set([ACADEMIA_TAG, LISTA_MATHEUS_TAG])

export function audienceTagForTemplateSlug(slug: string | null | undefined): string | null {
    if (!slug) return null
    return TEMPLATE_AUDIENCE_TAG[slug] ?? null
}

/**
 * Aplica a tag em todos os leads informados que ainda não a possuem.
 * Lê primeiro para não fazer write desnecessário e preservar o jsonb completo.
 * Idempotente.
 */
export async function ensureLeadsHaveTag(
    supabase: SupabaseClient,
    leadIds: string[],
    tag: string,
): Promise<{ updated: number }> {
    if (leadIds.length === 0 || !tag) return { updated: 0 }

    const ids = Array.from(new Set(leadIds.filter(Boolean)))
    const { data, error } = await supabase
        .from('crm_leads')
        .select('id, tags_whatsapp')
        .in('id', ids)
    if (error) throw new Error(error.message)

    const toUpdate: Array<{ id: string; tags: string[] }> = []
    for (const row of data ?? []) {
        const current = Array.isArray(row.tags_whatsapp) ? (row.tags_whatsapp as string[]) : []
        if (current.includes(tag)) continue
        toUpdate.push({ id: row.id as string, tags: [...current, tag] })
    }
    if (toUpdate.length === 0) return { updated: 0 }

    // Updates em paralelo. Mantemos preciso por id (sem upsert em massa) para
    // não corrermos risco de sobrescrever tags concorrentes adicionadas entre
    // o select e o update.
    await Promise.all(toUpdate.map(u =>
        supabase.from('crm_leads').update({ tags_whatsapp: u.tags }).eq('id', u.id)
    ))
    return { updated: toUpdate.length }
}

/**
 * Remove a tag de todos os leads informados (preserva as demais tags).
 * Idempotente.
 */
export async function removeTagFromLeads(
    supabase: SupabaseClient,
    leadIds: string[],
    tag: string,
): Promise<{ updated: number }> {
    if (leadIds.length === 0 || !tag) return { updated: 0 }

    const ids = Array.from(new Set(leadIds.filter(Boolean)))
    const { data, error } = await supabase
        .from('crm_leads')
        .select('id, tags_whatsapp')
        .in('id', ids)
    if (error) throw new Error(error.message)

    const toUpdate: Array<{ id: string; tags: string[] }> = []
    for (const row of data ?? []) {
        const current = Array.isArray(row.tags_whatsapp) ? (row.tags_whatsapp as string[]) : []
        if (!current.includes(tag)) continue
        toUpdate.push({ id: row.id as string, tags: current.filter(t => t !== tag) })
    }
    if (toUpdate.length === 0) return { updated: 0 }

    await Promise.all(toUpdate.map(u =>
        supabase.from('crm_leads').update({ tags_whatsapp: u.tags }).eq('id', u.id)
    ))
    return { updated: toUpdate.length }
}

/**
 * Atalho conveniente: dado um slug de template iniciador de fluxo, garante que
 * todos os leads informados carreguem a tag correspondente. Se o slug não tem
 * tag mapeada, é no-op.
 */
export async function ensureAudienceTagForTemplate(
    supabase: SupabaseClient,
    leadIds: string[],
    templateSlug: string | null | undefined,
): Promise<{ tag: string | null; updated: number }> {
    const tag = audienceTagForTemplateSlug(templateSlug)
    if (!tag) return { tag: null, updated: 0 }
    const res = await ensureLeadsHaveTag(supabase, leadIds, tag)
    return { tag, updated: res.updated }
}
