/**
 * /api/email/central/campaigns/[id]/send
 *
 * Materializa os destinatários (resolve segmento), dispara o passo 0
 * IMEDIATAMENTE pelo SMTP, e agenda os passos 1+ (se houver) via
 * `next_send_at`. O cron em /api/email/central/campaigns/cron acorda
 * periodicamente e processa o restante.
 *
 * Idempotente: campanhas que não estão em 'rascunho' retornam 409.
 *
 * Limitação SMTP Hostinger: rate limit ~100-300/dia. Este endpoint envia
 * o passo 0 sequencialmente (com pequeno espaçamento) e marca cada
 * recipient como 'enviado'/'falhou' no banco. Se o segmento for muito
 * grande, o operador deve dividir em campanhas menores ou aceitar o tempo
 * de processamento aqui.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { resolveEmailSegment, type EmailSegmentFilters } from '@/lib/email-segment'
import { resolveEmailStepContent } from '@/lib/email-campaign-step'
import { addDelay, sendCampaignEmail } from '@/lib/email-marketing'

export const maxDuration = 300  // Vercel: até 5min pro disparo do passo 0

// Espaçamento mínimo entre envios sequenciais (ms). Hostinger é tranquilo
// com 500ms-1s. Configurável no futuro via site_settings se precisar.
const SEND_THROTTLE_MS = 800

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id } = await params

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: campaign, error: cErr } = await supabase
        .from('email_campaigns')
        .select('id, name, segment, template_id, subject, body_html, body_text, status, audience_tag, from_name, reply_to')
        .eq('id', id)
        .single()
    if (cErr || !campaign) {
        return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
    }
    if (campaign.status !== 'rascunho') {
        return NextResponse.json(
            { error: `Campanha está em "${campaign.status}", não pode ser disparada novamente.` },
            { status: 409 },
        )
    }

    // Resolve passo 0 (subject + body_html, mesclando com template se houver)
    const step0 = await resolveEmailStepContent(supabase, {
        template_id: campaign.template_id,
        subject: campaign.subject,
        body_html: campaign.body_html,
        body_text: campaign.body_text,
    })
    if (!step0.subject.trim() || !step0.body_html.trim()) {
        return NextResponse.json(
            { error: 'Campanha sem subject/body no passo 0 (mesmo após resolver template).' },
            { status: 400 },
        )
    }

    // Steps adicionais (passo 1+) — pra calcular next_send_at
    const { data: steps } = await supabase
        .from('email_campaign_steps')
        .select('step_order, delay_value, delay_unit, is_active')
        .eq('campaign_id', id)
        .order('step_order', { ascending: true })
    const firstFollowUp = (steps ?? []).find(s => s.step_order === 1 && s.is_active !== false)

    // Resolve segmento
    const segment = (campaign.segment ?? {}) as EmailSegmentFilters
    let recipients: Array<{ id: string; nome: string; email: string }> = []
    try {
        recipients = await resolveEmailSegment(supabase, segment)
    } catch (e: unknown) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : 'Erro ao resolver segmento' },
            { status: 500 },
        )
    }

    if (recipients.length === 0) {
        await supabase
            .from('email_campaigns')
            .update({
                status: 'concluida',
                total_recipients: 0,
                started_at: new Date().toISOString(),
                finished_at: new Date().toISOString(),
            })
            .eq('id', id)
        return NextResponse.json({ success: true, queued: 0, message: 'Segmento sem leads — campanha marcada como concluída.' })
    }

    // Materializa recipients (current_step=1 → passo 0 sendo enviado agora;
    // next_send_at aponta pro passo 1 se houver follow-up)
    const now = new Date()
    const nextAt = firstFollowUp
        ? addDelay(now, firstFollowUp.delay_value, firstFollowUp.delay_unit as 'minutes' | 'hours' | 'days')
        : null

    const rows = recipients.map(r => ({
        campaign_id: id,
        lead_id: r.id,
        email: r.email,
        name: r.nome,
        status: 'pendente' as const,
        current_step: 1,
        next_send_at: nextAt,
    }))
    const { data: inserted, error: rErr } = await supabase
        .from('email_campaign_recipients')
        .insert(rows)
        .select('id, lead_id, email, name')
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

    // Audiência: aplica tag se configurada
    if (campaign.audience_tag) {
        const leadIds = recipients.map(r => r.id)
        try {
            const { data: leadsToTag } = await supabase
                .from('crm_leads')
                .select('id, tags_whatsapp')
                .in('id', leadIds)
            for (const lead of (leadsToTag ?? []) as Array<{ id: string; tags_whatsapp: string[] | null }>) {
                const tags = new Set<string>(Array.isArray(lead.tags_whatsapp) ? lead.tags_whatsapp : [])
                tags.add(campaign.audience_tag)
                await supabase
                    .from('crm_leads')
                    .update({ tags_whatsapp: Array.from(tags) })
                    .eq('id', lead.id)
            }
        } catch (e) {
            console.warn('[email/send] audience_tag falhou:', e instanceof Error ? e.message : e)
        }
    }

    await supabase
        .from('email_campaigns')
        .update({
            status: 'enviando',
            total_recipients: recipients.length,
            started_at: now.toISOString(),
        })
        .eq('id', id)

    // Dispara passo 0 sequencialmente. Throttle entre envios pra não estourar
    // limite SMTP do Hostinger.
    let sent = 0
    let failed = 0
    let skipped = 0
    for (const recipient of inserted ?? []) {
        const result = await sendCampaignEmail(supabase, {
            email: recipient.email,
            name: recipient.name,
            leadId: recipient.lead_id,
            campaignId: id,
            templateId: campaign.template_id,
            recipientId: recipient.id,
            subject: step0.subject,
            bodyHtml: step0.body_html,
            bodyText: step0.body_text,
            fromOverride: campaign.from_name ?? undefined,
            replyTo: campaign.reply_to,
            origin: 'campanha',
        })

        if (result.skippedOptout) {
            skipped++
            await supabase
                .from('email_campaign_recipients')
                .update({
                    status: 'optout',
                    stopped_at: new Date().toISOString(),
                    stopped_reason: 'optout',
                    next_send_at: null,
                })
                .eq('id', recipient.id)
        } else if (result.success) {
            sent++
            await supabase
                .from('email_campaign_recipients')
                .update({ status: 'enviado', sent_at: new Date().toISOString() })
                .eq('id', recipient.id)
        } else {
            failed++
            await supabase
                .from('email_campaign_recipients')
                .update({ status: 'falhou', error_msg: result.error ?? 'erro desconhecido' })
                .eq('id', recipient.id)
        }

        if (SEND_THROTTLE_MS > 0) {
            await new Promise(resolve => setTimeout(resolve, SEND_THROTTLE_MS))
        }
    }

    // Atualiza contadores; se não há follow-up, conclui campanha
    const updateCampaign: Record<string, unknown> = {
        sent_count: sent,
        failed_count: failed,
        optout_skip_count: skipped,
    }
    if (!firstFollowUp) {
        updateCampaign.status = 'concluida'
        updateCampaign.finished_at = new Date().toISOString()
    }
    await supabase.from('email_campaigns').update(updateCampaign).eq('id', id)

    return NextResponse.json({
        success: true,
        queued: recipients.length,
        sent,
        failed,
        skipped_optout: skipped,
        follow_up_scheduled: !!firstFollowUp,
        next_send_at: nextAt,
    })
}
