/**
 * /api/whatsapp/central/campaigns/[id]/send
 *
 * Dispara o passo 0 da campanha imediatamente e agenda os passos 1+ (se a
 * campanha tiver steps definidos em `whatsapp_campaign_steps`) gravando
 * `next_send_at` em cada recipient. O cron em
 * /api/whatsapp/central/campaigns/cron acorda periodicamente e processa os
 * recipients com `next_send_at <= now()`.
 *
 * Idempotente: campanhas que não estão em 'rascunho' retornam 409.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { resolveSegment, type SegmentFilters } from '@/lib/whatsapp-segment'
import { ensureAudienceTagForTemplate } from '@/lib/whatsapp-audience-tags'
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

const WHATSAPP_SERVER_URL = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001'

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { id } = await params

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Carrega campanha (incluindo conteúdo do passo 0)
    const { data: campaign, error: cErr } = await supabase
        .from('whatsapp_campaigns')
        .select('id, name, segment, template_id, body, status, media_url, media_type, media_mime, media_filename, media_caption')
        .eq('id', id)
        .single()
    if (cErr || !campaign) {
        return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
    }
    if (campaign.status !== 'rascunho') {
        return NextResponse.json({ error: `Campanha está em "${campaign.status}", não pode ser disparada novamente.` }, { status: 409 })
    }

    // Resolve conteúdo do passo 0 (campanha em si)
    const step0 = await resolveStepContent(supabase, {
        template_id: campaign.template_id,
        body: campaign.body,
        media_url: campaign.media_url,
        media_type: campaign.media_type,
        media_mime: campaign.media_mime,
        media_filename: campaign.media_filename,
        media_caption: campaign.media_caption,
    })

    if (!step0.body.trim() && !step0.media && !step0.poll) {
        return NextResponse.json({ error: 'Campanha sem mensagem, mídia ou enquete no passo 0' }, { status: 400 })
    }

    // Steps adicionais (passo 1+) — usados para calcular next_send_at
    const { data: steps } = await supabase
        .from('whatsapp_campaign_steps')
        .select('step_order, delay_value, delay_unit, is_active')
        .eq('campaign_id', id)
        .order('step_order', { ascending: true })
    const firstFollowUp = (steps ?? []).find(s => s.step_order === 1 && s.is_active !== false)

    // Resolve segmento
    const segment = (campaign.segment ?? {}) as SegmentFilters
    let recipients: Array<{ id: string; nome: string; telefone: string }> = []
    try {
        recipients = await resolveSegment(supabase, segment)
    } catch (e: unknown) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao resolver segmento' }, { status: 500 })
    }

    if (recipients.length === 0) {
        await supabase
            .from('whatsapp_campaigns')
            .update({
                status: 'concluida',
                total_recipients: 0,
                started_at: new Date().toISOString(),
                finished_at: new Date().toISOString(),
            })
            .eq('id', id)
        return NextResponse.json({ success: true, queued: 0, message: 'Segmento sem leads — campanha marcada como concluída.' })
    }

    // Materializa recipients. current_step=1 indica que o passo 0 vai ser
    // enviado agora; o cron pega quando current_step apontar pra um step
    // futuro com next_send_at <= now().
    const now = new Date()
    const nextAt = firstFollowUp
        ? addDelay(now, firstFollowUp.delay_value, firstFollowUp.delay_unit as DelayUnit)
        : null

    const rows = recipients.map(r => ({
        campaign_id: id,
        lead_id: r.id,
        phone: r.telefone,
        name: r.nome,
        status: 'pendente',
        current_step: 1,            // passo 0 sendo enviado agora → próximo seria 1
        next_send_at: nextAt,       // null se não houver follow-up
    }))
    const { data: insertedRecipients, error: rErr } = await supabase
        .from('whatsapp_campaign_recipients')
        .insert(rows)
        .select('id, lead_id, phone, name')
    if (rErr) {
        return NextResponse.json({ error: rErr.message }, { status: 500 })
    }

    // Audiência: se template iniciador tem tag mapeada, garante que todos
    // os recipients carreguem antes da resposta deles chegar.
    let audienceTagged: { tag: string | null; updated: number } = { tag: null, updated: 0 }
    try {
        audienceTagged = await ensureAudienceTagForTemplate(
            supabase,
            recipients.map(r => r.id),
            step0.template_slug,
        )
    } catch (e) {
        console.warn('[campaigns/send] ensureAudienceTagForTemplate falhou:', e instanceof Error ? e.message : e)
    }

    // Atualiza campanha → enviando
    await supabase
        .from('whatsapp_campaigns')
        .update({
            status: 'enviando',
            total_recipients: recipients.length,
            started_at: now.toISOString(),
        })
        .eq('id', id)

    // Renderiza por destinatário e dispara o passo 0 no VPS
    const renderedRecipients = (insertedRecipients ?? []).map(r => renderForRecipient(step0, r))

    let cloudSummary: Awaited<ReturnType<typeof sendCampaignViaCloudApi>> | null = null
    if (isWhatsappCloudApiConfigured()) {
        cloudSummary = await sendCampaignViaCloudApi(supabase, {
            campaignId: id,
            recipients: renderedRecipients,
            media: step0.media,
            poll: step0.poll,
            templateName: step0.template_slug,
            completeAfterSend: !firstFollowUp,
        })

        const finalStatus = cloudSummary.sent === 0
            ? 'erro'
            : firstFollowUp
                ? 'enviando'
                : 'concluida'

        await supabase
            .from('whatsapp_campaigns')
            .update({
                status: finalStatus,
                sent_count: cloudSummary.sent,
                failed_count: cloudSummary.failed,
                ...(finalStatus === 'concluida' || finalStatus === 'erro' ? { finished_at: new Date().toISOString() } : {}),
            })
            .eq('id', id)

        if (cloudSummary.sent === 0 && cloudSummary.failed > 0) {
            return NextResponse.json(
                { error: cloudSummary.results[0]?.error ?? 'Falha ao enviar pela WhatsApp Cloud API', cloud: cloudSummary },
                { status: 502 }
            )
        }
    } else {
        try {
            await fetch(`${WHATSAPP_SERVER_URL}/campaign-send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaign_id: id,
                    recipients: renderedRecipients,
                    media: step0.media,
                    poll: step0.poll,
                }),
                signal: AbortSignal.timeout(30000),
            })
        } catch (e: unknown) {
            await supabase
                .from('whatsapp_campaigns')
                .update({ status: 'erro' })
                .eq('id', id)
            return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao enviar para o VPS' }, { status: 502 })
        }
    }

    return NextResponse.json({
        success: true,
        queued: renderedRecipients.length,
        sent: cloudSummary?.sent,
        failed: cloudSummary?.failed,
        channel: cloudSummary ? 'cloud_api' : 'vps',
        audience_tag: audienceTagged.tag,
        audience_tagged: audienceTagged.updated,
        has_media: !!step0.media,
        has_poll: !!step0.poll,
        follow_up_scheduled: !!firstFollowUp,
        next_send_at: nextAt,
    })
}
