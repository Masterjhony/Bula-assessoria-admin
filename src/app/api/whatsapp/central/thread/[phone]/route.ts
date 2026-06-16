/**
 * /api/whatsapp/central/thread/[phone]
 *   GET  → histórico completo de mensagens com este número + dados do lead
 *   POST → envia mensagem manual para este número (opera o envio direto via VPS)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { normalizePhone, phoneVariants } from '@/lib/whatsapp-central'
import { ensureAudienceTagForTemplate } from '@/lib/whatsapp-audience-tags'
import { WHATSAPP_SERVER_URL, vpsHeaders } from '@/lib/whatsapp-vps'

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ phone: string }> }
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { phone: rawPhone } = await params
    const phone = normalizePhone(decodeURIComponent(rawPhone))
    if (!phone) return NextResponse.json({ error: 'phone inválido' }, { status: 400 })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const variants = phoneVariants(phone)

    const [messagesRes, leadRes] = await Promise.all([
        supabase
            .from('whatsapp_messages')
            .select('id, phone, name, body, direction, status, origin, bot_step, campaign_id, template_id, created_at')
            .in('phone', variants)
            .order('created_at', { ascending: true })
            .limit(500),
        supabase
            .from('crm_leads')
            .select('id, nome, telefone, email, status, stage, prioridade, interesse, interesse_principal, tags_whatsapp, handoff_humano, handoff_responsavel, handoff_at, optout_whatsapp, last_whatsapp_at, contact_count, contact_history, notes, responsavel, source, medium, campaign')
            .in('telefone', variants)
            .order('created_at', { ascending: false })
            .limit(1),
    ])

    return NextResponse.json({
        messages: messagesRes.data ?? [],
        lead: leadRes.data?.[0] ?? null,
    })
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ phone: string }> }
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { phone: rawPhone } = await params
    const phone = normalizePhone(decodeURIComponent(rawPhone))
    if (!phone) return NextResponse.json({ error: 'phone inválido' }, { status: 400 })

    let body: { message: string; template_id?: string }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const message = (body.message || '').trim()
    if (!message) return NextResponse.json({ error: 'message obrigatório' }, { status: 400 })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verifica opt-out — bloqueia envio manual também (compliance)
    const { data: lead } = await supabase
        .from('crm_leads')
        .select('id, nome, optout_whatsapp')
        .in('telefone', phoneVariants(phone))
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (lead?.optout_whatsapp) {
        return NextResponse.json({ error: 'Lead em opt-out — envio manual bloqueado.' }, { status: 409 })
    }

    // Dispara via VPS
    const waRes = await fetch(`${WHATSAPP_SERVER_URL}/send-direct`, {
        method: 'POST',
        headers: vpsHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ phone, message }),
        signal: AbortSignal.timeout(15000),
    })
    const waBody = await waRes.json().catch(() => ({}))
    const sent = waRes.ok && (waBody.queued || waBody.sent)

    void supabase.from('whatsapp_messages').insert({
        phone,
        name: lead?.nome ?? phone,
        body: message,
        direction: 'outbound',
        status: sent ? 'sent' : 'failed',
        origin: 'manual',
        lead_id: lead?.id ?? null,
        template_id: body.template_id ?? null,
    })

    if (lead) {
        void supabase
            .from('crm_leads')
            .update({
                last_whatsapp_at: new Date().toISOString(),
                ultimo_contato: new Date().toISOString(),
            })
            .eq('id', lead.id)
    }

    // Se a mensagem manual usou um template iniciador de fluxo (welcome
    // institucional), garantimos a tag de audiência no lead — assim a próxima
    // resposta dele cai no mapeamento numérico correto.
    if (lead && body.template_id) {
        const { data: tpl } = await supabase
            .from('whatsapp_templates')
            .select('slug')
            .eq('id', body.template_id)
            .single()
        if (tpl?.slug) {
            try {
                await ensureAudienceTagForTemplate(supabase, [lead.id], tpl.slug)
            } catch (e) {
                console.warn('[thread/send] ensureAudienceTagForTemplate falhou:', e instanceof Error ? e.message : e)
            }
        }
    }

    return NextResponse.json({ success: !!sent, ...waBody })
}
