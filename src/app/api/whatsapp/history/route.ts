/**
 * /api/whatsapp/history — ingestão do histórico do WhatsApp (Baileys history
 * sync). O VPS envia lotes de mensagens 1:1 ao conectar/parear; aqui persistimos
 * o recorte no CRM para o inbox não nascer vazio.
 *
 * Decisões:
 *   - Dedup por `message_id` (reason): reconexões reenviam o mesmo histórico.
 *   - Linka a lead EXISTENTE (por telefone), mas NÃO cria lead novo — evita
 *     importar em massa contatos pessoais antigos para o CRM. Conversas de
 *     números desconhecidos aparecem no inbox e podem ser promovidas à mão.
 *   - `created_at` vem do timestamp da mensagem (ordena a thread corretamente).
 *
 * Auth: header `x-webhook-secret` = WHATSAPP_GROUP_TASK_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone, phoneVariants } from '@/lib/whatsapp-central'
import { resolveBaileysInbox } from '@/lib/whatsapp-inboxes'

export const maxDuration = 120

interface HistMsg {
    phone: string
    name?: string
    body: string
    from_me?: boolean
    message_id?: string
    ts?: number | null
}

export async function POST(req: NextRequest) {
    const SECRET = process.env.WHATSAPP_GROUP_TASK_SECRET || ''
    if (!SECRET || req.headers.get('x-webhook-secret') !== SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { session?: string; messages?: HistMsg[] }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const raw = Array.isArray(body.messages) ? body.messages : []
    if (raw.length === 0) return NextResponse.json({ inserted: 0 })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const inbox = await resolveBaileysInbox(supabase, body.session)
    const inboxId = inbox?.id ?? body.session ?? 'joao'

    // Normaliza + descarta sem id (não dá pra deduplicar) ou sem texto.
    const msgs = raw
        .map(m => ({ ...m, phone: normalizePhone(m.phone) || '' }))
        .filter(m => m.phone && m.message_id && (m.body || '').trim())

    // Dedup dentro do lote (o mesmo id pode vir repetido no sync).
    const seen = new Set<string>()
    const unique = msgs.filter(m => {
        if (seen.has(m.message_id!)) return false
        seen.add(m.message_id!)
        return true
    })
    if (unique.length === 0) return NextResponse.json({ inserted: 0 })

    // Já existentes (por reason/message_id) — em chunks para não estourar a URL.
    const ids = unique.map(m => m.message_id!)
    const existing = new Set<string>()
    for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase
            .from('whatsapp_messages')
            .select('reason')
            .in('reason', ids.slice(i, i + 200))
        for (const r of data ?? []) if (r.reason) existing.add(r.reason)
    }
    const fresh = unique.filter(m => !existing.has(m.message_id!))
    if (fresh.length === 0) return NextResponse.json({ inserted: 0 })

    // Linka a leads EXISTENTES (lookup em lote por telefone/celular).
    const phones = [...new Set(fresh.map(m => m.phone))]
    const variants = [...new Set(phones.flatMap(p => phoneVariants(p).filter(v => /^\d+$/.test(v))))]
    const leadByVariant = new Map<string, string>()
    for (let i = 0; i < variants.length; i += 200) {
        const chunk = variants.slice(i, i + 200)
        const [byTel, byCel] = await Promise.all([
            supabase.from('crm_leads').select('id, telefone, celular').in('telefone', chunk),
            supabase.from('crm_leads').select('id, telefone, celular').in('celular', chunk),
        ])
        for (const l of [...(byTel.data ?? []), ...(byCel.data ?? [])]) {
            for (const raw of [l.telefone, l.celular]) {
                if (!raw) continue
                for (const v of phoneVariants(raw)) if (!leadByVariant.has(v)) leadByVariant.set(v, l.id)
            }
        }
    }

    const rows = fresh.map(m => ({
        phone: m.phone,
        name: m.from_me ? null : (m.name || null), // fromMe: pushName é do dono, não do contato
        status: m.from_me ? 'sent' : 'received',
        body: m.body.trim(),
        direction: m.from_me ? 'outbound' : 'inbound',
        origin: 'baileys-history',
        channel: 'baileys',
        inbox_id: inboxId,
        reason: m.message_id,
        lead_id: leadByVariant.get(m.phone) ?? null,
        created_at: m.ts ? new Date(m.ts * 1000).toISOString() : new Date().toISOString(),
    }))

    const { error } = await supabase.from('whatsapp_messages').insert(rows)
    if (error) {
        console.warn('[history] insert falhou:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ inserted: rows.length })
}
