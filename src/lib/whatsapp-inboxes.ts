/**
 * whatsapp_inboxes — caixas de atendimento (multi-inbox).
 *
 * Cada inbox é um número: a API oficial ('cloud') ou uma sessão Baileys no VPS
 * (o `id` do inbox É o sessionId no VPS). `channel` casa com
 * whatsapp_messages.channel (dimensão de transporte/anti-ban); `id`/`inbox_id`
 * é a dimensão de organização da conversa (conversa = inbox + telefone).
 *
 * Fonte única do mapeamento session↔inbox e do flag de automação, consumida por:
 *   - /api/whatsapp/inbound        (Baileys → resolve inbox pelo `session` do VPS)
 *   - /api/whatsapp/cloud/webhook  (sempre inbox 'cloud')
 *   - /api/whatsapp/central/*      (thread e lista escopadas por inbox)
 *   - /api/whatsapp/inboxes        (CRUD da UI)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const CLOUD_INBOX_ID = 'cloud'
/** Inbox/sessão default quando o chamador não informa uma (número histórico). */
export const DEFAULT_BAILEYS_INBOX_ID = 'joao'

export interface WhatsappInbox {
    id: string
    label: string
    kind: 'baileys' | 'cloud'
    phone: string | null
    channel: 'baileys' | 'cloud'
    status: string
    is_primary: boolean
    automations_enabled: boolean
    ativo: boolean
    ordem: number
}

const INBOX_COLS =
    'id, label, kind, phone, channel, status, is_primary, automations_enabled, ativo, ordem'

/** Carrega um inbox pelo id (= sessionId no VPS). Null se não existir. */
export async function loadInbox(
    supabase: SupabaseClient,
    id: string,
): Promise<WhatsappInbox | null> {
    if (!id) return null
    const { data } = await supabase
        .from('whatsapp_inboxes')
        .select(INBOX_COLS)
        .eq('id', id)
        .maybeSingle()
    return (data as WhatsappInbox) ?? null
}

/** Lista inboxes ordenados. `activeOnly` (default true) filtra os arquivados. */
export async function listInboxes(
    supabase: SupabaseClient,
    opts: { activeOnly?: boolean } = {},
): Promise<WhatsappInbox[]> {
    const activeOnly = opts.activeOnly ?? true
    let query = supabase.from('whatsapp_inboxes').select(INBOX_COLS).order('ordem', { ascending: true })
    if (activeOnly) query = query.eq('ativo', true)
    const { data } = await query
    return (data as WhatsappInbox[]) ?? []
}

/**
 * Resolve o inbox de uma inbound Baileys a partir do `session` que o VPS mandou.
 * Fallback para o inbox default quando o session vem vazio ou desconhecido —
 * assim uma inbound nunca fica órfã (aparece no inbox default).
 */
export async function resolveBaileysInbox(
    supabase: SupabaseClient,
    session: string | null | undefined,
): Promise<WhatsappInbox | null> {
    const id = (session || '').trim() || DEFAULT_BAILEYS_INBOX_ID
    return (await loadInbox(supabase, id)) ?? (await loadInbox(supabase, DEFAULT_BAILEYS_INBOX_ID))
}
