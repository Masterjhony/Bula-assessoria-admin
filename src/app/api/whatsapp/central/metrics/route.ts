/**
 * /api/whatsapp/central/metrics — métricas operacionais + custos da Central WhatsApp.
 *
 * Filtros (query string):
 *   ?dias=1|7|30|90      janela do período (default 30)
 *   ?campanha=<chave>    recorta tudo para os leads daquela campanha
 *
 * SÓ A API OFICIAL ENTRA. Desde 11/08/2026 esta rota mede exclusivamente o
 * número oficial (Cloud API) — o filtro vive em `somenteApiOficial`, na fonte
 * única. Antes não havia filtro de canal nenhum: bastava não escolher "API
 * oficial" no seletor para o Baileys entrar junto e o mesmo lead ser contado
 * duas vezes. Baileys é assessor e grupo de leiloeira, não é atendimento.
 *
 * GRUPOS NÃO ENTRAM EM MÉTRICA. As conversas dos grupos internos e das leiloeiras
 * são do Baileys e vivem na MESMA tabela das conversas com lead (`phone` termina
 * em `@g.us`). Em 09/07/2026 o painel dizia "1.013 mensagens recebidas hoje"
 * quando só 91 vinham de lead — o resto era a equipe conversando em grupo.
 * Nenhuma contagem daqui os inclui.
 *
 * A métrica que interessa ao comercial é a TAXA DE RESPOSTA por disparo: de quem
 * recebeu, quantos responderam em até 72h. É ela que separa lista fria de
 * reengajamento de quem já falou com a Bula — números que a média esconde.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { INTERESSES } from '@/lib/whatsapp-central'
import {
    isGrupo, foneKey, somenteApiOficial, atendimentoResposta, atendimentoGrowth,
} from '@/lib/atendimento-stats'
import { getMetaBilling } from '@/lib/whatsapp-billing'

interface Msg {
    phone: string
    direction: string
    status: string | null
    origin: string | null
    channel: string | null
    created_at: string
}

interface LeadRow {
    id: string
    telefone: string | null
    celular: string | null
    origem: string | null
    interesse_principal: string | null
    handoff_humano: boolean | null
    optout_whatsapp: boolean | null
    created_at: string
    extra_data: Record<string, unknown> | null
}

/** PostgREST devolve no máximo 1000 linhas por chamada — sempre paginar. */
async function paginar<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
    const out: T[] = []
    for (let from = 0; ; from += 1000) {
        const { data } = await fetchPage(from, from + 999)
        if (!data?.length) break
        out.push(...data)
        if (data.length < 1000) break
    }
    return out
}

/** Chave de campanha do lead: o UTM do anúncio, o evento, ou a origem. */
function campanhaDoLead(lead: Pick<LeadRow, 'origem' | 'extra_data'>): string {
    const xd = lead.extra_data ?? {}
    const utm = (xd.utm ?? {}) as Record<string, unknown>
    const campaign = String(utm.campaign ?? '').trim()
    if (campaign) return campaign
    const evento = String(xd.evento ?? '').trim()
    if (evento) return `evento:${evento}`
    return String(lead.origem ?? '').trim() || '(sem origem)'
}

export async function GET(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const url = new URL(req.url)
    const dias = Math.min(Math.max(Number(url.searchParams.get('dias')) || 30, 1), 365)
    const campanha = url.searchParams.get('campanha')?.trim() || null

    const now = Date.now()
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const inicio = new Date(now - dias * 86400_000)
    const trintaDias = new Date(now - 30 * 86400_000)

    // ── Leads: base de todos os recortes ────────────────────────────────────
    const leads = await paginar<LeadRow>((from, to) => supabase
        .from('crm_leads')
        .select('id, telefone, celular, origem, interesse_principal, handoff_humano, optout_whatsapp, created_at, extra_data')
        .eq('arquivado', false)
        .order('id')
        .range(from, to) as unknown as PromiseLike<{ data: LeadRow[] | null }>,
    )

    // Catálogo de campanhas para o seletor da UI.
    const contagem = new Map<string, number>()
    for (const l of leads) contagem.set(campanhaDoLead(l), (contagem.get(campanhaDoLead(l)) ?? 0) + 1)
    const campanhas = [...contagem.entries()]
        .map(([key, leads]) => ({ key, leads }))
        .sort((a, b) => b.leads - a.leads)
        .slice(0, 30)

    const leadsFiltrados = campanha ? leads.filter(l => campanhaDoLead(l) === campanha) : leads

    // Telefones da campanha — é por eles que recortamos as mensagens.
    const fonesCampanha = new Set<string>()
    for (const l of leadsFiltrados) {
        for (const p of [l.telefone, l.celular]) {
            const k = foneKey(p)
            if (k) fonesCampanha.add(k)
        }
    }

    // ── Mensagens do período (sem grupo, nunca) ─────────────────────────────
    const brutas = await paginar<Msg>((from, to) => supabase
        .from('whatsapp_messages')
        .select('phone, direction, status, origin, channel, created_at')
        .gte('created_at', inicio.toISOString())
        .order('created_at')
        .range(from, to) as unknown as PromiseLike<{ data: Msg[] | null }>,
    )

    const mensagens_grupo_excluidas = brutas.filter(m => isGrupo(m.phone)).length
    const oficiais = somenteApiOficial(brutas)
    const mensagens_outro_canal_excluidas = brutas.length - mensagens_grupo_excluidas - oficiais.length
    const msgs = campanha ? oficiais.filter(m => fonesCampanha.has(foneKey(m.phone))) : oficiais

    // Taxa de resposta por origem e no total. A regra de "o que é disparo" mora
    // na fonte única (janela de 24h), não numa lista de origens mantida à mão.
    const taxa_resposta = atendimentoGrowth(msgs, dias, now).por_origem

    // Total por PESSOA (não soma de origens — senão quem levou 2 disparos conta 2x).
    const totalPessoas = atendimentoResposta(msgs)

    // ── Cards ───────────────────────────────────────────────────────────────
    const seteDias = new Date(now - 7 * 86400_000)
    const doDia = (m: Msg) => new Date(m.created_at) >= todayStart

    const ultimaPorFone = new Map<string, string>()
    for (const m of msgs) ultimaPorFone.set(foneKey(m.phone), m.direction) // ordem asc → sobra a última

    // ── Custos ──────────────────────────────────────────────────────────────
    // WhatsApp: valor FATURADO pela Meta, não estimativa. IA: custo real logado
    // por chamada. Se a Meta não responder, `ok:false` e a tela mostra
    // indisponível — nunca um número inventado.
    const [metaBilling, aiUsageRes, campTotalRes] = await Promise.all([
        getMetaBilling(trintaDias, new Date(now)),
        supabase.from('ai_usage_log').select('created_at, cost_usd')
            .gte('created_at', trintaDias.toISOString()).limit(20000),
        supabase.from('whatsapp_campaigns').select('id', { count: 'exact', head: true })
            .neq('status', 'rascunho').gte('created_at', trintaDias.toISOString()),
    ])

    let gasto_ia_30d = 0, gasto_ia_hoje = 0
    for (const r of aiUsageRes.data ?? []) {
        const c = Number(r.cost_usd) || 0
        gasto_ia_30d += c
        if (new Date(r.created_at as string) >= todayStart) gasto_ia_hoje += c
    }

    // ── Distribuição de interesse (do recorte) ──────────────────────────────
    const distribuicao_interesse: Record<string, number> = {}
    for (const i of INTERESSES) distribuicao_interesse[i.id] = 0
    for (const l of leadsFiltrados) {
        if (!l.interesse_principal) continue
        distribuicao_interesse[l.interesse_principal] = (distribuicao_interesse[l.interesse_principal] ?? 0) + 1
    }

    return NextResponse.json({
        periodo_dias: dias,
        campanha,
        campanhas,
        mensagens_grupo_excluidas,
        mensagens_outro_canal_excluidas,
        leads_no_recorte: leadsFiltrados.length,

        novos_contatos_7d: leadsFiltrados.filter(l => new Date(l.created_at) >= seteDias).length,
        leads_com_interesse: leadsFiltrados.filter(l => l.interesse_principal).length,
        aguardando_humano: leadsFiltrados.filter(l => l.handoff_humano).length,
        opt_outs: leadsFiltrados.filter(l => l.optout_whatsapp).length,
        mensagens_enviadas_hoje: msgs.filter(m => m.direction === 'outbound' && doDia(m)).length,
        mensagens_recebidas_hoje: msgs.filter(m => m.direction === 'inbound' && doDia(m)).length,
        mensagens_enviadas_periodo: msgs.filter(m => m.direction === 'outbound').length,
        mensagens_recebidas_periodo: msgs.filter(m => m.direction === 'inbound').length,
        campanhas_disparadas_30d: campTotalRes.count ?? 0,
        leads_aguardando_resposta: [...ultimaPorFone.values()].filter(d => d === 'outbound').length,

        taxa_resposta,
        taxa_resposta_total: {
            enviados: totalPessoas.disparados,
            responderam: totalPessoas.responderam,
            pct: totalPessoas.pct,
        },

        wa_billing: metaBilling,
        gasto_ia_30d: Number(gasto_ia_30d.toFixed(4)),
        gasto_ia_hoje: Number(gasto_ia_hoje.toFixed(4)),
        distribuicao_interesse,
    })
}
