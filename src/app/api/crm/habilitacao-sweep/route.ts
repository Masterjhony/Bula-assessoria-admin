/**
 * GET /api/crm/habilitacao-sweep — varredura periódica da habilitação (cron).
 *
 * O concierge consulta e submete a cada MENSAGEM do lead — mas lead que manda o
 * CPF e some não gera turno nenhum, e ficava parado até alguém rodar script.
 * Esta rota fecha o ciclo sem humano: para cada lead ativo com CPF válido e
 * ficha ainda não submetida, roda o MESMO `sincronizarHabilitacao` do fluxo
 * (consulta I.E./propriedade com os gates de custo de sempre — 1x/30 dias,
 * falha não carimba — e posta a ficha nos grupos quando tem o essencial).
 *
 * Custo controlado: no máximo LIMITE leads por execução, os de atividade mais
 * recente primeiro. Consulta repetida é barrada pelos gates internos, então
 * rodar de hora em hora não gasta de novo quem já foi consultado.
 *
 * Auth: cron da Vercel (CRON_SECRET) ou sessão admin — mesmo contrato do catchup.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { sincronizarHabilitacao } from '@/lib/crm-habilitacao-sync'
import {
    CRM_STAGE_ENTRY,
    CRM_STAGE_CONNECTION,
    CRM_STAGE_QUALIFICATION,
    CRM_STAGE_INFO_CAPTURED,
    normalizeCRMStatus,
} from '@/lib/crm-types'

export const maxDuration = 300

const LIMITE_POR_EXECUCAO = 25

const ETAPAS_ATIVAS = new Set([
    CRM_STAGE_ENTRY, CRM_STAGE_CONNECTION, CRM_STAGE_QUALIFICATION, CRM_STAGE_INFO_CAPTURED,
])

const cpfValido = (v: unknown) => String(v ?? '').replace(/\D/g, '').length === 11

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization') || ''
    const ua = req.headers.get('user-agent') || ''
    const cronSecretOk = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
    const cronUaOk = !process.env.CRON_SECRET && /vercel-cron/i.test(ua)
    const auth = await requireAdmin()
    if (!cronSecretOk && !cronUaOk && !auth.ok) {
        return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Candidatos: ativos, com CPF, sem ficha submetida. A ordenação por
    // atividade recente faz o lead "quente" ser resolvido primeiro.
    const candidatos: Array<{ id: string; nome: string | null }> = []
    for (let off = 0; off < 20000 && candidatos.length < 400; off += 1000) {
        const { data, error } = await supabase
            .from('crm_leads')
            .select('id, nome, cpf, status, optout_whatsapp, extra_data, updated_at')
            .eq('arquivado', false)
            .not('cpf', 'is', null)
            .order('updated_at', { ascending: false })
            .range(off, off + 999)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        if (!data?.length) break
        for (const l of data) {
            if (!cpfValido(l.cpf)) continue
            if (l.optout_whatsapp) continue
            if (!ETAPAS_ATIVAS.has(normalizeCRMStatus(String(l.status ?? '')))) continue
            const xd = (l.extra_data ?? {}) as Record<string, unknown>
            if (xd.cadastro_submetido_at) continue
            candidatos.push({ id: l.id, nome: l.nome })
        }
        if (data.length < 1000) break
    }

    const resultados: Array<{ nome: string | null; pronto: boolean; submetido: boolean; motivo?: string }> = []
    let consultados = 0, submetidos = 0
    for (const c of candidatos.slice(0, LIMITE_POR_EXECUCAO)) {
        try {
            const r = await sincronizarHabilitacao(supabase, c.id)
            if (r.consultou) consultados++
            if (r.submetido) submetidos++
            resultados.push({ nome: c.nome, pronto: r.pronto, submetido: r.submetido, motivo: r.motivo })
        } catch (e) {
            resultados.push({ nome: c.nome, pronto: false, submetido: false, motivo: e instanceof Error ? e.message : 'erro' })
        }
    }

    return NextResponse.json({
        ok: true,
        candidatos: candidatos.length,
        processados: Math.min(candidatos.length, LIMITE_POR_EXECUCAO),
        consultados,
        fichas_submetidas: submetidos,
        resultados,
    })
}
