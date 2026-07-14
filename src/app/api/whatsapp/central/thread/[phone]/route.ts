/**
 * /api/whatsapp/central/thread/[phone]
 *   GET  → histórico completo de mensagens + dados do lead + status da janela 24h
 *   POST → envia mensagem manual (SDR) pela API oficial, via o gateway:
 *            { message }      → texto livre (só dentro da janela de 24h)
 *            { template_id }  → template aprovado da Meta (reabre fora da janela)
 *
 * O gateway (sendOutbound) decide o canal e aplica as regras: dentro de 24h vai
 * texto livre pela Cloud; fora, exige template aprovado. Por isso o SDR opera
 * 100% pela API oficial sem precisar pensar em canal.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { normalizePhone, phoneVariants, renderTemplate, firstName } from '@/lib/whatsapp-central'
import { ensureAudienceTagForTemplate } from '@/lib/whatsapp-audience-tags'
import { metaTemplateName } from '@/lib/whatsapp-cloud-api'
import { sendOutbound } from '@/lib/whatsapp-gateway'
import { WHATSAPP_MEDIA_BUCKET } from '@/lib/whatsapp-inbound'
import { loadInbox } from '@/lib/whatsapp-inboxes'

const WINDOW_MS = 24 * 3_600_000

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ phone: string }> },
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { phone: rawPhone } = await params
    const phone = normalizePhone(decodeURIComponent(rawPhone))
    if (!phone) return NextResponse.json({ error: 'phone inválido' }, { status: 400 })

    // Conversa escopada por inbox: a mesma pessoa em 2 números são 2 threads.
    // Sem ?inbox= (compat/rollout), retorna o histórico completo como antes.
    const inboxFilter = (new URL(req.url).searchParams.get('inbox') || '').trim() || null

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const variants = phoneVariants(phone)

    let msgQuery = supabase
        .from('whatsapp_messages')
        .select('id, phone, name, body, direction, status, origin, bot_step, campaign_id, template_id, created_at, media_url, media_type, media_mime, media_filename, media_meta_id, media_ingest_error')
        .in('phone', variants)
    if (inboxFilter) msgQuery = msgQuery.eq('inbox_id', inboxFilter)

    let lastInboundQuery = supabase
        .from('whatsapp_messages')
        .select('created_at')
        .in('phone', variants)
        .eq('direction', 'inbound')
    if (inboxFilter) lastInboundQuery = lastInboundQuery.eq('inbox_id', inboxFilter)

    const [messagesRes, leadRes, lastInboundRes] = await Promise.all([
        msgQuery
            .order('created_at', { ascending: true })
            .limit(500),
        // telefone OU celular, em qualquer formato (variantes); lead mais
        // antigo vence (é o original quando há duplicata).
        supabase
            .from('crm_leads')
            .select('id, nome, telefone, email, status, stage, prioridade, interesse, interesse_principal, tags_whatsapp, handoff_humano, handoff_responsavel, handoff_at, optout_whatsapp, last_whatsapp_at, contact_count, contact_history, notes, responsavel, source, medium, campaign, momento_pecuaria, quantidade_animais, o_que_busca, cidade, estado, tem_inscricao_estadual, inscricao_estadual, extra_data')
            .or(`telefone.in.(${variants.map(v => `"${v}"`).join(',')}),celular.in.(${variants.map(v => `"${v}"`).join(',')})`)
            .order('created_at', { ascending: true })
            .limit(1),
        // Última inbound de verdade (a lista acima vem em ordem crescente e pode
        // estar truncada em 500) — é o que define a janela de 24h.
        lastInboundQuery
            .order('created_at', { ascending: false })
            .limit(1),
    ])

    const lastInboundAt = lastInboundRes.data?.[0]?.created_at ?? null
    const sessionOpen = lastInboundAt ? Date.now() - new Date(lastInboundAt).getTime() < WINDOW_MS : false
    const windowExpiresAt = lastInboundAt
        ? new Date(new Date(lastInboundAt).getTime() + WINDOW_MS).toISOString()
        : null

    // Resolve o path no bucket whatsapp-media (media_url) em signed URL na hora
    // de exibir. URL vale 6h — o inbox recarrega a thread ao abrir, então sempre
    // vem uma URL fresca.
    const messages = await Promise.all(
        (messagesRes.data ?? []).map(async (m) => {
            if (!m.media_url) return m
            const { data: signed } = await supabase.storage
                .from(WHATSAPP_MEDIA_BUCKET)
                .createSignedUrl(m.media_url, 6 * 3600)
            return { ...m, media_url: signed?.signedUrl ?? null }
        }),
    )

    return NextResponse.json({
        messages,
        lead: leadRes.data?.[0] ?? null,
        session_open: sessionOpen,
        last_inbound_at: lastInboundAt,
        window_expires_at: windowExpiresAt,
    })
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ phone: string }> },
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { phone: rawPhone } = await params
    const phone = normalizePhone(decodeURIComponent(rawPhone))
    if (!phone) return NextResponse.json({ error: 'phone inválido' }, { status: 400 })

    let body: { message?: string; template_id?: string; channel?: 'oficial' | 'baileys'; inbox_id?: string }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Multi-inbox: `inbox_id` escolhe de qual número o SDR responde. Baileys →
    // força aquela sessão (texto livre, sem janela de 24h); Cloud → o gateway
    // decide (texto dentro de 24h, template fora). `channel` legado ainda vale
    // como fallback ('baileys' | 'oficial').
    const inbox = body.inbox_id ? await loadInbox(supabase, body.inbox_id) : null
    const isBaileysInbox = inbox ? inbox.kind === 'baileys' : body.channel === 'baileys'
    const channelHint = isBaileysInbox ? 'baileys' : 'auto'
    const inboxId = inbox?.id ?? (isBaileysInbox ? undefined : 'cloud')

    const postVariants = phoneVariants(phone)
    const postList = `(${postVariants.map(v => `"${v}"`).join(',')})`
    const { data: lead } = await supabase
        .from('crm_leads')
        .select('id, nome, optout_whatsapp')
        .or(`telefone.in.${postList},celular.in.${postList}`)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

    if (lead?.optout_whatsapp) {
        return NextResponse.json({ error: 'Lead em opt-out — envio bloqueado.' }, { status: 409 })
    }

    // Monta o envio: template aprovado (reabre janela) ou texto livre (dentro de 24h)
    let text: string | null = (body.message || '').trim() || null
    let templateName: string | null = null
    let templateLanguage: string | null = null
    let templateSlug: string | null = null

    if (body.template_id) {
        const { data: tpl, error: tErr } = await supabase
            .from('whatsapp_templates')
            .select('slug, body, meta_status, meta_language')
            .eq('id', body.template_id)
            .single()
        if (tErr || !tpl) {
            return NextResponse.json({ error: 'Template não encontrado.' }, { status: 404 })
        }
        if (tpl.meta_status !== 'APPROVED') {
            return NextResponse.json(
                { error: `Template ainda não aprovado pela Meta (status: ${tpl.meta_status}). Só templates APPROVED podem reabrir uma conversa.` },
                { status: 409 },
            )
        }
        templateSlug = tpl.slug
        templateName = metaTemplateName(tpl.slug)
        templateLanguage = tpl.meta_language || 'pt_BR'
        // Texto renderizado só para exibição no histórico (a Meta envia pelo template).
        text = renderTemplate(tpl.body || '', { nome: firstName(lead?.nome), name: lead?.nome })
    }

    if (!text && !templateName) {
        return NextResponse.json({ error: 'Escreva uma mensagem ou escolha um template.' }, { status: 400 })
    }

    const result = await sendOutbound(supabase, {
        to: { phone, leadId: lead?.id ?? null, name: lead?.nome ?? null },
        text,
        templateName,
        templateLanguage,
        intent: 'crm_reply',
        channelHint,
        inboxId,
        origin: 'inbox-sdr',
    })

    // Mensagens manuais usando template iniciador garantem a tag de audiência —
    // assim a próxima resposta do lead cai no mapeamento numérico correto.
    if (lead && templateSlug && (result.status === 'sent' || result.status === 'queued')) {
        try {
            await ensureAudienceTagForTemplate(supabase, [lead.id], templateSlug)
        } catch (e) {
            console.warn('[thread/send] ensureAudienceTagForTemplate falhou:', e instanceof Error ? e.message : e)
        }
    }

    if (lead && (result.status === 'sent' || result.status === 'queued')) {
        void supabase
            .from('crm_leads')
            .update({ ultimo_contato: new Date().toISOString() })
            .eq('id', lead.id)
    }

    // Traduz o resultado do gateway em resposta amigável para o inbox.
    if (result.status === 'sent' || result.status === 'queued') {
        return NextResponse.json({ success: true, channel: result.channel, status: result.status })
    }

    if (result.status === 'held' && result.reason === 'outside_24h_needs_template') {
        return NextResponse.json(
            { error: 'A janela de 24h fechou. Para reabrir a conversa, escolha um template aprovado.', code: 'needs_template' },
            { status: 409 },
        )
    }

    const friendly: Record<string, string> = {
        optout: 'Lead em opt-out — envio bloqueado.',
        cloud_not_configured: 'API oficial não configurada (faltam as variáveis WHATSAPP_CLOUD_*).',
        invalid_phone: 'Telefone inválido.',
        outside_business_hours: 'Fora do horário comercial configurado.',
        daily_cap_reached: 'Limite diário de envios atingido.',
        duplicate: 'Mensagem duplicada (enviada recentemente).',
    }
    const reason = result.reason || 'send_failed'
    const httpStatus = result.status === 'failed' ? 502 : 409
    return NextResponse.json({ error: friendly[reason] ?? `Não foi possível enviar (${reason}).`, code: reason }, { status: httpStatus })
}
