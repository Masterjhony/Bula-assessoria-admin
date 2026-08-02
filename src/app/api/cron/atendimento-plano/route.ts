/**
 * GET/POST /api/cron/atendimento-plano
 *
 * Planeja o dia do motor de atendimento: varre os ~16 mil leads, roda a
 * ontologia em cada um, aplica cotas e grava a fila em `crm_toques`. NÃO envia
 * nada — quem envia é /api/cron/atendimento-executa, de meia em meia hora.
 *
 * Roda uma vez por dia, cedo, antes da janela comercial abrir: assim o plano já
 * está pronto (e conferível) quando o primeiro lote sai.
 *
 * Antes de planejar, checa a saúde do número na Meta. Quality rating abaixo do
 * mínimo configurado = motor se auto-pausa e avisa. Um número marcado como RED
 * pode ser desligado pela Meta; continuar disparando nele é perder o canal.
 *
 * Auth: Bearer CRON_SECRET (Vercel injeta), user-agent vercel-cron, ou
 * x-cron-secret = SERVICE_ROLE_KEY (disparo manual).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
    montarPlano,
    gravarPlano,
    loadMotorConfig,
    diaLocal,
    MOTOR_SETTINGS_KEY,
} from '@/lib/atendimento-motor'
import { getWhatsappCloudConfig } from '@/lib/whatsapp-cloud-api'
import { isCentralPaused } from '@/lib/whatsapp-pause'

export const maxDuration = 300

function svc(): SupabaseClient {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function autorizado(req: NextRequest): boolean {
    const auth = req.headers.get('authorization') ?? ''
    const ua = req.headers.get('user-agent') ?? ''
    const manual = req.headers.get('x-cron-secret') ?? ''
    if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true
    if (ua.includes('vercel-cron')) return true
    if (manual && manual === process.env.SUPABASE_SERVICE_ROLE_KEY) return true
    return false
}

const ORDEM_QUALIDADE: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2, UNKNOWN: 2 }

/**
 * Saúde do número na Meta. Se a chamada falhar, devolve UNKNOWN e o motor
 * segue: indisponibilidade da Graph API não pode parar o atendimento do dia.
 */
async function qualityRating(): Promise<string> {
    const cfg = getWhatsappCloudConfig()
    if (!cfg.accessToken || !cfg.phoneNumberId) return 'UNKNOWN'
    try {
        const r = await fetch(
            `https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}?fields=quality_rating&access_token=${cfg.accessToken}`,
            { signal: AbortSignal.timeout(10_000) },
        )
        const j = await r.json() as { quality_rating?: string }
        return String(j.quality_rating ?? 'UNKNOWN').toUpperCase()
    } catch {
        return 'UNKNOWN'
    }
}

async function handler(req: NextRequest) {
    if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = svc()
    const agora = new Date()
    // Pausa global da Central manda no motor: nem planeja. Fila montada durante
    // a pausa sairia toda de uma vez no dia em que ela caísse.
    if (await isCentralPaused(supabase)) {
        return NextResponse.json({ ok: true, skipped: 'central_pausada', dia: diaLocal(agora) })
    }

    const config = await loadMotorConfig(supabase)

    if (!config.enabled) {
        return NextResponse.json({ ok: true, skipped: 'motor_desligado', dia: diaLocal(agora) })
    }

    // Trava de segurança do canal.
    const quality = await qualityRating()
    if (ORDEM_QUALIDADE[quality] < ORDEM_QUALIDADE[config.quality_min]) {
        await supabase.from('site_settings').upsert(
            {
                key: MOTOR_SETTINGS_KEY,
                value: { ...config, enabled: false, pausado_por: `quality_rating=${quality}`, pausado_at: agora.toISOString() },
            },
            { onConflict: 'key' },
        )
        return NextResponse.json({
            ok: false,
            pausado: true,
            motivo: `quality_rating do número caiu para ${quality} (mínimo ${config.quality_min}) — motor pausado`,
        }, { status: 200 })
    }

    const { plano, resumo } = await montarPlano(supabase, { agora })
    const gravados = await gravarPlano(supabase, plano, resumo.dia)

    return NextResponse.json({ ok: true, quality, gravados, ...resumo })
}

export async function GET(req: NextRequest) { return handler(req) }
export async function POST(req: NextRequest) { return handler(req) }
