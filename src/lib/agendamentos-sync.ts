/**
 * Sincronização Calendly ↔ Google Calendar ↔ tabela `agendamentos`.
 *
 * O Calendly Free não dá API token nem webhook. A ponte é o Google Calendar:
 * o Calendly cria eventos lá; nós lemos via Google Calendar API e
 * materializamos em `agendamentos`. Idempotência por `google_event_id`.
 *
 * Parseia também o invitee dos campos do evento (Calendly preenche
 * description com nome/e-mail/telefone do convidado em padrão previsível).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { listCalendarEvents, type GCalEvent } from './google-calendar'
import { normalizePhone, phoneVariants } from './whatsapp-central'

export interface AgendamentosCalendarSettings {
    google_calendar_id: string
    calendly_event_url: string
    default_responsible_member_id: string | null
    auto_link_lead_by_email: boolean
    auto_link_lead_by_phone: boolean
    sync_window_past_days: number
    sync_window_future_days: number
}

export const DEFAULT_AGENDAMENTOS_SETTINGS: AgendamentosCalendarSettings = {
    google_calendar_id: '',
    calendly_event_url: 'https://calendly.com/joaoeduardo-lp1/contato-cliente',
    default_responsible_member_id: null,
    auto_link_lead_by_email: true,
    auto_link_lead_by_phone: true,
    sync_window_past_days: 7,
    sync_window_future_days: 90,
}

export async function loadAgendamentosSettings(
    supabase: SupabaseClient,
): Promise<AgendamentosCalendarSettings> {
    const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'agendamentos_calendar')
        .maybeSingle()
    const value = (data?.value ?? {}) as Partial<AgendamentosCalendarSettings>
    return { ...DEFAULT_AGENDAMENTOS_SETTINGS, ...value }
}

// ─── Parsing do invitee a partir do evento Google ────────────────────────────

interface ParsedInvitee {
    name: string | null
    email: string | null
    phone: string | null   // dígitos com DDI (55…)
    isCalendly: boolean
    calendlyEventUri: string | null
    meetingUrl: string | null
}

const CALENDLY_DESC_MARKERS = [
    'calendly.com',
    'Event Type:',
    'Tipo de evento:',
    'Invitee:',
    'Convidado:',
]

/** Extrai e-mail "limpo" de uma string (primeiro match). */
function pickEmail(s: string | null | undefined): string | null {
    if (!s) return null
    const m = s.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
    return m ? m[0].toLowerCase() : null
}

/** Heurística pra extrair telefone do texto livre da descrição do Calendly. */
function pickPhone(s: string | null | undefined): string | null {
    if (!s) return null
    // Linha com "Phone call:" ou "Telefone:" é o sinal mais forte.
    const labeled = s.match(/(?:Phone call|Phone number|Phone|Telefone|Celular|WhatsApp)\s*[:\-]\s*([+\d][\d\s().\-]{7,})/i)
    if (labeled) {
        const norm = normalizePhone(labeled[1])
        if (norm) return norm
    }
    // Fallback: qualquer sequência de 10-13 dígitos (com símbolos) na descrição.
    const generic = s.match(/(\+?5{0,2}\s*\(?\d{2,3}\)?[\s.\-]?\d{4,5}[\s.\-]?\d{4})/)
    if (generic) {
        const norm = normalizePhone(generic[1])
        if (norm) return norm
    }
    return null
}

/** URL do evento no Calendly (extraída do bloco "Need to make a change?" ou similar). */
function pickCalendlyEventUri(s: string | null | undefined): string | null {
    if (!s) return null
    const m = s.match(/https?:\/\/calendly\.com\/[^\s<>"']+/i)
    return m ? m[0] : null
}

/** Link de videoconferência (Meet/Zoom) — primeiro vem do hangoutLink, senão da description. */
function pickMeetingUrl(event: GCalEvent): string | null {
    if (event.hangoutLink) return event.hangoutLink
    const desc = event.description || ''
    const m = desc.match(/https?:\/\/(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com)\/[^\s<>"']+/i)
    return m ? m[0] : null
}

function parseInvitee(event: GCalEvent): ParsedInvitee {
    const desc = event.description || ''
    const summary = event.summary || ''

    const isCalendly =
        CALENDLY_DESC_MARKERS.some(marker => desc.toLowerCase().includes(marker.toLowerCase())) ||
        /calendly/i.test(event.htmlLink || '')

    // Atendees: o invitee é o attendee que NÃO é o organizer/self
    const attendees = event.attendees || []
    const invitee = attendees.find(a => !a.organizer && !a.self) || null
    let email = invitee?.email?.toLowerCase() || null
    let name = invitee?.displayName?.trim() || null

    // Fallback: extrai e-mail/nome do summary (Calendly usa "Tipo - Nome")
    if (!email) email = pickEmail(desc)
    if (!name) {
        const sep = summary.split(/\s+-\s+/)
        if (sep.length >= 2) {
            name = sep.slice(1).join(' - ').trim()
        }
    }

    // Telefone só vem na description (não há campo dedicado no Google Calendar)
    const phone = pickPhone(desc)

    return {
        name,
        email,
        phone,
        isCalendly,
        calendlyEventUri: pickCalendlyEventUri(desc),
        meetingUrl: pickMeetingUrl(event),
    }
}

// ─── Lead matching ───────────────────────────────────────────────────────────

async function findLeadByEmail(
    supabase: SupabaseClient,
    email: string,
): Promise<string | null> {
    const { data } = await supabase
        .from('crm_leads')
        .select('id')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    return data?.id ?? null
}

async function findLeadByPhone(
    supabase: SupabaseClient,
    phone: string,
): Promise<string | null> {
    const variants = phoneVariants(phone)
    if (variants.length === 0) return null
    // Procura em telefone OU celular
    const { data } = await supabase
        .from('crm_leads')
        .select('id')
        .or(
            variants
                .flatMap(v => [`telefone.eq.${v}`, `celular.eq.${v}`])
                .join(','),
        )
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    return data?.id ?? null
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export interface SyncResult {
    fetched: number
    inserted: number
    updated: number
    cancelled: number
    skipped: number
    errors: string[]
}

interface SyncOptions {
    /** Quando informado, sobrescreve a janela vinda do settings. */
    pastDays?: number
    futureDays?: number
    /** Só puxa o que mudou desde esse ISO (delta sync). */
    updatedMin?: string
}

export async function syncAgendamentos(
    supabase: SupabaseClient,
    options: SyncOptions = {},
): Promise<SyncResult> {
    const result: SyncResult = {
        fetched: 0, inserted: 0, updated: 0, cancelled: 0, skipped: 0, errors: [],
    }

    const settings = await loadAgendamentosSettings(supabase)
    if (!settings.google_calendar_id) {
        result.errors.push('google_calendar_id não configurado em site_settings.agendamentos_calendar')
        return result
    }

    const pastDays = options.pastDays ?? settings.sync_window_past_days
    const futureDays = options.futureDays ?? settings.sync_window_future_days
    const now = Date.now()
    const timeMin = new Date(now - pastDays * 86400_000).toISOString()
    const timeMax = new Date(now + futureDays * 86400_000).toISOString()

    let events: GCalEvent[]
    try {
        events = await listCalendarEvents({
            calendarId: settings.google_calendar_id,
            timeMin,
            timeMax,
            updatedMin: options.updatedMin,
        })
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        result.errors.push(`listCalendarEvents falhou: ${msg}`)
        return result
    }

    result.fetched = events.length
    const nowIso = new Date().toISOString()

    for (const ev of events) {
        if (!ev.id) {
            result.skipped++
            continue
        }
        // Evento sem horário inicial (all-day) tem `start.date`. Aceitamos ambos.
        const startIso = ev.start?.dateTime || (ev.start?.date ? `${ev.start.date}T00:00:00Z` : null)
        const endIso = ev.end?.dateTime || (ev.end?.date ? `${ev.end.date}T00:00:00Z` : null)
        if (!startIso) {
            result.skipped++
            continue
        }

        const invitee = parseInvitee(ev)

        // Detecta cancelamento (Google marca como `status: 'cancelled'`)
        const isCancelled = ev.status === 'cancelled'

        // Lead matching
        let leadId: string | null = null
        if (invitee.email && settings.auto_link_lead_by_email) {
            leadId = await findLeadByEmail(supabase, invitee.email)
        }
        if (!leadId && invitee.phone && settings.auto_link_lead_by_phone) {
            leadId = await findLeadByPhone(supabase, invitee.phone)
        }

        // Existe?
        const { data: existing } = await supabase
            .from('agendamentos')
            .select('id, status, lead_id, notes, tags, responsible_member_id')
            .eq('google_event_id', ev.id)
            .maybeSingle()

        const summary = (ev.summary || invitee.name || 'Agendamento').slice(0, 280)

        // Status: cancelado tem prioridade; se já estava `concluido`/`nao_compareceu` preserva
        let nextStatus: 'agendado' | 'cancelado' | 'concluido' | 'nao_compareceu' | 'confirmado' = 'agendado'
        if (isCancelled) {
            nextStatus = 'cancelado'
        } else if (existing && (existing.status === 'concluido' || existing.status === 'nao_compareceu' || existing.status === 'confirmado')) {
            nextStatus = existing.status as typeof nextStatus
        }

        // Payload pro upsert. Manter lead_id que o operador já vinculou
        // manualmente — só sobrescrevemos se ainda for null.
        const preservedLeadId = existing?.lead_id ?? leadId
        const preservedResp = existing?.responsible_member_id ?? settings.default_responsible_member_id

        const row = {
            source: invitee.isCalendly ? 'calendly' : 'google',
            google_event_id: ev.id,
            google_calendar_id: settings.google_calendar_id,
            calendly_event_uri: invitee.calendlyEventUri,
            summary,
            description: ev.description ?? null,
            start_at: startIso,
            end_at: endIso,
            timezone: ev.start?.timeZone ?? 'America/Sao_Paulo',
            location: ev.location ?? null,
            meeting_url: invitee.meetingUrl,
            invitee_name: invitee.name,
            invitee_email: invitee.email,
            invitee_phone: invitee.phone,
            status: nextStatus,
            cancelled_at: isCancelled ? (existing && existing.status === 'cancelado' ? undefined : nowIso) : null,
            lead_id: preservedLeadId,
            responsible_member_id: preservedResp,
            raw_payload: ev as unknown as Record<string, unknown>,
            last_synced_at: nowIso,
        }

        if (existing) {
            const { error } = await supabase
                .from('agendamentos')
                .update(row)
                .eq('id', existing.id)
            if (error) {
                result.errors.push(`update ${ev.id}: ${error.message}`)
            } else {
                if (isCancelled && existing.status !== 'cancelado') result.cancelled++
                else result.updated++
            }
        } else {
            // Skip eventos cancelados que NUNCA estiveram aqui — não vale guardar lixo
            if (isCancelled) {
                result.skipped++
                continue
            }
            const { error } = await supabase
                .from('agendamentos')
                .insert(row)
            if (error) {
                result.errors.push(`insert ${ev.id}: ${error.message}`)
            } else {
                result.inserted++
            }
        }
    }

    return result
}
