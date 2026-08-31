/**
 * Webhook chamado pela sessão Baileys de coleta toda vez que um PDF chega num
 * grupo monitorado.
 *
 * O VPS já baixou o anexo e subiu pro Supabase Storage; aqui chega só o
 * metadado + a URL. A rota faz o mínimo e responde rápido:
 *
 *   1. Idempotência por message_id (mesmo PDF reenviado não duplica linha).
 *   2. Confirma que o group_jid está em whatsapp_catalog_groups e ativo.
 *   3. Grava a detecção como `analyzing` e RESPONDE.
 *   4. Depois da resposta (`after`), o pipeline baixa o arquivo, ABRE o PDF,
 *      identifica o documento e — só com prova — anexa ao leilão.
 *
 * A identificação saiu do caminho crítico porque leva segundos (leitura de
 * texto e, quando a capa é imagem, uma passada de IA). O VPS não fica pendurado
 * esperando, e a UI mostra a detecção em análise.
 *
 * Auth: header `x-webhook-secret` deve bater com `WHATSAPP_GROUP_TASK_SECRET`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processarDeteccao } from '@/lib/catalog-pipeline'

export const maxDuration = 300

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

    // 3) Registra e responde — a identificação vem logo atrás.
    const { data: inserted, error: errIns } = await client
        .from('whatsapp_catalog_detections')
        .insert({
            group_jid: body.group_jid,
            group_name: body.group_name ?? group.nome,
            sender_jid: body.sender_jid ?? null,
            sender_name: body.sender_name ?? null,
            message_id: body.message_id ?? null,
            file_name: body.file_name,
            file_mime: body.file_mime ?? null,
            file_size: typeof body.file_size === 'number' ? body.file_size : null,
            r2_key: fileRef,
            match_status: 'analyzing',
            candidates: [],
        })
        .select('id')
        .single()

    if (errIns || !inserted) {
        return NextResponse.json({ error: errIns?.message ?? 'falha ao registrar' }, { status: 500 })
    }

    // 4) Abre o PDF, identifica e anexa — depois da resposta.
    after(async () => {
        try {
            await processarDeteccao(sb(), inserted.id)
        } catch (e) {
            console.error('[catalogos] processarDeteccao', inserted.id, e)
            await sb().from('whatsapp_catalog_detections').update({
                match_status: 'error',
                error: e instanceof Error ? e.message : String(e),
                analyzed_at: new Date().toISOString(),
            }).eq('id', inserted.id)
        }
    })

    return NextResponse.json({ ok: true, detection_id: inserted.id, match_status: 'analyzing' })
}
