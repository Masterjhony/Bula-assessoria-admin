/**
 * Mensagem automática de boas-vindas do CRM (1ª mensagem ao lead novo).
 *
 * Regra de negócio (desenho aprovado): o operador conecta um número no cockpit
 * (Baileys, aba WhatsApp do CRM) e, para TODO lead novo que cai, o sistema
 * dispara automaticamente esta mensagem PELO contato conectado. O texto é
 * editável no próprio cockpit — fonte única de verdade em
 * `site_settings.crm_whatsapp_welcome`.
 *
 * Caminho de envio: passa pelo gateway (`sendOutbound`) com canal forçado
 * Baileys e `botStep='welcome'`, então herda opt-out, log unificado em
 * `whatsapp_messages` e o contador diário. O dedup de 24h vive aqui (o gateway
 * não deduplica intents 1:1) — o mesmo número nunca recebe dois welcomes em
 * janela curta, mesmo que entre por dois pontos de criação ao mesmo tempo.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { firstName, normalizePhone, phoneVariants, renderTemplate } from './whatsapp-central'
import { sendOutbound } from './whatsapp-gateway'

export const WELCOME_KEY = 'crm_whatsapp_welcome'

/** Janela de dedup: não reenviar welcome ao mesmo número nesse intervalo. */
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000 // 24h

export interface CrmWelcomeConfig {
    /** Liga/desliga o disparo automático. */
    enabled: boolean
    /** Corpo da mensagem. `{nome}` vira o primeiro nome do lead. */
    message: string
}

// Texto padrão (voz da Bula Assessoria). `{nome}` é interpolado com o primeiro
// nome do lead via renderTemplate.
export const DEFAULT_WELCOME_MESSAGE = `Olá, {nome}! Tudo bem?

Aqui é da Bula Assessoria. Vi que você demonstrou interesse em genética, assessoria ou oportunidades na pecuária, então queria entender melhor o seu momento para ver onde conseguimos ser mais úteis.

Hoje você já trabalha com gado P.O. ou está buscando entrar/melhorar nessa área?

Pra eu te direcionar melhor, você está mais interessado em:

1️⃣ Compra ou venda de animais
2️⃣ Gado P.O. / genética Nelore
3️⃣ Sêmen, embriões ou acasalamentos
4️⃣ Assessoria para leilões
5️⃣ Melhorar resultado do seu rebanho
6️⃣ Ainda está só avaliando possibilidades

Pode me responder com o número ou me contar rapidamente seu cenário.`

export const DEFAULT_WELCOME_CONFIG: CrmWelcomeConfig = {
    enabled: true,
    message: DEFAULT_WELCOME_MESSAGE,
}

function mergeConfig(raw: Partial<CrmWelcomeConfig> | null | undefined): CrmWelcomeConfig {
    const r = raw ?? {}
    const message = typeof r.message === 'string' && r.message.trim().length > 0
        ? r.message
        : DEFAULT_WELCOME_CONFIG.message
    return {
        enabled: r.enabled ?? DEFAULT_WELCOME_CONFIG.enabled,
        message,
    }
}

export async function loadCrmWelcome(supabase: SupabaseClient): Promise<CrmWelcomeConfig> {
    const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', WELCOME_KEY)
        .maybeSingle()
    return mergeConfig(data?.value as Partial<CrmWelcomeConfig> | undefined)
}

export async function saveCrmWelcome(
    supabase: SupabaseClient,
    config: Partial<CrmWelcomeConfig>,
): Promise<CrmWelcomeConfig> {
    const merged = mergeConfig(config)
    const { error } = await supabase
        .from('site_settings')
        .upsert(
            { key: WELCOME_KEY, value: merged, updated_at: new Date().toISOString() },
            { onConflict: 'key' },
        )
    if (error) throw new Error(`Error saving welcome config: ${error.message}`)
    return merged
}

/** Já mandamos um welcome a este número nas últimas 24h? (dedup) */
async function hasRecentWelcome(supabase: SupabaseClient, phone: string): Promise<boolean> {
    const variants = phoneVariants(phone)
    if (variants.length === 0) return false
    const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
    const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .in('phone', variants)
        .eq('direction', 'outbound')
        .eq('bot_step', 'welcome')
        .in('status', ['sent', 'queued'])
        .gte('created_at', since)
        .limit(1)
    if (error) {
        console.warn('[crm-welcome] dedup check falhou:', error.message)
        return false // na dúvida, prefere mandar a perder o welcome
    }
    return (data?.length ?? 0) > 0
}

export type WelcomeDispatchResult =
    | { attempted: false; reason: 'disabled' | 'no_phone' | 'recent_welcome' | 'empty_message' }
    | { attempted: true; status: 'sent' | 'queued' | 'failed' | 'held' | 'blocked'; reason?: string }

/**
 * Dispara a mensagem automática de boas-vindas para um lead novo, pelo número
 * conectado (Baileys). Idempotente dentro da janela de dedup (24h) e respeita
 * opt-out (via gateway). Best-effort: nunca deve derrubar a criação do lead —
 * o caller deve chamar com `.catch()` / dentro de try.
 */
export async function dispatchCrmWelcome(
    supabase: SupabaseClient,
    input: { phone?: string | null; nome?: string | null; leadId?: string | null; origin?: string },
): Promise<WelcomeDispatchResult> {
    const config = await loadCrmWelcome(supabase)
    if (!config.enabled) return { attempted: false, reason: 'disabled' }

    const phone = normalizePhone(input.phone || '')
    if (!phone) return { attempted: false, reason: 'no_phone' }

    const body = config.message?.trim()
    if (!body) return { attempted: false, reason: 'empty_message' }

    if (await hasRecentWelcome(supabase, phone)) {
        return { attempted: false, reason: 'recent_welcome' }
    }

    const nome = input.nome?.trim() || ''
    const text = renderTemplate(body, { nome: firstName(nome) || 'amigo(a)', name: nome })

    const result = await sendOutbound(supabase, {
        to: { phone, leadId: input.leadId ?? null, name: nome || 'Lead' },
        text,
        intent: 'bot',
        channelHint: 'baileys',
        origin: input.origin ?? 'crm-welcome',
        botStep: 'welcome',
    })

    return { attempted: true, status: result.status, reason: result.reason }
}
