"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
    AlertTriangle, Archive, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight,
    CircleDot, Clock3, FileText, Image as ImageIcon, Loader2, MessageCircle, Pause,
    Play, RefreshCw, Save, Send, Settings2, ShieldCheck, Sparkles, UserRound, X,
} from "lucide-react"

type Tab = "approval" | "inbox" | "running" | "waiting" | "diary" | "sources"

type Step = {
    id: string; position: number; action_type: string; title: string; description: string | null
    status: string; requires_approval: boolean; separate_approval: boolean
    target_label: string | null; target_phone: string | null
    draft_body: string | null; approved_body: string | null
    error_message: string | null; result: Record<string, unknown> | null; executed_at: string | null
}
type Plan = {
    id: string; item_id: string | null; title: string; objective: string; requester: string | null
    areas: string[]; status: string; priority: string; due_at: string | null
    expected_outcome: string | null; context: string | null; risk_level: string
    version: number; proposed_by: string; approved_at: string | null
    execution_summary: string | null; last_error: string | null; created_at: string; updated_at: string
    item: null | {
        id: string; source_label: string; source_sender_name: string | null; body: string
        quoted_body: string | null; kind: string; occurred_at: string
        media_bucket: string | null; media_path: string | null; media_type: string | null
        media_mime: string | null; media_filename: string | null
    }
    steps: Step[]
}
type Item = {
    id: string; source_label: string; source_sender_name: string | null; body: string; quoted_body: string | null
    kind: string; areas: string[]; title: string; summary: string; confidence: number; priority: string
    state: string; needs_review: boolean; classification_reason: string | null; occurred_at: string
    media_type: string | null; media_filename: string | null; media_signed_url?: string | null
}
type Diary = {
    id: string; item_id: string | null; plan_id: string | null; kind: string; areas: string[]
    title: string; summary: string; status: string; occurred_at: string
    source_evidence: Record<string, unknown>
}
type Source = {
    id: string; label: string; source_kind: "contact" | "group" | "unknown"; inbox_id: string
    phone: string | null; whatsapp_jid: string | null; areas: string[]; active: boolean
}
type Control = {
    id: string; outbound_enabled: boolean; daily_limit: number; used_today: number
    paused_reason: string | null; updated_at?: string
}
type Payload = {
    counts: { awaiting_approval: number; executing: number; waiting: number; pending_items: number; completed_7d: number; unresolved_sources: number }
    plans: Plan[]; items: Item[]; diary: Diary[]; sources: Source[]; control: Control
}

const AREA_LABEL: Record<string, string> = {
    cadastros: "Cadastros", comercial: "Comercial", marketing: "Marketing",
    financeiro: "Financeiro", cobrancas: "Cobranças",
}
const ACTION_LABEL: Record<string, string> = {
    research: "Verificar", draft_message: "Preparar mensagem", send_whatsapp: "Enviar WhatsApp",
    wait_reply: "Aguardar resposta", create_task: "Criar tarefa", update_record: "Registrar",
    financial_action: "Ação financeira", manual: "Intervenção manual", notify_requester: "Avisar solicitante",
}

function fmtDate(value: string | null, includeTime = true) {
    if (!value) return "—"
    return new Intl.DateTimeFormat("pt-BR", includeTime
        ? { dateStyle: "short", timeStyle: "short" }
        : { dateStyle: "short" }).format(new Date(value))
}
function statusLabel(status: string) {
    const labels: Record<string, string> = {
        awaiting_approval: "Aguardando aprovação", approved: "Aprovado", executing: "Em execução",
        waiting: "Aguardando terceiro", awaiting_step_approval: "Nova aprovação necessária",
        completed: "Concluído", rejected: "Recusado", cancelled: "Cancelado", failed: "Com erro",
        paused: "Pausado", draft: "Rascunho", pending: "Pendente", routed: "Encaminhado", archived: "Arquivado",
    }
    return labels[status] || status
}
function StatusBadge({ status }: { status: string }) {
    const color = status === "completed" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
        : status === "awaiting_approval" || status === "awaiting_step_approval" ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
        : status === "failed" || status === "rejected" ? "bg-red-500/10 text-red-500 border-red-500/30"
        : status === "executing" || status === "approved" ? "bg-blue-500/10 text-blue-500 border-blue-500/30"
        : "bg-muted text-muted-foreground border-border"
    return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${color}`}>{statusLabel(status)}</span>
}
function AreaBadges({ areas }: { areas: string[] }) {
    return <div className="flex flex-wrap gap-1">{areas.map(a => <span key={a} className="rounded bg-[#A68B4B]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#A68B4B]">{AREA_LABEL[a] || a}</span>)}</div>
}
function Stat({ label, value, icon: Icon, tone = "gold" }: { label: string; value: number; icon: typeof Clock3; tone?: "gold" | "green" | "blue" }) {
    const color = tone === "green" ? "text-emerald-500" : tone === "blue" ? "text-blue-500" : "text-[#A68B4B]"
    return <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
        <div className="rounded-lg bg-muted p-2.5"><Icon className={`h-5 w-5 ${color}`} /></div>
        <div><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
    </div>
}

export function CentralOperacionalClient() {
    const [data, setData] = useState<Payload | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [tab, setTab] = useState<Tab>("approval")
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [editing, setEditing] = useState(false)
    const [editPlan, setEditPlan] = useState<Partial<Plan>>({})
    const [editSteps, setEditSteps] = useState<Record<string, Partial<Step>>>({})
    const [sourceEdits, setSourceEdits] = useState<Record<string, { phone: string; whatsapp_jid: string }>>({})

    const load = useCallback(async (quiet = false) => {
        if (!quiet) setLoading(true)
        try {
            const res = await fetch("/api/operacoes", { cache: "no-store" })
            const body = await res.json()
            if (!res.ok) throw new Error(body.error || "Falha ao carregar")
            setData(body)
            setError(null)
            setSelectedId(current => current && body.plans.some((p: Plan) => p.id === current)
                ? current
                : body.plans.find((p: Plan) => p.status === "awaiting_approval")?.id || body.plans[0]?.id || null)
        } catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar") }
        finally { if (!quiet) setLoading(false) }
    }, [])
    useEffect(() => { void load() }, [load])

    const plans = data?.plans || []
    const visiblePlans = useMemo(() => plans.filter(p => {
        if (tab === "approval") return p.status === "awaiting_approval"
        if (tab === "running") return ["approved","executing"].includes(p.status)
        if (tab === "waiting") return ["waiting","awaiting_step_approval","paused","failed"].includes(p.status)
        return true
    }), [plans, tab])
    const selected = plans.find(p => p.id === selectedId) || visiblePlans[0] || null

    useEffect(() => {
        if (!selected) return
        setEditPlan({ title: selected.title, objective: selected.objective, expected_outcome: selected.expected_outcome, priority: selected.priority, due_at: selected.due_at, context: selected.context, risk_level: selected.risk_level })
        setEditSteps(Object.fromEntries(selected.steps.map(s => [s.id, { title: s.title, description: s.description, target_label: s.target_label, target_phone: s.target_phone, draft_body: s.approved_body || s.draft_body, separate_approval: s.separate_approval }])))
        setEditing(false)
    }, [selected?.id, selected?.version]) // eslint-disable-line react-hooks/exhaustive-deps

    async function planAction(action: string, stepId?: string) {
        if (!selected) return
        if (action === "approve_step" && stepId) {
            const step = selected.steps.find(s => s.id === stepId)
            if (!step) return
            if (["send_whatsapp","notify_requester"].includes(step.action_type)) {
                const priorDraft = [...selected.steps]
                    .filter(s => s.action_type === "draft_message" && s.position < step.position)
                    .sort((a,b) => b.position - a.position)[0]
                const draft = step.approved_body || step.draft_body || priorDraft?.approved_body || priorDraft?.draft_body || "(mensagem não localizada)"
                if (!window.confirm(`Autorizar UMA mensagem para ${step.target_label || step.target_phone || "destinatário não identificado"}?\n\n${draft}`)) return
            } else if (!window.confirm(`Aprovar somente a etapa “${step.title}”?`)) return
        }
        if (action === "approve" && !window.confirm("Aprovar este plano e iniciar apenas as etapas apresentadas? Ações financeiras continuam bloqueadas para nova aprovação.")) return
        if (action === "reject" && !window.confirm("Recusar este plano? Ele não será executado.")) return
        setBusy(`${action}:${selected.id}`)
        try {
            const payload = action === "update"
                ? { action, plan: editPlan, steps: selected.steps.map(s => ({ id: s.id, ...editSteps[s.id] })) }
                : { action, ...(stepId ? { step_id: stepId } : {}) }
            const res = await fetch(`/api/operacoes/plans/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
            const body = await res.json()
            if (!res.ok) throw new Error(body.error || "Ação não concluída")
            setEditing(false)
            await load(true)
            if (body.execution_started) window.setTimeout(() => void load(true), 1800)
        } catch (e) { setError(e instanceof Error ? e.message : "Ação não concluída") }
        finally { setBusy(null) }
    }

    async function itemAction(item: Item, action: string) {
        setBusy(`${action}:${item.id}`)
        try {
            const res = await fetch(`/api/operacoes/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
            const body = await res.json()
            if (!res.ok) throw new Error(body.error || "Ação não concluída")
            await load(true)
        } catch (e) { setError(e instanceof Error ? e.message : "Ação não concluída") }
        finally { setBusy(null) }
    }

    async function resolveSources() {
        setBusy("resolve-sources")
        try {
            const res = await fetch("/api/operacoes/sources/resolve", { method: "POST" })
            const body = await res.json()
            if (!res.ok) throw new Error(body.error || "Falha ao resolver fontes")
            await load(true)
            if (body.unresolved?.length) setError(`${body.resolved} fonte(s) resolvida(s). Ainda faltam: ${body.unresolved.join(", ")}.`)
        } catch (e) { setError(e instanceof Error ? e.message : "Falha ao resolver fontes") }
        finally { setBusy(null) }
    }

    async function saveSource(source: Source) {
        const values = sourceEdits[source.id] || { phone: source.phone || "", whatsapp_jid: source.whatsapp_jid || "" }
        setBusy(`source:${source.id}`)
        try {
            const res = await fetch(`/api/operacoes/sources/${source.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) })
            const body = await res.json(); if (!res.ok) throw new Error(body.error || "Falha ao salvar")
            await load(true)
        } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar") }
        finally { setBusy(null) }
    }

    async function toggleOutbound() {
        if (!data) return
        const enable = !data.control.outbound_enabled
        if (enable && !window.confirm(`Habilitar envios supervisionados neste número? O limite será ${data.control.daily_limit} por dia e cada mensagem ainda exigirá aprovação individual.`)) return
        setBusy("outbound-control")
        try {
            const res = await fetch("/api/operacoes/controls", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ outbound_enabled: enable }),
            })
            const body = await res.json(); if (!res.ok) throw new Error(body.error || "Falha ao alterar controle")
            await load(true)
        } catch (e) { setError(e instanceof Error ? e.message : "Falha ao alterar controle") }
        finally { setBusy(null) }
    }

    if (loading) return <div className="flex justify-center py-32"><Loader2 className="h-8 w-8 animate-spin text-[#A68B4B]" /></div>
    if (!data) return <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-red-500">{error || "Central indisponível"}</div>

    const tabs: Array<{ id: Tab; label: string; count?: number; icon: typeof Clock3 }> = [
        { id: "approval", label: "Planos para aprovar", count: data.counts.awaiting_approval, icon: ShieldCheck },
        { id: "inbox", label: "Entrada", count: data.counts.pending_items, icon: CircleDot },
        { id: "running", label: "Em execução", count: data.counts.executing, icon: Play },
        { id: "waiting", label: "Aguardando", count: data.counts.waiting, icon: Clock3 },
        { id: "diary", label: "Diário", icon: BookOpen },
        { id: "sources", label: "Fontes", count: data.counts.unresolved_sources, icon: Settings2 },
    ]

    return <div className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
                <div className="flex items-center gap-3"><div className="rounded-xl border border-[#A68B4B]/30 bg-[#A68B4B]/10 p-2.5"><Sparkles className="h-5 w-5 text-[#A68B4B]" /></div><div>
                    <h1 className="font-display text-2xl uppercase tracking-wide">Central Operacional</h1>
                    <p className="text-sm text-muted-foreground">Pedidos do WhatsApp transformados em planos revisáveis, execução supervisionada e memória operacional.</p>
                </div></div>
            </div>
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted"><RefreshCw className="h-4 w-4" /> Atualizar</button>
        </div>

        {error && <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300"><span>{error}</span><button onClick={() => setError(null)}><X className="h-4 w-4" /></button></div>}

        <div className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${data.control.outbound_enabled ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
            <div className="flex items-start gap-3"><ShieldCheck className={`mt-0.5 h-5 w-5 ${data.control.outbound_enabled ? "text-emerald-600" : "text-amber-600"}`} /><div><p className="text-sm font-semibold">Proteção do número: {data.control.outbound_enabled ? "envios supervisionados habilitados" : "somente leitura"}</p><p className="mt-0.5 text-xs text-muted-foreground">{data.control.used_today}/{data.control.daily_limit} envios usados hoje · mensagens individuais · campanhas e grupos bloqueados{data.control.paused_reason ? ` · ${data.control.paused_reason}` : ""}</p></div></div>
            <button onClick={() => void toggleOutbound()} disabled={busy === "outbound-control"} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${data.control.outbound_enabled ? "border border-red-500/30 text-red-500" : "bg-emerald-500 text-white"}`}>{busy === "outbound-control" ? <Loader2 className="h-4 w-4 animate-spin" /> : data.control.outbound_enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{data.control.outbound_enabled ? "Pausar envios" : "Habilitar envios"}</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Para sua aprovação" value={data.counts.awaiting_approval} icon={ShieldCheck} />
            <Stat label="Em execução" value={data.counts.executing} icon={Play} tone="blue" />
            <Stat label="Aguardando" value={data.counts.waiting} icon={Clock3} />
            <Stat label="Entrada para triar" value={data.counts.pending_items} icon={CircleDot} />
            <Stat label="Concluídos em 7 dias" value={data.counts.completed_7d} icon={CheckCircle2} tone="green" />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">{tabs.map(t => { const Icon = t.icon; const active = tab === t.id; return <button key={t.id} onClick={() => setTab(t.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition ${active ? "border-[#A68B4B] bg-[#A68B4B] text-black font-semibold" : "hover:bg-muted text-muted-foreground"}`}><Icon className="h-4 w-4" />{t.label}{typeof t.count === "number" && t.count > 0 && <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-black/15" : "bg-muted"}`}>{t.count}</span>}</button>})}</div>

        {["approval","running","waiting"].includes(tab) && <div className="grid min-h-[610px] overflow-hidden rounded-xl border bg-card lg:grid-cols-[360px_1fr]">
            <div className="border-b lg:border-b-0 lg:border-r">
                <div className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{visiblePlans.length} plano(s)</div>
                <div className="max-h-[720px] overflow-y-auto">{visiblePlans.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Nenhum plano nesta etapa.</div> : visiblePlans.map(p => <button key={p.id} onClick={() => setSelectedId(p.id)} className={`w-full border-b p-4 text-left transition hover:bg-muted/50 ${selected?.id === p.id ? "bg-[#A68B4B]/8 border-l-2 border-l-[#A68B4B]" : ""}`}>
                    <div className="mb-2 flex items-start justify-between gap-2"><p className="line-clamp-2 text-sm font-semibold">{p.title}</p><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /></div>
                    <AreaBadges areas={p.areas} /><div className="mt-3 flex items-center justify-between"><StatusBadge status={p.status} /><span className="text-[10px] text-muted-foreground">{fmtDate(p.created_at)}</span></div>
                    <p className="mt-2 truncate text-xs text-muted-foreground">Solicitante: {p.requester || "não identificado"}</p>
                </button>)}</div>
            </div>
            <div className="min-w-0">{selected ? <PlanDetail plan={selected} editing={editing} setEditing={setEditing} editPlan={editPlan} setEditPlan={setEditPlan} editSteps={editSteps} setEditSteps={setEditSteps} busy={busy} onAction={planAction} /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Selecione um plano.</div>}</div>
        </div>}

        {tab === "inbox" && <InboxView items={data.items} busy={busy} onAction={itemAction} />}
        {tab === "diary" && <DiaryView entries={data.diary} />}
        {tab === "sources" && <SourcesView sources={data.sources} edits={sourceEdits} setEdits={setSourceEdits} busy={busy} onResolve={resolveSources} onSave={saveSource} />}
    </div>
}

function PlanDetail({ plan, editing, setEditing, editPlan, setEditPlan, editSteps, setEditSteps, busy, onAction }: {
    plan: Plan; editing: boolean; setEditing: (v: boolean) => void
    editPlan: Partial<Plan>; setEditPlan: React.Dispatch<React.SetStateAction<Partial<Plan>>>
    editSteps: Record<string, Partial<Step>>; setEditSteps: React.Dispatch<React.SetStateAction<Record<string, Partial<Step>>>>
    busy: string | null; onAction: (action: string, stepId?: string) => Promise<void>
}) {
    const ordered = [...plan.steps].sort((a,b) => a.position - b.position)
    const blockers = ordered.flatMap(s => {
        const e = editSteps[s.id] || s
        if (s.action_type === "send_whatsapp" && !e.target_phone) return [`${s.title}: telefone não confirmado`]
        if (s.action_type === "draft_message" && !e.draft_body) return [`${s.title}: mensagem não redigida`]
        return []
    })
    const isBusy = !!busy?.endsWith(plan.id)
    return <div className="p-5 lg:p-6">
        <div className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><StatusBadge status={plan.status} /><AreaBadges areas={plan.areas} /></div>
                {editing ? <input value={String(editPlan.title || "")} onChange={e => setEditPlan(p => ({...p,title:e.target.value}))} className="w-full rounded-lg border bg-background px-3 py-2 text-lg font-semibold" /> : <h2 className="text-xl font-semibold">{plan.title}</h2>}
                <p className="mt-1 text-xs text-muted-foreground">Versão {plan.version} · proposto por {plan.proposed_by === "rules" ? "regras" : "IA supervisionada"} · {fmtDate(plan.created_at)}</p>
            </div>
            <button onClick={() => setEditing(!editing)} className="inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">{editing ? <X className="h-4 w-4" /> : <FileText className="h-4 w-4" />}{editing ? "Cancelar edição" : "Editar plano"}</button>
        </div>

        <div className="grid gap-5 py-5 xl:grid-cols-[1fr_320px]">
            <div className="space-y-5">
                <section><p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Objetivo</p>{editing ? <textarea value={String(editPlan.objective || "")} onChange={e => setEditPlan(p => ({...p,objective:e.target.value}))} rows={3} className="w-full rounded-lg border bg-background p-3 text-sm" /> : <p className="text-sm leading-relaxed">{plan.objective}</p>}</section>
                {plan.item && <section className="rounded-xl border bg-muted/30 p-4"><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MessageCircle className="h-4 w-4" /> Evidência original</div><p className="text-xs text-muted-foreground">{plan.item.source_label}{plan.item.source_sender_name ? ` · ${plan.item.source_sender_name}` : ""} · {fmtDate(plan.item.occurred_at)}</p><blockquote className="mt-2 border-l-2 border-[#A68B4B] pl-3 text-sm leading-relaxed">{plan.item.body}</blockquote>{plan.item.quoted_body && <p className="mt-2 rounded bg-background p-2 text-xs text-muted-foreground">Em resposta a: {plan.item.quoted_body}</p>}</section>}
                <section><div className="mb-3 flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Plano de ação · {ordered.length} etapas</p>{editing && <span className="text-xs text-amber-600">Revise destinatários e mensagens</span>}</div>
                    <div className="space-y-2">{ordered.map((s,index) => { const e = editSteps[s.id] || {}; const completed = s.status === "completed"; return <div key={s.id} className={`rounded-xl border p-4 ${s.separate_approval ? "border-amber-500/35 bg-amber-500/5" : ""}`}>
                        <div className="flex items-start gap-3"><div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${completed ? "bg-emerald-500 text-white" : "bg-muted"}`}>{completed ? <Check className="h-4 w-4" /> : index + 1}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{editing ? <input value={String(e.title ?? s.title)} onChange={ev => setEditSteps(all => ({...all,[s.id]:{...all[s.id],title:ev.target.value}}))} className="rounded border bg-background px-2 py-1" /> : s.title}</p><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{ACTION_LABEL[s.action_type] || s.action_type}</span>{s.separate_approval && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">aprovação separada</span>}<StatusBadge status={s.status} /></div>
                            {editing ? <textarea value={String(e.description ?? s.description ?? "")} onChange={ev => setEditSteps(all => ({...all,[s.id]:{...all[s.id],description:ev.target.value}}))} rows={2} className="mt-2 w-full rounded border bg-background p-2 text-xs" /> : s.description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.description}</p>}
                            {(s.action_type === "send_whatsapp" || s.action_type === "wait_reply" || s.action_type === "notify_requester") && <div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-[10px] uppercase tracking-wider text-muted-foreground">Destinatário<input disabled={!editing} value={String(e.target_label ?? s.target_label ?? "")} onChange={ev => setEditSteps(all => ({...all,[s.id]:{...all[s.id],target_label:ev.target.value}}))} className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-xs normal-case text-foreground disabled:opacity-70" /></label><label className="text-[10px] uppercase tracking-wider text-muted-foreground">Telefone<input disabled={!editing} value={String(e.target_phone ?? s.target_phone ?? "")} onChange={ev => setEditSteps(all => ({...all,[s.id]:{...all[s.id],target_phone:ev.target.value}}))} className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-xs normal-case text-foreground disabled:opacity-70" /></label></div>}
                            {s.action_type === "draft_message" && <label className="mt-3 block text-[10px] uppercase tracking-wider text-muted-foreground">Mensagem proposta<textarea disabled={!editing} value={String(e.draft_body ?? s.approved_body ?? s.draft_body ?? "")} onChange={ev => setEditSteps(all => ({...all,[s.id]:{...all[s.id],draft_body:ev.target.value,approved_body:ev.target.value}}))} rows={4} className="mt-1 w-full rounded-lg border bg-background p-2.5 text-sm normal-case text-foreground disabled:opacity-80" /></label>}
                            {s.error_message && <p className="mt-2 flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3 w-3" />{s.error_message}</p>}
                            {s.status === "awaiting_approval" && plan.status === "awaiting_step_approval" && <button onClick={() => void onAction("approve_step",s.id)} disabled={isBusy} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"><ShieldCheck className="h-3.5 w-3.5" /> Aprovar somente esta etapa</button>}
                        </div></div>
                    </div>})}</div>
                </section>
            </div>
            <aside className="space-y-3"><div className="rounded-xl border p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Controle</p><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Solicitante</dt><dd className="text-right font-medium">{plan.requester || "—"}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Risco</dt><dd className="font-medium">{plan.risk_level}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Prioridade</dt><dd className="font-medium">{plan.priority}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Prazo</dt><dd>{fmtDate(plan.due_at)}</dd></div></dl></div>
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-xs leading-relaxed text-emerald-700 dark:text-emerald-300"><div className="mb-1 flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Limite de autoridade</div>A aprovação libera apenas as etapas mostradas. Pagamentos, boletos, PIX e decisões novas permanecem bloqueados.</div>
                {blockers.length > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"><p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Antes de aprovar</p><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{blockers.map(b => <li key={b}>• {b}</li>)}</ul></div>}
                {plan.last_error && <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-500">{plan.last_error}</div>}
            </aside>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            {editing && <button onClick={() => void onAction("update")} disabled={isBusy} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">{isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar alterações</button>}
            {plan.status === "awaiting_approval" && <><button onClick={() => void onAction("reject")} disabled={isBusy} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-500 hover:bg-red-500/5"><X className="h-4 w-4" /> Recusar</button><button onClick={() => void onAction("approve")} disabled={isBusy || blockers.length > 0 || editing} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">{isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Aprovar e iniciar</button></>}
            {["approved","executing"].includes(plan.status) && <button onClick={() => void onAction("pause")} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm"><Pause className="h-4 w-4" /> Pausar</button>}
            {plan.status === "paused" && <button onClick={() => void onAction("resume")} className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white"><Play className="h-4 w-4" /> Retomar</button>}
        </div>
    </div>
}

function InboxView({ items, busy, onAction }: { items: Item[]; busy: string | null; onAction: (i: Item,a:string) => Promise<void> }) {
    const pending = items.filter(i => i.state === "pending")
    return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{pending.length === 0 ? <div className="col-span-full rounded-xl border p-12 text-center text-sm text-muted-foreground">A entrada está limpa.</div> : pending.map(i => <article key={i.id} className="rounded-xl border bg-card p-4"><div className="flex items-start justify-between gap-3"><div><StatusBadge status={i.state} /><h3 className="mt-2 font-semibold">{i.title}</h3></div><span className="text-xs tabular-nums text-muted-foreground">{Math.round(Number(i.confidence)*100)}%</span></div><div className="mt-2"><AreaBadges areas={i.areas} /></div><p className="mt-3 text-xs text-muted-foreground">{i.source_label}{i.source_sender_name ? ` · ${i.source_sender_name}` : ""} · {fmtDate(i.occurred_at)}</p><p className="mt-2 line-clamp-4 text-sm leading-relaxed">{i.body}</p>{i.media_signed_url && <a href={i.media_signed_url} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-2 rounded-lg border p-2 text-xs hover:bg-muted">{i.media_type === "image" ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}{i.media_filename || "Abrir anexo"}</a>}<div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void onAction(i,"create_plan")} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg bg-[#A68B4B] px-3 py-2 text-xs font-semibold text-black"><Sparkles className="h-3.5 w-3.5" /> Criar plano</button><button onClick={() => void onAction(i,"diary")} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs"><BookOpen className="h-3.5 w-3.5" /> Diário</button>{i.media_signed_url && <button onClick={() => void onAction(i,"promote_media")} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs"><ArrowRight className="h-3.5 w-3.5" /> Biblioteca</button>}<button onClick={() => void onAction(i,"archive")} disabled={!!busy} className="ml-auto rounded-lg border p-2 text-muted-foreground"><Archive className="h-3.5 w-3.5" /></button></div></article>)}</div>
}

function DiaryView({ entries }: { entries: Diary[] }) {
    return <div className="rounded-xl border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Diário Operacional</h2><p className="text-xs text-muted-foreground">Registro cronológico de decisões, providências e desfechos.</p></div><div className="divide-y">{entries.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">Ainda não há registros.</p> : entries.map(e => <div key={e.id} className="grid gap-3 p-4 sm:grid-cols-[140px_1fr]"><div className="text-xs text-muted-foreground">{fmtDate(e.occurred_at)}<div className="mt-2"><StatusBadge status={e.status} /></div></div><div><div className="mb-1"><AreaBadges areas={e.areas} /></div><h3 className="font-semibold">{e.title}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{e.summary}</p></div></div>)}</div></div>
}

function SourcesView({ sources, edits, setEdits, busy, onResolve, onSave }: {
    sources: Source[]; edits: Record<string,{phone:string;whatsapp_jid:string}>
    setEdits: React.Dispatch<React.SetStateAction<Record<string,{phone:string;whatsapp_jid:string}>>>
    busy: string | null; onResolve: () => Promise<void>; onSave: (s: Source) => Promise<void>
}) {
    return <div className="rounded-xl border bg-card"><div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Fontes autorizadas</h2><p className="text-xs text-muted-foreground">Somente estas conversas alimentam a Central Operacional.</p></div><button onClick={() => void onResolve()} disabled={busy === "resolve-sources"} className="inline-flex items-center gap-2 rounded-lg bg-[#A68B4B] px-3 py-2 text-sm font-semibold text-black disabled:opacity-50">{busy === "resolve-sources" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Resolver pelo WhatsApp/CRM</button></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Fonte</th><th className="px-4 py-3">Áreas</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Telefone</th><th className="px-4 py-3">JID do grupo</th><th className="px-4 py-3">Estado</th><th /></tr></thead><tbody className="divide-y">{sources.map(s => { const e = edits[s.id] || {phone:s.phone || "",whatsapp_jid:s.whatsapp_jid || ""}; const resolved = s.source_kind === "group" ? !!s.whatsapp_jid : !!s.phone; return <tr key={s.id}><td className="px-4 py-3 font-medium">{s.label}</td><td className="px-4 py-3"><AreaBadges areas={s.areas} /></td><td className="px-4 py-3 text-xs text-muted-foreground">{s.source_kind === "group" ? "Grupo" : "Contato"}</td><td className="px-4 py-3"><input value={e.phone} disabled={s.source_kind === "group"} onChange={ev => setEdits(all=>({...all,[s.id]:{...e,phone:ev.target.value}}))} className="w-36 rounded border bg-background px-2 py-1.5 text-xs disabled:opacity-30" /></td><td className="px-4 py-3"><input value={e.whatsapp_jid} disabled={s.source_kind !== "group"} onChange={ev => setEdits(all=>({...all,[s.id]:{...e,whatsapp_jid:ev.target.value}}))} className="w-56 rounded border bg-background px-2 py-1.5 text-xs disabled:opacity-30" /></td><td className="px-4 py-3">{resolved ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Resolvida</span> : <span className="inline-flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> Pendente</span>}</td><td className="px-4 py-3"><button onClick={() => void onSave(s)} disabled={busy === `source:${s.id}`} className="rounded border p-2 hover:bg-muted">{busy === `source:${s.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}</button></td></tr>})}</tbody></table></div></div>
}
