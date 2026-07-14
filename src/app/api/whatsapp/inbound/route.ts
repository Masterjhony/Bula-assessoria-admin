/**
 * /api/whatsapp/inbound — recebe mensagens individuais do VPS (Baileys) e
 * devolve a próxima resposta do bot ao VPS (que a entrega pelo número Baileys).
 *
 * Todo o miolo (encontra/cria lead, registra inbound, roda o grafo do fluxo)
 * vive em `src/lib/whatsapp-inbound.ts` e é compartilhado com o webhook oficial
 * (/api/whatsapp/cloud/webhook). Aqui ficam só a autenticação do VPS e o
 * contrato de resposta JSON: `{ silent?: true } | { reply, bot_step? }`.
 *
 * Autenticação: header `x-webhook-secret` deve bater com `WHATSAPP_GROUP_TASK_SECRET`.
 *
 * Para mudar o comportamento do bot, edite o grafo via /api/whatsapp/central/flow
 * ou pela aba "Fluxo" da Central WhatsApp.
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/whatsapp-central'
import { processInboundMessage, mirrorOutboundMessage } from '@/lib/whatsapp-inbound'
import { resolveBaileysInbox } from '@/lib/whatsapp-inboxes'

export const maxDuration = 120

export async function POST(req: NextRequest) {
    const SECRET = process.env.WHATSAPP_GROUP_TASK_SECRET || ''
    const auth = req.headers.get('x-webhook-secret')
    if (!SECRET || auth !== SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { phone: string; name?: string; body: string; message_id?: string; session?: string; from_me?: boolean }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const phone = normalizePhone(body.phone)
    const text = (body.body || '').trim()
    if (!phone || !text) {
        return NextResponse.json({ error: 'phone e body são obrigatórios' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Qual caixa Baileys recebeu (o VPS manda o sessionId). O flag do inbox
    // decide se a automação (concierge/welcome) roda ou se é atendimento manual.
    const inbox = await resolveBaileysInbox(supabase, body.session)

    // Espelho: o dono do número respondeu pelo aparelho (fromMe) → registra como
    // outbound e atualiza o CRM, sem rodar concierge nem devolver resposta.
    if (body.from_me) {
        await mirrorOutboundMessage(supabase, {
            phone,
            text,
            messageId: body.message_id ?? null,
            inboxId: inbox?.id ?? body.session ?? null,
            channel: 'baileys',
        })
        return NextResponse.json({ silent: true, reason: 'mirror_outbound' })
    }

    const outcome = await processInboundMessage(supabase, {
        phone,
        senderName: body.name,
        text,
        messageId: body.message_id ?? null,
        channel: 'baileys',
        inboxId: inbox?.id ?? body.session ?? null,
        automationsEnabled: inbox?.automations_enabled ?? true,
    })

    // Efeitos caros (crédito, avisos ao grupo, ficha às leiloeiras) rodam depois
    // da resposta: quem entrega a mensagem é o VPS, e ele não pode ficar
    // esperando consulta externa pra falar com o lead.
    if (outcome.after) {
        after(() => outcome.after!().catch(err =>
            console.warn('[inbound] efeitos pós-resposta falharam:', err instanceof Error ? err.message : err),
        ))
    }

    if (outcome.kind === 'silent') {
        return NextResponse.json({ silent: true, reason: outcome.reason })
    }
    return NextResponse.json({ reply: outcome.reply, bot_step: outcome.bot_step })
}
