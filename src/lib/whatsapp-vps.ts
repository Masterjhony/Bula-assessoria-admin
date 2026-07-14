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

/**
 * Multi-inbox: cada sessão Baileys (inbox) tem um id no VPS (= whatsapp_inboxes.id).
 * Anexa `?session=<id>` à URL quando informado; sem id, o VPS usa a sessão default
 * (compat: grupos das leiloeiras, assessor, campanhas e gif-lotes seguem no número
 * histórico do João).
 */
function withSession(path: string, session?: string | null): string {
    const base = `${WHATSAPP_SERVER_URL}${path}`
    if (!session) return base
    const sep = path.includes('?') ? '&' : '?'
    return `${base}${sep}session=${encodeURIComponent(session)}`
}

export interface VpsSessionInfo {
    id: string
    status: string
    hasQr: boolean
    queueSize: number
    processing: boolean
    jid: string | null
}

/** Lista as sessões Baileys ativas no VPS (com status de conexão de cada uma). */
export async function fetchVpsSessions(): Promise<{ sessions: VpsSessionInfo[]; default: string }> {
    const res = await fetch(withSession('/sessions'), {
        cache: 'no-store',
        headers: vpsHeaders(),
        signal: AbortSignal.timeout(15000),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(String(body.error || `http_${res.status}`))
    return {
        sessions: Array.isArray(body.sessions) ? (body.sessions as VpsSessionInfo[]) : [],
        default: String(body.default || 'joao'),
    }
}

/** Cria uma nova sessão Baileys no VPS (gera o QR/aguarda pareamento). */
export async function createVpsSession(
    id: string,
): Promise<{ created?: boolean; id?: string; status?: string; error?: string }> {
    try {
        const res = await fetch(withSession('/sessions'), {
            method: 'POST',
            headers: vpsHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ id }),
            signal: AbortSignal.timeout(20000),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) return { error: String(body.error || `http_${res.status}`) }
        return { created: body.created, id: body.id, status: body.status }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'vps_unreachable' }
    }
}

/** Remove uma sessão Baileys do VPS (encerra o socket e apaga o auth). */
export async function deleteVpsSession(id: string): Promise<{ deleted?: boolean; error?: string }> {
    try {
        const res = await fetch(withSession('/sessions', id), {
            method: 'DELETE',
            headers: vpsHeaders(),
            signal: AbortSignal.timeout(20000),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) return { error: String(body.error || `http_${res.status}`) }
        return { deleted: body.deleted }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'vps_unreachable' }
    }
}

export interface VpsStatus {
    session: string
    status: string
    qr: string | null
    pairing_code: string | null
}

/** Status de conexão de uma sessão (status + QR data URL + código de pareamento). */
export async function fetchVpsStatus(session?: string | null): Promise<VpsStatus> {
    const res = await fetch(withSession('/status', session), {
        cache: 'no-store',
        headers: vpsHeaders(),
        signal: AbortSignal.timeout(15000),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(String(body.error || `http_${res.status}`))
    return {
        session: String(body.session || session || ''),
        status: String(body.status || 'unknown'),
        qr: body.qr ?? null,
        pairing_code: body.pairing_code ?? null,
    }
}

export interface VpsGroup {
    id: string
    subject: string
    size: number | null
}

/** Lista os grupos de que a sessão Baileys participa (id `...@g.us` + nome). */
export async function fetchVpsGroups(session?: string | null): Promise<VpsGroup[]> {
    const res = await fetch(withSession('/groups', session), {
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
    session?: string | null,
): Promise<{ pairing_code?: string; pending?: boolean; error?: string }> {
    try {
        const res = await fetch(withSession('/pair', session), {
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
    /**
     * MIME do documento (ex.: 'application/pdf'). Sem ele o VPS infere pela
     * extensão do fileName; passar explícito evita o WhatsApp entregar como
     * arquivo .bin quando o nome não tem extensão reconhecível.
     */
    mimetype?: string
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
    session?: string | null,
): Promise<{ queued: boolean; jid?: string; error?: string }> {
    try {
        const res = await fetch(withSession('/send-group', session), {
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
