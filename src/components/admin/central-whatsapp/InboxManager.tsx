"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
    CheckCircle2, AlertCircle, QrCode, RefreshCw, Plus, Trash2, Bot, BotOff,
    Loader2, Smartphone, Cloud, ChevronDown, ChevronRight,
} from "lucide-react"
import type { Inbox } from "./types"

const PROTECTED_IDS = new Set(["cloud", "joao"])

function statusPill(status: string | null | undefined): { label: string; cls: string } {
    switch (status) {
        case "connected": return { label: "Conectado", cls: "border-green-500/40 bg-green-500/10 text-green-400" }
        case "qr": return { label: "Aguardando QR", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400" }
        case "connecting": return { label: "Conectando…", cls: "border-sky-500/40 bg-sky-500/10 text-sky-400" }
        case "disconnected": return { label: "Desconectado", cls: "border-red-500/40 bg-red-500/10 text-red-400" }
        default: return { label: status || "—", cls: "border-muted bg-muted text-muted-foreground" }
    }
}

/** Card de QR/pareamento de uma sessão Baileys (poll de /status?session=id). */
function BaileysConnect({ inboxId }: { inboxId: string }) {
    const [status, setStatus] = useState<string>("connecting")
    const [qr, setQr] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch(`/api/whatsapp/status?session=${encodeURIComponent(inboxId)}`, { cache: "no-store" })
            const j = await res.json()
            setStatus(j.status ?? "disconnected")
            setQr(j.qr ?? null)
        } catch {
            setStatus("disconnected"); setQr(null)
        } finally {
            setLoading(false)
        }
    }, [inboxId])

    useEffect(() => {
        fetchStatus()
        const t = setInterval(fetchStatus, 5000)
        return () => clearInterval(t)
    }, [fetchStatus])

    return (
        <div className="px-4 py-5 flex flex-col items-center justify-center gap-3 border-t bg-muted/20">
            {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            {!loading && status === "connected" && (
                <div className="text-center space-y-1.5">
                    <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
                    <p className="text-sm font-semibold">Número conectado</p>
                </div>
            )}
            {!loading && status === "qr" && qr && (
                <div className="flex flex-col items-center gap-2">
                    <div className="bg-white p-3 rounded-xl border shadow-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qr} alt="QR" className="w-52 h-52 object-contain" />
                    </div>
                    <p className="text-xs text-muted-foreground text-center max-w-xs">
                        WhatsApp → Aparelhos conectados → Conectar um aparelho, e aponte para o QR.
                    </p>
                </div>
            )}
            {!loading && (status === "disconnected" || status === "connecting") && (
                <div className="text-center space-y-1.5">
                    <AlertCircle className="h-9 w-9 text-amber-500 mx-auto animate-pulse" />
                    <p className="text-sm font-semibold">{status === "connecting" ? "Conectando…" : "Desconectado"}</p>
                    <p className="text-xs text-muted-foreground">O QR aparece em alguns segundos.</p>
                </div>
            )}
        </div>
    )
}

export function InboxManager() {
    const [inboxes, setInboxes] = useState<Inbox[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)

    const [adding, setAdding] = useState(false)
    const [newLabel, setNewLabel] = useState("")
    const [newId, setNewId] = useState("")
    const [newPhone, setNewPhone] = useState("")
    const [creating, setCreating] = useState(false)
    const idTouched = useRef(false)

    const fetchInboxes = useCallback(async () => {
        try {
            const res = await fetch("/api/whatsapp/inboxes", { cache: "no-store" })
            const j = await res.json()
            if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
            setInboxes(j.inboxes ?? [])
            setError(null)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao carregar")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchInboxes()
        const t = setInterval(fetchInboxes, 15000)
        return () => clearInterval(t)
    }, [fetchInboxes])

    async function toggleAutomations(inbox: Inbox) {
        setBusy(inbox.id)
        try {
            await fetch("/api/whatsapp/inboxes", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: inbox.id, automations_enabled: !inbox.automations_enabled }),
            })
            await fetchInboxes()
        } finally {
            setBusy(null)
        }
    }

    async function removeInbox(inbox: Inbox) {
        if (!confirm(`Remover o inbox "${inbox.label}"? A sessão Baileys será encerrada e o pareamento apagado.`)) return
        setBusy(inbox.id)
        try {
            const res = await fetch(`/api/whatsapp/inboxes?id=${encodeURIComponent(inbox.id)}`, { method: "DELETE" })
            const j = await res.json().catch(() => ({}))
            if (!res.ok) { setError(j.error || "Falha ao remover"); return }
            if (expanded === inbox.id) setExpanded(null)
            await fetchInboxes()
        } finally {
            setBusy(null)
        }
    }

    // Slug automático a partir do nome, até o operador editar o ID manualmente.
    function onLabelChange(v: string) {
        setNewLabel(v)
        if (!idTouched.current) {
            setNewId(v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32))
        }
    }

    async function createInbox() {
        if (!newLabel.trim() || !newId.trim() || creating) return
        setCreating(true)
        setError(null)
        try {
            const res = await fetch("/api/whatsapp/inboxes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: newId.trim(), label: newLabel.trim(), phone: newPhone.trim() || undefined }),
            })
            const j = await res.json().catch(() => ({}))
            if (!res.ok) { setError(j.error || "Falha ao criar inbox"); return }
            setAdding(false)
            setNewLabel(""); setNewId(""); setNewPhone(""); idTouched.current = false
            await fetchInboxes()
            setExpanded(j.inbox?.id ?? null) // já abre pra escanear o QR
        } finally {
            setCreating(false)
        }
    }

    return (
        <div className="bg-card text-card-foreground rounded-xl border overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                    <QrCode className="h-4 w-4" /> Inboxes de atendimento
                </h3>
                <div className="flex items-center gap-2">
                    <button onClick={fetchInboxes} className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border hover:bg-muted">
                        <RefreshCw className="h-3 w-3" /> Atualizar
                    </button>
                    <button
                        onClick={() => setAdding(a => !a)}
                        className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                    >
                        <Plus className="h-3 w-3" /> Adicionar sessão
                    </button>
                </div>
            </div>

            {error && <div className="px-6 py-2 text-xs text-red-400 border-b bg-red-500/5">{error}</div>}

            {adding && (
                <div className="px-6 py-4 border-b bg-muted/20 space-y-3">
                    <p className="text-xs text-muted-foreground">
                        Nova sessão Baileys — um número extra pra atendimento manual. Após criar, escaneie o QR pelo aparelho.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input value={newLabel} onChange={e => onLabelChange(e.target.value)} placeholder="Nome (ex.: Comercial 2)"
                            className="px-3 py-1.5 text-sm rounded-md border bg-background" />
                        <input value={newId} onChange={e => { idTouched.current = true; setNewId(e.target.value.toLowerCase()) }} placeholder="id (slug, ex.: comercial-2)"
                            className="px-3 py-1.5 text-sm rounded-md border bg-background font-mono" />
                        <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Telefone (opcional)"
                            className="px-3 py-1.5 text-sm rounded-md border bg-background" />
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={createInbox} disabled={creating || !newLabel.trim() || !newId.trim()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar e gerar QR
                        </button>
                        <button onClick={() => setAdding(false)} className="px-3 py-1.5 rounded-md text-sm border hover:bg-muted">Cancelar</button>
                    </div>
                </div>
            )}

            {loading && inboxes.length === 0 ? (
                <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
                <ul className="divide-y">
                    {inboxes.map(inbox => {
                        const isBaileys = inbox.kind === "baileys"
                        const pill = statusPill(isBaileys ? (inbox.live_status ?? inbox.status) : "connected")
                        const isExpanded = expanded === inbox.id
                        const protectedInbox = PROTECTED_IDS.has(inbox.id)
                        return (
                            <li key={inbox.id}>
                                <div className="px-6 py-3.5 flex items-center gap-3">
                                    <div className="shrink-0">
                                        {isBaileys ? <Smartphone className="h-4 w-4 text-amber-500" /> : <Cloud className="h-4 w-4 text-emerald-500" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-sm">{inbox.label}</span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${pill.cls}`}>{pill.label}</span>
                                            {inbox.is_primary && <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-muted bg-muted text-muted-foreground">primário</span>}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                            {isBaileys ? "Baileys" : "API oficial"} · {inbox.id}{inbox.phone ? ` · ${inbox.phone}` : ""}
                                        </p>
                                    </div>

                                    {/* Toggle de automação (concierge/welcome) */}
                                    <button
                                        onClick={() => toggleAutomations(inbox)}
                                        disabled={busy === inbox.id}
                                        title={inbox.automations_enabled ? "Automação ligada (IA responde)" : "Manual (só humano responde)"}
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border transition-colors disabled:opacity-50 ${
                                            inbox.automations_enabled
                                                ? "border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
                                                : "border-muted text-muted-foreground hover:bg-muted"
                                        }`}
                                    >
                                        {inbox.automations_enabled ? <Bot className="h-3.5 w-3.5" /> : <BotOff className="h-3.5 w-3.5" />}
                                        {inbox.automations_enabled ? "IA" : "Manual"}
                                    </button>

                                    {isBaileys && (
                                        <button onClick={() => setExpanded(isExpanded ? null : inbox.id)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs border hover:bg-muted">
                                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} QR
                                        </button>
                                    )}
                                    {isBaileys && !protectedInbox && (
                                        <button onClick={() => removeInbox(inbox)} disabled={busy === inbox.id}
                                            title="Remover sessão"
                                            className="inline-flex items-center px-2 py-1.5 rounded-md text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                                {isBaileys && isExpanded && <BaileysConnect inboxId={inbox.id} />}
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}
