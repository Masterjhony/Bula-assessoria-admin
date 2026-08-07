/**
 * Ferramentas do agente interno "Bula" (WhatsApp operacional).
 *
 * Leitura direta com service-role, SEM sessão de cookie — por isso a whitelist
 * de tabelas é explícita e `site_settings` (segredos/config) fica fora.
 *
 * Papéis (a restrição é NO CÓDIGO, não só no prompt):
 *  - admin: irrestrito — todos os dados, ERP, fechamentos, comissões.
 *  - assessor: só os PRÓPRIOS leads (filtro forçado por responsavel), sem
 *    ERP/fechamentos/faturamento, sem conversas, sem busca global. As
 *    ferramentas restritas nem entram no schema — o modelo não as vê.
 *
 * Mutações NUNCA executam aqui: `propor_alteracao` grava a pendência e o
 * "sim" do solicitante executa (whatsapp-agente-mutacoes.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolDef } from './openrouter'
import type { AgenteRole } from './whatsapp-agente-config'
import { supabaseAdmin } from './supabase'
import { clienteMatchKey } from './clientes'
import { computeDre, computeErpDashboard, computeFluxoCaixa } from './erp-dashboards'
import { getCrmRelatorios } from '@/app/sistema/actions/relatorios'
import { getAtendimentoStats } from '@/app/sistema/actions/atendimento'
import { MUTACOES } from './whatsapp-agente-mutacoes'
import { gerarEEnviarRelatorio, type RelatorioDestino } from './whatsapp-agente-relatorio'
import { hastaproConsulta, isHastaproConfigured, type HastaproConsulta } from './hastapro'
import { sendVpsDirect } from './whatsapp-vps'
import { fetchWhatsappCloudTemplatesFull, isWhatsappCloudApiConfigured } from './whatsapp-cloud-api'
import { buildCrmDailyDigest } from './crm-daily-digest'
import { conferirLeilaoTriFonte } from './conferencia-leilao'

// Tabelas que o agente pode consultar. NUNCA site_settings (tokens/segredos).
// Admin cobre o sistema INTEIRO em leitura — o agente deve resolver sozinho
// tudo que já existe no banco, sem empurrar pro tarefa_dev.
const TABELAS_ADMIN = [
    // CRM / leads
    'crm_leads', 'crm_toques', 'crm_funis', 'crm_lead_documentos', 'crm_conversa_auditorias',
    // WhatsApp / atendimento / campanhas
    'whatsapp_messages', 'whatsapp_templates', 'whatsapp_campaigns', 'whatsapp_campaign_recipients',
    'whatsapp_inboxes', 'whatsapp_optouts', 'whatsapp_catalog_groups', 'whatsapp_catalog_detections',
    // E-mail marketing
    'email_campaigns', 'email_messages', 'email_templates',
    // Leilões / clientes
    'bula_leiloes', 'cronograma_leiloes', 'bula_leilao_fechamento', 'bula_leilao_vendas',
    'bula_leilao_recebimento', 'leiloes_equipe', 'clientes', 'cliente_leiloeira_cadastro',
    'cliente_documentos', 'cliente_interacoes', 'leiloeiras',
    // Agenda / tático / OKR
    'agenda_events', 'agendamentos', 'tactical_tasks', 'tactical_objectives', 'tactical_key_results',
    // Radar de mercado
    'mercado_eventos', 'mercado_fontes', 'mercado_medias', 'mercado_criadores',
    // Central operacional
    'operational_sources', 'operational_plans', 'operational_items', 'operational_diary_entries',
    // ERP financeiro
    'erp_contas_pagar', 'erp_contas_receber', 'erp_movimentos_bancarios', 'erp_contas_bancarias',
    'erp_lancamentos', 'erp_categorias', 'erp_centros_custo', 'erp_pessoas', 'erp_empresas',
    'erp_folha_estrutura', 'erp_notas_fiscais', 'erp_cartoes', 'erp_cartao_faturas',
    'erp_cartao_lancamentos', 'erp_resultados_historico', 'erp_auditoria',
    // Meta/observabilidade do próprio agente
    'ai_usage_log', 'agente_dev_tarefas', 'whatsapp_agente_pendencias',
]
// Assessor: nada de fechamentos (comissão/faturamento), clientes agregados,
// conversas de terceiros, tarefas internas nem ERP. crm_leads leva filtro
// forçado por responsavel (ver queryTable).
const TABELAS_ASSESSOR = [
    'crm_leads', 'cronograma_leiloes', 'bula_leiloes', 'leiloeiras',
    'agenda_events', 'agendamentos',
]

const MAX_ROWS = 50
const MAX_RESULT_CHARS = 12_000

export interface AgenteToolCtx {
    role: AgenteRole
    /** Nome em crm_leads.responsavel (papel assessor). */
    assessor?: string | null
    phone: string
    nome: string
    destino: RelatorioDestino
    /** Registrada quando o modelo chama propor_alteracao — o núcleo grava a pendência. `privado` = confirmação vai no DM (pedido veio de grupo). */
    onProposta?: (p: { tool_name: string; args: Record<string, unknown>; resumo: string; privado?: boolean }) => Promise<void>
}

function allowedTables(role: AgenteRole): string[] {
    return role === 'admin' ? TABELAS_ADMIN : TABELAS_ASSESSOR
}

export function buildTools(role: AgenteRole): ToolDef[] {
    const tables = allowedTables(role)
    const mutacoes = Object.entries(MUTACOES)
        .filter(([, def]) => role === 'admin' || !def.adminOnly)

    const tools: ToolDef[] = [
        {
            type: 'function',
            function: {
                name: 'query_table',
                description: 'Consulta uma tabela do banco (somente leitura, máx 50 linhas). Prefira colunas específicas e filtros.',
                parameters: {
                    type: 'object',
                    properties: {
                        table: { type: 'string', enum: tables },
                        select: { type: 'string', description: "Colunas, ex.: 'id, nome, status' (evite '*')" },
                        filters: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    column: { type: 'string' },
                                    operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is'] },
                                    value: { type: 'string' },
                                },
                                required: ['column', 'operator', 'value'],
                            },
                        },
                        limit: { type: 'number', description: 'padrão 20, máx 50' },
                        order_by: { type: 'string' },
                        order_asc: { type: 'boolean', description: 'padrão false (mais recente primeiro)' },
                    },
                    required: ['table', 'select'],
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'investigar_em_segundo_plano',
                description: 'Despacha uma INVESTIGAÇÃO (somente leitura — nada é alterado) para rodar em segundo plano no computador da empresa quando suas ferramentas não alcançam: análise profunda de dados/conversas, conferências linha a linha, monitorar/pesquisar YouTube ou sites, etc. Roda na hora, sem confirmação; o resultado chega nesta conversa em alguns minutos. VOCÊ escolhe o motor: claude = dados internos/sistema/análises; codex = mundo externo (YouTube, sites, pesquisa web).',
                parameters: {
                    type: 'object',
                    properties: {
                        objetivo: { type: 'string', description: 'Brief completo, como um gerente passando pra um analista: o que apurar, onde, o que reportar' },
                        runner: { type: 'string', enum: ['claude', 'codex'], description: 'claude = interno; codex = externo/web' },
                    },
                    required: ['objetivo', 'runner'],
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'conversas_recentes',
                description: 'Quem (clientes/leads) mandou mensagem no WhatsApp recentemente e o que disseram: nome, responsável e as últimas mensagens de cada um, já compacto. Use para "quem respondeu hoje", "o que o fulano falou", acompanhamento de atendimento.',
                parameters: {
                    type: 'object',
                    properties: {
                        horas: { type: 'number', description: 'janela em horas (padrão 24)' },
                        limite: { type: 'number', description: 'máx de contatos (padrão 10, máx 20)' },
                    },
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'agenda_leiloes',
                description: 'Leilões no período: cronograma (agenda geral) + leilões da Bula, com data, local, leiloeira e modalidade.',
                parameters: {
                    type: 'object',
                    properties: {
                        de: { type: 'string', description: 'YYYY-MM-DD (padrão hoje)' },
                        ate: { type: 'string', description: 'YYYY-MM-DD (padrão +30 dias)' },
                    },
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'gerar_relatorio',
                description: 'Gera um arquivo XLSX (ou PDF) com uma tabela e ENVIA como documento nesta conversa. PREFIRA `fonte` (o servidor busca os dados — rápido, até 2000 linhas) em vez de digitar `linhas` (só pra tabelinhas pequenas que você mesmo montou).',
                parameters: {
                    type: 'object',
                    properties: {
                        titulo: { type: 'string' },
                        formato: { type: 'string', enum: ['xlsx', 'pdf'], description: 'padrão xlsx' },
                        fonte: {
                            type: 'object',
                            description: 'O servidor busca e monta as linhas. tipo=query_table exige table/select; tipo=templates_meta não exige nada.',
                            properties: {
                                tipo: { type: 'string', enum: ['query_table', 'templates_meta'] },
                                table: { type: 'string', enum: tables },
                                select: { type: 'string', description: "colunas separadas por vírgula, ex.: 'nome, status, valor'" },
                                filters: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            column: { type: 'string' },
                                            operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is'] },
                                            value: { type: 'string' },
                                        },
                                        required: ['column', 'operator', 'value'],
                                    },
                                },
                                limit: { type: 'number', description: 'padrão 500, máx 2000' },
                                order_by: { type: 'string' },
                                order_asc: { type: 'boolean' },
                            },
                            required: ['tipo'],
                        },
                        colunas: { type: 'array', items: { type: 'string' }, description: 'só no modo manual (sem fonte)' },
                        linhas: { type: 'array', items: { type: 'array', items: { type: ['string', 'number', 'null'] } }, description: 'só no modo manual (sem fonte)' },
                    },
                    required: ['titulo'],
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'propor_alteracao',
                description: `Registra uma ALTERAÇÃO para o usuário confirmar com "sim" (você nunca altera nada direto). Ações disponíveis:\n${mutacoes.map(([nome, def]) => `- ${nome}: ${def.descricao}`).join('\n')}`,
                parameters: {
                    type: 'object',
                    properties: {
                        tool_name: { type: 'string', enum: mutacoes.map(([nome]) => nome) },
                        args: { type: 'object', description: 'argumentos da ação (veja o schema da ação)' },
                        resumo: { type: 'string', description: 'frase curta do que vai ser feito, pra pessoa confirmar' },
                    },
                    required: ['tool_name', 'args', 'resumo'],
                },
            },
        },
    ]

    if (role === 'admin') {
        tools.push(
            {
                type: 'function',
                function: {
                    name: 'buscar_global',
                    description: 'Busca por nome em leilões, fechamentos, clientes/compradores, leads e empresas de uma vez. Use quando não souber em que tabela está.',
                    parameters: {
                        type: 'object',
                        properties: { q: { type: 'string', description: 'termo (mín. 2 letras)' } },
                        required: ['q'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'crm_relatorios',
                    description: 'Relatório consolidado do CRM: funil por etapa/origem, status de cadastro, lead score, gargalos, atendimento.',
                    parameters: {
                        type: 'object',
                        properties: { dias: { type: 'number', description: '7, 30 ou 90 (padrão 30)' } },
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'atendimento_stats',
                    description: 'Métricas de atendimento no WhatsApp (respostas, crescimento, janela 72h).',
                    parameters: {
                        type: 'object',
                        properties: { dias: { type: 'number', description: 'padrão 90' } },
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'erp_dashboard',
                    description: 'Painel financeiro: saldo dos bancos, a pagar/receber, vencidos, entradas/saídas do período, projeção 15 dias.',
                    parameters: {
                        type: 'object',
                        properties: {
                            from: { type: 'string', description: 'YYYY-MM-DD (padrão: 1º dia do mês)' },
                            to: { type: 'string', description: 'YYYY-MM-DD (padrão: último dia do mês)' },
                        },
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'erp_dre',
                    description: 'DRE por regime de caixa ou competência, com grupos por categoria.',
                    parameters: {
                        type: 'object',
                        properties: {
                            from: { type: 'string' },
                            to: { type: 'string' },
                            regime: { type: 'string', enum: ['caixa', 'competencia'] },
                        },
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'conferir_leilao',
                    description: 'Conferência TRI-FONTE de um pregão (por data): cruza lote a lote o grupo de lances, o fechamento consolidado e o HastaPró. Retorna alinhado (lotes só numa fonte, divergências de valor, somas). SEU papel depois: raciocinar e CONCLUIR — qual fonte parece completa, qual está desatualizada, o que falta lançar e onde. Nenhuma fonte é verdade absoluta.',
                    parameters: {
                        type: 'object',
                        properties: { data: { type: 'string', description: 'data do pregão, YYYY-MM-DD' } },
                        required: ['data'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'whatsapp_templates_meta',
                    description: 'Lista AO VIVO os templates da API oficial do WhatsApp (Meta/WABA): nome, status de aprovação, categoria e idioma. Use para "quais templates aprovados/pendentes/rejeitados".',
                    parameters: { type: 'object', properties: {} },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'resumo_dia',
                    description: 'Resumo narrativo do dia do CRM/WhatsApp (o mesmo do grupo de notificações): leads novos, chamados, respostas, funil, habilitação. dias=N para retrospecto.',
                    parameters: {
                        type: 'object',
                        properties: { dias: { type: 'number', description: 'padrão 1' } },
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'hastapro_consulta',
                    description: 'Consulta o HastaPró (sistema de leilões da pista, Firebird, SÓ leitura, consultas fixas). FIL 2 = Bula Assessoria (cobertura, escopo padrão); FIL 01 = Bula Remates (leilão INTEIRO da leiloeira — não é faturamento da Bula). VGV = LOT_TOTAL (lance x 30). Receita oficial segue sendo a dos fechamentos do sistema. Consultas: resumo (VGV período + CP/CR abertos), leiloes, vendas (lotes vendidos), contas_pagar, contas_receber, movimento (baixas), cliente (busca por nome/CPF via termo).',
                    parameters: {
                        type: 'object',
                        properties: {
                            consulta: { type: 'string', enum: ['resumo', 'leiloes', 'vendas', 'contas_pagar', 'contas_receber', 'movimento', 'cliente'] },
                            de: { type: 'string', description: 'YYYY-MM-DD (padrão: 60 dias atrás)' },
                            ate: { type: 'string', description: 'YYYY-MM-DD (padrão: +120 dias)' },
                            termo: { type: 'string', description: 'obrigatório na consulta cliente' },
                            fil: { type: 'string', enum: ['2', '01'], description: 'padrão 2 (Bula Assessoria)' },
                        },
                        required: ['consulta'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'erp_fluxo_caixa',
                    description: 'Fluxo de caixa realizado + previsto (matriz categoria x período), saldo projetado dia a dia.',
                    parameters: {
                        type: 'object',
                        properties: {
                            dias: { type: 'number', description: 'dias futuros (padrão 60)' },
                            passado: { type: 'number', description: 'dias passados (padrão 30)' },
                            gran: { type: 'string', enum: ['dia', 'semana', 'mes'] },
                        },
                    },
                },
            },
        )
    }

    return tools
}

async function queryTable(
    ctx: AgenteToolCtx,
    params: {
        table?: string; select?: string
        filters?: { column: string; operator: string; value: string }[]
        limit?: number; order_by?: string; order_asc?: boolean
    },
): Promise<unknown> {
    const table = String(params.table ?? '')
    if (!allowedTables(ctx.role).includes(table)) {
        return { error: `Tabela '${table}' não disponível.` }
    }
    // Assessor em crm_leads: filtro FORÇADO pelos próprios leads — vale mesmo
    // que o modelo tente consultar de outro jeito.
    if (ctx.role !== 'admin' && table === 'crm_leads' && !(ctx.assessor ?? '').trim()) {
        return { error: 'Seu número não tem assessor vinculado — fale com o João.' }
    }
    try {
        const supabase = supabaseAdmin()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = supabase.from(table).select(params.select || '*')
        if (ctx.role !== 'admin' && table === 'crm_leads') {
            query = query.ilike('responsavel', `%${(ctx.assessor ?? '').trim()}%`)
        }
        for (const f of params.filters ?? []) {
            switch (f.operator) {
                case 'eq': query = query.eq(f.column, f.value); break
                case 'neq': query = query.neq(f.column, f.value); break
                case 'gt': query = query.gt(f.column, f.value); break
                case 'gte': query = query.gte(f.column, f.value); break
                case 'lt': query = query.lt(f.column, f.value); break
                case 'lte': query = query.lte(f.column, f.value); break
                case 'like': query = query.like(f.column, f.value); break
                case 'ilike': query = query.ilike(f.column, f.value); break
                case 'is': query = query.is(f.column, f.value === 'null' ? null : f.value); break
            }
        }
        query = query.limit(Math.min(params.limit ?? 20, MAX_ROWS))
        if (params.order_by) query = query.order(params.order_by, { ascending: params.order_asc === true })
        const { data, error } = await query
        if (error) return { error: error.message }
        return { data: data ?? [], total: data?.length ?? 0 }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'erro desconhecido' }
    }
}

/** Mesmas consultas da busca global do app, com service-role. */
async function buscarGlobal(q: string): Promise<unknown> {
    const termo = q.trim()
    if (termo.length < 2) return { error: 'termo curto demais' }
    const like = `%${termo.replace(/[%_]/g, '\\$&')}%`
    const sb = supabaseAdmin()

    const [leiloes, fechamentos, clientes, compradores, leads, empresas] = await Promise.all([
        sb.from('bula_leiloes').select('id, nome, data, local, leiloeira').ilike('nome', like).order('data', { ascending: false }).limit(5),
        sb.from('bula_leilao_fechamento').select('id, nome, data, local').ilike('nome', like).order('data', { ascending: false }).limit(5),
        sb.from('clientes').select('id, nome, cidade, uf').ilike('nome', like).limit(5),
        sb.from('bula_leilao_fechamento').select('nome, data, compradores').order('data', { ascending: false }).limit(120),
        sb.from('crm_leads').select('id, nome, status, responsavel, telefone, regiao').ilike('nome', like).order('updated_at', { ascending: false }).limit(5),
        sb.from('erp_empresas').select('id, razao_social, nome_fantasia, cnpj').or(`razao_social.ilike.${like},nome_fantasia.ilike.${like}`).limit(5),
    ])

    // Compradores dentro dos fechamentos (JSONB), dedup por nome normalizado.
    const termKey = clienteMatchKey(termo)
    const compradoresHits: Array<{ nome: string; cidade?: string; uf?: string; leilao: string; data: string }> = []
    const seen = new Set<string>()
    if (termKey) {
        type CompradorRow = { fazenda?: string; comprador?: string; cidade?: string; uf?: string }
        for (const f of (compradores.data ?? []) as Array<{ nome: string; data: string; compradores: CompradorRow[] | null }>) {
            for (const c of f.compradores ?? []) {
                const nome = String(c.fazenda || c.comprador || '').trim()
                const k = clienteMatchKey(nome)
                if (!k || seen.has(k) || !k.includes(termKey)) continue
                seen.add(k)
                compradoresHits.push({ nome, cidade: c.cidade, uf: c.uf, leilao: f.nome, data: f.data })
                if (compradoresHits.length >= 5) break
            }
            if (compradoresHits.length >= 5) break
        }
    }

    return {
        leiloes: leiloes.data ?? [],
        fechamentos: fechamentos.data ?? [],
        clientes: clientes.data ?? [],
        compradores_em_fechamentos: compradoresHits,
        leads: leads.data ?? [],
        empresas: empresas.data ?? [],
    }
}

/**
 * Conversas de CLIENTES (1:1, nunca grupos, nunca as do próprio agente) na
 * janela, já agrupadas e compactas — a pergunta "quem respondeu e o quê"
 * estourava o tempo quando o modelo varria whatsapp_messages na unha.
 * Assessor só enxerga conversas dos próprios leads.
 */
async function conversasRecentes(
    ctx: AgenteToolCtx,
    horas: number,
    limite: number,
): Promise<unknown> {
    const sb = supabaseAdmin()
    const desde = new Date(Date.now() - Math.min(Math.max(horas, 1), 168) * 3600_000).toISOString()
    const { data, error } = await sb
        .from('whatsapp_messages')
        .select('phone, name, body, direction, created_at, lead_id')
        .gte('created_at', desde)
        .eq('direction', 'inbound')
        .not('phone', 'like', '%@g.us')
        .not('origin', 'in', '(agente-inbound,group-inbound)')
        .order('created_at', { ascending: false })
        .limit(400)
    if (error) return { error: error.message }

    const porPhone = new Map<string, { name: string | null; leadId: string | null; msgs: { hora: string; texto: string }[] }>()
    for (const m of (data ?? []) as Array<{ phone: string; name: string | null; body: string | null; created_at: string; lead_id: string | null }>) {
        if (!m.body) continue
        const cur = porPhone.get(m.phone) ?? { name: m.name, leadId: m.lead_id, msgs: [] }
        if (cur.msgs.length < 4) {
            cur.msgs.push({
                hora: new Date(m.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
                texto: m.body.slice(0, 200),
            })
        }
        if (!cur.leadId && m.lead_id) cur.leadId = m.lead_id
        porPhone.set(m.phone, cur)
    }

    // dados do lead (nome oficial, responsável, etapa) + trava de assessor
    const leadIds = [...new Set([...porPhone.values()].map(v => v.leadId).filter(Boolean))] as string[]
    const leadPorId = new Map<string, { nome: string | null; responsavel: string | null; status: string | null }>()
    if (leadIds.length) {
        const { data: leads } = await sb.from('crm_leads').select('id, nome, responsavel, status').in('id', leadIds)
        for (const l of (leads ?? []) as Array<{ id: string; nome: string | null; responsavel: string | null; status: string | null }>) {
            leadPorId.set(l.id, { nome: l.nome, responsavel: l.responsavel, status: l.status })
        }
    }

    const alvoAssessor = (ctx.assessor ?? '').trim().toLowerCase()
    const conversas: unknown[] = []
    for (const [phone, v] of porPhone) {
        const lead = v.leadId ? leadPorId.get(v.leadId) : null
        if (ctx.role !== 'admin') {
            if (!alvoAssessor) return { error: 'Seu número não tem assessor vinculado — fale com o João.' }
            if (!lead?.responsavel || !lead.responsavel.toLowerCase().includes(alvoAssessor)) continue
        }
        conversas.push({
            nome: lead?.nome || v.name || phone,
            telefone: phone,
            responsavel: lead?.responsavel ?? null,
            etapa: lead?.status ?? null,
            mensagens: v.msgs.reverse(),
        })
        if (conversas.length >= Math.min(Math.max(limite, 1), 20)) break
    }
    return { janela_horas: horas, total_contatos: porPhone.size, conversas }
}

async function agendaLeiloes(de?: string, ate?: string): Promise<unknown> {
    const sb = supabaseAdmin()
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const from = de || iso(new Date())
    const to = ate || iso(new Date(Date.now() + 30 * 86400_000))
    const [cronograma, bula] = await Promise.all([
        sb.from('cronograma_leiloes').select('*').gte('data', from).lte('data', to).order('data', { ascending: true }).limit(MAX_ROWS),
        sb.from('bula_leiloes').select('*').gte('data', from).lte('data', to).order('data', { ascending: true }).limit(MAX_ROWS),
    ])
    return { periodo: { de: from, ate: to }, cronograma: cronograma.data ?? [], bula_leiloes: bula.data ?? [] }
}

/** Executa uma ferramenta e devolve o resultado JÁ serializado (truncado). */
export async function executeTool(
    name: string,
    rawArgs: string,
    ctx: AgenteToolCtx,
): Promise<string> {
    let args: Record<string, unknown> = {}
    try {
        args = rawArgs ? JSON.parse(rawArgs) : {}
    } catch {
        return JSON.stringify({ error: 'argumentos inválidos (JSON malformado)' })
    }

    let result: unknown
    try {
        switch (name) {
            case 'query_table':
                result = await queryTable(ctx, args as Parameters<typeof queryTable>[1])
                break
            case 'buscar_global':
                result = ctx.role !== 'admin' ? { error: 'restrito_admin' } : await buscarGlobal(String(args.q ?? ''))
                break
            case 'crm_relatorios':
                result = ctx.role !== 'admin' ? { error: 'restrito_admin' } : await getCrmRelatorios(Number(args.dias) || 30)
                break
            case 'atendimento_stats':
                result = ctx.role !== 'admin' ? { error: 'restrito_admin' } : await getAtendimentoStats(Number(args.dias) || 90)
                break
            case 'investigar_em_segundo_plano': {
                if (ctx.role !== 'admin') {
                    result = { error: 'restrito_admin' }
                    break
                }
                const objetivo = String(args.objetivo ?? '').trim()
                if (objetivo.length < 15) {
                    result = { error: 'descreva melhor o objetivo da investigação' }
                    break
                }
                const runner = args.runner === 'codex' ? 'codex' : 'claude'
                const { error } = await supabaseAdmin().from('agente_dev_tarefas').insert({
                    runner,
                    descricao: `${objetivo}\n\nREGRA DESTA TAREFA (investigação): SOMENTE LEITURA — não altere código, não commite, não dê push, não modifique dados. Apenas apure e reporte.`,
                    solicitante: ctx.nome,
                    phone: ctx.phone || null,
                })
                if (error) {
                    result = { error: error.message }
                    break
                }
                result = {
                    despachada: true,
                    instrucao: 'Diga em UMA linha: "🔎 Já estou apurando em segundo plano — te aviso aqui quando terminar (alguns minutos)." Nada de mencionar Claude/Codex/runner.',
                }
                break
            }
            case 'conversas_recentes':
                result = await conversasRecentes(ctx, Number(args.horas) || 24, Number(args.limite) || 10)
                break
            case 'agenda_leiloes':
                result = await agendaLeiloes(
                    typeof args.de === 'string' ? args.de : undefined,
                    typeof args.ate === 'string' ? args.ate : undefined,
                )
                break
            case 'conferir_leilao': {
                if (ctx.role !== 'admin') {
                    result = { error: 'restrito_admin' }
                    break
                }
                result = await conferirLeilaoTriFonte(supabaseAdmin(), String(args.data ?? ''))
                break
            }
            case 'whatsapp_templates_meta': {
                if (ctx.role !== 'admin') {
                    result = { error: 'restrito_admin' }
                    break
                }
                if (!isWhatsappCloudApiConfigured()) {
                    result = { error: 'api_oficial_nao_configurada' }
                    break
                }
                const templates = await fetchWhatsappCloudTemplatesFull()
                result = {
                    total: templates.length,
                    templates: templates.map(t => ({
                        name: (t as { name?: string }).name,
                        status: (t as { status?: string }).status,
                        category: (t as { category?: string }).category,
                        language: (t as { language?: string }).language,
                    })),
                }
                break
            }
            case 'resumo_dia': {
                if (ctx.role !== 'admin') {
                    result = { error: 'restrito_admin' }
                    break
                }
                const digest = await buildCrmDailyDigest(supabaseAdmin(), { days: Number(args.dias) || 1 })
                result = { texto: digest.text }
                break
            }
            case 'hastapro_consulta': {
                if (ctx.role !== 'admin') {
                    result = { error: 'restrito_admin' }
                    break
                }
                if (!isHastaproConfigured()) {
                    result = { error: 'hastapro_nao_configurado' }
                    break
                }
                result = await hastaproConsulta(String(args.consulta ?? '') as HastaproConsulta, {
                    de: typeof args.de === 'string' ? args.de : null,
                    ate: typeof args.ate === 'string' ? args.ate : null,
                    termo: typeof args.termo === 'string' ? args.termo : null,
                    fil: typeof args.fil === 'string' ? args.fil : null,
                })
                break
            }
            case 'erp_dashboard':
            case 'erp_dre':
            case 'erp_fluxo_caixa': {
                if (ctx.role !== 'admin') {
                    result = { error: 'restrito_admin' }
                    break
                }
                const sb = supabaseAdmin()
                if (name === 'erp_dashboard') {
                    result = await computeErpDashboard(sb, { from: args.from as string | undefined, to: args.to as string | undefined })
                } else if (name === 'erp_dre') {
                    result = await computeDre(sb, {
                        from: args.from as string | undefined,
                        to: args.to as string | undefined,
                        regime: args.regime === 'competencia' ? 'competencia' : 'caixa',
                    })
                } else {
                    result = await computeFluxoCaixa(sb, {
                        dias: Number(args.dias) || 60,
                        passado: Number(args.passado ?? 30),
                        gran: typeof args.gran === 'string' ? args.gran : null,
                    })
                }
                break
            }
            case 'gerar_relatorio': {
                let colunas = Array.isArray(args.colunas) ? (args.colunas as string[]).map(String) : []
                let linhas = Array.isArray(args.linhas) ? (args.linhas as (string | number | null)[][]) : []
                const fonte = (args.fonte ?? null) as {
                    tipo?: string; table?: string; select?: string
                    filters?: { column: string; operator: string; value: string }[]
                    limit?: number; order_by?: string; order_asc?: boolean
                } | null
                // `fonte`: o SERVIDOR busca os dados — o modelo não redigita linha
                // a linha (relatório grande estourava o tempo do loop).
                if (fonte?.tipo === 'templates_meta') {
                    if (ctx.role !== 'admin') { result = { error: 'restrito_admin' }; break }
                    if (!isWhatsappCloudApiConfigured()) { result = { error: 'api_oficial_nao_configurada' }; break }
                    const templates = (await fetchWhatsappCloudTemplatesFull()) as unknown as Array<Record<string, unknown>>
                    colunas = ['nome', 'status', 'categoria', 'idioma']
                    linhas = templates.map(t => [
                        String(t.name ?? ''), String(t.status ?? ''), String(t.category ?? ''), String(t.language ?? ''),
                    ])
                } else if (fonte?.tipo === 'query_table') {
                    const table = String(fonte.table ?? '')
                    const select = String(fonte.select ?? '').trim()
                    if (!allowedTables(ctx.role).includes(table)) { result = { error: `Tabela '${table}' não disponível.` }; break }
                    if (!select || select.includes('*')) { result = { error: 'informe as colunas explicitamente no select' }; break }
                    if (ctx.role !== 'admin' && table === 'crm_leads' && !(ctx.assessor ?? '').trim()) {
                        result = { error: 'Seu número não tem assessor vinculado — fale com o João.' }
                        break
                    }
                    const cols = select.split(',').map(s => s.trim()).filter(Boolean)
                    const supabase = supabaseAdmin()
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let query: any = supabase.from(table).select(cols.join(','))
                    if (ctx.role !== 'admin' && table === 'crm_leads') {
                        query = query.ilike('responsavel', `%${(ctx.assessor ?? '').trim()}%`)
                    }
                    for (const f of fonte.filters ?? []) {
                        switch (f.operator) {
                            case 'eq': query = query.eq(f.column, f.value); break
                            case 'neq': query = query.neq(f.column, f.value); break
                            case 'gt': query = query.gt(f.column, f.value); break
                            case 'gte': query = query.gte(f.column, f.value); break
                            case 'lt': query = query.lt(f.column, f.value); break
                            case 'lte': query = query.lte(f.column, f.value); break
                            case 'like': query = query.like(f.column, f.value); break
                            case 'ilike': query = query.ilike(f.column, f.value); break
                            case 'is': query = query.is(f.column, f.value === 'null' ? null : f.value); break
                        }
                    }
                    query = query.limit(Math.min(Number(fonte.limit) || 500, 2000))
                    if (fonte.order_by) query = query.order(fonte.order_by, { ascending: fonte.order_asc === true })
                    const { data, error } = await query
                    if (error) { result = { error: error.message }; break }
                    colunas = cols
                    linhas = ((data ?? []) as Record<string, unknown>[]).map(row =>
                        cols.map(cf => {
                            const v = row[cf]
                            if (v == null) return null
                            return typeof v === 'number' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v)
                        }),
                    )
                }
                result = await gerarEEnviarRelatorio(supabaseAdmin(), {
                    titulo: String(args.titulo ?? 'Relatório'),
                    colunas,
                    linhas,
                    formato: args.formato === 'pdf' ? 'pdf' : 'xlsx',
                    destino: ctx.destino,
                })
                break
            }
            case 'propor_alteracao': {
                const toolName = String(args.tool_name ?? '')
                const def = MUTACOES[toolName]
                if (!def) {
                    result = { error: `ação desconhecida: ${toolName}` }
                    break
                }
                if (def.adminOnly && ctx.role !== 'admin') {
                    result = { error: 'restrito_admin' }
                    break
                }
                const mArgs = (args.args ?? {}) as Record<string, unknown>
                const val = def.validate(mArgs)
                if (!val.ok) {
                    result = { error: `argumentos inválidos: ${val.error}` }
                    break
                }
                const resumo = String(args.resumo ?? '').trim() || `Executar ${toolName}`
                // Em GRUPO a confirmação vai pro PRIVADO do solicitante: o
                // vai-e-vem de "sim/não" não polui o grupo e ninguém confirma
                // ação dos outros. Sem telefone resolvido (@lid), sem mutação.
                if (ctx.destino.kind === 'grupo') {
                    if (!ctx.phone) {
                        result = { error: 'não deu pra identificar seu número — me chama no privado pra fazer alterações' }
                        break
                    }
                    await ctx.onProposta?.({ tool_name: toolName, args: mArgs, resumo, privado: true })
                    await sendVpsDirect(
                        ctx.phone,
                        `📌 ${resumo}\n\nResponda *sim* aqui para confirmar ou *não* para cancelar. (pedido feito no grupo)`,
                        undefined,
                        ctx.destino.session,
                    )
                    result = {
                        registrado: true,
                        confirmacao_no_privado: true,
                        instrucao: 'Diga NO GRUPO, em UMA frase curta, que mandou a confirmação no privado da pessoa. Nada mais.',
                    }
                    break
                }
                await ctx.onProposta?.({ tool_name: toolName, args: mArgs, resumo })
                result = {
                    registrado: true,
                    resumo,
                    instrucao: 'Repasse o resumo ao usuário e peça: "Responda *sim* para confirmar ou *não* para cancelar." Não execute mais nada nesta resposta.',
                }
                break
            }
            default:
                result = { error: `ferramenta desconhecida: ${name}` }
        }
    } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) }
    }

    let json = JSON.stringify(result)
    if (json.length > MAX_RESULT_CHARS) {
        json = json.slice(0, MAX_RESULT_CHARS) + ' …[TRUNCADO — refine a consulta com filtros/menos colunas]'
    }
    return json
}
