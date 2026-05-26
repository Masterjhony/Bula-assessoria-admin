/**
 * /api/whatsapp/central/inbox — lista de conversas (uma por número), com
 * última mensagem, status do lead (handoff/optout/interesse) e contadores.
 *
 * Query params opcionais:
 *   ?filter=todos|aguardando|handoff|optout|interesse
 *   ?q=texto-livre (procura no nome/telefone)
 *   ?interesse=touros|matrizes|...
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'

interface ConversationRow {
    phone: string
    name: string | null
    last_message: string | null
    last_direction: 'inbound' | 'outbound' | null
    last_at: string
    inbound_pending: number
    lead_id: string | null
    lead_nome: string | null
    interesse_principal: string | null
    handoff_humano: boolean
    handoff_responsavel: string | null
    optout_whatsapp: boolean
    stage: string | null
    status: string | null
}

export async function GET(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const url = new URL(req.url)
    const filter = url.searchParams.get('filter') ?? 'todos'
    const q = (url.searchParams.get('q') || '').trim().toLowerCase()
    const interesseFilter = url.searchParams.get('interesse')

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Buscamos as últimas 1000 mensagens com phone, suficiente pra montar o
    // ranking das conversas mais recentes sem precisar de função SQL custom.
    const { data: messages, error: msgErr } = await supabase
        .from('whatsapp_messages')
        .select('id, phone, name, direction, body, status, lead_id, created_at')
        .not('phone', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000)

    if (msgErr) {
        return NextResponse.json({ error: msgErr.message }, { status: 500 })
    }

    const byPhone = new Map<string, {
        last: typeof messages[number]
        inbound_pending: number
    }>()
    for (const m of messages ?? []) {
        if (!m.phone) continue
        const existing = byPhone.get(m.phone)
        if (!existing) {
            byPhone.set(m.phone, {
                last: m,
                inbound_pending: m.direction === 'inbound' ? 1 : 0,
            })
            continue
        }
        // Já temos a "last" (mais recente). Contamos inbound posteriores ao
        // último outbound como pendentes.
        if (m.direction === 'inbound' && existing.last.direction === 'inbound') {
            existing.inbound_pending += 1
        }
    }

    const phones = [...byPhone.keys()]
    const { data: leads } = await supabase
        .from('crm_leads')
        .select('id, nome, telefone, interesse_principal, handoff_humano, handoff_responsavel, optout_whatsapp, stage, status')
        .in('telefone', phones)

    const leadByPhone = new Map<string, NonNullable<typeof leads>[number]>()
    for (const l of leads ?? []) {
        if (l.telefone) leadByPhone.set(l.telefone, l)
    }

    let rows: ConversationRow[] = phones.map((phone) => {
        const entry = byPhone.get(phone)!
        const lead = leadByPhone.get(phone)
        return {
            phone,
            name: entry.last.name ?? null,
            last_message: entry.last.body ?? null,
            last_direction: (entry.last.direction as 'inbound' | 'outbound' | null) ?? null,
            last_at: entry.last.created_at,
            inbound_pending: entry.inbound_pending,
            lead_id: lead?.id ?? null,
            lead_nome: lead?.nome ?? null,
            interesse_principal: lead?.interesse_principal ?? null,
            handoff_humano: !!lead?.handoff_humano,
            handoff_responsavel: lead?.handoff_responsavel ?? null,
            optout_whatsapp: !!lead?.optout_whatsapp,
            stage: lead?.stage ?? null,
            status: lead?.status ?? null,
        }
    })

    if (filter === 'aguardando') rows = rows.filter(r => r.inbound_pending > 0 && !r.handoff_humano && !r.optout_whatsapp)
    else if (filter === 'handoff') rows = rows.filter(r => r.handoff_humano)
    else if (filter === 'optout') rows = rows.filter(r => r.optout_whatsapp)
    else if (filter === 'interesse') rows = rows.filter(r => !!r.interesse_principal)

    if (interesseFilter) rows = rows.filter(r => r.interesse_principal === interesseFilter)

    if (q) {
        rows = rows.filter(r =>
            (r.name?.toLowerCase().includes(q) ?? false) ||
            (r.lead_nome?.toLowerCase().includes(q) ?? false) ||
            r.phone.includes(q)
        )
    }

    rows.sort((a, b) => +new Date(b.last_at) - +new Date(a.last_at))

    return NextResponse.json({ conversations: rows.slice(0, 200) })
}
