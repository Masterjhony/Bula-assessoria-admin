/**
 * GET /api/crm/habilitacao-sweep — varredura periódica da habilitação (cron).
 *
 * O concierge consulta e submete a cada MENSAGEM do lead — mas lead que manda o
 * CPF e some não gera turno nenhum, e ficava parado até alguém rodar script.
 * Esta rota fecha o ciclo sem humano, em DUAS frentes:
 *
 *   Fila A — leads com CPF válido e ficha ainda não submetida: roda o MESMO
 *   `sincronizarHabilitacao` do fluxo (consulta I.E./propriedade com os gates
 *   de custo — 1x/30 dias, falha não carimba — e posta a ficha nos grupos
 *   quando tem o essencial; sem doc com foto, vai só às leiloeiras flexíveis).
 *
 *   Fila B — leads SEM CPF que já CONVERSARAM no WhatsApp (inbound real): roda
 *   o telefone→CPF (Direct Data). Era o elo que faltava: a varredura antiga só
 *   olhava quem já tinha CPF, então o enriquecimento praticamente nunca rodava
 *   — 26 leads com CPF numa base de 15 mil. Quem ganha CPF aqui cascateia na
 *   mesma chamada para I.E. → propriedade → ficha.
 *
 * Custo controlado: orçamento por fila e por execução; leads de atividade mais
 * recente primeiro. Consulta repetida é barrada pelos gates internos (30 dias),
 * então rodar de hora em hora não gasta de novo quem já foi consultado. A fila
 * B ainda pré-filtra o que o gate do enriquecimento rejeitaria de graça (nome
 * com menos de 2 palavras, tentativa recente) para não desperdiçar orçamento.
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
    CRM_STAGE_REGISTRATION,
    normalizeCRMStatus,
} from '@/lib/crm-types'

export const maxDuration = 300

/** Fila A: leads com CPF — consulta I.E./propriedade + submissão da ficha. */
const LIMITE_COM_CPF = 25
/** Fila B: leads sem CPF que conversaram — telefone→CPF (Direct Data). */
const LIMITE_SEM_CPF = 15
/** Quantas mensagens inbound recentes olhar para achar quem conversou. */
const INBOUND_SCAN_MAX = 10_000

const ETAPAS_ATIVAS = new Set([
    CRM_STAGE_ENTRY, CRM_STAGE_CONNECTION, CRM_STAGE_QUALIFICATION,
    CRM_STAGE_INFO_CAPTURED, CRM_STAGE_REGISTRATION,
])

const cpfValido = (v: unknown) => String(v ?? '').replace(/\D/g, '').length === 11

/** Espelho do gate do enriquecimento: nome com <2 palavras nem tenta. */
function nomeElegivel(nome: unknown): boolean {
    return String(nome ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 2 && !['DE', 'DA', 'DO', 'DOS', 'DAS', 'E'].includes(t.toLowerCase()))
        .length >= 2
}

function enriquecimentoRecente(extra: Record<string, unknown> | null): boolean {
    const enr = (extra?.enriquecimento ?? null) as { consultedAt?: string; pending?: boolean } | null
    if (!enr?.consultedAt || enr.pending) return false
    const last = new Date(enr.consultedAt).getTime()
    return !Number.isNaN(last) && Date.now() - last < 30 * 86400000
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

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Quem já conversou de verdade: lead_id das mensagens INBOUND mais recentes.
    // É o critério da fila B — consulta paga só para quem demonstrou interesse
    // escrevendo, nunca para a base fria importada.
    const conversaram = new Set<string>()
    for (let off = 0; off < INBOUND_SCAN_MAX; off += 1000) {
        const { data, error } = await supabase
            .from('whatsapp_messages')
            .select('lead_id')
            .eq('direction', 'inbound')
            .not('lead_id', 'is', null)
            .order('created_at', { ascending: false })
            .range(off, off + 999)
        if (error) break
        for (const m of data ?? []) if (m.lead_id) conversaram.add(String(m.lead_id))
        if (!data || data.length < 1000) break
    }

    // Candidatos das duas filas, num único passeio paginado por crm_leads
    // (ordenado por atividade recente — lead "quente" resolve primeiro).
    const filaComCpf: Array<{ id: string; nome: string | null }> = []
    const filaSemCpf: Array<{ id: string; nome: string | null }> = []
    for (let off = 0; off < 20000 && (filaComCpf.length < 400 || filaSemCpf.length < 200); off += 1000) {
        const { data, error } = await supabase
            .from('crm_leads')
            .select('id, nome, cpf, status, optout_whatsapp, extra_data, updated_at')
            .eq('arquivado', false)
            .order('updated_at', { ascending: false })
            .range(off, off + 999)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        if (!data?.length) break
        for (const l of data) {
            if (l.optout_whatsapp) continue
            if (!ETAPAS_ATIVAS.has(normalizeCRMStatus(String(l.status ?? '')))) continue
            const xd = (l.extra_data ?? {}) as Record<string, unknown>
            if (xd.cadastro_submetido_at) continue
            if (cpfValido(l.cpf)) {
                filaComCpf.push({ id: l.id, nome: l.nome })
            } else if (
                conversaram.has(String(l.id))
                && nomeElegivel(l.nome)
                && !enriquecimentoRecente(xd as Record<string, unknown>)
            ) {
                filaSemCpf.push({ id: l.id, nome: l.nome })
            }
        }
        if (data.length < 1000) break
    }

    // Orçamento de TEMPO além do de quantidade: uma consulta nova de Sintegra
    // pode levar 2+ min (automação ao vivo no site da SEFAZ). Sem este corte, a
    // função estourava o maxDuration no meio de um lead; com ele, paramos limpo
    // e a próxima execução (hora seguinte) continua de onde parou — o carimbo
    // de 30 dias garante que ninguém é consultado duas vezes.
    const prazoFinal = Date.now() + 240_000
    const resultados: Array<{ fila: 'com_cpf' | 'sem_cpf'; nome: string | null; pronto: boolean; submetido: boolean; motivo?: string }> = []
    let consultados = 0, submetidos = 0, semTempo = 0
    const processar = async (fila: 'com_cpf' | 'sem_cpf', c: { id: string; nome: string | null }) => {
        if (Date.now() > prazoFinal) { semTempo++; return }
        try {
            const r = await sincronizarHabilitacao(supabase, c.id)
            if (r.consultou) consultados++
            if (r.submetido) submetidos++
            resultados.push({ fila, nome: c.nome, pronto: r.pronto, submetido: r.submetido, motivo: r.motivo })
        } catch (e) {
            resultados.push({ fila, nome: c.nome, pronto: false, submetido: false, motivo: e instanceof Error ? e.message : 'erro' })
        }
    }
    for (const c of filaComCpf.slice(0, LIMITE_COM_CPF)) await processar('com_cpf', c)
    for (const c of filaSemCpf.slice(0, LIMITE_SEM_CPF)) await processar('sem_cpf', c)

    return NextResponse.json({
        ok: true,
        candidatos: { com_cpf: filaComCpf.length, sem_cpf: filaSemCpf.length },
        processados: resultados.length,
        adiados_sem_tempo: semTempo,
        consultados,
        fichas_submetidas: submetidos,
        resultados,
    })
}
