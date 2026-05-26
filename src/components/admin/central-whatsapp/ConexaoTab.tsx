"use client"

import { useEffect, useState, useCallback } from "react"
import { Activity, AlertCircle, ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock, Inbox, Pause, Play, QrCode, RefreshCw, XCircle } from "lucide-react"
import type { WAStatus } from "./types"

type PauseState = {
    paused: boolean
    paused_at: string | null
    paused_by: string | null
}

type ActivityRow = {
    id: string
    created_at: string
    phone: string | null
    name: string | null
    body: string | null
    direction: "inbound" | "outbound"
    status: string | null
    origin: string | null
    bot_step: string | null
}

type ActivityData = {
    counters_24h: {
        outbound_total: number
        welcome_sent: number
        welcome_queued: number
        welcome_failed: number
        welcome_skipped: number
        campaign_sent: number
        manual_sent: number
        inbound: number
    }
    recent: ActivityRow[]
    last_inbound_at: string | null
    last_outbound_at: string | null
    vps: {
        status: string | null
        queue_size: number | null
        processing: boolean | null
        delay_ms: number | null
        reachable: boolean
    }
}

function formatDateTime(iso: string | null): string {
    if (!iso) return ""
    try {
        return new Date(iso).toLocaleString("pt-BR", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        })
    } catch {
        return iso
    }
}

function formatTime(iso: string): string {
    try {
        return new Date(iso).toLocaleTimeString("pt-BR", {
            hour: "2-digit", minute: "2-digit",
        })
    } catch {
        return iso
    }
}

function timeAgo(iso: string | null): string {
    if (!iso) return "—"
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return "agora"
    if (m < 60) return `${m}m atrás`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h atrás`
    return `${Math.floor(h / 24)}d atrás`
}

function formatPhoneShort(phone: string | null): string {
    if (!phone) return "—"
    const d = phone.replace(/\D/g, "")
    if (d.length === 13 && d.startsWith("55")) return `${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`
    if (d.length === 12 && d.startsWith("55")) return `${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`
    return phone
}

function describeRow(r: ActivityRow): string {
    if (r.direction === "inbound") return r.body?.slice(0, 80) || "(inbound sem texto)"
    if (r.bot_step === "welcome" && !r.body) return "Welcome enviado (template renderizado pelo bot)"
    if (r.bot_step === "welcome" && r.body) return r.body.slice(0, 80)
    if (r.body) return r.body.slice(0, 80)
    return "(sem texto)"
}

function statusBadgeClass(status: string | null, direction: "inbound" | "outbound"): string {
    if (direction === "inbound") return "border-sky-500/30 bg-sky-500/10 text-sky-400"
    if (status === "sent") return "border-green-500/30 bg-green-500/10 text-green-400"
    if (status === "queued") return "border-amber-500/30 bg-amber-500/10 text-amber-400"
    if (status === "failed") return "border-red-500/30 bg-red-500/10 text-red-400"
    if (status === "skipped") return "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"
    return "border-muted bg-muted text-muted-foreground"
}

export function ConexaoTab() {
    const [status, setStatus] = useState<WAStatus>("disconnected")
    const [qr, setQr] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const [pause, setPause] = useState<PauseState | null>(null)
    const [pauseLoading, setPauseLoading] = useState(true)
    const [pauseSaving, setPauseSaving] = useState(false)
    const [pauseError, setPauseError] = useState<string | null>(null)

    const [activity, setActivity] = useState<ActivityData | null>(null)
    const [activityLoading, setActivityLoading] = useState(true)

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch("/api/whatsapp/status", { cache: "no-store" })
            const j = await res.json()
            setStatus(j.status ?? "disconnected")
            setQr(j.qr ?? null)
        } catch {
            setStatus("disconnected")
            setQr(null)
        } finally {
            setLoading(false)
        }
    }, [])

    const fetchPause = useCallback(async () => {
        try {
            const res = await fetch("/api/whatsapp/central/pause", { cache: "no-store" })
            if (res.ok) {
                const j = (await res.json()) as PauseState
                setPause(j)
            }
        } catch {
            // silencioso — o toggle fica desabilitado se nunca carregou
        } finally {
            setPauseLoading(false)
        }
    }, [])

    const fetchActivity = useCallback(async () => {
        try {
            const res = await fetch("/api/whatsapp/central/activity", { cache: "no-store" })
            if (res.ok) {
                const j = (await res.json()) as ActivityData
                setActivity(j)
            }
        } catch {
            // silencioso — card mostra placeholder se nunca carregou
        } finally {
            setActivityLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchStatus()
        fetchPause()
        fetchActivity()
        const t = setInterval(fetchStatus, 5000)
        const a = setInterval(fetchActivity, 15000)
        return () => {
            clearInterval(t)
            clearInterval(a)
        }
    }, [fetchStatus, fetchPause, fetchActivity])

    async function togglePause() {
        if (!pause || pauseSaving) return
        setPauseSaving(true)
        setPauseError(null)
        const target = !pause.paused
        try {
            const res = await fetch("/api/whatsapp/central/pause", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paused: target }),
            })
            if (!res.ok) {
                const j = await res.json().catch(() => ({}))
                throw new Error(j.error || `HTTP ${res.status}`)
            }
            const j = (await res.json()) as PauseState
            setPause(j)
        } catch (e) {
            setPauseError(e instanceof Error ? e.message : "Falha ao salvar")
        } finally {
            setPauseSaving(false)
        }
    }

    const isPaused = !!pause?.paused

    return (
        <div className="space-y-5">
            <div className="bg-card text-card-foreground rounded-xl border overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                        <QrCode className="h-4 w-4" /> Status de conexão do número
                    </h3>
                    <button
                        onClick={fetchStatus}
                        className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border hover:bg-muted"
                    >
                        <RefreshCw className="h-3 w-3" /> Atualizar
                    </button>
                </div>
                <div className="p-8 flex flex-col items-center justify-center min-h-[280px]">
                    {loading && (
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                    )}

                    {!loading && status === "connected" && (
                        <div className="text-center space-y-3">
                            <CheckCircle2 className="h-14 w-14 text-green-600 mx-auto" />
                            <h4 className="text-xl font-bold">Número conectado</h4>
                            <p className="text-sm text-muted-foreground max-w-md">
                                {isPaused
                                    ? "Conectado, mas em pausa: a Central não envia welcome nem executa o fluxo. Mensagens recebidas continuam aparecendo no Inbox."
                                    : "Pronto para receber inbound, classificar interesses e disparar mensagens."}
                            </p>
                        </div>
                    )}

                    {!loading && status === "qr" && qr && (
                        <div className="space-y-4 flex flex-col items-center">
                            <div className="bg-white p-4 rounded-xl border shadow-sm">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={qr} alt="QR" className="w-60 h-60 object-contain" />
                            </div>
                            <div className="text-center max-w-sm">
                                <h4 className="font-bold mb-2">Escaneie pelo número do sócio</h4>
                                <ol className="text-xs text-muted-foreground text-left space-y-1 list-decimal list-inside">
                                    <li>Abra o WhatsApp</li>
                                    <li>Toque em Configurações → Aparelhos Conectados</li>
                                    <li>Aponte a câmera para este QR Code</li>
                                </ol>
                            </div>
                        </div>
                    )}

                    {!loading && (status === "disconnected" || status === "connecting") && (
                        <div className="text-center space-y-3">
                            <div className="animate-pulse">
                                <AlertCircle className="h-14 w-14 text-amber-500 mx-auto" />
                            </div>
                            <h4 className="text-xl font-bold">
                                {status === "connecting" ? "Conectando…" : "Desconectado"}
                            </h4>
                            <p className="text-sm text-muted-foreground max-w-md">
                                Iniciando o servidor. O QR Code aparecerá em alguns segundos.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-card text-card-foreground rounded-xl border overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                        {isPaused ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        Operação do fluxo
                    </h3>
                    <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                            isPaused
                                ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                                : "border-green-500/40 bg-green-500/10 text-green-400"
                        }`}
                    >
                        {isPaused ? "Pausado" : "Ativo"}
                    </span>
                </div>
                <div className="p-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="space-y-1.5 max-w-2xl">
                        <p className="text-sm">
                            {isPaused
                                ? "A Central está conectada, mas todos os disparos automatizados estão suspensos."
                                : "A Central responde automaticamente: welcome em novos leads e fluxo nas mensagens recebidas."}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Pausar mantém o número logado e o histórico do Inbox atualizado, mas
                            bloqueia o welcome e o fluxo. Útil para investigar problemas ou
                            atender manualmente sem que o bot intervenha.
                        </p>
                        {isPaused && pause?.paused_at && (
                            <p className="text-xs text-muted-foreground">
                                Pausado desde {formatDateTime(pause.paused_at)}.
                            </p>
                        )}
                        {pauseError && (
                            <p className="text-xs text-red-400">{pauseError}</p>
                        )}
                    </div>
                    <button
                        onClick={togglePause}
                        disabled={pauseLoading || pauseSaving || !pause}
                        className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            isPaused
                                ? "border-green-500/40 bg-green-500/10 text-green-300 hover:bg-green-500/20"
                                : "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                        }`}
                    >
                        {pauseSaving ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : isPaused ? (
                            <Play className="h-4 w-4" />
                        ) : (
                            <Pause className="h-4 w-4" />
                        )}
                        {isPaused ? "Retomar fluxo" : "Pausar fluxo"}
                    </button>
                </div>
            </div>

            <div className="bg-card text-card-foreground rounded-xl border overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Activity className="h-4 w-4" /> Atividade (últimas 24h)
                    </h3>
                    <button
                        onClick={fetchActivity}
                        className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border hover:bg-muted"
                    >
                        <RefreshCw className="h-3 w-3" /> Atualizar
                    </button>
                </div>

                {activityLoading && !activity ? (
                    <div className="p-8 flex justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                    </div>
                ) : !activity ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                        Não consegui carregar a atividade.
                    </div>
                ) : (
                    <div className="divide-y">
                        <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div className="space-y-0.5">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Welcomes</p>
                                <p className="text-2xl font-bold tabular-nums">
                                    {activity.counters_24h.welcome_sent + activity.counters_24h.welcome_queued}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    {activity.counters_24h.welcome_sent} enviados · {activity.counters_24h.welcome_queued} na fila
                                </p>
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Falhas / Skip</p>
                                <p className={`text-2xl font-bold tabular-nums ${activity.counters_24h.welcome_failed > 0 ? "text-red-400" : ""}`}>
                                    {activity.counters_24h.welcome_failed + activity.counters_24h.welcome_skipped}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    {activity.counters_24h.welcome_failed} falhas · {activity.counters_24h.welcome_skipped} skip (optout/dedup)
                                </p>
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Inbound</p>
                                <p className="text-2xl font-bold tabular-nums">
                                    {activity.counters_24h.inbound}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    Último: {timeAgo(activity.last_inbound_at)}
                                </p>
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fila do VPS</p>
                                <p className={`text-2xl font-bold tabular-nums ${activity.vps.reachable ? "" : "text-red-400"}`}>
                                    {activity.vps.reachable ? (activity.vps.queue_size ?? 0) : "off"}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    {activity.vps.reachable
                                        ? activity.vps.processing
                                            ? "processando…"
                                            : `${activity.vps.status ?? "?"} · ocioso`
                                        : "VPS inacessível"}
                                </p>
                            </div>
                        </div>

                        <div>
                            <div className="px-6 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b bg-muted/30">
                                Últimos eventos
                            </div>
                            {activity.recent.length === 0 ? (
                                <div className="px-6 py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                                    <Inbox className="h-3.5 w-3.5" />
                                    Sem mensagens registradas.
                                </div>
                            ) : (
                                <ul className="divide-y max-h-[400px] overflow-y-auto">
                                    {activity.recent.map(r => {
                                        const isInbound = r.direction === "inbound"
                                        return (
                                            <li key={r.id} className="px-6 py-2.5 flex items-start gap-3 text-xs hover:bg-muted/30">
                                                <div className="pt-0.5">
                                                    {isInbound ? (
                                                        <ArrowDownLeft className="h-3.5 w-3.5 text-sky-400" />
                                                    ) : r.status === "failed" ? (
                                                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                                                    ) : r.status === "skipped" ? (
                                                        <Clock className="h-3.5 w-3.5 text-zinc-400" />
                                                    ) : (
                                                        <ArrowUpRight className="h-3.5 w-3.5 text-green-400" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-mono text-muted-foreground tabular-nums">
                                                            {formatTime(r.created_at)}
                                                        </span>
                                                        <span className={`px-1.5 py-0.5 rounded border text-[10px] ${statusBadgeClass(r.status, r.direction)}`}>
                                                            {isInbound ? "inbound" : (r.status ?? "?")}
                                                        </span>
                                                        {r.bot_step && (
                                                            <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground">
                                                                {r.bot_step}
                                                            </span>
                                                        )}
                                                        {r.origin && (
                                                            <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground">
                                                                {r.origin}
                                                            </span>
                                                        )}
                                                        <span className="text-muted-foreground font-mono">
                                                            {formatPhoneShort(r.phone)}
                                                        </span>
                                                        {r.name && (
                                                            <span className="text-muted-foreground truncate">· {r.name}</span>
                                                        )}
                                                    </div>
                                                    <p className="text-muted-foreground mt-0.5 truncate">
                                                        {describeRow(r)}
                                                    </p>
                                                </div>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
