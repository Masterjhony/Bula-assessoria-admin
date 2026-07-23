/**
 * Agendamento de retomada ("callback") do concierge.
 *
 * Quando o lead adia a conversa ("amanhã de manhã", "semana que vem", "depois
 * do dia 10"), a IA já emite `updates.retomada_combinada` (texto livre). Aqui a
 * gente transforma esse texto numa DATA concreta (`extra_data.followup_due_at`)
 * e escolhe o template de reabertura. O cron /api/cron/followup-callback varre
 * os vencidos e dispara pelo gateway — que sozinho manda texto livre se a janela
 * de 24h estiver aberta, ou o template se já fechou.
 *
 * Fuso: o negócio opera em Mato Grosso do Sul (America/Campo_Grande, UTC−4, sem
 * horário de verão). As horas do dia ("manhã"/"tarde"/"noite") são resolvidas
 * nesse fuso e convertidas para o instante UTC que vai gravado.
 */

// UTC−4 fixo (MS não tem horário de verão). Minutos.
const MS_OFFSET_MIN = -4 * 60

/** Desloca um Date para que os getters UTC leiam a hora de parede local (MS). */
function toLocalShifted(d: Date): Date {
    return new Date(d.getTime() + MS_OFFSET_MIN * 60_000)
}
/** Converte uma hora de parede local (ano/mês/dia/hora em MS) para o instante UTC real. */
function localWallToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
    const asIfUtc = Date.UTC(year, month, day, hour, minute, 0, 0)
    return new Date(asIfUtc - MS_OFFSET_MIN * 60_000)
}

function stripDiacritics(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const WEEKDAYS: Record<string, number> = {
    domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
}

/** Hora de parede (MS) sugerida por período do dia. */
function periodHour(t: string): number | null {
    if (/\bmeio[\s-]?dia\b/.test(t)) return 12
    if (/\bde\s+manha\b|\bpela\s+manha\b|\bmanha\b|\bcedo\b|\bamanhecer\b/.test(t)) return 9
    if (/\bfim\s+da\s+tarde\b|\bfinal\s+da\s+tarde\b/.test(t)) return 17
    if (/\bde\s+tarde\b|\ba\s+tarde\b|\bpela\s+tarde\b|\btarde\b/.test(t)) return 14
    if (/\bde\s+noite\b|\ba\s+noite\b|\bnoite\b|\bnoitinha\b/.test(t)) return 19
    return null
}

/**
 * Transforma o texto livre de retomada numa data-alvo (ISO UTC) ou null.
 *
 * Nunca retorna instante no passado: se o cálculo cair antes de `now` (ex.:
 * "hoje de manhã" prometido à noite), empurra um dia. Se o texto indicar
 * intenção de voltar mas não casar nenhum padrão, cai no default seguro
 * (próximo dia às 10h locais) — o lead prometeu voltar, então agendamos.
 */
export function parseRetomadaDueAt(raw: string, nowIso: string): string | null {
    const text = ` ${stripDiacritics(String(raw || '').toLowerCase())} `
    if (!text.trim()) return null

    const now = new Date(nowIso)
    if (Number.isNaN(now.getTime())) return null
    const local = toLocalShifted(now)
    const curY = local.getUTCFullYear()
    const curMon = local.getUTCMonth()
    const curDay = local.getUTCDate()
    const curDow = local.getUTCDay()
    const curHour = local.getUTCHours()

    // Hora do dia (período nomeado ou "às N" / "Nh" / "N horas").
    let hour = periodHour(text)
    if (hour == null) {
        const hm = text.match(/\b(?:as|às|as\s+|[àa]s\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:h|horas|hrs)\b/)
        if (hm) {
            const hh = Number(hm[1])
            if (hh >= 0 && hh <= 23) hour = hh
        }
    }
    const minute = 0

    // 1) Dia da semana nomeado ("segunda", "sexta que vem").
    for (const [name, dow] of Object.entries(WEEKDAYS)) {
        if (new RegExp(`\\b${name}(?:\\s*feira)?\\b`).test(text)) {
            let delta = (dow - curDow + 7) % 7
            if (delta === 0) delta = 7 // "na segunda" quando hoje é segunda = a próxima
            const due = localWallToUtc(curY, curMon, curDay + delta, hour ?? 10, minute)
            return clampFuture(due, now).toISOString()
        }
    }

    // 2) "em/daqui a N dias|semanas" e "depois de amanhã".
    const relDias = text.match(/\b(?:em|daqui\s+a|apos|depois\s+de)\s+(\d{1,3})\s+dias?\b/)
    const relSem = text.match(/\b(?:em|daqui\s+a)\s+(\d{1,2})\s+semanas?\b/)
    if (/\bdepois\s+de\s+amanha\b/.test(text)) {
        return clampFuture(localWallToUtc(curY, curMon, curDay + 2, hour ?? 10, minute), now).toISOString()
    }
    if (relSem) {
        return clampFuture(localWallToUtc(curY, curMon, curDay + 7 * Number(relSem[1]), hour ?? 10, minute), now).toISOString()
    }
    if (relDias) {
        return clampFuture(localWallToUtc(curY, curMon, curDay + Number(relDias[1]), hour ?? 10, minute), now).toISOString()
    }

    // 3) "semana que vem" / "próxima semana" → próxima segunda.
    if (/\bsemana\s+que\s+vem\b|\bproxima\s+semana\b|\bsemana\s+proxima\b|\bna\s+outra\s+semana\b/.test(text)) {
        const delta = ((1 - curDow + 7) % 7) || 7 // próxima segunda
        return clampFuture(localWallToUtc(curY, curMon, curDay + delta, hour ?? 10, minute), now).toISOString()
    }

    // 4) "mês que vem" / "próximo mês" → dia 1 do mês seguinte.
    if (/\bmes\s+que\s+vem\b|\bproximo\s+mes\b|\bmes\s+proximo\b/.test(text)) {
        return clampFuture(localWallToUtc(curY, curMon + 1, 1, hour ?? 10, minute), now).toISOString()
    }

    // 5) "(depois do) dia N" → dia N deste mês, ou do próximo se já passou.
    const diaN = text.match(/\bdia\s+(\d{1,2})\b/)
    if (diaN) {
        const d = Number(diaN[1])
        if (d >= 1 && d <= 31) {
            const passou = /\bdepois\s+d/.test(text) ? d < curDay : d < curDay
            const mon = passou ? curMon + 1 : curMon
            return clampFuture(localWallToUtc(curY, mon, d, hour ?? 10, minute), now).toISOString()
        }
    }

    // 6) "hoje" (à noite/mais tarde) → hoje na hora indicada; se já passou, +1 dia.
    if (/\bhoje\b|\bmais\s+tarde\b|\bdaqui\s+a\s+pouco\b/.test(text)) {
        const h = hour ?? Math.min(curHour + 3, 20)
        return clampFuture(localWallToUtc(curY, curMon, curDay, h, minute), now).toISOString()
    }

    // 7) "amanhã".
    if (/\bamanha\b|\bamnha\b|\bamanha\b/.test(text)) {
        return clampFuture(localWallToUtc(curY, curMon, curDay + 1, hour ?? 10, minute), now).toISOString()
    }

    // 8) Só uma hora do dia sem referência de dia ("de manhã") → próximo período.
    if (hour != null) {
        const dayShift = hour <= curHour ? 1 : 0
        return clampFuture(localWallToUtc(curY, curMon, curDay + dayShift, hour, minute), now).toISOString()
    }

    // Default seguro: prometeu voltar mas não deu pra fixar → amanhã 10h locais.
    return clampFuture(localWallToUtc(curY, curMon, curDay + 1, 10, minute), now).toISOString()
}

/** Empurra +1 dia enquanto a data estiver no passado (com margem de 2 min). */
function clampFuture(due: Date, now: Date): Date {
    let d = due
    let guard = 0
    while (d.getTime() <= now.getTime() + 2 * 60_000 && guard < 8) {
        d = new Date(d.getTime() + 24 * 3_600_000)
        guard++
    }
    return d
}

// ── Escolha do template de reabertura ────────────────────────────────────────

export interface FollowupPlan {
    templateName: string
    templateParams: string[]
    /** Texto livre para quando a janela de 24h ainda estiver aberta. */
    text: string
    botStep: string
}

const HABILITACAO_URL = 'https://bulaassessoria.com/habilitacao'

function firstName(nome: string | null | undefined): string {
    const n = String(nome || '').trim().split(/\s+/)[0]
    return n && n.length >= 2 ? n : 'tudo bem'
}

/**
 * Decide o molde do callback a partir do estado do lead:
 *  - já aceitou a assessoria e ainda faltam documentos → link self-service
 *    (`bula_habilitacao_link`), pra pessoa adiantar sozinha;
 *  - caso geral → retomada "como combinamos" (`bula_retomada_agendada`).
 * Ambos UTILITY, 1 variável (nome).
 */
export function pickFollowupPlan(lead: { nome?: string | null; extra_data?: Record<string, unknown> | null }): FollowupPlan {
    const nome = firstName(lead.nome)
    const xd = (lead.extra_data ?? {}) as Record<string, unknown>
    const aceitou = xd.aceitou_assessoria === true || !!xd.aceitou_assessoria_at
    const docsCompletos = xd.habilitacao && typeof xd.habilitacao === 'object'
        && (xd.habilitacao as Record<string, unknown>).completa === true
    const linkJaEnviado = !!xd.habilitacao_link_enviado_at

    if (aceitou && !docsCompletos && !linkJaEnviado) {
        return {
            templateName: 'bula_habilitacao_link',
            templateParams: [nome],
            text: `Oi, ${nome}! Como a gente combinou, pra adiantar sua habilitação dá pra preencher os dados e enviar os documentos direto no nosso site, no seu tempo: ${HABILITACAO_URL} — qualquer dúvida é só me chamar por aqui.`,
            botStep: 'followup_callback_habilitacao_link',
        }
    }
    return {
        templateName: 'bula_retomada_agendada',
        templateParams: [nome],
        text: `Oi, ${nome}! Como a gente combinou, tô voltando pra concluir seu cadastro na Bula e te deixar pronto pra dar lance nos leilões, com o nosso acompanhamento sem custo. Podemos seguir de onde paramos?`,
        botStep: 'followup_callback_retomada',
    }
}
