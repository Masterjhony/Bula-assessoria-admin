/**
 * Reação à resposta de campanha — chamado pelo /api/whatsapp/inbound quando
 * uma inbound chega de um lead que tem recipients ativos em alguma campanha.
 *
 * Efeitos:
 *   - Marca `replied_at = now()` em todos os recipients ativos do lead
 *     (status sem stopped_at). Idempotente: replied_at é definido apenas uma
 *     vez por recipient.
 *   - Para cada campanha distinta cuja regra `reply_tag` é não-nula, aplica
 *     a tag em crm_leads.tags_whatsapp.
 *   - Se a campanha tem `reply_handoff=true`, força handoff_humano=true no
 *     lead — operador conduz pelo Inbox dali em diante.
 *
 * NÃO para a sequência diretamente — quem para é o cron, na próxima rodada,
 * via `decideStop(campaign, recipient, lead)`. Manter essa responsabilidade
 * num só lugar evita race condition (replied_at gravado mas próximo step já
 * enviado entre o update e a chamada do cron).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function handleCampaignReply(
    supabase: SupabaseClient,
    leadId: string,
): Promise<{ marked: number; tagsApplied: string[]; handoffApplied: boolean }> {
    // Carrega recipients ativos do lead em todas as campanhas
    const { data: recipientsRaw } = await supabase
        .from('whatsapp_campaign_recipients')
        .select('id, campaign_id, replied_at')
        .eq('lead_id', leadId)
        .is('stopped_at', null)

    const recipients = (recipientsRaw ?? []) as Array<{
        id: string
        campaign_id: string
        replied_at: string | null
    }>
    if (recipients.length === 0) {
        return { marked: 0, tagsApplied: [], handoffApplied: false }
    }

    // Marca replied_at nos que ainda não tinham — idempotente
    const now = new Date().toISOString()
    const toMark = recipients.filter(r => !r.replied_at).map(r => r.id)
    if (toMark.length > 0) {
        await supabase
            .from('whatsapp_campaign_recipients')
            .update({ replied_at: now })
            .in('id', toMark)
    }

    // Carrega as campanhas envolvidas pra aplicar reply_tag / reply_handoff
    const campaignIds = [...new Set(recipients.map(r => r.campaign_id))]
    const { data: campsRaw } = await supabase
        .from('whatsapp_campaigns')
        .select('id, reply_tag, reply_handoff')
        .in('id', campaignIds)
    const camps = (campsRaw ?? []) as Array<{
        id: string
        reply_tag: string | null
        reply_handoff: boolean
    }>

    const tagsToAdd = new Set<string>()
    let needsHandoff = false
    for (const c of camps) {
        if (c.reply_tag) tagsToAdd.add(c.reply_tag)
        if (c.reply_handoff) needsHandoff = true
    }

    if (tagsToAdd.size > 0 || needsHandoff) {
        // Lê o estado atual do lead pra mesclar tags sem sobrescrever
        const { data: leadRow } = await supabase
            .from('crm_leads')
            .select('tags_whatsapp, handoff_humano')
            .eq('id', leadId)
            .single()
        const currentTags = new Set<string>(
            Array.isArray(leadRow?.tags_whatsapp) ? leadRow.tags_whatsapp : []
        )
        for (const t of tagsToAdd) currentTags.add(t)

        const update: Record<string, unknown> = {
            tags_whatsapp: [...currentTags],
        }
        if (needsHandoff && !leadRow?.handoff_humano) {
            update.handoff_humano = true
            update.handoff_at = now
        }
        await supabase.from('crm_leads').update(update).eq('id', leadId)
    }

    return {
        marked: toMark.length,
        tagsApplied: [...tagsToAdd],
        handoffApplied: needsHandoff,
    }
}
