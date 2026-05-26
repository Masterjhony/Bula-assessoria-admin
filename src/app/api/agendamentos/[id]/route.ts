/**
 * /api/agendamentos/[id]
 *
 * PATCH  — Atualiza campos editáveis (status, lead_id, responsible_member_id,
 *          notes, tags, cancel_reason). Campos do Calendly (start_at,
 *          invitee_*) ficam imutáveis pra fonte externa não sobrescrever
 *          intervenção manual.
 * DELETE — Remove o registro. Cuidado: se o evento ainda existe no Google
 *          Calendar, o próximo sync vai recriá-lo. Use pra limpar lixo
 *          (eventos antigos) ou cancelar antes pelo Calendly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { normalizePhone } from '@/lib/whatsapp-central'

export const dynamic = 'force-dynamic'

const ALLOWED_STATUS = ['agendado', 'confirmado', 'concluido', 'cancelado', 'nao_compareceu'] as const

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdmin()
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status })

    const { id } = await ctx.params
    if (!id) return NextResponse.json({ error: 'id ausente' }, { status: 400 })

    const supabase = await createClient()
    const body = (await req.json().catch(() => ({}))) as {
        status?: string
        lead_id?: string | null
        responsible_member_id?: string | null
        notes?: string | null
        tags?: string[]
        cancel_reason?: string | null
        linked_leilao_id?: string | null
        linked_task_id?: string | null
        // Permite o operador corrigir manualmente dados do invitee quando
        // o Calendly errou (raro, mas acontece). Só aplicado se vier no body.
        invitee_name?: string
        invitee_email?: string
        invitee_phone?: string
        meeting_url?: string | null
        location?: string | null
    }

    const updates: Record<string, unknown> = {}
    if (body.status !== undefined) {
        if (!(ALLOWED_STATUS as readonly string[]).includes(body.status)) {
            return NextResponse.json({ error: 'status inválido' }, { status: 400 })
        }
        updates.status = body.status
        if (body.status === 'cancelado') updates.cancelled_at = new Date().toISOString()
    }
    if (body.lead_id !== undefined) updates.lead_id = body.lead_id || null
    if (body.responsible_member_id !== undefined) updates.responsible_member_id = body.responsible_member_id || null
    if (body.notes !== undefined) updates.notes = body.notes
    if (body.tags !== undefined && Array.isArray(body.tags)) updates.tags = body.tags
    if (body.cancel_reason !== undefined) updates.cancel_reason = body.cancel_reason
    if (body.linked_leilao_id !== undefined) updates.linked_leilao_id = body.linked_leilao_id || null
    if (body.linked_task_id !== undefined) updates.linked_task_id = body.linked_task_id || null

    if (body.invitee_name !== undefined) updates.invitee_name = body.invitee_name?.trim() || null
    if (body.invitee_email !== undefined) updates.invitee_email = body.invitee_email?.trim().toLowerCase() || null
    if (body.invitee_phone !== undefined) updates.invitee_phone = body.invitee_phone ? normalizePhone(body.invitee_phone) : null
    if (body.meeting_url !== undefined) updates.meeting_url = body.meeting_url
    if (body.location !== undefined) updates.location = body.location

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
    }

    const { data, error } = await supabase
        .from('agendamentos')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdmin()
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status })

    const { id } = await ctx.params
    if (!id) return NextResponse.json({ error: 'id ausente' }, { status: 400 })

    const supabase = await createClient()
    const { error } = await supabase.from('agendamentos').delete().eq('id', id)
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
}
