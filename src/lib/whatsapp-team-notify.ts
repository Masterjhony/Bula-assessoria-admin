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

async function loadGroupId(
    supabase: SupabaseClient,
    field: 'notifyGroupId' | 'assessoresGroupId',
): Promise<string> {
    const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', CONFIG_KEY)
        .maybeSingle()
    const raw = (data?.value ?? {}) as Record<string, unknown>
    const v = raw[field]
    return typeof v === 'string' ? v.trim() : ''
}

export interface TeamNotifyResult {
    sent: boolean
    reason?: string
}

async function sendToGroup(groupId: string, message: string): Promise<TeamNotifyResult> {
    const text = (message || '').trim()
    if (!text) return { sent: false, reason: 'empty_message' }
    if (!groupId) return { sent: false, reason: 'no_group_configured' }
    try {
        const r = await sendVpsGroup(groupId, text)
        if (r.queued) return { sent: true }
        return { sent: false, reason: r.error || 'vps_error' }
    } catch (e) {
        return { sent: false, reason: e instanceof Error ? e.message : 'erro' }
    }
}

/**
 * Envia ao grupo interno de automações/notificações (site_settings →
 * crm_concierge.notifyGroupId). Best-effort: retorna `{sent:false, reason}`.
 */
export async function notifyTeamGroup(
    supabase: SupabaseClient,
    message: string,
): Promise<TeamNotifyResult> {
    return sendToGroup(await loadGroupId(supabase, 'notifyGroupId'), message)
}

/**
 * Envia ao grupo dos ASSESSORES (site_settings → crm_concierge.assessoresGroupId).
 * É onde a equipe comercial acompanha os cadastros aprovados e pega o cliente
 * habilitado para dar sequência — separado do grupo de automações (log do
 * sistema). Sem `assessoresGroupId` configurado, vira no-op silencioso.
 */
export async function notifyAssessoresGroup(
    supabase: SupabaseClient,
    message: string,
): Promise<TeamNotifyResult> {
    return sendToGroup(await loadGroupId(supabase, 'assessoresGroupId'), message)
}
