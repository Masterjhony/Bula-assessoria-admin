/**
 * Saudação correta pelo horário LOCAL do lead.
 *
 * Bug observado (22/07): o concierge mandou "Bom dia" às 21h. O modelo escolhe
 * o cumprimento sozinho e erra. Aqui a gente resolve nas duas pontas:
 *   1) injeta no prompt o período do dia + o cumprimento certo (o modelo passa
 *      a acertar na maioria dos casos);
 *   2) um guard determinístico corrige a resposta se o modelo escorregar —
 *      troca "bom dia/boa tarde/boa noite" fora de hora pelo correto.
 *
 * Fuso pelo UF (Brasil aboliu horário de verão em 2019, então offset é fixo):
 *   UTC−5: AC · UTC−4: AM, RR, RO, MT, MS · UTC−3: os demais (default).
 */

const UTC_MINUS_5 = new Set(['AC'])
const UTC_MINUS_4 = new Set(['AM', 'RR', 'RO', 'MT', 'MS'])

/** Offset em horas (negativo) do UF. Default −3 (Brasília / maioria do país). */
export function ufOffsetHours(uf: string | null | undefined): number {
    const u = String(uf || '').toUpperCase()
    if (UTC_MINUS_5.has(u)) return -5
    if (UTC_MINUS_4.has(u)) return -4
    return -3
}

export type Periodo = 'manha' | 'tarde' | 'noite'
export interface SaudacaoContext {
    hour: number
    periodo: Periodo
    saudacao: 'Bom dia' | 'Boa tarde' | 'Boa noite'
    uf: string | null
}

/** Hora de parede local (0–23) do lead, a partir de um instante UTC. */
export function localHour(uf: string | null | undefined, nowIso: string): number {
    const now = new Date(nowIso)
    if (Number.isNaN(now.getTime())) return 12
    const shifted = new Date(now.getTime() + ufOffsetHours(uf) * 3_600_000)
    return shifted.getUTCHours()
}

export function saudacaoContext(uf: string | null | undefined, nowIso: string): SaudacaoContext {
    const hour = localHour(uf, nowIso)
    // 5–11 manhã · 12–17 tarde · 18–4 noite (madrugada segue "boa noite", norma BR).
    const periodo: Periodo = hour >= 5 && hour < 12 ? 'manha' : hour >= 12 && hour < 18 ? 'tarde' : 'noite'
    const saudacao = periodo === 'manha' ? 'Bom dia' : periodo === 'tarde' ? 'Boa tarde' : 'Boa noite'
    return { hour, periodo, saudacao, uf: uf ? String(uf).toUpperCase() : null }
}

/** Bloco de prompt que informa o horário e o cumprimento certo. */
export function saudacaoPromptBlock(ctx: SaudacaoContext): string {
    return `SAUDAÇÃO PELO HORÁRIO: agora são cerca de ${ctx.hour}h no fuso do lead (${ctx.periodo}). Se for cumprimentar, use "${ctx.saudacao}" — NUNCA um cumprimento de outro período (ex.: "bom dia" quando é noite). Na dúvida, prefira algo neutro como "Olá", "Oi" ou "Opa". Não invente horário nem clima.`
}

const SAUD_RE = /\b(bom\s+dia|boa\s+tarde|boa\s+noite)\b/i

/**
 * Corrige um cumprimento errado no INÍCIO da resposta (só a 1ª linha, pra não
 * mexer em "boa noite" que seja despedida no corpo). Preserva a caixa do texto.
 */
export function corrigirSaudacao(reply: string, ctx: SaudacaoContext): string {
    if (!reply) return reply
    const nl = reply.indexOf('\n')
    const head = nl === -1 ? reply : reply.slice(0, nl)
    const m = head.match(SAUD_RE)
    if (!m) return reply
    const encontrado = m[1].toLowerCase().replace(/\s+/g, ' ')
    if (encontrado === ctx.saudacao.toLowerCase()) return reply
    const start = head.indexOf(m[0])
    const capitalizado = /^[A-ZÀ-Ý]/.test(m[0])
    const troca = capitalizado ? ctx.saudacao : ctx.saudacao.toLowerCase()
    return reply.slice(0, start) + troca + reply.slice(start + m[0].length)
}
