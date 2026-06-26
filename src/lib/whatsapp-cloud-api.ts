import type { SupabaseClient } from '@supabase/supabase-js'
import { firstName, normalizePhone } from './whatsapp-central'

export interface WhatsappCloudConfig {
    accessToken: string | null
    phoneNumberId: string | null
    businessAccountId: string | null
    graphVersion: string
}

export interface WhatsappCloudTemplate {
    id: string
    name: string
    status: string
    category: string
    language: string
    body: string
}

export interface CloudCampaignRecipient {
    recipient_id: string
    lead_id?: string | null
    phone: string
    name?: string | null
    message: string
    caption?: string | null
}

export interface CloudCampaignMedia {
    url: string
    type: string
    mime?: string | null
    filename?: string | null
}

export interface CloudCampaignPoll {
    question: string
    options: string[]
    selectable_count?: number | null
}

export interface CloudCampaignSendInput {
    campaignId: string
    recipients: CloudCampaignRecipient[]
    media?: CloudCampaignMedia | null
    poll?: CloudCampaignPoll | null
    templateName?: string | null
    templateLanguage?: string | null
    completeAfterSend?: boolean
    origin?: string
}

export interface CloudCampaignSendResult {
    attempted: number
    sent: number
    failed: number
    results: Array<{
        recipient_id: string
        phone: string
        ok: boolean
        message_id?: string
        error?: string
    }>
}

type MetaTemplateComponent = {
    type?: string
    text?: string
}

type MetaTemplateRow = {
    id?: string
    name?: string
    status?: string
    category?: string
    language?: string
    components?: MetaTemplateComponent[]
}

function env(name: string): string | null {
    const value = process.env[name]
    return value && value.trim() ? value.trim() : null
}

function graphVersion(value: string | null): string {
    const v = value || 'v25.0'
    return v.startsWith('v') ? v : `v${v}`
}

export function getWhatsappCloudConfig(): WhatsappCloudConfig {
    return {
        accessToken: env('WHATSAPP_CLOUD_ACCESS_TOKEN') || env('WHATSAPP_ACCESS_TOKEN') || env('META_WHATSAPP_ACCESS_TOKEN'),
        phoneNumberId: env('WHATSAPP_CLOUD_PHONE_NUMBER_ID') || env('WHATSAPP_PHONE_NUMBER_ID') || env('META_WHATSAPP_PHONE_NUMBER_ID'),
        businessAccountId:
            env('WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID') ||
            env('WHATSAPP_BUSINESS_ACCOUNT_ID') ||
            env('WABA_ID') ||
            env('META_WHATSAPP_BUSINESS_ACCOUNT_ID'),
        graphVersion: graphVersion(env('WHATSAPP_CLOUD_GRAPH_VERSION') || env('GRAPH_API_VERSION')),
    }
}

export function isWhatsappCloudApiConfigured(): boolean {
    const config = getWhatsappCloudConfig()
    return Boolean(config.accessToken && config.phoneNumberId)
}

function graphBase(config = getWhatsappCloudConfig()): string {
    return `https://graph.facebook.com/${config.graphVersion}`
}

function metaError(json: unknown, fallback: string): string {
    if (json && typeof json === 'object' && 'error' in json) {
        const err = (json as { error?: { message?: string; code?: number; error_subcode?: number } }).error
        const parts = [err?.message, err?.code ? `code ${err.code}` : null, err?.error_subcode ? `subcode ${err.error_subcode}` : null]
            .filter(Boolean)
        if (parts.length) return parts.join(' | ')
    }
    return fallback
}

async function metaFetch(path: string, init?: RequestInit, timeoutMs = 20000): Promise<unknown> {
    const config = getWhatsappCloudConfig()
    if (!config.accessToken) throw new Error('WHATSAPP_CLOUD_ACCESS_TOKEN ausente.')

    const res = await fetch(`${graphBase(config)}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${config.accessToken}`,
            ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
            ...(init?.headers ?? {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(metaError(json, `Meta Graph HTTP ${res.status}`))
    return json
}

export async function fetchWhatsappCloudPhoneNumber(): Promise<Record<string, unknown>> {
    const config = getWhatsappCloudConfig()
    if (!config.phoneNumberId) throw new Error('WHATSAPP_CLOUD_PHONE_NUMBER_ID ausente.')
    const fields = 'id,verified_name,display_phone_number,quality_rating,platform_type,code_verification_status'
    return await metaFetch(`/${config.phoneNumberId}?fields=${fields}`) as Record<string, unknown>
}

/**
 * Baixa uma mídia recebida (inbound) da Cloud API. São dois passos na Graph:
 *   1. GET /{media-id}        → metadados, incluindo a `url` temporária
 *   2. GET <url>              → bytes (a URL exige o mesmo Bearer token)
 * Retorna os bytes + o mime real. Mídia da Meta expira em ~5 min na URL, mas o
 * media-id vive ~30 dias — por isso baixamos no momento do webhook.
 */
export async function downloadWhatsappCloudMedia(
    mediaId: string,
): Promise<{ data: ArrayBuffer; mime: string }> {
    const config = getWhatsappCloudConfig()
    if (!config.accessToken) throw new Error('WHATSAPP_CLOUD_ACCESS_TOKEN ausente.')

    const meta = await metaFetch(`/${mediaId}`) as { url?: string; mime_type?: string }
    if (!meta?.url) throw new Error(`Mídia ${mediaId} sem url na resposta da Meta.`)

    // O download NÃO passa pelo graphBase (a url já é absoluta) e precisa do
    // header de auth — sem ele a Meta devolve 401.
    const res = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${config.accessToken}` },
        signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) throw new Error(`Download da mídia ${mediaId} falhou: HTTP ${res.status}`)
    const data = await res.arrayBuffer()
    return { data, mime: meta.mime_type || res.headers.get('content-type') || 'application/octet-stream' }
}

function bodyFromTemplate(row: MetaTemplateRow): string {
    const body = row.components?.find(c => String(c.type ?? '').toUpperCase() === 'BODY')
    return body?.text ?? ''
}

export async function fetchWhatsappCloudTemplates(): Promise<WhatsappCloudTemplate[]> {
    const config = getWhatsappCloudConfig()
    if (!config.businessAccountId) return []
    const fields = 'id,name,status,category,language,components'
    const json = await metaFetch(`/${config.businessAccountId}/message_templates?fields=${fields}&limit=100`)
    const rows = (json as { data?: MetaTemplateRow[] }).data ?? []
    return rows
        .filter(r => r.id && r.name)
        .map(r => ({
            id: String(r.id),
            name: String(r.name),
            status: String(r.status ?? ''),
            category: String(r.category ?? ''),
            language: String(r.language ?? ''),
            body: bodyFromTemplate(r),
        }))
}

export interface WhatsappCloudTemplateFull {
    id: string
    name: string
    status: string
    category: string
    language: string
    rejected_reason: string | null
}

/** Lista os templates da Meta com os campos de status (inclui rejected_reason). */
export async function fetchWhatsappCloudTemplatesFull(): Promise<WhatsappCloudTemplateFull[]> {
    const config = getWhatsappCloudConfig()
    if (!config.businessAccountId) return []
    const fields = 'id,name,status,category,language,rejected_reason'
    const json = await metaFetch(`/${config.businessAccountId}/message_templates?fields=${fields}&limit=200`)
    const rows = (json as { data?: Array<Record<string, unknown>> }).data ?? []
    return rows
        .filter(r => r.id && r.name)
        .map(r => ({
            id: String(r.id),
            name: String(r.name),
            status: String(r.status ?? ''),
            category: String(r.category ?? ''),
            language: String(r.language ?? ''),
            rejected_reason: r.rejected_reason ? String(r.rejected_reason) : null,
        }))
}

function variableNamesFromBody(body: string): string[] {
    const names = new Set<string>()
    if (/\{nome\}/i.test(body) || /\{\{\s*1\s*\}\}/.test(body)) names.add('nome')
    if (/\{name\}/i.test(body) || /\{\{\s*2\s*\}\}/.test(body)) names.add('name')
    return [...names]
}

export async function syncWhatsappCloudTemplatesToLocal(
    supabase: SupabaseClient,
    createdBy?: string | null,
): Promise<{ synced: number; approved: number; skipped: number; templates: WhatsappCloudTemplate[] }> {
    const templates = await fetchWhatsappCloudTemplates()
    const approved = templates.filter(t => t.status === 'APPROVED')
    if (approved.length === 0) {
        return { synced: 0, approved: 0, skipped: templates.length, templates }
    }

    const rows = approved.map(t => ({
        slug: t.name,
        title: t.name,
        category: t.category?.toLowerCase() || 'meta',
        body: t.body || `Template Meta: ${t.name}`,
        variables: variableNamesFromBody(t.body),
        archived: false,
        created_by: createdBy ?? null,
    }))

    const { error } = await supabase
        .from('whatsapp_templates')
        .upsert(rows, { onConflict: 'slug' })

    if (error) throw new Error(error.message)
    return { synced: rows.length, approved: approved.length, skipped: templates.length - approved.length, templates }
}

// ── Submissão de templates à Meta (ciclo de aprovação) ─────────────────────

/** Converte um slug em nome de template válido na Meta (a-z0-9_, minúsculo). */
export function metaTemplateName(slug: string): string {
    return slug
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 480) || 'template'
}

/**
 * Converte o corpo "interno" (com {nome}/{name}) para o formato posicional da
 * Meta ({{1}}...). Devolve o texto convertido e a lista ordenada de variáveis,
 * para montar o `example.body_text` exigido pela Meta em templates com variável.
 */
export function toMetaBody(body: string): { text: string; variables: string[] } {
    const variables: string[] = []
    const map = new Map<string, number>()
    const text = body.replace(/\{(\w+)\}/g, (_m, name: string) => {
        const key = name.toLowerCase()
        if (!map.has(key)) {
            map.set(key, map.size + 1)
            variables.push(key)
        }
        return `{{${map.get(key)}}}`
    })
    return { text, variables }
}

const EXAMPLE_VALUES: Record<string, string> = {
    nome: 'João', name: 'João', leilao_nome: 'Leilão Fórmula do Boi',
    leilao_data: '20/06', leilao_link: 'https://formuladoboi.com/agenda', interesse: 'touros',
}

export interface CreateMetaTemplateResult {
    id: string
    status: string
    category: string
}

/**
 * Cria/submete um template à Meta para aprovação.
 * POST /{WABA_ID}/message_templates. Retorna o id e o status inicial (geralmente
 * PENDING). Lança erro com a mensagem da Meta se a submissão for rejeitada na hora.
 */
export async function createWhatsappCloudTemplate(input: {
    name: string
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
    language: string
    body: string
}): Promise<CreateMetaTemplateResult> {
    const config = getWhatsappCloudConfig()
    if (!config.businessAccountId) throw new Error('WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID ausente.')

    const { text, variables } = toMetaBody(input.body)
    const bodyComponent: Record<string, unknown> = { type: 'BODY', text }
    if (variables.length > 0) {
        bodyComponent.example = {
            body_text: [variables.map(v => EXAMPLE_VALUES[v] || 'exemplo')],
        }
    }

    const payload = {
        name: input.name,
        category: input.category,
        language: input.language,
        components: [bodyComponent],
    }

    const json = await metaFetch(`/${config.businessAccountId}/message_templates`, {
        method: 'POST',
        body: JSON.stringify(payload),
    }, 30000) as { id?: string; status?: string; category?: string }

    if (!json.id) throw new Error('Meta não retornou id do template.')
    return { id: json.id, status: json.status ?? 'PENDING', category: json.category ?? input.category }
}

/**
 * Sincroniza o status Meta dos templates locais que já foram submetidos
 * (meta_template_id não nulo). Casa pelo nome do template na Meta.
 */
export async function syncMetaTemplateStatuses(
    supabase: SupabaseClient,
): Promise<{ updated: number; statuses: Record<string, string> }> {
    const metaTemplates = await fetchWhatsappCloudTemplatesFull()
    const byName = new Map(metaTemplates.map(t => [t.name, t]))

    const { data: locals } = await supabase
        .from('whatsapp_templates')
        .select('id, slug, meta_template_id, meta_status')
        .not('meta_template_id', 'is', null)

    let updated = 0
    const statuses: Record<string, string> = {}
    for (const local of locals ?? []) {
        const metaName = metaTemplateName((local as { slug: string }).slug)
        const meta = byName.get(metaName)
        if (!meta) continue
        const newStatus = (meta.status || 'PENDING').toUpperCase()
        statuses[metaName] = newStatus
        const { error } = await supabase
            .from('whatsapp_templates')
            .update({
                meta_status: newStatus,
                meta_category: meta.category || null,
                meta_language: meta.language || null,
                meta_rejected_reason: newStatus === 'REJECTED' ? (meta.rejected_reason || 'rejeitado') : null,
                meta_synced_at: new Date().toISOString(),
            })
            .eq('id', (local as { id: string }).id)
        if (!error) updated++
    }
    return { updated, statuses }
}

function appendPoll(message: string, poll?: CloudCampaignPoll | null): string {
    if (!poll?.question || !Array.isArray(poll.options) || poll.options.length < 2) return message
    const options = poll.options.map((option, idx) => `${idx + 1}. ${option}`).join('\n')
    const base = message.trim()
    return `${base}${base ? '\n\n' : ''}${poll.question}\n${options}`
}

function countMetaBodyParams(message: string): number {
    const matches = [...message.matchAll(/\{\{\s*(\d+)\s*\}\}/g)]
    return matches.reduce((max, match) => Math.max(max, Number(match[1] ?? 0)), 0)
}

function templateBodyParameters(recipient: CloudCampaignRecipient): Array<{ type: 'text'; text: string }> {
    const count = countMetaBodyParams(recipient.message)
    if (count <= 0) return []
    const values = [
        firstName(recipient.name) || 'amigo(a)',
        recipient.name || firstName(recipient.name) || 'contato',
        recipient.phone,
    ]
    return Array.from({ length: count }, (_, idx) => ({
        type: 'text' as const,
        text: values[idx] || values[0] || 'contato',
    }))
}

function mediaPayload(type: string, media: CloudCampaignMedia, caption: string | null): Record<string, unknown> {
    const normalizedType = ['image', 'video', 'audio', 'document'].includes(media.type) ? media.type : type
    const payload: Record<string, unknown> = { link: media.url }
    if (normalizedType !== 'audio' && caption) payload.caption = caption
    if (normalizedType === 'document' && media.filename) payload.filename = media.filename
    return { type: normalizedType, [normalizedType]: payload }
}

function buildMessagePayload(input: {
    to: string
    recipient: CloudCampaignRecipient
    media?: CloudCampaignMedia | null
    poll?: CloudCampaignPoll | null
    templateName?: string | null
    templateLanguage?: string | null
    /** Valores explícitos das variáveis do corpo do template ({{1}}, {{2}}…).
     *  Quando informado, tem prioridade sobre a derivação a partir do texto —
     *  permite logar um corpo já renderizado (sem {{n}}) e ainda assim mandar
     *  os parâmetros corretos pra Meta. */
    templateParams?: string[] | null
}): Record<string, unknown> {
    if (input.templateName) {
        const parameters = input.templateParams && input.templateParams.length > 0
            ? input.templateParams.map(text => ({ type: 'text' as const, text }))
            : templateBodyParameters(input.recipient)
        const template: Record<string, unknown> = {
            name: input.templateName,
            language: { code: input.templateLanguage || 'pt_BR' },
        }
        if (parameters.length > 0) {
            template.components = [{ type: 'body', parameters }]
        }
        return {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: input.to,
            type: 'template',
            template,
        }
    }

    if (input.media?.url && input.media.type) {
        return {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: input.to,
            ...mediaPayload(input.media.type, input.media, input.recipient.caption ?? null),
        }
    }

    return {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.to,
        type: 'text',
        text: {
            preview_url: false,
            body: appendPoll(input.recipient.message || 'Mensagem da Bula Assessoria.', input.poll),
        },
    }
}

async function postCloudMessage(payload: Record<string, unknown>): Promise<string | undefined> {
    const config = getWhatsappCloudConfig()
    if (!config.phoneNumberId) throw new Error('WHATSAPP_CLOUD_PHONE_NUMBER_ID ausente.')
    const json = await metaFetch(`/${config.phoneNumberId}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
    }, 30000)
    const first = (json as { messages?: Array<{ id?: string }> }).messages?.[0]
    return first?.id
}

function shortError(error: unknown): string {
    const msg = error instanceof Error ? error.message : String(error)
    return msg.length > 500 ? `${msg.slice(0, 497)}...` : msg
}

/**
 * Envio unitário pela Cloud API — usado pelo gateway (whatsapp-gateway.ts) para
 * mensagens 1:1 (resposta do CRM fora da janela de 24h, template para contato
 * frio). NÃO toca em whatsapp_campaign_recipients nem loga em whatsapp_messages:
 * quem chama (o gateway) é dono do log unificado.
 */
export async function sendSingleViaCloudApi(input: {
    to: string
    name?: string | null
    text?: string | null
    templateName?: string | null
    templateLanguage?: string | null
    templateParams?: string[] | null
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    if (!isWhatsappCloudApiConfigured()) {
        return { ok: false, error: 'WhatsApp Cloud API não configurada.' }
    }
    const to = normalizePhone(input.to)
    if (!to) return { ok: false, error: 'Telefone inválido.' }

    const recipient: CloudCampaignRecipient = {
        recipient_id: 'single',
        phone: to,
        name: input.name ?? null,
        message: input.text ?? '',
    }

    try {
        const payload = buildMessagePayload({
            to,
            recipient,
            templateName: input.templateName ?? null,
            templateLanguage: input.templateLanguage ?? null,
            templateParams: input.templateParams ?? null,
        })
        const messageId = await postCloudMessage(payload)
        return { ok: true, messageId }
    } catch (e) {
        return { ok: false, error: shortError(e) }
    }
}

export async function sendCampaignViaCloudApi(
    supabase: SupabaseClient,
    input: CloudCampaignSendInput,
): Promise<CloudCampaignSendResult> {
    if (!isWhatsappCloudApiConfigured()) {
        throw new Error('WhatsApp Cloud API nao configurada.')
    }

    const results: CloudCampaignSendResult['results'] = []
    const now = new Date().toISOString()
    const language = input.templateLanguage || env('WHATSAPP_CLOUD_TEMPLATE_LANGUAGE') || 'pt_BR'

    for (const recipient of input.recipients) {
        const to = normalizePhone(recipient.phone)
        if (!to) {
            const error = 'Telefone invalido.'
            await supabase
                .from('whatsapp_campaign_recipients')
                .update({ status: 'falhou', error_msg: error, next_send_at: null, stopped_at: now, stopped_reason: 'send_failed' })
                .eq('id', recipient.recipient_id)
            results.push({ recipient_id: recipient.recipient_id, phone: recipient.phone, ok: false, error })
            continue
        }

        try {
            const payload = buildMessagePayload({
                to,
                recipient,
                media: input.media,
                poll: input.poll,
                templateName: input.templateName,
                templateLanguage: language,
            })
            const messageId = await postCloudMessage(payload)

            await supabase
                .from('whatsapp_campaign_recipients')
                .update({
                    status: 'enviado',
                    error_msg: null,
                    sent_at: now,
                    ...(input.completeAfterSend ? { next_send_at: null, stopped_at: now, stopped_reason: 'completed' } : {}),
                })
                .eq('id', recipient.recipient_id)

            await supabase.from('whatsapp_messages').insert({
                phone: to,
                name: recipient.name || 'Contato',
                status: 'sent',
                reason: messageId ?? null,
                lead_id: recipient.lead_id ?? null,
                direction: 'outbound',
                channel: 'cloud',
                intent: 'campaign',
                body: recipient.message || recipient.caption || null,
                origin: input.origin || 'campanha',
                campaign_id: input.campaignId,
                template_id: null,
            })

            results.push({ recipient_id: recipient.recipient_id, phone: to, ok: true, message_id: messageId })
        } catch (e) {
            const error = shortError(e)
            await supabase
                .from('whatsapp_campaign_recipients')
                .update({ status: 'falhou', error_msg: error, next_send_at: null, stopped_at: now, stopped_reason: 'send_failed' })
                .eq('id', recipient.recipient_id)

            await supabase.from('whatsapp_messages').insert({
                phone: to,
                name: recipient.name || 'Contato',
                status: 'failed',
                reason: 'cloud_api_error',
                error_msg: error,
                lead_id: recipient.lead_id ?? null,
                direction: 'outbound',
                channel: 'cloud',
                intent: 'campaign',
                body: recipient.message || recipient.caption || null,
                origin: input.origin || 'campanha',
                campaign_id: input.campaignId,
                template_id: null,
            })

            results.push({ recipient_id: recipient.recipient_id, phone: to, ok: false, error })
        }
    }

    const sent = results.filter(r => r.ok).length
    return {
        attempted: results.length,
        sent,
        failed: results.length - sent,
        results,
    }
}
