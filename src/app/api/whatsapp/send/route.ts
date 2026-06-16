/**
 * POST /api/whatsapp/send — envio 1:1 pelo gateway.
 *
 * Ponto de entrada HTTP do `sendOutbound`. Usado pelas ações de WhatsApp nos
 * cards do CRM (responder lead, enviar template) e por integrações internas.
 * O gateway decide o canal (Baileys/Cloud) e aplica os guard rails.
 *
 * Body: { phone, leadId?, name?, text?, templateName?, templateLanguage?,
 *         intent?, channelHint?, origin? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { sendOutbound, type OutboundIntent, type Channel } from '@/lib/whatsapp-gateway'
import { metaTemplateName } from '@/lib/whatsapp-cloud-api'
import { renderTemplate, firstName } from '@/lib/whatsapp-central'

const VALID_INTENTS: OutboundIntent[] = ['crm_reply', 'assessor', 'campaign', 'bot', 'broadcast']

export async function POST(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body: {
        phone?: string
        leadId?: string | null
        name?: string | null
        text?: string | null
        templateId?: string | null
        templateName?: string | null
        templateLanguage?: string | null
        intent?: string
        channelHint?: string
        origin?: string
    }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }

    const phone = (body.phone || '').trim()
    if (!phone) return NextResponse.json({ error: 'phone é obrigatório' }, { status: 400 })

    const intent: OutboundIntent =
        body.intent && (VALID_INTENTS as string[]).includes(body.intent)
            ? (body.intent as OutboundIntent)
            : 'crm_reply'

    let channelHint: Channel | 'auto' =
        body.channelHint === 'baileys' || body.channelHint === 'cloud'
            ? (body.channelHint as Channel)
            : 'auto'

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Resolve o conteúdo. Por templateId: se aprovado na Meta, manda template
    // oficial pela Cloud; senão renderiza o corpo e manda como texto (Baileys/
    // janela aberta). Sem templateId, usa o texto livre.
    let text = body.text ?? null
    let templateName = body.templateName ?? null
    let templateLanguage = body.templateLanguage ?? null

    if (body.templateId) {
        const { data: tpl, error: tErr } = await supabase
            .from('whatsapp_templates')
            .select('slug, body, meta_status, meta_language')
            .eq('id', body.templateId)
            .single()
        if (tErr || !tpl) {
            return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
        }
        if (tpl.meta_status === 'APPROVED') {
            templateName = metaTemplateName(tpl.slug)
            templateLanguage = tpl.meta_language || templateLanguage
            channelHint = 'cloud'
            text = null
        } else {
            if (!tpl.body?.trim()) {
                return NextResponse.json({ error: 'Template sem corpo de texto para enviar.' }, { status: 400 })
            }
            const nm = body.name ?? null
            text = renderTemplate(tpl.body, { nome: firstName(nm), name: nm })
        }
    }

    if (!text && !templateName) {
        return NextResponse.json({ error: 'text, templateId ou templateName é obrigatório' }, { status: 400 })
    }

    const result = await sendOutbound(supabase, {
        to: { phone, leadId: body.leadId ?? null, name: body.name ?? null },
        text,
        templateName,
        templateLanguage,
        intent,
        channelHint,
        origin: body.origin ?? 'crm-manual',
    })

    // held/blocked não são erro de servidor — devolvem 200 com o motivo para a
    // UI explicar (ex: "fora da janela de 24h, escolha um template").
    const httpStatus = result.status === 'failed' ? 502 : 200
    return NextResponse.json(result, { status: httpStatus })
}
