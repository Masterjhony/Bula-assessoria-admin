/**
 * Cliente Pluggy (Open Finance) — SOMENTE LEITURA de contas e transações das
 * conexões autorizadas por consentimento no app do banco. Sem SDK: a API é
 * REST simples e o projeto evita dependências onde um fetch resolve.
 *
 * Fluxo: transação nova no banco → webhook do Pluggy → /api/openfinance/webhook
 * → syncItem() busca contas+transações → staging openfinance_transacoes →
 * aviso no WhatsApp. Nada toca erp_movimentos_bancarios automaticamente.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const API = 'https://api.pluggy.ai'

export function isPluggyConfigured(): boolean {
    return !!(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET)
}

let apiKeyCache: { key: string; at: number } | null = null

/** API key de serviço (validade ~2h; renovamos a cada 90min). */
async function apiKey(): Promise<string> {
    if (apiKeyCache && Date.now() - apiKeyCache.at < 90 * 60_000) return apiKeyCache.key
    const res = await fetch(`${API}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            clientId: process.env.PLUGGY_CLIENT_ID,
            clientSecret: process.env.PLUGGY_CLIENT_SECRET,
        }),
        signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`pluggy auth ${res.status}`)
    const { apiKey: key } = await res.json() as { apiKey: string }
    apiKeyCache = { key, at: Date.now() }
    return key
}

async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        headers: { 'X-API-KEY': await apiKey() },
        signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(`pluggy GET ${path} → ${res.status}`)
    return res.json() as Promise<T>
}

export async function pluggyPost<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: { 'X-API-KEY': await apiKey(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`pluggy POST ${path} → ${res.status}: ${detail.slice(0, 200)}`)
    }
    return res.json() as Promise<T>
}

/** Connect Token pro widget de consentimento (frontend nunca vê o secret). */
export async function createConnectToken(): Promise<string> {
    const { accessToken } = await pluggyPost<{ accessToken: string }>('/connect_token', {})
    return accessToken
}

interface PluggyAccount { id: string; name: string; type: string; balance: number; number?: string }
interface PluggyTx {
    id: string; accountId: string; date: string; description: string
    amount: number; type: 'CREDIT' | 'DEBIT'; category?: string | null
}

/**
 * Sincroniza um item (uma conexão bancária): contas + transações dos últimos
 * `dias` no staging. Retorna as transações NOVAS (pra o chamador avisar).
 */
export async function syncItem(
    sb: SupabaseClient,
    itemId: string,
    dias = 10,
): Promise<{ novas: Array<{ conta: string; data: string; descricao: string; valor: number }>; contas: number }> {
    const item = await get<{ id: string; status: string; connector?: { name?: string } }>(`/items/${itemId}`)
    const { results: contas } = await get<{ results: PluggyAccount[] }>(`/accounts?itemId=${itemId}`)

    await sb.from('openfinance_itens').upsert({
        item_id: itemId,
        connector: item.connector?.name ?? null,
        status: item.status,
        contas: contas.map(c => ({ id: c.id, nome: c.name, tipo: c.type, saldo: c.balance })),
        last_sync: new Date().toISOString(),
    }, { onConflict: 'item_id' })

    const desde = new Date(Date.now() - dias * 86400_000).toISOString().slice(0, 10)
    const novas: Array<{ conta: string; data: string; descricao: string; valor: number }> = []

    for (const conta of contas) {
        const rotulo = `${item.connector?.name ?? 'banco'} · ${conta.name}`
        // /v2/transactions: paginação por cursor ({results, next}); o v1 com
        // pageSize foi DESATIVADO (410). Caminhamos até esgotar ou até a
        // janela `desde` (resultados vêm do mais novo pro mais velho).
        interface PaginaTx { results: PluggyTx[]; next: string | null }
        const txs: PluggyTx[] = []
        let cursor: string | null = null
        for (let pagina = 0; pagina < 20; pagina++) {
            const qs: string = `accountId=${conta.id}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '')
            const page: PaginaTx = await get<PaginaTx>(`/v2/transactions?${qs}`)
            let antigaDemais = false
            for (const tx of page.results ?? []) {
                if ((tx.date ?? '').slice(0, 10) < desde) { antigaDemais = true; break }
                txs.push(tx)
            }
            cursor = page.next
            if (!cursor || antigaDemais) break
        }
        for (const tx of txs) {
            const { data: ins, error } = await sb.from('openfinance_transacoes')
                .insert({
                    pluggy_tx_id: tx.id,
                    item_id: itemId,
                    account_id: conta.id,
                    conta: rotulo,
                    data: tx.date?.slice(0, 10) ?? null,
                    descricao: tx.description,
                    valor: tx.amount,
                    categoria: tx.category ?? null,
                    raw: tx as unknown as Record<string, unknown>,
                })
                .select('id')
            // conflito de unique (pluggy_tx_id) = já conhecida → ignora
            if (!error && ins?.length) {
                novas.push({ conta: rotulo, data: tx.date?.slice(0, 10) ?? '', descricao: tx.description, valor: tx.amount })
            }
        }
    }
    return { novas, contas: contas.length }
}
