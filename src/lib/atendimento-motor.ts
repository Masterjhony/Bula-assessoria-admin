/**
 * MOTOR DE ATENDIMENTO — planejamento e execução do dia.
 *
 * Duas funções, duas responsabilidades:
 *
 *   planejarDia()  varre a base inteira, roda a ontologia em cada lead, aplica
 *                  as cotas e grava a fila do dia em `crm_toques` (status
 *                  'planejado'). Roda UMA vez por dia, de manhã.
 *
 *   executarLote() pega os próximos da fila e manda pelo gateway. Roda de meia
 *                  em meia hora dentro do horário comercial, em levas pequenas —
 *                  250 mensagens saindo de uma vez é padrão de robô e derruba a
 *                  qualidade do número; espalhadas no dia, é atendimento.
 *
 * Separar as duas coisas é o que torna o sistema auditável: o plano existe em
 * disco ANTES de virar mensagem. Dá pra abrir o dia, ver quem vai ser chamado e
 * por quê, e cancelar o que não fizer sentido — sem correr atrás de mensagem já
 * enviada.
 *
 * ESCOPO: 1:1 pela API OFICIAL (Cloud). O gateway já barra atendimento no
 * Baileys por construção; aqui a gente nem oferece a opção.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from './whatsapp-central'
import { computeHabilitacaoChecklist, type HabilitacaoChecklist } from './crm-habilitacao'
import { computeSegmento, type Segmento } from './concierge-persona'
import { computeFase, extractPerfil } from './concierge-fase'
import { ieDispensadaParaLead } from './concierge-campanha'
import { sendOutbound } from './whatsapp-gateway'
import {
    decidirToque,
    COTA_DE,
    type Cota,
    type Decisao,
    type LeadOntologia,
    type PlayId,
    type ToqueHistorico,
} from './atendimento-ontologia'
import { montarMensagem, type LeilaoResumo } from './atendimento-plays'

// ── Configuração ────────────────────────────────────────────────────────────

export const MOTOR_SETTINGS_KEY = 'crm_atendimento_motor'

export interface MotorConfig {
    enabled: boolean
    /** Planeja e grava, mas não envia. Serve pra conferir a régua sem risco. */
    dry_run: boolean
    cap_inicial: number
    cap_maximo: number
    cap_passo: number
    quality_min: 'GREEN' | 'YELLOW' | 'RED'
    cotas: Record<Cota, number>
}

const CONFIG_PADRAO: MotorConfig = {
    enabled: true,
    dry_run: false,
    cap_inicial: 80,
    cap_maximo: 250,
    cap_passo: 40,
    quality_min: 'YELLOW',
    cotas: {
        resgate: 999,
        habilitacao: 60,
        retomada: 60,
        primeiro_contato: 80,
        reengajamento: 40,
        agenda: 30,
    },
}

export async function loadMotorConfig(supabase: SupabaseClient): Promise<MotorConfig> {
    const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', MOTOR_SETTINGS_KEY)
        .maybeSingle()
    const v = (data?.value ?? {}) as Partial<MotorConfig>
    return {
        ...CONFIG_PADRAO,
        ...v,
        cotas: { ...CONFIG_PADRAO.cotas, ...(v.cotas ?? {}) },
    }
}

// ── Fuso ────────────────────────────────────────────────────────────────────

/**
 * O dia do plano é o dia de Mato Grosso do Sul (UTC−4, sem horário de verão) —
 * é lá que o negócio opera. Usar UTC faria o plano "virar" às 21h locais, no
 * meio do expediente.
 */
export function diaLocal(agora: Date): string {
    const local = new Date(agora.getTime() - 4 * 3_600_000)
    return local.toISOString().slice(0, 10)
}

// ── Carga de dados ──────────────────────────────────────────────────────────

/** Colunas de crm_leads que a ontologia e os plays consomem. */
const LEAD_COLS = [
    'id', 'nome', 'telefone', 'celular', 'email', 'cpf',
    'inscricao_estadual', 'tem_inscricao_estadual',
    'optout_whatsapp', 'handoff_humano', 'arquivado', 'stage', 'temperatura',
    'is_mql', 'quantidade_animais', 'momento_pecuaria',
    'interesse', 'interesse_principal', 'o_que_busca',
    'campaign', 'source', 'medium', 'extra_data',
].join(', ')

type LeadRow = LeadOntologia & {
    email?: string | null
    cpf?: string | null
    inscricao_estadual?: string | null
    momento_pecuaria?: string | null
    interesse?: string | null
    interesse_principal?: string | null
    o_que_busca?: string | null
    campaign?: string | null
}

/**
 * PostgREST corta qualquer `.limit()` em 1000 linhas. Com 16 mil leads, ler sem
 * paginar dá silenciosamente 1/16 da base — e o motor acharia que só existem
 * mil produtores. Paginação explícita por `.range()`, sempre.
 */
async function carregarTodosLeads(supabase: SupabaseClient): Promise<LeadRow[]> {
    const PAGINA = 1000
    const out: LeadRow[] = []
    for (let offset = 0; ; offset += PAGINA) {
        const { data, error } = await supabase
            .from('crm_leads')
            .select(LEAD_COLS)
            .order('id', { ascending: true })
            .range(offset, offset + PAGINA - 1)
        if (error) throw new Error(`carregarTodosLeads: ${error.message}`)
        const lote = (data ?? []) as unknown as LeadRow[]
        out.push(...lote)
        if (lote.length < PAGINA) break
    }
    return out
}

interface EstadoRow {
    lead_id: string
    ultimo_inbound: string | null
    ultimo_outbound: string | null
    total_inbound: number
    total_outbound: number
}

async function carregarEstadoConversas(supabase: SupabaseClient): Promise<Map<string, EstadoRow>> {
    const map = new Map<string, EstadoRow>()
    const { data, error } = await supabase.rpc('crm_atendimento_estado')
    if (error) throw new Error(`crm_atendimento_estado: ${error.message}`)
    for (const row of (data ?? []) as EstadoRow[]) map.set(row.lead_id, row)
    return map
}

/** Documentos reais por lead (o checklist só conta arquivo que existe). */
async function carregarDocs(supabase: SupabaseClient): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>()
    const { data } = await supabase.from('crm_lead_documentos').select('lead_id, tipo')
    for (const d of (data ?? []) as Array<{ lead_id: string; tipo: string | null }>) {
        const arr = map.get(d.lead_id) ?? []
        arr.push(String(d.tipo || 'outro'))
        map.set(d.lead_id, arr)
    }
    return map
}

/** Histórico de toques por lead (só os que saíram de fato). */
async function carregarToques(supabase: SupabaseClient): Promise<Map<string, ToqueHistorico[]>> {
    const PAGINA = 1000
    const map = new Map<string, ToqueHistorico[]>()
    for (let offset = 0; ; offset += PAGINA) {
        const { data, error } = await supabase
            .from('crm_toques')
            .select('lead_id, play, sent_at, respondeu_at')
            .eq('status', 'enviado')
            .not('sent_at', 'is', null)
            .order('sent_at', { ascending: false })
            .range(offset, offset + PAGINA - 1)
        if (error) throw new Error(`carregarToques: ${error.message}`)
        const lote = (data ?? []) as Array<{ lead_id: string | null; play: string; sent_at: string; respondeu_at: string | null }>
        for (const t of lote) {
            if (!t.lead_id) continue
            const arr = map.get(t.lead_id) ?? []
            arr.push({ play: t.play as PlayId, sentAt: t.sent_at, respondeu: !!t.respondeu_at })
            map.set(t.lead_id, arr)
        }
        if (lote.length < PAGINA) break
    }
    return map
}

/** Próximos leilões — matéria-prima das variáveis de agenda/novidade. */
async function carregarAgenda(supabase: SupabaseClient, agora: Date): Promise<LeilaoResumo[]> {
    const hoje = diaLocal(agora)
    const { data } = await supabase
        .from('bula_leiloes')
        .select('nome, data, tipo, leiloeira')
        .gte('data', hoje)
        .order('data', { ascending: true })
        .limit(8)
    return ((data ?? []) as Array<{ nome: string | null; data: string; tipo: string | null; leiloeira: string | null }>)
        .filter(l => l.nome)
        .map(l => ({ nome: String(l.nome), data: l.data, tipo: l.tipo, leiloeira: l.leiloeira }))
}

// ── Rampa de aquecimento ────────────────────────────────────────────────────

/**
 * Teto do dia. Não é o cap final desde o primeiro dia: um número que passou dias
 * calado e de repente dispara 250 templates é exatamente o padrão que a Meta lê
 * como spam. A rampa sobe `cap_passo` por dia de operação — e só conta dia em
 * que houve envio, então uma pausa não "adianta" a rampa.
 */
export function capDoDia(config: MotorConfig, diasComEnvio: number): number {
    return Math.min(config.cap_maximo, config.cap_inicial + diasComEnvio * config.cap_passo)
}

async function diasComEnvio(supabase: SupabaseClient): Promise<number> {
    const { data } = await supabase
        .from('crm_toques')
        .select('planned_for')
        .eq('status', 'enviado')
        .order('planned_for', { ascending: false })
        .limit(1000)
    const dias = new Set((data ?? []).map(r => String((r as { planned_for: string }).planned_for)))
    return dias.size
}

// ── Planejamento ────────────────────────────────────────────────────────────

export interface ToquePlanejado {
    lead_id: string
    telefone: string
    play: PlayId
    motivo: string
    prioridade: number
    fase: string
    segmento: Segmento
    template: string | null
    template_params: string[]
    corpo: string
    bot_step: string
    janela_aberta: boolean
}

export interface ResumoPlano {
    dia: string
    avaliados: number
    elegiveis: number
    planejados: number
    cap: number
    porPlay: Record<string, number>
    porCota: Record<string, number>
    bloqueios: Record<string, number>
}

/**
 * Monta a fila do dia. Não envia nada e não grava nada — devolve o plano pra
 * quem chamou decidir (o cron grava; o preview só imprime).
 */
export async function montarPlano(
    supabase: SupabaseClient,
    opts: { agora?: Date } = {},
): Promise<{ plano: ToquePlanejado[]; resumo: ResumoPlano }> {
    const agora = opts.agora ?? new Date()
    const dia = diaLocal(agora)
    const config = await loadMotorConfig(supabase)

    const [leads, estados, docs, toques, agenda, diasEnvio] = await Promise.all([
        carregarTodosLeads(supabase),
        carregarEstadoConversas(supabase),
        carregarDocs(supabase),
        carregarToques(supabase),
        carregarAgenda(supabase, agora),
        diasComEnvio(supabase),
    ])

    const cap = capDoDia(config, diasEnvio)
    const bloqueios: Record<string, number> = {}
    const candidatos: Array<{ toque: ToquePlanejado; decisao: Decisao }> = []

    for (const lead of leads) {
        const estado = estados.get(lead.id)
        const docTipos = docs.get(lead.id) ?? []

        const checklist: HabilitacaoChecklist = computeHabilitacaoChecklist({
            nome: lead.nome,
            cpf: lead.cpf,
            telefone: lead.telefone,
            celular: lead.celular,
            email: lead.email,
            inscricao_estadual: lead.inscricao_estadual,
            tem_inscricao_estadual: lead.tem_inscricao_estadual,
            extra_data: lead.extra_data,
            docsCount: docTipos.length,
            docTipos,
            ieDispensadaPara: ieDispensadaParaLead(lead as Parameters<typeof ieDispensadaParaLead>[0]),
        })

        const segmento = computeSegmento(lead)
        const perfil = extractPerfil(lead)
        const xdata = (lead.extra_data ?? {}) as Record<string, unknown>
        const fase = computeFase({
            perfil,
            segmento,
            assessoriaApresentada: !!xdata.assessoria_apresentada_at,
            aceitouAssessoria: xdata.aceitou_assessoria === true,
            checklistComplete: checklist.complete,
            turnosLead: estado?.total_inbound ?? 0,
        }).fase

        const decisao = decidirToque({
            lead,
            conversa: {
                ultimoInboundAt: estado?.ultimo_inbound ?? null,
                ultimoOutboundAt: estado?.ultimo_outbound ?? null,
                totalInbound: estado?.total_inbound ?? 0,
                totalOutbound: estado?.total_outbound ?? 0,
            },
            checklist,
            fase,
            segmento,
            toques: toques.get(lead.id) ?? [],
            agora,
        })

        if (!decisao.play) {
            const k = decisao.bloqueio ?? 'desconhecido'
            bloqueios[k] = (bloqueios[k] ?? 0) + 1
            continue
        }

        const telefone = normalizePhone(lead.celular || lead.telefone || '')
        if (!telefone) {
            bloqueios.telefone_invalido = (bloqueios.telefone_invalido ?? 0) + 1
            continue
        }

        const tentativa = (toques.get(lead.id) ?? []).filter(t => t.play === decisao.play).length + 1
        const msg = montarMensagem(decisao.play, { lead, checklist, segmento, agenda, agora }, {
            janelaAberta: decisao.janelaAberta,
            tentativa,
        })

        candidatos.push({
            decisao,
            toque: {
                lead_id: lead.id,
                telefone,
                play: decisao.play,
                motivo: decisao.motivo,
                prioridade: decisao.prioridade,
                fase,
                segmento,
                template: msg.templateName,
                template_params: msg.templateParams,
                corpo: msg.texto,
                bot_step: msg.botStep,
                janela_aberta: decisao.janelaAberta,
            },
        })
    }

    // Ordena por prioridade e corta pelas cotas. A cota é por BALDE, não por
    // play: senão o dia inteiro viraria "primeiro contato" (é o balde com mais
    // gente disponível) e quem está no meio do cadastro nunca seria chamado.
    candidatos.sort((a, b) => b.toque.prioridade - a.toque.prioridade)

    const usadoPorCota: Record<string, number> = {}
    const plano: ToquePlanejado[] = []
    const porPlay: Record<string, number> = {}

    for (const c of candidatos) {
        if (plano.length >= cap) break
        const cota = COTA_DE[c.toque.play]
        const teto = config.cotas[cota] ?? 0
        const usado = usadoPorCota[cota] ?? 0
        if (usado >= teto) continue
        usadoPorCota[cota] = usado + 1
        porPlay[c.toque.play] = (porPlay[c.toque.play] ?? 0) + 1
        plano.push(c.toque)
    }

    return {
        plano,
        resumo: {
            dia,
            avaliados: leads.length,
            elegiveis: candidatos.length,
            planejados: plano.length,
            cap,
            porPlay,
            porCota: usadoPorCota,
            bloqueios,
        },
    }
}

/**
 * Grava o plano. Idempotente pelo índice único (lead_id, planned_for): rodar o
 * planejador duas vezes no mesmo dia não duplica toque — o segundo insert
 * simplesmente ignora quem já está na fila.
 */
export async function gravarPlano(
    supabase: SupabaseClient,
    plano: ToquePlanejado[],
    dia: string,
): Promise<number> {
    if (plano.length === 0) return 0
    let gravados = 0
    const LOTE = 200
    for (let i = 0; i < plano.length; i += LOTE) {
        const linhas = plano.slice(i, i + LOTE).map(t => ({
            lead_id: t.lead_id,
            telefone: t.telefone,
            play: t.play,
            motivo: t.motivo,
            prioridade: t.prioridade,
            fase: t.fase,
            segmento: t.segmento,
            canal: 'cloud',
            template: t.template,
            template_params: t.template_params,
            corpo: t.corpo,
            planned_for: dia,
            status: 'planejado',
        }))
        const { data, error } = await supabase
            .from('crm_toques')
            .upsert(linhas, { onConflict: 'lead_id,planned_for', ignoreDuplicates: true })
            .select('id')
        if (error) {
            console.warn('[motor] gravarPlano falhou num lote:', error.message)
            continue
        }
        gravados += (data ?? []).length
    }
    return gravados
}

// ── Execução ────────────────────────────────────────────────────────────────

export interface ResultadoLote {
    processados: number
    enviados: number
    retidos: number
    bloqueados: number
    falhas: number
    detalhes: Array<{ telefone: string; play: string; status: string; reason?: string }>
}

/**
 * Envia os próximos `limite` toques planejados do dia.
 *
 * Cada envio passa pelo gateway, que aplica opt-out, horário comercial, cap
 * diário do canal e dedup — o motor não reimplementa nenhuma dessas travas, e
 * é de propósito: guard rail duplicado é guard rail que diverge.
 */
export async function executarLote(
    supabase: SupabaseClient,
    opts: { limite?: number; agora?: Date } = {},
): Promise<ResultadoLote> {
    const agora = opts.agora ?? new Date()
    const limite = opts.limite ?? 25
    const dia = diaLocal(agora)
    const config = await loadMotorConfig(supabase)

    const res: ResultadoLote = { processados: 0, enviados: 0, retidos: 0, bloqueados: 0, falhas: 0, detalhes: [] }
    if (!config.enabled) return res

    const { data } = await supabase
        .from('crm_toques')
        .select('id, lead_id, telefone, play, template, template_params, corpo, motivo')
        .eq('planned_for', dia)
        .eq('status', 'planejado')
        .order('prioridade', { ascending: false })
        .limit(limite)

    const fila = (data ?? []) as Array<{
        id: string
        lead_id: string | null
        telefone: string
        play: string
        template: string | null
        template_params: string[] | null
        corpo: string | null
        motivo: string | null
    }>

    for (const t of fila) {
        res.processados++

        // Modo de teste NÃO consome a fila: só relata o que sairia. Se marcasse
        // a linha, o índice único (lead_id, planned_for) impediria replanejar o
        // lead hoje — e ao desligar o teste o dia amanheceria vazio, dando a
        // impressão de que o motor não faz nada. O erro clássico do dry-run.
        if (config.dry_run) {
            res.retidos++
            res.detalhes.push({ telefone: t.telefone, play: t.play, status: 'simulado', reason: 'dry_run' })
            continue
        }

        // Lock otimista: só processa se AINDA está planejado. Se dois ciclos do
        // cron se sobrepuserem (execução lenta), o segundo não reenvia.
        const { data: travado } = await supabase
            .from('crm_toques')
            .update({ status: 'enviando' })
            .eq('id', t.id)
            .eq('status', 'planejado')
            .select('id')
            .maybeSingle()
        if (!travado) continue

        const r = await sendOutbound(supabase, {
            to: { phone: t.telefone, leadId: t.lead_id, name: null },
            text: t.corpo,
            templateName: t.template,
            templateParams: t.template_params,
            // 'campaign' é o intent certo: iniciativa nossa, sujeita a horário
            // comercial, cap diário e dedup. 'crm_reply' pularia essas travas.
            intent: 'campaign',
            channelHint: 'cloud',
            inboxId: 'cloud',
            origin: 'motor-atendimento',
            botStep: t.play,
        })

        // Retenção TRANSITÓRIA volta pra fila: bater as 20h no meio do lote, ou
        // estourar o cap do canal, não é motivo pra descartar o toque — é motivo
        // pra tentar no próximo ciclo (ou amanhã). Sem isto, um lote iniciado às
        // 19h58 mataria 25 toques que só precisavam esperar.
        const TRANSITORIO = new Set(['outside_business_hours', 'daily_cap_reached', 'cloud_not_configured'])
        const reagendar = r.status === 'held' && TRANSITORIO.has(String(r.reason ?? ''))

        const status = r.status === 'sent' || r.status === 'queued' ? 'enviado'
            : reagendar ? 'planejado'
            : r.status === 'held' ? 'held'
            : r.status === 'blocked' ? 'blocked'
            : 'falhou'

        await supabase.from('crm_toques').update({
            status,
            reason: r.reason ?? null,
            message_id: r.messageId ?? null,
            sent_at: status === 'enviado' ? new Date().toISOString() : null,
        }).eq('id', t.id)

        // Nada mais vai sair neste ciclo se a porta está fechada pra todo mundo.
        if (reagendar) {
            res.retidos++
            res.detalhes.push({ telefone: t.telefone, play: t.play, status: 'reagendado', reason: r.reason })
            break
        }

        if (status === 'enviado') res.enviados++
        else if (status === 'held') res.retidos++
        else if (status === 'blocked') res.bloqueados++
        else res.falhas++

        res.detalhes.push({ telefone: t.telefone, play: t.play, status, reason: r.reason })

        // Espaçamento entre envios: uma rajada contínua é assinatura de robô.
        await new Promise(resolve => setTimeout(resolve, 1200 + Math.floor(Math.random() * 1800)))
    }

    return res
}

/**
 * Fecha o ciclo: marca `respondeu_at` nos toques cujo lead respondeu depois do
 * envio. É o número que diz se a régua está funcionando — sem isso o motor
 * dispara pra sempre sem saber se alguém do outro lado se mexeu.
 *
 * Roda junto com a execução (barato) e olha só a janela recente.
 */
export async function casarRespostas(
    supabase: SupabaseClient,
    opts: { desdeDias?: number } = {},
): Promise<number> {
    const desde = new Date(Date.now() - (opts.desdeDias ?? 7) * 86_400_000).toISOString()

    const { data: pendentes } = await supabase
        .from('crm_toques')
        .select('id, telefone, sent_at')
        .is('respondeu_at', null)
        .eq('status', 'enviado')
        .gte('sent_at', desde)
        .limit(1000)

    const lista = (pendentes ?? []) as Array<{ id: string; telefone: string; sent_at: string }>
    if (lista.length === 0) return 0

    // Um SELECT por toque seria 1000 idas ao banco. Carrega os inbounds da
    // janela de uma vez e casa em memória pelo telefone canônico.
    const { data: inbounds } = await supabase
        .from('whatsapp_messages')
        .select('phone, created_at')
        .eq('direction', 'inbound')
        .gte('created_at', desde)
        .not('phone', 'like', '%g.us')
        .order('created_at', { ascending: true })
        .limit(1000)

    const porFone = new Map<string, string[]>()
    for (const m of (inbounds ?? []) as Array<{ phone: string; created_at: string }>) {
        const k = canonico(m.phone)
        if (!k) continue
        const arr = porFone.get(k) ?? []
        arr.push(m.created_at)
        porFone.set(k, arr)
    }

    let marcados = 0
    for (const t of lista) {
        const k = canonico(t.telefone)
        if (!k) continue
        const resposta = (porFone.get(k) ?? []).find(at => at > t.sent_at)
        if (!resposta) continue
        await supabase.from('crm_toques').update({ respondeu_at: resposta }).eq('id', t.id)
        marcados++
    }
    return marcados
}

/** Mesma canonização do SQL (fone_canonico): DDD + 8 últimos dígitos. */
function canonico(p: string | null | undefined): string | null {
    let d = String(p ?? '').replace(/\D/g, '')
    if (!d) return null
    if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
    if (d.length >= 10) return d.slice(0, 2) + d.slice(-8)
    return d
}
