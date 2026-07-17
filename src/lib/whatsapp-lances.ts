/**
 * Lances / vendas do pregão ao vivo — grupo "Lances Bula Assessoria" (Baileys).
 *
 * O grupo é um fluxo contínuo e informal de VÁRIOS leilões: lances soltos ("770"),
 * conversa fiada e, no meio, as VENDAS da cobertura Bula em formato semi-padrão:
 *
 *   Levamos lt 33 - 800,00 - 1F          ← lote, PARCELA, qtd+sexo
 *   Foi com Douglas Bispo da Bula ...    ← assessor (pisteiro)
 *   Fazenda água limpa                   ← fazenda
 *   Nelore da vez                        ← comprador
 *   sidrolandia MS                       ← cidade/UF
 *
 * Um PARSER DETERMINÍSTICO (sem IA) extrai esses campos e faz MERGE por
 * (data do pregão, lote): fichas parciais ("Levamos 410 - 1300" e depois a ficha
 * com comprador) se completam na mesma linha de bula_leilao_vendas. IA
 * (OpenRouter) fica só como fallback para mensagens com cara de venda que o
 * parser não entendeu. Depois de gravar, o fechamento do leilão do dia é
 * reconstruído automaticamente (ver lances-fechamento.ts).
 *
 * Data do pregão: os leilões rodam à noite (BRT) e o relógio vira em UTC no meio
 * do pregão — msg de 01:08 UTC é 22:08 BRT do dia anterior. Além do fuso (-3h),
 * madrugada até ~03h BRT ainda é o pregão do dia anterior (-6h de carência).
 *
 * Fluxo: group-inbound → handleLanceGroupMessage. Nunca lança — degrada em
 * silêncio (a automação de grupo não pode quebrar).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { openRouterJSON, isOpenRouterConfigured } from './openrouter'
import { rebuildFechamentoFromLances } from './lances-fechamento'

/** Pré-filtro barato p/ fallback de IA: mensagem com cara de venda. */
const SALE_HINT = /\b(levou|levamos|arrematou|arrematad[oa]|arremate|vendid[oa]|vendeu|comprador|comprou)\b|\blote\s*\d+/i

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

// ── Parser determinístico ───────────────────────────────────────────────

export type ParsedLance = {
    lotes: string[]
    parcela: number | null
    animais: number | null
    sexo: string | null
    assessor: string | null
    comprador: string | null
    fazenda: string | null
    cidade: string | null
    uf: string | null
    fonte: 'parser' | 'ia'
}

const UF_SIGLAS = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO'
// Nome completo → sigla (mais longos primeiro: "mato grosso do sul" antes de "mato grosso").
const UF_NOMES: [RegExp, string][] = [
    [/rio grande do sul/i, 'RS'], [/rio grande do norte/i, 'RN'], [/mato grosso do sul/i, 'MS'],
    [/mato grosso/i, 'MT'], [/minas gerais/i, 'MG'], [/rio de janeiro/i, 'RJ'], [/santa catarina/i, 'SC'],
    [/s[ãa]o paulo/i, 'SP'], [/esp[íi]rito santo/i, 'ES'], [/distrito federal/i, 'DF'],
    [/maranh[ãa]o/i, 'MA'], [/tocantins/i, 'TO'], [/rond[ôo]nia/i, 'RO'], [/roraima/i, 'RR'],
    [/amazonas/i, 'AM'], [/amap[áa]/i, 'AP'], [/pernambuco/i, 'PE'], [/para[íi]ba/i, 'PB'],
    [/paran[áa]/i, 'PR'], [/par[áa]/i, 'PA'], [/alagoas/i, 'AL'], [/sergipe/i, 'SE'],
    [/bahia/i, 'BA'], [/cear[áa]/i, 'CE'], [/goi[áa]s/i, 'GO'], [/piau[íi]/i, 'PI'], [/acre/i, 'AC'],
]

/** "1.100,00" → 1100 · "920,99" → 920.99 · "1300" → 1300. null se implausível. */
function parseValor(raw: string): number | null {
    const s = raw.trim()
    let n: number
    if (s.includes(',')) n = parseFloat(s.replace(/\./g, '').replace(',', '.'))
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = parseFloat(s.replace(/\./g, ''))
    else n = parseFloat(s)
    return Number.isFinite(n) && n >= 50 && n <= 10_000_000 ? Math.round(n * 100) / 100 : null
}

/** Extrai cidade/UF de uma linha ("Montes Altos - MA", "OURILÂNDIA DO NORTE/PA",
 *  "Cotegipe - bahia", "Sena madureira estado do Acre"). null se a linha não tem UF. */
function parseCidadeUf(line: string): { cidade: string; uf: string } | null {
    const sigla = line.match(new RegExp(`[\\s,/–-]+(${UF_SIGLAS})\\.?\\s*$`, 'i'))
    if (sigla) {
        const cidade = line.slice(0, sigla.index).replace(/[\s,/–-]+$/, '').trim()
        return { cidade, uf: sigla[1].toUpperCase() }
    }
    for (const [re, uf] of UF_NOMES) {
        const m = line.match(re)
        if (m && m.index !== undefined) {
            const cidade = line.slice(0, m.index).replace(/\b(estado d[oea]|do|da|de)\s*$/i, '').replace(/[\s,/–-]+$/, '').trim()
            if (cidade) return { cidade, uf }
        }
    }
    return null
}

const LOTE_LINE = /\b(?:lotes?|lts?|its?)\s*\.?\s*n?[º°]?\s*([A-Z]?\d+(?:\s*(?:[e,+|]|\se\s)\s*[A-Z]?\d+)*)/i
const LEVAMOS_HEADER = /^\s*lev(?:amos|ou)\s+(?:o\s+)?(?:lotes?\s*|lts?\s*|its?\s*)?\.?\s*([A-Z]?\d+(?:\s*(?:[e,+|]|\se\s)\s*[A-Z]?\d+)*)/i
const ASSESSOR_LINE = /(?:foi com|^com)\s+(?:[ao]\s+)?(.+?)\s+d[ae]\s*bula/i
// "Assessorado pela Nane e pelo Felipinho Capucci," — nem sempre fecha com "da Bula".
const ASSESSOR_PELA = /^assessorad[oa]s?\s+pel[ao]s?\s+(.+?)(?:\s*d[ae]\s*bula.*)?[,.]?\s*$/i
const ASSESSOR_BARE = /^\s*([A-ZÀ-Ú][^\n,]*?)\s+d[ae]\s+[Bb]ula(?:\s+[Aa]ssessoria)?\s*[,.]?\s*$/
const QTD_SEXO = /\b(\d{1,2})\s*([FM])\b/

/**
 * Parser determinístico de uma mensagem do grupo. Retorna null quando a
 * mensagem não é uma venda (lance solto, consulta, papo, lista de catálogo).
 * Regra: precisa de lote + (verbo "levamos/levou" OU "comprador do" OU assessor da Bula).
 */
export function parseLanceMessage(text: string): ParsedLance | null {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return null
    // Lista de catálogo ("Lote 478\nLote 491 - A+\n…") não é venda.
    if (lines.filter((l) => LOTE_LINE.test(l)).length > 2) return null

    const out: ParsedLance = {
        lotes: [], parcela: null, animais: null, sexo: null,
        assessor: null, comprador: null, fazenda: null, cidade: null, uf: null, fonte: 'parser',
    }
    let hasLevamos = false
    let hasCompradorDo = false
    const rest: string[] = []

    // O endereço (cidade/UF) é a ÚLTIMA linha com cara de UF — marcas como
    // "NELORE GRÃO PARÁ" também batem no nome de estado e viram comprador.
    const cidadeIdx = lines.reduce((acc, l, i) => (parseCidadeUf(l) ? i : acc), -1)

    for (let li = 0; li < lines.length; li++) {
        const line = lines[li]
        // ── linha de lote (header "Levamos lt 33 - 800,00 - 1F" ou "Lote 36") ──
        const header = line.match(LEVAMOS_HEADER)
        const loteM = header || line.match(LOTE_LINE)
        if (loteM && !out.lotes.length) {
            if (header || /^\s*lotes?\b|^\s*lts?\b/i.test(line) || /comprador/i.test(line)) {
                if (header) hasLevamos = true
                if (/comprador\s+d[oe]/i.test(line)) hasCompradorDo = true
                out.lotes = loteM[1].split(/[e,+|]|\se\s/i).map((s) => s.trim()).filter(Boolean)
                // valor e qtd/sexo no restante da linha ("- 800,00 - 1F parida")
                const tail = line.slice((loteM.index ?? 0) + loteM[0].length)
                const valorM = tail.match(/[-–]\s*([\d][\d.,]*)/)
                if (valorM && out.parcela == null) out.parcela = parseValor(valorM[1])
                const qs = tail.match(QTD_SEXO) || line.match(QTD_SEXO)
                if (qs) { out.animais = parseInt(qs[1], 10); out.sexo = qs[2].toUpperCase() }
                continue
            }
        }
        if (/^\s*lev(amos|ou)\s*$/i.test(line) || /^quase/i.test(line)) continue
        if (/comprador\s+d[oe]/i.test(line)) { hasCompradorDo = true; continue }

        // ── assessor ("Foi com Douglas Bispo da Bula Assessoria" / "Assessorado pela Nane…" / "Peralta da Bula") ──
        if (/^foi com\s+[ao]?\s*bula\b/i.test(line)) continue // "Foi com a Bula Assessoria" sem nome
        const am = line.match(ASSESSOR_LINE) || line.match(ASSESSOR_PELA) || line.match(ASSESSOR_BARE)
        if (am) {
            if (!out.assessor) out.assessor = am[1].replace(/^[EÉeé]\s+/, '').replace(/\s+e\s+pel[ao]s?\s+/gi, ' e ').replace(/[,.]\s*$/, '').trim()
            continue
        }
        if (/^direcionamento|lan[çc]ando/i.test(line)) continue

        // ── qtd/sexo isolado ("1F") ──
        const qsOnly = line.match(/^(\d{1,2})\s*([FM])\b/)
        if (qsOnly && out.animais == null) { out.animais = parseInt(qsOnly[1], 10); out.sexo = qsOnly[2].toUpperCase(); continue }

        // ── valor isolado ("950" / "1.100,00") ──
        if (/^[\d.,]+$/.test(line)) { if (out.parcela == null) out.parcela = parseValor(line); continue }

        // ── cidade/UF (só a última linha com cara de UF) ──
        if (li === cidadeIdx) {
            const cu = parseCidadeUf(line)
            if (cu) { out.cidade = cu.cidade || null; out.uf = cu.uf; continue }
        }

        // ── fazenda ──
        if (/^faz(enda|\.|\b)/i.test(line) && !out.fazenda) { out.fazenda = line.replace(/[,;]\s*$/, ''); continue }

        rest.push(line.replace(/^[EÉeé]\s+/, '').replace(/[,;]\s*$/, ''))
    }

    if (!out.lotes.length) return null
    if (!hasLevamos && !hasCompradorDo && !out.assessor) return null
    // "Lote 3 - 750" solto (sem verbo/assessor/comprador) já foi barrado acima.
    out.comprador = rest.length ? rest.slice(0, 3).join(' - ') : null
    return out
}

// ── Data do pregão + resolução do leilão ────────────────────────────────

/** Fuso BRT (-3h) + carência de madrugada (-6h): msg até ~03h BRT conta como pregão do dia anterior. */
const PREGAO_SHIFT_MS = (3 + 6) * 3600 * 1000

export function pregaoDateISO(tsSec?: number | null): string {
    const ms = tsSec ? tsSec * 1000 : Date.now()
    return new Date(ms - PREGAO_SHIFT_MS).toISOString().slice(0, 10)
}

/** Resolve o leilão do pregão por DATA. 1 match → usa; 0 ou vários → null (revisar). */
async function resolveAuction(sb: SupabaseClient, dateISO: string): Promise<string | null> {
    const { data } = await sb.from('cronograma_leiloes').select('id').eq('data', dateISO).limit(2)
    return data?.length === 1 ? (data[0].id as string) : null
}

// ── Persistência (merge por data do pregão + lote) ──────────────────────

/** Grava/mescla 1 lote em bula_leilao_vendas. Campos novos não-nulos sobrescrevem
 *  (corrige valor); nulos nunca apagam o que já foi capturado. */
async function upsertVenda(
    sb: SupabaseClient,
    lote: string,
    p: ParsedLance,
    ctx: { groupJid: string; messageId: string | null; text: string; quotedText: string | null; dateISO: string; cronogramaId: string | null; msgTsISO: string | null },
): Promise<'inserted' | 'merged' | 'error'> {
    const { data: ex } = await sb.from('bula_leilao_vendas')
        .select('id, valor, comprador, assessor, fazenda, cidade, uf, animais, sexo, raw_text')
        .eq('leilao_data', ctx.dateISO).eq('lote', lote).limit(1)
    const fields = {
        valor: p.parcela, comprador: p.comprador, assessor: p.assessor, fazenda: p.fazenda,
        cidade: p.cidade, uf: p.uf, animais: p.animais, sexo: p.sexo,
    }
    if (ex?.length) {
        const cur = ex[0] as Record<string, unknown>
        const patch: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(fields)) if (v != null) patch[k] = v
        const valor = (patch.valor ?? cur.valor) as number | null
        patch.status = valor != null && ctx.cronogramaId ? 'auto' : 'revisar'
        patch.cronograma_id = ctx.cronogramaId
        patch.message_id = ctx.messageId
        const prevRaw = (cur.raw_text as string | null) || ''
        if (!prevRaw.includes(ctx.text)) patch.raw_text = prevRaw ? `${prevRaw}\n─────\n${ctx.text}` : ctx.text
        const { error } = await sb.from('bula_leilao_vendas').update(patch).eq('id', cur.id as string)
        return error ? 'error' : 'merged'
    }
    const { error } = await sb.from('bula_leilao_vendas').insert({
        group_jid: ctx.groupJid,
        message_id: ctx.messageId,
        raw_text: ctx.text,
        quoted_text: ctx.quotedText,
        lote,
        ...fields,
        cronograma_id: ctx.cronogramaId,
        leilao_data: ctx.dateISO,
        confidence: p.fonte === 'parser' ? 1 : null,
        fonte: p.fonte,
        status: p.parcela != null && ctx.cronogramaId ? 'auto' : 'revisar',
        msg_ts: ctx.msgTsISO,
    })
    return error ? 'error' : 'inserted'
}

// ── Fallback de IA (mensagens com cara de venda que o parser não entendeu) ──

type SaleExtract = { is_sale: boolean; lote?: string | null; valor?: number | null; comprador?: string | null; confidence?: number }

async function extractSaleIA(text: string, quoted?: string | null, signal?: AbortSignal): Promise<SaleExtract | null> {
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

// ── Entrada principal ───────────────────────────────────────────────────

export type LanceArgs = {
    groupJid: string
    text: string
    quotedText?: string | null
    messageId?: string | null
    ts?: number | null // epoch (segundos) da mensagem; ausente = agora (tempo real)
    aiFallback?: boolean // default true; reprocessos em lote podem desligar
    skipGroupCheck?: boolean // reprocessos já filtraram o grupo
}

/**
 * Processa uma mensagem do grupo de lances. Retorna um objeto de diagnóstico.
 * Nunca lança — degrada em silêncio (a automação de grupo não pode quebrar).
 */
export async function handleLanceGroupMessage(sb: SupabaseClient, args: LanceArgs): Promise<Record<string, unknown>> {
    if (!args.skipGroupCheck) {
        const groups = await getLanceGroups(sb)
        if (!groups.has(args.groupJid)) return { skipped: 'nao_e_grupo_de_lances' }
    }

    let parsed = parseLanceMessage(args.text)
    if (!parsed && (args.aiFallback ?? true) && SALE_HINT.test(args.text) && isOpenRouterConfigured()) {
        try {
            const sale = await extractSaleIA(args.text, args.quotedText, AbortSignal.timeout(20000))
            if (sale?.is_sale && sale.lote && (sale.valor != null || sale.comprador)) {
                parsed = {
                    lotes: [String(sale.lote)], parcela: typeof sale.valor === 'number' ? sale.valor : null,
                    animais: null, sexo: null, assessor: null, comprador: sale.comprador || null,
                    fazenda: null, cidade: null, uf: null, fonte: 'ia',
                }
            }
        } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) }
        }
    }
    if (!parsed) return { is_sale: false }

    const dateISO = pregaoDateISO(args.ts)
    const cronogramaId = await resolveAuction(sb, dateISO)
    const ctx = {
        groupJid: args.groupJid,
        messageId: args.messageId || null,
        text: args.text,
        quotedText: args.quotedText || null,
        dateISO,
        cronogramaId,
        msgTsISO: args.ts ? new Date(args.ts * 1000).toISOString() : new Date().toISOString(),
    }
    const results: Record<string, string> = {}
    for (const lote of parsed.lotes) results[lote] = await upsertVenda(sb, lote, parsed, ctx)

    let fechamento: Record<string, unknown> | null = null
    if (cronogramaId) {
        try {
            fechamento = await rebuildFechamentoFromLances(sb, cronogramaId)
        } catch (e) {
            fechamento = { error: e instanceof Error ? e.message : String(e) }
        }
    }
    return { is_sale: true, fonte: parsed.fonte, leilao_data: dateISO, cronograma_id: cronogramaId, lotes: results, fechamento }
}
