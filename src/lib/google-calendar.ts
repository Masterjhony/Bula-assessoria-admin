/**
 * Cliente Google Calendar — leitura de eventos via service account.
 *
 * Usa o MESMO GOOGLE_SERVICE_ACCOUNT_JSON que já alimenta GA4 e Sheets. Pra
 * essa service account conseguir LER um calendário do usuário:
 *
 *   1. Pegue o e-mail da service account (campo `client_email` no JSON).
 *   2. No Google Calendar, abra "Configurações do calendário" → "Compartilhar
 *      com pessoas específicas".
 *   3. Adicione esse e-mail com permissão "Ver detalhes de todos os eventos".
 *   4. Em site_settings.agendamentos_calendar.google_calendar_id, ponha o ID
 *      do calendário (é o e-mail do dono pro calendário "primary", ou o ID
 *      gerado pra calendários secundários).
 *
 * Escopos: usamos `calendar.readonly` — apenas leitura, sem risco de mexer
 * em eventos.
 */

import { google, type calendar_v3 } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

/** Retorna um client autenticado, ou null se as credenciais não estiverem setadas. */
function getCalendarClient(): calendar_v3.Calendar | null {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    if (!raw) {
        console.warn('[google-calendar] GOOGLE_SERVICE_ACCOUNT_JSON ausente.')
        return null
    }
    let creds: { client_email: string; private_key: string }
    try {
        creds = JSON.parse(raw)
    } catch (e) {
        console.error('[google-calendar] GOOGLE_SERVICE_ACCOUNT_JSON inválido:', e)
        return null
    }

    const auth = new google.auth.JWT({
        email: creds.client_email,
        // O Vercel guarda o JSON com `\n` escapado dentro de uma string — restauramos.
        key: creds.private_key.replace(/\\n/g, '\n'),
        scopes: SCOPES,
    })
    return google.calendar({ version: 'v3', auth })
}

export interface ListEventsParams {
    calendarId: string
    timeMin: string  // ISO
    timeMax: string  // ISO
    updatedMin?: string  // ISO; pull só o que mudou desde então
    pageToken?: string
}

export interface GCalEvent {
    id: string
    status?: string | null
    summary?: string | null
    description?: string | null
    location?: string | null
    htmlLink?: string | null
    hangoutLink?: string | null
    start?: { dateTime?: string | null; date?: string | null; timeZone?: string | null } | null
    end?: { dateTime?: string | null; date?: string | null; timeZone?: string | null } | null
    attendees?: Array<{ email?: string | null; displayName?: string | null; responseStatus?: string | null; organizer?: boolean | null; self?: boolean | null }> | null
    creator?: { email?: string | null; displayName?: string | null } | null
    organizer?: { email?: string | null; displayName?: string | null } | null
    updated?: string | null
    created?: string | null
    extendedProperties?: { private?: Record<string, string>; shared?: Record<string, string> } | null
}

/** Itera todas as páginas e devolve a lista completa. */
export async function listCalendarEvents(params: ListEventsParams): Promise<GCalEvent[]> {
    const cal = getCalendarClient()
    if (!cal) return []

    const events: GCalEvent[] = []
    let pageToken: string | undefined = params.pageToken
    do {
        const resp = await cal.events.list({
            calendarId: params.calendarId,
            timeMin: params.timeMin,
            timeMax: params.timeMax,
            updatedMin: params.updatedMin,
            singleEvents: true,        // expande recorrências
            showDeleted: true,         // pra capturar cancelamentos
            maxResults: 2500,
            orderBy: 'updated',        // updated em combinação com showDeleted exige isto
            pageToken,
        })
        const items = (resp.data.items || []) as GCalEvent[]
        events.push(...items)
        pageToken = resp.data.nextPageToken || undefined
    } while (pageToken)

    return events
}

/** Lê um único evento (útil pra refresh manual). */
export async function getCalendarEvent(calendarId: string, eventId: string): Promise<GCalEvent | null> {
    const cal = getCalendarClient()
    if (!cal) return null
    try {
        const resp = await cal.events.get({ calendarId, eventId })
        return (resp.data || null) as GCalEvent | null
    } catch (e) {
        console.error('[google-calendar] getCalendarEvent:', e)
        return null
    }
}

/** Indica se as credenciais existem (pro health check da UI). */
export function isGoogleCalendarConfigured(): boolean {
    return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON
}
