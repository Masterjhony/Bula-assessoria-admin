/**
 * /api/whatsapp/lead-documents/[phone]
 *   GET  → documentos do lead (cadastro + mídias recebidas no WhatsApp), com
 *          signed URLs prontas para abrir/baixar. Alimenta a aba "Documentos"
 *          do inbox.
 *   POST → ações:
 *            { action: 'attach', messageId }   → promove uma mídia recebida
 *               (foto/PDF) a documento formal do lead (crm_lead_documentos).
 *            { action: 'set_tipo', id, tipo }   → reclassifica um documento.
 *
 * Os documentos ficam vinculados ao lead (crm_lead_documentos.lead_id) e, por
 * isso, aparecem também no card do CRM.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { normalizePhone, phoneVariants } from '@/lib/whatsapp-central'
import { WHATSAPP_MEDIA_BUCKET } from '@/lib/whatsapp-inbound'
import { LEAD_DOCS_BUCKET, promoteWhatsappMediaToLeadDoc } from '@/lib/whatsapp-lead-documents'

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function leadIdForPhone(supabase: ReturnType<typeof svc>, phone: string): Promise<string | null> {
    const { data } = await supabase
        .from('crm_leads')
        .select('id')
        .in('telefone', phoneVariants(phone))
        .order('created_at', { ascending: false })
        .limit(1)
    return data?.[0]?.id ?? null
}

export interface LeadDocItem {
    source: 'cadastro' | 'whatsapp'
    id: string
    messageId?: string
    name: string
    tipo: string
    url: string | null
    mime: string | null
    size: number | null
    createdAt: string
    canAttach: boolean
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { phone: rawPhone } = await params
    const phone = normalizePhone(decodeURIComponent(rawPhone))
    if (!phone) return NextResponse.json({ error: 'phone inválido' }, { status: 400 })

    const supabase = svc()
    const leadId = await leadIdForPhone(supabase, phone)

    const [docsRes, mediaRes] = await Promise.all([
        leadId
            ? supabase
                  .from('crm_lead_documentos')
                  .select('id, tipo, nome_arquivo, path, tamanho_bytes, content_type, created_at')
                  .eq('lead_id', leadId)
                  .order('created_at', { ascending: false })
            : Promise.resolve({ data: [] as unknown[] }),
        supabase
            .from('whatsapp_messages')
            .select('id, media_url, media_type, media_mime, media_filename, created_at')
            .in('phone', phoneVariants(phone))
            .eq('direction', 'inbound')
            .in('media_type', ['document', 'image'])
            .not('media_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(100),
    ])

    const items: LeadDocItem[] = []
    const formalNames = new Set<string>()

    for (const d of (docsRes.data ?? []) as Array<{
        id: string; tipo: string | null; nome_arquivo: string; path: string
        tamanho_bytes: number | null; content_type: string | null; created_at: string
    }>) {
        formalNames.add(d.nome_arquivo)
        const { data: signed } = await supabase.storage.from(LEAD_DOCS_BUCKET).createSignedUrl(d.path, 6 * 3600)
        items.push({
            source: 'cadastro',
            id: d.id,
            name: d.nome_arquivo,
            tipo: d.tipo || 'outro',
            url: signed?.signedUrl ?? null,
            mime: d.content_type || null,
            size: d.tamanho_bytes != null ? Number(d.tamanho_bytes) : null,
            createdAt: d.created_at,
            canAttach: false,
        })
    }

    for (const m of (mediaRes.data ?? []) as Array<{
        id: string; media_url: string | null; media_type: string | null
        media_mime: string | null; media_filename: string | null; created_at: string
    }>) {
        if (!m.media_url) continue
        // Evita duplicar uma mídia que já foi promovida a documento formal.
        if (m.media_filename && formalNames.has(m.media_filename)) continue
        const { data: signed } = await supabase.storage.from(WHATSAPP_MEDIA_BUCKET).createSignedUrl(m.media_url, 6 * 3600)
        items.push({
            source: 'whatsapp',
            id: m.id,
            messageId: m.id,
            name: m.media_filename || (m.media_type === 'image' ? 'foto.jpg' : 'arquivo'),
            tipo: m.media_type === 'image' ? 'foto' : 'documento',
            url: signed?.signedUrl ?? null,
            mime: m.media_mime || null,
            size: null,
            createdAt: m.created_at,
            canAttach: !!leadId,
        })
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return NextResponse.json({ documents: items, lead_id: leadId })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { phone: rawPhone } = await params
    const phone = normalizePhone(decodeURIComponent(rawPhone))
    if (!phone) return NextResponse.json({ error: 'phone inválido' }, { status: 400 })

    let body: { action?: string; messageId?: string; id?: string; tipo?: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

    const supabase = svc()

    if (body.action === 'set_tipo') {
        if (!body.id || !body.tipo) return NextResponse.json({ error: 'id e tipo obrigatórios' }, { status: 400 })
        const { error } = await supabase.from('crm_lead_documentos').update({ tipo: body.tipo }).eq('id', body.id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true })
    }

    if (body.action === 'attach') {
        if (!body.messageId) return NextResponse.json({ error: 'messageId obrigatório' }, { status: 400 })
        const leadId = await leadIdForPhone(supabase, phone)
        if (!leadId) return NextResponse.json({ error: 'Lead não encontrado para este número.' }, { status: 404 })

        const { data: msg } = await supabase
            .from('whatsapp_messages')
            .select('media_url, media_filename, media_mime, media_type, body')
            .eq('id', body.messageId)
            .single()
        if (!msg?.media_url) return NextResponse.json({ error: 'Mídia não encontrada.' }, { status: 404 })

        const doc = await promoteWhatsappMediaToLeadDoc(supabase, {
            leadId,
            mediaPath: msg.media_url,
            filename: msg.media_filename,
            mime: msg.media_mime,
            caption: msg.body,
        })
        if (!doc) return NextResponse.json({ error: 'Não foi possível anexar (talvez já anexado).' }, { status: 409 })
        return NextResponse.json({ success: true, doc })
    }

    return NextResponse.json({ error: 'ação desconhecida' }, { status: 400 })
}
