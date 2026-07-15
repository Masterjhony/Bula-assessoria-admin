/**
 * Webhook chamado pela SEGUNDA sessão Baileys (catálogos) toda vez que ela
 * recebe um PDF num grupo monitorado.
 *
 * O VPS já fez o trabalho pesado: baixou o anexo do WhatsApp e subiu pro R2.
 * Nós recebemos só os metadados + r2_key. Aqui a gente:
 *   1. Idempotência por message_id (mesmo PDF reenviado não duplica).
 *   2. Confirma que o group_jid está em whatsapp_catalog_groups e ativo.
 *   3. Roda findMatches() contra cronograma_leiloes.
 *   4. Roda decideAutoAttach() — se decide 'attach' E não estamos pausados,
 *      grava catalogo_url no cronograma e marca a detecção como 'attached'.
 *      Senão, registra como 'pending' / 'ambiguous' / 'no_match' / 'has_catalog'
 *      pro operador resolver pela UI.
 *
 * Auth: header `x-webhook-secret` deve bater com `WHATSAPP_GROUP_TASK_SECRET`
 * (mesmo secret usado pela Central — facilita a vida no VPS).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
    findMatches,
    decideAutoAttach,
    readCatalogsPauseState,
    resolveCatalogDownloadUrl,
} from '@/lib/whatsapp-catalogs'

export const maxDuration = 30

function sb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

type WebhookBody = {
    group_jid: string
    group_name?: string
    sender_jid?: string
    sender_name?: string
    message_id?: string
    file_name: string
    file_mime?: string
    file_size?: number
    r2_key?: string
    file_url?: string // URL pública do Supabase Storage (R2 desabilitado)
}

export async function POST(req: NextRequest) {
    const secret = process.env.WHATSAPP_GROUP_TASK_SECRET || ''
    const header = req.headers.get('x-webhook-secret') || ''
    if (!secret || header !== secret) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = (await req.json().catch(() => null)) as WebhookBody | null
    const fileRef = body?.file_url || body?.r2_key || '' // URL Supabase ou chave R2 legada
    if (!body || !body.group_jid || !body.file_name || !fileRef) {
        return NextResponse.json(
            { error: 'group_jid, file_name e file_url (ou r2_key) são obrigatórios' },
            { status: 400 }
        )
    }

    const client = sb()

    // 1) Idempotência por message_id (se vier)
    if (body.message_id) {
        const { data: dup } = await client
            .from('whatsapp_catalog_detections')
            .select('id, match_status, attached')
            .eq('message_id', body.message_id)
            .maybeSingle()
        if (dup) {
            return NextResponse.json({
                ok: true,
                duplicate: true,
                detection_id: dup.id,
                match_status: dup.match_status,
                attached: dup.attached,
            })
        }
    }

    // 2) Grupo precisa estar configurado e ativo
    const { data: group } = await client
        .from('whatsapp_catalog_groups')
        .select('id, nome, ativo')
        .eq('jid', body.group_jid)
        .maybeSingle()
    if (!group || !group.ativo) {
        return NextResponse.json({
            ok: true,
            ignored: 'grupo não configurado ou inativo',
        })
    }

    // 3) Busca candidatos no cronograma
    const candidates = await findMatches(client, body.file_name, { limit: 5 })
    const decision = decideAutoAttach(candidates)

    const pause = await readCatalogsPauseState(client)

    const baseRow = {
        group_jid: body.group_jid,
        group_name: body.group_name ?? group.nome,
        sender_jid: body.sender_jid ?? null,
        sender_name: body.sender_name ?? null,
        message_id: body.message_id ?? null,
        file_name: body.file_name,
        file_mime: body.file_mime ?? null,
        file_size: typeof body.file_size === 'number' ? body.file_size : null,
        r2_key: fileRef,
        candidates,
        match_score: candidates[0]?.score ?? null,
    }

    // 4) Decisão
    if (decision.decision === 'attach' && !pause.paused) {
        const catalogoUrl = await resolveCatalogDownloadUrl(fileRef, {
            expiresInSeconds: 7 * 24 * 3600,
            downloadAs: body.file_name,
        })
        const nowIso = new Date().toISOString()

        const { error: errUpd } = await client
            .from('cronograma_leiloes')
            .update({
                catalogo_url: catalogoUrl,
                catalogo_anexado_em: nowIso,
                catalogo_origem: body.group_name ?? group.nome,
            })
            .eq('id', decision.cronograma_id)
        if (errUpd) {
            // Registra como erro mas não falha o webhook
            await client.from('whatsapp_catalog_detections').insert({
                ...baseRow,
                match_status: 'pending',
                match_method: 'filename_fuzzy',
                cronograma_id: decision.cronograma_id,
                error: `falha ao anexar: ${errUpd.message}`,
            })
            return NextResponse.json({ ok: true, attached: false, error: errUpd.message })
        }

        const { data: inserted } = await client
            .from('whatsapp_catalog_detections')
            .insert({
                ...baseRow,
                match_status: 'attached',
                match_method: 'filename_fuzzy',
                cronograma_id: decision.cronograma_id,
                attached: true,
                attached_at: nowIso,
                attached_by: 'auto',
                overwrote_existing: false,
            })
            .select('id')
            .single()

        return NextResponse.json({
            ok: true,
            attached: true,
            cronograma_id: decision.cronograma_id,
            score: decision.score,
            detection_id: inserted?.id,
        })
    }

    // Não anexa — registra estado conforme decisão
    let match_status: string
    if (decision.decision === 'no_match') match_status = 'no_match'
    else if (decision.decision === 'has_catalog') match_status = 'pending'
    else if (decision.decision === 'ambiguous') match_status = 'ambiguous'
    else match_status = 'pending'

    const cronograma_id =
        decision.decision === 'has_catalog' ? decision.cronograma_id : null

    const error_note = pause.paused && decision.decision === 'attach'
        ? 'pausado — anexo manual necessário'
        : decision.decision === 'ambiguous'
            ? (decision as { decision: 'ambiguous'; reason: string }).reason
            : decision.decision === 'has_catalog'
                ? 'leilão já tinha catálogo — não sobrescrito'
                : null

    const { data: inserted } = await client
        .from('whatsapp_catalog_detections')
        .insert({
            ...baseRow,
            match_status,
            match_method: candidates.length > 0 ? 'filename_fuzzy' : null,
            cronograma_id,
            error: error_note,
        })
        .select('id')
        .single()

    return NextResponse.json({
        ok: true,
        attached: false,
        match_status,
        detection_id: inserted?.id,
        reason: error_note,
    })
}
