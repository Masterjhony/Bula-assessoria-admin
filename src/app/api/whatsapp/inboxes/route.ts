/**
 * /api/whatsapp/inboxes — CRUD das caixas de atendimento (multi-inbox).
 *
 *   GET    → lista inboxes (ativos; ?all=1 inclui arquivados). Para os Baileys,
 *            mescla o status de conexão vindo do VPS (/sessions).
 *   POST   → cria um inbox Baileys ({ id, label, phone? }): grava a linha e
 *            cria a sessão no VPS (que passa a gerar QR/aguardar pareamento).
 *   PATCH  → atualiza { id, label?, ativo?, automations_enabled?, ordem? }.
 *   DELETE → ?id=<id> remove o inbox e a sessão no VPS. 'cloud' e o inbox
 *            default ('joao') são protegidos.
 *
 * Admin-gated. A UI (Central WhatsApp) consome para o seletor de inbox e o
 * gerenciador de sessões na aba Conexão.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import {
    listInboxes,
    loadInbox,
    CLOUD_INBOX_ID,
    DEFAULT_BAILEYS_INBOX_ID,
    type WhatsappInbox,
} from '@/lib/whatsapp-inboxes'
import { fetchVpsSessions, createVpsSession, deleteVpsSession, type VpsSessionInfo } from '@/lib/whatsapp-vps'

const SESSION_ID_RE = /^[a-z0-9][a-z0-9-]{1,31}$/

function supa() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
}

export async function GET(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const activeOnly = new URL(req.url).searchParams.get('all') !== '1'
    const supabase = supa()
    const inboxes = await listInboxes(supabase, { activeOnly })

    // Status ao vivo das sessões Baileys (best-effort: se o VPS estiver
    // inacessível, seguimos com o status persistido).
    let vpsById = new Map<string, VpsSessionInfo>()
    if (inboxes.some(i => i.kind === 'baileys')) {
        try {
            const { sessions } = await fetchVpsSessions()
            vpsById = new Map(sessions.map(s => [s.id, s]))
        } catch { /* VPS off → usa status persistido */ }
    }

    const rows = inboxes.map(i => ({
        ...i,
        live_status: i.kind === 'baileys' ? (vpsById.get(i.id)?.status ?? null) : null,
        queue_size: i.kind === 'baileys' ? (vpsById.get(i.id)?.queueSize ?? null) : null,
    }))
    return NextResponse.json({ inboxes: rows })
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body: { id?: string; label?: string; phone?: string }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }
    const id = String(body.id || '').trim().toLowerCase()
    const label = String(body.label || '').trim()
    if (!SESSION_ID_RE.test(id)) {
        return NextResponse.json({ error: 'ID inválido (use slug minúsculo [a-z0-9-], 2–32 caracteres).' }, { status: 400 })
    }
    if (!label) return NextResponse.json({ error: 'Informe um nome para o inbox.' }, { status: 400 })

    const supabase = supa()
    if (await loadInbox(supabase, id)) {
        return NextResponse.json({ error: 'Já existe um inbox com esse ID.' }, { status: 409 })
    }

    // Cria a sessão no VPS primeiro — se o VPS estiver off, não grava o inbox
    // órfão (evita um inbox sem sessão que nunca conecta).
    const vps = await createVpsSession(id)
    if (vps.error) {
        return NextResponse.json({ error: `VPS: ${vps.error}` }, { status: 502 })
    }

    const { data, error } = await supabase
        .from('whatsapp_inboxes')
        .insert({
            id,
            label,
            kind: 'baileys',
            channel: 'baileys',
            phone: body.phone ? String(body.phone).replace(/\D/g, '') : null,
            status: vps.status ?? 'connecting',
            is_primary: false,
            automations_enabled: false, // novo Baileys nasce MANUAL (decisão de produto)
            ativo: true,
            ordem: 100,
        })
        .select()
        .single()

    if (error) {
        // Rollback best-effort da sessão criada no VPS.
        await deleteVpsSession(id).catch(() => {})
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ inbox: data as WhatsappInbox }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body: { id?: string; label?: string; ativo?: boolean; automations_enabled?: boolean; ordem?: number }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }
    const id = String(body.id || '').trim()
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

    const patch: Record<string, unknown> = {}
    if (typeof body.label === 'string') patch.label = body.label.trim()
    if (typeof body.ativo === 'boolean') patch.ativo = body.ativo
    if (typeof body.automations_enabled === 'boolean') patch.automations_enabled = body.automations_enabled
    if (typeof body.ordem === 'number') patch.ordem = body.ordem
    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
    }

    const supabase = supa()
    const { data, error } = await supabase
        .from('whatsapp_inboxes')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ inbox: data as WhatsappInbox })
}

export async function DELETE(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const id = (new URL(req.url).searchParams.get('id') || '').trim()
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
    if (id === CLOUD_INBOX_ID || id === DEFAULT_BAILEYS_INBOX_ID) {
        return NextResponse.json({ error: 'Este inbox é protegido e não pode ser removido.' }, { status: 403 })
    }

    const supabase = supa()
    const inbox = await loadInbox(supabase, id)
    if (!inbox) return NextResponse.json({ error: 'Inbox não encontrado.' }, { status: 404 })

    if (inbox.kind === 'baileys') {
        const vps = await deleteVpsSession(id)
        if (vps.error) return NextResponse.json({ error: `VPS: ${vps.error}` }, { status: 502 })
    }
    const { error } = await supabase.from('whatsapp_inboxes').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: true, id })
}
