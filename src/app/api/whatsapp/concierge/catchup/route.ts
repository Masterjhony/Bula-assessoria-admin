/**
 * POST /api/whatsapp/concierge/catchup
 *
 * Atende o backlog: leads que escreveram, ainda estão DENTRO da janela de 24h
 * (dá pra responder texto livre pela API oficial) e ficaram SEM resposta (a
 * última mensagem é inbound). Roda o mesmo cérebro do concierge em cada um e
 * envia a próxima fala pelo gateway. Pula opt-out, handoff humano e quem já foi
 * respondido. NÃO aplica a janela de "pensar" (são casos já atrasados).
 *
 * Auth: sessão admin OU header `x-catchup-secret` = SUPABASE_SERVICE_ROLE_KEY
 * (para acionar via script/curl interno). Body: { limit?, dryRun? }.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { normalizePhone, phoneVariants, classifyMessage } from '@/lib/whatsapp-central'
import { findLeadByPhone } from '@/lib/whatsapp-inbound'
import { loadConciergeConfig, runConcierge } from '@/lib/whatsapp-concierge'
import { sendOutbound } from '@/lib/whatsapp-gateway'

export const maxDuration = 300

const WINDOW_MS = 24 * 3_600_000
// Não responde inbound "quente demais": o webhook ao vivo ainda pode estar
// processando essa mesma mensagem (janela de pensar + consultas + IA com
// fallbacks passam fácil de 90s). Com 90s o catchup CORREU com o webhook e o
// lead recebeu resposta dupla no mesmo minuto (Pedro/Elson, 09/07 23:10).
const MIN_AGE_MS = 240_000

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * GET → gatilho de cron (Vercel injeta `Authorization: Bearer <CRON_SECRET>`
 * quando a env CRON_SECRET existe). Roda o mesmo catchup com limites padrão.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization') || ''
    const ua = req.headers.get('user-agent') || ''
    // Aceita: (1) CRON_SECRET quando configurado (Vercel injeta o Bearer);
    // (2) fallback pelo user-agent do Vercel cron quando não há secret — o
    // endpoint só responde leads já em espera, então o risco é baixo; ou
    // (3) sessão admin (acionar manualmente pela UI).
    const cronSecretOk = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
    const cronUaOk = !process.env.CRON_SECRET && /vercel-cron/i.test(ua)
    const auth = await requireAdmin()
    if (!cronSecretOk && !cronUaOk && !auth.ok) {
        return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
    }
    // 15 por execução: com a IA levando 20-45s por lead, 50 estourava os 300s
    // e as execuções do cron se sobrepunham — origem das respostas duplicadas.
    return runCatchup({ limit: 15, dryRun: false })
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin()
    const secret = req.headers.get('x-catchup-secret')
    const secretOk = !!secret && secret === process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!auth.ok && !secretOk) {
        return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
    }

    let body: { limit?: number; dryRun?: boolean } = {}
    try { body = await req.json() } catch { /* corpo opcional */ }
    const limit = Math.min(Math.max(Number(body.limit) || 30, 1), 100)
    const dryRun = !!body.dryRun
    return runCatchup({ limit, dryRun })
}

/**
 * Trava de execução única (via site_settings): duas execuções simultâneas do
 * catchup geravam DUAS respostas da IA para o mesmo lead. O lock expira sozinho
 * em 4 min — se uma execução morrer, a próxima assume.
 */
const CATCHUP_LOCK_KEY = 'crm_concierge_catchup_lock'
const CATCHUP_LOCK_MS = 4 * 60_000

async function acquireLock(supabase: ReturnType<typeof svc>): Promise<boolean> {
    const { data } = await supabase.from('site_settings').select('value').eq('key', CATCHUP_LOCK_KEY).maybeSingle()
    const at = (data?.value as { at?: string } | null)?.at
    if (at && Date.now() - new Date(at).getTime() < CATCHUP_LOCK_MS) return false
    await supabase.from('site_settings').upsert(
        { key: CATCHUP_LOCK_KEY, value: { at: new Date().toISOString() }, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
    )
    return true
}

async function releaseLock(supabase: ReturnType<typeof svc>): Promise<void> {
    await supabase.from('site_settings').upsert(
        { key: CATCHUP_LOCK_KEY, value: { at: null }, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
    ).then(() => undefined, () => undefined)
}

/**
 * O bot acabou de responder este número? Entre eleger o candidato e a IA gerar
 * a resposta passam 20–60s — tempo de sobra para o webhook ao vivo responder
 * primeiro. Recheca no instante do envio; mais barato que uma mensagem dupla.
 */
async function botRespondeuAgora(supabase: ReturnType<typeof svc>, phone: string): Promise<boolean> {
    const variants = phoneVariants(phone)
    const { data } = await supabase
        .from('whatsapp_messages')
        .select('direction, origin, created_at')
        .in('phone', variants)
        .order('created_at', { ascending: false })
        .limit(2)
    const [m1, m2] = data ?? []
    if (!m1 || m1.direction !== 'outbound') return false
    // Resposta recente → outra execução/webhook acabou de falar.
    if (Date.now() - new Date(m1.created_at).getTime() < 3 * 60_000) return true
    // TRAVA DURA: o bot nunca emenda uma 3ª mensagem sem o lead responder.
    // Foi o que aconteceu com o Elson (6 mensagens em 10 min, execuções do
    // cron sobrepostas com snapshot velho da fila).
    return m2?.direction === 'outbound'
}

async function runCatchup({ limit, dryRun }: { limit: number; dryRun: boolean }) {
    const supabase = svc()

    const config = await loadConciergeConfig(supabase)
    if (!config.enabled) {
        return NextResponse.json({ error: 'concierge desligado — ligue no cockpit antes.' }, { status: 409 })
    }
    if (!dryRun && !(await acquireLock(supabase))) {
        return NextResponse.json({ ok: true, skipped: 'outra execução do catchup em andamento (lock ativo)' })
    }

    // Mensagens das últimas 24h (janela ativa), PAGINADAS. O PostgREST capa
    // qualquer resposta em 1000 linhas — o .limit(4000) antigo devolvia as 1000
    // mais ANTIGAS da janela, as respostas recentes do bot ficavam invisíveis e
    // o mesmo lead era reeleito a cada cron, para sempre (Pedro, 09/07: oito
    // mensagens iguais em 30 min). Regra da casa: matcher SEMPRE paginado.
    const since = new Date(Date.now() - WINDOW_MS).toISOString()
    const rows: Array<{ phone: string; direction: string; status: string | null; origin: string | null; body: string | null; created_at: string }> = []
    for (let off = 0; off < 12000; off += 1000) {
        const { data, error } = await supabase
            .from('whatsapp_messages')
            .select('phone, direction, status, origin, body, created_at')
            .gte('created_at', since)
            .order('created_at', { ascending: true })
            .range(off, off + 999)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        if (!data?.length) break
        rows.push(...(data as typeof rows))
        if (data.length < 1000) break
    }

    // Última mensagem por telefone (ordem asc → o último visto é o mais recente).
    const lastByPhone = new Map<string, { direction: string; status: string | null; origin: string | null; body: string | null; created_at: string }>()
    const lastInboundByPhone = new Map<string, { body: string | null; created_at: string }>()
    for (const r of rows) {
        const p = normalizePhone(r.phone || '')
        if (!p) continue
        const row = {
            direction: r.direction,
            status: r.status,
            origin: r.origin,
            body: r.body,
            created_at: r.created_at,
        }
        lastByPhone.set(p, row)
        if (r.direction === 'inbound') {
            lastInboundByPhone.set(p, { body: r.body, created_at: r.created_at })
        }
    }

    // Candidatos: a última mensagem é inbound (aguardando nossa resposta) e já
    // "esfriou" o suficiente (> MIN_AGE_MS) para não competir com o webhook ao vivo.
    // Se a última saída do bot falhou, continua elegível: outbound failed não
    // conta como resposta entregue.
    const nowMs = Date.now()
    const candidates = [...lastByPhone.entries()]
        .map(([phone, last]) => {
            const failedBotSend =
                last.direction === 'outbound' &&
                last.status === 'failed' &&
                (last.origin === 'central-inbound' || last.origin === 'concierge-catchup')
            const source = last.direction === 'inbound' ? last : (failedBotSend ? lastInboundByPhone.get(phone) : null)
            return source ? { phone, text: (source.body || '').trim(), at: source.created_at } : null
        })
        .filter((c): c is { phone: string; text: string; at: string } => !!c)
        .filter(c => nowMs - new Date(c.at).getTime() >= MIN_AGE_MS)

    const results: Array<{ phone: string; status: string; reason?: string }> = []
    let sent = 0, skipped = 0, errors = 0

    let processed = 0
    for (const cand of candidates) {
        if (processed >= limit) break
        processed++

        // Opt-out determinístico: nunca mexer com quem pediu pra sair.
        if (classifyMessage(cand.text).kind === 'optout') {
            results.push({ phone: cand.phone, status: 'skip', reason: 'optout_msg' }); skipped++; continue
        }

        const lead = await findLeadByPhone(supabase, cand.phone)
        if (!lead) { results.push({ phone: cand.phone, status: 'skip', reason: 'no_lead' }); skipped++; continue }
        if (lead.optout_whatsapp) { results.push({ phone: cand.phone, status: 'skip', reason: 'optout' }); skipped++; continue }
        if (lead.handoff_humano) { results.push({ phone: cand.phone, status: 'skip', reason: 'handoff' }); skipped++; continue }

        if (dryRun) { results.push({ phone: cand.phone, status: 'would_send' }); continue }

        try {
            const c = await runConcierge(supabase, {
                lead, phone: cand.phone, senderName: lead.nome ?? '', text: cand.text, media: null, config,
            })
            // A IA levou dezenas de segundos; o webhook pode ter respondido nesse
            // meio-tempo. Rechecar agora evita a mensagem dupla.
            if (await botRespondeuAgora(supabase, cand.phone)) {
                results.push({ phone: cand.phone, status: 'skip', reason: 'webhook_respondeu_durante_geracao' }); skipped++; continue
            }
            if (!c.handled) { results.push({ phone: cand.phone, status: 'skip', reason: `unhandled_${c.reason}` }); skipped++; continue }
            if (c.silent) { results.push({ phone: cand.phone, status: 'skip', reason: c.reason }); skipped++; continue }

            const r = await sendOutbound(supabase, {
                to: { phone: cand.phone, leadId: lead.id, name: lead.nome ?? null },
                text: c.reply,
                intent: 'crm_reply',
                channelHint: 'cloud',
                origin: 'concierge-catchup',
                botStep: c.botStep,
            })
            if (r.status === 'sent' || r.status === 'queued') {
                results.push({ phone: cand.phone, status: r.status }); sent++
            } else {
                results.push({ phone: cand.phone, status: 'fail', reason: r.reason }); errors++
            }
            // Automações caras só depois de a mensagem sair (mesma regra do webhook).
            await c.postEffects().catch(err =>
                console.warn('[catchup] efeitos pós-resposta falharam:', err instanceof Error ? err.message : err),
            )
        } catch (e) {
            results.push({ phone: cand.phone, status: 'error', reason: e instanceof Error ? e.message : 'erro' }); errors++
        }
    }

    if (!dryRun) await releaseLock(supabase)

    return NextResponse.json({
        ok: true,
        dryRun,
        window_hours: 24,
        candidates_total: candidates.length,
        processed,
        remaining: Math.max(0, candidates.length - processed),
        sent, skipped, errors,
        results,
    })
}
