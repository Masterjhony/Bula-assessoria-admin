/**
 * GET/POST /api/cron/catalogos-sweep
 *
 * Rede de segurança da identificação de catálogos.
 *
 * O webhook responde na hora e deixa a leitura do PDF para depois da resposta
 * (`after`). Isso é rápido para o VPS, mas tem um risco: se a função morrer no
 * meio — deploy, timeout, erro de rede ao baixar 24 MB — a detecção fica
 * parada em `analyzing` e ninguém percebe. Esta varredura pega as que
 * envelheceram nesse estado (e as que falharam) e reprocessa.
 *
 * Auth: Bearer CRON_SECRET (Vercel injeta), OU user-agent vercel-cron, OU
 * sessão admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { processarDeteccao } from '@/lib/catalog-pipeline'

export const maxDuration = 300

/** Só reprocessa o que está parado há mais que isso — evita corrida com o `after`. */
const IDADE_MINIMA_MS = 10 * 60_000

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function run(limit: number) {
    const sb = svc()
    const corte = new Date(Date.now() - IDADE_MINIMA_MS).toISOString()

    const { data: presas } = await sb
        .from('whatsapp_catalog_detections')
        .select('id, file_name, match_status')
        .in('match_status', ['analyzing', 'error'])
        .lt('received_at', corte)
        .order('received_at', { ascending: false })
        .limit(limit)

    const resultados: Array<{ id: string; file_name: string; de: string; para: string }> = []
    for (const d of presas ?? []) {
        try {
            const r = await processarDeteccao(sb, d.id)
            resultados.push({ id: d.id, file_name: d.file_name, de: d.match_status, para: r.status })
        } catch (e) {
            resultados.push({
                id: d.id,
                file_name: d.file_name,
                de: d.match_status,
                para: `erro: ${e instanceof Error ? e.message : e}`,
            })
        }
    }

    return NextResponse.json({ ok: true, processadas: resultados.length, resultados })
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization') || ''
    const ua = req.headers.get('user-agent') || ''
    const cronSecretOk = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
    const cronUaOk = !process.env.CRON_SECRET && /vercel-cron/i.test(ua)
    const auth = await requireAdmin()
    if (!cronSecretOk && !cronUaOk && !auth.ok) {
        return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
    }
    return run(10)
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin()
    const secret = req.headers.get('x-cron-secret')
    const secretOk = !!secret && secret === process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!auth.ok && !secretOk) {
        return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
    }
    let body: { limit?: number } = {}
    try { body = await req.json() } catch { /* corpo opcional */ }
    return run(Math.min(Math.max(Number(body.limit) || 10, 1), 50))
}
