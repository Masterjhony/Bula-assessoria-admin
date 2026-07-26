/**
 * POST /api/mercado/coletar — roda o radar de mercado.
 *
 * Coleta a agenda pública das leiloeiras ativas, grava os eventos (idempotente
 * por fingerprint), casa com `cronograma_leiloes` e registra o custo de cada
 * fonte em `mercado_coletas`.
 *
 * Fonte em modo 'http' custa ZERO (o HTML já traz o conteúdo). Só o modo
 * 'apify' consome crédito — e a conta é free (US$5/mês), então o cron deve
 * rodar 1x/dia, não a cada hora.
 *
 * Auth: admin logado, OU Bearer CRON_SECRET, OU user-agent vercel-cron.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import {
    coletarFonte,
    salvarEventos,
    salvarMedias,
    casarComCronograma,
    type FonteRow,
} from '@/lib/mercado-leiloes'

export const maxDuration = 300

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function autorizado(req: NextRequest): Promise<boolean> {
    const auth = req.headers.get('authorization') || ''
    const ua = req.headers.get('user-agent') || ''
    if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true
    if (!process.env.CRON_SECRET && /vercel-cron/i.test(ua)) return true
    const admin = await requireAdmin()
    return admin.ok
}

async function run(dias: number) {
    const supabase = svc()

    const { data: fontesData, error } = await supabase
        .from('mercado_fontes')
        .select('id, leiloeira, slug, site_url, agenda_url, modo, parser, ativo')
        .eq('ativo', true)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const fontes = (fontesData ?? []) as FonteRow[]
    const resultados: Array<Record<string, unknown>> = []

    for (const fonte of fontes) {
        const r = await coletarFonte(fonte, dias)

        let novos = 0
        let atualizados = 0
        let medias = 0
        let erroSalvar: string | null = null
        if (!r.erro && r.eventos.length) {
            try {
                const s = await salvarEventos(supabase, fonte, r.eventos)
                novos = s.novos
                atualizados = s.atualizados
                // Médias dependem do evento já estar gravado (amarração por id).
                medias = await salvarMedias(supabase, fonte, r.eventos, r.medias)
            } catch (e) {
                erroSalvar = e instanceof Error ? e.message : String(e)
            }
        }

        const erro = r.erro ?? erroSalvar
        await supabase.from('mercado_coletas').insert({
            fonte_id: fonte.id,
            modo: fonte.modo,
            status: erro ? 'erro' : r.eventos.length ? 'ok' : 'parcial',
            paginas: r.paginas,
            eventos_novos: novos,
            eventos_vistos: atualizados,
            custo_usd: r.custoUsd,
            duracao_ms: r.duracaoMs,
            erro,
        })
        await supabase.from('mercado_fontes')
            .update({ ultima_coleta_at: new Date().toISOString() })
            .eq('id', fonte.id)

        resultados.push({
            leiloeira: fonte.leiloeira,
            modo: fonte.modo,
            paginas: r.paginas,
            eventos: r.eventos.length,
            novos,
            atualizados,
            medias,
            custo_usd: r.custoUsd,
            duracao_ms: r.duracaoMs,
            erro,
        })
    }

    // Só agora casa com o cronograma — depois que TODAS as fontes gravaram, para
    // o gap refletir o mercado inteiro e não o de uma leiloeira só.
    const match = await casarComCronograma(supabase)

    return NextResponse.json({ ok: true, fontes: resultados, match })
}

export async function POST(req: NextRequest) {
    if (!(await autorizado(req))) {
        return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
    }
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const dias = Math.max(1, Math.min(Number(body.dias ?? 30), 60))
    return run(dias)
}

/** GET = mesma coleta, para o cron da Vercel (que só faz GET). */
export async function GET(req: NextRequest) {
    if (!(await autorizado(req))) {
        return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
    }
    return run(30)
}
