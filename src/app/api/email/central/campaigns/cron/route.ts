/**
 * /api/email/central/campaigns/cron
 *
 * Processa recipients com `next_send_at <= now()` (passos 1+ de campanhas
 * com sequência). Espelha o cron do WhatsApp mas envia direto pelo SMTP.
 *
 * Fluxo:
 *   1. Carrega recipients elegíveis (BATCH_SIZE = 30 — conservador pro SMTP).
 *   2. Aplica regras de parada (opt-out, interesse) contra estado atual do lead.
 *   3. Para os que continuam ativos: resolve step, manda pelo SMTP, atualiza
 *      current_step e recalcula next_send_at do próximo step (ou marca
 *      stopped_reason='completed').
 *
 * Idempotência: lock otimista — atualiza só linhas onde current_step ainda
 * é o esperado, pra duas execuções concorrentes não duplicarem envio.
 *
 * Auth: aceita Authorization: Bearer <CRON_SECRET> OU x-webhook-secret
 * igual a WHATSAPP_GROUP_TASK_SECRET (mesmo padrão do cron WhatsApp).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { addDelay, sendCampaignEmail } from '@/lib/email-marketing'
import { resolveEmailStepContent } from '@/lib/email-campaign-step'

export const maxDuration = 60

const BATCH_SIZE = 30  // Conservador — Hostinger limita ~100-300/dia
const SEND_THROTTLE_MS = 800

function isAuthorized(req: NextRequest): boolean {
    const cronSecret = process.env.CRON_SECRET
    const groupSecret = process.env.WHATSAPP_GROUP_TASK_SECRET
    const authHeader = req.headers.get('authorization') ?? ''
    const webhookHeader = req.headers.get('x-webhook-secret') ?? ''
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
    if (groupSecret && webhookHeader === groupSecret) return true
    return false
}

type RecipientRow = {
    id: string
    campaign_id: string
    lead_id: string | null
    email: string
    name: string | null
    current_step: number
    next_send_at: string
    stopped_at: string | null
    stopped_reason: string | null
}

type CampaignRow = {
    id: string
    status: string
    template_id: string | null
    from_name: string | null
    reply_to: string | null
    stop_on_optout: boolean
    stop_on_interest: boolean
}

type StepRow = {
    step_order: number
    delay_value: number
    delay_unit: 'minutes' | 'hours' | 'days'
    template_id: string | null
    subject: string | null
    body_html: string | null
    body_text: string | null
    is_active: boolean
}

type LeadStateRow = {
    id: string
    optout_email: boolean | null
    interesse_principal: string | null
}

async function loadCampaign(supabase: SupabaseClient, id: string): Promise<CampaignRow | null> {
    const { data } = await supabase
        .from('email_campaigns')
        .select('id, status, template_id, from_name, reply_to, stop_on_optout, stop_on_interest')
        .eq('id', id)
        .single()
    return (data as CampaignRow | null) ?? null
}

async function loadSteps(supabase: SupabaseClient, campaignId: string): Promise<StepRow[]> {
    const { data } = await supabase
        .from('email_campaign_steps')
        .select('step_order, delay_value, delay_unit, template_id, subject, body_html, body_text, is_active')
        .eq('campaign_id', campaignId)
        .order('step_order', { ascending: true })
    return (data as StepRow[] | null) ?? []
}

async function loadLeadStates(
    supabase: SupabaseClient,
    leadIds: string[],
): Promise<Map<string, LeadStateRow>> {
    const map = new Map<string, LeadStateRow>()
    if (leadIds.length === 0) return map
    const { data } = await supabase
        .from('crm_leads')
        .select('id, optout_email, interesse_principal')
        .in('id', leadIds)
    for (const row of (data as LeadStateRow[] | null) ?? []) map.set(row.id, row)
    return map
}

function decideStop(
    campaign: CampaignRow,
    lead: LeadStateRow | undefined,
): string | null {
    if (lead?.optout_email && campaign.stop_on_optout) return 'optout'
    if (lead?.interesse_principal && campaign.stop_on_interest) return 'interest'
    return null
}

async function processRecipient(
    supabase: SupabaseClient,
    recipient: RecipientRow,
    campaign: CampaignRow,
    steps: StepRow[],
    now: Date,
): Promise<{ sent: boolean; stopped: string | null }> {
    const stepIdx = recipient.current_step  // aponta pro próximo a enviar
    const step = steps.find(s => s.step_order === stepIdx && s.is_active !== false)
    if (!step) {
        await supabase
            .from('email_campaign_recipients')
            .update({ next_send_at: null, stopped_at: now.toISOString(), stopped_reason: 'completed' })
            .eq('id', recipient.id)
            .eq('current_step', stepIdx)
        return { sent: false, stopped: 'completed' }
    }

    const content = await resolveEmailStepContent(supabase, step)
    if (!content.subject.trim() || !content.body_html.trim()) {
        await supabase
            .from('email_campaign_recipients')
            .update({ next_send_at: null, stopped_at: now.toISOString(), stopped_reason: 'completed' })
            .eq('id', recipient.id)
            .eq('current_step', stepIdx)
        return { sent: false, stopped: 'completed' }
    }

    // Calcula next_send_at do PRÓXIMO step (stepIdx + 1)
    const nextStep = steps.find(s => s.step_order === stepIdx + 1 && s.is_active !== false)
    const nextAt = nextStep ? addDelay(now, nextStep.delay_value, nextStep.delay_unit) : null

    // Lock otimista
    const { data: updated, error } = await supabase
        .from('email_campaign_recipients')
        .update({ current_step: stepIdx + 1, next_send_at: nextAt })
        .eq('id', recipient.id)
        .eq('current_step', stepIdx)
        .select('id')
        .single()
    if (error || !updated) {
        // Outro worker pegou
        return { sent: false, stopped: null }
    }

    // Envia pelo SMTP
    const result = await sendCampaignEmail(supabase, {
        email: recipient.email,
        name: recipient.name,
        leadId: recipient.lead_id,
        campaignId: recipient.campaign_id,
        templateId: content.template_id,
        recipientId: recipient.id,
        subject: content.subject,
        bodyHtml: content.body_html,
        bodyText: content.body_text,
        fromOverride: campaign.from_name ?? undefined,
        replyTo: campaign.reply_to,
        origin: 'campanha',
    })

    if (result.skippedOptout) {
        await supabase
            .from('email_campaign_recipients')
            .update({
                status: 'optout',
                stopped_at: now.toISOString(),
                stopped_reason: 'optout',
                next_send_at: null,
            })
            .eq('id', recipient.id)
        return { sent: false, stopped: 'optout' }
    }
    if (!result.success) {
        await supabase
            .from('email_campaign_recipients')
            .update({ error_msg: `step ${stepIdx} falhou: ${result.error}` })
            .eq('id', recipient.id)
        // Mantém sequência rodando — próximo step pode dar certo
    }

    // Se foi o último step, marca completed
    if (!nextStep) {
        await supabase
            .from('email_campaign_recipients')
            .update({ stopped_at: now.toISOString(), stopped_reason: 'completed' })
            .eq('id', recipient.id)
        return { sent: result.success, stopped: 'completed' }
    }
    return { sent: result.success, stopped: null }
}

export async function GET(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const now = new Date()

    const { data: recipientsRaw } = await supabase
        .from('email_campaign_recipients')
        .select('id, campaign_id, lead_id, email, name, current_step, next_send_at, stopped_at, stopped_reason')
        .lte('next_send_at', now.toISOString())
        .is('stopped_at', null)
        .order('next_send_at', { ascending: true })
        .limit(BATCH_SIZE)

    const recipients = (recipientsRaw as RecipientRow[] | null) ?? []
    if (recipients.length === 0) {
        return NextResponse.json({ processed: 0, sent: 0, stopped: 0, at: now.toISOString() })
    }

    const campaignIds = [...new Set(recipients.map(r => r.campaign_id))]
    const leadIds = recipients.map(r => r.lead_id).filter((x): x is string => !!x)

    const campaignsById = new Map<string, CampaignRow>()
    const stepsByCamp = new Map<string, StepRow[]>()
    for (const cid of campaignIds) {
        const [camp, steps] = await Promise.all([
            loadCampaign(supabase, cid),
            loadSteps(supabase, cid),
        ])
        if (camp) {
            campaignsById.set(cid, camp)
            stepsByCamp.set(cid, steps)
        }
    }
    const leadStates = await loadLeadStates(supabase, leadIds)

    let processed = 0
    let sent = 0
    let stoppedCount = 0

    for (const r of recipients) {
        const campaign = campaignsById.get(r.campaign_id)
        if (!campaign) continue

        if (campaign.status === 'cancelada' || campaign.status === 'erro') {
            await supabase
                .from('email_campaign_recipients')
                .update({ next_send_at: null, stopped_at: now.toISOString(), stopped_reason: 'cancelled' })
                .eq('id', r.id)
                .is('stopped_at', null)
            processed++
            stoppedCount++
            continue
        }

        const lead = r.lead_id ? leadStates.get(r.lead_id) : undefined
        const stopReason = decideStop(campaign, lead)
        if (stopReason) {
            await supabase
                .from('email_campaign_recipients')
                .update({ next_send_at: null, stopped_at: now.toISOString(), stopped_reason: stopReason })
                .eq('id', r.id)
                .is('stopped_at', null)
            processed++
            stoppedCount++
            continue
        }

        const result = await processRecipient(supabase, r, campaign, stepsByCamp.get(r.campaign_id) ?? [], now)
        processed++
        if (result.sent) sent++
        if (result.stopped) stoppedCount++

        if (SEND_THROTTLE_MS > 0) {
            await new Promise(resolve => setTimeout(resolve, SEND_THROTTLE_MS))
        }
    }

    // Conclui campanhas que não têm mais recipients ativos
    for (const cid of campaignIds) {
        const { count } = await supabase
            .from('email_campaign_recipients')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', cid)
            .is('stopped_at', null)
        if (count === 0) {
            await supabase
                .from('email_campaigns')
                .update({ status: 'concluida', finished_at: now.toISOString() })
                .eq('id', cid)
                .eq('status', 'enviando')
        }
    }

    return NextResponse.json({ processed, sent, stopped: stoppedCount, at: now.toISOString() })
}
