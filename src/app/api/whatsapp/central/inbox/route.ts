/**
 * /api/whatsapp/central/inbox — lista de conversas (uma por número), com
 * última mensagem, status do lead (handoff/optout/interesse) e contadores.
 *
 * Query params opcionais:
 *   ?filter=todos|aguardando|handoff|optout|interesse
 *   ?q=texto-livre (procura no nome/telefone)
 *   ?interesse=touros|matrizes|...
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { phoneVariants } from '@/lib/whatsapp-central'

interface ConversationRow {
    phone: string
    name: string | null
    last_message: string | null
    last_direction: 'inbound' | 'outbound' | null
    last_at: string
    inbound_pending: number
    /** Último canal usado na conversa: 'cloud' (API oficial) | 'baileys'. */
    channel: 'cloud' | 'baileys' | null
    lead_id: string | null
    lead_nome: string | null
    interesse_principal: string | null
    handoff_humano: boolean
    handoff_responsavel: string | null
    optout_whatsapp: boolean
    stage: string | null
    status: string | null
}

export async function GET(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const url = new URL(req.url)
    const filter = url.searchParams.get('filter') ?? 'todos'
    const q = (url.searchParams.get('q') || '').trim().toLowerCase()
    const interesseFilter = url.searchParams.get('interesse')
    const channelFilter = url.searchParams.get('channel') // 'cloud' | 'baileys'
    // Multi-inbox: escopa a lista a uma caixa (conversa = inbox + telefone).
    const inboxFilter = (url.searchParams.get('inbox') || '').trim() || null

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // TODAS as mensagens com phone, PAGINANDO (mais recente → mais antiga), para
    // que a lista contenha UMA conversa por número, independente do volume e SEM
    // sumir com o tempo. Antes usávamos `.limit(8000)` numa query só — mas o
    // PostgREST corta a resposta no `db-max-rows` (1000 por padrão), então na
    // prática só as ~1000 msgs mais recentes eram lidas; como 2000+ msgs/dia são
    // concierge/grupos (descartados abaixo), sobravam pouquíssimas conversas de
    // cliente. Paginar por `.range()` devolve páginas cheias e cobre todo o
    // histórico, mantendo os contatos sempre pesquisáveis. (Cap de segurança bem
    // acima do volume atual só pra evitar loop infinito se algo der errado.)
    const PAGE = 1000
    const MAX_MSGS = 60000
    const messages: {
        id: string; phone: string | null; name: string | null
        direction: string | null; body: string | null; status: string | null
        lead_id: string | null; created_at: string; origin: string | null
        intent: string | null; channel: string | null
    }[] = []
    for (let from = 0; from < MAX_MSGS; from += PAGE) {
        let pageQuery = supabase
            .from('whatsapp_messages')
            .select('id, phone, name, direction, body, status, lead_id, created_at, origin, intent, channel')
            .not('phone', 'is', null)
        // Scripts de disparo às vezes gravam sem inbox_id; msg de canal cloud com
        // inbox nulo pertence ao inbox 'cloud' (só existe um) — sem isto, quem só
        // recebeu template de campanha some da lista (bug de 18/07).
        if (inboxFilter === 'cloud') pageQuery = pageQuery.or('inbox_id.eq.cloud,and(inbox_id.is.null,channel.eq.cloud)')
        else if (inboxFilter) pageQuery = pageQuery.eq('inbox_id', inboxFilter)
        const { data, error: msgErr } = await pageQuery
            .order('created_at', { ascending: false })
            .range(from, from + PAGE - 1)
        if (msgErr) {
            return NextResponse.json({ error: msgErr.message }, { status: 500 })
        }
        if (!data || data.length === 0) break
        messages.push(...data)
        if (data.length < PAGE) break
    }

    // Tráfego interno do Baileys que NÃO é conversa de cliente: envios a grupos
    // (JID no lugar do phone), avisos de automação e o inbound de grupos das
    // leiloeiras. O inbox é o canal do CLIENTE (API oficial em 1º lugar).
    const INTERNAL_ORIGINS = new Set(['crm-assessor', 'group-manual', 'group-inbound', 'gif-lotes'])

    const byPhone = new Map<string, {
        last: typeof messages[number]
        inbound_pending: number
        channel: 'cloud' | 'baileys' | null
    }>()
    for (const m of messages ?? []) {
        if (!m.phone) continue
        // Grupos e JIDs não-numéricos nunca são conversa 1:1 de cliente.
        if (!/^\d{8,15}$/.test(m.phone)) continue
        if (INTERNAL_ORIGINS.has(m.origin ?? '') || m.intent === 'assessor') continue
        const existing = byPhone.get(m.phone)
        if (!existing) {
            byPhone.set(m.phone, {
                last: m,
                inbound_pending: m.direction === 'inbound' ? 1 : 0,
                channel: (m.channel === 'cloud' || m.channel === 'baileys') ? m.channel : null,
            })
            continue
        }
        // Já temos a "last" (mais recente). Contamos inbound posteriores ao
        // último outbound como pendentes.
        if (m.direction === 'inbound' && existing.last.direction === 'inbound') {
            existing.inbound_pending += 1
        }
        // Canal da conversa = o da mensagem mais recente que tem canal marcado
        // (mensagens antigas, pré-gateway, não têm a coluna preenchida).
        if (!existing.channel && (m.channel === 'cloud' || m.channel === 'baileys')) {
            existing.channel = m.channel
        }
    }

    const phones = [...byPhone.keys()]
    // O CRM casa por telefone OU celular. O banco guarda o número CANÔNICO
    // (só dígitos com DDI — backfill de 08/07), então bastam as variantes
    // NUMÉRICAS (com/sem 55, com/sem nono dígito). Em LOTES: uma única query
    // com centenas de conversas × variantes estourava a URL do PostgREST e a
    // lista ficava carregando pra sempre.
    const allVariants = [...new Set(
        phones.flatMap(p => phoneVariants(p).filter(v => /^\d+$/.test(v))),
    )]
    const LEAD_COLS = 'id, nome, telefone, celular, created_at, interesse_principal, handoff_humano, handoff_responsavel, optout_whatsapp, stage, status'
    const CHUNK = 200
    const chunks: string[][] = []
    for (let i = 0; i < allVariants.length; i += CHUNK) chunks.push(allVariants.slice(i, i + CHUNK))
    const results = await Promise.all(chunks.flatMap(chunk => [
        supabase.from('crm_leads').select(LEAD_COLS).in('telefone', chunk),
        supabase.from('crm_leads').select(LEAD_COLS).in('celular', chunk),
    ]))
    const seen = new Set<string>()
    const leads = results.flatMap(r => r.data ?? []).filter(l => {
        if (seen.has(l.id)) return false
        seen.add(l.id)
        return true
    })

    // Indexa o lead por todas as variantes do número dele (lead mais antigo
    // vence — é o original quando há duplicata).
    const leadByPhone = new Map<string, NonNullable<typeof leads>[number]>()
    const sorted = [...(leads ?? [])].sort((a, b) =>
        +new Date(b.created_at ?? 0) - +new Date(a.created_at ?? 0))
    for (const l of sorted) {
        for (const raw of [l.telefone, l.celular]) {
            if (!raw) continue
            for (const v of phoneVariants(raw)) leadByPhone.set(v, l)
        }
    }

    let rows: ConversationRow[] = phones.map((phone) => {
        const entry = byPhone.get(phone)!
        const lead = leadByPhone.get(phone)
        return {
            phone,
            name: entry.last.name ?? null,
            last_message: entry.last.body ?? null,
            last_direction: (entry.last.direction as 'inbound' | 'outbound' | null) ?? null,
            last_at: entry.last.created_at,
            inbound_pending: entry.inbound_pending,
            channel: entry.channel,
            lead_id: lead?.id ?? null,
            lead_nome: lead?.nome ?? null,
            interesse_principal: lead?.interesse_principal ?? null,
            handoff_humano: !!lead?.handoff_humano,
            handoff_responsavel: lead?.handoff_responsavel ?? null,
            optout_whatsapp: !!lead?.optout_whatsapp,
            stage: lead?.stage ?? null,
            status: lead?.status ?? null,
        }
    })

    if (filter === 'aguardando') rows = rows.filter(r => r.inbound_pending > 0 && !r.handoff_humano && !r.optout_whatsapp)
    else if (filter === 'handoff') rows = rows.filter(r => r.handoff_humano)
    else if (filter === 'optout') rows = rows.filter(r => r.optout_whatsapp)
    else if (filter === 'interesse') rows = rows.filter(r => !!r.interesse_principal)

    if (interesseFilter) rows = rows.filter(r => r.interesse_principal === interesseFilter)
    if (channelFilter === 'cloud' || channelFilter === 'baileys') {
        rows = rows.filter(r => r.channel === channelFilter)
    }

    if (q) {
        rows = rows.filter(r =>
            (r.name?.toLowerCase().includes(q) ?? false) ||
            (r.lead_nome?.toLowerCase().includes(q) ?? false) ||
            r.phone.includes(q)
        )
    }

    rows.sort((a, b) => +new Date(b.last_at) - +new Date(a.last_at))

    // Devolve TODAS as conversas: o teto de 1000 em "Todos" escondia as mais
    // antigas em silêncio (18/07: base passou de 1.6k conversas e "sumiu gente").
    return NextResponse.json({ conversations: rows, total: rows.length })
}
