/**
 * /api/whatsapp/central/metrics — métricas operacionais da Central WhatsApp.
 *   - novos_contatos_7d         (leads inbound criados via central nos últimos 7 dias)
 *   - leads_com_interesse       (têm interesse_principal preenchido)
 *   - aguardando_humano         (handoff_humano = true)
 *   - opt_outs                  (optout_whatsapp = true)
 *   - mensagens_enviadas_hoje
 *   - mensagens_recebidas_hoje
 *   - campanhas_disparadas_30d
 *   - distribuicao_interesse    (contagem por interesse_principal)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { INTERESSES } from '@/lib/whatsapp-central'

export async function GET() {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [
        novosRes,
        comInteresseRes,
        handoffRes,
        optoutRes,
        sentTodayRes,
        recvTodayRes,
        campTotalRes,
        leadsInteresseRes,
    ] = await Promise.all([
        supabase
            .from('crm_leads')
            .select('id', { count: 'exact', head: true })
            .eq('origem', 'whatsapp-central')
            .gte('created_at', sevenDaysAgo.toISOString()),
        supabase
            .from('crm_leads')
            .select('id', { count: 'exact', head: true })
            .not('interesse_principal', 'is', null),
        supabase
            .from('crm_leads')
            .select('id', { count: 'exact', head: true })
            .eq('handoff_humano', true),
        supabase
            .from('crm_leads')
            .select('id', { count: 'exact', head: true })
            .eq('optout_whatsapp', true),
        supabase
            .from('whatsapp_messages')
            .select('id', { count: 'exact', head: true })
            .eq('direction', 'outbound')
            .gte('created_at', todayStart.toISOString()),
        supabase
            .from('whatsapp_messages')
            .select('id', { count: 'exact', head: true })
            .eq('direction', 'inbound')
            .gte('created_at', todayStart.toISOString()),
        supabase
            .from('whatsapp_campaigns')
            .select('id', { count: 'exact', head: true })
            .neq('status', 'rascunho')
            .gte('created_at', thirtyDaysAgo.toISOString()),
        supabase
            .from('crm_leads')
            .select('interesse_principal')
            .not('interesse_principal', 'is', null)
            .limit(2000),
    ])

    const distribuicao_interesse: Record<string, number> = {}
    for (const i of INTERESSES) distribuicao_interesse[i.id] = 0
    for (const row of leadsInteresseRes.data ?? []) {
        const k = row.interesse_principal as string
        distribuicao_interesse[k] = (distribuicao_interesse[k] ?? 0) + 1
    }

    return NextResponse.json({
        novos_contatos_7d: novosRes.count ?? 0,
        leads_com_interesse: comInteresseRes.count ?? 0,
        aguardando_humano: handoffRes.count ?? 0,
        opt_outs: optoutRes.count ?? 0,
        mensagens_enviadas_hoje: sentTodayRes.count ?? 0,
        mensagens_recebidas_hoje: recvTodayRes.count ?? 0,
        campanhas_disparadas_30d: campTotalRes.count ?? 0,
        distribuicao_interesse,
    })
}
