"use client"

import { useEffect, useState } from "react"
import {
    Plus, Send, Loader2, AlertCircle, CheckCircle2,
    Megaphone, Trash2, RefreshCw, ImageIcon, X, Pencil,
    Clock, StopCircle, Reply, ChevronDown, ChevronUp,
} from "lucide-react"
import type { Campaign, CampaignDelayUnit, CampaignStep, Template } from "./types"
import { INTERESSE_GROUPS } from "./types"
import { useR2Upload, type MediaType } from "./useR2Upload"

interface Props {
    templates: Template[]
}

const STATUS_LABELS: Record<Campaign["status"], string> = {
    rascunho: "Rascunho",
    enviando: "Enviando",
    concluida: "Concluída",
    cancelada: "Cancelada",
    erro: "Erro",
}
const STATUS_COLORS: Record<Campaign["status"], string> = {
    rascunho: "bg-gray-500/15 text-gray-600 dark:text-gray-300",
    enviando: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    concluida: "bg-green-500/15 text-green-600 dark:text-green-400",
    cancelada: "bg-red-500/15 text-red-600 dark:text-red-400",
    erro: "bg-red-500/15 text-red-600 dark:text-red-400",
}

export function CampaignsTab({ templates }: Props) {
    const [list, setList] = useState<Campaign[]>([])
    const [loading, setLoading] = useState(true)
    const [editingId, setEditingId] = useState<string | "new" | null>(null)
    const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null)

    async function fetchList() {
        setLoading(true)
        try {
            const res = await fetch(`/api/whatsapp/central/campaigns`)
            const data = await res.json()
            setList(data.campaigns ?? [])
        } finally {
            setLoading(false)
        }
    }
    useEffect(() => { fetchList() }, [])

    async function handleSendCampaign(id: string) {
        if (!confirm("Disparar esta campanha agora? O passo 0 será enviado imediatamente; passos seguintes seguem o cronograma configurado.")) return
        const res = await fetch(`/api/whatsapp/central/campaigns/${id}/send`, { method: "POST" })
        const data = await res.json()
        if (!res.ok) {
            setFeedback({ type: "err", msg: data.error ?? "Falha ao disparar" })
        } else {
            const followUp = data.follow_up_scheduled
                ? ` Próximo follow-up agendado para ${new Date(data.next_send_at).toLocaleString("pt-BR")}.`
                : ""
            setFeedback({ type: "ok", msg: `Campanha disparada — ${data.queued} envios na fila.${followUp}` })
        }
        fetchList()
    }

    async function handleDelete(id: string) {
        if (!confirm("Deletar esta campanha em rascunho?")) return
        await fetch(`/api/whatsapp/central/campaigns/${id}`, { method: "DELETE" })
        fetchList()
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                    Listas de transmissão segmentadas com sequência opcional de follow-ups. Opt-outs são sempre excluídos.
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
                        onClick={() => setEditingId("new")}
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
                    {feedback.type === "ok"
                        ? <CheckCircle2 className="h-4 w-4" />
                        : <AlertCircle className="h-4 w-4" />}
                    {feedback.msg}
                </p>
            )}

            {editingId !== null && (
                <CampaignForm
                    editingId={editingId === "new" ? null : editingId}
                    templates={templates}
                    onClose={() => setEditingId(null)}
                    onSaved={() => {
                        setEditingId(null)
                        fetchList()
                    }}
                />
            )}

            <div className="bg-card text-card-foreground rounded-xl border overflow-hidden">
                {loading ? (
                    <div className="p-10 flex justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : list.length === 0 ? (
                    <div className="p-10 text-center text-sm text-muted-foreground space-y-2">
                        <Megaphone className="h-8 w-8 mx-auto opacity-40" />
                        <p>Nenhuma campanha criada ainda.</p>
                    </div>
                ) : (
                    <div className="divide-y">
                        {list.map(c => (
                            <div key={c.id} className="px-5 py-4 flex items-center gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="font-semibold truncate">{c.name}</h4>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status]}`}>
                                            {STATUS_LABELS[c.status]}
                                        </span>
                                        {(c.steps_count ?? 0) > 0 && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400">
                                                +{c.steps_count} follow-up{(c.steps_count ?? 0) > 1 ? "s" : ""}
                                            </span>
                                        )}
                                    </div>
                                    {c.description && (
                                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                            {c.description}
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                                        <span>{c.total_recipients} destinatários</span>
                                        <span className="text-green-600 dark:text-green-400">✓ {c.sent_count}</span>
                                        <span className="text-red-600 dark:text-red-400">✕ {c.failed_count}</span>
                                        {(c.replied_count ?? 0) > 0 && (
                                            <span className="text-blue-600 dark:text-blue-400">↩ {c.replied_count} responderam</span>
                                        )}
                                        {(c.stopped_count ?? 0) > 0 && (
                                            <span className="text-zinc-500">⏹ {c.stopped_count} pararam</span>
                                        )}
                                        {c.started_at && (
                                            <span>
                                                disparada em {new Date(c.started_at).toLocaleString("pt-BR")}
                                            </span>
                                        )}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {c.status === "rascunho" && (
                                        <>
                                            <button
                                                onClick={() => setEditingId(c.id)}
                                                className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-md border hover:bg-muted"
                                            >
                                                <Pencil className="h-3 w-3" /> Editar
                                            </button>
                                            <button
                                                onClick={() => handleSendCampaign(c.id)}
                                                className="text-xs flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90"
                                            >
                                                <Send className="h-3 w-3" /> Disparar
                                            </button>
                                            <button
                                                onClick={() => handleDelete(c.id)}
                                                className="text-xs p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                                                title="Deletar"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

/* ─── Formulário (criação + edição) ───────────────────────────────── */

interface CampaignFormState {
    name: string
    description: string
    template_id: string
    body: string
    interesseGroup: string
    stage: string
    media_url: string | null
    media_type: MediaType | null
    media_mime: string | null
    media_filename: string | null
    media_caption: string | null
    stop_on_reply: boolean
    stop_on_optout: boolean
    stop_on_handoff: boolean
    stop_on_interest: boolean
    reply_tag: string
    reply_handoff: boolean
}

const EMPTY_FORM: CampaignFormState = {
    name: "",
    description: "",
    template_id: "",
    body: "",
    interesseGroup: "",
    stage: "",
    media_url: null,
    media_type: null,
    media_mime: null,
    media_filename: null,
    media_caption: null,
    stop_on_reply: true,
    stop_on_optout: true,
    stop_on_handoff: true,
    stop_on_interest: false,
    reply_tag: "",
    reply_handoff: false,
}

function CampaignForm({
    editingId, templates, onClose, onSaved,
}: {
    editingId: string | null   // null = create, string = edit
    templates: Template[]
    onClose: () => void
    onSaved: () => void
}) {
    const isEdit = !!editingId
    const [form, setForm] = useState<CampaignFormState>(EMPTY_FORM)
    const [steps, setSteps] = useState<CampaignStep[]>([])
    const [preview, setPreview] = useState<{ total: number; sample: { nome: string; telefone: string }[] } | null>(null)
    const [loading, setLoading] = useState(false)
    const [initialLoading, setInitialLoading] = useState(isEdit)
    const [err, setErr] = useState<string | null>(null)
    const { fileInputRef, uploading, uploadFile } = useR2Upload()

    // Carrega dados em modo edição
    useEffect(() => {
        if (!isEdit || !editingId) return
        let cancelled = false
        ;(async () => {
            const res = await fetch(`/api/whatsapp/central/campaigns/${editingId}`)
            if (!res.ok || cancelled) return
            const data = await res.json()
            const c = data.campaign as Campaign | undefined
            if (!c) return
            const seg = (c.segment ?? {}) as Record<string, unknown>
            // tenta achar o grupo de interesse a partir do segmento gravado
            let interesseGroup = ""
            const ip = seg.interesse_principal
            const ips = Array.isArray(ip) ? ip : (typeof ip === "string" ? [ip] : [])
            if (ips.length > 0) {
                const g = INTERESSE_GROUPS.find(x =>
                    x.ids.length === ips.length && x.ids.every(i => ips.includes(i))
                )
                if (g) interesseGroup = g.label
            }
            setForm({
                name: c.name,
                description: c.description ?? "",
                template_id: c.template_id ?? "",
                body: c.body ?? "",
                interesseGroup,
                stage: typeof seg.stage === "string" ? seg.stage : "",
                media_url: c.media_url,
                media_type: c.media_type,
                media_mime: c.media_mime,
                media_filename: c.media_filename,
                media_caption: c.media_caption,
                stop_on_reply: c.stop_on_reply,
                stop_on_optout: c.stop_on_optout,
                stop_on_handoff: c.stop_on_handoff,
                stop_on_interest: c.stop_on_interest,
                reply_tag: c.reply_tag ?? "",
                reply_handoff: c.reply_handoff,
            })
            setSteps(data.steps ?? [])
            setInitialLoading(false)
        })()
        return () => { cancelled = true }
    }, [isEdit, editingId])

    function buildSegment() {
        const seg: Record<string, unknown> = {}
        if (form.interesseGroup) {
            const g = INTERESSE_GROUPS.find(x => x.label === form.interesseGroup)
            if (g) seg.interesse_principal = g.ids.length === 1 ? g.ids[0] : g.ids
        }
        if (form.stage) seg.stage = form.stage
        return seg
    }

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setErr(null)
        try {
            const up = await uploadFile(file)
            setForm(f => ({
                ...f,
                media_url: up.key,
                media_type: up.type,
                media_mime: up.mime,
                media_filename: up.filename,
            }))
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Erro no upload")
        }
    }

    function clearMedia() {
        setForm(f => ({
            ...f,
            media_url: null, media_type: null, media_mime: null,
            media_filename: null, media_caption: null,
        }))
    }

    async function handlePreview() {
        setLoading(true)
        setErr(null)
        try {
            const res = await fetch(`/api/whatsapp/central/campaigns/preview`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ segment: buildSegment() }),
            })
            const data = await res.json()
            if (!res.ok) {
                setErr(data.error ?? "Erro no preview")
                return
            }
            setPreview(data)
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        if (!form.name.trim()) {
            setErr("Nome é obrigatório.")
            return
        }
        const hasContent = form.template_id || form.body.trim() || form.media_url
        if (!hasContent) {
            setErr("Selecione um template, escreva o corpo ou anexe mídia para o passo 0.")
            return
        }
        setLoading(true)
        setErr(null)
        try {
            const payload = {
                name: form.name.trim(),
                description: form.description.trim() || null,
                segment: buildSegment(),
                template_id: form.template_id || null,
                body: form.body.trim() || null,
                media_url: form.media_url,
                media_type: form.media_type,
                media_mime: form.media_mime,
                media_filename: form.media_filename,
                media_caption: form.media_caption,
                stop_on_reply: form.stop_on_reply,
                stop_on_optout: form.stop_on_optout,
                stop_on_handoff: form.stop_on_handoff,
                stop_on_interest: form.stop_on_interest,
                reply_tag: form.reply_tag.trim() || null,
                reply_handoff: form.reply_handoff,
            }
            const url = isEdit
                ? `/api/whatsapp/central/campaigns/${editingId}`
                : `/api/whatsapp/central/campaigns`
            const res = await fetch(url, {
                method: isEdit ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            const data = await res.json()
            if (!res.ok) {
                setErr(data.error ?? "Erro ao salvar")
                return
            }
            onSaved()
        } finally {
            setLoading(false)
        }
    }

    if (initialLoading) {
        return (
            <div className="bg-card text-card-foreground rounded-xl border p-10 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="bg-card text-card-foreground rounded-xl border p-5 space-y-5">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                    {isEdit ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {isEdit ? "Editar campanha" : "Nova campanha"}
                </h3>
                <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
                    Fechar
                </button>
            </div>

            {/* ── Seção: básico ────────────────────────────────────── */}
            <Section title="Identificação">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Nome">
                        <input
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                            placeholder="Ex: Aviso leilão maio"
                        />
                    </Field>
                    <Field label="Descrição">
                        <input
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                            placeholder="(opcional)"
                        />
                    </Field>
                </div>
            </Section>

            {/* ── Seção: segmento ──────────────────────────────────── */}
            <Section title="Segmento" subtitle="Filtros aplicados em crm_leads. Opt-outs são sempre excluídos.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Filtrar por interesse">
                        <select
                            value={form.interesseGroup}
                            onChange={e => setForm(f => ({ ...f, interesseGroup: e.target.value }))}
                            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                        >
                            <option value="">Todos</option>
                            {INTERESSE_GROUPS.map(g => (
                                <option key={g.label} value={g.label}>
                                    {g.label}{g.ids.length > 1 ? ` (${g.ids.length} variantes)` : ''}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Filtrar por stage">
                        <select
                            value={form.stage}
                            onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}
                            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                        >
                            <option value="">Todos</option>
                            <option value="novo">Novo</option>
                            <option value="contato">Contato</option>
                            <option value="proposta">Proposta</option>
                            <option value="fechado">Fechado</option>
                            <option value="perdido">Perdido</option>
                        </select>
                    </Field>
                </div>
                <div className="flex items-center gap-2 mt-3">
                    <button
                        onClick={handlePreview}
                        disabled={loading}
                        className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-md border hover:bg-muted disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Pré-visualizar público
                    </button>
                    {preview && (
                        <p className="text-xs text-muted-foreground">
                            <strong className="text-foreground">{preview.total}</strong> leads
                            {preview.total > 0 && (
                                <span className="ml-2">
                                    (ex: {preview.sample.slice(0, 3).map(s => s.nome).join(", ")})
                                </span>
                            )}
                        </p>
                    )}
                </div>
            </Section>

            {/* ── Seção: passo 0 ───────────────────────────────────── */}
            <Section title="Mensagem inicial (passo 0)" subtitle="Disparada na hora que você clicar em Disparar.">
                <Field label="Template (opcional — se vazio, use a mensagem livre abaixo)">
                    <select
                        value={form.template_id}
                        onChange={e => setForm(f => ({ ...f, template_id: e.target.value }))}
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                    >
                        <option value="">— Nenhum —</option>
                        {templates.map(t => (
                            <option key={t.id} value={t.id}>[{t.category}] {t.title}</option>
                        ))}
                    </select>
                </Field>

                {!form.template_id && (
                    <Field label="Mensagem livre" className="mt-3">
                        <textarea
                            value={form.body}
                            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                            rows={5}
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
                            placeholder={"Olá {nome}, novidades por aqui…"}
                        />
                    </Field>
                )}

                <MediaBlock
                    media_url={form.media_url}
                    media_type={form.media_type}
                    media_mime={form.media_mime}
                    media_filename={form.media_filename}
                    media_caption={form.media_caption}
                    onChangeCaption={c => setForm(f => ({ ...f, media_caption: c }))}
                    onFileChange={handleFileChange}
                    onClear={clearMedia}
                    uploading={uploading}
                    fileInputRef={fileInputRef}
                    label="Anexar mídia (opcional — sobrescreve a do template)"
                />
            </Section>

            {/* ── Seção: sequência (só em edição) ──────────────────── */}
            {isEdit && editingId && (
                <Section
                    title="Sequência de follow-up"
                    subtitle="Passos adicionais agendados a partir do passo anterior. Cada passo respeita as regras de parada abaixo."
                >
                    <StepsEditor
                        campaignId={editingId}
                        templates={templates}
                        steps={steps}
                        onChange={setSteps}
                    />
                </Section>
            )}
            {!isEdit && (
                <Section title="Sequência de follow-up" subtitle="Disponível após salvar o rascunho — abra a campanha em Editar pra adicionar passos.">
                    <p className="text-xs text-muted-foreground italic">Salve o rascunho primeiro pra configurar a sequência.</p>
                </Section>
            )}

            {/* ── Seção: regras de parada ──────────────────────────── */}
            <Section
                title="Regras de parada"
                subtitle="Quando algum desses gatilhos disparar, a sequência é interrompida pra esse destinatário (não para a campanha inteira)."
                icon={<StopCircle className="h-4 w-4" />}
            >
                <Toggle
                    label="Parar quando o lead responder"
                    description="Pra a sequência assim que qualquer inbound for recebida desse destinatário."
                    checked={form.stop_on_reply}
                    onChange={v => setForm(f => ({ ...f, stop_on_reply: v }))}
                />
                <Toggle
                    label="Parar em opt-out"
                    description="Pra a sequência se o lead virar opt-out (PARAR, etc). Recomendado true por compliance."
                    checked={form.stop_on_optout}
                    onChange={v => setForm(f => ({ ...f, stop_on_optout: v }))}
                />
                <Toggle
                    label="Parar em handoff humano"
                    description="Pra a sequência se o operador mover o lead pra handoff humano (via Inbox)."
                    checked={form.stop_on_handoff}
                    onChange={v => setForm(f => ({ ...f, stop_on_handoff: v }))}
                />
                <Toggle
                    label="Parar quando interesse for identificado"
                    description="Pra a sequência se o engine gravar interesse_principal no lead (sinal forte de qualificação)."
                    checked={form.stop_on_interest}
                    onChange={v => setForm(f => ({ ...f, stop_on_interest: v }))}
                />
            </Section>

            {/* ── Seção: reação à resposta ─────────────────────────── */}
            <Section
                title="Reação à resposta"
                subtitle="Aplicada UMA vez quando o lead responder durante a janela ativa da campanha (antes de a sequência parar)."
                icon={<Reply className="h-4 w-4" />}
            >
                <Field label="Tag aplicada no lead ao responder">
                    <input
                        value={form.reply_tag}
                        onChange={e => setForm(f => ({ ...f, reply_tag: e.target.value }))}
                        placeholder="ex: campanha:leilao-maio:respondeu"
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                        Útil pra segmentar follow-ups manuais depois. Deixe vazio pra não aplicar tag.
                    </p>
                </Field>
                <Toggle
                    label="Mover lead pra handoff humano ao responder"
                    description="Marca handoff_humano=true automaticamente. Use em campanhas pequenas/quentes onde o operador prefere conduzir manualmente."
                    checked={form.reply_handoff}
                    onChange={v => setForm(f => ({ ...f, reply_handoff: v }))}
                />
            </Section>

            {err && (
                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" /> {err}
                </p>
            )}

            <div className="flex gap-2 justify-end pt-2 border-t">
                <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-md text-sm border hover:bg-muted"
                >
                    Fechar
                </button>
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEdit ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />)}
                    {isEdit ? "Salvar alterações" : "Salvar como rascunho"}
                </button>
            </div>
        </div>
    )
}

/* ─── Componentes de seção/toggle/field ─────────────────────────── */

function Section({
    title, subtitle, icon, children,
}: {
    title: string
    subtitle?: string
    icon?: React.ReactNode
    children: React.ReactNode
}) {
    return (
        <div className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
            <div>
                <h4 className="font-semibold text-sm flex items-center gap-1.5">
                    {icon}
                    {title}
                </h4>
                {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
            <div className="space-y-3">{children}</div>
        </div>
    )
}

function Field({
    label, children, className = "",
}: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={`space-y-1 ${className}`}>
            <label className="text-xs font-medium">{label}</label>
            {children}
        </div>
    )
}

function Toggle({
    label, description, checked, onChange,
}: {
    label: string
    description?: string
    checked: boolean
    onChange: (v: boolean) => void
}) {
    return (
        <label className="flex items-start gap-3 cursor-pointer">
            <input
                type="checkbox"
                checked={checked}
                onChange={e => onChange(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <div className="flex-1">
                <div className="text-sm font-medium">{label}</div>
                {description && <div className="text-xs text-muted-foreground">{description}</div>}
            </div>
        </label>
    )
}

function MediaBlock({
    media_url, media_type, media_mime, media_filename, media_caption,
    onChangeCaption, onFileChange, onClear, uploading, fileInputRef, label,
}: {
    media_url: string | null
    media_type: MediaType | null
    media_mime: string | null
    media_filename: string | null
    media_caption: string | null
    onChangeCaption: (c: string | null) => void
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    onClear: () => void
    uploading: boolean
    fileInputRef: React.RefObject<HTMLInputElement | null>
    label: string
}) {
    void media_type
    return (
        <div className="space-y-2 mt-3">
            <div className="flex items-center justify-between">
                <label className="text-xs font-medium flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" /> {label}
                </label>
                {media_url && (
                    <button
                        onClick={onClear}
                        className="text-[10px] text-red-600 hover:underline flex items-center gap-0.5"
                    >
                        <X className="h-3 w-3" /> Remover
                    </button>
                )}
            </div>

            {media_url ? (
                <div className="rounded-md border bg-muted/30 p-2 space-y-2">
                    <div className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-blue-500" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{media_filename ?? media_url}</p>
                            <p className="text-[10px] text-muted-foreground">{media_mime}</p>
                        </div>
                    </div>
                    <input
                        value={media_caption ?? ''}
                        onChange={e => onChangeCaption(e.target.value || null)}
                        placeholder="Legenda da mídia (opcional)"
                        className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                    />
                </div>
            ) : (
                <div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*,audio/*,application/pdf"
                        onChange={onFileChange}
                        disabled={uploading}
                        className="block w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-primary file:text-primary-foreground hover:file:opacity-90 file:cursor-pointer"
                    />
                    {uploading && (
                        <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" /> Enviando para Cloudflare R2…
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}

/* ─── Editor de steps ─────────────────────────────────────────── */

function StepsEditor({
    campaignId, templates, steps, onChange,
}: {
    campaignId: string
    templates: Template[]
    steps: CampaignStep[]
    onChange: (s: CampaignStep[]) => void
}) {
    const [editingStep, setEditingStep] = useState<string | "new" | null>(null)
    const [busy, setBusy] = useState(false)

    async function refreshSteps() {
        const r = await fetch(`/api/whatsapp/central/campaigns/${campaignId}/steps`)
        if (!r.ok) return
        const d = await r.json()
        onChange(d.steps ?? [])
    }

    async function handleDelete(stepId: string) {
        if (!confirm("Remover este passo da sequência?")) return
        setBusy(true)
        try {
            await fetch(`/api/whatsapp/central/campaigns/${campaignId}/steps/${stepId}`, {
                method: "DELETE",
            })
            await refreshSteps()
        } finally { setBusy(false) }
    }

    return (
        <div className="space-y-2">
            {steps.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                    Sem passos adicionais. Use [+ Adicionar passo] para configurar follow-ups.
                </p>
            ) : (
                <div className="space-y-2">
                    {steps.map((s, idx) => {
                        const tpl = templates.find(t => t.id === s.template_id)
                        return (
                            <div key={s.id} className="rounded-md border bg-muted/20 p-3 flex items-start gap-3">
                                <div className="text-[10px] font-bold px-2 py-1 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 shrink-0">
                                    PASSO {idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs flex items-center gap-2 text-muted-foreground">
                                        <Clock className="h-3 w-3" />
                                        <span>+{s.delay_value} {delayUnitLabel(s.delay_unit, s.delay_value)} após o passo anterior</span>
                                    </div>
                                    <div className="text-sm font-medium truncate mt-0.5">
                                        {tpl ? `${tpl.title} (${tpl.slug})` : (s.body ? s.body.slice(0, 80) : "(sem conteúdo)")}
                                    </div>
                                    {s.media_url && (
                                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                            <ImageIcon className="h-3 w-3" /> {s.media_filename ?? s.media_url}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => setEditingStep(s.id)}
                                        disabled={busy}
                                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                                        title="Editar passo"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(s.id)}
                                        disabled={busy}
                                        className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-600"
                                        title="Remover passo"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            <button
                onClick={() => setEditingStep("new")}
                className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-dashed hover:bg-muted text-muted-foreground"
            >
                <Plus className="h-3 w-3" /> Adicionar passo
            </button>

            {editingStep !== null && (
                <StepFormModal
                    campaignId={campaignId}
                    templates={templates}
                    step={editingStep === "new" ? null : steps.find(s => s.id === editingStep) ?? null}
                    onClose={() => setEditingStep(null)}
                    onSaved={async () => {
                        setEditingStep(null)
                        await refreshSteps()
                    }}
                />
            )}
        </div>
    )
}

function delayUnitLabel(unit: CampaignDelayUnit, value: number): string {
    const plural = value !== 1
    switch (unit) {
        case 'minutes': return plural ? 'minutos' : 'minuto'
        case 'hours':   return plural ? 'horas' : 'hora'
        case 'days':    return plural ? 'dias' : 'dia'
    }
}

function StepFormModal({
    campaignId, templates, step, onClose, onSaved,
}: {
    campaignId: string
    templates: Template[]
    step: CampaignStep | null   // null = create
    onClose: () => void
    onSaved: () => void
}) {
    const isEdit = !!step
    const [delay_value, setDelayValue] = useState(step?.delay_value ?? 1)
    const [delay_unit, setDelayUnit] = useState<CampaignDelayUnit>(step?.delay_unit ?? "days")
    const [template_id, setTemplateId] = useState(step?.template_id ?? "")
    const [body, setBody] = useState(step?.body ?? "")
    const [media_url, setMediaUrl] = useState(step?.media_url ?? null)
    const [media_type, setMediaType] = useState<MediaType | null>(step?.media_type ?? null)
    const [media_mime, setMediaMime] = useState(step?.media_mime ?? null)
    const [media_filename, setMediaFilename] = useState(step?.media_filename ?? null)
    const [media_caption, setMediaCaption] = useState(step?.media_caption ?? null)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [advancedOpen, setAdvancedOpen] = useState(false)
    const { fileInputRef, uploading, uploadFile } = useR2Upload()

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        try {
            const up = await uploadFile(file)
            setMediaUrl(up.key)
            setMediaType(up.type)
            setMediaMime(up.mime)
            setMediaFilename(up.filename)
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Erro no upload")
        }
    }

    async function handleSave() {
        if (!template_id && !body.trim() && !media_url) {
            setErr("Selecione um template, escreva uma mensagem ou anexe mídia.")
            return
        }
        setBusy(true)
        setErr(null)
        try {
            const payload = {
                delay_value, delay_unit,
                template_id: template_id || null,
                body: body.trim() || null,
                media_url, media_type, media_mime, media_filename, media_caption,
            }
            const url = isEdit
                ? `/api/whatsapp/central/campaigns/${campaignId}/steps/${step!.id}`
                : `/api/whatsapp/central/campaigns/${campaignId}/steps`
            const res = await fetch(url, {
                method: isEdit ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            const data = await res.json()
            if (!res.ok) {
                setErr(data.error ?? "Erro ao salvar passo")
                return
            }
            onSaved()
        } finally { setBusy(false) }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-card text-card-foreground rounded-xl border max-w-lg w-full max-h-[90vh] overflow-auto p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <h4 className="font-semibold flex items-center gap-2">
                        {isEdit ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        {isEdit ? "Editar passo" : "Novo passo"}
                    </h4>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <Field label="Atraso (a partir do passo anterior)">
                    <div className="flex gap-2">
                        <input
                            type="number"
                            min={0}
                            value={delay_value}
                            onChange={e => setDelayValue(Math.max(0, Number(e.target.value) || 0))}
                            className="w-24 rounded-md border bg-background px-3 py-1.5 text-sm"
                        />
                        <select
                            value={delay_unit}
                            onChange={e => setDelayUnit(e.target.value as CampaignDelayUnit)}
                            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
                        >
                            <option value="minutes">minutos</option>
                            <option value="hours">horas</option>
                            <option value="days">dias</option>
                        </select>
                    </div>
                </Field>

                <Field label="Template (opcional)">
                    <select
                        value={template_id}
                        onChange={e => setTemplateId(e.target.value)}
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                    >
                        <option value="">— Nenhum (use mensagem livre) —</option>
                        {templates.map(t => (
                            <option key={t.id} value={t.id}>[{t.category}] {t.title}</option>
                        ))}
                    </select>
                </Field>

                {!template_id && (
                    <Field label="Mensagem livre">
                        <textarea
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            rows={4}
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
                            placeholder={"Olá {nome}, ainda interessado em…"}
                        />
                    </Field>
                )}

                <button
                    type="button"
                    onClick={() => setAdvancedOpen(o => !o)}
                    className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                    {advancedOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Mídia anexa (opcional)
                </button>
                {advancedOpen && (
                    <div className="space-y-2">
                        {media_url ? (
                            <div className="rounded-md border bg-muted/30 p-2 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <ImageIcon className="h-4 w-4 text-blue-500" />
                                        <p className="text-xs font-medium truncate">{media_filename ?? media_url}</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setMediaUrl(null); setMediaType(null); setMediaMime(null)
                                            setMediaFilename(null); setMediaCaption(null)
                                        }}
                                        className="text-[10px] text-red-600 hover:underline flex items-center gap-0.5"
                                    >
                                        <X className="h-3 w-3" /> Remover
                                    </button>
                                </div>
                                <input
                                    value={media_caption ?? ""}
                                    onChange={e => setMediaCaption(e.target.value || null)}
                                    placeholder="Legenda da mídia"
                                    className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                                />
                            </div>
                        ) : (
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,video/*,audio/*,application/pdf"
                                onChange={handleFile}
                                disabled={uploading}
                                className="block w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-primary file:text-primary-foreground hover:file:opacity-90 file:cursor-pointer"
                            />
                        )}
                    </div>
                )}

                {err && (
                    <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4" /> {err}
                    </p>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t">
                    <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border hover:bg-muted">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={busy}
                        className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {isEdit ? "Salvar" : "Adicionar"}
                    </button>
                </div>
            </div>
        </div>
    )
}
