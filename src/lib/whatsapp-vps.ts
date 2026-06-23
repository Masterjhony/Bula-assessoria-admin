/**
 * Acesso ao servidor Baileys (VPS). Centraliza a URL e o token de acesso.
 *
 * O servidor exige o header `x-vps-token` quando `API_TOKEN` está setado nele
 * (porta exposta em IP público). Aqui lemos `WHATSAPP_SERVER_TOKEN` e injetamos
 * o header em todas as chamadas. Sem token configurado, os headers ficam vazios
 * (compat com setups antigos por túnel).
 */

export const WHATSAPP_SERVER_URL = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001'

const SERVER_TOKEN = process.env.WHATSAPP_SERVER_TOKEN || ''

export function vpsHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
        ...(SERVER_TOKEN ? { 'x-vps-token': SERVER_TOKEN } : {}),
        ...(extra ?? {}),
    }
}

export interface VpsGroup {
    id: string
    subject: string
    size: number | null
}

/** Lista os grupos de que a sessão Baileys participa (id `...@g.us` + nome). */
export async function fetchVpsGroups(): Promise<VpsGroup[]> {
    const res = await fetch(`${WHATSAPP_SERVER_URL}/groups`, {
        cache: 'no-store',
        headers: vpsHeaders(),
        signal: AbortSignal.timeout(15000),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(String(body.error || `http_${res.status}`))
    return Array.isArray(body.groups) ? (body.groups as VpsGroup[]) : []
}

/** Enfileira uma mensagem de texto para um grupo. `groupId` = JID ou id antes do @. */
export async function sendVpsGroup(
    groupId: string,
    message: string,
): Promise<{ queued: boolean; jid?: string; error?: string }> {
    try {
        const res = await fetch(`${WHATSAPP_SERVER_URL}/send-group`, {
            method: 'POST',
            headers: vpsHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ groupId, message }),
            signal: AbortSignal.timeout(15000),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) return { queued: false, error: String(body.error || `http_${res.status}`) }
        return { queued: !!body.queued, jid: body.jid }
    } catch (e) {
        return { queued: false, error: e instanceof Error ? e.message : 'vps_unreachable' }
    }
}
