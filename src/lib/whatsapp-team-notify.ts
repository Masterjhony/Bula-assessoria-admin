/**
 * Aviso interno da equipe no WhatsApp (grupo via Baileys).
 *
 * Usado pelas automações do funil para avisar a equipe quando algo relevante
 * acontece sem humano no loop — ex.: lead completou a habilitação pela IA,
 * cliente aprovado teve o cadastro enviado às leiloeiras.
 *
 * Canal: Baileys de propósito — é comunicação INTERNA (grupo da equipe), o
 * papel certo do número não-oficial na arquitetura (a API oficial fica para o
 * cliente). O grupo é configurado no cockpit (site_settings.crm_concierge →
 * notifyGroupId). Sem grupo configurado, vira no-op. Sempre best-effort:
 * nunca derruba a automação que chamou.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendVpsGroup } from './whatsapp-vps'

/** Mesmo registro do concierge (evita import circular com whatsapp-concierge). */
const CONFIG_KEY = 'crm_concierge'

async function loadNotifyGroupId(supabase: SupabaseClient): Promise<string> {
    const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', CONFIG_KEY)
        .maybeSingle()
    const raw = (data?.value ?? {}) as { notifyGroupId?: unknown }
    return typeof raw.notifyGroupId === 'string' ? raw.notifyGroupId.trim() : ''
}

export interface TeamNotifyResult {
    sent: boolean
    reason?: string
}

/**
 * Envia uma mensagem ao grupo interno configurado. Best-effort: retorna
 * `{sent:false, reason}` em vez de lançar.
 */
export async function notifyTeamGroup(
    supabase: SupabaseClient,
    message: string,
): Promise<TeamNotifyResult> {
    const text = (message || '').trim()
    if (!text) return { sent: false, reason: 'empty_message' }
    try {
        const groupId = await loadNotifyGroupId(supabase)
        if (!groupId) return { sent: false, reason: 'no_group_configured' }
        const r = await sendVpsGroup(groupId, text)
        if (r.queued) return { sent: true }
        return { sent: false, reason: r.error || 'vps_error' }
    } catch (e) {
        return { sent: false, reason: e instanceof Error ? e.message : 'erro' }
    }
}
