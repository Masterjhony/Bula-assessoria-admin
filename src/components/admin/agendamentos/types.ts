export type AgendamentoStatus =
    | 'agendado'
    | 'confirmado'
    | 'concluido'
    | 'cancelado'
    | 'nao_compareceu'

export type AgendamentoSource = 'calendly' | 'google' | 'manual'

export interface Agendamento {
    id: string
    source: AgendamentoSource
    google_event_id: string | null
    calendly_event_uri: string | null
    summary: string
    description: string | null
    start_at: string
    end_at: string | null
    timezone: string | null
    location: string | null
    meeting_url: string | null
    invitee_name: string | null
    invitee_email: string | null
    invitee_phone: string | null
    status: AgendamentoStatus
    cancelled_at: string | null
    cancel_reason: string | null
    notes: string | null
    tags: string[]
    lead_id: string | null
    responsible_member_id: string | null
    linked_leilao_id: string | null
    linked_task_id: string | null
    last_synced_at: string | null
    created_at: string
    updated_at: string
}

export interface AgendamentosSettings {
    google_calendar_id: string
    calendly_event_url: string
    default_responsible_member_id: string | null
    auto_link_lead_by_email: boolean
    auto_link_lead_by_phone: boolean
    sync_window_past_days: number
    sync_window_future_days: number
}

export const STATUS_LABELS: Record<AgendamentoStatus, string> = {
    agendado: 'Agendado',
    confirmado: 'Confirmado',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
    nao_compareceu: 'Não compareceu',
}

export const STATUS_COLORS: Record<AgendamentoStatus, string> = {
    agendado: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    confirmado: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    concluido: 'bg-green-500/15 text-green-600 dark:text-green-400',
    cancelado: 'bg-red-500/15 text-red-600 dark:text-red-400',
    nao_compareceu: 'bg-gray-500/15 text-gray-600 dark:text-gray-400',
}

export const SOURCE_LABELS: Record<AgendamentoSource, string> = {
    calendly: 'Calendly',
    google: 'Google Calendar',
    manual: 'Manual',
}
