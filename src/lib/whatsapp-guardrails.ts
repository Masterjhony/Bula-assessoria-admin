/**
 * WhatsApp — guard rails anti-ban.
 *
 * Centraliza as regras que protegem o número (sobretudo o Baileys, que é
 * banível) e a qualidade do número oficial (Cloud). Consumido pelo
 * `whatsapp-gateway.ts`, que aplica estas checagens ANTES de entregar a
 * mensagem a qualquer transporte.
 *
 * Config persistida em `site_settings.whatsapp_guardrails` (JSONB). Chave
 * ausente cai nos defaults conservadores abaixo — nunca quebra um read.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneVariants } from './whatsapp-central'

export const GUARDRAILS_KEY = 'whatsapp_guardrails'

export interface GuardrailsConfig {
    /** Liga/desliga TODAS as travas de uma vez (emergência). */
    enabled: boolean
    baileys: {
        /** Teto duro de envios/dia neste número. */
        daily_cap: number
        /** Aquecimento: nº de envios permitidos no 1º dia. */
        warmup_start: number
        /** Aquecimento: incremento de teto por dia. */
        warmup_step: number
        /** Data (YYYY-MM-DD) em que o aquecimento começou. null = sem warmup (usa daily_cap). */
        warmup_started_on: string | null
        /** Intervalo mínimo entre envios num loop (ms) — base do jitter. */
        min_delay_ms: number
        /** Intervalo máximo entre envios num loop (ms) — teto do jitter. */
        max_delay_ms: number
    }
    cloud: {
        /** Teto de envios/dia pela Cloud API (controle de custo). */
        daily_cap: number
    }
    business_hours: {
        enabled: boolean
        /** "HH:MM" 24h. */
        start: string
        /** "HH:MM" 24h. */
        end: string
        timezone: string
    }
    /** Janela (horas) para considerar um número já contatado na mesma campanha (dedup). */
    dedup_hours: number
}

export const GUARDRAILS_DEFAULTS: GuardrailsConfig = {
    enabled: true,
    baileys: {
        daily_cap: 300,
        warmup_start: 30,
        warmup_step: 20,
        warmup_started_on: null,
        min_delay_ms: 8000,
        max_delay_ms: 25000,
    },
    cloud: {
        daily_cap: 1000,
    },
    business_hours: {
        enabled: false,
        start: '08:00',
        end: '20:00',
        timezone: 'America/Sao_Paulo',
    },
    dedup_hours: 12,
}

export type GuardChannel = 'baileys' | 'cloud'

/** Merge raso defensivo: config parcial no banco nunca derruba sub-objetos. */
function mergeConfig(raw: Partial<GuardrailsConfig> | null | undefined): GuardrailsConfig {
    const r = raw ?? {}
    return {
        enabled: r.enabled ?? GUARDRAILS_DEFAULTS.enabled,
        baileys: { ...GUARDRAILS_DEFAULTS.baileys, ...(r.baileys ?? {}) },
        cloud: { ...GUARDRAILS_DEFAULTS.cloud, ...(r.cloud ?? {}) },
        business_hours: { ...GUARDRAILS_DEFAULTS.business_hours, ...(r.business_hours ?? {}) },
        dedup_hours: r.dedup_hours ?? GUARDRAILS_DEFAULTS.dedup_hours,
    }
}

export async function loadGuardrails(supabase: SupabaseClient): Promise<GuardrailsConfig> {
    const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', GUARDRAILS_KEY)
        .single()
    return mergeConfig(data?.value as Partial<GuardrailsConfig> | undefined)
}

/** Data corrente (YYYY-MM-DD) no fuso informado — base do contador diário. */
export function dayString(timezone = 'America/Sao_Paulo', at: Date = new Date()): string {
    // en-CA formata como YYYY-MM-DD, que é exatamente o que o Postgres DATE espera.
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(at)
}

/**
 * Teto efetivo do dia para o canal. Para o Baileys aplica o aquecimento: se
 * `warmup_started_on` está setado, o teto sobe de `warmup_start` em passos de
 * `warmup_step` até `daily_cap`. Sem warmup, usa `daily_cap`.
 */
export function effectiveDailyCap(cfg: GuardrailsConfig, channel: GuardChannel): number {
    if (channel === 'cloud') return cfg.cloud.daily_cap
    const b = cfg.baileys
    if (!b.warmup_started_on) return b.daily_cap

    const tz = cfg.business_hours.timezone
    const start = new Date(`${b.warmup_started_on}T00:00:00`)
    const todayStr = dayString(tz)
    const today = new Date(`${todayStr}T00:00:00`)
    const days = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86_400_000))
    const ramped = b.warmup_start + b.warmup_step * days
    return Math.min(b.daily_cap, Math.max(b.warmup_start, ramped))
}

/** Delay aleatório (ms) entre envios num loop — quebra o fingerprint de spam. */
export function jitterDelayMs(cfg: GuardrailsConfig): number {
    const { min_delay_ms, max_delay_ms } = cfg.baileys
    const lo = Math.max(0, min_delay_ms)
    const hi = Math.max(lo, max_delay_ms)
    return lo + Math.floor(Math.random() * (hi - lo + 1))
}

/** True se o número está em opt-out (tabela rápida OU flag no lead). */
export async function isOptedOut(supabase: SupabaseClient, phone: string): Promise<boolean> {
    const variants = phoneVariants(phone)
    if (variants.length === 0) return false

    const [optoutRes, leadRes] = await Promise.all([
        supabase.from('whatsapp_optouts').select('phone').in('phone', variants).limit(1),
        supabase
            .from('crm_leads')
            .select('id')
            .in('telefone', variants)
            .eq('optout_whatsapp', true)
            .limit(1),
    ])
    return !!(optoutRes.data?.length || leadRes.data?.length)
}

/**
 * Filtro de opt-out em lote: dado um conjunto de telefones, devolve o Set dos
 * que estão em opt-out (tabela `whatsapp_optouts` por número OU lead com
 * `optout_whatsapp=true`). Usado pelo disparo de campanha — complementa o filtro
 * que o resolveSegment já faz por flag, cobrindo opt-outs só por número.
 */
export async function optedOutPhoneSet(
    supabase: SupabaseClient,
    phones: string[],
): Promise<Set<string>> {
    const out = new Set<string>()
    if (phones.length === 0) return out

    // Mapa variante → telefone original, para devolver no formato que entrou.
    const variantToOriginal = new Map<string, string>()
    const allVariants: string[] = []
    for (const phone of phones) {
        for (const v of phoneVariants(phone)) {
            if (!variantToOriginal.has(v)) {
                variantToOriginal.set(v, phone)
                allVariants.push(v)
            }
        }
    }
    if (allVariants.length === 0) return out

    // Consulta em chunks para não estourar o tamanho do IN.
    const chunkSize = 500
    for (let i = 0; i < allVariants.length; i += chunkSize) {
        const chunk = allVariants.slice(i, i + chunkSize)
        const [optoutRes, leadRes] = await Promise.all([
            supabase.from('whatsapp_optouts').select('phone').in('phone', chunk),
            supabase.from('crm_leads').select('telefone').in('telefone', chunk).eq('optout_whatsapp', true),
        ])
        for (const r of optoutRes.data ?? []) {
            const orig = variantToOriginal.get(String((r as { phone: string }).phone))
            if (orig) out.add(orig)
        }
        for (const r of leadRes.data ?? []) {
            const orig = variantToOriginal.get(String((r as { telefone: string }).telefone))
            if (orig) out.add(orig)
        }
    }
    return out
}

/** Quantos envios já saíram hoje por este canal (fuso do guard rail). */
export async function dailyCount(
    supabase: SupabaseClient,
    channel: GuardChannel,
    timezone = 'America/Sao_Paulo',
): Promise<number> {
    const day = dayString(timezone)
    const { data } = await supabase
        .from('whatsapp_send_counters')
        .select('sent_count')
        .eq('channel', channel)
        .eq('day', day)
        .single()
    return data?.sent_count ?? 0
}

/** Incrementa atomicamente (RPC) o contador do dia e devolve o novo total. */
export async function incrementDailyCount(
    supabase: SupabaseClient,
    channel: GuardChannel,
    timezone = 'America/Sao_Paulo',
): Promise<number> {
    const day = dayString(timezone)
    const { data, error } = await supabase.rpc('increment_whatsapp_counter', {
        p_channel: channel,
        p_day: day,
    })
    if (error) {
        // Fallback best-effort: não derruba o envio se o contador falhar.
        console.warn('[guardrails] increment_whatsapp_counter falhou:', error.message)
        return -1
    }
    return typeof data === 'number' ? data : -1
}

/** Incremento em lote (RPC) — soma N ao contador do dia. Devolve o novo total. */
export async function incrementDailyCountBy(
    supabase: SupabaseClient,
    channel: GuardChannel,
    amount: number,
    timezone = 'America/Sao_Paulo',
): Promise<number> {
    if (amount <= 0) return dailyCount(supabase, channel, timezone)
    const day = dayString(timezone)
    const { data, error } = await supabase.rpc('increment_whatsapp_counter_by', {
        p_channel: channel,
        p_day: day,
        p_amount: amount,
    })
    if (error) {
        console.warn('[guardrails] increment_whatsapp_counter_by falhou:', error.message)
        return -1
    }
    return typeof data === 'number' ? data : -1
}

/**
 * Dedup: já mandamos para este número nas últimas `withinHours`? Opcionalmente
 * restrito a uma campanha. Usado só para massa/campanha (não para conversa 1:1).
 */
export async function recentlyMessaged(
    supabase: SupabaseClient,
    phone: string,
    withinHours: number,
    opts?: { campaignId?: string | null },
): Promise<boolean> {
    if (withinHours <= 0) return false
    const variants = phoneVariants(phone)
    if (variants.length === 0) return false

    const since = new Date(Date.now() - withinHours * 3_600_000).toISOString()
    let q = supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('direction', 'outbound')
        .in('phone', variants)
        .in('status', ['sent', 'queued'])
        .gte('created_at', since)
        .limit(1)
    if (opts?.campaignId) q = q.eq('campaign_id', opts.campaignId)

    const { data } = await q
    return !!data?.length
}
