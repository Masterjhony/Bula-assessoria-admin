/**
 * Lances / vendas do pregão ao vivo — grupo "Lances Bula Assessoria" (Baileys).
 *
 * O grupo é um fluxo contínuo e informal de VÁRIOS leilões: lances soltos ("770",
 * "820"), conversa fiada e, no meio, as VENDAS confirmadas ("levou lote 35 por
 * 900", "lote 349, comprador Luis Antonio"). Aqui uma IA extrai só as vendas e
 * grava em `bula_leilao_vendas` (1 linha por lote arrematado), resolvendo o
 * leilão do dia por DATA no cronograma. Dedup por message_id.
 *
 * Fluxo: group-inbound → handleLanceGroupMessage. Barato por padrão: só chama a
 * IA em mensagens que passam por um pré-filtro de "cara de venda".
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { openRouterJSON, isOpenRouterConfigured } from './openrouter'

/** Pré-filtro: só vale a pena chamar a IA se a mensagem tem cara de venda.
 *  Evita gastar IA com lance solto ("770") ou papo. */
const SALE_HINT = /\b(levou|arrematou|arrematad[oa]|arremate|vendid[oa]|vendeu|fechad[oa]|fechou|comprador|comprou)\b|\blote\s*\d+/i

let groupsCache: { jids: Set<string>; at: number } | null = null

/** JIDs dos grupos de lances (site_settings.whatsapp_lances_groups), cache 5min. */
async function getLanceGroups(sb: SupabaseClient): Promise<Set<string>> {
    if (groupsCache && Date.now() - groupsCache.at < 5 * 60 * 1000) return groupsCache.jids
    const { data } = await sb.from('site_settings').select('value').eq('key', 'whatsapp_lances_groups').maybeSingle()
    const raw = (data?.value as { jids?: unknown })?.jids
    const jids = new Set<string>(Array.isArray(raw) ? raw.filter((j): j is string => typeof j === 'string') : [])
    groupsCache = { jids, at: Date.now() }
    return jids
}

type SaleExtract = {
    is_sale: boolean
    lote?: string | null
    valor?: number | null
    comprador?: string | null
    confidence?: number
}

async function extractSale(text: string, quoted?: string | null, signal?: AbortSignal): Promise<SaleExtract | null> {
    const sys = [
        'Você extrai VENDAS de um pregão de leilão de gado ao vivo (grupo de WhatsApp em pt-BR).',
        'Cada mensagem pode ser: (a) um lance solto — geralmente só um número (ex.: "770", "820 aqui") — que NÃO é venda;',
        '(b) conversa fiada, que NÃO é venda; ou (c) uma VENDA confirmada, quando um lote é ARREMATADO ("levou/arrematou/comprou o lote X por Y", "vendido lote X", "lote X, comprador NOME").',
        'Responda SOMENTE com JSON: {"is_sale":boolean,"lote":string|null,"valor":number|null,"comprador":string|null,"confidence":number}.',
        'Regras: is_sale=true apenas quando um lote foi efetivamente arrematado/vendido — nunca para lance solto nem papo.',
        'valor: número puro em reais (ex.: 900, 15000), null se não houver. lote: só o identificador (ex.: "35"). comprador: o nome se citado, senão null.',
        'confidence: 0 a 1. Use a mensagem citada como contexto quando existir.',
    ].join(' ')
    const user = `Mensagem: ${JSON.stringify(text)}${quoted ? `\nMensagem citada (contexto): ${JSON.stringify(quoted)}` : ''}`
    return openRouterJSON<SaleExtract>(
        [{ role: 'system', content: sys }, { role: 'user', content: user }],
        { logKind: 'lances', temperature: 0, maxTokens: 200, signal },
    )
}

/** Resolve o leilão do dia por DATA. 1 match → usa; 0 ou vários → null (revisar). */
async function resolveAuction(sb: SupabaseClient, dateISO: string): Promise<string | null> {
    const { data } = await sb.from('cronograma_leiloes').select('id').eq('data', dateISO).limit(2)
    return data?.length === 1 ? (data[0].id as string) : null
}

export type LanceArgs = {
    groupJid: string
    text: string
    quotedText?: string | null
    messageId?: string | null
    ts?: number | null // epoch (segundos) da mensagem; ausente = agora (tempo real)
}

/**
 * Processa uma mensagem do grupo de lances. Retorna um objeto de diagnóstico.
 * Nunca lança — degrada em silêncio (a automação de grupo não pode quebrar).
 */
export async function handleLanceGroupMessage(sb: SupabaseClient, args: LanceArgs): Promise<Record<string, unknown>> {
    const groups = await getLanceGroups(sb)
    if (!groups.has(args.groupJid)) return { skipped: 'nao_e_grupo_de_lances' }
    if (!SALE_HINT.test(args.text)) return { skipped: 'sem_indicio_de_venda' }
    if (!isOpenRouterConfigured()) return { skipped: 'ia_nao_configurada' }

    // Dedup por message_id (o history sync reenvia as mesmas mensagens).
    if (args.messageId) {
        const { data: dup } = await sb.from('bula_leilao_vendas').select('id').eq('message_id', args.messageId).limit(1)
        if (dup?.length) return { deduped: true }
    }

    let sale: SaleExtract | null = null
    try {
        sale = await extractSale(args.text, args.quotedText, AbortSignal.timeout(20000))
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) }
    }
    if (!sale || !sale.is_sale) return { is_sale: false }
    // Precisa de lote + (valor OU comprador) — senão é ruído/enriquecimento vazio.
    if (!sale.lote || (sale.valor == null && !sale.comprador)) return { is_sale: true, incompleto: true }

    const dateISO = new Date((args.ts ? args.ts * 1000 : Date.now())).toISOString().slice(0, 10)
    const cronogramaId = await resolveAuction(sb, dateISO)
    const status = cronogramaId && sale.valor != null ? 'auto' : 'revisar'

    const { error } = await sb.from('bula_leilao_vendas').insert({
        group_jid: args.groupJid,
        message_id: args.messageId || null,
        raw_text: args.text,
        quoted_text: args.quotedText || null,
        lote: String(sale.lote),
        valor: typeof sale.valor === 'number' ? sale.valor : null,
        comprador: sale.comprador || null,
        cronograma_id: cronogramaId,
        leilao_data: dateISO,
        confidence: typeof sale.confidence === 'number' ? sale.confidence : null,
        status,
        msg_ts: args.ts ? new Date(args.ts * 1000).toISOString() : null,
    })
    if (error) return { error: error.message }
    return { inserted: true, lote: sale.lote, valor: sale.valor ?? null, comprador: sale.comprador ?? null, status, cronograma_id: cronogramaId }
}
