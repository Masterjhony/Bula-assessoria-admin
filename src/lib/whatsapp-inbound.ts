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
import { phoneVariants } from './whatsapp-central'
import { runFlow, type LeadShape } from './whatsapp-flow-engine'
import { readPauseState } from './whatsapp-pause'
import { handleCampaignReply } from './whatsapp-campaign-reply'
import { loadActiveFlowWithSettings } from './whatsapp-flows'
import { isWithinAllowedHours } from './whatsapp-flow-settings'
import { loadConciergeConfig, runConcierge } from './whatsapp-concierge'
import { transcribeAudioOpenRouter } from './openrouter'
import { CRM_STAGE_ENTRY } from './crm-types'

const LEAD_FIELDS =
    'id, nome, telefone, interesse_principal, handoff_humano, handoff_at, optout_whatsapp, contact_history, contact_count, tags_whatsapp, stage, status, notes'

export async function findLeadByPhone(
    supabase: SupabaseClient,
    phone: string,
): Promise<LeadShape | null> {
    const variants = phoneVariants(phone)
    if (variants.length === 0) return null
    // Casa por telefone OU celular (leads de campanha/planilha gravam o número
    // em celular; só telefone deixava a conversa órfã e criava lead duplicado).
    const list = `(${variants.map(v => `"${v}"`).join(',')})`
    const { data } = await supabase
        .from('crm_leads')
        .select(LEAD_FIELDS)
        .or(`telefone.in.${list},celular.in.${list}`)
        .order('created_at', { ascending: true })
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

/**
 * Transcreve o áudio inbound (baixa do bucket whatsapp-media e manda pro modelo
 * multimodal via OpenRouter). Best-effort: retorna null em qualquer erro — o
 * inbound segue sem transcrição (lead fica "aguardando", como antes).
 */
async function transcribeInboundAudio(
    supabase: SupabaseClient,
    media: InboundMedia,
): Promise<string | null> {
    if (!media.url) return null
    try {
        const { data, error } = await supabase.storage.from(WHATSAPP_MEDIA_BUCKET).download(media.url)
        if (error || !data) return null
        const buf = Buffer.from(await data.arrayBuffer())
        const mime = (media.mime || '').toLowerCase()
        const format = mime.includes('ogg') ? 'ogg'
            : (mime.includes('mpeg') || mime.includes('mp3')) ? 'mp3'
            : mime.includes('wav') ? 'wav'
            : 'ogg'
        const text = await transcribeAudioOpenRouter(buf.toString('base64'), format, {
            signal: AbortSignal.timeout(30000),
        })
        return text || null
    } catch (e) {
        console.warn('[Inbound] transcrição de áudio falhou:', e instanceof Error ? e.message : e)
        return null
    }
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

/**
 * Esta inbound (wamid) ainda é a mais recente deste número? Usada pela janela de
 * "pensar" do concierge: se chegou mensagem mais nova durante a espera, a atual
 * é descartada para que só a última responda. Sem messageId (ex.: Baileys), não
 * há como comparar → assume que sim (responde).
 */
async function isLatestInbound(
    supabase: SupabaseClient,
    phone: string,
    messageId: string | null,
): Promise<boolean> {
    if (!messageId) return true
    const variants = phoneVariants(phone)
    if (variants.length === 0) return true
    const { data } = await supabase
        .from('whatsapp_messages')
        .select('reason')
        .in('phone', variants)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
    const latestWamid = data?.[0]?.reason
    // Se a última inbound registrada é esta mesma (ou não há wamid p/ comparar),
    // seguimos. Caso contrário, uma mais nova chegou → descartamos esta.
    return !latestWamid || latestWamid === messageId
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
    const { phone } = input
    const senderName = (input.senderName || '').trim()
    let text = input.text || ''

    // Áudio → a IA só entende texto: transcreve e usa como a mensagem. Assim o
    // log (inbox) e o concierge recebem o conteúdo falado em vez de "[áudio]".
    if (input.media?.type === 'audio') {
        const transcript = await transcribeInboundAudio(supabase, input.media)
        if (transcript) text = transcript
    }

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
    // junto, para não enviar mensagem duplicada/desorganizada. Inclusive o
    // OPT-OUT é decisão da IA (pelo contexto da conversa), não de keyword —
    // o classificador determinístico marcava falso positivo demais ("vou sair
    // pra fazenda" → opt-out). A única exceção: lead já em handoff humano ou
    // opt-out → ninguém automatiza (humano trata; "voltar" reativa pelo grafo).
    const conciergeConfig = await loadConciergeConfig(supabase)

    if (conciergeConfig.enabled) {
        if (lead && !lead.optout_whatsapp && !lead.handoff_humano) {
            // Janela de "pensar": espera um tempo antes de responder pra agrupar
            // mensagens enviadas em sequência. Se durante a espera chegar uma
            // inbound mais nova deste número, esta é descartada (a mais nova
            // responde por todas, com o histórico completo) — evita responder a
            // cada balão e deixa a resposta mais assertiva.
            const waitMs = Math.max(0, (conciergeConfig.thinkingSeconds ?? 0) * 1000)
            if (waitMs > 0) {
                await new Promise(r => setTimeout(r, waitMs))
                if (!(await isLatestInbound(supabase, phone, input.messageId ?? null))) {
                    return { kind: 'silent', reason: 'concierge_debounced', lead }
                }
            }
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
        // Lead já em opt-out / handoff: cai no grafo, que trata "voltar"
        // (resubscribe) e mantém silêncio no resto.
    }

    const result = await runFlow(graph, { phone, senderName, text, lead })
    if ('silent' in result) {
        return { kind: 'silent', reason: result.reason, lead }
    }
    return { kind: 'reply', reply: result.reply, bot_step: result.bot_step, lead }
}
