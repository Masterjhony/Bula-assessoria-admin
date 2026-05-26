import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 55

const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const GLM_API_KEY = process.env.GLM_API_KEY ?? ''
const GLM_MODEL = process.env.GLM_MODEL ?? 'glm-4.7'

const ALLOWED_TABLES = [
  'products', 'crm_leads', 'profiles', 'tactical_tasks',
  'tactical_contracts', 'whatsapp_messages', 'site_settings', 'breeders',
]

const SYSTEM_PROMPT = `Você é o assistente de IA da comunidade **Fórmula do Boi** no WhatsApp. Responde perguntas consultando dados reais do banco de dados.

## REGRA PRINCIPAL
**NUNCA peça confirmação ao usuário. SEMPRE consulte o banco diretamente com os dados disponíveis.** Se não encontrar nada, diga o que consultou e o resultado vazio. Use \`ilike\` com \`%valor%\` para buscas parciais de texto.

## Sobre o Sistema
- **Admin**: CRM, produtos, analytics, WhatsApp
- **ERP**: Plano tático (Kanban), contratos
- **Site público**: Marketplace de genética bovina Nelore PO

## Tabelas disponíveis

### products — Catálogo de animais
id, name, slug, category, breed, price, status, description, region, breeder_id, created_at
- **category**: valores exatos: Touro, Matriz, Sêmen, Embrião
- **status**: valores exatos: Disponível, Vendido, Inativo
- O campo \`region\` contém **nomes de cidades**, não siglas de estado. Ex: "Jordânia", "Patos de Minas", "João Pinheiro", "Prata", "Uberaba"
- Para buscar produtos de um estado (ex: MG), busque todos os disponíveis e identifique quais cidades pertencem ao estado. Cidades de MG no sistema: Jordânia, Patos de Minas, João Pinheiro, Prata, Uberaba, Uberlândia, Belo Horizonte, Montes Claros
- Para buscar cidade específica: use \`ilike\` em \`region\` com \`%NomeDaCidade%\`

### crm_leads — Pipeline de vendas
id, name, email, phone, status (novo/contato/proposta/fechado/perdido), notes, source, created_at

### profiles — Usuários do sistema
id, email, role (admin/user), full_name, created_at

### tactical_tasks — Kanban de projetos (ERP)
id, title, description, status (Idéias/A fazer/Em andamento/Completa), priority (Alta/Média/Baixa), due_date, assignees, created_at
- **assignees** é um array de texto com nomes, ex: ["João Eduardo", "Maria"]. Para buscar por pessoa use \`ilike\` em \`assignees\` com \`%João Eduardo%\`
- Para tarefas pendentes, filtre status \`neq\` "Completa"

### tactical_contracts — Contratos
id, title, client_name, value, status, signed_at, created_at

### whatsapp_messages — Log de mensagens WhatsApp
id, phone, lead_id, status (sent/failed/queued), message, created_at

### site_settings — Configurações
key, value (JSONB)

### breeders — Criadores de gado
id, name, slug, is_partner, created_at
- Contém apenas nome e dados de apresentação do criador, sem campos de cidade/estado

## Restrições
- Apenas leitura — nunca modifique dados
- Limite máximo de 50 registros por consulta
- Não exiba senhas, tokens ou chaves de API
- Ao mostrar leads, omita parte do email (ex: jo***@gmail.com)

## Comportamento
- Responda em **português brasileiro**
- Seja **conciso** — resposta no WhatsApp, sem textos longos
- Use formatação WhatsApp: *negrito*, _itálico_
- Máximo 1000 caracteres na resposta
- Se não encontrar dados, informe o que foi buscado e que não há registros`

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'query_table',
      description: 'Consulta dados de uma tabela do banco de dados PostgreSQL.',
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
          order_by: { type: 'string', description: 'Coluna para ordenação' },
          order_asc: { type: 'boolean', description: 'true = crescente, false = decrescente' },
        },
        required: ['table', 'select'],
      },
    },
  },
]

function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function executeQuery(params: {
  table: string
  select: string
  filters?: { column: string; operator: string; value: string }[]
  limit?: number
  order_by?: string
  order_asc?: boolean
}) {
  const { table, select, filters, limit, order_by, order_asc } = params

  if (!ALLOWED_TABLES.includes(table)) {
    return { error: `Tabela '${table}' não disponível.` }
  }

  try {
    const supabase = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase.from(table).select(select || '*')

    if (filters?.length) {
      for (const f of filters) {
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
    }

    query = query.limit(Math.min(limit ?? 20, 50))

    if (order_by) {
      query = query.order(order_by, { ascending: order_asc !== false })
    }

    const { data, error } = await query
    if (error) return { error: error.message }
    return { data: data ?? [], total: data?.length ?? 0 }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

async function callGLM(messages: unknown[], useTools = true) {
  const body: Record<string, unknown> = {
    model: GLM_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 1500,
  }

  if (useTools) {
    body.tools = TOOLS
    body.tool_choice = 'auto'
  }

  const res = await fetch(GLM_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GLM_API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GLM API error ${res.status}: ${err}`)
  }

  return res.json()
}

export async function POST(request: NextRequest) {
  // Valida segredo compartilhado com o VPS
  const SECRET = process.env.WHATSAPP_GROUP_TASK_SECRET || ''
  const authHeader = request.headers.get('x-webhook-secret')
  if (!SECRET || authHeader !== SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { question, sender_name } = await request.json()

    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: 'question é obrigatório' }, { status: 400 })
    }

    const userMessage = sender_name
      ? `[Pergunta de ${sender_name}]: ${question.trim()}`
      : question.trim()

    const allMessages: unknown[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ]

    const MAX_ITERATIONS = 6

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await callGLM(allMessages)
      const choice = response.choices?.[0]

      if (!choice) {
        throw new Error('Resposta inválida da API GLM')
      }

      const assistantMsg = choice.message
      allMessages.push(assistantMsg)

      if (choice.finish_reason === 'tool_calls' && assistantMsg.tool_calls?.length) {
        for (const toolCall of assistantMsg.tool_calls) {
          if (toolCall.function?.name === 'query_table') {
            let params
            try {
              params = JSON.parse(toolCall.function.arguments)
            } catch {
              allMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({ error: 'Argumentos inválidos' }),
              })
              continue
            }

            const result = await executeQuery(params)

            allMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            })
          }
        }
      } else {
        return NextResponse.json({
          answer: assistantMsg.content ?? 'Não consegui processar a pergunta.',
        })
      }
    }

    const lastAssistant = [...allMessages]
      .reverse()
      .find((m: unknown) => (m as { role: string }).role === 'assistant') as { content: string } | undefined

    return NextResponse.json({
      answer: lastAssistant?.content ?? 'Limite de iterações atingido.',
    })
  } catch (error) {
    console.error('[group-ai]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 },
    )
  }
}
