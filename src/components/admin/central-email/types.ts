/**
 * Tipos compartilhados pelos componentes da Central de E-mail.
 */

export type DelayUnit = 'minutes' | 'hours' | 'days'

export interface EmailTemplate {
    id: string
    slug: string
    title: string
    category: string
    subject: string
    body_html: string
    body_text: string | null
    variables: string[]
    archived: boolean
    usage_count: number
    created_at: string
    updated_at: string
}

export interface EmailCampaignStep {
    id: string
    campaign_id: string
    step_order: number
    delay_value: number
    delay_unit: DelayUnit
    template_id: string | null
    subject: string | null
    body_html: string | null
    body_text: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export type CampaignStatus = 'rascunho' | 'enviando' | 'concluida' | 'cancelada' | 'erro'

export interface EmailCampaign {
    id: string
    name: string
    description: string | null
    segment: Record<string, unknown>
    template_id: string | null
    subject: string | null
    body_html: string | null
    body_text: string | null
    from_name: string | null
    reply_to: string | null
    status: CampaignStatus
    total_recipients: number
    sent_count: number
    failed_count: number
    optout_skip_count: number
    stop_on_optout: boolean
    stop_on_interest: boolean
    audience_tag: string | null
    started_at: string | null
    finished_at: string | null
    created_at: string
    updated_at: string
    // Aggregations adicionadas pelo GET de lista
    steps_count?: number
    stopped_count?: number
}

export interface EmailCampaignRecipient {
    id: string
    campaign_id: string
    lead_id: string | null
    email: string
    name: string | null
    status: 'pendente' | 'enviado' | 'falhou' | 'optout'
    error_msg: string | null
    sent_at: string | null
    current_step: number
    next_send_at: string | null
    stopped_at: string | null
    stopped_reason: string | null
    created_at: string
}

export const INTERESSE_OPTIONS = [
    { id: 'touros', label: 'Touros' },
    { id: 'matrizes', label: 'Matrizes' },
    { id: 'embrioes', label: 'Embriões' },
    { id: 'semen', label: 'Sêmen' },
    { id: 'leiloes', label: 'Leilões' },
    { id: 'compra_venda_genetica', label: 'Compra/venda de genética' },
    { id: 'interesse_amplo', label: 'Interesse amplo' },
] as const

export const CATEGORIES = [
    { id: 'welcome', label: 'Boas-vindas' },
    { id: 'newsletter', label: 'Newsletter' },
    { id: 'oportunidade', label: 'Oportunidade' },
    { id: 'leilao', label: 'Leilão' },
    { id: 'follow_up', label: 'Follow-up' },
    { id: 'reativacao', label: 'Reativação' },
    { id: 'aviso', label: 'Aviso' },
    { id: 'geral', label: 'Geral' },
] as const
