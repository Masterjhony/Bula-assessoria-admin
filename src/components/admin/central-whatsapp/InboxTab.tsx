"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import {
    Search, MessageSquare, Send, AlertCircle, CheckCircle2, Clock,
    UserPlus, BellOff, Bell, Hand, Sparkles, Tag, Loader2, GraduationCap,
    Lock, ShieldCheck, Smartphone, FileText, Download, MessageCircle,
    ExternalLink, Activity, Info, ChevronDown,
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

// Placeholders de texto que o webhook grava para mídia — quando há player/preview
// renderizado, escondemos esse texto redundante.
const MEDIA_PLACEHOLDERS = new Set(["[áudio]", "[imagem]", "[vídeo]", "[documento]"])

/** Renderiza a mídia recebida no balão: player de áudio/vídeo, imagem ou link. */
function MediaContent({
    url, type, mime, filename,
}: {
    url: string
    type: "audio" | "image" | "video" | "document"
    mime: string | null
    filename: string | null
}) {
    if (type === "audio") {
        return (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio controls preload="none" className="max-w-full my-1" src={url}>
                <source src={url} type={mime || undefined} />
            </audio>
        )
    }
    if (type === "image") {
        return (
            <a href={url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={filename || "imagem"} className="rounded-md max-h-64 my-1 object-contain" />
            </a>
        )
    }
    if (type === "video") {
        return (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video controls preload="none" className="rounded-md max-h-64 max-w-full my-1" src={url} />
        )
    }
    // documento
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download={filename || undefined}
            className="inline-flex items-center gap-2 my-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted"
        >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate max-w-[180px]">{filename || "documento"}</span>
            <Download className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </a>
    )
}

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

/** Tempo restante até a janela de 24h fechar, em formato curto (ex: "3h 12min"). */
function windowRemaining(expires: string) {
    const diff = new Date(expires).getTime() - Date.now()
    if (diff <= 0) return "instantes"
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor((diff % 3_600_000) / 60000)
    if (h > 0) return `${h}h${m > 0 ? ` ${m}min` : ""}`
    return `${m}min`
}

/** HH:MM curto para o balão de mensagem. */
function clockTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

/** Data/hora completa para o painel de informações. */
function fullDateTime(dateStr: string) {
    return new Date(dateStr).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    })
}

/** Rótulo do separador de dia no histórico (ex: "Hoje • 21/06/2025"). */
function dayLabel(dateStr: string) {
    const d = new Date(dateStr)
    const now = new Date()
    const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000)
    const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    if (diffDays === 0) return `Hoje • ${date}`
    if (diffDays === 1) return `Ontem • ${date}`
    return date
}

/** Paleta determinística para avatares (cor estável por contato). */
const AVATAR_GRADIENTS = [
    "from-rose-400 to-pink-500",
    "from-amber-400 to-orange-500",
    "from-emerald-400 to-teal-500",
    "from-sky-400 to-blue-500",
    "from-violet-400 to-purple-500",
    "from-fuchsia-400 to-pink-500",
    "from-lime-400 to-green-500",
    "from-cyan-400 to-sky-500",
]

function hashString(s: string) {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    return Math.abs(h)
}

/** Iniciais limpas (ignora emojis/símbolos que vêm coladas no nome da planilha). */
function initials(name: string) {
    const clean = (name || "").replace(/[^\p{L}\s]/gu, "").trim()
    const parts = clean.split(/\s+/).filter(Boolean)
    if (!parts.length) return "?"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Avatar({
    name, seed, size = 38, online = false,
}: { name: string; seed: string; size?: number; online?: boolean }) {
    const grad = AVATAR_GRADIENTS[hashString(seed) % AVATAR_GRADIENTS.length]
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <div
                className={`h-full w-full rounded-full bg-gradient-to-br ${grad} text-white font-semibold flex items-center justify-center select-none`}
                style={{ fontSize: size * 0.36 }}
            >
                {initials(name)}
            </div>
            {online && (
                <span className="absolute -bottom-0 -right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
            )}
        </div>
    )
}

/** Status visual derivado da conversa, para o badge na lista. */
function convStatus(c: InboxConversation): { label: string; cls: string } {
    if (c.optout_whatsapp) return { label: "Opt-out", cls: "bg-red-500/10 text-red-600 dark:text-red-400" }
    if (c.handoff_humano) return { label: "Em atendimento", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" }
    if (c.inbound_pending > 0) return { label: "Aguardando", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" }
    return { label: "Finalizada", cls: "bg-muted text-muted-foreground" }
}

export function InboxTab({ templates, channel = "oficial" }: { templates: Template[]; channel?: "oficial" | "baileys" }) {
    // No canal Baileys não existe janela de 24h nem template: texto livre sempre.
    const officialMode = channel === "oficial"
    const [filter, setFilter] = useState<Filter>("todos")
    const [search, setSearch] = useState("")
    const [conversations, setConversations] = useState<InboxConversation[]>([])
    const [loadingList, setLoadingList] = useState(true)
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null)

    const [thread, setThread] = useState<ThreadMessage[]>([])
    const [threadLead, setThreadLead] = useState<ThreadLead | null>(null)
    const [loadingThread, setLoadingThread] = useState(false)
    // Janela de conversação de 24h (regra da API oficial): dentro dela o SDR
    // responde texto livre; fora, só template aprovado reabre a conversa.
    const [sessionOpen, setSessionOpen] = useState(false)
    const [windowExpiresAt, setWindowExpiresAt] = useState<string | null>(null)

    const [composer, setComposer] = useState("")
    const [sending, setSending] = useState(false)
    const [sendingTemplate, setSendingTemplate] = useState(false)
    const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null)

    // Aba do painel lateral do lead (apenas apresentação — não afeta automações).
    const [leadTab, setLeadTab] = useState<"detalhes" | "atividades" | "historico">("detalhes")

    // Só templates aprovados pela Meta podem ser disparados como template oficial.
    const approvedTemplates = useMemo(() => templates.filter(t => t.meta_status === "APPROVED"), [templates])

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
            setSessionOpen(!!data.session_open)
            setWindowExpiresAt(data.window_expires_at ?? null)
        } catch {
            setThread([])
            setThreadLead(null)
            setSessionOpen(false)
            setWindowExpiresAt(null)
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
        // Ao trocar de conversa, recarrega a thread e volta para a aba Detalhes.
        setLeadTab("detalhes")
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
                body: JSON.stringify({ message: composer.trim(), channel }),
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

    // Dispara um template APROVADO como mensagem de template oficial — o único
    // caminho válido para reabrir uma conversa fora da janela de 24h.
    async function handleSendTemplate(tplId: string) {
        if (!selectedPhone || sendingTemplate) return
        setSendingTemplate(true)
        setFeedback(null)
        try {
            const res = await fetch(`/api/whatsapp/central/thread/${encodeURIComponent(selectedPhone)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ template_id: tplId, channel }),
            })
            const data = await res.json()
            if (!res.ok) {
                setFeedback({ type: "err", msg: data.error ?? "Falha ao enviar template" })
            } else {
                setFeedback({ type: "ok", msg: "Template enviado pela API oficial." })
                fetchThread(selectedPhone)
            }
        } catch (e: unknown) {
            setFeedback({ type: "err", msg: e instanceof Error ? e.message : "Erro inesperado" })
        } finally {
            setSendingTemplate(false)
        }
    }

    function applyTemplate(tplId: string) {
        const tpl = templates.find(t => t.id === tplId)
        if (!tpl) return
        const firstName = (selected?.lead_nome || selected?.name || "").split(/\s+/)[0]
        const rendered = tpl.body.replace(/\{nome\}/g, firstName).replace(/\{name\}/g, firstName)
        setComposer(rendered)
    }

    // Cabeçalho da thread — dados derivados do lead/conversa selecionados.
    const headerName = threadLead?.nome || selected?.name || (selectedPhone ? formatPhone(selectedPhone) : "")
    const isNovoLead = (threadLead?.contact_count ?? 0) <= 1
    // Resumo para a aba "Histórico" do painel (datas reais do thread carregado).
    const firstMsgAt = thread.length ? thread[0].created_at : threadLead?.last_whatsapp_at ?? null
    const lastMsgAt = thread.length ? thread[thread.length - 1].created_at : threadLead?.last_whatsapp_at ?? null

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr_320px] gap-3 h-[calc(100vh-220px)] min-h-[520px]">
            {/* ───── Lista de conversas ───── */}
            <div className="flex flex-col bg-card text-card-foreground border rounded-xl overflow-hidden">
                <div className="px-3 py-3 border-b space-y-2.5">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar nome ou telefone…"
                            className="w-full pl-8 pr-2 py-1.5 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        />
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {FILTERS.map(f => (
                            <button
                                key={f.id}
                                onClick={() => setFilter(f.id)}
                                className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                                    filter === f.id
                                        ? "bg-emerald-600 text-white border-transparent"
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
                        const st = convStatus(c)
                        const display = c.lead_nome || c.name || formatPhone(c.phone)
                        const unread = !c.handoff_humano && !c.optout_whatsapp ? c.inbound_pending : 0
                        return (
                            <button
                                key={c.phone}
                                onClick={() => setSelectedPhone(c.phone)}
                                className={`relative w-full text-left px-3 py-2.5 flex gap-3 items-start transition-colors ${
                                    active ? "bg-emerald-500/5 dark:bg-emerald-500/10" : "hover:bg-muted/40"
                                }`}
                            >
                                {active && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-500" />}
                                <Avatar name={display} seed={c.phone} size={40} online={c.handoff_humano} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-medium text-sm truncate">{display}</p>
                                        <span className="text-[10px] text-muted-foreground flex-shrink-0 tabular-nums">
                                            {timeAgo(c.last_at)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                                        {c.last_direction === "inbound" ? "↩ " : "→ "}
                                        {c.last_message ?? "—"}
                                    </p>
                                    <div className="flex items-center justify-between gap-1 mt-1.5">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${st.cls}`}>
                                            {st.label}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            {c.interesse_principal && (
                                                <span className="text-[10px] bg-sky-500/15 text-sky-600 dark:text-sky-400 px-1.5 py-0.5 rounded-full">
                                                    {INTERESSE_LABELS[c.interesse_principal] ?? c.interesse_principal}
                                                </span>
                                            )}
                                            {unread > 0 && (
                                                <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-semibold tabular-nums">
                                                    {unread}
                                                </span>
                                            )}
                                        </div>
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
                            <div className="flex items-center gap-3 min-w-0">
                                <Avatar name={headerName} seed={selectedPhone} size={40} online={!!threadLead?.handoff_humano} />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <MessageCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                        <h4 className="font-semibold truncate">{headerName}</h4>
                                        {isNovoLead && (
                                            <span className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                                                Novo lead
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground font-mono">
                                        {formatPhone(selectedPhone)}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {threadLead?.id && (
                                    <a
                                        href={`/crm?lead=${threadLead.id}`}
                                        className="text-xs flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 hover:bg-muted transition-colors"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5" />
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
                            {(() => {
                                let lastDay = ""
                                return thread.map(m => {
                                    const inbound = m.direction === "inbound"
                                    const day = new Date(m.created_at).toDateString()
                                    const showSep = day !== lastDay
                                    lastDay = day
                                    return (
                                        <Fragment key={m.id}>
                                            {showSep && (
                                                <div className="flex justify-center my-2">
                                                    <span className="text-[10px] text-muted-foreground bg-card border rounded-full px-2.5 py-0.5">
                                                        {dayLabel(m.created_at)}
                                                    </span>
                                                </div>
                                            )}
                                            <div className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
                                                <div
                                                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap shadow-sm ${
                                                        inbound
                                                            ? "bg-background border rounded-bl-md"
                                                            : "bg-emerald-600 text-white rounded-br-md"
                                                    }`}
                                                >
                                                    {m.media_url && m.media_type && (
                                                        <MediaContent
                                                            url={m.media_url}
                                                            type={m.media_type}
                                                            mime={m.media_mime}
                                                            filename={m.media_filename}
                                                        />
                                                    )}
                                                    {!m.media_url && m.media_type && (
                                                        <div className="my-1 inline-flex max-w-full items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200">
                                                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                            <span>
                                                                {m.media_type === "audio" ? "Áudio recebido, mas o arquivo ainda não foi recuperado." : "Mídia recebida, mas o arquivo ainda não foi recuperado."}
                                                                {m.media_ingest_error ? ` (${m.media_ingest_error})` : ""}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {m.body && !((m.media_url || m.media_type) && MEDIA_PLACEHOLDERS.has(m.body)) ? (
                                                        m.body
                                                    ) : (m.media_url || m.media_type) ? null : m.direction === "outbound" && m.bot_step === "welcome" ? (
                                                        <span className="opacity-80 italic">
                                                            Welcome enviado — template renderizado pelo bot (ver na aba Templates).
                                                        </span>
                                                    ) : (
                                                        <span className="opacity-60 italic">[sem texto]</span>
                                                    )}
                                                    <div
                                                        className={`text-[10px] mt-1 flex items-center gap-1 ${
                                                            inbound ? "text-muted-foreground" : "text-white/80"
                                                        }`}
                                                    >
                                                        <span className="tabular-nums">{clockTime(m.created_at)}</span>
                                                        {!inbound && m.status === "failed" && (
                                                            <AlertCircle className="h-3 w-3" />
                                                        )}
                                                        {!inbound && m.status === "sent" && (
                                                            <CheckCircle2 className="h-3 w-3" />
                                                        )}
                                                        {m.bot_step && (
                                                            <span className={`px-1 rounded ${inbound ? "bg-muted" : "bg-white/15"}`}>bot: {m.bot_step}</span>
                                                        )}
                                                        {m.origin === "campaign" && (
                                                            <span className={`px-1 rounded ${inbound ? "bg-muted" : "bg-white/15"}`}>campanha</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </Fragment>
                                    )
                                })
                            })()}
                            {!loadingThread && thread.length > 0 && threadLead?.handoff_humano && (
                                <div className="flex justify-center pt-1">
                                    <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                                        <Hand className="h-3 w-3" />
                                        Atribuído a: {threadLead.handoff_responsavel || "atendimento humano"}
                                    </span>
                                </div>
                            )}
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

                            {/* Status do canal/janela — diz ao SDR o que ele pode enviar agora */}
                            {threadLead?.optout_whatsapp ? (
                                <div className="flex items-center gap-2 text-xs rounded-md px-2.5 py-2 bg-red-500/10 text-red-600 dark:text-red-400">
                                    <BellOff className="h-3.5 w-3.5 flex-shrink-0" />
                                    Lead em opt-out — envios bloqueados.
                                </div>
                            ) : !officialMode ? (
                                <div className="flex items-center gap-2 text-xs rounded-md px-2.5 py-2 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                    <Smartphone className="h-3.5 w-3.5 flex-shrink-0" />
                                    <span>Canal <strong>Baileys</strong> — texto livre liberado (sem a trava de 24h da Meta).</span>
                                </div>
                            ) : sessionOpen ? (
                                <div className="flex items-center gap-2 text-xs rounded-md px-2.5 py-2 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                                    <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
                                    <span>
                                        Janela aberta — responda à vontade pela <strong>API oficial</strong>.
                                        {windowExpiresAt && <> Fecha em {windowRemaining(windowExpiresAt)}.</>}
                                    </span>
                                </div>
                            ) : (
                                <div className="flex items-start gap-2 text-xs rounded-md px-2.5 py-2 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                    <Lock className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                                    <span>Passaram-se mais de 24h desde a última resposta. Para reabrir a conversa, envie um <strong>template aprovado</strong> abaixo.</span>
                                </div>
                            )}

                            {/* Texto livre: sempre no Baileys; na API oficial só dentro da janela de 24h */}
                            {!threadLead?.optout_whatsapp && (officialMode ? sessionOpen : true) && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
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
                                            <option value="">Respostas rápidas — inserir template…</option>
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
                                            placeholder="Digite uma mensagem…"
                                            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                                        />
                                        <button
                                            onClick={handleSend}
                                            disabled={!composer.trim() || sending}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                                        >
                                            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                            Enviar
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* API oficial fora da janela: só um template aprovado reabre a conversa */}
                            {!threadLead?.optout_whatsapp && officialMode && !sessionOpen && (
                                <div className="space-y-1.5">
                                    {approvedTemplates.length === 0 ? (
                                        <p className="text-[11px] text-muted-foreground">
                                            Nenhum template aprovado disponível. Crie e submeta um na aba <strong>Templates</strong> — a aprovação da Meta leva de minutos a algumas horas.
                                        </p>
                                    ) : (
                                        <>
                                            <select
                                                value=""
                                                disabled={sendingTemplate}
                                                onChange={e => {
                                                    if (e.target.value) {
                                                        handleSendTemplate(e.target.value)
                                                        e.target.value = ""
                                                    }
                                                }}
                                                className="w-full text-sm px-2 py-2 rounded-md border bg-background disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                                            >
                                                <option value="">
                                                    {sendingTemplate ? "Enviando template…" : "Escolher template aprovado para reabrir…"}
                                                </option>
                                                {approvedTemplates.map(t => (
                                                    <option key={t.id} value={t.id}>
                                                        {t.title}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                {sendingTemplate && <Loader2 className="h-3 w-3 animate-spin" />}
                                                Enviado oficialmente pela Meta. Quando o cliente responder, a janela reabre e você volta a digitar livremente.
                                            </p>
                                        </>
                                    )}
                                </div>
                            )}
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
                    <>
                        {/* Cabeçalho do lead */}
                        <div className="px-4 pt-4 pb-3 border-b">
                            <div className="flex items-start gap-3">
                                <Avatar name={threadLead.nome} seed={selectedPhone} size={44} online={!!threadLead.handoff_humano} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Lead</p>
                                    <p className="font-semibold leading-tight truncate">{threadLead.nome}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {threadLead.email || "Sem email cadastrado"}
                                    </p>
                                </div>
                                <span className="inline-flex items-center gap-1 text-[11px] bg-muted px-2 py-1 rounded-full shrink-0">
                                    {threadLead.status ?? "—"}
                                    <ChevronDown className="h-3 w-3 opacity-50" />
                                </span>
                            </div>

                            {/* Abas do painel */}
                            <div className="flex gap-1 mt-3 text-xs">
                                {([
                                    { id: "detalhes", label: "Detalhes", icon: Info },
                                    { id: "atividades", label: "Atividades", icon: Activity },
                                    { id: "historico", label: "Histórico", icon: Clock },
                                ] as const).map(t => {
                                    const Icon = t.icon
                                    const on = leadTab === t.id
                                    return (
                                        <button
                                            key={t.id}
                                            onClick={() => setLeadTab(t.id)}
                                            className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border transition-colors ${
                                                on ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-medium" : "text-muted-foreground border-transparent hover:bg-muted"
                                            }`}
                                        >
                                            <Icon className="h-3.5 w-3.5" /> {t.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="overflow-y-auto p-4 space-y-4 text-sm">
                            {leadTab === "detalhes" && (
                                <>
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

                                    {/* Tags */}
                                    {(threadLead.tags_whatsapp ?? []).length > 0 && (
                                        <div className="border-t pt-3 space-y-2">
                                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tags</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {(threadLead.tags_whatsapp ?? []).map(tag => (
                                                    <span
                                                        key={tag}
                                                        className="inline-flex items-center gap-1 text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full"
                                                    >
                                                        <Tag className="h-2.5 w-2.5" /> {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {leadTab === "atividades" && (
                                <div className="space-y-2">
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Mensagens recentes</p>
                                    {thread.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">Sem atividade registrada.</p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {[...thread].slice(-12).reverse().map(m => (
                                                <li key={m.id} className="flex items-start gap-2 text-xs">
                                                    <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${m.direction === "inbound" ? "bg-sky-500" : "bg-emerald-500"}`} />
                                                    <div className="min-w-0">
                                                        <p className="truncate">
                                                            <span className="text-muted-foreground">{m.direction === "inbound" ? "Recebida" : "Enviada"} · {clockTime(m.created_at)}</span>
                                                        </p>
                                                        <p className="truncate text-muted-foreground">
                                                            {m.body?.split("\n").find(Boolean) || (m.media_type ? `[${m.media_type}]` : "—")}
                                                        </p>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            {leadTab === "historico" && (
                                <div className="space-y-2.5">
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Informações adicionais</p>
                                    <div className="space-y-1.5 text-xs">
                                        <div className="flex justify-between gap-2">
                                            <span className="text-muted-foreground">Primeiro contato</span>
                                            <span className="text-right">{firstMsgAt ? fullDateTime(firstMsgAt) : "—"}</span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <span className="text-muted-foreground">Última interação</span>
                                            <span className="text-right">{lastMsgAt ? fullDateTime(lastMsgAt) : "—"}</span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <span className="text-muted-foreground">Conversas</span>
                                            <span className="tabular-nums">{thread.length} mensagens</span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <span className="text-muted-foreground">Canal</span>
                                            <span>WhatsApp ({officialMode ? "API oficial" : "Baileys"})</span>
                                        </div>
                                        {typeof threadLead.contact_count === "number" && (
                                            <div className="flex justify-between gap-2">
                                                <span className="text-muted-foreground">Contatos no CRM</span>
                                                <span className="tabular-nums">{threadLead.contact_count}</span>
                                            </div>
                                        )}
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
                    </>
                )}
            </div>
        </div>
    )
}
