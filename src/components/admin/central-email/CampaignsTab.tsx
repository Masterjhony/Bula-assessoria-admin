"use client"

import { useEffect, useState } from "react"
import {
    Plus, Send, Loader2, AlertCircle, CheckCircle2,
    Trash2, RefreshCw, X, Pencil, Users, Mail,
} from "lucide-react"
import type {
    EmailCampaign, EmailCampaignStep, EmailTemplate, DelayUnit, CampaignStatus,
} from "./types"
import { INTERESSE_OPTIONS } from "./types"

interface Props {
    templates: EmailTemplate[]
}

const STATUS_LABELS: Record<CampaignStatus, string> = {
    rascunho: "Rascunho",
    enviando: "Enviando",
    concluida: "Concluída",
    cancelada: "Cancelada",
    erro: "Erro",
}
const STATUS_COLORS: Record<CampaignStatus, string> = {
    rascunho: "bg-gray-500/15 text-gray-600 dark:text-gray-300",
    enviando: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    concluida: "bg-green-500/15 text-green-600 dark:text-green-400",
    cancelada: "bg-red-500/15 text-red-600 dark:text-red-400",
    erro: "bg-red-500/15 text-red-600 dark:text-red-400",
}

interface CampaignForm {
    name: string
    description: string
    template_id: string | null
    subject: string
    body_html: string
    body_text: string
    from_name: string
    reply_to: string
    segment_interesses: string[]
    segment_stage: string
    audience_tag: string
    stop_on_optout: boolean
    stop_on_interest: boolean
}

const EMPTY_FORM: CampaignForm = {
    name: "",
    description: "",
    template_id: null,
    subject: "",
    body_html: "",
    body_text: "",
    from_name: "",
    reply_to: "",
    segment_interesses: [],
    segment_stage: "",
    audience_tag: "",
    stop_on_optout: true,
    stop_on_interest: false,
}

interface StepForm {
    delay_value: number
    delay_unit: DelayUnit
    template_id: string | null
    subject: string
    body_html: string
}

export function CampaignsTab({ templates }: Props) {
    const [list, setList] = useState<EmailCampaign[]>([])
    const [loading, setLoading] = useState(true)
    const [editingId, setEditingId] = useState<string | "new" | null>(null)
    const [form, setForm] = useState<CampaignForm>(EMPTY_FORM)
    const [saving, setSaving] = useState(false)
    const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null)
    const [preview, setPreview] = useState<{ total: number; sample: Array<{ id: string; nome: string; email: string }> } | null>(null)
    const [steps, setSteps] = useState<EmailCampaignStep[]>([])
    const [stepForm, setStepForm] = useState<StepForm>({
        delay_value: 2, delay_unit: "days", template_id: null, subject: "", body_html: "",
    })
    const [addingStep, setAddingStep] = useState(false)

    async function fetchList() {
        setLoading(true)
        try {
            const res = await fetch(`/api/email/central/campaigns`)
            const data = await res.json()
            setList(data.campaigns ?? [])
        } finally {
            setLoading(false)
        }
    }
    useEffect(() => { fetchList() }, [])

    function startNew() {
        setEditingId("new")
        setForm(EMPTY_FORM)
        setSteps([])
        setPreview(null)
        setFeedback(null)
    }

    async function startEdit(c: EmailCampaign) {
        setEditingId(c.id)
        const interesses = Array.isArray((c.segment as Record<string, unknown>).interesse_principal)
            ? (c.segment as Record<string, unknown>).interesse_principal as string[]
            : (c.segment as Record<string, unknown>).interesse_principal
                ? [(c.segment as Record<string, unknown>).interesse_principal as string]
                : []
        setForm({
            name: c.name,
            description: c.description ?? "",
            template_id: c.template_id,
            subject: c.subject ?? "",
            body_html: c.body_html ?? "",
            body_text: c.body_text ?? "",
            from_name: c.from_name ?? "",
            reply_to: c.reply_to ?? "",
            segment_interesses: interesses,
            segment_stage: (c.segment as Record<string, unknown>).stage as string ?? "",
            audience_tag: c.audience_tag ?? "",
            stop_on_optout: c.stop_on_optout,
            stop_on_interest: c.stop_on_interest,
        })
        // Carrega steps
        const stepsRes = await fetch(`/api/email/central/campaigns/${c.id}/steps`)
        if (stepsRes.ok) {
            const data = await stepsRes.json()
            setSteps(data.steps ?? [])
        }
        setPreview(null)
        setFeedback(null)
    }

    function cancel() {
        setEditingId(null)
        setForm(EMPTY_FORM)
        setSteps([])
        setPreview(null)
        setFeedback(null)
        setAddingStep(false)
    }

    function buildSegment(): Record<string, unknown> {
        const seg: Record<string, unknown> = {}
        if (form.segment_interesses.length === 1) seg.interesse_principal = form.segment_interesses[0]
        else if (form.segment_interesses.length > 1) seg.interesse_principal = form.segment_interesses
        if (form.segment_stage.trim()) seg.stage = form.segment_stage.trim()
        return seg
    }

    async function loadPreview() {
        const res = await fetch(`/api/email/central/campaigns/preview`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ segment: buildSegment() }),
        })
        const data = await res.json()
        if (res.ok) setPreview(data)
        else setFeedback({ type: "err", msg: data.error ?? "Falha na pré-visualização" })
    }

    async function save() {
        if (!form.name.trim()) {
            setFeedback({ type: "err", msg: "Nome da campanha é obrigatório." })
            return
        }
        if (!form.template_id && (!form.subject.trim() || !form.body_html.trim())) {
            setFeedback({ type: "err", msg: "Escolha um template ou informe assunto + corpo HTML." })
            return
        }
        setSaving(true)
        try {
            const payload = {
                name: form.name,
                description: form.description || null,
                segment: buildSegment(),
                template_id: form.template_id || null,
                subject: form.subject || null,
                body_html: form.body_html || null,
                body_text: form.body_text || null,
                from_name: form.from_name || null,
                reply_to: form.reply_to || null,
                audience_tag: form.audience_tag || null,
                stop_on_optout: form.stop_on_optout,
                stop_on_interest: form.stop_on_interest,
            }

            const isNew = editingId === "new"
            const url = isNew
                ? `/api/email/central/campaigns`
                : `/api/email/central/campaigns/${editingId}`
            const method = isNew ? "POST" : "PUT"
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            const data = await res.json()
            if (!res.ok) {
                setFeedback({ type: "err", msg: data.error ?? "Falha ao salvar" })
            } else {
                setFeedback({ type: "ok", msg: isNew ? "Campanha criada" : "Campanha atualizada" })
                if (isNew) setEditingId(data.id)
                fetchList()
            }
        } finally {
            setSaving(false)
        }
    }

    async function deleteCampaign(id: string) {
        if (!confirm("Deletar esta campanha em rascunho?")) return
        await fetch(`/api/email/central/campaigns/${id}`, { method: "DELETE" })
        cancel()
        fetchList()
    }

    async function dispatchCampaign(id: string) {
        if (!confirm("Disparar esta campanha agora? O passo 0 será enviado imediatamente.")) return
        const res = await fetch(`/api/email/central/campaigns/${id}/send`, { method: "POST" })
        const data = await res.json()
        if (!res.ok) {
            setFeedback({ type: "err", msg: data.error ?? "Falha ao disparar" })
        } else {
            const followUp = data.follow_up_scheduled
                ? ` Próximo passo agendado para ${new Date(data.next_send_at).toLocaleString("pt-BR")}.`
                : ""
            setFeedback({
                type: "ok",
                msg: `Disparado — enviados ${data.sent}, falhas ${data.failed}, opt-out pulados ${data.skipped_optout}.${followUp}`,
            })
        }
        fetchList()
    }

    async function addStep() {
        if (typeof editingId !== "string" || editingId === "new") return
        if (!stepForm.template_id && (!stepForm.subject.trim() || !stepForm.body_html.trim())) {
            setFeedback({ type: "err", msg: "Step: escolha um template ou informe assunto + corpo HTML." })
            return
        }
        const res = await fetch(`/api/email/central/campaigns/${editingId}/steps`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                delay_value: stepForm.delay_value,
                delay_unit: stepForm.delay_unit,
                template_id: stepForm.template_id || null,
                subject: stepForm.subject || null,
                body_html: stepForm.body_html || null,
            }),
        })
        const data = await res.json()
        if (!res.ok) {
            setFeedback({ type: "err", msg: data.error ?? "Falha ao adicionar step" })
            return
        }
        setSteps([...steps, data.step])
        setStepForm({ delay_value: 2, delay_unit: "days", template_id: null, subject: "", body_html: "" })
        setAddingStep(false)
    }

    async function removeStep(stepId: string) {
        if (typeof editingId !== "string" || editingId === "new") return
        if (!confirm("Remover este step?")) return
        await fetch(`/api/email/central/campaigns/${editingId}/steps/${stepId}`, { method: "DELETE" })
        setSteps(steps.filter(s => s.id !== stepId))
    }

    if (editingId !== null) {
        const isEditing = editingId !== "new"
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                    <button onClick={cancel} className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg border hover:bg-muted">
                        <X className="h-3.5 w-3.5" /> Voltar
                    </button>
                    <div className="flex gap-2">
                        {isEditing && (
                            <>
                                <button
                                    onClick={() => deleteCampaign(editingId as string)}
                                    className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/40 text-red-600 hover:bg-red-500/10"
                                >
                                    <Trash2 className="h-3.5 w-3.5" /> Deletar
                                </button>
                                <button
                                    onClick={() => dispatchCampaign(editingId as string)}
                                    className="text-sm flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90"
                                >
                                    <Send className="h-3.5 w-3.5" /> Disparar
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {feedback && (
                    <p
                        className={`text-sm flex items-center gap-2 px-3 py-2 rounded-lg border ${
                            feedback.type === "ok"
                                ? "bg-green-500/5 border-green-500/30 text-green-600 dark:text-green-400"
                                : "bg-red-500/5 border-red-500/30 text-red-600 dark:text-red-400"
                        }`}
                    >
                        {feedback.type === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                        {feedback.msg}
                    </p>
                )}

                <div className="border rounded-xl p-4 space-y-3 bg-muted/30">
                    <h3 className="font-semibold text-sm">Conteúdo</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium block mb-1">Nome da campanha</label>
                            <input
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                                placeholder="ex: Newsletter maio 2026"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium block mb-1">Template (opcional)</label>
                            <select
                                value={form.template_id ?? ""}
                                onChange={e => setForm({ ...form, template_id: e.target.value || null })}
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                            >
                                <option value="">— Conteúdo próprio —</option>
                                {templates.map(t => (
                                    <option key={t.id} value={t.id}>{t.title}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium block mb-1">Descrição (interna)</label>
                        <input
                            value={form.description}
                            onChange={e => setForm({ ...form, description: e.target.value })}
                            className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                        />
                    </div>
                    {!form.template_id && (
                        <>
                            <div>
                                <label className="text-xs font-medium block mb-1">Assunto</label>
                                <input
                                    value={form.subject}
                                    onChange={e => setForm({ ...form, subject: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                                    placeholder="Olá {nome}, novidades..."
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium block mb-1">Corpo HTML</label>
                                <textarea
                                    value={form.body_html}
                                    onChange={e => setForm({ ...form, body_html: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background font-mono"
                                    rows={10}
                                />
                            </div>
                        </>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium block mb-1">Remetente (opcional, default = SMTP_FROM)</label>
                            <input
                                value={form.from_name}
                                onChange={e => setForm({ ...form, from_name: e.target.value })}
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                                placeholder="Bula Assessoria <contato@bula.example.com>"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium block mb-1">Reply-To</label>
                            <input
                                value={form.reply_to}
                                onChange={e => setForm({ ...form, reply_to: e.target.value })}
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                                placeholder="operador@bula.example.com"
                            />
                        </div>
                    </div>
                </div>

                <div className="border rounded-xl p-4 space-y-3 bg-muted/30">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                        <Users className="h-4 w-4" /> Segmento (do CRM)
                    </h3>
                    <div>
                        <label className="text-xs font-medium block mb-1">Interesse principal (qualquer um)</label>
                        <div className="flex flex-wrap gap-2">
                            {INTERESSE_OPTIONS.map(opt => {
                                const active = form.segment_interesses.includes(opt.id)
                                return (
                                    <button
                                        key={opt.id}
                                        onClick={() =>
                                            setForm({
                                                ...form,
                                                segment_interesses: active
                                                    ? form.segment_interesses.filter(i => i !== opt.id)
                                                    : [...form.segment_interesses, opt.id],
                                            })
                                        }
                                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                            active
                                                ? "bg-primary text-primary-foreground border-primary"
                                                : "bg-background hover:bg-muted"
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium block mb-1">Stage (opcional)</label>
                            <input
                                value={form.segment_stage}
                                onChange={e => setForm({ ...form, segment_stage: e.target.value })}
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                                placeholder="ex: Qualificado"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium block mb-1">Tag de audiência (aplicada ao disparar)</label>
                            <input
                                value={form.audience_tag}
                                onChange={e => setForm({ ...form, audience_tag: e.target.value })}
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                                placeholder="ex: campanha:newsletter-mai-2026"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={loadPreview}
                            className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg border hover:bg-muted"
                        >
                            <Users className="h-3.5 w-3.5" /> Pré-visualizar público
                        </button>
                        {preview && (
                            <span className="text-sm text-muted-foreground">
                                <strong>{preview.total}</strong> leads serão alcançados. Amostra:
                                {" "}
                                {preview.sample.slice(0, 3).map(s => s.email).join(", ")}
                                {preview.sample.length < preview.total ? "..." : ""}
                            </span>
                        )}
                    </div>
                </div>

                <div className="border rounded-xl p-4 space-y-3 bg-muted/30">
                    <h3 className="font-semibold text-sm">Regras de parada</h3>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={form.stop_on_optout}
                            onChange={e => setForm({ ...form, stop_on_optout: e.target.checked })}
                        />
                        Parar se lead virar opt-out de e-mail
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={form.stop_on_interest}
                            onChange={e => setForm({ ...form, stop_on_interest: e.target.checked })}
                        />
                        Parar se lead se qualificar (interesse_principal preenchido)
                    </label>
                </div>

                {isEditing && (
                    <div className="border rounded-xl p-4 space-y-3 bg-muted/30">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-sm">Follow-ups (passos 1+)</h3>
                            <button
                                onClick={() => setAddingStep(true)}
                                className="text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-lg border hover:bg-muted"
                            >
                                <Plus className="h-3 w-3" /> Adicionar
                            </button>
                        </div>
                        {steps.length === 0 && !addingStep && (
                            <p className="text-xs text-muted-foreground">
                                Sem follow-ups. A campanha envia apenas o passo 0 e conclui.
                            </p>
                        )}
                        {steps.map(s => (
                            <div key={s.id} className="flex items-center justify-between gap-2 p-2 border rounded-lg bg-background">
                                <div className="text-xs">
                                    <strong>Passo {s.step_order}</strong> · após {s.delay_value} {s.delay_unit}
                                    {s.template_id ? ` · template ${templates.find(t => t.id === s.template_id)?.title ?? "?"}` : " · conteúdo próprio"}
                                </div>
                                <button
                                    onClick={() => removeStep(s.id)}
                                    className="text-red-500 hover:bg-red-500/10 p-1 rounded"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                        {addingStep && (
                            <div className="p-3 border rounded-lg bg-background space-y-2">
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1">
                                        <label className="text-xs font-medium block mb-1">Após</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={stepForm.delay_value}
                                            onChange={e => setStepForm({ ...stepForm, delay_value: parseInt(e.target.value || "0", 10) })}
                                            className="w-full px-2 py-1.5 text-sm border rounded-lg bg-background"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs font-medium block mb-1">Unidade</label>
                                        <select
                                            value={stepForm.delay_unit}
                                            onChange={e => setStepForm({ ...stepForm, delay_unit: e.target.value as DelayUnit })}
                                            className="w-full px-2 py-1.5 text-sm border rounded-lg bg-background"
                                        >
                                            <option value="minutes">minutos</option>
                                            <option value="hours">horas</option>
                                            <option value="days">dias</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium block mb-1">Template</label>
                                    <select
                                        value={stepForm.template_id ?? ""}
                                        onChange={e => setStepForm({ ...stepForm, template_id: e.target.value || null })}
                                        className="w-full px-2 py-1.5 text-sm border rounded-lg bg-background"
                                    >
                                        <option value="">— Conteúdo próprio —</option>
                                        {templates.map(t => (
                                            <option key={t.id} value={t.id}>{t.title}</option>
                                        ))}
                                    </select>
                                </div>
                                {!stepForm.template_id && (
                                    <>
                                        <input
                                            value={stepForm.subject}
                                            onChange={e => setStepForm({ ...stepForm, subject: e.target.value })}
                                            placeholder="Assunto"
                                            className="w-full px-2 py-1.5 text-sm border rounded-lg bg-background"
                                        />
                                        <textarea
                                            value={stepForm.body_html}
                                            onChange={e => setStepForm({ ...stepForm, body_html: e.target.value })}
                                            placeholder="Corpo HTML"
                                            rows={6}
                                            className="w-full px-2 py-1.5 text-sm border rounded-lg bg-background font-mono"
                                        />
                                    </>
                                )}
                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={() => setAddingStep(false)}
                                        className="text-xs px-2.5 py-1 rounded-lg border hover:bg-muted"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={addStep}
                                        className="text-xs flex items-center gap-1.5 bg-primary text-primary-foreground px-2.5 py-1 rounded-lg hover:opacity-90"
                                    >
                                        <Plus className="h-3 w-3" /> Adicionar step
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-2">
                    <button
                        onClick={cancel}
                        className="text-sm px-3 py-1.5 rounded-lg border hover:bg-muted"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={save}
                        disabled={saving}
                        className="text-sm flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                        Salvar rascunho
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                    Campanhas segmentadas por e-mail. Opt-outs são sempre excluídos.
                </p>
                <div className="flex gap-2">
                    <button
                        onClick={fetchList}
                        className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg border hover:bg-muted"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Atualizar
                    </button>
                    <button
                        onClick={startNew}
                        className="text-sm flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90"
                    >
                        <Plus className="h-3.5 w-3.5" /> Nova campanha
                    </button>
                </div>
            </div>

            {feedback && (
                <p
                    className={`text-sm flex items-center gap-2 px-3 py-2 rounded-lg border ${
                        feedback.type === "ok"
                            ? "bg-green-500/5 border-green-500/30 text-green-600 dark:text-green-400"
                            : "bg-red-500/5 border-red-500/30 text-red-600 dark:text-red-400"
                    }`}
                >
                    {feedback.type === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    {feedback.msg}
                </p>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : list.length === 0 ? (
                <div className="border-2 border-dashed rounded-xl p-12 text-center">
                    <Mail className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">
                        Nenhuma campanha de e-mail. Crie a primeira pra começar.
                    </p>
                </div>
            ) : (
                <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-left px-4 py-2 font-medium">Nome</th>
                                <th className="text-left px-4 py-2 font-medium">Status</th>
                                <th className="text-right px-4 py-2 font-medium">Destinatários</th>
                                <th className="text-right px-4 py-2 font-medium">Steps</th>
                                <th className="text-right px-4 py-2 font-medium">Enviados</th>
                                <th className="text-right px-4 py-2 font-medium">Falhas</th>
                                <th className="text-left px-4 py-2 font-medium">Atualizado</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map(c => (
                                <tr key={c.id} className="border-t hover:bg-muted/30">
                                    <td className="px-4 py-2 font-medium">
                                        <button onClick={() => startEdit(c)} className="hover:underline text-left">
                                            {c.name}
                                        </button>
                                        {c.description && (
                                            <p className="text-[11px] text-muted-foreground mt-0.5">{c.description}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-2">
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status]}`}>
                                            {STATUS_LABELS[c.status]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-right tabular-nums">{c.total_recipients}</td>
                                    <td className="px-4 py-2 text-right tabular-nums">{c.steps_count ?? 0}</td>
                                    <td className="px-4 py-2 text-right tabular-nums text-green-600">{c.sent_count}</td>
                                    <td className="px-4 py-2 text-right tabular-nums text-red-600">{c.failed_count}</td>
                                    <td className="px-4 py-2 text-xs text-muted-foreground">
                                        {new Date(c.updated_at).toLocaleString("pt-BR")}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        {c.status === "rascunho" && (
                                            <button
                                                onClick={() => dispatchCampaign(c.id)}
                                                className="text-xs flex items-center gap-1 text-primary hover:underline"
                                            >
                                                <Send className="h-3 w-3" /> Disparar
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
