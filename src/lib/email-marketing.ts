/**
 * Camada de envio de e-mail marketing — sobre src/lib/email.ts (SMTP Hostinger).
 *
 * Responsabilidades:
 *   - Renderizar templates (substitui {nome}, {empresa}, etc, e injeta link
 *     de unsubscribe assinado).
 *   - Despachar e-mail respeitando opt-out e logar em email_messages.
 *   - Aplicar throttle de envio (Hostinger compartilhado limita ~100-300/dia,
 *     então o cron processa lotes pequenos e espaçados).
 *
 * Fluxo típico:
 *   const result = await sendCampaignEmail(supabase, {
 *       email, name, leadId, campaignId, recipientId, subject, bodyHtml, bodyText
 *   })
 */

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMail } from './email'

export type DelayUnit = 'minutes' | 'hours' | 'days'

const UNIT_TO_MS: Record<DelayUnit, number> = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
}

/** Soma delay (relativo) a um timestamp e devolve ISO. */
export function addDelay(from: Date, value: number, unit: DelayUnit): string {
    const ms = (UNIT_TO_MS[unit] ?? UNIT_TO_MS.days) * Math.max(0, value)
    return new Date(from.getTime() + ms).toISOString()
}

/** Primeiro nome (fallback "amigo(a)") — espelha firstName() do WhatsApp. */
export function firstName(name: string | null | undefined): string {
    if (!name) return ''
    const trimmed = name.trim()
    if (!trimmed) return ''
    return trimmed.split(/\s+/)[0]
}

/**
 * Substitui placeholders {chave} em um string. Não interpreta sintaxe — é
 * substituição literal por chave. Espelha renderTemplate() do WhatsApp.
 */
export function renderTemplate(
    template: string,
    vars: Record<string, string | number | null | undefined>,
): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        const v = vars[key]
        if (v === null || v === undefined) return match
        return String(v)
    })
}

// ─── Unsubscribe (link assinado) ──────────────────────────────────────────
/**
 * Gera token HMAC-SHA256 do e-mail, assinado com WHATSAPP_GROUP_TASK_SECRET.
 *
 * Por que reusamos esse segredo: já é um shared secret usado em outras
 * integrações internas e a finalidade é igual (validar payload sem precisar
 * de banco). Em produção a Vercel já tem o env setada.
 */
function getUnsubscribeSecret(): string {
    const s = process.env.WHATSAPP_GROUP_TASK_SECRET
    if (!s) {
        // Fallback determinístico em dev pra não quebrar — em produção
        // sempre haverá WHATSAPP_GROUP_TASK_SECRET.
        return 'dev-unsubscribe-secret-do-not-use-in-prod'
    }
    return s
}

export function signUnsubscribeToken(email: string): string {
    const normalized = email.trim().toLowerCase()
    return crypto
        .createHmac('sha256', getUnsubscribeSecret())
        .update(normalized)
        .digest('hex')
        .slice(0, 32)
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
    const expected = signUnsubscribeToken(email)
    if (expected.length !== token.length) return false
    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))
    } catch {
        return false
    }
}

/**
 * Resolve a URL absoluta do endpoint de unsubscribe. Em produção usa o domínio
 * canônico; em dev cai pra NEXT_PUBLIC_SITE_URL ou localhost.
 */
function unsubscribeUrl(email: string): string {
    const base =
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
        process.env.VERCEL_URL?.replace(/\/$/, '') ||
        'https://formuladoboi.com'
    const normalized = base.startsWith('http') ? base : `https://${base}`
    const token = signUnsubscribeToken(email)
    const params = new URLSearchParams({ email: email.trim().toLowerCase(), token })
    return `${normalized}/api/email/unsubscribe?${params.toString()}`
}

// ─── Renderização ─────────────────────────────────────────────────────────
export interface RenderInput {
    subject: string
    bodyHtml: string
    bodyText?: string | null
    name?: string | null
    email: string
    extraVars?: Record<string, string | number | null | undefined>
}

export interface RenderedEmail {
    subject: string
    html: string
    text: string
    unsubscribeUrl: string
}

/**
 * Renderiza um template e injeta o link de unsubscribe. Substitui:
 *   - {nome}            → primeiro nome (fallback "amigo(a)")
 *   - {name}            → nome completo
 *   - {email}           → endereço normalizado
 *   - {{UNSUBSCRIBE_URL}} → link assinado (DUPLA chave pra não conflitar com {var})
 *   - Quaisquer extraVars
 */
export function renderEmail(input: RenderInput): RenderedEmail {
    const url = unsubscribeUrl(input.email)
    const vars: Record<string, string | number | null | undefined> = {
        nome: firstName(input.name) || 'amigo(a)',
        name: input.name || '',
        email: input.email.trim().toLowerCase(),
        ...(input.extraVars ?? {}),
    }
    const interp = (s: string) =>
        renderTemplate(s, vars).replace(/\{\{UNSUBSCRIBE_URL\}\}/g, url)

    const subject = interp(input.subject)
    let html = interp(input.bodyHtml)

    // Garante que TODO e-mail tem o rodapé de unsubscribe — se o template não
    // referenciou {{UNSUBSCRIBE_URL}} no HTML, injetamos um rodapé padrão.
    if (!input.bodyHtml.includes('{{UNSUBSCRIBE_URL}}')) {
        html = html.replace(
            /<\/body>/i,
            `<div style="margin-top:24px;padding:16px 24px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;font-family:Arial,Helvetica,sans-serif;">` +
                `Você está recebendo esta mensagem porque está cadastrado no CRM da Fórmula do Boi. ` +
                `<a href="${url}" style="color:#999;text-decoration:underline;">Descadastrar</a>.` +
            `</div></body>`,
        )
        if (!/\<\/body\>/i.test(html)) {
            html += `<div style="margin-top:24px;padding:16px 24px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;font-family:Arial,Helvetica,sans-serif;">` +
                `Você está recebendo esta mensagem porque está cadastrado no CRM da Fórmula do Boi. ` +
                `<a href="${url}" style="color:#999;text-decoration:underline;">Descadastrar</a>.` +
            `</div>`
        }
    }

    const text = input.bodyText
        ? interp(input.bodyText)
        : html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

    return { subject, html, text, unsubscribeUrl: url }
}

// ─── Envio (com opt-out + log) ────────────────────────────────────────────
export interface SendCampaignEmailInput {
    email: string
    name?: string | null
    leadId?: string | null
    campaignId?: string | null
    templateId?: string | null
    recipientId?: string | null
    subject: string
    bodyHtml: string
    bodyText?: string | null
    fromOverride?: string                  // "Nome <email@dom>"
    replyTo?: string | null
    origin?: 'campanha' | 'template' | 'manual' | 'sistema'
    extraVars?: Record<string, string | number | null | undefined>
    /** Se true, ignora optout (uso APENAS pra transacional / confirmação de opt-out). */
    bypassOptout?: boolean
}

export interface SendCampaignEmailResult {
    success: boolean
    skippedOptout?: boolean
    error?: string
}

/**
 * Envia um e-mail respeitando opt-out e registrando em email_messages.
 * Returns { success: true } no envio OK, { skippedOptout: true } quando
 * pulou por opt-out, { success: false, error } no erro do SMTP.
 */
export async function sendCampaignEmail(
    supabase: SupabaseClient,
    input: SendCampaignEmailInput,
): Promise<SendCampaignEmailResult> {
    const normalizedEmail = input.email.trim().toLowerCase()

    if (!normalizedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
        return { success: false, error: 'E-mail inválido' }
    }

    // Checa opt-out (cache + lead)
    if (!input.bypassOptout) {
        const { data: optout } = await supabase
            .from('email_optouts')
            .select('email')
            .eq('email', normalizedEmail)
            .maybeSingle()
        if (optout) {
            return { success: true, skippedOptout: true }
        }
        if (input.leadId) {
            const { data: lead } = await supabase
                .from('crm_leads')
                .select('optout_email')
                .eq('id', input.leadId)
                .single()
            if (lead?.optout_email) {
                return { success: true, skippedOptout: true }
            }
        }
    }

    // Renderiza
    const rendered = renderEmail({
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        bodyText: input.bodyText,
        name: input.name,
        email: normalizedEmail,
        extraVars: input.extraVars,
    })

    // Envia
    try {
        await sendMail({
            to: normalizedEmail,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
        })
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro desconhecido no SMTP'
        // Log de falha
        await supabase.from('email_messages').insert({
            lead_id: input.leadId ?? null,
            email: normalizedEmail,
            direction: 'outbound',
            subject: rendered.subject,
            body_html: rendered.html,
            body_text: rendered.text,
            status: 'failed',
            error_msg: msg,
            origin: input.origin ?? 'campanha',
            campaign_id: input.campaignId ?? null,
            template_id: input.templateId ?? null,
            recipient_id: input.recipientId ?? null,
        })
        return { success: false, error: msg }
    }

    // Log de sucesso + atualiza last_email_at no lead
    await supabase.from('email_messages').insert({
        lead_id: input.leadId ?? null,
        email: normalizedEmail,
        direction: 'outbound',
        subject: rendered.subject,
        body_html: rendered.html,
        body_text: rendered.text,
        status: 'sent',
        origin: input.origin ?? 'campanha',
        campaign_id: input.campaignId ?? null,
        template_id: input.templateId ?? null,
        recipient_id: input.recipientId ?? null,
    })
    if (input.leadId) {
        await supabase
            .from('crm_leads')
            .update({ last_email_at: new Date().toISOString() })
            .eq('id', input.leadId)
    }

    return { success: true }
}

/**
 * Marca um e-mail como opt-out (cache + lead). Idempotente.
 */
export async function setEmailOptout(
    supabase: SupabaseClient,
    email: string,
    opts: { reason?: string; leadId?: string | null } = {},
): Promise<{ leadIds: string[] }> {
    const normalized = email.trim().toLowerCase()

    await supabase
        .from('email_optouts')
        .upsert(
            { email: normalized, reason: opts.reason ?? null, lead_id: opts.leadId ?? null },
            { onConflict: 'email' },
        )

    // Espelha em todos os leads que casem com esse e-mail
    const { data: leads } = await supabase
        .from('crm_leads')
        .select('id')
        .eq('email', normalized)

    const leadIds = (leads ?? []).map(l => l.id)
    if (leadIds.length > 0) {
        await supabase
            .from('crm_leads')
            .update({ optout_email: true, optout_email_at: new Date().toISOString() })
            .in('id', leadIds)
    }
    return { leadIds }
}
