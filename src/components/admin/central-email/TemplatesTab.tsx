"use client"

import { useState } from "react"
import {
    Plus, Save, Trash2, AlertCircle, CheckCircle2, Loader2, Edit3, Eye, X,
} from "lucide-react"
import type { EmailTemplate } from "./types"
import { CATEGORIES } from "./types"

interface FormState {
    title: string
    category: string
    subject: string
    body_html: string
    body_text: string
}

const EMPTY_FORM: FormState = {
    title: "",
    category: "geral",
    subject: "",
    body_html: "",
    body_text: "",
}

interface Props {
    templates: EmailTemplate[]
    onChange: () => void
}

export function TemplatesTab({ templates, onChange }: Props) {
    const [editing, setEditing] = useState<EmailTemplate | null>(null)
    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [saving, setSaving] = useState(false)
    const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null)
    const [creating, setCreating] = useState(false)
    const [preview, setPreview] = useState<EmailTemplate | null>(null)

    function startNew() {
        setEditing(null)
        setForm(EMPTY_FORM)
        setCreating(true)
        setFeedback(null)
    }

    function startEdit(t: EmailTemplate) {
        setEditing(t)
        setCreating(true)
        setForm({
            title: t.title,
            category: t.category,
            subject: t.subject,
            body_html: t.body_html,
            body_text: t.body_text ?? "",
        })
        setFeedback(null)
    }

    function cancel() {
        setEditing(null)
        setForm(EMPTY_FORM)
        setCreating(false)
        setFeedback(null)
    }

    async function save() {
        if (!form.title.trim() || !form.subject.trim() || !form.body_html.trim()) {
            setFeedback({ type: "err", msg: "Título, assunto e corpo HTML são obrigatórios." })
            return
        }
        setSaving(true)
        try {
            const url = editing
                ? `/api/email/central/templates/${editing.id}`
                : `/api/email/central/templates`
            const method = editing ? "PUT" : "POST"
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: form.title,
                    category: form.category,
                    subject: form.subject,
                    body_html: form.body_html,
                    body_text: form.body_text || null,
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                setFeedback({ type: "err", msg: data.error ?? "Falha ao salvar" })
            } else {
                setFeedback({ type: "ok", msg: editing ? "Template atualizado" : "Template criado" })
                cancel()
                onChange()
            }
        } finally {
            setSaving(false)
        }
    }

    async function archive(id: string) {
        if (!confirm("Arquivar este template? Ele some da lista padrão mas continua referenciado nas campanhas antigas.")) return
        await fetch(`/api/email/central/templates/${id}`, { method: "DELETE" })
        onChange()
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                    Templates HTML reutilizáveis. Use <code className="text-xs bg-muted px-1 rounded">{"{nome}"}</code>,{" "}
                    <code className="text-xs bg-muted px-1 rounded">{"{email}"}</code> nos campos.
                    O link de descadastro é adicionado automaticamente no rodapé (use{" "}
                    <code className="text-xs bg-muted px-1 rounded">{"{{UNSUBSCRIBE_URL}}"}</code> pra controlar onde aparece).
                </p>
                <button
                    onClick={startNew}
                    className="text-sm flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 shrink-0"
                >
                    <Plus className="h-3.5 w-3.5" /> Novo template
                </button>
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

            {creating && (
                <div className="border rounded-xl p-4 space-y-3 bg-muted/30">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-sm">{editing ? `Editando: ${editing.title}` : "Novo template"}</h3>
                        <button onClick={cancel} className="text-xs text-muted-foreground hover:text-foreground">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium block mb-1">Título</label>
                            <input
                                value={form.title}
                                onChange={e => setForm({ ...form, title: e.target.value })}
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                                placeholder="ex: Boas-vindas pós-cadastro"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium block mb-1">Categoria</label>
                            <select
                                value={form.category}
                                onChange={e => setForm({ ...form, category: e.target.value })}
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                            >
                                {CATEGORIES.map(c => (
                                    <option key={c.id} value={c.id}>{c.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium block mb-1">Assunto</label>
                        <input
                            value={form.subject}
                            onChange={e => setForm({ ...form, subject: e.target.value })}
                            className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                            placeholder="Bem-vindo à Fórmula do Boi, {nome}"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium block mb-1">Corpo HTML</label>
                        <textarea
                            value={form.body_html}
                            onChange={e => setForm({ ...form, body_html: e.target.value })}
                            className="w-full px-3 py-2 text-sm border rounded-lg bg-background font-mono"
                            rows={14}
                            placeholder='<!doctype html>...'
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                            Suporta <code className="bg-muted px-1 rounded">{"{nome}"}</code>,{" "}
                            <code className="bg-muted px-1 rounded">{"{email}"}</code> e{" "}
                            <code className="bg-muted px-1 rounded">{"{{UNSUBSCRIBE_URL}}"}</code>.
                        </p>
                    </div>
                    <div>
                        <label className="text-xs font-medium block mb-1">
                            Texto plano (opcional — gerado do HTML se vazio)
                        </label>
                        <textarea
                            value={form.body_text}
                            onChange={e => setForm({ ...form, body_text: e.target.value })}
                            className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                            rows={4}
                        />
                    </div>
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
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Salvar
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {templates.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-full text-center py-8">
                        Nenhum template ainda. Clique em &quot;Novo template&quot; pra começar.
                    </p>
                )}
                {templates.map(t => (
                    <div key={t.id} className="border rounded-xl p-4 space-y-2 bg-background hover:border-primary/40 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <h4 className="font-semibold text-sm truncate">{t.title}</h4>
                                <p className="text-[11px] text-muted-foreground">{t.category} · {t.slug}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                                <button
                                    onClick={() => setPreview(t)}
                                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                                    title="Pré-visualizar"
                                >
                                    <Eye className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    onClick={() => startEdit(t)}
                                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                                    title="Editar"
                                >
                                    <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    onClick={() => archive(t.id)}
                                    className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                    title="Arquivar"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                            <span className="font-medium">Assunto:</span> {t.subject}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Atualizado {new Date(t.updated_at).toLocaleDateString("pt-BR")} · usado {t.usage_count}x
                        </p>
                    </div>
                ))}
            </div>

            {preview && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={() => setPreview(null)}
                >
                    <div
                        className="bg-background border rounded-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="px-4 py-3 border-b flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold text-sm">{preview.title}</h3>
                                <p className="text-xs text-muted-foreground">Assunto: {preview.subject}</p>
                            </div>
                            <button onClick={() => setPreview(null)} className="text-muted-foreground hover:text-foreground">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <iframe
                            srcDoc={preview.body_html}
                            sandbox=""
                            className="flex-1 w-full bg-white"
                            title="preview"
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
