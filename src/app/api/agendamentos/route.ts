/**
 * /api/agendamentos
 *
 * GET   — Lista agendamentos com filtros (status, source, lead_id, q, from/to).
 * POST  — Cria agendamento manual (source='manual'). Útil pra registrar
 *         conversa marcada por fora do Calendly (ligação direta etc).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { normalizePhone } from '@/lib/whatsapp-central'

export const dynamic = 'force-dynamic'

const SELECT_COLUMNS =
    'id, source, google_event_id, calendly_event_uri, summary, description, ' +
    'start_at, end_at, timezone, location, meeting_url, ' +
    'invitee_name, invitee_email, invitee_phone, ' +
    'status, cancelled_at, cancel_reason, notes, tags, ' +
    'lead_id, responsible_member_id, linked_leilao_id, linked_task_id, ' +
    'last_synced_at, created_at, updated_at'

export async function GET(req: NextRequest) {
    const admin = await requireAdmin()
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status })

    const supabase = await createClient()
    const params = req.nextUrl.searchParams

    let query = supabase
        .from('agendamentos')
        .select(SELECT_COLUMNS, { count: 'exact' })
        .order('start_at', { ascending: false })

    const status = params.get('status')
    if (status) query = query.eq('status', status)

    const source = params.get('source')
    if (source) query = query.eq('source', source)

    const leadId = params.get('lead_id')
    if (leadId) query = query.eq('lead_id', leadId)

    const from = params.get('from')  // ISO inclusive
    if (from) query = query.gte('start_at', from)

    const to = params.get('to')      // ISO exclusive
    if (to) query = query.lt('start_at', to)

    const q = params.get('q')?.trim()
    if (q) {
        const like = `%${q.replace(/[%_]/g, '\\$&')}%`
        query = query.or(
            `summary.ilike.${like},invitee_name.ilike.${like},invitee_email.ilike.${like},invitee_phone.ilike.${like}`,
        )
    }

    const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '50', 10) || 50, 1), 200)
    const offset = Math.max(parseInt(params.get('offset') ?? '0', 10) || 0, 0)
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data: data ?? [], total: count ?? 0, limit, offset })
}

export async function POST(req: NextRequest) {
    const admin = await requireAdmin()
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status })

    const supabase = await createClient()
    const body = (await req.json().catch(() => null)) as {
        summary?: string
        description?: string | null
        start_at?: string
        end_at?: string | null
        location?: string | null
        meeting_url?: string | null
        invitee_name?: string | null
        invitee_email?: string | null
        invitee_phone?: string | null
        status?: string
        notes?: string | null
        tags?: string[]
        lead_id?: string | null
        responsible_member_id?: string | null
    } | null

    if (!body?.summary || !body?.start_at) {
        return NextResponse.json({ error: 'summary e start_at são obrigatórios' }, { status: 400 })
    }

    const normalizedPhone = body.invitee_phone ? normalizePhone(body.invitee_phone) : null
    const normalizedEmail = body.invitee_email?.trim().toLowerCase() || null

    const { data, error } = await supabase
        .from('agendamentos')
        .insert({
            source: 'manual',
            summary: body.summary.slice(0, 280),
            description: body.description ?? null,
            start_at: body.start_at,
            end_at: body.end_at ?? null,
            location: body.location ?? null,
            meeting_url: body.meeting_url ?? null,
            invitee_name: body.invitee_name?.trim() || null,
            invitee_email: normalizedEmail,
            invitee_phone: normalizedPhone,
            status: body.status && ['agendado','confirmado','concluido','cancelado','nao_compareceu'].includes(body.status)
                ? body.status
                : 'agendado',
            notes: body.notes ?? null,
            tags: Array.isArray(body.tags) ? body.tags : [],
            lead_id: body.lead_id ?? null,
            responsible_member_id: body.responsible_member_id ?? null,
            created_by: admin.userId,
        })
        .select(SELECT_COLUMNS)
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data })
}
