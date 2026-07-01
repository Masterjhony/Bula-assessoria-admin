/**
 * Cliente OpenRouter (API compatível com OpenAI) para os recursos de IA do
 * sistema que precisam de um modelo de bom custo/benefício — hoje o concierge
 * de WhatsApp (qualificação automática de leads).
 *
 * Por que OpenRouter: um único endpoint dá acesso a vários modelos com
 * roteamento e billing centralizados. O modelo é configurável por env
 * (OPENROUTER_MODEL) e por chamada — o default é um modelo barato e forte em
 * português + instruções (Gemini 2.5 Flash). Troque sem mexer no código.
 *
 * Requer `OPENROUTER_API_KEY`. Sem ela, `isOpenRouterConfigured()` é false e o
 * caller deve degradar com elegância (o concierge cai em silêncio / fallback).
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

/** Modelo default — bom custo/benefício para PT-BR + JSON estruturado. */
export const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash'

export function isOpenRouterConfigured(): boolean {
    return !!process.env.OPENROUTER_API_KEY
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export interface OpenRouterOptions {
    model?: string
    temperature?: number
    maxTokens?: number
    /** Quando true, pede `response_format: json_object` (saída estruturada). */
    json?: boolean
    /** AbortSignal opcional para timeout do caller. */
    signal?: AbortSignal
}

/**
 * Chamada de chat completion. Retorna o conteúdo textual da 1ª escolha.
 * Lança em erro de rede/HTTP — o caller decide como degradar.
 */
export async function openRouterChat(
    messages: ChatMessage[],
    opts: OpenRouterOptions = {},
): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) throw new Error('OPENROUTER_API_KEY ausente')

    const body: Record<string, unknown> = {
        model: opts.model || DEFAULT_OPENROUTER_MODEL,
        messages,
        temperature: opts.temperature ?? 0.6,
        max_tokens: opts.maxTokens ?? 900,
    }
    if (opts.json) body.response_format = { type: 'json_object' }

    const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            // Headers recomendados pelo OpenRouter para atribuição (opcionais).
            'HTTP-Referer': 'https://bulaassessoria.com',
            'X-Title': 'Bula Assessoria CRM',
        },
        body: JSON.stringify(body),
        signal: opts.signal,
    })

    if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`OpenRouter ${res.status}: ${detail.slice(0, 300)}`)
    }

    const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
    }
    return data.choices?.[0]?.message?.content ?? ''
}

/**
 * Chat completion que devolve JSON já parseado. Tolera modelos que embrulham o
 * JSON em ```json … ``` ou em texto — extrai o primeiro objeto `{…}` válido.
 * Retorna null se não conseguir parsear.
 */
export async function openRouterJSON<T = Record<string, unknown>>(
    messages: ChatMessage[],
    opts: OpenRouterOptions = {},
): Promise<T | null> {
    const raw = await openRouterChat(messages, { ...opts, json: true })
    return parseLooseJson<T>(raw)
}

/**
 * Transcreve um áudio (base64) usando um modelo multimodal via OpenRouter.
 * Reaproveita o Gemini (aceita áudio OGG/Opus, MP3, WAV). Retorna só o texto
 * falado. Lança em erro de rede/HTTP — o caller degrada (mantém "aguardando").
 * `format`: 'ogg' | 'mp3' | 'wav'.
 */
export async function transcribeAudioOpenRouter(
    base64: string,
    format: string,
    opts: { model?: string; signal?: AbortSignal } = {},
): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) throw new Error('OPENROUTER_API_KEY ausente')

    const body = {
        model: opts.model || DEFAULT_OPENROUTER_MODEL,
        temperature: 0,
        messages: [{
            role: 'user',
            content: [
                { type: 'text', text: 'Transcreva este áudio em português do Brasil. Responda apenas com a transcrição literal, sem comentários nem aspas.' },
                { type: 'input_audio', input_audio: { data: base64, format } },
            ],
        }],
    }

    const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://bulaassessoria.com',
            'X-Title': 'Bula Assessoria CRM',
        },
        body: JSON.stringify(body),
        signal: opts.signal,
    })
    if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`OpenRouter STT ${res.status}: ${detail.slice(0, 200)}`)
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    return (data.choices?.[0]?.message?.content ?? '').trim()
}

export function parseLooseJson<T = Record<string, unknown>>(raw: string): T | null {
    if (!raw) return null
    const trimmed = raw.trim()
    try {
        return JSON.parse(trimmed) as T
    } catch {
        // Extrai o primeiro bloco {...} balanceado (caso venha cercado de texto).
        const start = trimmed.indexOf('{')
        const end = trimmed.lastIndexOf('}')
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(trimmed.slice(start, end + 1)) as T
            } catch {
                return null
            }
        }
        return null
    }
}
