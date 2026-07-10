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

/** Solicita um código de pareamento por número (alternativa ao QR). */
export async function pairVpsPhone(
    phone: string,
): Promise<{ pairing_code?: string; pending?: boolean; error?: string }> {
    try {
        const res = await fetch(`${WHATSAPP_SERVER_URL}/pair`, {
            method: 'POST',
            headers: vpsHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ phone }),
            signal: AbortSignal.timeout(20000),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) return { error: String(body.error || `http_${res.status}`) }
        return { pairing_code: body.pairing_code, pending: body.pending }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'vps_unreachable' }
    }
}

export interface VpsGroupMedia {
    type: 'image' | 'video' | 'audio' | 'document'
    /** URL que o VPS consegue baixar (signed URL do Storage serve). */
    url: string
    caption?: string
    /** Nome de arquivo exibido quando type='document'. */
    fileName?: string
}

/**
 * Enfileira uma mensagem para um grupo. `groupId` = JID ou id antes do @.
 * Com `media`, o VPS baixa a URL e envia o ARQUIVO no grupo (a URL não aparece
 * na mensagem) — é assim que os documentos da ficha de cadastro chegam como
 * anexo, em vez de um link assinado de 300 caracteres que quebra no "Ler mais".
 */
export async function sendVpsGroup(
    groupId: string,
    message: string,
    media?: VpsGroupMedia,
): Promise<{ queued: boolean; jid?: string; error?: string }> {
    try {
        const res = await fetch(`${WHATSAPP_SERVER_URL}/send-group`, {
            method: 'POST',
            headers: vpsHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ groupId, message, ...(media ? { media } : {}) }),
            signal: AbortSignal.timeout(15000),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) return { queued: false, error: String(body.error || `http_${res.status}`) }
        return { queued: !!body.queued, jid: body.jid }
    } catch (e) {
        return { queued: false, error: e instanceof Error ? e.message : 'vps_unreachable' }
    }
}
