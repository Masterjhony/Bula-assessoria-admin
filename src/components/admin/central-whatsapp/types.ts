/** Tipos compartilhados pela Central WhatsApp (UI) */

export type WAStatus = 'disconnected' | 'connecting' | 'connected' | 'qr'

export interface InboxConversation {
    phone: string
    name: string | null
    last_message: string | null
    last_direction: 'inbound' | 'outbound' | null
    last_at: string
    inbound_pending: number
    /** Último canal usado: 'cloud' (API oficial, cliente) | 'baileys' (nº próprio). */
    channel: 'cloud' | 'baileys' | null
    lead_id: string | null
    lead_nome: string | null
    interesse_principal: string | null
    handoff_humano: boolean
    handoff_responsavel: string | null
    optout_whatsapp: boolean
    stage: string | null
    status: string | null
}

export interface ThreadMessage {
    id: string
    phone: string
    name: string | null
    body: string | null
    direction: 'inbound' | 'outbound'
    status: string
    origin: string | null
    bot_step: string | null
    campaign_id: string | null
    template_id: string | null
    created_at: string
    // Mídia recebida (inbound). media_url já vem como signed URL pronta para uso.
    media_url: string | null
    media_type: 'audio' | 'image' | 'video' | 'document' | null
    media_mime: string | null
    media_filename: string | null
    media_meta_id: string | null
    media_ingest_error: string | null
}

export interface ThreadLead {
    id: string
    nome: string
    telefone: string | null
    email: string | null
    status: string | null
    stage: string | null
    prioridade: string | null
    interesse: string | null
    interesse_principal: string | null
    tags_whatsapp: string[] | null
    handoff_humano: boolean
    handoff_responsavel: string | null
    handoff_at: string | null
    optout_whatsapp: boolean
    last_whatsapp_at: string | null
    contact_count: number | null
    notes: string | null
    responsavel: string | null
    source: string | null
    medium: string | null
    campaign: string | null
}

export interface Template {
    id: string
    slug: string
    title: string
    category: string
    body: string
    variables: string[] | null
    archived: boolean
    usage_count: number
    updated_at: string
    // Mídia opcional anexada ao template (foto/vídeo/áudio/documento)
    media_url: string | null            // key do R2 (ex.: libmedia/123_foto.jpg)
    media_type: 'image' | 'video' | 'audio' | 'document' | null
    media_mime: string | null
    media_filename: string | null
    media_caption: string | null
    // Enquete nativa do WhatsApp (opcional)
    poll_question: string | null
    poll_options: string[]              // sempre array, default []
    poll_selectable_count: number       // default 1
    // Ciclo de aprovação na Meta (Cloud API). LOCAL = nunca submetido.
    meta_template_id: string | null
    meta_status: 'LOCAL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED'
    meta_category: string | null
    meta_language: string | null
    meta_rejected_reason: string | null
    meta_synced_at: string | null
}

export type MetaTemplateStatus = Template['meta_status']

export interface Campaign {
    id: string
    name: string
    description: string | null
    segment: Record<string, unknown>
    template_id: string | null
    body: string | null
    status: 'rascunho' | 'enviando' | 'concluida' | 'cancelada' | 'erro'
    total_recipients: number
    sent_count: number
    failed_count: number
    optout_skip_count: number
    started_at: string | null
    finished_at: string | null
    created_at: string
    updated_at: string
    // Mídia opcional anexada à campanha (sobrescreve a do template, se houver)
    media_url: string | null
    media_type: 'image' | 'video' | 'audio' | 'document' | null
    media_mime: string | null
    media_filename: string | null
    media_caption: string | null
    // Sequência (multi-step) — regras de parada e reação à resposta
    stop_on_reply: boolean
    stop_on_optout: boolean
    stop_on_handoff: boolean
    stop_on_interest: boolean
    reply_tag: string | null
    reply_handoff: boolean
    // Preenchido pela API quando lista campanhas (não vive na tabela campanhas)
    steps_count?: number
    replied_count?: number
    stopped_count?: number
}

export type CampaignDelayUnit = 'minutes' | 'hours' | 'days'

export interface CampaignStep {
    id: string
    campaign_id: string
    step_order: number               // 1, 2, 3, ... (passo 0 é a própria campanha)
    delay_value: number
    delay_unit: CampaignDelayUnit
    template_id: string | null
    body: string | null
    media_url: string | null
    media_type: 'image' | 'video' | 'audio' | 'document' | null
    media_mime: string | null
    media_filename: string | null
    media_caption: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface CentralMetrics {
    novos_contatos_7d: number
    leads_com_interesse: number
    aguardando_humano: number
    opt_outs: number
    mensagens_enviadas_hoje: number
    mensagens_recebidas_hoje: number
    campanhas_disparadas_30d: number
    leads_aguardando_resposta: number
    // Custos: WhatsApp é ESTIMATIVA (conversas iniciadas × tarifa); IA é real (log).
    wa_conversas_empresa_30d: number
    gasto_whatsapp_estimado_30d: number
    gasto_ia_30d: number
    gasto_ia_hoje: number
    wa_tarifa_usd: number
    distribuicao_interesse: Record<string, number>
}

export const INTERESSE_LABELS: Record<string, string> = {
    touros: 'Touros',
    matrizes: 'Matrizes',
    embrioes: 'Embriões',
    central_embrioes: 'Central de embriões',
    semen: 'Sêmen',
    leiloes: 'Leilões',
    venda_genetica: 'Venda de genética',
    compra_venda_genetica: 'Compra/venda de genética',
    oferta_genetica: 'Quero ofertar genética',
    oportunidades: 'Receber oportunidades',
    interesse_amplo: 'Todos os segmentos',
    atendimento_humano: 'Atendimento humano',
    consultor: 'Consultor',
    outro: 'Outro',
}

/**
 * Grupos canônicos para filtro em CAMPANHAS — unificam IDs sinônimos/legacy.
 *
 * Por que: o `interesse_principal` no banco tem variantes históricas
 * (`venda_genetica` vs `compra_venda_genetica` vs `oferta_genetica`) que
 * conceitualmente são o mesmo público. Para o operador escolhendo segmento,
 * mostrar 13 opções (com 3 que se sobrepõem) gera ruído e segmentos
 * incompletos. Cada grupo aqui aceita 1+ IDs e o filtro do segmento usa
 * `interesse_principal IN (...)` quando há mais de um.
 *
 * `INTERESSE_LABELS` continua sendo a fonte de exibição na Inbox/Métricas
 * (lá precisa do label exato do ID salvo no lead).
 */
export const INTERESSE_GROUPS: Array<{ label: string; ids: string[] }> = [
    { label: 'Sêmen',                       ids: ['semen'] },
    { label: 'Embriões',                    ids: ['embrioes'] },
    { label: 'Central de embriões',         ids: ['central_embrioes'] },
    { label: 'Leilões / Assessoria',        ids: ['leiloes'] },
    { label: 'Compra/venda de genética',    ids: ['compra_venda_genetica', 'venda_genetica', 'oferta_genetica'] },
    { label: 'Receber oportunidades',       ids: ['oportunidades'] },
    { label: 'Todos os segmentos',          ids: ['interesse_amplo'] },
    { label: 'Atendimento humano',          ids: ['atendimento_humano', 'consultor'] },
    { label: 'Touros (legacy)',             ids: ['touros'] },
    { label: 'Matrizes (legacy)',           ids: ['matrizes'] },
    { label: 'Outro',                       ids: ['outro'] },
]
