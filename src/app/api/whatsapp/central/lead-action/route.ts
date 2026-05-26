/**
 * /api/whatsapp/central/lead-action — ações rápidas em um lead a partir da inbox:
 *   - assumir / liberar atendimento (handoff humano on/off)
 *   - marcar opt-out manual / reativar
 *   - definir interesse principal
 *   - adicionar / remover audience tag (ex.: marcar lead como Academia P.O)
 *
 * Body: {
 *   phone: string,
 *   action: 'handoff_on' | 'handoff_off' | 'optout_on' | 'optout_off'
 *         | 'set_interesse' | 'apply_audience_tag' | 'remove_audience_tag',
 *   interesse?: string,
 *   responsavel?: string,
 *   tag?: string   // obrigatório para apply_audience_tag / remove_audience_tag
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { INTERESSES, normalizePhone, phoneVariants } from '@/lib/whatsapp-central'
import {
    KNOWN_AUDIENCE_TAGS,
    ensureLeadsHaveTag,
    removeTagFromLeads,
} from '@/lib/whatsapp-audience-tags'

type Action =
    | 'handoff_on' | 'handoff_off'
    | 'optout_on'  | 'optout_off'
    | 'set_interesse'
    | 'apply_audience_tag' | 'remove_audience_tag'

export async function POST(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body: {
        phone: string
        action: Action
        interesse?: string
        responsavel?: string
        tag?: string
    }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const phone = normalizePhone(body.phone)
    if (!phone) return NextResponse.json({ error: 'phone inválido' }, { status: 400 })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: lead } = await supabase
        .from('crm_leads')
        .select('id')
        .in('telefone', phoneVariants(phone))
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (!lead) return NextResponse.json({ error: 'Lead não encontrado para este telefone' }, { status: 404 })

    const now = new Date().toISOString()
    const update: Record<string, unknown> = {}

    switch (body.action) {
        case 'handoff_on':
            update.handoff_humano = true
            update.handoff_at = now
            if (body.responsavel) update.handoff_responsavel = body.responsavel
            break
        case 'handoff_off':
            update.handoff_humano = false
            update.handoff_at = null
            update.handoff_responsavel = null
            break
        case 'optout_on':
            update.optout_whatsapp = true
            update.optout_at = now
            update.handoff_humano = true
            update.handoff_at = now
            void supabase.from('whatsapp_optouts').upsert({
                phone, lead_id: lead.id, reason: 'manual',
            }, { onConflict: 'phone' })
            break
        case 'optout_off':
            update.optout_whatsapp = false
            update.optout_at = null
            void supabase.from('whatsapp_optouts').delete().eq('phone', phone)
            break
        case 'set_interesse': {
            if (!body.interesse) return NextResponse.json({ error: 'interesse obrigatório' }, { status: 400 })
            const interesseDef = INTERESSES.find(i => i.id === body.interesse)
            if (!interesseDef) return NextResponse.json({ error: 'interesse inválido' }, { status: 400 })
            update.interesse_principal = interesseDef.id
            update.interesse = interesseDef.label
            break
        }
        case 'apply_audience_tag':
        case 'remove_audience_tag': {
            const tag = body.tag?.trim()
            if (!tag) return NextResponse.json({ error: 'tag obrigatório' }, { status: 400 })
            if (!KNOWN_AUDIENCE_TAGS.has(tag)) {
                return NextResponse.json({ error: `tag "${tag}" não é uma audience tag reconhecida` }, { status: 400 })
            }
            try {
                const res = body.action === 'apply_audience_tag'
                    ? await ensureLeadsHaveTag(supabase, [lead.id], tag)
                    : await removeTagFromLeads(supabase, [lead.id], tag)
                return NextResponse.json({ success: true, tag, updated: res.updated })
            } catch (e: unknown) {
                return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao atualizar tag' }, { status: 500 })
            }
        }
        default:
            return NextResponse.json({ error: 'action inválida' }, { status: 400 })
    }

    const { error } = await supabase.from('crm_leads').update(update).eq('id', lead.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
}
