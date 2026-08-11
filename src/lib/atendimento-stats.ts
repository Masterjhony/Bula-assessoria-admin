/**
 * Fonte ÚNICA da métrica de atendimento (WhatsApp).
 *
 * Reescrito em 11/08/2026 depois de uma apuração que fechou o nosso registro
 * contra o faturamento da própria Meta: 1.837 disparos apurados aqui contra
 * 1.832 mensagens cobradas por ela no mesmo período (0,3% de diferença, que é
 * arredondamento de fuso na virada do dia). O que mudou:
 *
 *  1. SÓ API OFICIAL. Antes nenhuma função filtrava canal — bastava a tela não
 *     filtrar para o Baileys entrar junto e o mesmo lead aparecer duas vezes.
 *     Atendimento é canal único desde a decisão de 2026; Baileys é assessor e
 *     grupo de leiloeira, nunca métrica.
 *  2. DISPARO É POR JANELA, NÃO POR LISTA DE ORIGENS. Antes havia uma lista
 *     manual de origens "que não são disparo", que envelhecia a cada script novo
 *     e classificava errado (`crm-sheet-import` entrava como abordagem mesmo
 *     quando era resposta dentro da conversa). Agora vale a regra que a própria
 *     Meta usa para cobrar: é disparo se NÃO houve mensagem do lead nas 24h
 *     anteriores — que é exatamente quando ela exige template. Por isso a conta
 *     pode ser conferida contra a fatura.
 *  3. GRUPO NÃO CONTA. Conversa de grupo (`phone` termina em `@g.us`) é Baileys
 *     e vive na mesma tabela. Em 14/07/2026 o total saltou de ~1,3k para >10k
 *     porque 6k inbounds eram de 27 grupos. Nunca entram.
 *  4. UMA PESSOA = UM CONTATO. Telefone canonicalizado; quem levou três
 *     disparos é uma pessoa, não três.
 */

/** Janela em que uma inbound conta como "resposta" ao disparo. */
export const JANELA_RESPOSTA_MS = 72 * 3600_000

/** Janela de sessão da Meta: dentro dela a resposta é livre e grátis. */
export const JANELA_SESSAO_MS = 24 * 3600_000

/** Status de envio que significam "saiu de fato". `queued`/`held`/`blocked` não saíram. */
const STATUS_ENTREGUE = new Set(['sent', 'delivered', 'read'])

/**
 * Preço por MENSAGEM cobrado pela Meta no Brasil, derivado da nossa própria
 * fatura (custo ÷ volume no `pricing_analytics` da WABA), não de tabela.
 * A cobrança é por mensagem desde a mudança de modelo — não por conversa.
 */
export const META_PRECO_USD: Record<string, number> = {
    MARKETING: 0.0625,
    UTILITY: 0.0068,
    /** Resposta dentro da janela de 24h não é cobrada. */
    SERVICE: 0,
}

/** Mensagem de grupo (Baileys). Nunca conta em métrica de atendimento. */
export const isGrupo = (phone: unknown) => String(phone ?? '').includes('@g.us')

/**
 * Instante da mensagem em ms. Precisa aceitar tanto a string ISO que o Supabase
 * devolve quanto o objeto Date que o driver do Postgres devolve — `Date.parse`
 * num Date passa pelo toString() e PERDE os milissegundos, o que basta para
 * inverter a ordem de duas mensagens do mesmo segundo e classificar errado a
 * janela de sessão.
 */
const ms = (v: string | Date): number => (v instanceof Date ? v.getTime() : Date.parse(v))

/**
 * Até 01/08/2026 alguns scripts e o flow-engine gravavam sem preencher `channel`
 * mesmo enviando pela Cloud API. São 127 linhas, todas com `status='sent'` e
 * envio confirmado via graph.facebook.com. O corte de data impede que registro
 * novo sem canal (que seria Baileys) entre por essa porta.
 */
const CORTE_CANAL_LEGADO = Date.parse('2026-08-02T00:00:00Z')

/** A mensagem saiu pelo número oficial (Cloud API)? */
export function isApiOficial(m: Pick<AtendimentoMsg, 'channel' | 'status' | 'created_at'>): boolean {
    if (m.channel === 'cloud') return true
    if (m.channel != null) return false
    return m.status === 'sent' && ms(m.created_at) < CORTE_CANAL_LEGADO
}

/** Recorte oficial da métrica: só Cloud API, nunca grupo. */
export function somenteApiOficial<T extends AtendimentoMsg>(msgs: T[]): T[] {
    return msgs.filter(m => !isGrupo(m.phone) && isApiOficial(m))
}

/**
 * Chave canônica do telefone: sem DDI e sem o nono dígito. Une "5567998894887",
 * "67998894887" e "6798894887" no mesmo contato — sem isso o mesmo lead conta
 * como duas pessoas e a taxa de resposta sai errada.
 */
export function foneKey(phone: unknown): string {
    let d = String(phone ?? '').replace(/\D/g, '')
    if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
    if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3)
    return d
}

export interface AtendimentoMsg {
    phone: string
    direction: string
    status?: string | null
    origin?: string | null
    channel?: string | null
    created_at: string
}

/** Uma abordagem ativa: saiu de fato e não foi resposta em conversa aberta. */
export interface Disparo {
    key: string
    t: number
    origin: string
}

/**
 * Separa o que é abordagem do que é resposta nossa dentro de uma conversa em
 * curso. Recebe as mensagens JÁ no recorte oficial.
 */
export function classificaDisparos(msgs: AtendimentoMsg[]): {
    disparos: Disparo[]
    inboundPorFone: Map<string, number[]>
} {
    const inboundPorFone = new Map<string, number[]>()
    for (const m of msgs) {
        if (m.direction !== 'inbound') continue
        const k = foneKey(m.phone)
        if (!k) continue
        const arr = inboundPorFone.get(k)
        if (arr) arr.push(ms(m.created_at))
        else inboundPorFone.set(k, [ms(m.created_at)])
    }
    for (const arr of inboundPorFone.values()) arr.sort((a, b) => a - b)

    /** O lead escreveu nas 24h anteriores? Então a conversa estava aberta. */
    const sessaoAberta = (k: string, t: number) => {
        const arr = inboundPorFone.get(k)
        if (!arr) return false
        for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i] < t && t - arr[i] < JANELA_SESSAO_MS) return true
            if (arr[i] < t - JANELA_SESSAO_MS) break
        }
        return false
    }

    const disparos: Disparo[] = []
    for (const m of msgs) {
        if (m.direction !== 'outbound') continue
        if (!STATUS_ENTREGUE.has(String(m.status))) continue
        const k = foneKey(m.phone)
        const t = ms(m.created_at)
        if (!k || sessaoAberta(k, t)) continue
        disparos.push({ key: k, t, origin: m.origin || '(sem origem)' })
    }
    return { disparos, inboundPorFone }
}

export interface AtendimentoStats {
    /** Pessoas distintas que receberam ao menos um disparo (abordagem) nosso. */
    disparados: number
    /** Dessas, quantas escreveram de volta em até 72h do 1º disparo. */
    responderam: number
    /** responderam / disparados, em %. */
    pct: number
    /** Mensagens de abordagem enviadas (uma pessoa pode ter levado várias). */
    disparos: number
    /** Mensagens enviadas que saíram (sem grupo, só oficial). */
    enviadas: number
    /** Mensagens recebidas (sem grupo, só oficial). */
    recebidas: number
    /** Contatos distintos com quem houve qualquer troca. */
    contatos: number
}

/**
 * Calcula a taxa de resposta por PESSOA sobre um conjunto de mensagens já no
 * recorte desejado (período/campanha). Filtra canal e grupo internamente.
 */
export function atendimentoResposta(todas: AtendimentoMsg[]): AtendimentoStats {
    const msgs = somenteApiOficial(todas)
    const { disparos, inboundPorFone } = classificaDisparos(msgs)

    const contatos = new Set<string>()
    let enviadas = 0
    let recebidas = 0
    for (const m of msgs) {
        const k = foneKey(m.phone)
        if (k) contatos.add(k)
        if (m.direction === 'inbound') recebidas++
        else if (m.direction === 'outbound' && STATUS_ENTREGUE.has(String(m.status))) enviadas++
    }

    const primeiro = new Map<string, number>()
    for (const d of disparos) {
        const p = primeiro.get(d.key)
        if (p === undefined || d.t < p) primeiro.set(d.key, d.t)
    }

    let responderam = 0
    for (const [k, t] of primeiro) {
        const ins = inboundPorFone.get(k)
        if (ins && ins.some(x => x > t && x - t < JANELA_RESPOSTA_MS)) responderam++
    }

    const disparados = primeiro.size
    return {
        disparados,
        responderam,
        pct: disparados ? Number(((responderam / disparados) * 100).toFixed(1)) : 0,
        disparos: disparos.length,
        enviadas,
        recebidas,
        contatos: contatos.size,
    }
}

export interface OrigemResposta {
    origin: string
    enviados: number
    responderam: number
    pct: number
}

export interface AtendimentoGrowth extends AtendimentoStats {
    janela_dias: number
    /** Séries diárias (mais antigo → hoje), tamanho = min(janela, 90). */
    serie_contatados: number[]
    serie_responderam: number[]
    /** Taxa de resposta por origem (lista fria vs reengajamento vs evento…). */
    por_origem: OrigemResposta[]
    /** foneKey das pessoas que responderam — para cruzar com leads (funil). */
    respondentes_keys: string[]
}

/**
 * Versão rica para o Dashboard de Growth: além do total por pessoa, devolve a
 * série temporal (coorte por dia do 1º disparo), o recorte por origem e as
 * chaves dos respondentes (para o funil contatado→respondeu→MQL→cliente).
 */
export function atendimentoGrowth(todas: AtendimentoMsg[], dias: number, nowMs: number): AtendimentoGrowth {
    const msgs = somenteApiOficial(todas)
    const base = atendimentoResposta(msgs)
    const { disparos, inboundPorFone } = classificaDisparos(msgs)

    const respondeu = (k: string, t: number) => {
        const ins = inboundPorFone.get(k)
        return !!ins && ins.some(x => x > t && x - t < JANELA_RESPOSTA_MS)
    }

    // 1º disparo por pessoa (global) e por origem.
    const primeiro = new Map<string, number>()
    const porOrigemMap = new Map<string, Map<string, number>>()
    for (const d of disparos) {
        const p = primeiro.get(d.key)
        if (p === undefined || d.t < p) primeiro.set(d.key, d.t)
        let om = porOrigemMap.get(d.origin)
        if (!om) { om = new Map(); porOrigemMap.set(d.origin, om) }
        const pv = om.get(d.key)
        if (pv === undefined || d.t < pv) om.set(d.key, d.t)
    }

    // Série diária por coorte (dia do 1º disparo).
    const DAYS = Math.min(Math.max(dias, 1), 90)
    const hoje = new Date(nowMs); hoje.setHours(0, 0, 0, 0)
    const idxDoDia = (t: number) => {
        const d = new Date(t); d.setHours(0, 0, 0, 0)
        const diff = Math.round((hoje.getTime() - d.getTime()) / 86400_000)
        return diff >= 0 && diff < DAYS ? DAYS - 1 - diff : -1
    }
    const serie_contatados = new Array(DAYS).fill(0)
    const serie_responderam = new Array(DAYS).fill(0)
    const respondentes_keys: string[] = []
    for (const [k, t] of primeiro) {
        const i = idxDoDia(t)
        if (i >= 0) serie_contatados[i]++
        if (respondeu(k, t)) {
            respondentes_keys.push(k)
            if (i >= 0) serie_responderam[i]++
        }
    }

    const por_origem: OrigemResposta[] = [...porOrigemMap.entries()].map(([origin, fones]) => {
        let r = 0
        for (const [k, t] of fones) if (respondeu(k, t)) r++
        return { origin, enviados: fones.size, responderam: r, pct: fones.size ? Number(((r / fones.size) * 100).toFixed(1)) : 0 }
    }).sort((a, b) => b.enviados - a.enviados)

    return { ...base, janela_dias: dias, serie_contatados, serie_responderam, por_origem, respondentes_keys }
}
