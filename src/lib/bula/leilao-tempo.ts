export const FALLBACK_EVENT_ARCHIVE_MINUTES = 20 * 60

export interface SaoPauloNow {
    date: string
    minutes: number
}

export function nowSaoPaulo(date = new Date()): SaoPauloNow {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        hourCycle: 'h23',
    }).formatToParts(date)
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
    return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        minutes: Number(get('hour')) * 60 + Number(get('minute')),
    }
}

export function parseHorarioMinutes(value: unknown): number | null {
    const raw = String(value ?? '').trim()
    const match = raw.match(/(\d{1,2})\s*(?::|h)\s*(\d{2})?/)
    if (!match) return null
    const hour = Number(match[1])
    const minute = Number(match[2] ?? '0')
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) {
        return null
    }
    return hour * 60 + minute
}

export function isLeilaoAtivo(dataValue: unknown, horarioValue: unknown, now = nowSaoPaulo()): boolean {
    const data = String(dataValue ?? '').slice(0, 10)
    if (!data) return true
    if (data < now.date) return false
    if (data > now.date) return true

    const minutes = parseHorarioMinutes(horarioValue)
    if (minutes === null) return now.minutes < FALLBACK_EVENT_ARCHIVE_MINUTES
    return minutes >= now.minutes
}

export function isLeilaoPassado(dataValue: unknown, horarioValue: unknown, now = nowSaoPaulo()): boolean {
    return !isLeilaoAtivo(dataValue, horarioValue, now)
}
