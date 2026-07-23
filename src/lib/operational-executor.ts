/** Executor supervisionado da Central Operacional.
 *
 * Só aceita planos com approved/operational. Para imediatamente em:
 *   - etapa financeira (aprovação separada obrigatória)
 *   - destinatário ou texto ausente
 *   - espera por resposta
 *   - ação manual / situação não prevista
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendOutbound } from './whatsapp-gateway'
import { normalizePhone } from './whatsapp-central'

const OPERATIONAL_CONTROL_ID = 'joao'
const OPERATIONAL_SESSION_ID = process.env.OPERATIONAL_WHATSAPP_SESSION_ID || 'joao-automation'

interface PlanRow {
    id: string
    item_id: string | null
    title: string
    objective: string
    requester: string | null
    areas: string[]
    status: string
    priority: string
    approval_scope: Record<string, unknown> | null
}

interface StepRow {
    id: string
    plan_id: string
    position: number
    action_type: string
    title: string
    description: string | null
    status: string
    separate_approval: boolean
    target_source_id: string | null
    target_label: string | null
    target_phone: string | null
    draft_body: string | null
    approved_body: string | null
    action_payload: Record<string, unknown> | null
    result: Record<string, unknown> | null
}

async function event(
    supabase: SupabaseClient,
    planId: string,
    eventType: string,
    stepId?: string | null,
    payload: Record<string, unknown> = {},
) {
    await supabase.from('operational_execution_events').insert({
        plan_id: planId,
        step_id: stepId || null,
        event_type: eventType,
        payload,
    })
}

async function setStep(
    supabase: SupabaseClient,
    stepId: string,
    values: Record<string, unknown>,
) {
    await supabase
        .from('operational_plan_steps')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', stepId)
}

async function setPlan(
    supabase: SupabaseClient,
    planId: string,
    values: Record<string, unknown>,
) {
    await supabase
        .from('operational_plans')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', planId)
}

async function previousDraft(
    supabase: SupabaseClient,
    planId: string,
    position: number,
): Promise<string | null> {
    const { data } = await supabase
        .from('operational_plan_steps')
        .select('draft_body, approved_body')
        .eq('plan_id', planId)
        .lt('position', position)
        .eq('action_type', 'draft_message')
        .order('position', { ascending: false })
        .limit(1)
    return data?.[0]?.approved_body || data?.[0]?.draft_body || null
}

async function updateSendAttempt(
    supabase: SupabaseClient,
    stepId: string,
    values: Record<string, unknown>,
) {
    await supabase
        .from('operational_send_attempts')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('step_id', stepId)
}

async function pauseAfterRepeatedFailures(supabase: SupabaseClient): Promise<void> {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await supabase
        .from('operational_send_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('inbox_id', OPERATIONAL_CONTROL_ID)
        .in('status', ['failed','delivery_uncertain'])
        .gte('claimed_at', since)
    if ((count || 0) < 3) return
    await supabase.from('operational_controls').update({
        outbound_enabled: false,
        paused_reason: 'Três falhas de envio na última hora.',
        updated_at: new Date().toISOString(),
    }).eq('id', OPERATIONAL_CONTROL_ID)
}

async function createTask(supabase: SupabaseClient, plan: PlanRow, step: StepRow): Promise<string | null> {
    const { data: max } = await supabase
        .from('tactical_tasks')
        .select('position')
        .eq('status', 'A fazer')
        .order('position', { ascending: false })
        .limit(1)
    const { data, error } = await supabase
        .from('tactical_tasks')
        .insert({
            title: step.title,
            description: step.description || `Gerada pelo plano operacional: ${plan.title}`,
            status: 'A fazer',
            priority: plan.priority === 'urgente' ? 'Alta' : 'Média',
            position: (max?.[0]?.position || 0) + 1000,
            unidade: 'bula_assessoria',
        })
        .select('id')
        .single()
    if (error) throw new Error(error.message)
    return data?.id || null
}

async function appendCompletionDiary(supabase: SupabaseClient, plan: PlanRow): Promise<void> {
    const { data: exists } = await supabase
        .from('operational_diary_entries')
        .select('id')
        .eq('plan_id', plan.id)
        .eq('status', 'completed')
        .limit(1)
    if (exists?.length) return
    await supabase.from('operational_diary_entries').insert({
        item_id: plan.item_id,
        plan_id: plan.id,
        kind: 'plano_concluido',
        areas: plan.areas,
        title: plan.title,
        summary: `Plano concluído: ${plan.objective}`,
        status: 'completed',
        occurred_at: new Date().toISOString(),
        source_evidence: { requester: plan.requester },
    })
}

export async function executeOperationalPlan(
    supabase: SupabaseClient,
    planId: string,
): Promise<{ status: string; reason?: string; stepId?: string }> {
    const [{ data: planData, error: planError }, { data: stepData, error: stepError }] = await Promise.all([
        supabase
            .from('operational_plans')
            .select('id, item_id, title, objective, requester, areas, status, priority, approval_scope')
            .eq('id', planId)
            .single(),
        supabase
            .from('operational_plan_steps')
            .select('id, plan_id, position, action_type, title, description, status, separate_approval, target_source_id, target_label, target_phone, draft_body, approved_body, action_payload, result')
            .eq('plan_id', planId)
            .order('position', { ascending: true }),
    ])
    if (planError || !planData) return { status: 'failed', reason: planError?.message || 'plan_not_found' }
    if (stepError) return { status: 'failed', reason: stepError.message }
    const plan = planData as PlanRow
    const steps = (stepData || []) as StepRow[]
    if (!['approved','executing'].includes(plan.status)) {
        return { status: plan.status, reason: 'plan_not_approved' }
    }

    await setPlan(supabase, plan.id, { status: 'executing', last_error: null })
    await event(supabase, plan.id, 'execution_started')

    for (const step of steps) {
        if (['completed','skipped'].includes(step.status)) continue
        if (step.separate_approval && step.status !== 'approved') {
            await setStep(supabase, step.id, { status: 'awaiting_approval' })
            await setPlan(supabase, plan.id, { status: 'awaiting_step_approval' })
            await event(supabase, plan.id, 'step_approval_required', step.id, { action_type: step.action_type })
            return { status: 'awaiting_step_approval', stepId: step.id }
        }

        await setStep(supabase, step.id, { status: 'executing', error_message: null })
        await event(supabase, plan.id, 'step_started', step.id, { action_type: step.action_type })

        try {
            if (step.action_type === 'research') {
                // O executor confirma o que é verificável no plano. Se o plano
                // marcou dependência externa, ela continua manual/aguardando.
                const needsManual = step.action_payload?.manual === true
                if (needsManual) {
                    await setStep(supabase, step.id, { status: 'waiting' })
                    await setPlan(supabase, plan.id, { status: 'waiting' })
                    return { status: 'waiting', stepId: step.id, reason: 'manual_research' }
                }
                await setStep(supabase, step.id, {
                    status: 'completed', executed_at: new Date().toISOString(),
                    result: { checked: true, note: 'Contexto aprovado como parte do plano.' },
                })
            } else if (step.action_type === 'draft_message') {
                if (!step.draft_body && !step.approved_body) {
                    await setStep(supabase, step.id, {
                        status: 'awaiting_approval',
                        error_message: 'Rascunho não definido. Edite a etapa antes de continuar.',
                    })
                    await setPlan(supabase, plan.id, { status: 'awaiting_step_approval' })
                    return { status: 'awaiting_step_approval', stepId: step.id, reason: 'draft_missing' }
                }
                await setStep(supabase, step.id, {
                    status: 'completed', executed_at: new Date().toISOString(),
                    approved_body: step.approved_body || step.draft_body,
                    result: { drafted: true },
                })
            } else if (step.action_type === 'send_whatsapp' || step.action_type === 'notify_requester') {
                const phone = normalizePhone(step.target_phone || '')
                const message = step.approved_body || step.draft_body || await previousDraft(supabase, plan.id, step.position)
                if (!phone || !message) {
                    await setStep(supabase, step.id, {
                        status: 'awaiting_approval',
                        error_message: !phone ? 'Destinatário sem telefone confirmado.' : 'Mensagem aprovada ausente.',
                    })
                    await setPlan(supabase, plan.id, { status: 'awaiting_step_approval' })
                    return { status: 'awaiting_step_approval', stepId: step.id, reason: !phone ? 'target_missing' : 'message_missing' }
                }

                // A aprovação do plano nunca basta para enviar. Cada mensagem
                // externa precisa de uma aprovação específica sobre esta etapa.
                if (!step.separate_approval || step.status !== 'approved') {
                    await setStep(supabase, step.id, {
                        status: 'awaiting_approval',
                        separate_approval: true,
                        approved_body: message,
                        error_message: 'A mensagem exige aprovação individual antes do envio.',
                    })
                    await setPlan(supabase, plan.id, { status: 'awaiting_step_approval' })
                    return { status: 'awaiting_step_approval', stepId: step.id, reason: 'message_approval_required' }
                }

                const { data: claim, error: claimError } = await supabase.rpc('claim_operational_send', {
                    p_plan_id: plan.id,
                    p_step_id: step.id,
                    p_recipient_phone: phone,
                    p_inbox_id: OPERATIONAL_CONTROL_ID,
                })
                const claimStatus = claimError ? `claim_error:${claimError.message}` : String(claim || 'claim_failed')
                if (claimStatus === 'already_sent') {
                    await setStep(supabase, step.id, {
                        status: 'completed', executed_at: new Date().toISOString(), approved_body: message,
                        result: { recovered: true, status: 'sent' },
                    })
                    continue
                }
                if (claimStatus !== 'claimed') {
                    await setStep(supabase, step.id, {
                        status: 'awaiting_approval',
                        error_message: `Envio protegido bloqueado: ${claimStatus}.`,
                    })
                    await setPlan(supabase, plan.id, { status: 'awaiting_step_approval', last_error: claimStatus })
                    await event(supabase, plan.id, 'send_blocked', step.id, { reason: claimStatus })
                    return { status: 'awaiting_step_approval', stepId: step.id, reason: claimStatus }
                }

                const sent = await sendOutbound(supabase, {
                    to: { phone, name: step.target_label },
                    text: message,
                    intent: 'operation',
                    channelHint: 'baileys',
                    inboxId: OPERATIONAL_SESSION_ID,
                    origin: 'central-operacional',
                    botStep: `operational:${plan.id}:${step.id}`,
                })
                if (sent.status !== 'sent') {
                    const uncertain = sent.status === 'queued'
                    await updateSendAttempt(supabase, step.id, {
                        status: uncertain ? 'delivery_uncertain' : 'failed',
                        transport_status: sent.status,
                        error_message: sent.reason || `send_${sent.status}`,
                        finished_at: new Date().toISOString(),
                    })
                    await pauseAfterRepeatedFailures(supabase)
                    throw new Error(uncertain ? 'delivery_uncertain_no_retry' : (sent.reason || `send_${sent.status}`))
                }
                await updateSendAttempt(supabase, step.id, {
                    status: 'sent', transport_status: sent.status,
                    message_id: sent.messageId || null, finished_at: new Date().toISOString(),
                })
                await setStep(supabase, step.id, {
                    status: 'completed', executed_at: new Date().toISOString(), approved_body: message,
                    result: { status: sent.status, channel: sent.channel, message_id: sent.messageId || null },
                })
            } else if (step.action_type === 'wait_reply') {
                if (!normalizePhone(step.target_phone || '')) {
                    await setStep(supabase, step.id, {
                        status: 'awaiting_approval', error_message: 'Informe o telefone cuja resposta será monitorada.',
                    })
                    await setPlan(supabase, plan.id, { status: 'awaiting_step_approval' })
                    return { status: 'awaiting_step_approval', stepId: step.id, reason: 'target_missing' }
                }
                await setStep(supabase, step.id, { status: 'waiting' })
                await setPlan(supabase, plan.id, { status: 'waiting' })
                await event(supabase, plan.id, 'waiting_for_reply', step.id, { phone: step.target_phone })
                return { status: 'waiting', stepId: step.id }
            } else if (step.action_type === 'create_task') {
                const taskId = await createTask(supabase, plan, step)
                await setStep(supabase, step.id, {
                    status: 'completed', executed_at: new Date().toISOString(), result: { task_id: taskId },
                })
            } else if (step.action_type === 'update_record') {
                await supabase.from('operational_diary_entries').insert({
                    item_id: plan.item_id,
                    plan_id: plan.id,
                    kind: 'andamento',
                    areas: plan.areas,
                    title: step.title,
                    summary: step.description || `Etapa concluída no plano ${plan.title}.`,
                    status: 'confirmed',
                    occurred_at: new Date().toISOString(),
                    source_evidence: { step_id: step.id },
                })
                await setStep(supabase, step.id, { status: 'completed', executed_at: new Date().toISOString() })
            } else {
                // financial_action e manual nunca são simuladas como concluídas.
                await setStep(supabase, step.id, { status: 'awaiting_approval' })
                await setPlan(supabase, plan.id, { status: 'awaiting_step_approval' })
                return { status: 'awaiting_step_approval', stepId: step.id, reason: step.action_type }
            }
            await event(supabase, plan.id, 'step_completed', step.id)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            await setStep(supabase, step.id, { status: 'failed', error_message: message })
            await setPlan(supabase, plan.id, { status: 'failed', last_error: message })
            await event(supabase, plan.id, 'step_failed', step.id, { error: message })
            return { status: 'failed', stepId: step.id, reason: message }
        }
    }

    await setPlan(supabase, plan.id, {
        status: 'completed',
        execution_summary: 'Todas as etapas aprovadas foram concluídas.',
    })
    await appendCompletionDiary(supabase, plan)
    await event(supabase, plan.id, 'plan_completed')
    return { status: 'completed' }
}

/** Uma resposta inbound conclui a espera ligada ao mesmo telefone e retoma o
 * plano. A retomada ainda para em qualquer nova barreira de aprovação. */
export async function resumeOperationalPlansForReply(
    supabase: SupabaseClient,
    phoneRaw: string,
    body: string,
    messageId?: string | null,
): Promise<number> {
    const phone = normalizePhone(phoneRaw)
    if (!phone) return 0
    const { data: waiting } = await supabase
        .from('operational_plan_steps')
        .select('id, plan_id, target_phone, status')
        .eq('status', 'waiting')
        .eq('action_type', 'wait_reply')
        .limit(50)
    const matches = (waiting || []).filter(s => normalizePhone(s.target_phone || '') === phone)
    for (const step of matches) {
        await setStep(supabase, step.id, {
            status: 'completed', executed_at: new Date().toISOString(),
            result: { reply: body, message_id: messageId || null, received_at: new Date().toISOString() },
        })
        await setPlan(supabase, step.plan_id, { status: 'approved' })
        await event(supabase, step.plan_id, 'reply_received', step.id, { phone, body, message_id: messageId || null })
        await executeOperationalPlan(supabase, step.plan_id)
    }
    return matches.length
}
