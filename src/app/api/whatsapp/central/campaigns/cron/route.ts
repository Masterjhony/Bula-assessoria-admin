/**
 * /api/whatsapp/central/campaigns/cron
 *
 * Endpoint chamado por Vercel Cron (configurado em vercel.json). Processa
 * recipients com `next_send_at <= now()` em sequências ativas:
 *
 *   1. Para cada recipient elegível, valida as regras de parada da campanha
 *      contra o estado atual do lead (opt-out, handoff, interesse, replied).
 *   2. Se alguma regra dispara → marca stopped_at + stopped_reason e pula.
 *   3. Caso contrário → resolve o step atual (current_step), renderiza o
 *      conteúdo por destinatário e POSTa o lote pro VPS via /campaign-send.
 *   4. Após o envio, avança `current_step` e recalcula `next_send_at` com
 *      base no próximo step (se houver). Quando não há mais step, marca
 *      stopped_at com motivo 'completed'.
 *
 * Idempotência: o cron processa em lotes pequenos (max BATCH_SIZE) e usa
 * locks otimistas — atualiza apenas linhas onde next_send_at ainda combina,
 * pra duas execuções concorrentes não enviarem o mesmo step duas vezes.
 *
 * Autenticação: aceita Authorization: Bearer <CRON_SECRET> (header padrão
 * do Vercel Cron) OU x-webhook-secret igual a WHATSAPP_GROUP_TASK_SECRET
 * (pra disparo manual em dev/admin).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
    addDelay,
    renderForRecipient,
    resolveStepContent,
    type DelayUnit,
} from '@/lib/whatsapp-campaign-step'
import {
    isWhatsappCloudApiConfigured,
    sendCampaignViaCloudApi,
} from '@/lib/whatsapp-cloud-api'

export const maxDuration = 60

const WHATSAPP_SERVER_URL = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001'
const BATCH_SIZE = 50

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
    phone: string
    name: string | null
    current_step: number
    next_send_at: string
    replied_at: string | null
    stopped_at: string | null
    stopped_reason: string | null
}

type CampaignRow = {
    id: string
    status: string
    stop_on_reply: boolean
    stop_on_optout: boolean
    stop_on_handoff: boolean
    stop_on_interest: boolean
}

type StepRow = {
    step_order: number
    delay_value: number
    delay_unit: DelayUnit
    template_id: string | null
    body: string | null
    media_url: string | null
    media_type: string | null
    media_mime: string | null
    media_filename: string | null
    media_caption: string | null
    is_active: boolean
}

type LeadStateRow = {
    id: string
    optout_whatsapp: boolean | null
    handoff_humano: boolean | null
    interesse_principal: string | null
}

async function loadCampaign(supabase: SupabaseClient, id: string): Promise<CampaignRow | null> {
    const { data } = await supabase
        .from('whatsapp_campaigns')
        .select('id, status, stop_on_reply, stop_on_optout, stop_on_handoff, stop_on_interest')
        .eq('id', id)
        .single()
    return (data as CampaignRow | null) ?? null
}

async function loadSteps(supabase: SupabaseClient, campaignId: string): Promise<StepRow[]> {
    const { data } = await supabase
        .from('whatsapp_campaign_steps')
        .select('step_order, delay_value, delay_unit, template_id, body, media_url, media_type, media_mime, media_filename, media_caption, is_active')
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
        .select('id, optout_whatsapp, handoff_humano, interesse_principal')
        .in('id', leadIds)
    for (const row of (data as LeadStateRow[] | null) ?? []) map.set(row.id, row)
    return map
}

function decideStop(
    campaign: CampaignRow,
    recipient: RecipientRow,
    lead: LeadStateRow | undefined,
): string | null {
    if (recipient.replied_at && campaign.stop_on_reply) return 'replied'
    if (lead?.optout_whatsapp && campaign.stop_on_optout) return 'optout'
    if (lead?.handoff_humano && campaign.stop_on_handoff) return 'handoff'
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
    const stepIdx = recipient.current_step  // current_step aponta pro próximo a enviar
    const step = steps.find(s => s.step_order === stepIdx && s.is_active !== false)
    if (!step) {
        // Não há step pra enviar — sequência completou
        await supabase
            .from('whatsapp_campaign_recipients')
            .update({ next_send_at: null, stopped_at: now.toISOString(), stopped_reason: 'completed' })
            .eq('id', recipient.id)
            .eq('current_step', stepIdx) // lock otimista
        return { sent: false, stopped: 'completed' }
    }

    const content = await resolveStepContent(supabase, step)
    if (!content.body.trim() && !content.media && !content.poll) {
        // Step vazio — completa a sequência neste recipient
        await supabase
            .from('whatsapp_campaign_recipients')
            .update({ next_send_at: null, stopped_at: now.toISOString(), stopped_reason: 'completed' })
            .eq('id', recipient.id)
            .eq('current_step', stepIdx)
        return { sent: false, stopped: 'completed' }
    }

    const rendered = renderForRecipient(content, {
        id: recipient.id,
        lead_id: recipient.lead_id,
        phone: recipient.phone,
        name: recipient.name,
    })

    // Calcula next_send_at do PRÓXIMO step (stepIdx + 1)
    const nextStep = steps.find(s => s.step_order === stepIdx + 1 && s.is_active !== false)
    const nextAt = nextStep ? addDelay(now, nextStep.delay_value, nextStep.delay_unit) : null

    // Lock otimista: atualiza somente se ninguém mudou o current_step no meio
    const { data: updated, error } = await supabase
        .from('whatsapp_campaign_recipients')
        .update({
            current_step: stepIdx + 1,
            next_send_at: nextAt,
            // Quando há mais step, status segue 'pendente'; quando NÃO há,
            // marcamos stopped='completed' depois do envio bem-sucedido
            // (abaixo, via update separado — evita 'completed' contar como erro).
        })
        .eq('id', recipient.id)
        .eq('current_step', stepIdx)        // lock
        .select('id')
        .single()
    if (error || !updated) {
        // Outro worker pegou; nada a fazer
        return { sent: false, stopped: null }
    }

    // Envia pro VPS — uma chamada por recipient (cron evita atrasar lotes
    // grandes esperando uma única latência longa do VPS). Concorrência
    // controlada pelo BATCH_SIZE acima.
    if (isWhatsappCloudApiConfigured()) {
        const cloud = await sendCampaignViaCloudApi(supabase, {
            campaignId: recipient.campaign_id,
            recipients: [rendered],
            media: content.media,
            poll: content.poll,
            templateName: content.template_slug,
            completeAfterSend: !nextStep,
        })
        if (cloud.sent === 0) {
            return { sent: false, stopped: 'send_failed' }
        }
    } else {
    try {
        await fetch(`${WHATSAPP_SERVER_URL}/campaign-send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                campaign_id: recipient.campaign_id,
                recipients: [rendered],
                media: content.media,
                poll: content.poll,
            }),
            signal: AbortSignal.timeout(15000),
        })
    } catch (e) {
        // Marca falha NESTE step (mas mantém a sequência rodando — o próximo
        // step ainda pode dar certo). Logar pra investigação.
        console.warn('[campaigns/cron] falha ao enviar pro VPS:', e instanceof Error ? e.message : e)
        await supabase
            .from('whatsapp_campaign_recipients')
            .update({ error_msg: `step ${stepIdx} falhou: ${e instanceof Error ? e.message : 'erro'}` })
            .eq('id', recipient.id)
    }
    }

    // Se este foi o último step, marca como completed
    if (!nextStep) {
        await supabase
            .from('whatsapp_campaign_recipients')
            .update({ stopped_at: now.toISOString(), stopped_reason: 'completed' })
            .eq('id', recipient.id)
        return { sent: true, stopped: 'completed' }
    }
    return { sent: true, stopped: null }
}

export async function GET(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const now = new Date()

    // Carrega recipients elegíveis (lock otimista por linha mais embaixo)
    const { data: recipientsRaw } = await supabase
        .from('whatsapp_campaign_recipients')
        .select('id, campaign_id, lead_id, phone, name, current_step, next_send_at, replied_at, stopped_at, stopped_reason')
        .lte('next_send_at', now.toISOString())
        .is('stopped_at', null)
        .order('next_send_at', { ascending: true })
        .limit(BATCH_SIZE)

    const recipients = (recipientsRaw as RecipientRow[] | null) ?? []
    if (recipients.length === 0) {
        return NextResponse.json({ processed: 0, sent: 0, stopped: 0, at: now.toISOString() })
    }

    // Agrupa por campanha (uma busca de campanha e steps por id) e por lead
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

        // Campanhas canceladas / em erro não devem mais avançar
        if (campaign.status === 'cancelada' || campaign.status === 'erro') {
            await supabase
                .from('whatsapp_campaign_recipients')
                .update({ next_send_at: null, stopped_at: now.toISOString(), stopped_reason: 'cancelled' })
                .eq('id', r.id)
                .is('stopped_at', null)
            processed++
            stoppedCount++
            continue
        }

        const lead = r.lead_id ? leadStates.get(r.lead_id) : undefined
        const stopReason = decideStop(campaign, r, lead)
        if (stopReason) {
            await supabase
                .from('whatsapp_campaign_recipients')
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
    }

    // Marca campanhas que não têm mais recipients ativos como concluídas
    for (const cid of campaignIds) {
        const { count } = await supabase
            .from('whatsapp_campaign_recipients')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', cid)
            .is('stopped_at', null)
        if (count === 0) {
            await supabase
                .from('whatsapp_campaigns')
                .update({ status: 'concluida', finished_at: now.toISOString() })
                .eq('id', cid)
                .eq('status', 'enviando')
        }
    }

    return NextResponse.json({ processed, sent, stopped: stoppedCount, at: now.toISOString() })
}
