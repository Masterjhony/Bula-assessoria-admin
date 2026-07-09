/**
 * /api/whatsapp/central/metrics — métricas operacionais + custos da Central WhatsApp.
 *
 * Filtros (query string):
 *   ?dias=1|7|30|90      janela do período (default 30)
 *   ?campanha=<chave>    recorta tudo para os leads daquela campanha
 *   ?canal=cloud|baileys recorta por canal de envio
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

// Tarifa média estimada de conversa marketing (USD). Só para ESTIMAR o gasto de
// WhatsApp — o valor faturado real fica no WhatsApp Manager.
const WA_TARIFA_USD = 0.07

/** Janela em que uma inbound conta como "resposta" ao disparo. */
const JANELA_RESPOSTA_MS = 72 * 3600_000

/** Origens que são resposta NOSSA numa conversa em curso, não abordagem. */
const ORIGENS_NAO_DISPARO = new Set([
    'central-inbound', 'central-bot', 'concierge-catchup', 'inbox-sdr', 'crm-assessor', 'manual-admin', 'teste-manual',
])

/** Mensagem de grupo (Baileys). Nunca conta em métrica. */
const isGrupo = (phone: unknown) => String(phone ?? '').includes('@g.us')

/**
 * Chave canônica do telefone: sem DDI e sem o nono dígito. Une "5567998894887",
 * "67998894887" e "6798894887" no mesmo contato — sem isso o mesmo lead conta
 * como duas pessoas e a taxa de resposta sai errada.
 */
function foneKey(phone: unknown): string {
    let d = String(phone ?? '').replace(/\D/g, '')
    if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
    if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3)
    return d
}

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
    const canal = url.searchParams.get('canal')?.trim() || null

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
    let msgs = brutas.filter(m => !isGrupo(m.phone))
    if (canal) msgs = msgs.filter(m => m.channel === canal)
    if (campanha) msgs = msgs.filter(m => fonesCampanha.has(foneKey(m.phone)))

    // ── Taxa de resposta: de quem recebeu um disparo, quantos responderam? ──
    const inboundPorFone = new Map<string, number[]>()
    for (const m of msgs) {
        if (m.direction !== 'inbound') continue
        const k = foneKey(m.phone)
        if (!inboundPorFone.has(k)) inboundPorFone.set(k, [])
        inboundPorFone.get(k)!.push(new Date(m.created_at).getTime())
    }

    // origin → fone → instante do PRIMEIRO envio (a resposta tem que vir depois dele)
    const porOrigem = new Map<string, Map<string, number>>()
    for (const m of msgs) {
        if (m.direction !== 'outbound' || !m.origin) continue
        if (ORIGENS_NAO_DISPARO.has(m.origin)) continue
        if (!['sent', 'delivered', 'read', 'queued'].includes(String(m.status))) continue
        const k = foneKey(m.phone)
        if (!k) continue
        if (!porOrigem.has(m.origin)) porOrigem.set(m.origin, new Map())
        const mapa = porOrigem.get(m.origin)!
        const t = new Date(m.created_at).getTime()
        if (!mapa.has(k) || t < mapa.get(k)!) mapa.set(k, t)
    }

    const taxa_resposta = [...porOrigem.entries()].map(([origin, fones]) => {
        let responderam = 0
        for (const [k, t] of fones) {
            const ins = inboundPorFone.get(k) ?? []
            if (ins.some(x => x > t && x - t < JANELA_RESPOSTA_MS)) responderam++
        }
        return {
            origin,
            enviados: fones.size,
            responderam,
            pct: fones.size ? Number(((responderam / fones.size) * 100).toFixed(1)) : 0,
        }
    }).sort((a, b) => b.enviados - a.enviados)

    const totEnv = taxa_resposta.reduce((a, b) => a + b.enviados, 0)
    const totResp = taxa_resposta.reduce((a, b) => a + b.responderam, 0)

    // ── Cards ───────────────────────────────────────────────────────────────
    const seteDias = new Date(now - 7 * 86400_000)
    const doDia = (m: Msg) => new Date(m.created_at) >= todayStart

    const ultimaPorFone = new Map<string, string>()
    for (const m of msgs) ultimaPorFone.set(foneKey(m.phone), m.direction) // ordem asc → sobra a última

    // ── Custos ──────────────────────────────────────────────────────────────
    const [waConvRes, aiUsageRes, campTotalRes] = await Promise.all([
        supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true })
            .eq('direction', 'outbound').gte('created_at', trintaDias.toISOString())
            .or('intent.eq.campaign,bot_step.eq.welcome,origin.eq.backlog-frio'),
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
    const wa_conversas_empresa_30d = waConvRes.count ?? 0

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
        canal,
        campanhas,
        mensagens_grupo_excluidas,
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
            enviados: totEnv,
            responderam: totResp,
            pct: totEnv ? Number(((totResp / totEnv) * 100).toFixed(1)) : 0,
        },

        wa_conversas_empresa_30d,
        gasto_whatsapp_estimado_30d: Number((wa_conversas_empresa_30d * WA_TARIFA_USD).toFixed(2)),
        gasto_ia_30d: Number(gasto_ia_30d.toFixed(4)),
        gasto_ia_hoje: Number(gasto_ia_hoje.toFixed(4)),
        wa_tarifa_usd: WA_TARIFA_USD,
        distribuicao_interesse,
    })
}
