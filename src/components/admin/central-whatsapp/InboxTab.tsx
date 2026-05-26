"use client"

import { useEffect, useMemo, useState } from "react"
import {
    Search, MessageSquare, User, Send, AlertCircle, CheckCircle2, Clock,
    UserPlus, BellOff, Bell, Hand, Sparkles, Tag, Loader2, GraduationCap,
} from "lucide-react"
import {
    INTERESSE_LABELS,
    type InboxConversation,
    type ThreadLead,
    type ThreadMessage,
    type Template,
} from "./types"
import { ACADEMIA_TAG } from "@/lib/whatsapp-central"

type Filter = "todos" | "aguardando" | "handoff" | "optout" | "interesse"

const FILTERS: { id: Filter; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "aguardando", label: "Aguardando resposta" },
    { id: "handoff", label: "Em atendimento humano" },
    { id: "interesse", label: "Com interesse" },
    { id: "optout", label: "Opt-out" },
]

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return "agora"
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
}

function formatPhone(phone: string) {
    const d = phone.replace(/\D/g, "")
    if (d.length === 13 && d.startsWith("55")) return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`
    if (d.length === 12 && d.startsWith("55")) return `+55 ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`
    return phone
}

export function InboxTab({ templates }: { templates: Template[] }) {
    const [filter, setFilter] = useState<Filter>("todos")
    const [search, setSearch] = useState("")
    const [conversations, setConversations] = useState<InboxConversation[]>([])
    const [loadingList, setLoadingList] = useState(true)
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null)

    const [thread, setThread] = useState<ThreadMessage[]>([])
    const [threadLead, setThreadLead] = useState<ThreadLead | null>(null)
    const [loadingThread, setLoadingThread] = useState(false)

    const [composer, setComposer] = useState("")
    const [sending, setSending] = useState(false)
    const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null)

    async function fetchInbox() {
        setLoadingList(true)
        try {
            const params = new URLSearchParams()
            if (filter !== "todos") params.set("filter", filter)
            if (search.trim()) params.set("q", search.trim())
            const res = await fetch(`/api/whatsapp/central/inbox?${params}`)
            const data = await res.json()
            setConversations(data.conversations ?? [])
        } catch {
            setConversations([])
        } finally {
            setLoadingList(false)
        }
    }

    async function fetchThread(phone: string) {
        setLoadingThread(true)
        try {
            const res = await fetch(`/api/whatsapp/central/thread/${encodeURIComponent(phone)}`)
            const data = await res.json()
            setThread(data.messages ?? [])
            setThreadLead(data.lead ?? null)
        } catch {
            setThread([])
            setThreadLead(null)
        } finally {
            setLoadingThread(false)
        }
    }

    useEffect(() => { fetchInbox() }, [filter])
    useEffect(() => {
        const t = setTimeout(fetchInbox, 300)
        return () => clearTimeout(t)
    }, [search])
    useEffect(() => {
        const i = setInterval(fetchInbox, 30000)
        return () => clearInterval(i)
    }, [filter, search])
    useEffect(() => {
        if (selectedPhone) fetchThread(selectedPhone)
    }, [selectedPhone])

    const selected = useMemo(
        () => conversations.find(c => c.phone === selectedPhone) ?? null,
        [conversations, selectedPhone]
    )

    async function handleAction(action: string, extra?: Record<string, unknown>) {
        if (!selectedPhone) return
        try {
            const res = await fetch(`/api/whatsapp/central/lead-action`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone: selectedPhone, action, ...extra }),
            })
            if (!res.ok) {
                const j = await res.json().catch(() => ({}))
                setFeedback({ type: "err", msg: j.error ?? "Falha na ação" })
                return
            }
            setFeedback({ type: "ok", msg: "Atualizado." })
            await Promise.all([fetchInbox(), fetchThread(selectedPhone)])
        } catch (e: unknown) {
            setFeedback({ type: "err", msg: e instanceof Error ? e.message : "Erro inesperado" })
        }
    }

    async function handleSend() {
        if (!selectedPhone || !composer.trim() || sending) return
        setSending(true)
        setFeedback(null)
        try {
            const res = await fetch(`/api/whatsapp/central/thread/${encodeURIComponent(selectedPhone)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: composer.trim() }),
            })
            const data = await res.json()
            if (!res.ok) {
                setFeedback({ type: "err", msg: data.error ?? "Falha ao enviar" })
            } else {
                setComposer("")
                setFeedback({ type: "ok", msg: "Mensagem enfileirada." })
                fetchThread(selectedPhone)
            }
        } catch (e: unknown) {
            setFeedback({ type: "err", msg: e instanceof Error ? e.message : "Erro inesperado" })
        } finally {
            setSending(false)
        }
    }

    function applyTemplate(tplId: string) {
        const tpl = templates.find(t => t.id === tplId)
        if (!tpl) return
        const firstName = (selected?.lead_nome || selected?.name || "").split(/\s+/)[0]
        const rendered = tpl.body.replace(/\{nome\}/g, firstName).replace(/\{name\}/g, firstName)
        setComposer(rendered)
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr_300px] gap-3 h-[calc(100vh-220px)] min-h-[520px]">
            {/* ───── Lista de conversas ───── */}
            <div className="flex flex-col bg-card text-card-foreground border rounded-xl overflow-hidden">
                <div className="px-3 py-3 border-b space-y-2.5">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar nome ou telefone…"
                            className="w-full pl-8 pr-2 py-1.5 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {FILTERS.map(f => (
                            <button
                                key={f.id}
                                onClick={() => setFilter(f.id)}
                                className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                                    filter === f.id
                                        ? "bg-primary text-primary-foreground border-transparent"
                                        : "text-muted-foreground hover:bg-muted"
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y">
                    {loadingList && (
                        <div className="p-4 flex justify-center">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                    )}
                    {!loadingList && conversations.length === 0 && (
                        <div className="p-6 text-center text-xs text-muted-foreground">
                            Nenhuma conversa neste filtro.
                        </div>
                    )}
                    {conversations.map(c => {
                        const active = c.phone === selectedPhone
                        return (
                            <button
                                key={c.phone}
                                onClick={() => setSelectedPhone(c.phone)}
                                className={`w-full text-left px-3 py-2.5 flex gap-3 items-start transition-colors ${
                                    active ? "bg-primary/5 dark:bg-primary/10" : "hover:bg-muted/40"
                                }`}
                            >
                                <div className="bg-muted rounded-full h-9 w-9 flex items-center justify-center flex-shrink-0">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-medium text-sm truncate">
                                            {c.lead_nome || c.name || formatPhone(c.phone)}
                                        </p>
                                        <span className="text-[10px] text-muted-foreground flex-shrink-0 tabular-nums">
                                            {timeAgo(c.last_at)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                                        {c.last_direction === "inbound" ? "↩ " : "→ "}
                                        {c.last_message ?? "—"}
                                    </p>
                                    <div className="flex items-center gap-1 mt-1.5">
                                        {c.inbound_pending > 0 && !c.handoff_humano && !c.optout_whatsapp && (
                                            <span className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
                                                aguardando
                                            </span>
                                        )}
                                        {c.handoff_humano && (
                                            <span className="text-[10px] bg-blue-500/15 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                                                humano
                                            </span>
                                        )}
                                        {c.optout_whatsapp && (
                                            <span className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">
                                                opt-out
                                            </span>
                                        )}
                                        {c.interesse_principal && (
                                            <span className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded">
                                                {INTERESSE_LABELS[c.interesse_principal] ?? c.interesse_principal}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* ───── Thread ───── */}
            <div className="flex flex-col bg-card text-card-foreground border rounded-xl overflow-hidden">
                {!selectedPhone ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-10 gap-3 text-muted-foreground">
                        <MessageSquare className="h-10 w-10 opacity-40" />
                        <p className="text-sm">Selecione uma conversa para ver o histórico.</p>
                    </div>
                ) : (
                    <>
                        <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <h4 className="font-semibold truncate">
                                    {threadLead?.nome || selected?.name || formatPhone(selectedPhone)}
                                </h4>
                                <p className="text-xs text-muted-foreground font-mono">
                                    {formatPhone(selectedPhone)}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {threadLead?.id && (
                                    <a
                                        href={`/crm?lead=${threadLead.id}`}
                                        className="text-xs flex items-center gap-1 text-primary hover:underline"
                                    >
                                        <UserPlus className="h-3.5 w-3.5" />
                                        Abrir no CRM
                                    </a>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-muted/20">
                            {loadingThread && (
                                <div className="flex justify-center py-6">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                            )}
                            {!loadingThread && thread.length === 0 && (
                                <p className="text-center text-xs text-muted-foreground py-10">
                                    Sem mensagens registradas com este número.
                                </p>
                            )}
                            {thread.map(m => {
                                const inbound = m.direction === "inbound"
                                return (
                                    <div
                                        key={m.id}
                                        className={`flex ${inbound ? "justify-start" : "justify-end"}`}
                                    >
                                        <div
                                            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                                                inbound
                                                    ? "bg-background border"
                                                    : "bg-primary text-primary-foreground"
                                            }`}
                                        >
                                            {m.body ? (
                                                m.body
                                            ) : m.direction === "outbound" && m.bot_step === "welcome" ? (
                                                <span className="opacity-70 italic">
                                                    Welcome enviado — template renderizado pelo bot (ver na aba Templates).
                                                </span>
                                            ) : (
                                                <span className="opacity-60 italic">[sem texto]</span>
                                            )}
                                            <div
                                                className={`text-[10px] mt-1 flex items-center gap-1 ${
                                                    inbound ? "text-muted-foreground" : "opacity-80"
                                                }`}
                                            >
                                                {!inbound && m.status === "failed" && (
                                                    <AlertCircle className="h-3 w-3" />
                                                )}
                                                {!inbound && m.status === "sent" && (
                                                    <CheckCircle2 className="h-3 w-3" />
                                                )}
                                                <span>{timeAgo(m.created_at)} atrás</span>
                                                {m.bot_step && (
                                                    <span className="bg-white/10 px-1 rounded">bot: {m.bot_step}</span>
                                                )}
                                                {m.origin === "campaign" && (
                                                    <span className="bg-white/10 px-1 rounded">campanha</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="border-t p-3 space-y-2">
                            {feedback && (
                                <p
                                    className={`text-xs flex items-center gap-1 ${
                                        feedback.type === "ok"
                                            ? "text-green-600 dark:text-green-400"
                                            : "text-red-600 dark:text-red-400"
                                    }`}
                                >
                                    {feedback.type === "ok" ? (
                                        <CheckCircle2 className="h-3 w-3" />
                                    ) : (
                                        <AlertCircle className="h-3 w-3" />
                                    )}
                                    {feedback.msg}
                                </p>
                            )}
                            <div className="flex items-center gap-2">
                                <select
                                    onChange={e => {
                                        if (e.target.value) {
                                            applyTemplate(e.target.value)
                                            e.target.value = ""
                                        }
                                    }}
                                    className="text-xs px-2 py-1.5 rounded-md border bg-background"
                                    defaultValue=""
                                >
                                    <option value="">Inserir template…</option>
                                    {templates.map(t => (
                                        <option key={t.id} value={t.id}>
                                            [{t.category}] {t.title}
                                        </option>
                                    ))}
                                </select>
                                <span className="text-[10px] text-muted-foreground">
                                    {`Variáveis: {nome}`}
                                </span>
                            </div>
                            <div className="flex gap-2 items-end">
                                <textarea
                                    value={composer}
                                    onChange={e => setComposer(e.target.value)}
                                    rows={2}
                                    placeholder={threadLead?.optout_whatsapp ? "Lead em opt-out — envio bloqueado." : "Digite uma mensagem…"}
                                    disabled={!!threadLead?.optout_whatsapp}
                                    className="flex-1 rounded-md border bg-background px-3 py-2 text-sm resize-y disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!composer.trim() || sending || !!threadLead?.optout_whatsapp}
                                    className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    Enviar
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ───── Painel lateral do lead ───── */}
            <div className="bg-card text-card-foreground border rounded-xl overflow-hidden flex flex-col">
                {!selectedPhone ? (
                    <div className="p-6 text-xs text-muted-foreground">
                        Selecione uma conversa para ver os detalhes do lead.
                    </div>
                ) : !threadLead ? (
                    <div className="p-6 text-xs text-muted-foreground">
                        Sem lead vinculado a este número ainda.
                    </div>
                ) : (
                    <div className="overflow-y-auto p-4 space-y-4 text-sm">
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Lead</p>
                            <p className="font-semibold">{threadLead.nome}</p>
                            <p className="text-xs text-muted-foreground">
                                {threadLead.email || "sem email"}
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</p>
                            <span className="inline-block text-xs bg-muted px-2 py-0.5 rounded-full">
                                {threadLead.status ?? "—"}
                            </span>
                            {threadLead.interesse_principal && (
                                <div className="flex items-center gap-1 text-xs">
                                    <Tag className="h-3 w-3" />
                                    Interesse: <strong>{INTERESSE_LABELS[threadLead.interesse_principal] ?? threadLead.interesse_principal}</strong>
                                </div>
                            )}
                        </div>

                        <div className="space-y-1.5 border-t pt-3">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Atribuição</p>
                            <p className="text-xs"><strong>Origem:</strong> {threadLead.source ?? "—"}</p>
                            <p className="text-xs"><strong>Mídia:</strong> {threadLead.medium ?? "—"}</p>
                            <p className="text-xs"><strong>Campanha:</strong> {threadLead.campaign ?? "—"}</p>
                        </div>

                        <div className="border-t pt-3 space-y-2">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ações rápidas</p>

                            {threadLead.handoff_humano ? (
                                <button
                                    onClick={() => handleAction("handoff_off")}
                                    className="w-full text-xs flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-muted"
                                >
                                    <Sparkles className="h-3.5 w-3.5" /> Devolver atendimento ao bot
                                </button>
                            ) : (
                                <button
                                    onClick={() => handleAction("handoff_on")}
                                    className="w-full text-xs flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-muted"
                                >
                                    <Hand className="h-3.5 w-3.5" /> Assumir atendimento (pausa o bot)
                                </button>
                            )}

                            {threadLead.optout_whatsapp ? (
                                <button
                                    onClick={() => handleAction("optout_off")}
                                    className="w-full text-xs flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-muted"
                                >
                                    <Bell className="h-3.5 w-3.5" /> Reativar envios
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        if (confirm("Confirmar opt-out manual deste lead?")) handleAction("optout_on")
                                    }}
                                    className="w-full text-xs flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600"
                                >
                                    <BellOff className="h-3.5 w-3.5" /> Marcar opt-out
                                </button>
                            )}

                            {/* Audience: Academia do Nelore P.O — controla qual mapeamento
                                numérico (1..6 institucional vs 1..7 padrão) o engine usa
                                quando o lead responder. */}
                            {(threadLead.tags_whatsapp ?? []).includes(ACADEMIA_TAG) ? (
                                <button
                                    onClick={() => handleAction("remove_audience_tag", { tag: ACADEMIA_TAG })}
                                    className="w-full text-xs flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-muted"
                                    title="Remove a tag grupo_academia_nelore_po do lead"
                                >
                                    <GraduationCap className="h-3.5 w-3.5" /> Remover da Academia P.O
                                </button>
                            ) : (
                                <button
                                    onClick={() => handleAction("apply_audience_tag", { tag: ACADEMIA_TAG })}
                                    className="w-full text-xs flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-muted"
                                    title="Marca o lead como participante da Academia do Nelore P.O — passa a usar o menu institucional 1..6 e os templates -academia"
                                >
                                    <GraduationCap className="h-3.5 w-3.5" /> Marcar como Academia P.O
                                </button>
                            )}

                            <div className="flex gap-1.5 items-center">
                                <select
                                    onChange={e => {
                                        if (e.target.value) {
                                            handleAction("set_interesse", { interesse: e.target.value })
                                            e.target.value = ""
                                        }
                                    }}
                                    defaultValue=""
                                    className="flex-1 text-xs px-2 py-1.5 rounded-md border bg-background"
                                >
                                    <option value="">Definir interesse…</option>
                                    {Object.entries(INTERESSE_LABELS).filter(([k]) => k !== "consultor" && k !== "outro").map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {threadLead.last_whatsapp_at && (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1 border-t pt-3">
                                <Clock className="h-3 w-3" />
                                Última interação WhatsApp: {timeAgo(threadLead.last_whatsapp_at)} atrás
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
