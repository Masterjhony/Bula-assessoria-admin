/**
 * /api/cron/agente-rotinas — executor das rotinas recorrentes do agente
 * WhatsApp (a cada 15min via Vercel cron).
 *
 * Uma rotina "devida" (horário BRT já passou hoje, frequência casa com o dia,
 * ainda não rodou hoje) vira uma execução do agente COMO SE o dono tivesse
 * mandado a instrução — mesma allowlist, mesmo papel, mesma entrega. O
 * messageId determinístico (rotina:<id>:<dia>) faz o dedup natural: mesmo
 * que o cron sobreponha, a rotina não roda duas vezes no dia.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadAgenteConfigCached, agenteNumeroAutorizado } from '@/lib/whatsapp-agente-config'
import { handleAgenteMessage } from '@/lib/whatsapp-agente'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const MAX_POR_CICLO = 3

function agoraSP(): { hhmm: string; diaSemana: number; diaMes: number; dataISO: string } {
    const agora = new Date()
    const sp = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    const hh = String(sp.getHours()).padStart(2, '0')
    const mm = String(sp.getMinutes()).padStart(2, '0')
    return {
        hhmm: `${hh}:${mm}`,
        diaSemana: sp.getDay(),
        diaMes: sp.getDate(),
        dataISO: `${sp.getFullYear()}-${String(sp.getMonth() + 1).padStart(2, '0')}-${String(sp.getDate()).padStart(2, '0')}`,
    }
}

function frequenciaCasaHoje(freq: string, diaSemana: number, diaMes: number): boolean {
    if (freq === 'diaria') return true
    if (freq === 'dias_uteis') return diaSemana >= 1 && diaSemana <= 5
    const semanal = freq.match(/^semanal:([0-6])$/)
    if (semanal) return diaSemana === Number(semanal[1])
    const mensal = freq.match(/^mensal:(\d{1,2})$/)
    if (mensal) return diaMes === Number(mensal[1])
    return false
}

export async function GET(req: NextRequest) {
    const CRON_SECRET = process.env.CRON_SECRET || ''
    const auth = req.headers.get('authorization') || ''
    const ua = req.headers.get('user-agent') || ''
    const ok = (CRON_SECRET && auth === `Bearer ${CRON_SECRET}`) || (!CRON_SECRET && /vercel-cron/i.test(ua))
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const cfg = await loadAgenteConfigCached(supabase)
    if (!cfg.enabled) return NextResponse.json({ skipped: 'agente_desligado' })

    const { hhmm, diaSemana, diaMes, dataISO } = agoraSP()
    const { data: rotinas } = await supabase
        .from('agente_rotinas')
        .select('*')
        .eq('ativo', true)
        .lte('horario', hhmm)
        .order('horario')

    const executadas: string[] = []
    for (const r of (rotinas ?? []) as Array<{
        id: string; phone: string; chat_jid: string | null; solicitante: string | null
        instrucao: string; horario: string; frequencia: string; last_run_at: string | null
    }>) {
        if (executadas.length >= MAX_POR_CICLO) break
        if (!frequenciaCasaHoje(r.frequencia, diaSemana, diaMes)) continue
        // já rodou hoje (data em SP)?
        if (r.last_run_at) {
            const ultima = new Date(r.last_run_at).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
            if (ultima === dataISO) continue
        }
        const membro = agenteNumeroAutorizado(cfg, r.phone)
        if (!membro) continue // dono saiu da allowlist → rotina fica muda (não vaza)

        // claim otimista antes de executar (cron pode sobrepor)
        const { data: claimed } = await supabase
            .from('agente_rotinas')
            .update({ last_run_at: new Date().toISOString() })
            .eq('id', r.id)
            .eq('ativo', true)
            .or(`last_run_at.is.null,last_run_at.lt.${dataISO}T00:00:00-03:00`)
            .select('id')
        if (!claimed?.length) continue

        await handleAgenteMessage(supabase, {
            phone: r.phone,
            nome: membro.nome,
            role: membro.role,
            assessor: membro.assessor ?? null,
            text: `[rotina agendada ${r.horario}] ${r.instrucao}`,
            messageId: `rotina:${r.id}:${dataISO}`,
            session: cfg.session,
            origem: r.chat_jid ? { kind: 'grupo', groupJid: r.chat_jid } : { kind: 'dm' },
            config: { ...cfg, thinkingSeconds: 0 }, // sem debounce em rotina
        }).catch(err => console.warn('[rotinas]', r.id, err))
        executadas.push(r.id)
    }

    return NextResponse.json({ hhmm, executadas: executadas.length })
}
