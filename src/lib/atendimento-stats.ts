/**
 * Fonte ÚNICA da métrica de atendimento (WhatsApp).
 *
 * Regras que valem em toda tela (aba Métricas, Dashboard de Growth, scripts):
 *  1. GRUPO NÃO CONTA. Conversas de grupos internos/leiloeiras são Baileys e vivem
 *     na mesma tabela (`phone` termina em `@g.us`). Incluí-las inflava tudo — em
 *     14/07/2026 o total saltou de ~1,3k p/ >10k porque 6k inbounds eram de 27
 *     grupos. Nunca entram.
 *  2. UMA PESSOA = UM CONTATO. O telefone é canonicalizado (sem DDI, sem 9º dígito)
 *     e cada pessoa conta UMA vez, mesmo que tenha levado vários disparos. Somar por
 *     origem contava o mesmo lead 2x.
 *  3. DISPARO ≠ RESPOSTA DO BOT. Origens que são resposta nossa numa conversa em
 *     curso (concierge, SDR, catch-up) não são "abordagem" — só abordagens contam
 *     como disparo. Uma inbound conta como resposta se vier em até 72h do 1º disparo.
 */

/** Janela em que uma inbound conta como "resposta" ao disparo. */
export const JANELA_RESPOSTA_MS = 72 * 3600_000

/** Origens que são resposta NOSSA numa conversa em curso, não abordagem. */
export const ORIGENS_NAO_DISPARO = new Set([
    'central-inbound', 'central-bot', 'concierge-catchup', 'inbox-sdr',
    'crm-assessor', 'manual-admin', 'teste-manual', 'cadastro-leiloeira',
])

/** Status de envio que valem como "chegou/enfileirou" (não falha/bloqueio). */
const STATUS_ENVIADO = new Set(['sent', 'delivered', 'read', 'queued'])

/** Mensagem de grupo (Baileys). Nunca conta em métrica de atendimento. */
export const isGrupo = (phone: unknown) => String(phone ?? '').includes('@g.us')

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

export interface AtendimentoStats {
    /** Pessoas distintas que receberam ao menos um disparo (abordagem) nosso. */
    disparados: number
    /** Dessas, quantas escreveram de volta em até 72h do 1º disparo. */
    responderam: number
    /** responderam / disparados, em %. */
    pct: number
    /** Mensagens enviadas (sem grupo). */
    enviadas: number
    /** Mensagens recebidas (sem grupo). */
    recebidas: number
    /** Contatos distintos com quem houve qualquer troca (in ou out), sem grupo. */
    contatos: number
}

/**
 * Calcula a taxa de resposta por PESSOA sobre um conjunto de mensagens já no
 * recorte desejado (período/canal/campanha). Ignora grupos internamente.
 */
export function atendimentoResposta(msgs: AtendimentoMsg[]): AtendimentoStats {
    const inboundPorFone = new Map<string, number[]>()
    const contatos = new Set<string>()
    let enviadas = 0
    let recebidas = 0

    for (const m of msgs) {
        if (isGrupo(m.phone)) continue
        const k = foneKey(m.phone)
        if (k) contatos.add(k)
        if (m.direction === 'inbound') {
            recebidas++
            if (!k) continue
            const arr = inboundPorFone.get(k)
            if (arr) arr.push(new Date(m.created_at).getTime())
            else inboundPorFone.set(k, [new Date(m.created_at).getTime()])
        } else if (m.direction === 'outbound') {
            enviadas++
        }
    }

    // origin → fone → instante do PRIMEIRO disparo (a resposta tem que vir depois).
    const primeiroDisparo = new Map<string, number>()
    for (const m of msgs) {
        if (isGrupo(m.phone) || m.direction !== 'outbound' || !m.origin) continue
        if (ORIGENS_NAO_DISPARO.has(m.origin)) continue
        if (!STATUS_ENVIADO.has(String(m.status))) continue
        const k = foneKey(m.phone)
        if (!k) continue
        const t = new Date(m.created_at).getTime()
        const prev = primeiroDisparo.get(k)
        if (prev === undefined || t < prev) primeiroDisparo.set(k, t)
    }

    let responderam = 0
    for (const [k, t] of primeiroDisparo) {
        const ins = inboundPorFone.get(k)
        if (ins && ins.some(x => x > t && x - t < JANELA_RESPOSTA_MS)) responderam++
    }

    const disparados = primeiroDisparo.size
    return {
        disparados,
        responderam,
        pct: disparados ? Number(((responderam / disparados) * 100).toFixed(1)) : 0,
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
    /** Taxa de resposta por disparo (lista fria vs reengajamento vs evento…). */
    por_origem: OrigemResposta[]
    /** foneKey das pessoas que responderam — para cruzar com leads (funil). */
    respondentes_keys: string[]
}

/**
 * Versão rica para o Dashboard de Growth: além do total por pessoa, devolve a
 * série temporal (coorte por dia do 1º disparo), o recorte por origem e as
 * chaves dos respondentes (para o funil contatado→respondeu→MQL→cliente).
 */
export function atendimentoGrowth(msgs: AtendimentoMsg[], dias: number, nowMs: number): AtendimentoGrowth {
    const base = atendimentoResposta(msgs)

    const inboundPorFone = new Map<string, number[]>()
    for (const m of msgs) {
        if (isGrupo(m.phone) || m.direction !== 'inbound') continue
        const k = foneKey(m.phone)
        if (!k) continue
        const arr = inboundPorFone.get(k)
        if (arr) arr.push(new Date(m.created_at).getTime())
        else inboundPorFone.set(k, [new Date(m.created_at).getTime()])
    }
    const respondeu = (k: string, t: number) => {
        const ins = inboundPorFone.get(k)
        return !!ins && ins.some(x => x > t && x - t < JANELA_RESPOSTA_MS)
    }

    // 1º disparo por pessoa (global) + por origem.
    const primeiroDisparo = new Map<string, number>()
    const porOrigemMap = new Map<string, Map<string, number>>()
    for (const m of msgs) {
        if (isGrupo(m.phone) || m.direction !== 'outbound' || !m.origin) continue
        if (ORIGENS_NAO_DISPARO.has(m.origin)) continue
        if (!STATUS_ENVIADO.has(String(m.status))) continue
        const k = foneKey(m.phone)
        if (!k) continue
        const t = new Date(m.created_at).getTime()
        const prev = primeiroDisparo.get(k)
        if (prev === undefined || t < prev) primeiroDisparo.set(k, t)
        let om = porOrigemMap.get(m.origin)
        if (!om) { om = new Map(); porOrigemMap.set(m.origin, om) }
        const pv = om.get(k)
        if (pv === undefined || t < pv) om.set(k, t)
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
    for (const [k, t] of primeiroDisparo) {
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
