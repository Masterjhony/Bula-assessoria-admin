/**
 * Central Operacional — transforma sinais das conversas profissionais do
 * WhatsApp em itens de triagem, diário e planos de ação revisáveis.
 *
 * Princípios de segurança:
 *   1. allowlist estrita em operational_sources;
 *   2. nenhuma mensagem é enviada durante a triagem;
 *   3. plano nasce em awaiting_approval;
 *   4. ação financeira sempre exige aprovação separada;
 *   5. evidência original e decisões ficam auditáveis.
 */

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isOpenRouterConfigured, openRouterJSON } from './openrouter'
import { normalizePhone, phoneVariants } from './whatsapp-central'

export type OperationalArea = 'cadastros' | 'comercial' | 'marketing' | 'financeiro' | 'cobrancas'
export type OperationalKind =
    | 'solicitacao' | 'decisao' | 'prazo' | 'tarefa' | 'catalogo' | 'lance'
    | 'comprovante' | 'documento' | 'midia_marketing' | 'risco' | 'informacao'
export type OperationalPriority = 'baixa' | 'normal' | 'alta' | 'urgente'
export type OperationalActionType =
    | 'research' | 'draft_message' | 'send_whatsapp' | 'wait_reply' | 'create_task'
    | 'update_record' | 'financial_action' | 'manual' | 'notify_requester'

export interface OperationalSource {
    id: string
    label: string
    source_kind: 'contact' | 'group' | 'unknown'
    inbox_id: string
    phone: string | null
    whatsapp_jid: string | null
    areas: OperationalArea[]
    aliases: string[]
    active: boolean
}

export interface OperationalMedia {
    bucket?: string | null
    path?: string | null
    type?: string | null
    mime?: string | null
    filename?: string | null
    size?: number | null
}

export interface OperationalInbound {
    inboxId?: string | null
    sessionId?: string | null
    chatJid?: string | null
    chatName?: string | null
    senderJid?: string | null
    senderName?: string | null
    phone?: string | null
    isGroup?: boolean
    direction?: 'inbound' | 'outbound'
    body?: string | null
    quotedBody?: string | null
    externalMessageId?: string | null
    whatsappMessageId?: string | null
    occurredAt?: string | null
    media?: OperationalMedia | null
}

export interface OperationalClassification {
    kind: OperationalKind
    title: string
    summary: string
    confidence: number
    priority: OperationalPriority
    reason: string
    relevant: boolean
    shouldPlan: boolean
    shouldDiary: boolean
}

interface AiPlanStep {
    action_type?: string
    title?: string
    description?: string
    target_label?: string | null
    target_phone?: string | null
    draft_body?: string | null
    separate_approval?: boolean
    action_payload?: Record<string, unknown>
}

interface AiPlan {
    title?: string
    objective?: string
    expected_outcome?: string
    priority?: string
    risk_level?: string
    due_at?: string | null
    context?: string
    steps?: AiPlanStep[]
}

const ACTION_TYPES = new Set<OperationalActionType>([
    'research', 'draft_message', 'send_whatsapp', 'wait_reply', 'create_task',
    'update_record', 'financial_action', 'manual', 'notify_requester',
])

const REQUEST_RE = /\b(verifica(?:r|)|verifique|confirma(?:r|)|confirme|pergunta(?:r|)|pergunte|entr(?:a|e)\s+em\s+contato|fal(?:a|e)\s+com|v[êe](?:r|)|veja\s+com|preciso\s+que|pode\s+(?:falar|ver|confirmar|perguntar)|poderia|consegue|por\s+favor|manda(?:r|)|envia(?:r|)|agenda(?:r|)|agende|cobra(?:r|)|cobre)\b/i
const DECISION_RE = /\b(ficou\s+decidid[oa]|decidimos|decidi|aprovad[oa]|recusad[oa]|vamos\s+(?:fazer|seguir)|fechado|combinado|definimos|a\s+decis[aã]o\s+[ée])\b/i
const DEADLINE_RE = /\b(hoje|amanh[aã]|at[eé]\s+(?:segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)|prazo|venc(?:e|imento)|urgente|ainda\s+hoje)\b/i
const RISK_RE = /\b(risco|problema|bloquead[oa]|n[aã]o\s+consegue|atrasad[oa]|inadimpl|erro|falhou|pendente)\b/i
const CATALOG_RE = /\b(cat[aá]logo|catalogo)\b|catalog/i
const LANCE_RE = /\b(lance|lote\s*\d+|levamos|arremat|comprador\s+do\s+lote)\b/i
const RECEIPT_RE = /\b(comprovante|boleto|nota\s+fiscal|nf-?e|extrato|pix|pagamento)\b/i

function normalized(value: string | null | undefined): string {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

function clampConfidence(value: number): number {
    return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000))
}

function compact(value: string, max = 220): string {
    const oneLine = value.replace(/\s+/g, ' ').trim()
    return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`
}

function externalKey(input: OperationalInbound): string {
    const inbox = input.inboxId || input.sessionId || 'joao'
    const chat = input.chatJid || normalizePhone(input.phone || '') || input.chatName || 'unknown'
    if (input.externalMessageId) return `${inbox}:${chat}:${input.externalMessageId}`
    const digest = createHash('sha256')
        .update(JSON.stringify([chat, input.senderJid, input.body, input.occurredAt, input.media?.path]))
        .digest('hex')
        .slice(0, 24)
    return `${inbox}:${chat}:hash-${digest}`
}

/** Resolve a conversa contra a allowlist e preenche identificadores ausentes
 * quando o casamento por rótulo é exato. Nunca cria fonte nova implicitamente. */
export async function resolveOperationalSource(
    supabase: SupabaseClient,
    input: OperationalInbound,
): Promise<OperationalSource | null> {
    const incomingInbox = input.inboxId || input.sessionId || 'joao'
    // `joao-automation` é o id usado quando a sessão está em modo somente
    // coleta; `joao` é o id lógico/canônico salvo na allowlist.
    if (!['joao', 'joao-automation'].includes(incomingInbox)) return null
    const inboxId = 'joao'

    const { data, error } = await supabase
        .from('operational_sources')
        .select('id, label, source_kind, inbox_id, phone, whatsapp_jid, areas, aliases, active')
        .eq('inbox_id', inboxId)
        .eq('active', true)
        .limit(100)
    if (error || !data?.length) return null

    const sources = data as OperationalSource[]
    const jid = (input.chatJid || '').trim()
    const phone = normalizePhone(input.phone || (jid.endsWith('@s.whatsapp.net') ? jid.split('@')[0] : ''))
    const candidates = input.isGroup
        ? [input.chatName]
        : [input.chatName, input.senderName]
    const candidateKeys = new Set(candidates.map(normalized).filter(Boolean))

    let source = jid ? sources.find(s => s.whatsapp_jid === jid) : undefined
    if (!source && phone) source = sources.find(s => normalizePhone(s.phone || '') === phone)
    if (!source && candidateKeys.size) {
        source = sources.find(s => {
            if (input.isGroup && s.source_kind === 'contact') return false
            if (!input.isGroup && s.source_kind === 'group') return false
            return [s.label, ...(s.aliases || [])].some(v => candidateKeys.has(normalized(v)))
        })
    }
    if (!source) return null

    // Binding seguro: só após match exato de uma fonte já aprovada.
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    let changed = false
    if (input.isGroup && jid.endsWith('@g.us') && !source.whatsapp_jid) {
        patch.whatsapp_jid = jid
        source.whatsapp_jid = jid
        changed = true
    }
    if (!input.isGroup && phone && !source.phone) {
        patch.phone = phone
        source.phone = phone
        changed = true
    }
    if (changed) await supabase.from('operational_sources').update(patch).eq('id', source.id)
    return source
}

export function classifyOperationalSignal(
    input: OperationalInbound,
    source: OperationalSource,
): OperationalClassification {
    const text = `${input.body || ''}\n${input.quotedBody || ''}`.trim()
    const filename = input.media?.filename || ''
    const combined = `${text}\n${filename}`
    const inbound = (input.direction || 'inbound') === 'inbound'
    const mediaType = input.media?.type || ''
    const isPdf = /pdf/i.test(input.media?.mime || '') || /\.pdf$/i.test(filename)

    if (isPdf && CATALOG_RE.test(combined)) {
        return {
            kind: 'catalogo', title: filename || 'Catálogo recebido', summary: compact(text || filename),
            confidence: 0.96, priority: 'normal', reason: 'PDF com sinal explícito de catálogo',
            relevant: true, shouldPlan: false, shouldDiary: false,
        }
    }
    if (inbound && REQUEST_RE.test(text)) {
        const urgent = DEADLINE_RE.test(text)
        return {
            kind: 'solicitacao', title: compact(text, 90) || 'Solicitação recebida', summary: compact(text),
            confidence: 0.88, priority: urgent ? 'alta' : 'normal',
            reason: 'Linguagem de pedido ou delegação detectada em fonte autorizada',
            relevant: true, shouldPlan: true, shouldDiary: false,
        }
    }
    if (DECISION_RE.test(text)) {
        return {
            kind: 'decisao', title: compact(text, 90) || 'Decisão registrada', summary: compact(text),
            confidence: 0.9, priority: 'alta', reason: 'Expressão explícita de decisão ou aprovação',
            relevant: true, shouldPlan: false, shouldDiary: true,
        }
    }
    if (RISK_RE.test(text) && inbound) {
        return {
            kind: 'risco', title: compact(text, 90), summary: compact(text), confidence: 0.78,
            priority: DEADLINE_RE.test(text) ? 'alta' : 'normal', reason: 'Sinal de bloqueio, atraso ou risco',
            relevant: true, shouldPlan: true, shouldDiary: false,
        }
    }
    if (LANCE_RE.test(text) && source.areas.includes('comercial')) {
        return {
            kind: 'lance', title: compact(text, 90), summary: compact(text), confidence: 0.82,
            priority: 'normal', reason: 'Vocabulário de lote/lance em fonte comercial',
            relevant: true, shouldPlan: false, shouldDiary: false,
        }
    }
    if (RECEIPT_RE.test(combined) && (source.areas.includes('financeiro') || source.areas.includes('cobrancas'))) {
        return {
            kind: 'comprovante', title: filename || compact(text, 90) || 'Documento financeiro',
            summary: compact(text || filename), confidence: 0.84, priority: DEADLINE_RE.test(text) ? 'alta' : 'normal',
            reason: 'Documento ou mensagem financeira em fonte autorizada',
            relevant: true, shouldPlan: inbound && REQUEST_RE.test(text), shouldDiary: false,
        }
    }
    if (mediaType === 'image' || mediaType === 'video') {
        return {
            kind: source.areas.includes('marketing') ? 'midia_marketing' : 'informacao',
            title: filename || `${mediaType === 'video' ? 'Vídeo' : 'Imagem'} recebida`, summary: compact(text || filename),
            confidence: source.areas.includes('marketing') ? 0.82 : 0.62, priority: 'normal',
            reason: 'Mídia recebida de fonte autorizada', relevant: true, shouldPlan: false, shouldDiary: false,
        }
    }
    if (input.media?.path) {
        return {
            kind: 'documento', title: filename || 'Arquivo recebido', summary: compact(text || filename),
            confidence: 0.72, priority: 'normal', reason: 'Anexo recebido de fonte autorizada',
            relevant: true, shouldPlan: false, shouldDiary: false,
        }
    }
    if (DEADLINE_RE.test(text) && inbound) {
        return {
            kind: 'prazo', title: compact(text, 90), summary: compact(text), confidence: 0.7,
            priority: 'alta', reason: 'Prazo explícito em fonte autorizada', relevant: true,
            shouldPlan: true, shouldDiary: false,
        }
    }
    return {
        kind: 'informacao', title: compact(text, 90) || 'Informação recebida', summary: compact(text),
        confidence: 0.35, priority: 'normal', reason: 'Sem sinal operacional suficiente',
        relevant: false, shouldPlan: false, shouldDiary: false,
    }
}

async function recentContext(supabase: SupabaseClient, input: OperationalInbound): Promise<string> {
    const chatJid = input.chatJid || ''
    const phone = normalizePhone(input.phone || '')
    let query = supabase
        .from('whatsapp_messages')
        .select('name, body, direction, created_at')
        .order('created_at', { ascending: false })
        .limit(12)
    if (chatJid) query = query.eq('phone', chatJid)
    else if (phone) query = query.in('phone', phoneVariants(phone))
    else return ''
    const { data } = await query
    return (data || []).reverse().map(m => {
        const who = m.direction === 'outbound' ? 'João' : (m.name || 'Contato')
        return `[${who}] ${compact(m.body || '', 500)}`
    }).join('\n')
}

function fallbackPlan(
    input: OperationalInbound,
    source: OperationalSource,
    classification: OperationalClassification,
): Required<Pick<AiPlan, 'title' | 'objective' | 'expected_outcome' | 'priority' | 'risk_level' | 'context' | 'steps'>> & Pick<AiPlan, 'due_at'> {
    const financial = source.areas.some(a => a === 'financeiro' || a === 'cobrancas')
    const target = input.body?.match(/(?:com|pro|para\s+o|para\s+a)\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\p{L} .'-]{2,40})/u)?.[1]?.trim() || null
    return {
        title: classification.title,
        objective: compact(input.body || classification.summary, 500),
        expected_outcome: 'Solicitação atendida, resposta registrada e solicitante atualizado.',
        priority: classification.priority,
        risk_level: financial ? 'medium' : 'low',
        due_at: null,
        context: classification.summary,
        steps: [
            {
                action_type: 'research', title: 'Confirmar contexto e destinatário',
                description: 'Conferir a conversa, os dados internos relacionados e identificar com precisão a pessoa envolvida.',
                target_label: target,
            },
            {
                action_type: 'draft_message', title: 'Preparar abordagem',
                description: 'Redigir uma mensagem objetiva, preservando o contexto do pedido.', target_label: target,
                draft_body: 'Olá! Tudo bem? O João, da Bula Assessoria, pediu para confirmar uma informação com você. Podemos falar por aqui?',
            },
            {
                action_type: 'send_whatsapp', title: 'Entrar em contato',
                description: 'Enviar uma única mensagem pelo WhatsApp após aprovação específica.', target_label: target,
                separate_approval: true,
            },
            {
                action_type: 'wait_reply', title: 'Aguardar e interpretar a resposta',
                description: 'Monitorar a resposta e pausar se surgir uma decisão fora do plano.', target_label: target,
            },
            ...(financial ? [{
                action_type: 'financial_action', title: 'Preparar providência financeira',
                description: 'Preparar boleto, agendamento ou registro conforme a preferência recebida. Exige nova aprovação.',
                target_label: target, separate_approval: true,
            }] : []),
            {
                action_type: 'update_record', title: 'Registrar desfecho',
                description: 'Atualizar o Diário Operacional e os módulos relacionados com a evidência da conclusão.',
            },
        ],
    }
}

async function proposePlan(
    supabase: SupabaseClient,
    input: OperationalInbound,
    source: OperationalSource,
    classification: OperationalClassification,
): Promise<AiPlan> {
    const fallback = fallbackPlan(input, source, classification)
    if (!isOpenRouterConfigured()) return fallback
    try {
        const context = await recentContext(supabase, input)
        const result = await openRouterJSON<AiPlan>([
            {
                role: 'system',
                content: `Você é o planejador operacional da Bula Assessoria. Transforme um pedido de WhatsApp em um plano curto, executável e auditável.\n\nRegras obrigatórias:\n- Não invente pessoas, telefones, valores, prazos ou fatos.\n- Se faltar dado, crie etapa manual/research para obtê-lo.\n- Mensagem externa usa draft_message e depois send_whatsapp; toda etapa send_whatsapp ou notify_requester usa separate_approval=true.\n- Depois de enviar, inclua wait_reply quando houver resposta necessária.\n- Boleto, PIX, pagamento, agendamento financeiro ou alteração contábil usa financial_action com separate_approval=true.\n- O plano inteiro será revisado por um humano antes de começar.\n- action_type permitido: research, draft_message, send_whatsapp, wait_reply, create_task, update_record, financial_action, manual, notify_requester.\n- Retorne JSON com title, objective, expected_outcome, priority (baixa|normal|alta|urgente), risk_level (low|medium|high), due_at (ISO ou null), context e steps[]. Cada step: action_type, title, description, target_label, target_phone, draft_body, separate_approval, action_payload.`,
            },
            {
                role: 'user',
                content: `Fonte: ${source.label}\nÁreas: ${source.areas.join(', ')}\nRemetente: ${input.senderName || source.label}\nPedido atual: ${input.body || ''}\nMensagem citada: ${input.quotedBody || ''}\n\nContexto recente:\n${context || '(indisponível)'}`,
            },
        ], {
            temperature: 0.15,
            maxTokens: 1400,
            logKind: 'operational_plan',
            signal: AbortSignal.timeout(35000),
        })
        return result?.steps?.length ? { ...fallback, ...result } : fallback
    } catch (error) {
        console.warn('[Central Operacional] plano IA falhou; usando fallback:', error instanceof Error ? error.message : error)
        return fallback
    }
}

async function resolveStepTarget(
    supabase: SupabaseClient,
    step: AiPlanStep,
): Promise<{ sourceId: string | null; label: string | null; phone: string | null }> {
    const explicitPhone = normalizePhone(step.target_phone || '') || null
    const label = compact(step.target_label || '', 120) || null
    const { data } = await supabase
        .from('operational_sources')
        .select('id, label, phone')
        .eq('active', true)
        .limit(100)
    if (explicitPhone) {
        const target = (data || []).find(s => normalizePhone(s.phone || '') === explicitPhone)
        return { sourceId: target?.id || null, label: target?.label || label, phone: explicitPhone }
    }
    if (!label) return { sourceId: null, label: null, phone: null }
    const target = (data || []).find(s => normalized(s.label) === normalized(label))
    return { sourceId: target?.id || null, label: target?.label || label, phone: target?.phone || null }
}

export async function generateOperationalPlan(
    supabase: SupabaseClient,
    itemId: string,
    input: OperationalInbound,
    source: OperationalSource,
    classification: OperationalClassification,
): Promise<string | null> {
    const { data: existing } = await supabase
        .from('operational_plans')
        .select('id')
        .eq('item_id', itemId)
        .not('status', 'in', '(rejected,cancelled)')
        .limit(1)
    if (existing?.[0]?.id) return existing[0].id

    const proposal = await proposePlan(supabase, input, source, classification)
    const priority: OperationalPriority = ['baixa','normal','alta','urgente'].includes(proposal.priority || '')
        ? proposal.priority as OperationalPriority : classification.priority
    const risk = ['low','medium','high'].includes(proposal.risk_level || '') ? proposal.risk_level! : 'medium'

    const { data: plan, error } = await supabase
        .from('operational_plans')
        .insert({
            item_id: itemId,
            title: compact(proposal.title || classification.title, 180),
            objective: compact(proposal.objective || classification.summary, 1200),
            requester: input.senderName || source.label,
            requester_source_id: source.id,
            areas: source.areas,
            status: 'awaiting_approval',
            priority,
            due_at: proposal.due_at && !Number.isNaN(Date.parse(proposal.due_at)) ? proposal.due_at : null,
            expected_outcome: compact(proposal.expected_outcome || '', 1200) || null,
            context: compact(proposal.context || classification.summary, 2000),
            risk_level: risk,
            approval_scope: {
                allows_whatsapp_messages: true,
                allows_financial_changes: false,
                stops_on_unplanned_decision: true,
            },
            proposed_by: isOpenRouterConfigured() ? 'ai_with_fallback' : 'rules',
        })
        .select('id')
        .single()
    if (error || !plan) {
        console.warn('[Central Operacional] criar plano:', error?.message)
        return null
    }

    const rawSteps = (proposal.steps || []).slice(0, 12)
    const rows = []
    for (let index = 0; index < rawSteps.length; index++) {
        const raw = rawSteps[index]
        const actionType = ACTION_TYPES.has(raw.action_type as OperationalActionType)
            ? raw.action_type as OperationalActionType : 'manual'
        const target = await resolveStepTarget(supabase, raw)
        const isFinancial = actionType === 'financial_action'
        const isExternalMessage = actionType === 'send_whatsapp' || actionType === 'notify_requester'
        rows.push({
            plan_id: plan.id,
            position: (index + 1) * 1000,
            action_type: actionType,
            title: compact(raw.title || `Etapa ${index + 1}`, 180),
            description: compact(raw.description || '', 1200) || null,
            status: 'pending',
            requires_approval: true,
            separate_approval: isFinancial || isExternalMessage || !!raw.separate_approval,
            target_source_id: target.sourceId,
            target_label: target.label,
            target_phone: target.phone,
            draft_body: compact(raw.draft_body || '', 4000) || null,
            action_payload: raw.action_payload || {},
        })
    }
    if (rows.length) await supabase.from('operational_plan_steps').insert(rows)
    await supabase.from('operational_items').update({ state: 'planned', updated_at: new Date().toISOString() }).eq('id', itemId)
    await supabase.from('operational_execution_events').insert({
        plan_id: plan.id,
        event_type: 'plan_proposed',
        payload: { source: source.label, classification: classification.kind, step_count: rows.length },
    })
    return plan.id
}

async function registerDiary(
    supabase: SupabaseClient,
    itemId: string,
    input: OperationalInbound,
    source: OperationalSource,
    classification: OperationalClassification,
): Promise<void> {
    const { data: existing } = await supabase
        .from('operational_diary_entries')
        .select('id')
        .eq('item_id', itemId)
        .limit(1)
    if (existing?.length) return
    await supabase.from('operational_diary_entries').insert({
        item_id: itemId,
        kind: classification.kind,
        areas: source.areas,
        title: classification.title,
        summary: classification.summary,
        status: 'captured',
        occurred_at: input.occurredAt || new Date().toISOString(),
        source_evidence: {
            source: source.label,
            sender: input.senderName || null,
            message_id: input.externalMessageId || null,
            body: input.body || '',
        },
    })
}

/** Entrada principal. Retorna ignored para qualquer conversa fora da allowlist. */
export async function ingestOperationalSignal(
    supabase: SupabaseClient,
    input: OperationalInbound,
): Promise<{ kind: 'ignored' | 'not_relevant' | 'captured'; itemId?: string; planId?: string | null; reason?: string }> {
    const source = await resolveOperationalSource(supabase, input)
    if (!source) return { kind: 'ignored', reason: 'source_not_allowlisted' }

    const classification = classifyOperationalSignal(input, source)
    if (!classification.relevant) return { kind: 'not_relevant', reason: classification.reason }

    const key = externalKey(input)
    const { data: existing } = await supabase
        .from('operational_items')
        .select('id')
        .eq('external_key', key)
        .maybeSingle()
    if (existing?.id) return { kind: 'captured', itemId: existing.id, reason: 'deduped' }

    const { data: item, error } = await supabase
        .from('operational_items')
        .insert({
            external_key: key,
            source_id: source.id,
            source_label: source.label,
            source_chat_jid: input.chatJid || null,
            source_sender_jid: input.senderJid || null,
            source_sender_name: input.senderName || null,
            inbox_id: input.inboxId || input.sessionId || 'joao',
            external_message_id: input.externalMessageId || null,
            whatsapp_message_id: input.whatsappMessageId || null,
            direction: input.direction || 'inbound',
            occurred_at: input.occurredAt || new Date().toISOString(),
            body: input.body || '',
            quoted_body: input.quotedBody || null,
            media_bucket: input.media?.bucket || (input.media?.path ? 'whatsapp-media' : null),
            media_path: input.media?.path || null,
            media_type: input.media?.type || null,
            media_mime: input.media?.mime || null,
            media_filename: input.media?.filename || null,
            media_size: input.media?.size || null,
            kind: classification.kind,
            areas: source.areas,
            title: classification.title,
            summary: classification.summary,
            confidence: clampConfidence(classification.confidence),
            priority: classification.priority,
            state: classification.shouldPlan ? 'planned' : 'pending',
            needs_review: true,
            classification_reason: classification.reason,
            metadata: { is_group: !!input.isGroup, source_kind: source.source_kind },
        })
        .select('id')
        .single()
    if (error || !item) {
        console.warn('[Central Operacional] ingestão:', error?.message)
        return { kind: 'not_relevant', reason: error?.message || 'insert_failed' }
    }

    let planId: string | null = null
    if (classification.shouldDiary) await registerDiary(supabase, item.id, input, source, classification)
    if (classification.shouldPlan) {
        planId = await generateOperationalPlan(supabase, item.id, input, source, classification)
    }
    return { kind: 'captured', itemId: item.id, planId }
}
