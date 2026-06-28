/**
 * Pipeline de processamento de mensagem recebida (inbound), compartilhado por:
 *   - /api/whatsapp/inbound        (Baileys / VPS — devolve a resposta ao VPS)
 *   - /api/whatsapp/cloud/webhook  (API oficial — envia a resposta pela Cloud)
 *
 * O pipeline é idêntico nos dois canais: encontra/cria o lead, registra a
 * inbound, reage a respostas de campanha, respeita pausa global e horário, e
 * roda o grafo do fluxo. A diferença é só QUEM entrega a resposta — por isso
 * `processInboundMessage` apenas DECIDE a resposta; o caller a transporta.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneVariants, classifyMessage } from './whatsapp-central'
import { runFlow, type LeadShape } from './whatsapp-flow-engine'
import { readPauseState } from './whatsapp-pause'
import { handleCampaignReply } from './whatsapp-campaign-reply'
import { loadActiveFlowWithSettings } from './whatsapp-flows'
import { isWithinAllowedHours } from './whatsapp-flow-settings'
import { loadConciergeConfig, runConcierge } from './whatsapp-concierge'
import { CRM_STAGE_ENTRY } from './crm-types'

const LEAD_FIELDS =
    'id, nome, telefone, interesse_principal, handoff_humano, handoff_at, optout_whatsapp, contact_history, contact_count, tags_whatsapp, stage, status, notes'

export async function findLeadByPhone(
    supabase: SupabaseClient,
    phone: string,
): Promise<LeadShape | null> {
    const variants = phoneVariants(phone)
    if (variants.length === 0) return null
    const { data } = await supabase
        .from('crm_leads')
        .select(LEAD_FIELDS)
        .in('telefone', variants)
        .order('created_at', { ascending: false })
        .limit(1)
    return (data?.[0] as LeadShape) ?? null
}

export async function createLeadFromInbound(
    supabase: SupabaseClient,
    phone: string,
    name: string,
    origin = 'whatsapp-central',
): Promise<LeadShape | null> {
    const { data: maxPos } = await supabase
        .from('crm_leads')
        .select('position')
        .order('position', { ascending: false })
        .limit(1)
    const position = (maxPos?.[0]?.position ?? 0) + 1000

    const { data: lead, error } = await supabase
        .from('crm_leads')
        .insert({
            nome: name || phone,
            telefone: phone,
            origem: origin,
            stage: 'novo',
            status: CRM_STAGE_ENTRY,
            source: 'whatsapp',
            medium: 'inbound',
            campaign: 'central-whatsapp',
            position,
            last_whatsapp_at: new Date().toISOString(),
        })
        .select(LEAD_FIELDS)
        .single()

    if (error) {
        console.error('[Inbound] Erro ao criar lead:', error)
        return null
    }
    return lead as LeadShape
}

/** Bucket privado do Supabase Storage onde mora a mídia inbound do WhatsApp. */
export const WHATSAPP_MEDIA_BUCKET = 'whatsapp-media'

export interface InboundMedia {
    /** Path no bucket whatsapp-media (resolvido em signed URL na hora de exibir). */
    url: string | null
    type: 'audio' | 'image' | 'video' | 'document'
    mime?: string | null
    filename?: string | null
    /** ID da midia no payload da Meta (audio.id/image.id/etc.), usado em recovery. */
    metaId?: string | null
    ingestError?: string | null
    ingestedAt?: string | null
}

export function logInbound(
    supabase: SupabaseClient,
    args: {
        phone: string; name: string; body: string; lead_id: string | null
        message_id?: string | null; channel?: string | null; media?: InboundMedia | null
    },
) {
    void supabase
        .from('whatsapp_messages')
        .insert({
            phone: args.phone,
            name: args.name,
            status: 'received',
            body: args.body,
            direction: 'inbound',
            origin: 'central-inbound',
            channel: args.channel ?? null,
            reason: args.message_id ?? null,
            lead_id: args.lead_id,
            media_url: args.media?.url ?? null,
            media_type: args.media?.type ?? null,
            media_mime: args.media?.mime ?? null,
            media_filename: args.media?.filename ?? null,
            media_meta_id: args.media?.metaId ?? null,
            media_ingest_error: args.media?.ingestError ?? null,
            media_ingested_at: args.media?.ingestedAt ?? null,
        })
        .then(({ error }) => {
            if (error) console.warn('[Inbound] log inbound:', error.message)
        })
}

/**
 * Verifica se uma inbound com este `message_id` (wamid da Meta) já foi
 * registrada — protege contra reentrega do webhook (a Meta reenvia em caso de
 * timeout/erro). Sem message_id, não há como deduplicar: retorna false.
 */
export async function inboundAlreadyProcessed(
    supabase: SupabaseClient,
    messageId: string | null | undefined,
): Promise<boolean> {
    if (!messageId) return false
    const { data } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('direction', 'inbound')
        .eq('reason', messageId)
        .limit(1)
    return !!data?.length
}

export type InboundOutcome =
    | { kind: 'silent'; reason: string; lead: LeadShape | null }
    | { kind: 'reply'; reply: string; bot_step?: string; lead: LeadShape | null }

/**
 * Processa uma mensagem recebida e DECIDE a resposta (sem entregá-la). O caller
 * é quem envia: o VPS no caso do Baileys, a Cloud API no caso do webhook oficial.
 */
export async function processInboundMessage(
    supabase: SupabaseClient,
    input: {
        phone: string; senderName?: string; text: string
        messageId?: string | null; channel?: string | null; media?: InboundMedia | null
    },
): Promise<InboundOutcome> {
    const { phone, text } = input
    const senderName = (input.senderName || '').trim()

    let lead = await findLeadByPhone(supabase, phone)
    if (!lead) {
        lead = await createLeadFromInbound(supabase, phone, senderName)
    }

    // Registra a inbound (sempre, mesmo se cair em silêncio)
    logInbound(supabase, {
        phone,
        name: senderName || lead?.nome || phone,
        body: text,
        lead_id: lead?.id ?? null,
        message_id: input.messageId ?? null,
        channel: input.channel ?? null,
        media: input.media ?? null,
    })

    if (lead) {
        void supabase
            .from('crm_leads')
            .update({ last_whatsapp_at: new Date().toISOString() })
            .eq('id', lead.id)

        // Reação à resposta de campanha (fire-and-forget). Marca replied_at em
        // recipients ativos do lead, aplica reply_tag e reply_handoff.
        void handleCampaignReply(supabase, lead.id).catch(err =>
            console.warn('[Inbound] handleCampaignReply falhou:', err instanceof Error ? err.message : err),
        )
    }

    // Pausa global: segue logando a inbound, mas nenhum fluxo automatizado roda.
    const pause = await readPauseState(supabase)
    if (pause.paused) {
        return { kind: 'silent', reason: 'paused', lead }
    }

    const { graph, settings } = await loadActiveFlowWithSettings(supabase)

    // Fora do horário permitido (no fuso do fluxo) logamos mas não respondemos.
    if (!isWithinAllowedHours(settings)) {
        return { kind: 'silent', reason: 'outside_allowed_hours', lead }
    }

    // ── Concierge de qualificação (IA) — LINHA ÚNICA de automação ────────────
    // Quando ligado no cockpit, a IA é a *única* automação que conversa com o
    // lead: o grafo legado (keyword→triagem, menu de interesses, etc.) NÃO roda
    // junto, para não enviar mensagem duplicada/desorganizada. Exceções que
    // permanecem por serem compliance, não marketing:
    //   • opt-out determinístico ("parar"/"sair") → tratado pelo grafo;
    //   • lead já em handoff humano ou opt-out → ninguém automatiza (humano trata).
    const conciergeConfig = await loadConciergeConfig(supabase)
    const isOptoutMsg = classifyMessage(text, { tags: lead?.tags_whatsapp ?? [] }).kind === 'optout'

    if (conciergeConfig.enabled) {
        // Opt-out segue pelo grafo (lane de opt-out). Demais casos: só a IA.
        if (lead && !lead.optout_whatsapp && !lead.handoff_humano && !isOptoutMsg) {
            const c = await runConcierge(supabase, {
                lead, phone, senderName, text, media: input.media ?? null, config: conciergeConfig,
            })
            if (c.handled && !c.silent) {
                return { kind: 'reply', reply: c.reply, bot_step: c.botStep, lead }
            }
            // Silêncio (resposta vazia/opt-out) OU IA indisponível (sem chave/erro):
            // NÃO caímos no grafo legado — mantemos uma linha só. Welcome (novo
            // lead) e opt-out seguem nos seus próprios caminhos.
            return { kind: 'silent', reason: c.handled ? `concierge_${c.reason}` : `concierge_unhandled_${c.reason}`, lead }
        }
        // opt-out / handoff / opt-out msg: deixa o grafo cuidar do opt-out;
        // handoff já cai em silêncio nas lanes do grafo.
    }

    const result = await runFlow(graph, { phone, senderName, text, lead })
    if ('silent' in result) {
        return { kind: 'silent', reason: result.reason, lead }
    }
    return { kind: 'reply', reply: result.reply, bot_step: result.bot_step, lead }
}
