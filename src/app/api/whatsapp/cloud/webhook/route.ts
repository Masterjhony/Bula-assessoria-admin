/**
 * /api/whatsapp/cloud/webhook — webhook da WhatsApp Cloud API (Meta).
 *
 * É o lado "receber" da API oficial — o espelho do /api/whatsapp/inbound, que
 * trata o Baileys. A Meta chama esta rota:
 *   GET  → handshake de verificação (hub.mode/hub.verify_token/hub.challenge).
 *          Configure o mesmo token em WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN e no
 *          painel da Meta (WhatsApp > Configuration > Webhook).
 *   POST → eventos. Tratamos:
 *            value.messages[]  → mensagem recebida do cliente
 *            value.statuses[]  → recibo de entrega (sent/delivered/read/failed)
 *
 * Segurança: se WHATSAPP_CLOUD_APP_SECRET estiver setado, validamos a assinatura
 * X-Hub-Signature-256 (HMAC-SHA256 do corpo cru). Sem o app secret, aceitamos e
 * logamos um aviso — configure-o em produção.
 *
 * A resposta do bot é enviada de volta pela própria Cloud API, via o gateway
 * (sendOutbound, intent crm_reply) — dentro da janela de 24h é texto livre.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { normalizePhone } from '@/lib/whatsapp-central'
import { processInboundMessage, inboundAlreadyProcessed, WHATSAPP_MEDIA_BUCKET, type InboundMedia } from '@/lib/whatsapp-inbound'
import { sendOutbound } from '@/lib/whatsapp-gateway'
import { downloadWhatsappCloudMedia } from '@/lib/whatsapp-cloud-api'
import type { SupabaseClient } from '@supabase/supabase-js'

export const maxDuration = 30

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
}

// ── GET: verificação do webhook (Meta) ──────────────────────────────────────
export async function GET(req: NextRequest) {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    const expected = process.env.WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN || ''

    if (mode === 'subscribe' && expected && token === expected) {
        // A Meta exige o challenge devolvido como texto puro.
        return new NextResponse(challenge ?? '', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
        })
    }
    return new NextResponse('Forbidden', { status: 403 })
}

// ── Verificação de assinatura ───────────────────────────────────────────────
function signatureValid(rawBody: string, header: string | null): boolean {
    const appSecret = process.env.WHATSAPP_CLOUD_APP_SECRET || ''
    if (!appSecret) {
        console.warn('[cloud-webhook] WHATSAPP_CLOUD_APP_SECRET ausente — assinatura não verificada.')
        return true
    }
    if (!header) return false
    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
    try {
        return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected))
    } catch {
        return false
    }
}

// ── Extração do texto de cada tipo de mensagem ──────────────────────────────
type MetaMediaObj = { id?: string; mime_type?: string; caption?: string; filename?: string; voice?: boolean }
type MetaMessage = {
    from?: string
    id?: string
    type?: string
    text?: { body?: string }
    button?: { text?: string }
    interactive?: {
        type?: string
        button_reply?: { title?: string; id?: string }
        list_reply?: { title?: string; id?: string }
    }
    image?: MetaMediaObj
    video?: MetaMediaObj
    audio?: MetaMediaObj
    document?: MetaMediaObj
    sticker?: MetaMediaObj
}

function extractText(m: MetaMessage): string {
    switch (m.type) {
        case 'text': return (m.text?.body ?? '').trim()
        case 'button': return (m.button?.text ?? '').trim()
        case 'interactive':
            return (m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '').trim()
        case 'image': return (m.image?.caption ?? '').trim() || '[imagem]'
        case 'video': return (m.video?.caption ?? '').trim() || '[vídeo]'
        case 'audio': return '[áudio]'
        case 'document': return (m.document?.caption ?? m.document?.filename ?? '').trim() || '[documento]'
        case 'location': return '[localização]'
        case 'contacts': return '[contato]'
        case 'sticker': return '[figurinha]'
        default: return ''
    }
}

// Tipos de mídia que baixamos e guardamos. 'sticker' fica de fora (webp animado,
// pouco útil no histórico) — vira só o placeholder de texto.
const MEDIA_KINDS = ['audio', 'image', 'video', 'document'] as const
type MediaKind = (typeof MEDIA_KINDS)[number]

function extractMediaRef(m: MetaMessage): { kind: MediaKind; id: string; mime?: string; filename?: string } | null {
    if (!MEDIA_KINDS.includes(m.type as MediaKind)) return null
    const obj = (m as Record<string, MetaMediaObj | undefined>)[m.type!]
    if (!obj?.id) return null
    return { kind: m.type as MediaKind, id: obj.id, mime: obj.mime_type, filename: obj.filename }
}

// Extensão a partir do mime (cai num default por tipo quando a Meta não manda).
function extFromMime(mime: string | undefined, kind: MediaKind): string {
    const m = (mime || '').split(';')[0].trim()
    const map: Record<string, string> = {
        'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/amr': 'amr', 'audio/aac': 'aac',
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
        'video/mp4': 'mp4', 'video/3gpp': '3gp',
        'application/pdf': 'pdf',
    }
    if (map[m]) return map[m]
    const fallback: Record<MediaKind, string> = { audio: 'ogg', image: 'jpg', video: 'mp4', document: 'bin' }
    return fallback[kind]
}

/**
 * Baixa a mídia da Graph API e sobe pro Supabase Storage (bucket privado
 * whatsapp-media). Retorna o path pra gravar no banco, ou null se falhar (o
 * inbound segue com o placeholder de texto).
 */
async function ingestInboundMedia(
    supabase: SupabaseClient,
    m: MetaMessage,
    phone: string,
): Promise<InboundMedia | null> {
    const ref = extractMediaRef(m)
    if (!ref) return null
    try {
        const { data, mime } = await downloadWhatsappCloudMedia(ref.id)
        const ext = extFromMime(ref.mime || mime, ref.kind)
        const safeId = (m.id || ref.id).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
        const path = `${phone}/${safeId}.${ext}`
        const contentType = ref.mime || mime
        const { error } = await supabase.storage
            .from(WHATSAPP_MEDIA_BUCKET)
            .upload(path, Buffer.from(data), { contentType, upsert: true })
        if (error) throw new Error(error.message)
        return { url: path, type: ref.kind, mime: contentType, filename: ref.filename ?? null }
    } catch (e) {
        console.error('[cloud-webhook] falha ao ingerir mídia inbound:', e instanceof Error ? e.message : e)
        return null
    }
}

// ── POST: eventos da Meta ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const raw = await req.text()
    if (!signatureValid(raw, req.headers.get('x-hub-signature-256'))) {
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }

    let payload: {
        object?: string
        entry?: Array<{
            changes?: Array<{
                field?: string
                value?: {
                    messaging_product?: string
                    contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>
                    messages?: MetaMessage[]
                    statuses?: Array<{ id?: string; status?: string; errors?: Array<{ title?: string; message?: string }> }>
                }
            }>
        }>
    }
    try {
        payload = JSON.parse(raw)
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // Respondemos 200 mesmo em erro de processamento: a Meta reenvia em não-200,
    // gerando duplicatas. Erros são logados e a inbound já fica registrada.
    try {
        const supabase = getSupabase()

        for (const entry of payload.entry ?? []) {
            for (const change of entry.changes ?? []) {
                const value = change.value
                if (!value || value.messaging_product !== 'whatsapp') continue

                const senderName = value.contacts?.[0]?.profile?.name?.trim() || ''

                // Mensagens recebidas
                for (const msg of value.messages ?? []) {
                    const phone = normalizePhone(msg.from || '')
                    const text = extractText(msg)
                    if (!phone || !text) continue

                    if (await inboundAlreadyProcessed(supabase, msg.id)) continue

                    // Mídia (áudio/imagem/vídeo/documento): baixa da Graph API e
                    // guarda no R2 antes de registrar, pra ficar acessível no inbox.
                    const media = await ingestInboundMedia(supabase, msg, phone)

                    const outcome = await processInboundMessage(supabase, {
                        phone,
                        senderName,
                        text,
                        messageId: msg.id ?? null,
                        channel: 'cloud',
                        media,
                    })

                    if (outcome.kind === 'reply') {
                        // Cliente acabou de escrever → janela de 24h aberta →
                        // o gateway entrega o texto livre pela própria Cloud API.
                        await sendOutbound(supabase, {
                            to: { phone, leadId: outcome.lead?.id ?? null, name: senderName || outcome.lead?.nome || null },
                            text: outcome.reply,
                            intent: 'crm_reply',
                            // O cliente acabou de escrever → janela de 24h aberta por
                            // definição. Forçamos 'cloud' para não depender do log da
                            // inbound (assíncrono) ter commitado antes do gateway checar.
                            channelHint: 'cloud',
                            origin: 'central-inbound',
                            botStep: outcome.bot_step ?? null,
                        }).catch(err =>
                            console.warn('[cloud-webhook] envio da resposta falhou:', err instanceof Error ? err.message : err),
                        )
                    }
                }

                // Recibos de entrega — atualiza o status do outbound pelo wamid.
                for (const st of value.statuses ?? []) {
                    if (!st.id || !st.status) continue
                    const failed = st.status === 'failed'
                    await supabase
                        .from('whatsapp_messages')
                        .update({
                            status: failed ? 'failed' : st.status,
                            ...(failed && st.errors?.[0]
                                ? { error_msg: [st.errors[0].title, st.errors[0].message].filter(Boolean).join(' — ') }
                                : {}),
                        })
                        .eq('direction', 'outbound')
                        .eq('reason', st.id)
                }
            }
        }
    } catch (err) {
        console.error('[cloud-webhook] erro ao processar evento:', err instanceof Error ? err.message : err)
    }

    return NextResponse.json({ received: true })
}
