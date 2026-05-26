/**
 * /api/email/central/templates/[id]
 *   PUT    → atualiza template
 *   DELETE → arquiva template (não apaga — preserva referências histórias
 *            em campanhas concluídas). Soft delete via archived=true.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'

const TEMPLATE_SELECT =
    'id, slug, title, category, subject, body_html, body_text, ' +
    'variables, archived, usage_count, created_at, updated_at'

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id } = await params

    type Body = {
        title?: string
        category?: string
        subject?: string
        body_html?: string
        body_text?: string | null
        variables?: string[]
        archived?: boolean
    }

    let body: Body
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const update: Record<string, unknown> = {}
    if (typeof body.title === 'string') update.title = body.title.trim()
    if (typeof body.category === 'string') update.category = body.category.trim() || 'geral'
    if (typeof body.subject === 'string') update.subject = body.subject.trim()
    if (typeof body.body_html === 'string') update.body_html = body.body_html
    if (body.body_text !== undefined) update.body_text = body.body_text?.trim() || null
    if (Array.isArray(body.variables)) update.variables = body.variables
    if (typeof body.archived === 'boolean') update.archived = body.archived

    if (Object.keys(update).length === 0) {
        return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data, error } = await supabase
        .from('email_templates')
        .update(update)
        .eq('id', id)
        .select(TEMPLATE_SELECT)
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
    return NextResponse.json({ success: true, template: data })
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id } = await params

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { error } = await supabase
        .from('email_templates')
        .update({ archived: true })
        .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
}
