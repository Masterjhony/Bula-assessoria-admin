/**
 * Settings de um fluxo da Central WhatsApp.
 *
 * O grafo (FlowGraphV2) controla *o que* o bot decide. Os settings controlam
 * *quando/como* o engine aplica essas decisões — rate limit, horário permitido,
 * fuso, fallback. Cada chave é interpretada pelo engine. Setting ausente cai
 * no default do helper `withDefaults()`.
 *
 * Status de cobertura no engine (atualizado quando wired-up):
 *   ATIVOS hoje:
 *     - handoff_blocks_automation (gate lead.handoff_humano nos ramos do grafo)
 *     - optout_blocks_automation  (gate lead.optout_whatsapp + tabela)
 *     - fallback_template         (welcome-default fallback em render-welcome)
 *     - welcome_dedup_hours       (whatsapp.ts:dispatchWelcome — 24h hardcoded
 *                                  ainda; mudar pra ler daqui é trivial)
 *     - allowed_hours_*           (NOVO — implementado em isWithinAllowedHours
 *                                  e consumido por /inbound e /render-welcome)
 *
 *   PENDENTES (UI existe, engine ignora ainda):
 *     - max_auto_replies_per_lead_per_day
 *     - min_interval_minutes_between_replies
 *     - resend_menu_after_days
 *     - send_menu_if_interest_already_set
 *     - handoff_auto_expire_hours
 *
 * Adicione um setting novo: 1) declare no FlowSettings, 2) coloque default em
 * FLOW_SETTINGS_DEFAULTS, 3) leia no engine onde fizer sentido, 4) atualize o
 * tooltip "Status" na UI pra refletir que virou ATIVO.
 */

export interface FlowSettings {
    /** Welcome dedup por número (horas). Padrão: 24h. */
    welcome_dedup_hours?: number

    /** Envia welcome quando classifier devolve 'unknown'. */
    send_welcome_on_unknown?: boolean

    /** Tag aplicada ao lead após enviar o menu/welcome. */
    menu_sent_tag?: string

    /** Slug do template usado como fallback final (`welcome-default`). */
    fallback_template?: string

    /** Máximo de respostas automáticas por lead/dia. 0 = ilimitado. */
    max_auto_replies_per_lead_per_day?: number

    /** Intervalo mínimo entre 2 respostas automáticas para o mesmo lead (min). */
    min_interval_minutes_between_replies?: number

    /** Horário permitido p/ automação. Fora dele, inbound responde silent. */
    allowed_hours_enabled?: boolean
    /** Formato 24h: "HH:MM" — ex: "08:00". */
    allowed_hours_start?: string
    /** Formato 24h: "HH:MM" — ex: "20:00". */
    allowed_hours_end?: string

    /** Fuso horário IANA. Aplicado ao cálculo de allowed_hours. */
    timezone?: string

    /** Dias até reenviar o menu pra leads que já receberam. 0 = nunca. */
    resend_menu_after_days?: number

    /** Lead com interesse já setado recebe menu novamente? */
    send_menu_if_interest_already_set?: boolean

    /** Lead em handoff humano recebe automação? */
    handoff_blocks_automation?: boolean

    /** Opt-out bloqueia toda automação? (compliance — default true). */
    optout_blocks_automation?: boolean

    /** Horas até expirar handoff automaticamente. 0 = nunca. */
    handoff_auto_expire_hours?: number
}

export const FLOW_SETTINGS_DEFAULTS: Required<FlowSettings> = {
    welcome_dedup_hours: 24,
    send_welcome_on_unknown: true,
    menu_sent_tag: 'whatsapp:menu_enviado',
    fallback_template: 'welcome-default',
    max_auto_replies_per_lead_per_day: 0,
    min_interval_minutes_between_replies: 0,
    allowed_hours_enabled: false,
    allowed_hours_start: '08:00',
    allowed_hours_end: '20:00',
    timezone: 'America/Sao_Paulo',
    resend_menu_after_days: 0,
    send_menu_if_interest_already_set: false,
    handoff_blocks_automation: true,
    optout_blocks_automation: true,
    handoff_auto_expire_hours: 0,
}

/** Aplica defaults sobre um settings carregado. Nunca devolve undefined. */
export function withDefaults(settings: FlowSettings | null | undefined): Required<FlowSettings> {
    return { ...FLOW_SETTINGS_DEFAULTS, ...(settings ?? {}) }
}

/**
 * Checa se `at` (default = agora) está dentro da janela permitida `[start, end]`
 * no fuso `timezone`. Suporta janela cruzando meia-noite (start > end).
 * Se `allowed_hours_enabled` for false, retorna true sempre.
 */
export function isWithinAllowedHours(
    settings: FlowSettings | null | undefined,
    at: Date = new Date(),
): boolean {
    const s = withDefaults(settings)
    if (!s.allowed_hours_enabled) return true

    const [sh, sm] = s.allowed_hours_start.split(':').map(n => parseInt(n, 10))
    const [eh, em] = s.allowed_hours_end.split(':').map(n => parseInt(n, 10))
    if (!Number.isFinite(sh) || !Number.isFinite(eh)) return true

    // Resolve hora atual no fuso configurado.
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: s.timezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
    }).formatToParts(at)
    const hh = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
    const mm = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)

    const nowMin = hh * 60 + mm
    const startMin = sh * 60 + (sm || 0)
    const endMin = eh * 60 + (em || 0)

    if (startMin === endMin) return true       // janela "00:00–00:00" = ignora
    if (startMin < endMin) {
        return nowMin >= startMin && nowMin < endMin
    }
    // janela cruza meia-noite (ex: 22:00–06:00)
    return nowMin >= startMin || nowMin < endMin
}
