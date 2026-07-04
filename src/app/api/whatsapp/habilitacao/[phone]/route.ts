/**
 * GET /api/whatsapp/habilitacao/[phone]
 *
 * Progresso da HABILITAÇÃO do lead deste número: checklist (o mesmo que guia a
 * IA — fonte única em src/lib/crm-habilitacao.ts), etapa atual e o histórico
 * auditável das mudanças de etapa (quem moveu, por quê). Alimenta o painel
 * "Habilitação" do inbox e do cockpit.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { normalizePhone, phoneVariants } from '@/lib/whatsapp-central'
import { computeHabilitacaoChecklist } from '@/lib/crm-habilitacao'
import { normalizeCRMStatus } from '@/lib/crm-types'

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { phone: rawPhone } = await params
    const phone = normalizePhone(decodeURIComponent(rawPhone))
    if (!phone) return NextResponse.json({ error: 'phone inválido' }, { status: 400 })

    const supabase = svc()
    const { data: leads } = await supabase
        .from('crm_leads')
        .select('id, nome, telefone, celular, email, cpf, status, interesse_principal, o_que_busca, inscricao_estadual, tem_inscricao_estadual, quantidade_animais, score_serasa, pendencias_financeiras, handoff_humano, optout_whatsapp, extra_data')
        .in('telefone', phoneVariants(phone))
        .order('created_at', { ascending: false })
        .limit(1)
    const lead = leads?.[0]
    if (!lead) return NextResponse.json({ lead: null })

    const { data: docs } = await supabase
        .from('crm_lead_documentos')
        .select('tipo')
        .eq('lead_id', lead.id)

    const checklist = computeHabilitacaoChecklist({
        nome: lead.nome,
        cpf: lead.cpf,
        telefone: lead.telefone,
        celular: lead.celular,
        email: lead.email,
        inscricao_estadual: lead.inscricao_estadual,
        tem_inscricao_estadual: lead.tem_inscricao_estadual,
        extra_data: lead.extra_data as Record<string, unknown> | null,
        docsCount: docs?.length ?? 0,
        docTipos: (docs ?? []).map(d => String(d.tipo || 'outro')),
    })

    const xd = (lead.extra_data ?? {}) as Record<string, unknown>
    return NextResponse.json({
        lead: {
            id: lead.id,
            nome: lead.nome,
            status: normalizeCRMStatus(lead.status),
            interesse: lead.interesse_principal || lead.o_que_busca || null,
            score: lead.score_serasa ?? null,
            pendencias: lead.pendencias_financeiras ?? null,
            handoff: !!lead.handoff_humano,
            optout: !!lead.optout_whatsapp,
            urgencia: (xd.urgencia_compra as string) || null,
            proximaAcao: (xd.proxima_acao as string) || null,
            cadastroStatus: (xd.cadastro_status as string) || null,
        },
        checklist,
        stageHistory: Array.isArray(xd.stage_history) ? xd.stage_history.slice(0, 10) : [],
    })
}
