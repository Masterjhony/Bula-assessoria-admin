/**
 * /api/whatsapp/inbound — recebe mensagens individuais do VPS e:
 *   1. Encontra (ou cria) o lead correspondente no CRM
 *   2. Registra a inbound em whatsapp_messages
 *   3. Carrega o grafo do fluxo (site_settings.whatsapp_flow_v2 ou default em código)
 *   4. Executa o interpretador do grafo (src/lib/whatsapp-flow-engine.ts)
 *   5. Devolve a próxima resposta do bot ao VPS, ou pede silêncio
 *
 * Autenticação: header `x-webhook-secret` deve bater com `WHATSAPP_GROUP_TASK_SECRET`.
 * O VPS espera resposta JSON: `{ silent?: true } | { reply: string, bot_step?: string }`.
 *
 * A lógica de classificação, gates e envio está toda no grafo. Para mudar
 * o comportamento do bot, edite o grafo via /api/whatsapp/central/flow ou
 * pela aba "Fluxo" da Central WhatsApp.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone, phoneVariants } from '@/lib/whatsapp-central'
import {
    runFlow,
    type LeadShape,
} from '@/lib/whatsapp-flow-engine'
import { readPauseState } from '@/lib/whatsapp-pause'
import { handleCampaignReply } from '@/lib/whatsapp-campaign-reply'
import { loadActiveFlowWithSettings } from '@/lib/whatsapp-flows'
import { isWithinAllowedHours } from '@/lib/whatsapp-flow-settings'

export const maxDuration = 30

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

async function findLeadByPhone(
    supabase: ReturnType<typeof getSupabase>,
    phone: string
): Promise<LeadShape | null> {
    const variants = phoneVariants(phone)
    if (variants.length === 0) return null
    const { data } = await supabase
        .from('crm_leads')
        .select('id, nome, telefone, interesse_principal, handoff_humano, handoff_at, optout_whatsapp, contact_history, contact_count, tags_whatsapp, stage, status, notes')
        .in('telefone', variants)
        .order('created_at', { ascending: false })
        .limit(1)
    return (data?.[0] as LeadShape) ?? null
}

async function createLeadFromInbound(
    supabase: ReturnType<typeof getSupabase>,
    phone: string,
    name: string
): Promise<LeadShape | null> {
    const { data: maxPos } = await supabase
        .from('crm_leads')
        .select('position')
        .order('position', { ascending: false })
        .limit(1)
    const position = (maxPos?.[0]?.position ?? 0) + 1000

    const { data: lead, error } = await supabase
        .from('crm_leads')
        .insert({
            nome: name || phone,
            telefone: phone,
            origem: 'whatsapp-central',
            stage: 'novo',
            status: 'Lead',
            source: 'whatsapp',
            medium: 'inbound',
            campaign: 'central-whatsapp',
            position,
            last_whatsapp_at: new Date().toISOString(),
        })
        .select('id, nome, telefone, interesse_principal, handoff_humano, handoff_at, optout_whatsapp, contact_history, contact_count, tags_whatsapp, stage, status, notes')
        .single()

    if (error) {
        console.error('[Inbound] Erro ao criar lead:', error)
        return null
    }
    return lead as LeadShape
}

function logInbound(
    supabase: ReturnType<typeof getSupabase>,
    args: { phone: string; name: string; body: string; lead_id: string | null }
) {
    void supabase.from('whatsapp_messages').insert({
        phone: args.phone,
        name: args.name,
        status: 'received',
        body: args.body,
        direction: 'inbound',
        origin: 'central-inbound',
        lead_id: args.lead_id,
    }).then(({ error }) => {
        if (error) console.warn('[Inbound] log inbound:', error.message)
    })
}

// loadGraph foi removido — agora chamamos loadActiveFlow(supabase) diretamente,
// que consulta whatsapp_flows.is_active=true com fallback p/ site_settings.whatsapp_flow_v2
// e por fim buildDefaultGraph().

export async function POST(req: NextRequest) {
    const SECRET = process.env.WHATSAPP_GROUP_TASK_SECRET || ''
    const auth = req.headers.get('x-webhook-secret')
    if (!SECRET || auth !== SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { phone: string; name?: string; body: string; message_id?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const phone = normalizePhone(body.phone)
    const text = (body.body || '').trim()
    const senderName = body.name?.trim() || ''
    if (!phone || !text) {
        return NextResponse.json({ error: 'phone e body são obrigatórios' }, { status: 400 })
    }

    const supabase = getSupabase()

    let lead = await findLeadByPhone(supabase, phone)
    if (!lead) {
        lead = await createLeadFromInbound(supabase, phone, senderName)
    }

    // Registra a inbound (sempre, mesmo se cair em silêncio)
    logInbound(supabase, {
        phone,
        name: senderName || lead?.nome || phone,
        body: text,
        lead_id: lead?.id ?? null,
    })

    if (lead) {
        void supabase
            .from('crm_leads')
            .update({ last_whatsapp_at: new Date().toISOString() })
            .eq('id', lead.id)

        // Reação à resposta de campanha (fire-and-forget — não bloqueia
        // a resposta do bot). Marca replied_at em recipients ativos do lead,
        // aplica reply_tag e reply_handoff conforme regras da campanha.
        // O cron usa replied_at + stop_on_reply pra decidir parar a sequência.
        void handleCampaignReply(supabase, lead.id).catch(err =>
            console.warn('[Inbound] handleCampaignReply falhou:', err instanceof Error ? err.message : err)
        )
    }

    // Pausa global: a Central segue conectada e logando a inbound, mas
    // nenhum fluxo automatizado roda. Operador pode responder manualmente
    // pelo Inbox enquanto estiver pausado.
    const pause = await readPauseState(supabase)
    if (pause.paused) {
        return NextResponse.json({ silent: true, reason: 'paused' })
    }

    const { graph, settings } = await loadActiveFlowWithSettings(supabase)

    // Janela permitida pra automação — fora do horário (no fuso do fluxo),
    // logamos a inbound mas não respondemos. Inbox segue visível pro operador.
    if (!isWithinAllowedHours(settings)) {
        return NextResponse.json({ silent: true, reason: 'outside_allowed_hours' })
    }

    const result = await runFlow(graph, { phone, senderName, text, lead })

    if ('silent' in result) {
        return NextResponse.json({ silent: true, reason: result.reason })
    }
    return NextResponse.json({ reply: result.reply, bot_step: result.bot_step })
}
