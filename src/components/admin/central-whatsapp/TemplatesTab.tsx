"use client"

import { useState, useRef } from "react"
import {
    Plus, Save, Trash2, Archive, AlertCircle, CheckCircle2, Loader2, Edit3,
    ImageIcon, Vote, Upload, X, UploadCloud, RefreshCw, ShieldCheck, Clock, ShieldX,
} from "lucide-react"
import type { Template, MetaTemplateStatus } from "./types"

type MetaCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION"

const META_CATEGORY_BY_LOCAL: Record<string, MetaCategory> = {
    encaminhamento: "UTILITY",
    optout: "UTILITY",
    follow_up: "UTILITY",
}

function metaBadge(status: MetaTemplateStatus) {
    switch (status) {
        case "APPROVED":
            return { label: "aprovado Meta", cls: "text-green-600 dark:text-green-400 bg-green-500/10", Icon: ShieldCheck }
        case "PENDING":
            return { label: "pendente Meta", cls: "text-amber-600 dark:text-amber-400 bg-amber-500/10", Icon: Clock }
        case "REJECTED":
            return { label: "rejeitado Meta", cls: "text-red-600 dark:text-red-400 bg-red-500/10", Icon: ShieldX }
        case "PAUSED":
        case "DISABLED":
            return { label: status.toLowerCase(), cls: "text-muted-foreground bg-muted", Icon: ShieldX }
        default:
            return null // LOCAL = sem badge (só Baileys)
    }
}

const CATEGORIES = [
    { id: "welcome", label: "Boas-vindas" },
    { id: "triagem", label: "Triagem" },
    { id: "oportunidade", label: "Oportunidade" },
    { id: "leilao", label: "Leilão" },
    { id: "follow_up", label: "Follow-up" },
    { id: "encaminhamento", label: "Encaminhamento" },
    { id: "optout", label: "Opt-out" },
    { id: "reativacao", label: "Reativação" },
    { id: "aviso", label: "Aviso" },
    { id: "geral", label: "Geral" },
]

const MEDIA_TYPE_BY_MIME: Record<string, Template["media_type"]> = {}
function mediaTypeForMime(mime: string): Template["media_type"] {
    if (MEDIA_TYPE_BY_MIME[mime]) return MEDIA_TYPE_BY_MIME[mime]
    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('video/')) return 'video'
    if (mime.startsWith('audio/')) return 'audio'
    return 'document'
}

interface FormState {
    title: string
    category: string
    body: string
    media_url: string | null
    media_type: Template["media_type"]
    media_mime: string | null
    media_filename: string | null
    media_caption: string | null
    poll_question: string | null
    poll_options: string[]
    poll_selectable_count: number
}

const EMPTY_FORM: FormState = {
    title: "",
    category: "geral",
    body: "",
    media_url: null,
    media_type: null,
    media_mime: null,
    media_filename: null,
    media_caption: null,
    poll_question: null,
    poll_options: [],
    poll_selectable_count: 1,
}

interface Props {
    templates: Template[]
    onChange: () => void
}

export function TemplatesTab({ templates, onChange }: Props) {
    const [editing, setEditing] = useState<Template | null>(null)
    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const [submitId, setSubmitId] = useState<string | null>(null)
    const [submitCategory, setSubmitCategory] = useState<MetaCategory>("MARKETING")
    const [submitting, setSubmitting] = useState(false)
    const [syncing, setSyncing] = useState(false)

    function startSubmit(t: Template) {
        setSubmitId(t.id)
        setSubmitCategory(META_CATEGORY_BY_LOCAL[t.category] ?? "MARKETING")
        setFeedback(null)
    }

    async function confirmSubmit(t: Template) {
        setSubmitting(true)
        setFeedback(null)
        try {
            const res = await fetch(`/api/whatsapp/central/templates/${t.id}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ meta_category: submitCategory }),
            })
            const data = await res.json()
            if (!res.ok) {
                setFeedback({ type: "err", msg: data.error ?? "Falha ao submeter à Meta" })
                return
            }
            setFeedback({ type: "ok", msg: `Submetido à Meta como "${data.meta_name}" — aguardando aprovação.` })
            setSubmitId(null)
            onChange()
        } catch (e: unknown) {
            setFeedback({ type: "err", msg: e instanceof Error ? e.message : "Erro" })
        } finally {
            setSubmitting(false)
        }
    }

    async function syncStatuses() {
        setSyncing(true)
        setFeedback(null)
        try {
            const res = await fetch(`/api/whatsapp/central/templates/sync`, { method: "POST" })
            const data = await res.json()
            if (!res.ok) {
                setFeedback({ type: "err", msg: data.error ?? "Falha ao sincronizar" })
                return
            }
            setFeedback({
                type: "ok",
                msg: `Sincronizado com a Meta: ${data.updated ?? 0} atualizado(s), ${data.imported ?? 0} importado(s) da WABA.`,
            })
            onChange()
        } catch (e: unknown) {
            setFeedback({ type: "err", msg: e instanceof Error ? e.message : "Erro" })
        } finally {
            setSyncing(false)
        }
    }

    function startNew() {
        setEditing(null)
        setForm(EMPTY_FORM)
        setFeedback(null)
    }

    function startEdit(t: Template) {
        setEditing(t)
        setForm({
            title: t.title,
            category: t.category,
            body: t.body,
            media_url: t.media_url,
            media_type: t.media_type,
            media_mime: t.media_mime,
            media_filename: t.media_filename,
            media_caption: t.media_caption,
            poll_question: t.poll_question,
            poll_options: t.poll_options ?? [],
            poll_selectable_count: t.poll_selectable_count ?? 1,
        })
        setFeedback(null)
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > 50 * 1024 * 1024) {
            setFeedback({ type: "err", msg: "Arquivo > 50MB. Use mídia menor (limite do WhatsApp)." })
            return
        }
        setUploading(true)
        setFeedback(null)

        // Mesmo padrão usado em web-admin/biblioteca-midia/R2Library.tsx:
        // (1) fallback explícito de content-type (alguns browsers deixam vazio
        //     pra arquivos pouco comuns — e o presign do R2 assina com este
        //     valor; se o PUT manda outro, R2 rejeita com 403/SignatureMismatch);
        // (2) PUT via XHR para conseguir mostrar erros do R2 com texto.
        const contentType = file.type || 'application/octet-stream'
        try {
            const presignRes = await fetch('/api/r2/upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: file.name, contentType }),
            })
            const presign = await presignRes.json().catch(() => ({}))
            if (!presignRes.ok) {
                throw new Error(presign.error || `Falha gerando URL de upload (HTTP ${presignRes.status})`)
            }
            if (!presign.url || !presign.key) {
                throw new Error('Resposta do servidor sem url/key — confira as env vars R2_* no Vercel.')
            }

            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest()
                xhr.open('PUT', presign.url)
                xhr.setRequestHeader('Content-Type', contentType)
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) resolve()
                    else reject(new Error(
                        `Upload R2 falhou (HTTP ${xhr.status}). ` +
                        `${xhr.responseText ? xhr.responseText.slice(0, 200) : 'Verifique CORS do bucket no Cloudflare R2.'}`
                    ))
                }
                xhr.onerror = () => reject(new Error('Falha de rede no PUT — possível bloqueio CORS do R2.'))
                xhr.send(file)
            })

            const mt = mediaTypeForMime(contentType)
            setForm(f => ({
                ...f,
                media_url: presign.key,
                media_type: mt,
                media_mime: contentType,
                media_filename: file.name,
            }))
            setFeedback({ type: "ok", msg: `Arquivo enviado (${(file.size / 1024).toFixed(0)} KB).` })
        } catch (err: unknown) {
            setFeedback({ type: "err", msg: err instanceof Error ? err.message : "Erro no upload" })
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    function clearMedia() {
        setForm(f => ({
            ...f,
            media_url: null, media_type: null, media_mime: null, media_filename: null, media_caption: null,
        }))
    }

    function addPollOption() {
        setForm(f => ({
            ...f,
            poll_question: f.poll_question ?? "",
            poll_options: [...f.poll_options, ""],
        }))
    }

    function updatePollOption(idx: number, value: string) {
        setForm(f => ({
            ...f,
            poll_options: f.poll_options.map((o, i) => i === idx ? value : o),
        }))
    }

    function removePollOption(idx: number) {
        setForm(f => {
            const next = f.poll_options.filter((_, i) => i !== idx)
            return {
                ...f,
                poll_options: next,
                poll_selectable_count: Math.min(f.poll_selectable_count, Math.max(1, next.length)),
            }
        })
    }

    function clearPoll() {
        setForm(f => ({ ...f, poll_question: null, poll_options: [], poll_selectable_count: 1 }))
    }

    async function handleSave() {
        if (!form.title.trim()) {
            setFeedback({ type: "err", msg: "Título é obrigatório." })
            return
        }
        const hasContent = form.body.trim() || form.media_url || (form.poll_question && form.poll_options.length >= 2)
        if (!hasContent) {
            setFeedback({ type: "err", msg: "Informe mensagem, mídia ou enquete (pelo menos um)." })
            return
        }
        if (form.poll_question && form.poll_options.filter(o => o.trim()).length < 2) {
            setFeedback({ type: "err", msg: "Enquete precisa de pelo menos 2 opções preenchidas." })
            return
        }

        setSaving(true)
        setFeedback(null)
        try {
            const payload = {
                title: form.title.trim(),
                category: form.category,
                body: form.body,
                media_url: form.media_url,
                media_type: form.media_type,
                media_mime: form.media_mime,
                media_filename: form.media_filename,
                media_caption: form.media_caption,
                poll_question: form.poll_question?.trim() || null,
                poll_options: form.poll_options.map(o => o.trim()).filter(Boolean),
                poll_selectable_count: form.poll_selectable_count,
            }
            const res = editing
                ? await fetch(`/api/whatsapp/central/templates/${editing.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                })
                : await fetch(`/api/whatsapp/central/templates`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                })
            const data = await res.json()
            if (!res.ok) {
                setFeedback({ type: "err", msg: data.error ?? "Erro ao salvar" })
                return
            }
            setFeedback({ type: "ok", msg: editing ? "Template atualizado." : "Template criado." })
            onChange()
            if (!editing) startNew()
        } catch (e: unknown) {
            setFeedback({ type: "err", msg: e instanceof Error ? e.message : "Erro" })
        } finally {
            setSaving(false)
        }
    }

    async function handleArchive(id: string) {
        if (!confirm("Arquivar este template? Pode ser restaurado depois.")) return
        const res = await fetch(`/api/whatsapp/central/templates/${id}`, { method: "DELETE" })
        if (res.ok) onChange()
    }

    // Operação atual: os templates Meta (API oficial) são o centro — servem
    // campanhas, reaberturas de janela e disparos. A biblioteca local (Baileys,
    // era do grafo de triagem) fica recolhida como legado.
    const metaTemplates = templates.filter(t => t.meta_status !== "LOCAL")
    const localTemplates = templates.filter(t => t.meta_status === "LOCAL")
    const STATUS_ORDER: Record<string, number> = { APPROVED: 0, PENDING: 1, REJECTED: 2, PAUSED: 3, DISABLED: 4 }
    const metaSorted = [...metaTemplates].sort((a, b) =>
        (STATUS_ORDER[a.meta_status] ?? 9) - (STATUS_ORDER[b.meta_status] ?? 9) || a.title.localeCompare(b.title))
    const approvedCount = metaTemplates.filter(t => t.meta_status === "APPROVED").length
    const pendingCount = metaTemplates.filter(t => t.meta_status === "PENDING").length

    const grouped = localTemplates.reduce<Record<string, Template[]>>((acc, t) => {
        (acc[t.category] = acc[t.category] || []).push(t)
        return acc
    }, {})

    const hasPoll = form.poll_question !== null
    const mediaIsImage = form.media_type === 'image'

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] gap-4">
            {/* Lista */}
            <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{approvedCount}</span> aprovado(s) na Meta
                        {pendingCount > 0 && <> · <span className="text-amber-500">{pendingCount} pendente(s)</span></>}
                        {" "}· prontos para campanhas e reabertura de conversa.
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={syncStatuses}
                            disabled={syncing}
                            className="flex items-center gap-1.5 text-xs border px-2.5 py-1.5 rounded-lg hover:bg-muted disabled:opacity-50"
                            title="Atualiza status de aprovação e importa templates da WABA que ainda não estão aqui"
                        >
                            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Sincronizar com a Meta
                        </button>
                        <button
                            onClick={startNew}
                            className="flex items-center gap-1.5 text-sm font-medium text-black px-3 py-1.5 rounded-lg hover:opacity-90"
                            style={{ background: "#C9A84C" }}
                        >
                            <Plus className="h-3.5 w-3.5" /> Novo template
                        </button>
                    </div>
                </div>

                {/* ── Templates Meta (API oficial) — a operação de hoje ── */}
                <div>
                    <p className="font-display uppercase tracking-wide text-xs mb-1.5 px-1 flex items-center gap-2">
                        <span className="h-3.5 w-1 rounded-full" style={{ background: "#C9A84C" }} />
                        Templates Meta · API oficial
                    </p>
                    {metaSorted.length === 0 ? (
                        <div className="border border-dashed rounded-xl p-8 text-center text-sm text-muted-foreground">
                            Nenhum template Meta aqui ainda — clique em <strong>Sincronizar com a Meta</strong> para importar os da WABA.
                        </div>
                    ) : (
                        <div className="bg-card text-card-foreground rounded-xl border divide-y">
                            {metaSorted.map(t => {
                                const badge = metaBadge(t.meta_status)
                                return (
                                    <div key={t.id} className={`px-4 py-3 flex items-start gap-3 ${editing?.id === t.id ? "bg-primary/5 dark:bg-primary/10" : ""}`}>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <p className="font-semibold text-sm">{t.title}</p>
                                                {t.meta_category && (
                                                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                                        {t.meta_category}
                                                    </span>
                                                )}
                                                {badge && (
                                                    <span className={`inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${badge.cls}`}>
                                                        <badge.Icon className="h-2.5 w-2.5" /> {badge.label}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap mt-0.5">{t.body}</p>
                                            <p className="text-[10px] text-muted-foreground mt-1">
                                                <code>{t.slug}</code>{t.meta_language ? ` · ${t.meta_language}` : ""}
                                            </p>
                                            {t.meta_status === "REJECTED" && t.meta_rejected_reason && (
                                                <p className="text-[10px] text-red-600 dark:text-red-400 mt-0.5">Meta rejeitou: {t.meta_rejected_reason}</p>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                            <button onClick={() => startEdit(t)} className="text-xs text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted" title="Editar título/corpo local">
                                                <Edit3 className="h-3.5 w-3.5" />
                                            </button>
                                            <button onClick={() => handleArchive(t.id)} className="text-xs text-muted-foreground hover:text-red-600 p-1 rounded hover:bg-muted" title="Arquivar">
                                                <Archive className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* ── Biblioteca local (legado do grafo / envios Baileys) ── */}
                {localTemplates.length > 0 && (
                <details className="group">
                    <summary className="cursor-pointer select-none text-[11px] uppercase tracking-wider text-muted-foreground px-1 py-1.5 hover:text-foreground">
                        Biblioteca local · {localTemplates.length} template(s) — legado da triagem por fluxo (a IA atende agora); ainda usáveis em campanhas via Baileys
                    </summary>
                <div className="space-y-4 mt-2">
                {CATEGORIES.map(cat => {
                    const list = grouped[cat.id] ?? []
                    if (list.length === 0) return null
                    return (
                        <div key={cat.id}>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                                {cat.label}
                            </p>
                            <div className="bg-card text-card-foreground rounded-xl border divide-y">
                                {list.map(t => {
                                    const badge = metaBadge(t.meta_status)
                                    // Só dá pra submeter à Meta templates com corpo de texto
                                    // (mídia/enquete não são submissíveis aqui) e que não estão
                                    // já pendentes/aprovados.
                                    const canSubmit = !!t.body?.trim() &&
                                        (t.meta_status === "LOCAL" || t.meta_status === "REJECTED")
                                    return (
                                    <div
                                        key={t.id}
                                        className={editing?.id === t.id ? "bg-primary/5 dark:bg-primary/10" : ""}
                                    >
                                      <div className="px-4 py-3 flex items-start gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <p className="font-semibold text-sm">{t.title}</p>
                                                {t.media_url && (
                                                    <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                                        <ImageIcon className="h-2.5 w-2.5" /> {t.media_type}
                                                    </span>
                                                )}
                                                {t.poll_question && (
                                                    <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
                                                        <Vote className="h-2.5 w-2.5" /> enquete
                                                    </span>
                                                )}
                                                {badge && (
                                                    <span className={`inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${badge.cls}`}>
                                                        <badge.Icon className="h-2.5 w-2.5" /> {badge.label}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap mt-0.5">
                                                {t.body || (t.media_url ? '(somente mídia)' : '(somente enquete)')}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground mt-1">
                                                slug: <code>{t.slug}</code> · usado {t.usage_count}×
                                            </p>
                                            {t.meta_status === "REJECTED" && t.meta_rejected_reason && (
                                                <p className="text-[10px] text-red-600 dark:text-red-400 mt-0.5">
                                                    Meta rejeitou: {t.meta_rejected_reason}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                            <button
                                                onClick={() => startEdit(t)}
                                                className="text-xs text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"
                                                title="Editar"
                                            >
                                                <Edit3 className="h-3.5 w-3.5" />
                                            </button>
                                            {canSubmit && (
                                                <button
                                                    onClick={() => startSubmit(t)}
                                                    className="text-xs text-muted-foreground hover:text-primary p-1 rounded hover:bg-muted"
                                                    title="Submeter à Meta para aprovação (libera uso em massa pela Cloud API)"
                                                >
                                                    <UploadCloud className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleArchive(t.id)}
                                                className="text-xs text-muted-foreground hover:text-red-600 p-1 rounded hover:bg-muted"
                                                title="Arquivar"
                                            >
                                                <Archive className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                      </div>
                                      {submitId === t.id && (
                                        <div className="px-4 pb-3 -mt-1 flex flex-wrap items-center gap-2 bg-primary/5 dark:bg-primary/10">
                                            <span className="text-[11px] text-muted-foreground">Categoria Meta:</span>
                                            <select
                                                value={submitCategory}
                                                onChange={e => setSubmitCategory(e.target.value as MetaCategory)}
                                                className="rounded-md border bg-background px-2 py-1 text-xs"
                                            >
                                                <option value="MARKETING">Marketing</option>
                                                <option value="UTILITY">Utilidade</option>
                                                <option value="AUTHENTICATION">Autenticação</option>
                                            </select>
                                            <button
                                                onClick={() => confirmSubmit(t)}
                                                disabled={submitting}
                                                className="text-xs bg-primary text-primary-foreground px-2.5 py-1 rounded-md disabled:opacity-50 flex items-center gap-1"
                                            >
                                                {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <UploadCloud className="h-3 w-3" />}
                                                Submeter
                                            </button>
                                            <button
                                                onClick={() => setSubmitId(null)}
                                                className="text-xs border px-2.5 py-1 rounded-md hover:bg-muted"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                      )}
                                    </div>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
                </div>
                </details>
                )}
            </div>

            {/* Editor */}
            <div className="bg-card text-card-foreground rounded-xl border p-5 space-y-4 sticky top-4 self-start max-h-[calc(100vh-80px)] overflow-y-auto">
                <h3 className="font-semibold flex items-center gap-2">
                    {editing ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {editing ? `Editar: ${editing.title}` : "Novo template"}
                </h3>

                <div className="space-y-1">
                    <label className="text-xs font-medium">Título</label>
                    <input
                        value={form.title}
                        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder="Ex: Welcome Matheus institucional"
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-medium">Categoria</label>
                    <select
                        value={form.category}
                        onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                    >
                        {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-medium">Mensagem</label>
                    <textarea
                        value={form.body}
                        onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                        rows={8}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder={"Olá {nome}!\n\nObrigado pelo contato…"}
                    />
                    <p className="text-[10px] text-muted-foreground">
                        Variáveis disponíveis: <code>{"{nome}"}</code>, <code>{"{name}"}</code>
                    </p>
                </div>

                {/* Mídia */}
                <div className="space-y-2 border-t pt-3">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-medium flex items-center gap-1.5">
                            <ImageIcon className="h-3.5 w-3.5" /> Mídia (opcional)
                        </label>
                        {form.media_url && (
                            <button
                                onClick={clearMedia}
                                className="text-[10px] text-red-600 hover:underline flex items-center gap-0.5"
                            >
                                <X className="h-3 w-3" /> Remover
                            </button>
                        )}
                    </div>

                    {form.media_url ? (
                        <div className="rounded-md border bg-muted/30 p-2 space-y-2">
                            <div className="flex items-center gap-2">
                                {mediaIsImage ? <ImageIcon className="h-4 w-4 text-blue-500" /> : <Upload className="h-4 w-4 text-blue-500" />}
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">{form.media_filename ?? form.media_url}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                        {form.media_type} · {form.media_mime ?? '—'}
                                    </p>
                                </div>
                            </div>
                            <input
                                value={form.media_caption ?? ''}
                                onChange={e => setForm(f => ({ ...f, media_caption: e.target.value || null }))}
                                placeholder="Legenda da mídia (opcional — vazio usa a Mensagem como legenda)"
                                className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                            />
                        </div>
                    ) : (
                        <div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,video/*,audio/*,application/pdf"
                                onChange={handleFileUpload}
                                disabled={uploading}
                                className="block w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-primary file:text-primary-foreground hover:file:opacity-90 file:cursor-pointer"
                            />
                            {uploading && (
                                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Enviando para Cloudflare R2…
                                </p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-1">
                                Foto, vídeo, áudio ou PDF. Máx 50MB. Vai antes do texto na mensagem.
                            </p>
                        </div>
                    )}
                </div>

                {/* Enquete */}
                <div className="space-y-2 border-t pt-3">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-medium flex items-center gap-1.5">
                            <Vote className="h-3.5 w-3.5" /> Enquete (opcional)
                        </label>
                        {hasPoll ? (
                            <button onClick={clearPoll} className="text-[10px] text-red-600 hover:underline flex items-center gap-0.5">
                                <X className="h-3 w-3" /> Remover
                            </button>
                        ) : (
                            <button onClick={addPollOption} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                                <Plus className="h-3 w-3" /> Adicionar enquete
                            </button>
                        )}
                    </div>

                    {hasPoll && (
                        <div className="space-y-2">
                            <input
                                value={form.poll_question ?? ''}
                                onChange={e => setForm(f => ({ ...f, poll_question: e.target.value }))}
                                placeholder="Pergunta (ex.: Qual segmento da Bula faz mais sentido?)"
                                className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                            />
                            <div className="space-y-1.5">
                                {form.poll_options.map((opt, i) => (
                                    <div key={i} className="flex gap-1">
                                        <span className="text-xs text-muted-foreground w-5 text-right pt-1">{i + 1}.</span>
                                        <input
                                            value={opt}
                                            onChange={e => updatePollOption(i, e.target.value)}
                                            placeholder={`Opção ${i + 1}`}
                                            className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
                                        />
                                        <button
                                            onClick={() => removePollOption(i)}
                                            className="text-muted-foreground hover:text-red-600 p-1"
                                            title="Remover"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={addPollOption}
                                disabled={form.poll_options.length >= 12}
                                className="text-[10px] text-primary hover:underline disabled:opacity-40 flex items-center gap-0.5"
                            >
                                <Plus className="h-3 w-3" /> Adicionar opção
                                {form.poll_options.length >= 12 && ' (máx 12)'}
                            </button>
                            <div className="flex items-center gap-2">
                                <label className="text-[10px] text-muted-foreground">Múltipla escolha:</label>
                                <input
                                    type="checkbox"
                                    checked={form.poll_selectable_count > 1}
                                    onChange={e => setForm(f => ({
                                        ...f,
                                        poll_selectable_count: e.target.checked ? Math.max(2, f.poll_options.length) : 1,
                                    }))}
                                />
                                <span className="text-[10px] text-muted-foreground">
                                    {form.poll_selectable_count > 1 ? `pode escolher até ${form.poll_selectable_count}` : 'só uma resposta'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {feedback && (
                    <p
                        className={`text-xs flex items-center gap-1 ${
                            feedback.type === "ok"
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-600 dark:text-red-400"
                        }`}
                    >
                        {feedback.type === "ok"
                            ? <CheckCircle2 className="h-3 w-3" />
                            : <AlertCircle className="h-3 w-3" />}
                        {feedback.msg}
                    </p>
                )}

                <div className="flex gap-2 pt-2 border-t">
                    <button
                        onClick={handleSave}
                        disabled={saving || uploading}
                        className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {editing ? "Salvar alterações" : "Criar template"}
                    </button>
                    {editing && (
                        <button
                            onClick={startNew}
                            className="px-4 py-2 rounded-md text-sm border hover:bg-muted"
                            title="Novo (limpa o formulário)"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
