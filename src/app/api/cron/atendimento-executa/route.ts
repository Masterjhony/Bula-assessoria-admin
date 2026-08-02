/**
 * GET/POST /api/cron/atendimento-executa
 *
 * Tira da fila do dia (`crm_toques` status 'planejado') e manda, em levas
 * pequenas, dentro do horário comercial. Roda de meia em meia hora: 25 por
 * ciclo × ~24 ciclos cobre o cap de 250 com folga e distribui as mensagens ao
 * longo do dia, que é o que separa "atendimento" de "robô disparando lista".
 *
 * Não decide nada: o QUEM e o PORQUÊ já foram resolvidos pelo planejador. Aqui
 * só se entrega — e se registra o que aconteceu com cada tentativa.
 *
 * Também fecha o ciclo de aprendizado: marca `respondeu_at` de quem respondeu a
 * um toque anterior. É essa coluna que vira taxa de resposta por play no painel.
 *
 * As travas de envio (opt-out, horário, cap do canal, dedup) vivem no gateway —
 * esta rota não as reimplementa.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { executarLote, casarRespostas, loadMotorConfig, diaLocal } from '@/lib/atendimento-motor'
import { reprocessarHandoffsPendentes } from '@/lib/atendimento-handoff'
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

/** Quantos toques por ciclo. Pequeno de propósito — ver cabeçalho. */
const LOTE_PADRAO = 25

async function handler(req: NextRequest) {
    if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = svc()
    const agora = new Date()
    // Pausa global da Central: não entrega o lote nem casa respostas de toque.
    // A fila planejada continua de pé em `crm_toques` — nada é cancelado.
    if (await isCentralPaused(supabase)) {
        return NextResponse.json({ ok: true, skipped: 'central_pausada', dia: diaLocal(agora) })
    }

    const config = await loadMotorConfig(supabase)

    if (!config.enabled) {
        return NextResponse.json({ ok: true, skipped: 'motor_desligado', dia: diaLocal(agora) })
    }

    const limiteParam = Number(new URL(req.url).searchParams.get('limite'))
    const limite = Number.isFinite(limiteParam) && limiteParam > 0
        ? Math.min(limiteParam, 100)
        : LOTE_PADRAO

    const resultado = await executarLote(supabase, { limite, agora })
    const respostas = await casarRespostas(supabase)

    // Repasses que não chegaram ao assessor (número operacional fora do ar na
    // hora da resposta). O lead já ouviu "o assessor vai te chamar" — promessa
    // sem dono é a pior falha deste fluxo, então retenta todo ciclo.
    const pendentes = await reprocessarHandoffsPendentes(supabase)

    return NextResponse.json({
        ok: true,
        dia: diaLocal(agora),
        dry_run: config.dry_run,
        respostas_casadas: respostas,
        handoffs_pendentes: pendentes,
        ...resultado,
    })
}

export async function GET(req: NextRequest) { return handler(req) }
export async function POST(req: NextRequest) { return handler(req) }
