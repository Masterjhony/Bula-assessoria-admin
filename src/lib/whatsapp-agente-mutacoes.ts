/**
 * Mutações que o agente interno pode executar — SEMPRE em duas etapas:
 * `propor_alteracao` registra a pendência com um resumo, e só o "sim" do
 * solicitante (não expirado) chama `executarPendencia` aqui.
 *
 * Tudo roda com service-role e é auditado em `erp_auditoria` via auditLog
 * (usuario_email = 'whatsapp:<phone>'). Fora do v1, de propósito: deletes,
 * fechamentos/lances e movimentos bancários.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabase'
import { auditLog } from './erp'
import { pushStageMove } from './crm-stage-rules'
import { normalizeCRMStatus } from './crm-types'
import type { AgenteRole } from './whatsapp-agente-config'

export interface MutacaoCtx {
    nome: string
    phone: string
    role: AgenteRole
    /** Nome do assessor em crm_leads.responsavel (papel assessor) — trava de propriedade. */
    assessor?: string | null
}

/**
 * Papel assessor só mexe nos PRÓPRIOS leads. A checagem é aqui no executor
 * (código), não no prompt: mesmo que o modelo proponha um lead alheio, a
 * execução recusa.
 */
async function exigirLeadDoAssessor(sb: SupabaseClient, leadId: string, ctx: MutacaoCtx): Promise<void> {
    if (ctx.role === 'admin') return
    const alvo = (ctx.assessor ?? '').trim().toLowerCase()
    if (!alvo) throw new Error('Seu número não tem assessor vinculado — fale com o João')
    const { data } = await sb.from('crm_leads').select('responsavel').eq('id', leadId).single()
    const resp = String(data?.responsavel ?? '').toLowerCase()
    if (!resp.includes(alvo)) throw new Error('Esse lead não é seu — só o responsável (ou o admin) pode alterar')
}

export interface MutacaoDef {
    descricao: string
    adminOnly?: boolean
    /** JSON Schema dos argumentos — vira o schema de `propor_alteracao` no prompt. */
    schema: Record<string, unknown>
    validate(args: Record<string, unknown>): { ok: true; clean: Record<string, unknown> } | { ok: false; error: string }
    execute(sb: SupabaseClient, clean: Record<string, unknown>, ctx: MutacaoCtx): Promise<{ resumo: string }>
}

const str = (v: unknown): string => String(v ?? '').trim()
const num = (v: unknown): number => Number(v)
const isIsoDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Colunas de crm_leads que o agente pode alterar (espelho conservador do updateLead). */
const LEAD_CAMPOS_PERMITIDOS = new Set([
    'nome', 'email', 'status', 'responsavel', 'notes', 'regiao', 'next_action_at',
    'quantidade_animais', 'tem_inscricao_estadual', 'inscricao_estadual',
])

async function atualizarLead(
    sb: SupabaseClient,
    leadId: string,
    campos: Record<string, unknown>,
    ctx: MutacaoCtx,
    motivo: string,
): Promise<{ resumo: string }> {
    await exigirLeadDoAssessor(sb, leadId, ctx)
    const { data: previous, error: fetchErr } = await sb
        .from('crm_leads')
        .select('nome, status, extra_data')
        .eq('id', leadId)
        .single()
    if (fetchErr || !previous) throw new Error(`Lead ${leadId} não encontrado`)

    const payload: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(campos)) {
        if (LEAD_CAMPOS_PERMITIDOS.has(k)) payload[k] = v
    }
    // Assessor não transfere lead: mudar `responsavel` é ação de admin.
    if (ctx.role !== 'admin' && 'responsavel' in payload) {
        throw new Error('Mudar o responsável de um lead é ação restrita ao admin')
    }
    if (Object.keys(payload).length === 0) throw new Error('Nenhum campo permitido no pedido')

    // Mudança de etapa entra na MESMA trilha stage_history da IA e do usuário.
    if (typeof payload.status === 'string') {
        const novo = normalizeCRMStatus(payload.status)
        payload.status = novo
        if (normalizeCRMStatus(previous.status) !== novo) {
            payload.extra_data = pushStageMove(previous.extra_data as Record<string, unknown> | null, {
                from: previous.status ?? '',
                to: novo,
                reason: motivo,
                by: 'ia',
            })
        }
    }

    const { error } = await sb.from('crm_leads').update(payload).eq('id', leadId)
    if (error) throw new Error(error.message)

    await auditLog('agente:crm_leads', 'update', { id: leadId, campos: payload }, { email: `whatsapp:${ctx.phone}` })
    const alterados = Object.keys(payload).filter(k => k !== 'extra_data').join(', ')
    return { resumo: `Lead *${previous.nome ?? leadId}* atualizado (${alterados}).` }
}

export const MUTACOES: Record<string, MutacaoDef> = {
    crm_atualizar_lead: {
        descricao: 'Altera campos de um lead do CRM (nome, email, status/etapa, responsavel, notes, regiao, next_action_at, quantidade_animais, inscricao_estadual).',
        schema: {
            type: 'object',
            properties: {
                lead_id: { type: 'string', description: 'UUID do lead (busque antes com query_table)' },
                campos: { type: 'object', description: 'Só os campos a alterar, ex.: {"status":"CONEXAO","responsavel":"Douglas"}' },
            },
            required: ['lead_id', 'campos'],
        },
        validate(args) {
            const leadId = str(args.lead_id)
            const campos = (args.campos ?? {}) as Record<string, unknown>
            if (!leadId) return { ok: false, error: 'lead_id obrigatório' }
            if (typeof campos !== 'object' || Array.isArray(campos)) return { ok: false, error: 'campos deve ser objeto' }
            const invalidos = Object.keys(campos).filter(k => !LEAD_CAMPOS_PERMITIDOS.has(k))
            if (invalidos.length) return { ok: false, error: `Campos não permitidos: ${invalidos.join(', ')}` }
            if (Object.keys(campos).length === 0) return { ok: false, error: 'campos vazio' }
            return { ok: true, clean: { lead_id: leadId, campos } }
        },
        async execute(sb, clean, ctx) {
            return atualizarLead(sb, clean.lead_id as string, clean.campos as Record<string, unknown>, ctx, 'pedido via agente WhatsApp')
        },
    },

    crm_mover_lead: {
        descricao: 'Move um lead de etapa no funil do CRM.',
        schema: {
            type: 'object',
            properties: {
                lead_id: { type: 'string' },
                novo_status: { type: 'string', description: 'Etapa destino, ex.: CONEXAO, QUALIFICADO, PERDIDOS' },
            },
            required: ['lead_id', 'novo_status'],
        },
        validate(args) {
            const leadId = str(args.lead_id)
            const novo = str(args.novo_status)
            if (!leadId || !novo) return { ok: false, error: 'lead_id e novo_status obrigatórios' }
            return { ok: true, clean: { lead_id: leadId, novo_status: novo } }
        },
        async execute(sb, clean, ctx) {
            return atualizarLead(sb, clean.lead_id as string, { status: clean.novo_status }, ctx, 'movido via agente WhatsApp')
        },
    },

    crm_registrar_toque: {
        descricao: 'Registra um contato/toque feito com o lead (liguei, mandei mensagem, visitei).',
        schema: {
            type: 'object',
            properties: {
                lead_id: { type: 'string' },
                tipo: { type: 'string', description: 'whatsapp | ligacao | email | visita | outro' },
                nota: { type: 'string', description: 'O que foi conversado/combinado' },
            },
            required: ['lead_id', 'nota'],
        },
        validate(args) {
            const leadId = str(args.lead_id)
            const nota = str(args.nota)
            if (!leadId || !nota) return { ok: false, error: 'lead_id e nota obrigatórios' }
            return { ok: true, clean: { lead_id: leadId, tipo: str(args.tipo) || 'outro', nota } }
        },
        async execute(sb, clean, ctx) {
            const leadId = clean.lead_id as string
            await exigirLeadDoAssessor(sb, leadId, ctx)
            const { data: existing, error: fetchErr } = await sb
                .from('crm_leads')
                .select('nome, contact_history')
                .eq('id', leadId)
                .single()
            if (fetchErr || !existing) throw new Error(`Lead ${leadId} não encontrado`)
            const history = Array.isArray(existing.contact_history) ? existing.contact_history : []
            const date = new Date().toISOString()
            const entry = {
                id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                date,
                type: clean.tipo,
                note: `[agente/${ctx.nome}] ${clean.nota}`,
            }
            const nextHistory = [entry, ...history]
            const { error } = await sb.from('crm_leads').update({
                contact_history: nextHistory,
                contact_count: nextHistory.length,
                ultimo_contato: date,
            }).eq('id', leadId)
            if (error) throw new Error(error.message)
            await auditLog('agente:crm_leads', 'toque', { id: leadId, entry }, { email: `whatsapp:${ctx.phone}` })
            return { resumo: `Toque registrado no lead *${existing.nome ?? leadId}*.` }
        },
    },

    erp_criar_conta_pagar: {
        descricao: 'Cria um título em Contas a Pagar do ERP (status aberto).',
        adminOnly: true,
        schema: {
            type: 'object',
            properties: {
                descricao: { type: 'string' },
                valor: { type: 'number' },
                vencimento: { type: 'string', description: 'YYYY-MM-DD' },
                observacoes: { type: 'string' },
            },
            required: ['descricao', 'valor', 'vencimento'],
        },
        validate(args) {
            const descricao = str(args.descricao)
            const valor = num(args.valor)
            const vencimento = str(args.vencimento)
            if (!descricao) return { ok: false, error: 'descricao obrigatória' }
            if (!Number.isFinite(valor) || valor <= 0) return { ok: false, error: 'valor inválido' }
            if (!isIsoDate(vencimento)) return { ok: false, error: 'vencimento deve ser YYYY-MM-DD' }
            return { ok: true, clean: { descricao, valor, vencimento, observacoes: str(args.observacoes) } }
        },
        async execute(sb, clean, ctx) {
            const row = {
                descricao: clean.descricao,
                valor: clean.valor,
                emissao: new Date().toISOString().slice(0, 10),
                vencimento: clean.vencimento,
                parcela: 1,
                total_parcelas: 1,
                recorrencia: 'nenhuma',
                observacoes: `${clean.observacoes ? clean.observacoes + ' — ' : ''}(lançado via agente WhatsApp por ${ctx.nome})`,
                tags: [],
            }
            const { data, error } = await sb.from('erp_contas_pagar').insert(row).select('id').single()
            if (error) throw new Error(error.message)
            await auditLog('agente:erp_contas_pagar', 'create', { id: data?.id, ...row }, { email: `whatsapp:${ctx.phone}` })
            return { resumo: `Conta a pagar criada: *${clean.descricao}*, R$ ${Number(clean.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, vencimento ${clean.vencimento}.` }
        },
    },

    erp_criar_conta_receber: {
        descricao: 'Cria um título em Contas a Receber do ERP (status aberto).',
        adminOnly: true,
        schema: {
            type: 'object',
            properties: {
                descricao: { type: 'string' },
                valor: { type: 'number' },
                vencimento: { type: 'string', description: 'YYYY-MM-DD' },
                observacoes: { type: 'string' },
            },
            required: ['descricao', 'valor', 'vencimento'],
        },
        validate(args) {
            const descricao = str(args.descricao)
            const valor = num(args.valor)
            const vencimento = str(args.vencimento)
            if (!descricao) return { ok: false, error: 'descricao obrigatória' }
            if (!Number.isFinite(valor) || valor <= 0) return { ok: false, error: 'valor inválido' }
            if (!isIsoDate(vencimento)) return { ok: false, error: 'vencimento deve ser YYYY-MM-DD' }
            return { ok: true, clean: { descricao, valor, vencimento, observacoes: str(args.observacoes) } }
        },
        async execute(sb, clean, ctx) {
            const row = {
                descricao: clean.descricao,
                valor: clean.valor,
                emissao: new Date().toISOString().slice(0, 10),
                vencimento: clean.vencimento,
                parcela: 1,
                total_parcelas: 1,
                recorrencia: 'nenhuma',
                observacoes: `${clean.observacoes ? clean.observacoes + ' — ' : ''}(lançado via agente WhatsApp por ${ctx.nome})`,
                tags: [],
            }
            const { data, error } = await sb.from('erp_contas_receber').insert(row).select('id').single()
            if (error) throw new Error(error.message)
            await auditLog('agente:erp_contas_receber', 'create', { id: data?.id, ...row }, { email: `whatsapp:${ctx.phone}` })
            return { resumo: `Conta a receber criada: *${clean.descricao}*, R$ ${Number(clean.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, vencimento ${clean.vencimento}.` }
        },
    },

    tarefa_dev: {
        descricao: 'Enfileira uma tarefa para o computador do João executar localmente: runner "claude" = Claude Code (alterar o sistema/site, corrigir bug, gerar relatório completo e bem formatado) | runner "codex" = Codex (monitorar leilões no YouTube, pesquisas e tarefas avulsas pedidas expressamente). A bridge local executa e avisa aqui quando terminar. O PC precisa estar ligado.',
        adminOnly: true,
        schema: {
            type: 'object',
            properties: {
                runner: { type: 'string', enum: ['claude', 'codex'], description: 'claude = mexer no sistema/relatórios; codex = monitoramento/pesquisa' },
                descricao: { type: 'string', description: 'A tarefa, completa e específica, como se estivesse instruindo um dev' },
            },
            required: ['runner', 'descricao'],
        },
        validate(args) {
            const runner = str(args.runner)
            const descricao = str(args.descricao)
            if (runner !== 'claude' && runner !== 'codex') return { ok: false, error: 'runner deve ser claude ou codex' }
            if (descricao.length < 10) return { ok: false, error: 'descreva a tarefa com mais detalhe' }
            return { ok: true, clean: { runner, descricao } }
        },
        async execute(sb, clean, ctx) {
            // Fila é sequencial (uma tarefa por vez na bridge) — avisa a posição
            // pra ninguém achar que a tarefa sumiu quando há outra rodando.
            const { count } = await sb
                .from('agente_dev_tarefas')
                .select('id', { count: 'exact', head: true })
                .in('status', ['pendente', 'rodando'])
            const row = {
                runner: clean.runner,
                descricao: clean.descricao,
                solicitante: ctx.nome,
                phone: ctx.phone || null,
            }
            const { data, error } = await sb.from('agente_dev_tarefas').insert(row).select('id').single()
            if (error) throw new Error(error.message)
            await auditLog('agente:dev_tarefas', 'create', { id: data?.id, ...row }, { email: `whatsapp:${ctx.phone}` })
            const nomeRunner = clean.runner === 'claude' ? 'Claude Code' : 'Codex'
            const fila = (count ?? 0) > 0 ? ` Há ${count} tarefa(s) na frente — elas rodam uma por vez.` : ''
            return { resumo: `Tarefa enfileirada pro *${nomeRunner}* no PC do João. Te aviso aqui quando terminar (se o PC estiver ligado com a bridge rodando).${fila}` }
        },
    },

    agenda_criar_evento: {
        descricao: 'Cria um evento na agenda interna (reunião, tarefa, lembrete).',
        schema: {
            type: 'object',
            properties: {
                titulo: { type: 'string' },
                inicio: { type: 'string', description: 'ISO, ex.: 2026-08-10T14:00:00-03:00 (ou só YYYY-MM-DD para dia inteiro)' },
                descricao: { type: 'string' },
            },
            required: ['titulo', 'inicio'],
        },
        validate(args) {
            const titulo = str(args.titulo)
            const inicio = str(args.inicio)
            if (!titulo || !inicio) return { ok: false, error: 'titulo e inicio obrigatórios' }
            const allDay = isIsoDate(inicio)
            const startAt = allDay ? `${inicio}T12:00:00-03:00` : inicio
            if (Number.isNaN(Date.parse(startAt))) return { ok: false, error: 'inicio inválido' }
            return { ok: true, clean: { titulo, start_at: startAt, all_day: allDay, descricao: str(args.descricao) } }
        },
        async execute(sb, clean, ctx) {
            const row = {
                title: clean.titulo,
                description: clean.descricao || null,
                event_type: 'tarefa',
                status: 'pendente',
                priority: 'media',
                start_at: clean.start_at,
                all_day: clean.all_day,
                notes: `Criado via agente WhatsApp por ${ctx.nome}`,
            }
            const { data, error } = await sb.from('agenda_events').insert(row).select('id').single()
            if (error) throw new Error(error.message)
            await auditLog('agente:agenda_events', 'create', { id: data?.id, ...row }, { email: `whatsapp:${ctx.phone}` })
            return { resumo: `Evento *${clean.titulo}* criado na agenda.` }
        },
    },
}

export interface Pendencia {
    id: string
    phone: string
    chat_jid: string | null
    solicitante: string | null
    tool_name: string
    args: Record<string, unknown>
    resumo: string
    status: string
    expires_at: string
}

export async function executarPendencia(
    pendencia: Pendencia,
    ctx: MutacaoCtx,
): Promise<{ ok: boolean; resumo: string }> {
    const sb = supabaseAdmin()
    const marca = async (status: string, resultado?: Record<string, unknown>) => {
        await sb.from('whatsapp_agente_pendencias').update({
            status,
            resultado: resultado ?? null,
            executed_at: new Date().toISOString(),
        }).eq('id', pendencia.id)
    }

    if (new Date(pendencia.expires_at).getTime() < Date.now()) {
        await marca('expirada')
        return { ok: false, resumo: 'Essa confirmação expirou (10 min). Pede de novo que eu preparo outra.' }
    }

    const def = MUTACOES[pendencia.tool_name]
    if (!def) {
        await marca('erro', { error: 'tool desconhecida' })
        return { ok: false, resumo: `Ação desconhecida: ${pendencia.tool_name}.` }
    }
    // Papel re-checado NA EXECUÇÃO: config pode ter mudado entre propor e confirmar.
    if (def.adminOnly && ctx.role !== 'admin') {
        await marca('cancelada', { error: 'sem papel finance' })
        return { ok: false, resumo: 'Essa ação é restrita ao financeiro.' }
    }
    const val = def.validate(pendencia.args)
    if (!val.ok) {
        await marca('erro', { error: val.error })
        return { ok: false, resumo: `Não consegui executar: ${val.error}` }
    }
    try {
        const res = await def.execute(sb, val.clean, ctx)
        await marca('executada', { resumo: res.resumo })
        return { ok: true, resumo: `✅ ${res.resumo}` }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await marca('erro', { error: msg })
        return { ok: false, resumo: `⚠️ Deu erro ao executar: ${msg}` }
    }
}
