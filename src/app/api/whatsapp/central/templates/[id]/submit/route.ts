/**
 * POST /api/whatsapp/central/templates/[id]/submit
 *
 * Submete um template local à Meta para aprovação (Cloud API). O template passa
 * a PENDING; quando a Meta aprovar, o sync (/templates/sync) marca APPROVED e
 * ele fica liberado para campanhas de massa fora da janela de 24h.
 *
 * Body: { meta_category?: 'MARKETING'|'UTILITY'|'AUTHENTICATION', meta_language?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import {
    isWhatsappCloudApiConfigured,
    createWhatsappCloudTemplate,
    metaTemplateName,
} from '@/lib/whatsapp-cloud-api'

const VALID_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const
type MetaCategory = (typeof VALID_CATEGORIES)[number]

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id } = await params

    if (!isWhatsappCloudApiConfigured()) {
        return NextResponse.json(
            { error: 'WhatsApp Cloud API não configurada (faltam WHATSAPP_CLOUD_* no ambiente).' },
            { status: 400 },
        )
    }

    let body: { meta_category?: string; meta_language?: string } = {}
    try { body = await req.json() } catch { /* body opcional */ }

    const category: MetaCategory = (VALID_CATEGORIES as readonly string[]).includes(body.meta_category ?? '')
        ? (body.meta_category as MetaCategory)
        : 'MARKETING'
    const language = (body.meta_language || process.env.WHATSAPP_CLOUD_TEMPLATE_LANGUAGE || 'pt_BR').trim()

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: template, error: tErr } = await supabase
        .from('whatsapp_templates')
        .select('id, slug, body, meta_status')
        .eq('id', id)
        .single()
    if (tErr || !template) {
        return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
    }
    if (!template.body?.trim()) {
        return NextResponse.json({ error: 'Só dá para submeter templates com corpo de texto (mídia/enquete não são aceitas pela Meta aqui).' }, { status: 400 })
    }
    if (template.meta_status === 'PENDING' || template.meta_status === 'APPROVED') {
        return NextResponse.json({ error: `Template já está ${template.meta_status} na Meta.` }, { status: 409 })
    }

    const name = metaTemplateName(template.slug)

    let result
    try {
        result = await createWhatsappCloudTemplate({ name, category, language, body: template.body })
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : 'Falha ao submeter à Meta' },
            { status: 502 },
        )
    }

    const status = (result.status || 'PENDING').toUpperCase()
    const { error: uErr } = await supabase
        .from('whatsapp_templates')
        .update({
            meta_template_id: result.id,
            meta_status: status,
            meta_category: result.category || category,
            meta_language: language,
            meta_rejected_reason: null,
            meta_synced_at: new Date().toISOString(),
        })
        .eq('id', id)
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

    return NextResponse.json({ success: true, meta_name: name, meta_status: status, meta_template_id: result.id })
}
