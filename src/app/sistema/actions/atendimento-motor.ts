'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth-helpers'
import {
    loadMotorConfig,
    capDoDia,
    diaLocal,
    montarPlano,
    gravarPlano,
    executarLote,
    casarRespostas,
    MOTOR_SETTINGS_KEY,
    type MotorConfig,
} from '@/lib/atendimento-motor'
import { PLAY_LABEL, type PlayId } from '@/lib/atendimento-ontologia'

// ─────────────────────────────────────────────────────────────────────────────
// Leitura e controle do MOTOR DE ATENDIMENTO para /sistema/crm/atendimento.
//
// A pergunta que esta tela responde: "o que o sistema vai falar hoje, com quem,
// e por quê" — antes de falar. E, depois: "o que isso rendeu". Sem as duas
// metades, disparo automático vira caixa-preta e ninguém confia o suficiente
// pra deixar ligado.
// ─────────────────────────────────────────────────────────────────────────────

/** requireAdmin devolve resultado (nao lanca). Aqui a acao PRECISA abortar. */
async function exigirAdmin(): Promise<void> {
    const r = await requireAdmin()
    if (!r.ok) throw new Error(r.error ?? 'Sem permissao')
}

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export interface ToqueLinha {
    id: string
    telefone: string
    nome: string | null
    play: PlayId
    playLabel: string
    motivo: string | null
    prioridade: number
    fase: string | null
    template: string | null
    corpo: string | null
    status: string
    reason: string | null
    sentAt: string | null
    respondeuAt: string | null
}

export interface MetricaPlay {
    play: string
    playLabel: string
    enviados: number
    respostas: number
    taxa: number
}

export interface MotorPainel {
    config: MotorConfig
    dia: string
    capHoje: number
    /** Fila de hoje ainda não enviada. */
    planejados: ToqueLinha[]
    /** O que já saiu hoje. */
    enviadosHoje: ToqueLinha[]
    contagemHoje: Record<string, number>
    /** Desempenho dos últimos 30 dias, por play. */
    metricas: MetricaPlay[]
    totalEnviado30d: number
    totalRespostas30d: number
}

const COLS = 'id, telefone, play, motivo, prioridade, fase, template, corpo, status, reason, sent_at, respondeu_at, lead_id'

type Row = {
    id: string
    telefone: string
    play: string
    motivo: string | null
    prioridade: number
    fase: string | null
    template: string | null
    corpo: string | null
    status: string
    reason: string | null
    sent_at: string | null
    respondeu_at: string | null
    lead_id: string | null
}

function toLinha(r: Row, nomes: Map<string, string>): ToqueLinha {
    return {
        id: r.id,
        telefone: r.telefone,
        nome: r.lead_id ? nomes.get(r.lead_id) ?? null : null,
        play: r.play as PlayId,
        playLabel: PLAY_LABEL[r.play as PlayId] ?? r.play,
        motivo: r.motivo,
        prioridade: r.prioridade,
        fase: r.fase,
        template: r.template,
        corpo: r.corpo,
        status: r.status,
        reason: r.reason,
        sentAt: r.sent_at,
        respondeuAt: r.respondeu_at,
    }
}

export async function getMotorPainel(): Promise<MotorPainel> {
    const supabase = svc()
    const agora = new Date()
    const dia = diaLocal(agora)
    const config = await loadMotorConfig(supabase)

    const { data: hojeRaw } = await supabase
        .from('crm_toques')
        .select(COLS)
        .eq('planned_for', dia)
        .order('prioridade', { ascending: false })
        .limit(500)
    const hoje = (hojeRaw ?? []) as unknown as Row[]

    // Nome do lead pra tela — o telefone sozinho não diz nada pro time.
    const leadIds = [...new Set(hoje.map(r => r.lead_id).filter((x): x is string => !!x))]
    const nomes = new Map<string, string>()
    if (leadIds.length) {
        const { data } = await supabase.from('crm_leads').select('id, nome').in('id', leadIds)
        for (const l of (data ?? []) as Array<{ id: string; nome: string | null }>) {
            if (l.nome) nomes.set(l.id, l.nome)
        }
    }

    const contagemHoje: Record<string, number> = {}
    for (const r of hoje) contagemHoje[r.status] = (contagemHoje[r.status] ?? 0) + 1

    // Métricas de 30 dias. Paginado: PostgREST corta em 1000 e a régua de
    // 250/dia estoura isso em 4 dias de operação.
    const desde = new Date(agora.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
    const agg = new Map<string, { enviados: number; respostas: number }>()
    for (let offset = 0; ; offset += 1000) {
        const { data } = await supabase
            .from('crm_toques')
            .select('play, respondeu_at')
            .eq('status', 'enviado')
            .gte('planned_for', desde)
            .range(offset, offset + 999)
        const lote = (data ?? []) as Array<{ play: string; respondeu_at: string | null }>
        for (const t of lote) {
            const cur = agg.get(t.play) ?? { enviados: 0, respostas: 0 }
            cur.enviados++
            if (t.respondeu_at) cur.respostas++
            agg.set(t.play, cur)
        }
        if (lote.length < 1000) break
    }

    const metricas: MetricaPlay[] = [...agg.entries()]
        .map(([play, v]) => ({
            play,
            playLabel: PLAY_LABEL[play as PlayId] ?? play,
            enviados: v.enviados,
            respostas: v.respostas,
            taxa: v.enviados ? v.respostas / v.enviados : 0,
        }))
        .sort((a, b) => b.enviados - a.enviados)

    // Dias distintos com envio alimentam a rampa — mesmo cálculo do planejador.
    const { data: diasRaw } = await supabase
        .from('crm_toques').select('planned_for').eq('status', 'enviado').limit(1000)
    const diasComEnvio = new Set((diasRaw ?? []).map(r => String((r as { planned_for: string }).planned_for))).size

    return {
        config,
        dia,
        capHoje: capDoDia(config, diasComEnvio),
        planejados: hoje.filter(r => r.status === 'planejado').map(r => toLinha(r, nomes)),
        enviadosHoje: hoje.filter(r => r.status !== 'planejado').map(r => toLinha(r, nomes)),
        contagemHoje,
        metricas,
        totalEnviado30d: metricas.reduce((s, m) => s + m.enviados, 0),
        totalRespostas30d: metricas.reduce((s, m) => s + m.respostas, 0),
    }
}

/** Liga/desliga o motor. É o botão de pânico — vale mais que qualquer ajuste fino. */
export async function setMotorEnabled(enabled: boolean): Promise<void> {
    await exigirAdmin()
    const supabase = svc()
    const config = await loadMotorConfig(supabase)
    await supabase.from('site_settings').upsert(
        {
            key: MOTOR_SETTINGS_KEY,
            value: { ...config, enabled, pausado_por: enabled ? null : 'manual', pausado_at: enabled ? null : new Date().toISOString() },
        },
        { onConflict: 'key' },
    )
    revalidatePath('/sistema/crm/atendimento')
}

export async function setMotorDryRun(dryRun: boolean): Promise<void> {
    await exigirAdmin()
    const supabase = svc()
    const config = await loadMotorConfig(supabase)
    await supabase.from('site_settings').upsert(
        { key: MOTOR_SETTINGS_KEY, value: { ...config, dry_run: dryRun } },
        { onConflict: 'key' },
    )
    revalidatePath('/sistema/crm/atendimento')
}

/** Replaneja o dia sem esperar o cron (útil depois de mexer nas cotas). */
export async function replanejarHoje(): Promise<{ planejados: number; gravados: number }> {
    await exigirAdmin()
    const supabase = svc()
    const { plano, resumo } = await montarPlano(supabase)
    const gravados = await gravarPlano(supabase, plano, resumo.dia)
    revalidatePath('/sistema/crm/atendimento')
    return { planejados: resumo.planejados, gravados }
}

/** Dispara um lote agora (o cron faz isso sozinho de 30 em 30 min). */
export async function dispararLoteAgora(limite = 10): Promise<{ enviados: number; retidos: number; falhas: number }> {
    await exigirAdmin()
    const supabase = svc()
    const r = await executarLote(supabase, { limite })
    await casarRespostas(supabase)
    revalidatePath('/sistema/crm/atendimento')
    return { enviados: r.enviados, retidos: r.retidos, falhas: r.falhas }
}

/** Tira um toque da fila antes de ele sair. */
export async function cancelarToque(id: string): Promise<void> {
    await exigirAdmin()
    const supabase = svc()
    await supabase.from('crm_toques')
        .update({ status: 'cancelado', reason: 'cancelado no painel' })
        .eq('id', id)
        .eq('status', 'planejado')
    revalidatePath('/sistema/crm/atendimento')
}
