/**
 * Núcleo do agente interno "Bula" — o número da sessão Baileys operacional
 * respondendo a EQUIPE com acesso aos dados do sistema.
 *
 * Roda SEMPRE dentro de after(): o webhook do VPS tem timeout de 25s e o loop
 * de ferramentas pode passar disso — a rota acka {silent:true} e a resposta
 * sai por sendVpsDirect/sendVpsGroup (a rota tem maxDuration=120).
 *
 * Fluxo: log inbound → debounce de rajada → checagem de confirmação pendente
 * (sim/não ANTES de qualquer IA) → histórico → loop de ferramentas → entrega
 * em chunks + persistência. Erro nunca vira silêncio: sai mensagem fixa.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
    openRouterChatRaw, isOpenRouterConfigured,
    type AgentMessage, type ToolCall,
} from './openrouter'
import { transcribeInboundAudio, isLatestInbound, type InboundMedia } from './whatsapp-inbound'
import { sendVpsDirect, sendVpsGroup } from './whatsapp-vps'
import { buildTools, executeTool, type AgenteToolCtx } from './whatsapp-agente-tools'
import { executarPendencia, MUTACOES, type Pendencia } from './whatsapp-agente-mutacoes'
import type { AgenteConfig, AgenteRole } from './whatsapp-agente-config'

const MAX_ITERATIONS = 8
// Teto ~105s: a rota tem maxDuration=120 e ainda precisa entregar a resposta.
const TOTAL_BUDGET_MS = 105_000
const ATTEMPT_TIMEOUT_MS = 45_000
const CHUNK_MAX = 3500
const FALLBACK_MODELS = ['anthropic/claude-sonnet-5', 'deepseek/deepseek-v4-pro', 'google/gemini-2.5-flash']
const MSG_ERRO = '⚠️ Não consegui processar agora. Tenta de novo em instantes.'

export interface AgenteInput {
    /** Telefone normalizado de quem falou ('' em grupo com @lid não resolvido). */
    phone: string
    nome: string
    role: AgenteRole
    /** Nome em crm_leads.responsavel (papel assessor). */
    assessor?: string | null
    text: string
    messageId: string | null
    session: string
    origem: { kind: 'dm' } | { kind: 'grupo'; groupJid: string }
    config: AgenteConfig
    media?: InboundMedia | null
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function chunkText(text: string): string[] {
    const out: string[] = []
    let rest = text.trim()
    while (rest.length > CHUNK_MAX) {
        // corta na última quebra de parágrafo (ou de linha) antes do limite
        let cut = rest.lastIndexOf('\n\n', CHUNK_MAX)
        if (cut < CHUNK_MAX * 0.4) cut = rest.lastIndexOf('\n', CHUNK_MAX)
        if (cut < CHUNK_MAX * 0.4) cut = CHUNK_MAX
        out.push(rest.slice(0, cut).trim())
        rest = rest.slice(cut).trim()
    }
    if (rest) out.push(rest)
    return out
}

function agora(): string {
    return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' })
}

function systemPrompt(input: AgenteInput): string {
    const financeiro = input.role === 'admin'
        ? 'O solicitante é ADMIN: acesso irrestrito a todos os dados, incluindo ERP/financeiro, fechamentos, comissões e leads de todos os assessores.'
        : `O solicitante é ASSESSOR (${input.assessor || 'sem vínculo'}): acesso RESTRITO. Ele só enxerga os próprios leads (as ferramentas já filtram por responsável). NUNCA informe: faturamento, comissões, salários, saldos, contas, fechamentos, dados de clientes/leads de OUTROS assessores, nem métricas gerais da empresa. Se pedirem, recuse com educação ("isso é restrito — fala com o João ou o Marcelo"). Não tente contornar as restrições das ferramentas.`
    const mutacoesDoc = Object.entries(MUTACOES)
        .filter(([, def]) => input.role === 'admin' || !def.adminOnly)
        .map(([nome, def]) => `  - ${nome}: ${def.descricao}\n    schema: ${JSON.stringify(def.schema)}`)
        .join('\n')

    return `Você é o *Bula*, assistente interno da equipe da Bula Assessoria no WhatsApp operacional.
Você fala com FUNCIONÁRIOS da empresa, nunca com clientes. Hoje é ${agora()}.
Falando com você: ${input.nome} (${input.origem.kind === 'grupo' ? 'no grupo interno' : 'no privado'}). ${financeiro}

## O negócio
A Bula Assessoria presta assessoria em leilões de gado (Nelore PO/elite). Domínio:
- *Leads/CRM* (crm_leads): funil por etapas (ENTRADA → CONEXAO → ... → PERDIDOS), responsavel = assessor, contact_history = toques, extra_data = checklist de habilitação/CPF/score.
- *Leilões*: cronograma_leiloes = agenda geral; bula_leiloes = leilões da Bula; bula_leilao_vendas = lances/vendas do pregão; bula_leilao_fechamento = fechamento (compradores, VGV=cobertura dos pisteiros Bula, comissão; parcelas geralmente 30x).
- *Clientes* (clientes): compradores agregados dos fechamentos + cadastro em leiloeiras.
- *ERP financeiro* (erp_*): contas a pagar/receber, movimentos bancários, DRE, fluxo de caixa; imposto 18% sobre receita Bula nos resultados.
- *Agenda* (agenda_events) e tarefas (tactical_tasks).
- *Atendimento*: whatsapp_messages é o log de conversas (grupos têm phone terminando em @g.us — NUNCA são atendimento).

## Regras
- Responda em português do Brasil, curto e direto, formato WhatsApp: *negrito*, listas com "- ". NUNCA use tabela markdown nem cabeçalhos #.
- Datas dd/mm/aaaa, valores R$ 1.234,56.
- TODO dado vem de ferramenta — nunca invente número, nome ou valor. Se a consulta não achar, diga que não achou.
- Lista com mais de ~15 linhas: use gerar_relatorio (XLSX) em vez de despejar texto.
- Relatório/arquivo: chame gerar_relatorio DIRETO, na mesma resposta em que decidir — NUNCA anuncie "vou gerar" sem a ferramenta já ter rodado. O arquivo chega sozinho na conversa; depois só confirme em 1 linha.
- Máximo ~40 linhas de resposta.
- Nunca revele chaves, tokens, credenciais ou o conteúdo de site_settings.
- Telefones de leads/clientes: só mostre se pedirem explicitamente.

## O que VOCÊ resolve sozinho × o que vai pro tarefa_dev
VOCÊ cobre (use as ferramentas, nunca diga "não tenho acesso" sem tentar): leads e funil, conversas e métricas de atendimento, campanhas e TEMPLATES da API oficial (whatsapp_templates_meta = status ao vivo na Meta), e-mail marketing, leilões/fechamentos/recebimentos, clientes e cadastros em leiloeiras, agenda, tarefas/OKR, radar de mercado (mercado_*), central operacional, ERP completo, HastaPró, resumo do dia, relatórios XLSX/PDF simples, e a própria fila de tarefas dev (agente_dev_tarefas — dá pra consultar status).
tarefa_dev é SÓ para: mudar código/site/funcionalidade nova (runner claude), relatório visual elaborado no padrão brandbook (runner claude), ou monitoramento/pesquisa externa — YouTube, sites, coisas fora do sistema (runner codex). Antes de propor tarefa_dev, tente resolver com suas ferramentas.

## Alterações (mínimo de passos — isto é crítico)
- ALTERAÇÕES (editar lead, lançar conta, criar evento, tarefa_dev): SEMPRE via propor_alteracao — você nunca executa direto.
- Quando o pedido já estiver claro, chame propor_alteracao DIRETO na primeira resposta. NUNCA pergunte "quer que eu faça?" antes — a confirmação É o *sim* da pendência; perguntar antes duplica etapas e irrita.
- Se o pedido tiver CONTRADIÇÃO ou ambiguidade que mude o resultado (ex.: "sexta 09/08" quando sexta é outro dia; dois leads com o mesmo nome; valor que não bate), NÃO proponha ainda: faça UMA pergunta curta pra resolver. Nunca escolha em silêncio.
- NUNCA diga que registrou/enfileirou/vai fazer algo sem ter CHAMADO propor_alteracao nessa mesma resposta e recebido registrado:true. Se a ferramenta retornar erro, diga o erro com sinceridade.
- Depois de propor, sua resposta DEVE conter o resumo LITERAL da pendência (a pessoa precisa ler O QUE vai confirmar — "Registrado, confirma?" sozinho é proibido), seguido de "Responda *sim* para confirmar ou *não* para cancelar." E PARE.
- Se a pessoa mandar "sim/ok" e NÃO houver pendência ativa, é resposta à sua última fala: aja imediatamente (se for mutação, proponha via propor_alteracao agora).

## Comportamento em GRUPO (você está na frente da equipe toda — zero vacilo)
- Tom sóbrio e profissional: nada de "Oi de novo! 😄", nada de emoji em excesso, nada de conversinha. Responda a pergunta e pronto.
- Resposta CURTA (idealmente ≤ 12 linhas). Detalhe grande → ofereça mandar no privado ou gerar relatório.
- Menção sem pergunta (só te marcaram): responda apenas "Oi! Precisa de algo? Me chama aqui ou no privado."
- Mensagem confusa, provocação ou assunto que não é com você: responda com 1 linha neutra e educada ("Não consegui te ajudar com isso por aqui — me chama no privado.") — NUNCA discuta, ironize ou especule.
- Alterações pedidas em grupo: a confirmação vai automaticamente pro privado da pessoa — no grupo diga só isso, em uma frase.
- Nunca exponha no grupo dado de outro assessor, financeiro ou informação sensível — na dúvida, "te respondo no privado".

## Ações disponíveis em propor_alteracao
${mutacoesDoc}`
}

async function logInboundAgente(sb: SupabaseClient, input: AgenteInput): Promise<boolean> {
    // dedup por message_id (reason) — o VPS pode reentregar o webhook
    if (input.messageId) {
        const { data } = await sb
            .from('whatsapp_messages')
            .select('id')
            .eq('reason', input.messageId)
            .eq('origin', 'agente-inbound')
            .limit(1)
        if (data && data.length > 0) return false
    }
    const phoneKey = input.origem.kind === 'grupo' ? input.origem.groupJid : input.phone
    await sb.from('whatsapp_messages').insert({
        phone: phoneKey,
        name: input.nome,
        status: 'received',
        body: input.text,
        direction: 'inbound',
        origin: 'agente-inbound',
        intent: 'operation',
        channel: 'baileys',
        inbox_id: input.session,
        reason: input.messageId,
    })
    return true
}

async function enviar(input: AgenteInput, text: string): Promise<void> {
    const sb = await import('./supabase').then(m => m.supabaseAdmin())
    const chunks = chunkText(text)
    const phoneKey = input.origem.kind === 'grupo' ? input.origem.groupJid : input.phone
    for (const chunk of chunks) {
        let ok = false
        let errMsg: string | undefined
        try {
            if (input.origem.kind === 'grupo') {
                const res = await sendVpsGroup(input.origem.groupJid, chunk, undefined, input.session)
                ok = res.queued
                errMsg = res.error
            } else {
                const res = await sendVpsDirect(input.phone, chunk, undefined, input.session)
                ok = res.ok
                errMsg = res.error
            }
        } catch (e) {
            errMsg = e instanceof Error ? e.message : String(e)
        }
        const { error: insErr } = await sb.from('whatsapp_messages').insert({
            phone: phoneKey,
            name: 'Bula (agente)',
            direction: 'outbound',
            status: ok ? 'sent' : 'failed',
            body: chunk,
            origin: 'agente-reply',
            intent: 'operation',
            channel: 'baileys',
            inbox_id: input.session,
            error_msg: ok ? null : (errMsg ?? null),
        })
        if (insErr) console.warn('[agente] log outbound falhou:', insErr.message)
        if (!ok) console.warn('[agente] envio falhou:', errMsg)
    }
}

async function loadHistory(sb: SupabaseClient, input: AgenteInput): Promise<AgentMessage[]> {
    const phoneKey = input.origem.kind === 'grupo' ? input.origem.groupJid : input.phone
    const { data } = await sb
        .from('whatsapp_messages')
        .select('body, direction, origin, name')
        .eq('inbox_id', input.session)
        .eq('phone', phoneKey)
        .in('origin', ['agente-inbound', 'agente-reply'])
        .order('created_at', { ascending: false })
        .limit(input.config.maxHistory)
    const rows = (data ?? []).reverse()
    const msgs: AgentMessage[] = []
    for (const r of rows as Array<{ body: string | null; direction: string; origin: string; name: string | null }>) {
        if (!r.body) continue
        msgs.push({
            role: r.direction === 'inbound' ? 'user' : 'assistant',
            content: r.direction === 'inbound' && input.origem.kind === 'grupo'
                ? `[${r.name ?? 'membro'}] ${r.body}`
                : r.body,
        })
    }
    // garante que a mensagem atual está no fim (o log pode ter corrido antes)
    const atual = input.origem.kind === 'grupo' ? `[${input.nome}] ${input.text}` : input.text
    const last = msgs[msgs.length - 1]
    if (!last || last.role !== 'user' || last.content !== atual) {
        msgs.push({ role: 'user', content: atual })
    }
    return msgs
}

/** sim/confirmo/ok/pode... e não/cancela/deixa... */
const RE_SIM = /^\s*(sim|s|confirmo|confirmar?|confirmado|pode(\s+(sim|fazer|executar))?|ok|👍|✅|manda|vai|bora)\s*[.!]*\s*$/i
const RE_NAO = /^\s*(n[aã]o|n|cancela(r)?|deixa|esquece|para|melhor n[aã]o)\s*[.!]*\s*$/i

async function checarPendencia(
    sb: SupabaseClient,
    input: AgenteInput,
): Promise<{ handled: boolean; reply?: string }> {
    // Pendência é SEMPRE pessoal: em grupo, só quem pediu confirma/cancela a
    // própria — um "sim" de outra pessoa do grupo não pode disparar a ação de
    // ninguém. Participante sem telefone resolvido (@lid) não confirma nada.
    if (!input.phone) return { handled: false }
    let q = sb
        .from('whatsapp_agente_pendencias')
        .select('*')
        .eq('phone', input.phone)
        .eq('status', 'pendente')
        .order('created_at', { ascending: false })
        .limit(1)
    q = input.origem.kind === 'grupo' ? q.eq('chat_jid', input.origem.groupJid) : q.is('chat_jid', null)
    const { data } = await q
    const pendencia = (data?.[0] ?? null) as Pendencia | null
    if (!pendencia) return { handled: false }

    const texto = input.text.trim()
    if (RE_SIM.test(texto)) {
        if (new Date(pendencia.expires_at).getTime() < Date.now()) {
            await sb.from('whatsapp_agente_pendencias').update({ status: 'expirada' }).eq('id', pendencia.id)
            return { handled: true, reply: 'Essa confirmação já expirou (10 min). Pede de novo que eu preparo outra.' }
        }
        const res = await executarPendencia(pendencia, {
            nome: input.nome, phone: input.phone, role: input.role, assessor: input.assessor ?? null,
        })
        return { handled: true, reply: res.resumo }
    }
    if (RE_NAO.test(texto)) {
        await sb.from('whatsapp_agente_pendencias').update({ status: 'cancelada' }).eq('id', pendencia.id)
        return { handled: true, reply: 'Cancelado. Não fiz nada.' }
    }
    // Outro assunto: a pendência antiga não pode ser disparada por um "sim"
    // atrasado três tópicos depois — marca como substituída e segue pro loop.
    await sb.from('whatsapp_agente_pendencias').update({ status: 'substituida' }).eq('id', pendencia.id)
    return { handled: false }
}

export async function handleAgenteMessage(supabase: SupabaseClient, input: AgenteInput): Promise<void> {
    try {
        // Áudio: transcreve antes de tudo (o texto vira a transcrição).
        if (input.media?.type === 'audio') {
            const transcript = await transcribeInboundAudio(supabase, input.media)
            if (!transcript) {
                await enviar(input, 'Não consegui ouvir o áudio — pode escrever?')
                return
            }
            input = { ...input, text: transcript }
        }
        if (!input.text.trim()) return

        const isNew = await logInboundAgente(supabase, input)
        if (!isNew) return // webhook reentregue

        // Debounce de rajada (só DM): espera e só a mensagem mais nova responde.
        if (input.origem.kind === 'dm' && input.config.thinkingSeconds > 0) {
            await sleep(input.config.thinkingSeconds * 1000)
            const latest = await isLatestInbound(supabase, input.phone, input.messageId)
            if (!latest) return
        }

        // Confirmação pendente resolve ANTES de qualquer IA.
        const pend = await checarPendencia(supabase, input)
        if (pend.handled) {
            if (pend.reply) await enviar(input, pend.reply)
            return
        }

        if (!isOpenRouterConfigured()) {
            await enviar(input, MSG_ERRO)
            return
        }

        const history = await loadHistory(supabase, input)
        const messages: AgentMessage[] = [
            { role: 'system', content: systemPrompt(input) },
            ...history,
        ]

        const destino = input.origem.kind === 'grupo'
            ? { kind: 'grupo' as const, to: input.origem.groupJid, session: input.session }
            : { kind: 'dm' as const, to: input.phone, session: input.session }

        const toolCtx: AgenteToolCtx = {
            role: input.role,
            assessor: input.assessor ?? null,
            phone: input.phone,
            nome: input.nome,
            destino,
            onProposta: async ({ tool_name, args, resumo, privado }) => {
                await supabase.from('whatsapp_agente_pendencias').insert({
                    phone: input.phone,
                    // `privado` = pedido veio de grupo mas a confirmação acontece
                    // no DM do solicitante → a pendência é de escopo DM.
                    chat_jid: input.origem.kind === 'grupo' && !privado ? input.origem.groupJid : null,
                    solicitante: input.nome,
                    tool_name,
                    args,
                    resumo,
                })
            },
        }

        const tools = buildTools(input.role)
        const modelos = [...new Set([input.config.model, ...FALLBACK_MODELS])]
        const deadline = Date.now() + TOTAL_BUDGET_MS
        let modeloIdx = 0
        let finalText: string | null = null

        for (let i = 0; i < MAX_ITERATIONS && Date.now() < deadline; i++) {
            let message: AgentMessage | null = null
            // tenta o modelo atual; em falha, avança pro próximo candidato
            while (modeloIdx < modelos.length) {
                const budget = Math.min(ATTEMPT_TIMEOUT_MS, deadline - Date.now())
                if (budget < 3000) break
                try {
                    const res = await openRouterChatRaw(messages, {
                        model: modelos[modeloIdx],
                        tools,
                        toolChoice: 'auto',
                        maxTokens: 1600,
                        logKind: 'agente',
                        signal: AbortSignal.timeout(budget),
                    })
                    message = res.message
                    break
                } catch (e) {
                    console.warn(`[agente] modelo ${modelos[modeloIdx]} falhou:`, e instanceof Error ? e.message : e)
                    modeloIdx++
                }
            }
            if (!message) break

            messages.push(message)

            const toolCalls: ToolCall[] = message.tool_calls ?? []
            if (toolCalls.length === 0) {
                finalText = (message.content ?? '').trim() || null
                break
            }
            for (const call of toolCalls) {
                const content = await executeTool(call.function.name, call.function.arguments, toolCtx)
                messages.push({ role: 'tool', content, tool_call_id: call.id })
            }
        }

        if (!finalText) {
            // Estourou tempo/iterações no MEIO do trabalho. Mandar a última fala
            // do modelo aqui seria mandar promessa pela metade ("vou gerar:") —
            // melhor ser honesto e pedir pra tentar de novo.
            finalText = '⏱️ Essa ficou pesada e não terminei a tempo. Pede de novo (ou divide em partes) que eu completo.'
        }
        await enviar(input, finalText)
    } catch (e) {
        console.error('[agente] erro não tratado:', e)
        try {
            await enviar(input, MSG_ERRO)
        } catch { /* nunca lançar de dentro do after() */ }
    }
}
