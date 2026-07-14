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
