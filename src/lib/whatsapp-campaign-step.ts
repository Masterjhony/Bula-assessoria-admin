/**
 * Helpers compartilhados entre o disparo inicial da campanha (/send) e o
 * processador agendado (/cron). Responsável por:
 *
 *   1. Resolver o conteúdo final de um step (body + media + poll) a partir
 *      do que vier no step OU, se vazio, do que vier no template (template_id
 *      do step), aplicando os mesmos overrides de mídia da campanha original.
 *   2. Calcular `next_send_at` a partir do delay_value/delay_unit do próximo
 *      step relativo ao envio anterior.
 *   3. Renderizar mensagens por destinatário (substitui {nome}).
 *
 * O VPS recebe sempre via `/campaign-send` — assim os envios respeitam a
 * mesma fila e o callback de status existente em /api/whatsapp/campaign-callback.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { firstName, renderTemplate } from './whatsapp-central'
import { getR2DownloadUrl } from './r2'

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

export interface ResolvedStepContent {
    body: string                 // já com variáveis SEM substituir — por-destinatário no render
    template_slug: string | null
    caption: string | null       // bruto, sem substituir
    media: { url: string; type: string; mime?: string | null; filename?: string | null } | null
    poll: { question: string; options: string[]; selectable_count: number } | null
}

export interface StepLike {
    template_id: string | null
    body: string | null
    media_url: string | null
    media_type: string | null
    media_mime: string | null
    media_filename: string | null
    media_caption: string | null
}

/**
 * Resolve o conteúdo de um step (ou do passo 0, que é a própria campanha).
 *
 * Regra de override (mesma da campanha original):
 *   - Se `step.media_url` está preenchido → usa essa mídia
 *   - Senão, se `step.template_id` aponta pra template com mídia → usa a do template
 *   - Body / caption seguem mesma lógica
 *
 * O presigned URL da mídia tem TTL de 30min — tempo suficiente pra fila do
 * VPS escoar. Se a sequência atrasar mais que isso, o cron renova ao
 * agendar o step.
 */
export async function resolveStepContent(
    supabase: SupabaseClient,
    step: StepLike,
): Promise<ResolvedStepContent> {
    let body = step.body ?? ''
    let template_slug: string | null = null
    let caption: string | null = null
    let media: ResolvedStepContent['media'] = null
    let poll: ResolvedStepContent['poll'] = null

    if (step.template_id) {
        const { data: tpl } = await supabase
            .from('whatsapp_templates')
            .select('slug, body, media_url, media_type, media_mime, media_filename, media_caption, poll_question, poll_options, poll_selectable_count')
            .eq('id', step.template_id)
            .single()
        if (tpl?.body && !body) body = tpl.body
        template_slug = tpl?.slug ?? null
        caption = tpl?.media_caption ?? null

        if (tpl?.media_url && tpl?.media_type) {
            try {
                const url = await getR2DownloadUrl(tpl.media_url, { expiresInSeconds: 1800 })
                media = {
                    url,
                    type: tpl.media_type,
                    mime: tpl.media_mime,
                    filename: tpl.media_filename,
                }
            } catch (e) {
                console.warn('[campaign-step] presign mídia do template falhou:', e instanceof Error ? e.message : e)
            }
        }
        if (tpl?.poll_question && Array.isArray(tpl.poll_options) && tpl.poll_options.length >= 2) {
            poll = {
                question: tpl.poll_question,
                options: tpl.poll_options as string[],
                selectable_count: tpl.poll_selectable_count ?? 1,
            }
        }
    }

    // Override por step (igual à override por campanha)
    if (step.media_url && step.media_type) {
        try {
            const url = await getR2DownloadUrl(step.media_url, { expiresInSeconds: 1800 })
            media = {
                url,
                type: step.media_type,
                mime: step.media_mime,
                filename: step.media_filename,
            }
            if (step.media_caption) caption = step.media_caption
        } catch (e) {
            console.warn('[campaign-step] presign mídia do step falhou:', e instanceof Error ? e.message : e)
        }
    }

    return { body, template_slug, caption, media, poll }
}

/**
 * Renderiza o conteúdo do step para um destinatário específico (substitui
 * {nome} no body e na caption). Devolve o payload que o VPS espera em
 * /campaign-send para esse recipient.
 */
export function renderForRecipient(
    content: ResolvedStepContent,
    recipient: { id: string; phone: string; name: string | null },
): { recipient_id: string; phone: string; message: string; caption: string | null } {
    const vars = {
        nome: firstName(recipient.name) || 'amigo(a)',
        name: recipient.name || '',
    }
    return {
        recipient_id: recipient.id,
        phone: recipient.phone,
        message: content.body ? renderTemplate(content.body, vars) : '',
        caption: content.caption ? renderTemplate(content.caption, vars) : null,
    }
}
