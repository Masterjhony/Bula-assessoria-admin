/**
 * Sanitização e normalização dos campos opcionais de templates WhatsApp
 * (mídia + enquete). Usado tanto no POST quanto no PUT da API.
 *
 * Convenções:
 *   - media_url é sempre uma key do R2 (com prefixo padrão libmedia/). Nunca
 *     guardamos URL presigned no banco — ela é gerada na hora do envio.
 *   - media_type só pode ser 'image' | 'video' | 'audio' | 'document'.
 *   - poll_options é array de strings; máximo 12 (limite do WhatsApp), cada
 *     uma com até 100 chars.
 *   - poll_selectable_count fica entre 1 e poll_options.length.
 */

export const ALLOWED_MEDIA_TYPES = ['image', 'video', 'audio', 'document'] as const
export type MediaType = (typeof ALLOWED_MEDIA_TYPES)[number]

export interface TemplateMediaPollInput {
    media_url?: string | null
    media_type?: string | null
    media_mime?: string | null
    media_filename?: string | null
    media_caption?: string | null
    poll_question?: string | null
    poll_options?: unknown
    poll_selectable_count?: number | null
}

export interface NormalizedMediaPoll {
    media_url: string | null
    media_type: MediaType | null
    media_mime: string | null
    media_filename: string | null
    media_caption: string | null
    poll_question: string | null
    poll_options: string[]
    poll_selectable_count: number
}

/** Erro retornado para o cliente quando o payload é inválido. */
export class TemplatePayloadError extends Error {}

export function normalizeMediaAndPoll(input: TemplateMediaPollInput): NormalizedMediaPoll {
    // ── Mídia ──────────────────────────────────────────────────────────────
    let media_url: string | null = null
    let media_type: MediaType | null = null
    let media_mime: string | null = null
    let media_filename: string | null = null
    let media_caption: string | null = null

    if (input.media_url !== undefined && input.media_url !== null && String(input.media_url).trim() !== '') {
        const url = String(input.media_url).trim()
        // Aceita key (com ou sem prefixo libmedia/). Rejeita absolute URL para
        // o caso de alguém colar um presigned por engano — guardamos só a key.
        if (url.startsWith('http://') || url.startsWith('https://')) {
            throw new TemplatePayloadError('media_url deve ser uma key do R2, não uma URL.')
        }
        if (url.includes('..') || url.startsWith('/')) {
            throw new TemplatePayloadError('media_url contém caracteres inválidos.')
        }
        media_url = url

        const t = String(input.media_type ?? '').trim().toLowerCase()
        if (!ALLOWED_MEDIA_TYPES.includes(t as MediaType)) {
            throw new TemplatePayloadError(`media_type inválido: deve ser ${ALLOWED_MEDIA_TYPES.join('|')}.`)
        }
        media_type = t as MediaType
        media_mime = input.media_mime ? String(input.media_mime).trim() : null
        media_filename = input.media_filename ? String(input.media_filename).trim() : null
        media_caption = input.media_caption ? String(input.media_caption) : null
    }

    // ── Enquete ────────────────────────────────────────────────────────────
    let poll_question: string | null = null
    let poll_options: string[] = []
    let poll_selectable_count = 1

    const rawOptions = Array.isArray(input.poll_options) ? input.poll_options : []
    const cleanedOptions = rawOptions
        .map(o => (typeof o === 'string' ? o.trim() : ''))
        .filter(o => o.length > 0)
        .slice(0, 12) // WhatsApp limita a 12 opções por enquete

    const hasPoll = (input.poll_question && String(input.poll_question).trim() !== '') || cleanedOptions.length > 0
    if (hasPoll) {
        poll_question = input.poll_question ? String(input.poll_question).trim() : null
        if (!poll_question) {
            throw new TemplatePayloadError('poll_question é obrigatório quando há opções de enquete.')
        }
        if (cleanedOptions.length < 2) {
            throw new TemplatePayloadError('Enquete precisa de pelo menos 2 opções.')
        }
        for (const opt of cleanedOptions) {
            if (opt.length > 100) {
                throw new TemplatePayloadError(`Opção de enquete excede 100 chars: "${opt.slice(0, 40)}…"`)
            }
        }
        poll_options = cleanedOptions

        const sc = Number(input.poll_selectable_count ?? 1)
        if (!Number.isFinite(sc) || sc < 1) {
            poll_selectable_count = 1
        } else {
            poll_selectable_count = Math.min(Math.max(1, Math.floor(sc)), poll_options.length)
        }
    }

    return {
        media_url,
        media_type,
        media_mime,
        media_filename,
        media_caption,
        poll_question,
        poll_options,
        poll_selectable_count,
    }
}

/** Colunas do `whatsapp_templates` retornadas em todas as queries de leitura. */
export const TEMPLATE_SELECT_COLUMNS =
    'id, slug, title, category, body, variables, archived, usage_count, updated_at, ' +
    'media_url, media_type, media_mime, media_filename, media_caption, ' +
    'poll_question, poll_options, poll_selectable_count, ' +
    'meta_template_id, meta_status, meta_category, meta_language, meta_rejected_reason, meta_synced_at'
