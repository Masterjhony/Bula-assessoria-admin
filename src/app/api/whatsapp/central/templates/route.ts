/**
 * /api/whatsapp/central/templates
 *   GET    → lista templates ativos (incluindo arquivados se ?include_archived=1)
 *   POST   → cria novo template
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import {
    normalizeMediaAndPoll,
    TemplatePayloadError,
    TEMPLATE_SELECT_COLUMNS,
    type TemplateMediaPollInput,
} from '@/lib/whatsapp-template-payload'

export async function GET(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const url = new URL(req.url)
    const includeArchived = url.searchParams.get('include_archived') === '1'

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let q = supabase
        .from('whatsapp_templates')
        .select(TEMPLATE_SELECT_COLUMNS)
        .order('category', { ascending: true })
        .order('title', { ascending: true })

    if (!includeArchived) q = q.eq('archived', false)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ templates: data ?? [] })
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    type Body = {
        slug?: string
        title: string
        category?: string
        body?: string
        variables?: string[]
    } & TemplateMediaPollInput

    let body: Body
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    if (!body.title?.trim()) {
        return NextResponse.json({ error: 'title é obrigatório' }, { status: 400 })
    }

    let mediaPoll
    try {
        mediaPoll = normalizeMediaAndPoll(body)
    } catch (e) {
        if (e instanceof TemplatePayloadError) {
            return NextResponse.json({ error: e.message }, { status: 400 })
        }
        throw e
    }

    // Pelo menos um dos três (body, mídia, enquete) precisa estar presente.
    const hasBody = !!body.body?.trim()
    const hasMedia = !!mediaPoll.media_url
    const hasPoll = !!mediaPoll.poll_question
    if (!hasBody && !hasMedia && !hasPoll) {
        return NextResponse.json(
            { error: 'Informe pelo menos uma das opções: mensagem, mídia ou enquete.' },
            { status: 400 }
        )
    }

    const slug = (body.slug || body.title)
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 64)

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
        .from('whatsapp_templates')
        .insert({
            slug,
            title: body.title.trim(),
            category: body.category?.trim() || 'geral',
            body: body.body ?? '',
            variables: body.variables ?? [],
            created_by: auth.userId,
            ...mediaPoll,
        })
        .select('id, slug')
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, ...data })
}
