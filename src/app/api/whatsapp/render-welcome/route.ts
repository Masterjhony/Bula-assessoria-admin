/**
 * /api/whatsapp/render-welcome — chamado pelo VPS quando vai disparar o
 * welcome de um lead novo. Permite que o template (slug "welcome-default")
 * vire fonte única de verdade, em vez de duplicar texto no flowConfig.
 *
 * Também respeita opt-out: se o lead já está em opt-out, devolve `silent: true`
 * e o VPS não envia nada.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
    BATE_PAPO_PENDENTE_TAG,
    firstName,
    normalizePhone,
    phoneVariants,
    renderTemplate,
} from '@/lib/whatsapp-central'
import { getR2DownloadUrl } from '@/lib/r2'
import { readPauseState } from '@/lib/whatsapp-pause'
import {
    resolveWelcomeDispatch,
    type LeadShape,
} from '@/lib/whatsapp-flow-engine'
import { loadActiveFlowWithSettings } from '@/lib/whatsapp-flows'
import { isWithinAllowedHours } from '@/lib/whatsapp-flow-settings'

export async function POST(req: NextRequest) {
    const SECRET = process.env.WHATSAPP_GROUP_TASK_SECRET || ''
    const auth = req.headers.get('x-webhook-secret')
    if (!SECRET || auth !== SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { phone: string; name?: string }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const phone = normalizePhone(body.phone)
    const name = body.name?.trim() || ''
    if (!phone) return NextResponse.json({ error: 'phone inválido' }, { status: 400 })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Pausa global da Central — bloqueia o welcome (mesmo padrão do opt-out).
    const pause = await readPauseState(supabase)
    if (pause.paused) {
        return NextResponse.json({ silent: true, reason: 'paused' })
    }

    // Verifica opt-out por número (cobre casos sem lead vinculado também).
    // Mantemos esses gates fora do grafo: são checagens de sistema (compliance,
    // dedup) que NÃO devem ser editáveis no editor visual.
    const variants = phoneVariants(phone)
    const { data: optoutMatch } = await supabase
        .from('whatsapp_optouts')
        .select('phone').in('phone', variants).limit(1)
    if (optoutMatch && optoutMatch.length > 0) {
        return NextResponse.json({ silent: true, reason: 'optout' })
    }

    // Carrega o lead pra alimentar o grafo (audiência, tags, status).
    // Usamos o mesmo shape do engine — só os campos que conditions consultam.
    const { data: leadRow } = await supabase
        .from('crm_leads')
        .select('id, nome, telefone, interesse_principal, handoff_humano, handoff_at, optout_whatsapp, contact_history, contact_count, tags_whatsapp, stage, status, notes')
        .in('telefone', variants)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    const lead = (leadRow as LeadShape | null) ?? null
    if (lead?.optout_whatsapp) {
        return NextResponse.json({ silent: true, reason: 'lead_optout' })
    }

    // Carrega o fluxo ATIVO (whatsapp_flows.is_active=true, com fallback
    // p/ site_settings.whatsapp_flow_v2 e por fim buildDefaultGraph).
    // Welcome dispatch só usa o subgrafo new_lead via resolveWelcomeDispatch().
    const { graph, settings } = await loadActiveFlowWithSettings(supabase)

    // Mesma janela permitida pra welcome — fora dela, silent (lead cadastrado
    // segue no CRM mas o welcome só dispara no próximo horário válido).
    if (!isWithinAllowedHours(settings)) {
        return NextResponse.json({ silent: true, reason: 'outside_allowed_hours' })
    }

    // Resolve o slug do welcome via grafo. Se o grafo não tiver subgrafo
    // new_lead (legado antes do trigger field), cai no fallback hardcoded
    // welcome-default — preserva compatibilidade pra setups antigos.
    const dispatch = resolveWelcomeDispatch(graph, lead)
    if ('silent' in dispatch) {
        // Razões pertinentes vindas do grafo (silence node explícito, dead end)
        // devolvem silent — só não silenciamos quando o motivo é "grafo legado
        // sem subgrafo new_lead", aí caímos no fallback abaixo.
        if (dispatch.reason !== 'no_new_lead_trigger') {
            return NextResponse.json({ silent: true, reason: dispatch.reason })
        }
    }
    const resolvedSlug = ('slug' in dispatch && dispatch.slug) ? dispatch.slug : 'welcome-default'
    const fallbackBody = ('fallback' in dispatch && dispatch.fallback) ? dispatch.fallback : null

    const { data: tpl } = await supabase
        .from('whatsapp_templates')
        .select('body, media_url, media_type, media_mime, media_filename, media_caption, poll_question, poll_options, poll_selectable_count')
        .eq('slug', resolvedSlug)
        .eq('archived', false)
        .single()

    const tplBody = tpl?.body || fallbackBody || `Olá {nome}! 👋\n\nAqui é da Fórmula do Boi.`
    const vars = { nome: firstName(name), name }
    const rendered = renderTemplate(tplBody, vars)

    // Mídia: gera presigned URL curta (10 min) — o VPS baixa via Baileys
    let media: { url: string; type: string; mime?: string | null; filename?: string | null; caption?: string } | null = null
    if (tpl?.media_url && tpl?.media_type) {
        try {
            const url = await getR2DownloadUrl(tpl.media_url, { expiresInSeconds: 600 })
            media = {
                url,
                type: tpl.media_type,
                mime: tpl.media_mime,
                filename: tpl.media_filename,
                caption: tpl.media_caption ? renderTemplate(tpl.media_caption, vars) : undefined,
            }
        } catch (e) {
            console.warn('[render-welcome] presign falhou:', e instanceof Error ? e.message : e)
        }
    }

    let poll: { question: string; options: string[]; selectable_count: number } | null = null
    if (tpl?.poll_question && Array.isArray(tpl.poll_options) && tpl.poll_options.length >= 2) {
        poll = {
            question: renderTemplate(tpl.poll_question, vars),
            options: tpl.poll_options.map((o: string) => renderTemplate(o, vars)),
            selectable_count: tpl.poll_selectable_count ?? 1,
        }
    }

    // Welcome v2 (bate-papo): quando o lead recebe o welcome-default por aqui,
    // marca a tag `bate_papo_pendente` no CRM. O classifier usa essa tag pra
    // interpretar a próxima resposta numérica do lead (1 = agendar Calendly,
    // 2 = só info / mostra menu de interesses). Fire-and-forget pra não atrasar
    // a resposta ao VPS — se a tag não vingar, o pior caso é o classifier cair
    // no DEFAULT_NUMERIC_MAP, mandando o lead pra triagem de sêmen/embriões
    // direto (degradação aceitável).
    if (lead && resolvedSlug === 'welcome-default') {
        const tags = new Set(lead.tags_whatsapp ?? [])
        if (!tags.has(BATE_PAPO_PENDENTE_TAG)) {
            tags.add(BATE_PAPO_PENDENTE_TAG)
            void supabase
                .from('crm_leads')
                .update({ tags_whatsapp: [...tags] })
                .eq('id', lead.id)
                .then(({ error }) => {
                    if (error) console.warn('[render-welcome] add bate_papo_pendente tag:', error.message)
                })
        }
    }

    return NextResponse.json({ body: rendered, media, poll })
}
