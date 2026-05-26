import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const GLM_API_KEY = process.env.GLM_API_KEY ?? 'cc315be9de774348a411618c653faad0.ITLRcDX7Memszozq';
const GLM_MODEL = process.env.GLM_MODEL ?? 'glm-4.7';

const ALLOWED_TABLES = [
    'products', 'crm_leads', 'profiles', 'tactical_tasks',
    'tactical_contracts', 'whatsapp_messages', 'site_settings', 'breeders',
];

const SYSTEM_PROMPT = `Você é o assistente de IA do painel administrativo da **Fórmula do Boi**, um marketplace de genética bovina Nelore PO (Puro de Origem).

## Sobre o Sistema
Três interfaces via subdomínio:
- **Admin** (admin.formuladoboi.com): CRM, produtos, analytics, WhatsApp
- **ERP** (erp.formuladoboi.com): Plano tático, contratos
- **Site público** (formuladoboi.com): Marketplace

Infraestrutura: Next.js (Vercel) + Supabase (PostgreSQL) + WhatsApp microservice (DigitalOcean VPS).

## Tabelas disponíveis para consulta

### products — Catálogo de animais
id, name, slug, category (touro/matriz/embrião/sêmen), breed, price, status (available/sold/reserved), description, details (JSONB), region, breeder_id, genealogia_json (JSONB), avaliacao_genetica_json (JSONB), created_at, updated_at

### crm_leads — Pipeline de vendas
id, name, email, phone, status (novo/contato/proposta/fechado/perdido), position, notes, source, created_at, updated_at

### profiles — Usuários do sistema
id, email, role (admin/user), full_name, created_at

### tactical_tasks — Kanban de projetos (ERP)
id, title, description, status, priority, due_date, assignee, checklists (JSONB), attachments (JSONB), whatsapp_group_id, whatsapp_sender, created_at

### tactical_contracts — Contratos
id, title, client_name, value, status, signed_at, created_at

### whatsapp_messages — Log de mensagens WhatsApp
id, phone, lead_id, status (sent/failed/queued), message, created_at

### site_settings — Configurações do sistema
key, value (JSONB) — inclui chaves 'whatsapp_flow_v2' (grafo do fluxo da Central WhatsApp), 'whatsapp_flow' (legado, ainda usado por /api/whatsapp/flow)

### breeders — Criadores de gado
id, name, farm_name, city, state, phone, email, created_at

## Capacidades
Use a ferramenta \`query_table\` para buscar dados reais. Você pode combinar múltiplas consultas para responder perguntas complexas.

## Restrições
- Apenas leitura (SELECT) — nunca modifique dados
- Limite máximo de 50 registros por consulta
- Não exiba senhas, tokens ou chaves de API

## Comportamento
- Responda em **português brasileiro**
- Formate dados com markdown (tabelas, listas)
- Ao mostrar leads, omita parte do email (ex: jo***@gmail.com)
- Seja objetivo e analítico`;

const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'query_table',
            description: 'Consulta dados de uma tabela do banco de dados PostgreSQL em tempo real. Use para buscar informações reais do sistema.',
            parameters: {
                type: 'object',
                properties: {
                    table: {
                        type: 'string',
                        description: `Tabela a consultar. Permitidas: ${ALLOWED_TABLES.join(', ')}`,
                    },
                    select: {
                        type: 'string',
                        description: "Colunas (ex: 'id, name, status' ou '*'). Prefira colunas específicas.",
                    },
                    filters: {
                        type: 'array',
                        description: 'Filtros WHERE opcionais',
                        items: {
                            type: 'object',
                            properties: {
                                column: { type: 'string' },
                                operator: {
                                    type: 'string',
                                    enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is'],
                                },
                                value: { type: 'string' },
                            },
                            required: ['column', 'operator', 'value'],
                        },
                    },
                    limit: {
                        type: 'number',
                        description: 'Máximo de resultados (padrão: 20, máximo: 50)',
                    },
                    order_by: {
                        type: 'string',
                        description: 'Coluna para ordenação',
                    },
                    order_asc: {
                        type: 'boolean',
                        description: 'true = crescente, false = decrescente (padrão: false)',
                    },
                },
                required: ['table', 'select'],
            },
        },
    },
];

function createServiceClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
}

async function executeQuery(params: {
    table: string;
    select: string;
    filters?: { column: string; operator: string; value: string }[];
    limit?: number;
    order_by?: string;
    order_asc?: boolean;
}) {
    const { table, select, filters, limit, order_by, order_asc } = params;

    if (!ALLOWED_TABLES.includes(table)) {
        return { error: `Tabela '${table}' não disponível.` };
    }

    try {
        const supabase = createServiceClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = supabase.from(table).select(select || '*');

        if (filters?.length) {
            for (const f of filters) {
                switch (f.operator) {
                    case 'eq': query = query.eq(f.column, f.value); break;
                    case 'neq': query = query.neq(f.column, f.value); break;
                    case 'gt': query = query.gt(f.column, f.value); break;
                    case 'gte': query = query.gte(f.column, f.value); break;
                    case 'lt': query = query.lt(f.column, f.value); break;
                    case 'lte': query = query.lte(f.column, f.value); break;
                    case 'like': query = query.like(f.column, f.value); break;
                    case 'ilike': query = query.ilike(f.column, f.value); break;
                    case 'is': query = query.is(f.column, f.value === 'null' ? null : f.value); break;
                }
            }
        }

        query = query.limit(Math.min(limit ?? 20, 50));

        if (order_by) {
            query = query.order(order_by, { ascending: order_asc !== false });
        }

        const { data, error } = await query;
        if (error) return { error: error.message };
        return { data: data ?? [], total: data?.length ?? 0 };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Erro desconhecido' };
    }
}

async function callGLM(messages: unknown[], useTools = true) {
    const body: Record<string, unknown> = {
        model: GLM_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 2000,
    };

    if (useTools) {
        body.tools = TOOLS;
        body.tool_choice = 'auto';
    }

    const res = await fetch(GLM_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${GLM_API_KEY}`,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`GLM API error ${res.status}: ${err}`);
    }

    return res.json();
}

export async function POST(request: NextRequest) {
    try {
        const { messages } = await request.json();

        if (!Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json({ error: 'messages inválidas' }, { status: 400 });
        }

        const allMessages: unknown[] = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages,
        ];

        let queriesMade = 0;
        const MAX_ITERATIONS = 6;

        for (let i = 0; i < MAX_ITERATIONS; i++) {
            const response = await callGLM(allMessages);
            const choice = response.choices?.[0];

            if (!choice) {
                throw new Error('Resposta inválida da API GLM');
            }

            const assistantMsg = choice.message;
            allMessages.push(assistantMsg);

            if (choice.finish_reason === 'tool_calls' && assistantMsg.tool_calls?.length) {
                for (const toolCall of assistantMsg.tool_calls) {
                    if (toolCall.function?.name === 'query_table') {
                        let params;
                        try {
                            params = JSON.parse(toolCall.function.arguments);
                        } catch {
                            allMessages.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                content: JSON.stringify({ error: 'Argumentos inválidos' }),
                            });
                            continue;
                        }

                        const result = await executeQuery(params);
                        queriesMade++;

                        allMessages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: JSON.stringify(result),
                        });
                    }
                }
            } else {
                return NextResponse.json({
                    message: assistantMsg.content ?? 'Sem resposta.',
                    queriesMade,
                });
            }
        }

        const lastAssistant = [...allMessages].reverse().find((m: unknown) => (m as { role: string }).role === 'assistant') as { content: string } | undefined;
        return NextResponse.json({
            message: lastAssistant?.content ?? 'Limite de iterações atingido.',
            queriesMade,
        });
    } catch (error) {
        console.error('[AI Chat]', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Erro interno' },
            { status: 500 },
        );
    }
}
