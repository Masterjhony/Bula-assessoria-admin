/**
 * /api/whatsapp/central/metrics — métricas operacionais + custos da Central WhatsApp.
 *   - novos_contatos_7d          (leads inbound criados via central nos últimos 7 dias)
 *   - leads_com_interesse        (têm interesse_principal preenchido)
 *   - aguardando_humano          (handoff_humano = true)
 *   - opt_outs                   (optout_whatsapp = true)
 *   - mensagens_enviadas_hoje / recebidas_hoje
 *   - campanhas_disparadas_30d
 *   - leads_aguardando_resposta  (última mensagem da conversa foi nossa)
 *   - gasto_whatsapp_estimado_30d (ESTIMATIVA: conversas iniciadas pela empresa × tarifa)
 *   - gasto_ia_30d / gasto_ia_hoje (real, somado de ai_usage_log)
 *   - distribuicao_interesse
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { INTERESSES } from '@/lib/whatsapp-central'

// Tarifa média estimada de conversa marketing (USD). Só para ESTIMAR o gasto de
// WhatsApp — o valor faturado real fica no WhatsApp Manager.
const WA_TARIFA_USD = 0.07

export async function GET() {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const now = Date.now()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000)
    const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000)

    const [
        novosRes,
        comInteresseRes,
        handoffRes,
        optoutRes,
        sentTodayRes,
        recvTodayRes,
        campTotalRes,
        leadsInteresseRes,
        waConvRes,
        aiUsageRes,
        waitingRes,
    ] = await Promise.all([
        supabase.from('crm_leads').select('id', { count: 'exact', head: true })
            .eq('origem', 'whatsapp-central').gte('created_at', sevenDaysAgo.toISOString()),
        supabase.from('crm_leads').select('id', { count: 'exact', head: true })
            .not('interesse_principal', 'is', null),
        supabase.from('crm_leads').select('id', { count: 'exact', head: true })
            .eq('handoff_humano', true),
        supabase.from('crm_leads').select('id', { count: 'exact', head: true })
            .eq('optout_whatsapp', true),
        supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true })
            .eq('direction', 'outbound').gte('created_at', todayStart.toISOString()),
        supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true })
            .eq('direction', 'inbound').gte('created_at', todayStart.toISOString()),
        supabase.from('whatsapp_campaigns').select('id', { count: 'exact', head: true })
            .neq('status', 'rascunho').gte('created_at', thirtyDaysAgo.toISOString()),
        supabase.from('crm_leads').select('interesse_principal')
            .not('interesse_principal', 'is', null).limit(2000),
        // Conversas iniciadas pela empresa (estimativa de custo): template/campanha,
        // welcome e disparo de backlog são business-initiated (pagas).
        supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true })
            .eq('direction', 'outbound').gte('created_at', thirtyDaysAgo.toISOString())
            .or('intent.eq.campaign,bot_step.eq.welcome,origin.eq.backlog-frio'),
        // Uso de IA (soma em JS; tolera tabela ausente).
        supabase.from('ai_usage_log').select('created_at,cost_usd')
            .gte('created_at', thirtyDaysAgo.toISOString()).limit(20000),
        // Mensagens 14d para deduzir "aguardando resposta" (última msg nossa).
        supabase.from('whatsapp_messages').select('phone,direction,created_at')
            .gte('created_at', fourteenDaysAgo.toISOString())
            .order('created_at', { ascending: false }).limit(8000),
    ])

    const distribuicao_interesse: Record<string, number> = {}
    for (const i of INTERESSES) distribuicao_interesse[i.id] = 0
    for (const row of leadsInteresseRes.data ?? []) {
        const k = row.interesse_principal as string
        distribuicao_interesse[k] = (distribuicao_interesse[k] ?? 0) + 1
    }

    // Gasto de IA (real).
    let gasto_ia_30d = 0, gasto_ia_hoje = 0
    for (const r of aiUsageRes.data ?? []) {
        const c = Number(r.cost_usd) || 0
        gasto_ia_30d += c
        if (new Date(r.created_at as string) >= todayStart) gasto_ia_hoje += c
    }

    // Gasto WhatsApp (estimado).
    const wa_conversas_empresa_30d = waConvRes.count ?? 0
    const gasto_whatsapp_estimado_30d = wa_conversas_empresa_30d * WA_TARIFA_USD

    // Aguardando resposta: última mensagem por telefone foi outbound (nós falamos por último).
    const lastByPhone = new Map<string, string>()
    for (const r of waitingRes.data ?? []) {
        const phone = r.phone as string
        if (!lastByPhone.has(phone)) lastByPhone.set(phone, r.direction as string)
    }
    let leads_aguardando_resposta = 0
    for (const dir of lastByPhone.values()) if (dir === 'outbound') leads_aguardando_resposta++

    return NextResponse.json({
        novos_contatos_7d: novosRes.count ?? 0,
        leads_com_interesse: comInteresseRes.count ?? 0,
        aguardando_humano: handoffRes.count ?? 0,
        opt_outs: optoutRes.count ?? 0,
        mensagens_enviadas_hoje: sentTodayRes.count ?? 0,
        mensagens_recebidas_hoje: recvTodayRes.count ?? 0,
        campanhas_disparadas_30d: campTotalRes.count ?? 0,
        leads_aguardando_resposta,
        wa_conversas_empresa_30d,
        gasto_whatsapp_estimado_30d: Number(gasto_whatsapp_estimado_30d.toFixed(2)),
        gasto_ia_30d: Number(gasto_ia_30d.toFixed(4)),
        gasto_ia_hoje: Number(gasto_ia_hoje.toFixed(4)),
        wa_tarifa_usd: WA_TARIFA_USD,
        distribuicao_interesse,
    })
}
