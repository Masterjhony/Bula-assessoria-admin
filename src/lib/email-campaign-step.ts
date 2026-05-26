/**
 * Helpers compartilhados entre o disparo inicial da campanha de e-mail
 * (/send) e o processador agendado (/cron). Espelha
 * src/lib/whatsapp-campaign-step.ts mas com payload de e-mail (subject +
 * body_html + body_text).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface EmailStepContent {
    subject: string
    body_html: string
    body_text: string | null
    template_id: string | null
    template_slug: string | null
}

export interface EmailStepLike {
    template_id: string | null
    subject: string | null
    body_html: string | null
    body_text: string | null
}

/**
 * Resolve o conteúdo de um step de e-mail (ou do passo 0, que é a própria
 * campanha). Mescla: campos do step sobrescrevem campos do template; se um
 * campo do step está vazio, cai pro template; se nem step nem template tem,
 * fica vazio (erro tratado fora).
 */
export async function resolveEmailStepContent(
    supabase: SupabaseClient,
    step: EmailStepLike,
): Promise<EmailStepContent> {
    let subject = step.subject ?? ''
    let body_html = step.body_html ?? ''
    let body_text = step.body_text ?? null
    let template_slug: string | null = null

    if (step.template_id) {
        const { data: tpl } = await supabase
            .from('email_templates')
            .select('slug, subject, body_html, body_text')
            .eq('id', step.template_id)
            .single()
        if (tpl) {
            template_slug = tpl.slug
            if (!subject && tpl.subject) subject = tpl.subject
            if (!body_html && tpl.body_html) body_html = tpl.body_html
            if (!body_text && tpl.body_text) body_text = tpl.body_text
        }
    }

    return {
        subject,
        body_html,
        body_text,
        template_id: step.template_id,
        template_slug,
    }
}
