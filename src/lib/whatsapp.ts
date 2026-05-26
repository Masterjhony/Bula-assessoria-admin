/**
 * Cliente HTTP para o servidor WhatsApp dedicado (VPS).
 * Não importar Baileys aqui — a lib é Node-native e quebra o bundle do Vercel.
 * Toda lógica do Baileys vive em whatsapp-server/whatsapp-server.js.
 *
 * Este módulo é o ÚNICO ponto pelo qual o Next.js dispara welcomes. Todos os
 * 4 caminhos de criação de lead (LP form, webhook Sheets, createLead admin,
 * webhook legado CRM) convergem aqui via `dispatchWelcome`. Isso garante:
 *   1. Dedup: o mesmo número não recebe 2 welcomes em janela curta.
 *   2. Respeito a opt-out: o VPS já trata `{silent:true}` do render-welcome,
 *      mas também checamos aqui antes do round-trip pra economizar latência.
 *   3. Log unificado: toda tentativa (sent/failed/skipped) é registrada em
 *      `whatsapp_messages` com `origin` rotulando o caller, para auditoria.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone, phoneVariants } from './whatsapp-central'

const WHATSAPP_SERVER_URL = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001'

/** Janela de dedup: não reenviar welcome ao mesmo número nesse intervalo. */
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000 // 24h

export type WelcomeOrigin = 'lp' | 'webhook-sheets' | 'webhook-crm' | 'admin-manual'

export interface DispatchResult {
    sent: boolean
    skipped: boolean
    reason?: 'optout' | 'recent_welcome' | 'no_phone' | 'not_on_whatsapp' | 'vps_error' | 'vps_unreachable' | 'no_template'
    queued?: boolean
    position?: number
}

function getSupabase(): SupabaseClient | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return null
    return createClient(url, key)
}

/**
 * Verifica se já existe um welcome enviado a este número nas últimas
 * DEDUP_WINDOW_MS horas. Usa `whatsapp_messages` como fonte da verdade.
 *
 * Considera "welcome" qualquer outbound com bot_step='welcome' OU
 * origin in ('lp','webhook-sheets','webhook-crm','admin-manual') — esse último
 * conjunto cobre os logs que outros callers já gravavam antes desta refatoração.
 */
async function hasRecentWelcome(
    supabase: SupabaseClient,
    phone: string,
): Promise<boolean> {
    const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
    const variants = phoneVariants(phone)
    const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .in('phone', variants)
        .eq('direction', 'outbound')
        .in('status', ['sent', 'queued'])
        .or('bot_step.eq.welcome,origin.in.(lp,webhook-sheets,webhook-crm,admin-manual)')
        .gte('created_at', since)
        .limit(1)
    if (error) {
        console.warn('[dispatchWelcome] dedup check falhou:', error.message)
        return false // em caso de falha de DB, prefere mandar que perder
    }
    return (data?.length ?? 0) > 0
}

async function isOptOut(supabase: SupabaseClient, phone: string): Promise<boolean> {
    const variants = phoneVariants(phone)
    const [optoutRes, leadRes] = await Promise.all([
        supabase.from('whatsapp_optouts').select('phone').in('phone', variants).limit(1),
        supabase.from('crm_leads').select('optout_whatsapp').in('telefone', variants).eq('optout_whatsapp', true).limit(1),
    ])
    return (optoutRes.data?.length ?? 0) > 0 || (leadRes.data?.length ?? 0) > 0
}

function logAttempt(
    supabase: SupabaseClient | null,
    args: {
        phone: string
        name: string
        origin: WelcomeOrigin
        status: 'sent' | 'queued' | 'failed' | 'skipped'
        reason?: string
        lead_id?: string | null
    },
) {
    if (!supabase) return
    void supabase.from('whatsapp_messages').insert({
        phone: args.phone,
        name: args.name,
        body: null,
        direction: 'outbound',
        status: args.status,
        origin: args.origin,
        bot_step: 'welcome',
        lead_id: args.lead_id ?? null,
        // `reason` não tem coluna dedicada — vira sufixo do status para auditoria
        // na coluna `body` quando skipped/failed (não polui sent/queued).
        ...(args.status === 'skipped' || args.status === 'failed'
            ? { body: args.reason ? `[${args.status}: ${args.reason}]` : `[${args.status}]` }
            : {}),
    }).then(({ error }) => {
        if (error) console.warn('[dispatchWelcome] log falhou:', error.message)
    })
}

/**
 * Despacha o welcome para um número novo. Idempotente dentro da janela de
 * dedup (24h). Respeita opt-out. Loga toda tentativa em `whatsapp_messages`.
 *
 * Use este helper em TODOS os pontos de criação de lead. Não chame
 * `WHATSAPP_SERVER_URL/send` direto.
 */
export async function dispatchWelcome(
    phone: string,
    name: string,
    origin: WelcomeOrigin,
    opts?: { lead_id?: string | null },
): Promise<DispatchResult> {
    const normalized = normalizePhone(phone)
    if (!normalized) {
        return { sent: false, skipped: true, reason: 'no_phone' }
    }

    const supabase = getSupabase()
    if (supabase) {
        if (await isOptOut(supabase, normalized)) {
            logAttempt(supabase, { phone: normalized, name, origin, status: 'skipped', reason: 'optout', lead_id: opts?.lead_id })
            return { sent: false, skipped: true, reason: 'optout' }
        }
        if (await hasRecentWelcome(supabase, normalized)) {
            logAttempt(supabase, { phone: normalized, name, origin, status: 'skipped', reason: 'recent_welcome', lead_id: opts?.lead_id })
            return { sent: false, skipped: true, reason: 'recent_welcome' }
        }
    }

    let res: Response
    try {
        res = await fetch(`${WHATSAPP_SERVER_URL}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: normalized, name }),
            signal: AbortSignal.timeout(30_000),
        })
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        logAttempt(supabase, { phone: normalized, name, origin, status: 'failed', reason: 'vps_unreachable: ' + msg, lead_id: opts?.lead_id })
        return { sent: false, skipped: false, reason: 'vps_unreachable' }
    }

    let data: { sent?: boolean; queued?: boolean; reason?: string; position?: number } = {}
    try { data = await res.json() } catch { /* ignore */ }

    if (!res.ok) {
        logAttempt(supabase, { phone: normalized, name, origin, status: 'failed', reason: `http_${res.status}`, lead_id: opts?.lead_id })
        return { sent: false, skipped: false, reason: 'vps_error' }
    }

    // VPS retorna { sent: true } ou { sent: false, reason: '...' } ou { queued: true, ... }
    if (data.sent === false) {
        const r = data.reason as DispatchResult['reason']
        logAttempt(supabase, { phone: normalized, name, origin, status: 'skipped', reason: r ?? 'vps_skip', lead_id: opts?.lead_id })
        return { sent: false, skipped: true, reason: r }
    }
    if (data.queued) {
        logAttempt(supabase, { phone: normalized, name, origin, status: 'queued', lead_id: opts?.lead_id })
        return { sent: false, skipped: false, queued: true, position: data.position }
    }

    logAttempt(supabase, { phone: normalized, name, origin, status: 'sent', lead_id: opts?.lead_id })
    return { sent: true, skipped: false }
}

/**
 * @deprecated Use `dispatchWelcome` em vez disso — ele tem dedup, log e
 * respeita opt-out de forma centralizada. Mantido por compatibilidade
 * temporária com callers antigos.
 */
export async function sendWelcomeMessage(phone: string, name: string): Promise<boolean> {
    const res = await dispatchWelcome(phone, name, 'admin-manual')
    return res.sent
}
