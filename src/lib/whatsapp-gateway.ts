/**
 * WhatsApp Dispatch Gateway — ponto único de saída de mensagens.
 *
 * Todo envio do sistema (resposta do CRM, notificação de assessor, campanha,
 * bot) deve passar por `sendOutbound`. O gateway:
 *   1. normaliza o telefone
 *   2. checa opt-out
 *   3. resolve o canal pela política (Baileys quente / Cloud frio-massa)
 *   4. aplica guard rails anti-ban (cap diário, horário, dedup)
 *   5. entrega ao transporte (Baileys VPS ou Cloud API)
 *   6. loga em whatsapp_messages com channel/intent
 *   7. incrementa o contador diário do canal
 *
 * Política de canal (intent → canal):
 *   broadcast/campaign → SEMPRE Cloud (massa nunca vai pro Baileys, anti-ban)
 *   assessor           → Baileys (interno, número conhecido, transacional)
 *   crm_reply/bot      → Baileys se a janela de 24h está aberta; senão exige
 *                        template e vai pela Cloud
 *
 * Guard rails por intent:
 *   opt-out:        todos, exceto assessor (interno)
 *   horário:        broadcast, campaign, bot (fluxos não iniciados por humano)
 *   cap diário:     broadcast, campaign (bloqueia); demais só contabilizam
 *   dedup:          broadcast, campaign
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone, phoneVariants } from './whatsapp-central'
import { isWithinAllowedHours } from './whatsapp-flow-settings'
import {
    loadGuardrails,
    isOptedOut,
    effectiveDailyCap,
    dailyCount,
    incrementDailyCount,
    recentlyMessaged,
    type GuardrailsConfig,
    type GuardChannel,
} from './whatsapp-guardrails'
import { isWhatsappCloudApiConfigured, sendSingleViaCloudApi } from './whatsapp-cloud-api'
import { WHATSAPP_SERVER_URL, vpsHeaders } from './whatsapp-vps'

export type OutboundIntent = 'crm_reply' | 'assessor' | 'campaign' | 'bot' | 'broadcast'
export type Channel = GuardChannel

// Inbox default para envios Baileys sem inbox explícito (assessor, campanha,
// fallback). Casa com o seed 'joao' de whatsapp_inboxes e a sessão default do VPS.
const DEFAULT_BAILEYS_INBOX = 'joao'

/** inbox_id a gravar no log: explícito do request, ou derivado do canal resolvido. */
function resolveInboxId(inboxId: string | null | undefined, channel: Channel | null): string | null {
    if (inboxId) return inboxId
    if (channel === 'cloud') return 'cloud'
    if (channel === 'baileys') return DEFAULT_BAILEYS_INBOX
    return null
}

export interface OutboundRequest {
    to: { phone: string; leadId?: string | null; name?: string | null }
    /** Corpo texto. Obrigatório quando não é envio por template. */
    text?: string | null
    /** Nome do template Meta (envio Cloud para contato frio). */
    templateName?: string | null
    templateLanguage?: string | null
    /** Valores das variáveis do corpo do template ({{1}}…). Quando informado,
     *  `text` pode ser o corpo já renderizado (para log/cockpit) sem afetar o
     *  que a Meta recebe. */
    templateParams?: string[] | null
    intent: OutboundIntent
    /** 'auto' (default) deixa a política decidir; força um canal específico se quiser. */
    channelHint?: Channel | 'auto'
    /**
     * Inbox (caixa de atendimento) de origem/destino — whatsapp_inboxes.id.
     * Para envio Baileys, é também o sessionId no VPS (qual número envia).
     * Ausente → sessão default do VPS (número histórico do João). Fica gravado
     * em whatsapp_messages.inbox_id para escopar a conversa por caixa.
     */
    inboxId?: string | null
    origin?: string
    campaignId?: string | null
    /** Etapa do bot/fluxo (compat com telemetria existente, ex: 'assessor-notification'). */
    botStep?: string | null
    /** Pula guard rails (uso interno/transacional consciente). */
    skipGuardrails?: boolean
}

// sent/queued = entregue ao transporte; failed = transporte tentou e errou;
// held = guard rail/roteamento impediu antes do transporte; blocked = recusa
// deliberada (opt-out, inválido, duplicado).
export type OutboundStatus = 'sent' | 'queued' | 'failed' | 'held' | 'blocked'

export interface OutboundResult {
    status: OutboundStatus
    channel: Channel | null
    reason?: string
    messageId?: string
}

/** Janela de 24h: existe inbound deste número nas últimas 24h? */
async function sessionOpen(supabase: SupabaseClient, phone: string): Promise<boolean> {
    const variants = phoneVariants(phone)
    if (variants.length === 0) return false
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
    const { data } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('direction', 'inbound')
        .in('phone', variants)
        .gte('created_at', since)
        .limit(1)
    return !!data?.length
}

function resolveChannel(
    req: OutboundRequest,
    cloudConfigured: boolean,
    isSessionOpen: boolean,
): { channel: Channel | null; reason?: string } {
    const hint = req.channelHint ?? 'auto'

    if (hint === 'baileys') {
        // Massa nunca pelo Baileys, mesmo se forçada — proteção dura.
        if (req.intent === 'broadcast') return { channel: null, reason: 'mass_blocked_on_baileys' }
        return { channel: 'baileys' }
    }
    if (hint === 'cloud') {
        return cloudConfigured ? { channel: 'cloud' } : { channel: null, reason: 'cloud_not_configured' }
    }

    // auto
    switch (req.intent) {
        case 'broadcast':
        case 'campaign':
            return cloudConfigured ? { channel: 'cloud' } : { channel: null, reason: 'cloud_not_configured' }
        case 'assessor':
            return { channel: 'baileys' }
        case 'crm_reply':
        case 'bot':
        default:
            // Política "100% oficial para o SDR": quando a Cloud está
            // configurada, toda resposta do CRM/bot sai pela API oficial —
            // texto livre dentro da janela de 24h, template para reabrir fora
            // dela. O Baileys só entra como fallback se a Cloud não existir.
            if (cloudConfigured) {
                if (isSessionOpen) return { channel: 'cloud' }
                if (req.templateName) return { channel: 'cloud' }
                return { channel: null, reason: 'outside_24h_needs_template' }
            }
            if (isSessionOpen) return { channel: 'baileys' }
            return { channel: null, reason: 'outside_24h_needs_template' }
    }
}

function businessHoursOk(cfg: GuardrailsConfig): boolean {
    return isWithinAllowedHours({
        allowed_hours_enabled: cfg.business_hours.enabled,
        allowed_hours_start: cfg.business_hours.start,
        allowed_hours_end: cfg.business_hours.end,
        timezone: cfg.business_hours.timezone,
    })
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function sendViaBaileys(
    phone: string,
    text: string,
    session?: string | null,
): Promise<{ status: 'queued' | 'sent' | 'failed'; messageId?: string; error?: string }> {
    try {
        // `?session=<inboxId>` escolhe de qual número Baileys sai; sem ele, o VPS
        // usa a sessão default (compat: assessor/campanha/fallback → João).
        const url = session
            ? `${WHATSAPP_SERVER_URL}/send-direct?session=${encodeURIComponent(session)}`
            : `${WHATSAPP_SERVER_URL}/send-direct`
        const res = await fetch(url, {
            method: 'POST',
            headers: vpsHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ phone, message: text }),
            signal: AbortSignal.timeout(15000),
        })
        const body = await res.json().catch(() => ({} as Record<string, unknown>))
        if (!res.ok) {
            return { status: 'failed', error: String(body.error || body.reason || `http_${res.status}`) }
        }
        if (body.sent || body.success) return { status: 'sent' }
        if (body.queued) return { status: 'queued' }
        return { status: 'failed', error: 'resposta_inesperada_vps' }
    } catch (e) {
        return { status: 'failed', error: e instanceof Error ? e.message : 'vps_unreachable' }
    }
}

async function sendViaCloud(input: {
    phone: string
    name?: string | null
    text?: string | null
    templateName?: string | null
    templateLanguage?: string | null
    templateParams?: string[] | null
}): Promise<{ status: 'sent' | 'failed'; messageId?: string; error?: string }> {
    let lastError = 'cloud_send_failed'
    for (let attempt = 1; attempt <= 2; attempt++) {
        const r = await sendSingleViaCloudApi({
            to: input.phone,
            name: input.name,
            text: input.text,
            templateName: input.templateName,
            templateLanguage: input.templateLanguage,
            templateParams: input.templateParams,
        })
        if (r.ok) return { status: 'sent', messageId: r.messageId }
        lastError = r.error || lastError
        if (attempt < 2) await sleep(700)
    }
    return { status: 'failed', error: lastError }
}

async function logOutbound(
    supabase: SupabaseClient,
    req: OutboundRequest,
    phone: string,
    channel: Channel | null,
    status: OutboundStatus,
    extra: { reason?: string; error?: string; messageId?: string },
): Promise<void> {
    const { error } = await supabase.from('whatsapp_messages').insert({
        phone,
        name: req.to.name || 'Contato',
        body: req.text ?? null,
        direction: 'outbound',
        status,
        channel,
        inbox_id: resolveInboxId(req.inboxId, channel),
        intent: req.intent,
        origin: req.origin ?? req.intent,
        bot_step: req.botStep ?? null,
        lead_id: req.to.leadId ?? null,
        campaign_id: req.campaignId ?? null,
        reason: extra.messageId ?? extra.reason ?? null,
        error_msg: extra.error ?? null,
    })
    if (error) console.warn('[gateway] log outbound falhou:', error.message)
}

/**
 * Envia uma mensagem 1:1 passando por toda a política e guard rails.
 * Para envios em massa, o caller deve iterar e chamar com intent 'broadcast'
 * (ou usar o pipeline de campanhas), respeitando o jitter entre chamadas.
 */
export async function sendOutbound(
    supabase: SupabaseClient,
    req: OutboundRequest,
): Promise<OutboundResult> {
    const phone = normalizePhone(req.to.phone || '')
    if (!phone) {
        await logOutbound(supabase, req, req.to.phone || '', null, 'blocked', { reason: 'invalid_phone' })
        return { status: 'blocked', channel: null, reason: 'invalid_phone' }
    }

    if (!req.text && !req.templateName) {
        return { status: 'blocked', channel: null, reason: 'empty_message' }
    }

    const cfg = await loadGuardrails(supabase)
    const guardsOn = cfg.enabled && !req.skipGuardrails
    const isAssessor = req.intent === 'assessor'

    // 1) Opt-out (todos menos assessor)
    if (guardsOn && !isAssessor) {
        if (await isOptedOut(supabase, phone)) {
            await logOutbound(supabase, req, phone, null, 'blocked', { reason: 'optout' })
            return { status: 'blocked', channel: null, reason: 'optout' }
        }
    }

    // 2) Resolução de canal
    const isSessionOpen = req.intent === 'crm_reply' || req.intent === 'bot'
        ? await sessionOpen(supabase, phone)
        : false
    const { channel, reason: routeReason } = resolveChannel(req, isWhatsappCloudApiConfigured(), isSessionOpen)
    if (!channel) {
        await logOutbound(supabase, req, phone, null, 'held', { reason: routeReason })
        return { status: 'held', channel: null, reason: routeReason }
    }

    // 3) Guard rails dependentes do intent
    if (guardsOn) {
        const hoursGated = req.intent === 'broadcast' || req.intent === 'campaign' || req.intent === 'bot'
        if (hoursGated && !businessHoursOk(cfg)) {
            await logOutbound(supabase, req, phone, channel, 'held', { reason: 'outside_business_hours' })
            return { status: 'held', channel, reason: 'outside_business_hours' }
        }

        const capEnforced = req.intent === 'broadcast' || req.intent === 'campaign'
        if (capEnforced) {
            const used = await dailyCount(supabase, channel, cfg.business_hours.timezone)
            if (used >= effectiveDailyCap(cfg, channel)) {
                await logOutbound(supabase, req, phone, channel, 'held', { reason: 'daily_cap_reached' })
                return { status: 'held', channel, reason: 'daily_cap_reached' }
            }

            if (await recentlyMessaged(supabase, phone, cfg.dedup_hours, { campaignId: req.campaignId })) {
                await logOutbound(supabase, req, phone, channel, 'blocked', { reason: 'duplicate' })
                return { status: 'blocked', channel, reason: 'duplicate' }
            }
        }
    }

    // 4) Entrega ao transporte
    const transport = channel === 'baileys'
        ? await sendViaBaileys(phone, req.text ?? '', req.inboxId ?? undefined)
        : await sendViaCloud({
            phone,
            name: req.to.name,
            text: req.text,
            templateName: req.templateName,
            templateLanguage: req.templateLanguage,
            templateParams: req.templateParams,
        })

    const status: OutboundStatus = transport.status // 'sent' | 'queued' | 'failed'

    // 5) Log + contador + last_whatsapp_at
    await logOutbound(supabase, req, phone, channel, status, {
        reason: transport.status === 'failed' ? 'send_failed' : undefined,
        error: transport.error,
        messageId: transport.messageId,
    })

    if (status === 'sent' || status === 'queued') {
        await incrementDailyCount(supabase, channel, cfg.business_hours.timezone)
        if (req.to.leadId) {
            await supabase
                .from('crm_leads')
                .update({ last_whatsapp_at: new Date().toISOString() })
                .eq('id', req.to.leadId)
        }
    }

    return {
        status,
        channel,
        reason: transport.status === 'failed' ? (transport.error ?? 'send_failed') : routeReason,
        messageId: transport.messageId,
    }
}
