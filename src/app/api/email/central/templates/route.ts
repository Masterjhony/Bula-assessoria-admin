/**
 * /api/email/central/templates
 *   GET  → lista templates (filtra archived=false por padrão)
 *   POST → cria novo template (gera slug automático se não informado)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'

const TEMPLATE_SELECT =
    'id, slug, title, category, subject, body_html, body_text, ' +
    'variables, archived, usage_count, created_at, updated_at'

function slugify(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || `tpl-${Date.now()}`
}

export async function GET(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const includeArchived = req.nextUrl.searchParams.get('archived') === 'true'

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    let q = supabase.from('email_templates').select(TEMPLATE_SELECT)
    if (!includeArchived) q = q.eq('archived', false)
    const { data, error } = await q.order('updated_at', { ascending: false }).limit(200)

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
        subject: string
        body_html: string
        body_text?: string | null
        variables?: string[]
    }

    let body: Body
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (!body.title?.trim()) {
        return NextResponse.json({ error: 'title é obrigatório' }, { status: 400 })
    }
    if (!body.subject?.trim()) {
        return NextResponse.json({ error: 'subject é obrigatório' }, { status: 400 })
    }
    if (!body.body_html?.trim()) {
        return NextResponse.json({ error: 'body_html é obrigatório' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const slug = body.slug?.trim() || slugify(body.title)

    const { data, error } = await supabase
        .from('email_templates')
        .insert({
            slug,
            title: body.title.trim(),
            category: body.category?.trim() || 'geral',
            subject: body.subject.trim(),
            body_html: body.body_html,
            body_text: body.body_text?.trim() || null,
            variables: body.variables ?? [],
            created_by: auth.userId,
        })
        .select(TEMPLATE_SELECT)
        .single()

    if (error) {
        if (error.code === '23505') {
            return NextResponse.json({ error: `Slug "${slug}" já existe — escolha outro.` }, { status: 409 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, template: data })
}
