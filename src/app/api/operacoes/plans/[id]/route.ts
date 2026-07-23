import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { executeOperationalPlan } from '@/lib/operational-executor'
import { normalizePhone } from '@/lib/whatsapp-central'

const PLAN_FIELDS = new Set(['title','objective','expected_outcome','priority','due_at','context','risk_level'])

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id } = await ctx.params
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data, error } = await supabase
        .from('operational_plans')
        .select(`*, item:operational_items(*), steps:operational_plan_steps(*), approvals:operational_approvals(*), events:operational_execution_events(*)`)
        .eq('id', id)
        .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json({ plan: data })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id } = await ctx.params
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    let body: {
        action?: 'update' | 'approve' | 'approve_step' | 'reject' | 'pause' | 'resume' | 'cancel'
        note?: string
        step_id?: string
        plan?: Record<string, unknown>
        steps?: Array<{
            id: string; title?: string; description?: string | null; target_label?: string | null
            target_phone?: string | null; draft_body?: string | null; approved_body?: string | null
            separate_approval?: boolean
        }>
    }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const action = body.action || 'update'
    const now = new Date().toISOString()

    if (action === 'update') {
        const patch: Record<string, unknown> = { updated_at: now }
        for (const [field, value] of Object.entries(body.plan || {})) {
            if (PLAN_FIELDS.has(field)) patch[field] = value === '' ? null : value
        }
        const { data: current } = await supabase.from('operational_plans').select('version, status').eq('id', id).single()
        patch.version = (current?.version || 1) + 1
        if (current?.status === 'rejected') patch.status = 'awaiting_approval'
        const { error } = await supabase.from('operational_plans').update(patch).eq('id', id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        for (const step of body.steps || []) {
            const stepPatch: Record<string, unknown> = { updated_at: now }
            if (step.title !== undefined) stepPatch.title = step.title.trim()
            if (step.description !== undefined) stepPatch.description = step.description?.trim() || null
            if (step.target_label !== undefined) stepPatch.target_label = step.target_label?.trim() || null
            if (step.target_phone !== undefined) stepPatch.target_phone = normalizePhone(step.target_phone || '') || null
            if (step.draft_body !== undefined) stepPatch.draft_body = step.draft_body?.trim() || null
            if (step.approved_body !== undefined) stepPatch.approved_body = step.approved_body?.trim() || null
            if (step.separate_approval !== undefined) stepPatch.separate_approval = step.separate_approval
            await supabase.from('operational_plan_steps').update(stepPatch).eq('id', step.id).eq('plan_id', id)
        }
        await supabase.from('operational_approvals').insert({
            plan_id: id, decision: 'edit', actor_id: auth.userId, note: body.note || null,
            scope: { fields: Object.keys(body.plan || {}), steps: (body.steps || []).map(s => s.id) },
        })
        return NextResponse.json({ ok: true, status: patch.status || current?.status })
    }

    if (action === 'approve') {
        const { data: plan } = await supabase.from('operational_plans').select('status').eq('id', id).single()
        if (!plan || !['draft','awaiting_approval','paused','failed'].includes(plan.status)) {
            return NextResponse.json({ error: `Plano não pode ser aprovado no estado ${plan?.status || 'inexistente'}.` }, { status: 409 })
        }
        await supabase.from('operational_plans').update({
            status: 'approved', approved_by: auth.userId, approved_at: now,
            rejected_by: null, rejected_at: null, last_error: null, updated_at: now,
        }).eq('id', id)
        await supabase.from('operational_plan_steps').update({ status: 'approved', updated_at: now })
            .eq('plan_id', id).eq('separate_approval', false).in('status', ['pending','awaiting_approval','failed'])
        await supabase.from('operational_approvals').insert({
            plan_id: id, decision: 'approve', actor_id: auth.userId, note: body.note || null,
            scope: { plan: true, financial_changes: false },
        })
        after(() => executeOperationalPlan(supabase, id))
        return NextResponse.json({ ok: true, status: 'approved', execution_started: true })
    }

    if (action === 'approve_step') {
        if (!body.step_id) return NextResponse.json({ error: 'step_id obrigatório' }, { status: 400 })
        const [{ data: step }, { data: plan }] = await Promise.all([
            supabase.from('operational_plan_steps')
                .select('id, action_type, status, separate_approval')
                .eq('id', body.step_id).eq('plan_id', id).single(),
            supabase.from('operational_plans').select('status').eq('id', id).single(),
        ])
        if (!step) return NextResponse.json({ error: 'Etapa não encontrada' }, { status: 404 })
        if (!plan || plan.status !== 'awaiting_step_approval' || step.status !== 'awaiting_approval' || !step.separate_approval) {
            return NextResponse.json({ error: 'Esta etapa não está aguardando aprovação individual.' }, { status: 409 })
        }
        // O sistema ainda não movimenta dinheiro: aprovação libera a etapa para
        // execução/manualização, mas o executor não simula pagamento concluído.
        await supabase.from('operational_plan_steps').update({ status: 'approved', updated_at: now }).eq('id', step.id)
        await supabase.from('operational_plans').update({ status: 'approved', updated_at: now }).eq('id', id)
        await supabase.from('operational_approvals').insert({
            plan_id: id, step_id: step.id, decision: 'approve', actor_id: auth.userId,
            note: body.note || null, scope: { step: true, action_type: step.action_type },
        })
        after(() => executeOperationalPlan(supabase, id))
        return NextResponse.json({ ok: true, status: 'approved', execution_started: true })
    }

    if (action === 'reject' || action === 'cancel') {
        const status = action === 'reject' ? 'rejected' : 'cancelled'
        await supabase.from('operational_plans').update({
            status, ...(action === 'reject' ? { rejected_by: auth.userId, rejected_at: now } : {}), updated_at: now,
        }).eq('id', id)
        await supabase.from('operational_approvals').insert({
            plan_id: id, decision: action, actor_id: auth.userId, note: body.note || null, scope: { plan: true },
        })
        return NextResponse.json({ ok: true, status })
    }

    if (action === 'pause') {
        await supabase.from('operational_plans').update({ status: 'paused', updated_at: now }).eq('id', id)
        await supabase.from('operational_approvals').insert({ plan_id: id, decision: 'pause', actor_id: auth.userId, note: body.note || null })
        return NextResponse.json({ ok: true, status: 'paused' })
    }
    if (action === 'resume') {
        await supabase.from('operational_plans').update({ status: 'approved', updated_at: now }).eq('id', id)
        await supabase.from('operational_approvals').insert({ plan_id: id, decision: 'resume', actor_id: auth.userId, note: body.note || null })
        after(() => executeOperationalPlan(supabase, id))
        return NextResponse.json({ ok: true, status: 'approved', execution_started: true })
    }
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
}
