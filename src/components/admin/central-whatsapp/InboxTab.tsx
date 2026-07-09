"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import {
    Search, MessageSquare, Send, AlertCircle, CheckCircle2, Clock,
    UserPlus, BellOff, Bell, Hand, Sparkles, Tag, Loader2, GraduationCap,
    Lock, ShieldCheck, Smartphone, FileText, Download, MessageCircle,
    ExternalLink, Activity, Info, ChevronDown, ArrowLeft,
} from "lucide-react"
import {
    INTERESSE_LABELS,
    type InboxConversation,
    type ThreadLead,
    type ThreadMessage,
    type Template,
} from "./types"
import { ACADEMIA_TAG } from "@/lib/whatsapp-central"
import { buildQualificacao, QUAL_GRUPO_LABEL } from "@/lib/crm-qualificacao"

type Filter = "todos" | "aguardando" | "handoff" | "optout" | "interesse"

/** Documento do lead (cadastro formal ou mídia recebida no WhatsApp). */
type LeadDocItem = {
    source: "cadastro" | "whatsapp"
    id: string
    messageId?: string
    name: string
    tipo: string
    url: string | null
    mime: string | null
    size: number | null
    createdAt: string
    canAttach: boolean
}

const DOC_TIPO_LABELS: Record<string, string> = {
    ie: "Inscrição Estadual",
    cpf: "CPF / CNPJ",
    comprovante: "Comprovante",
    contrato: "Contrato",
    foto: "Foto",
    documento: "Documento",
    outro: "Outro",
}

const DOC_TIPO_OPTIONS = ["ie", "cpf", "comprovante", "contrato", "outro"] as const

/** Progresso da habilitação (o mesmo checklist que guia a IA — /api/whatsapp/habilitacao). */
type HabilitacaoData = {
    lead: {
        id: string
        status: string
        urgencia: string | null
        proximaAcao: string | null
        cadastroStatus: string | null
        score: number | null
        pendencias: string | null
    } | null
    checklist: {
        items: { key: string; label: string; group: "titular" | "propriedade" | "documentos"; done: boolean; value?: string }[]
        done: number
        total: number
        complete: boolean
        missingLabels: string[]
    }
    stageHistory: { from: string; to: string; reason: string; by: string; at: string }[]
}

const HABILITACAO_GROUP_LABELS: Record<string, string> = {
    titular: "Titular",
    propriedade: "Propriedade",
    documentos: "Documentos",
}

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

type ChannelFilter = "todos" | "cloud" | "baileys"

const CHANNEL_FILTERS: { id: ChannelFilter; label: string }[] = [
    { id: "todos", label: "Todos os canais" },
    { id: "cloud", label: "API oficial" },
    { id: "baileys", label: "Baileys" },
]

/** Badge do canal de transporte da conversa (API oficial × Baileys). */
function ChannelBadge({ channel }: { channel: "cloud" | "baileys" | null }) {
    if (!channel) return null
    return channel === "cloud" ? (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            API oficial
        </span>
    ) : (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            Baileys
        </span>
    )
}

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
    const [channelFilter, setChannelFilter] = useState<ChannelFilter>("todos")
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
    const [leadTab, setLeadTab] = useState<"detalhes" | "atividades" | "historico" | "documentos">("detalhes")
    // No mobile a lista, a conversa e o painel do lead viram telas separadas
    // (uma por vez). Este flag controla se o painel do lead está aberto no mobile;
    // no desktop (lg+) os três aparecem lado a lado e ele é ignorado.
    const [showLeadInfo, setShowLeadInfo] = useState(false)

    // Documentos do lead (cadastro + mídias recebidas). Carregados sob demanda.
    const [docs, setDocs] = useState<LeadDocItem[]>([])
    const [docsLoading, setDocsLoading] = useState(false)
    const [docBusy, setDocBusy] = useState<string | null>(null)

    // Progresso da habilitação (o mesmo checklist que guia a IA do concierge).
    const [habilitacao, setHabilitacao] = useState<HabilitacaoData | null>(null)

    // Só templates aprovados pela Meta podem ser disparados como template oficial.
    const approvedTemplates = useMemo(() => templates.filter(t => t.meta_status === "APPROVED"), [templates])

    async function fetchInbox() {
        setLoadingList(true)
        try {
            const params = new URLSearchParams()
            if (filter !== "todos") params.set("filter", filter)
            if (channelFilter !== "todos") params.set("channel", channelFilter)
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

    async function fetchHabilitacao(phone: string) {
        try {
            const res = await fetch(`/api/whatsapp/habilitacao/${encodeURIComponent(phone)}`)
            const data = await res.json()
            setHabilitacao(data?.checklist ? (data as HabilitacaoData) : null)
        } catch {
            setHabilitacao(null)
        }
    }

    async function fetchDocs(phone: string) {
        setDocsLoading(true)
        try {
            const res = await fetch(`/api/whatsapp/lead-documents/${encodeURIComponent(phone)}`)
            const data = await res.json()
            setDocs(data.documents ?? [])
        } catch {
            setDocs([])
        } finally {
            setDocsLoading(false)
        }
    }

    async function attachDoc(messageId: string) {
        if (!selectedPhone) return
        setDocBusy(messageId)
        try {
            const res = await fetch(`/api/whatsapp/lead-documents/${encodeURIComponent(selectedPhone)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "attach", messageId }),
            })
            const data = await res.json()
            if (!res.ok) setFeedback({ type: "err", msg: data.error ?? "Falha ao anexar" })
            else { setFeedback({ type: "ok", msg: "Anexado ao cadastro do lead." }); await fetchDocs(selectedPhone) }
        } catch (e: unknown) {
            setFeedback({ type: "err", msg: e instanceof Error ? e.message : "Erro inesperado" })
        } finally {
            setDocBusy(null)
        }
    }

    async function setDocTipo(id: string, tipo: string) {
        if (!selectedPhone) return
        setDocBusy(id)
        try {
            const res = await fetch(`/api/whatsapp/lead-documents/${encodeURIComponent(selectedPhone)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "set_tipo", id, tipo }),
            })
            if (res.ok) await fetchDocs(selectedPhone)
        } catch { /* silencioso */ } finally {
            setDocBusy(null)
        }
    }

    useEffect(() => { fetchInbox() }, [filter, channelFilter])
    useEffect(() => {
        const t = setTimeout(fetchInbox, 300)
        return () => clearTimeout(t)
    }, [search])
    useEffect(() => {
        const i = setInterval(fetchInbox, 30000)
        return () => clearInterval(i)
    }, [filter, channelFilter, search])
    useEffect(() => {
        // Ao trocar de conversa, recarrega a thread e volta para a aba Detalhes.
        setLeadTab("detalhes")
        setDocs([])
        setHabilitacao(null)
        setShowLeadInfo(false) // no mobile, ao abrir uma conversa cai na tela da thread
        if (selectedPhone) {
            fetchThread(selectedPhone)
            fetchHabilitacao(selectedPhone)
        }
    }, [selectedPhone])

    useEffect(() => {
        // Carrega os documentos só quando a aba Documentos é aberta.
        if (selectedPhone && leadTab === "documentos") fetchDocs(selectedPhone)
    }, [selectedPhone, leadTab])

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
    // Perfil/intenção/fiscal/jornada do lead — mesma fonte que alimenta o prompt da IA.
    const qualificacao = useMemo(() => (threadLead ? buildQualificacao(threadLead) : []), [threadLead])

    const headerName = threadLead?.nome || selected?.name || (selectedPhone ? formatPhone(selectedPhone) : "")
    const isNovoLead = (threadLead?.contact_count ?? 0) <= 1
    // Resumo para a aba "Histórico" do painel (datas reais do thread carregado).
    const firstMsgAt = thread.length ? thread[0].created_at : threadLead?.last_whatsapp_at ?? null
    const lastMsgAt = thread.length ? thread[thread.length - 1].created_at : threadLead?.last_whatsapp_at ?? null

    return (
        <div className="flex flex-col lg:grid lg:grid-cols-[340px_1fr_320px] gap-3 h-[calc(100dvh-180px)] min-h-[460px] lg:h-[calc(100vh-220px)] lg:min-h-[520px]">
            {/* ───── Lista de conversas ───── (mobile: some quando há conversa aberta) */}
            <div className={`${selectedPhone ? "hidden" : "flex"} lg:flex flex-1 min-h-0 lg:flex-none flex-col bg-card text-card-foreground border rounded-xl overflow-hidden`}>
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
                    {/* Divisão de canal: API oficial = cliente; Baileys = nº próprio/legado */}
                    <div className="flex flex-wrap gap-1">
                        {CHANNEL_FILTERS.map(f => (
                            <button
                                key={f.id}
                                onClick={() => setChannelFilter(f.id)}
                                className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                                    channelFilter === f.id
                                        ? "bg-sky-600 text-white border-transparent"
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
                                        <span className="flex items-center gap-1">
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${st.cls}`}>
                                                {st.label}
                                            </span>
                                            <ChannelBadge channel={c.channel} />
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

            {/* ───── Thread ───── (mobile: só com conversa aberta e painel do lead fechado) */}
            <div className={`${selectedPhone && !showLeadInfo ? "flex" : "hidden"} lg:flex flex-1 min-h-0 flex-col bg-card text-card-foreground border rounded-xl overflow-hidden`}>
                {!selectedPhone ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-10 gap-3 text-muted-foreground">
                        <MessageSquare className="h-10 w-10 opacity-40" />
                        <p className="text-sm">Selecione uma conversa para ver o histórico.</p>
                    </div>
                ) : (
                    <>
                        <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <button
                                    type="button"
                                    onClick={() => setSelectedPhone(null)}
                                    className="lg:hidden -ml-1 p-1.5 rounded-md hover:bg-muted shrink-0"
                                    aria-label="Voltar para a lista de conversas"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </button>
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
                                        <span className="hidden sm:inline">Abrir no CRM</span>
                                    </a>
                                )}
                                {/* Mobile: abre o painel de detalhes do lead como tela cheia */}
                                <button
                                    type="button"
                                    onClick={() => setShowLeadInfo(true)}
                                    className="lg:hidden text-xs flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 hover:bg-muted transition-colors"
                                    aria-label="Ver detalhes do lead"
                                >
                                    <Info className="h-3.5 w-3.5" />
                                </button>
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

            {/* ───── Painel lateral do lead ───── (mobile: tela cheia via botão de info) */}
            <div className={`${showLeadInfo ? "flex" : "hidden"} lg:flex flex-1 min-h-0 bg-card text-card-foreground border rounded-xl overflow-hidden flex-col`}>
                {/* Mobile: barra para voltar à conversa */}
                <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b shrink-0">
                    <button
                        type="button"
                        onClick={() => setShowLeadInfo(false)}
                        className="p-1.5 rounded-md hover:bg-muted"
                        aria-label="Voltar para a conversa"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-medium">Detalhes do lead</span>
                </div>
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
                                    { id: "documentos", label: "Docs", icon: FileText },
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

                                    {/* Qualificação — tudo o que sabemos do produtor, com a procedência
                                        de cada dado: [formulário] o lead clicou num anúncio (pode estar
                                        errado), [conversa] a IA arrancou, [consulta] veio de API. */}
                                    {qualificacao.length > 0 && (
                                        <div className="space-y-2 border-t pt-3">
                                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Qualificação</p>
                                            {(["perfil", "intenção", "fiscal", "jornada"] as const).map(grupo => {
                                                const itens = qualificacao.filter(i => i.grupo === grupo)
                                                if (!itens.length) return null
                                                return (
                                                    <div key={grupo} className="space-y-0.5">
                                                        <p className="text-[10px] text-muted-foreground mt-1">{QUAL_GRUPO_LABEL[grupo]}</p>
                                                        {itens.map(i => (
                                                            <div key={i.key} className="flex items-start justify-between gap-2 text-xs">
                                                                <span className="text-muted-foreground shrink-0">{i.label}</span>
                                                                <span className="text-right">
                                                                    <strong>{i.value}</strong>
                                                                    <span
                                                                        className={`ml-1.5 text-[9px] uppercase tracking-wide px-1 py-0.5 rounded ${
                                                                            i.origem === "formulário" ? "bg-sky-500/10 text-sky-500"
                                                                                : i.origem === "conversa" ? "bg-emerald-500/10 text-emerald-500"
                                                                                    : "bg-violet-500/10 text-violet-500"
                                                                        }`}
                                                                        title={
                                                                            i.origem === "formulário" ? "Respondido no formulário do anúncio — pode estar impreciso"
                                                                                : i.origem === "conversa" ? "Levantado pela IA na conversa"
                                                                                    : "Preenchido por consulta automática"
                                                                        }
                                                                    >
                                                                        {i.origem}
                                                                    </span>
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {/* Habilitação — mesmo checklist que guia a IA do concierge */}
                                    {habilitacao?.checklist && (
                                        <div className="space-y-2 border-t pt-3">
                                            <div className="flex items-center justify-between">
                                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Habilitação p/ compra</p>
                                                <span className={`text-[11px] font-medium ${habilitacao.checklist.complete ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                                                    {habilitacao.checklist.done}/{habilitacao.checklist.total}
                                                </span>
                                            </div>
                                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${habilitacao.checklist.complete ? "bg-emerald-500" : "bg-amber-500"}`}
                                                    style={{ width: `${Math.round((habilitacao.checklist.done / Math.max(1, habilitacao.checklist.total)) * 100)}%` }}
                                                />
                                            </div>
                                            {(["titular", "propriedade", "documentos"] as const).map(group => (
                                                <div key={group} className="space-y-0.5">
                                                    <p className="text-[10px] text-muted-foreground mt-1">{HABILITACAO_GROUP_LABELS[group]}</p>
                                                    {habilitacao.checklist.items.filter(i => i.group === group).map(i => (
                                                        <div key={i.key} className="flex items-start gap-1.5 text-xs">
                                                            {i.done
                                                                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                                                : <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />}
                                                            <span className={i.done ? "" : "text-muted-foreground"}>
                                                                {i.label}
                                                                {i.done && i.value ? <span className="text-muted-foreground"> · {i.value}</span> : null}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                            {habilitacao.lead?.score != null && (
                                                <p className="text-xs"><strong>Score:</strong> {habilitacao.lead.score}{habilitacao.lead.pendencias ? ` · ${habilitacao.lead.pendencias}` : ""}</p>
                                            )}
                                            {habilitacao.checklist.complete && (
                                                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                                    ✓ Pronto para revisão humana — aprovar cadastro no CRM.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Últimas movimentações de etapa (auditoria da IA) */}
                                    {(habilitacao?.stageHistory?.length ?? 0) > 0 && (
                                        <div className="space-y-1.5 border-t pt-3">
                                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Movimentações de etapa</p>
                                            <ul className="space-y-1">
                                                {habilitacao!.stageHistory.slice(0, 4).map((h, i) => (
                                                    <li key={i} className="text-[11px] text-muted-foreground">
                                                        <span className="font-medium text-foreground">{h.from} → {h.to}</span>
                                                        {" "}· {h.reason} <span className="opacity-70">({h.by === "ia" ? "IA" : h.by} · {timeAgo(h.at)})</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

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

                            {leadTab === "documentos" && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Documentos do lead</p>
                                        <button
                                            onClick={() => selectedPhone && fetchDocs(selectedPhone)}
                                            className="text-[10px] text-muted-foreground hover:text-foreground"
                                        >
                                            atualizar
                                        </button>
                                    </div>
                                    {docsLoading ? (
                                        <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                                    ) : docs.length === 0 ? (
                                        <p className="text-xs text-muted-foreground py-6 text-center">
                                            Nenhum documento ainda. Quando o lead enviar a inscrição estadual, CPF/CNPJ ou comprovantes pelo WhatsApp, eles aparecem aqui.
                                        </p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {docs.map(d => {
                                                const isImage = (d.mime || "").startsWith("image/") || d.tipo === "foto"
                                                return (
                                                    <li key={`${d.source}-${d.id}`} className="rounded-lg border p-2.5 space-y-2">
                                                        <div className="flex items-start gap-2">
                                                            {isImage && d.url ? (
                                                                <a href={d.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img src={d.url} alt={d.name} className="h-12 w-12 rounded object-cover border" />
                                                                </a>
                                                            ) : (
                                                                <FileText className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
                                                            )}
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-xs font-medium truncate">{d.name}</p>
                                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                                                        {DOC_TIPO_LABELS[d.tipo] ?? d.tipo}
                                                                    </span>
                                                                    <span className="text-[10px] text-muted-foreground">{timeAgo(d.createdAt)}</span>
                                                                    {d.source === "cadastro" && (
                                                                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">no cadastro</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {d.url && (
                                                                <a
                                                                    href={d.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    download={d.name}
                                                                    className="inline-flex items-center gap-1 text-[11px] rounded-md border px-2 py-1 hover:bg-muted"
                                                                >
                                                                    <Download className="h-3 w-3" /> Abrir / baixar
                                                                </a>
                                                            )}
                                                            {d.source === "whatsapp" && d.canAttach && d.messageId && (
                                                                <button
                                                                    onClick={() => attachDoc(d.messageId!)}
                                                                    disabled={docBusy === d.messageId}
                                                                    className="inline-flex items-center gap-1 text-[11px] rounded-md border px-2 py-1 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-600 disabled:opacity-50"
                                                                    title="Salva como documento formal do lead (aparece no cadastro)"
                                                                >
                                                                    {docBusy === d.messageId ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                                                                    Anexar ao cadastro
                                                                </button>
                                                            )}
                                                            {d.source === "cadastro" && (
                                                                <select
                                                                    value={DOC_TIPO_OPTIONS.includes(d.tipo as typeof DOC_TIPO_OPTIONS[number]) ? d.tipo : "outro"}
                                                                    disabled={docBusy === d.id}
                                                                    onChange={e => setDocTipo(d.id, e.target.value)}
                                                                    className="text-[11px] px-1.5 py-1 rounded-md border bg-background"
                                                                >
                                                                    {DOC_TIPO_OPTIONS.map(t => (
                                                                        <option key={t} value={t}>{DOC_TIPO_LABELS[t]}</option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                        </div>
                                                    </li>
                                                )
                                            })}
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
