/**
 * /api/whatsapp/campaign-callback — recebe callback do VPS após cada
 * destinatário ter sido tentado. Atualiza whatsapp_campaign_recipients e
 * incrementa contadores na campanha. Quando todos os recipients estiverem
 * processados, marca a campanha como concluída.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
    const SECRET = process.env.WHATSAPP_GROUP_TASK_SECRET || ''
    const auth = req.headers.get('x-webhook-secret')
    if (!SECRET || auth !== SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: {
        campaign_id: string
        recipient_id?: string | null
        phone: string
        status: 'enviado' | 'falhou'
        error?: string
        message_id?: string
    }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const update: Record<string, unknown> = {
        status: body.status,
        sent_at: new Date().toISOString(),
    }
    if (body.error) update.error_msg = body.error

    if (body.recipient_id) {
        await supabase
            .from('whatsapp_campaign_recipients')
            .update(update)
            .eq('id', body.recipient_id)
    }

    // Loga no whatsapp_messages
    void supabase.from('whatsapp_messages').insert({
        phone: body.phone,
        name: null,
        body: null,
        direction: 'outbound',
        status: body.status === 'enviado' ? 'sent' : 'failed',
        origin: 'campaign',
        campaign_id: body.campaign_id,
        error_msg: body.error ?? null,
    })

    // Recalcula contadores na campanha (count exato — sem limite de 1000)
    const [sentRes, failedRes, pendingRes] = await Promise.all([
        supabase
            .from('whatsapp_campaign_recipients')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', body.campaign_id)
            .eq('status', 'enviado'),
        supabase
            .from('whatsapp_campaign_recipients')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', body.campaign_id)
            .eq('status', 'falhou'),
        supabase
            .from('whatsapp_campaign_recipients')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', body.campaign_id)
            .eq('status', 'pendente'),
    ])

    const campaignUpdate: Record<string, unknown> = {
        sent_count: sentRes.count ?? 0,
        failed_count: failedRes.count ?? 0,
    }
    if ((pendingRes.count ?? 0) === 0) {
        campaignUpdate.status = 'concluida'
        campaignUpdate.finished_at = new Date().toISOString()
    }
    await supabase.from('whatsapp_campaigns').update(campaignUpdate).eq('id', body.campaign_id)

    return NextResponse.json({ success: true })
}
