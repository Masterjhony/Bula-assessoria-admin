"use client"

import { useEffect, useState, useCallback } from "react"
import {
    AlertCircle, CheckCircle2, Pause, Play, QrCode, RefreshCw,
} from "lucide-react"

type Status = "connected" | "qr" | "connecting" | "disconnected"

type PauseState = {
    paused: boolean
    paused_at: string | null
    paused_by: string | null
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

export function ConexaoCatalogosTab() {
    const [status, setStatus] = useState<Status>("disconnected")
    const [qr, setQr] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [vpsError, setVpsError] = useState<string | null>(null)

    const [pause, setPause] = useState<PauseState | null>(null)
    const [pauseLoading, setPauseLoading] = useState(true)
    const [pauseSaving, setPauseSaving] = useState(false)
    const [pauseError, setPauseError] = useState<string | null>(null)

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch("/api/whatsapp-catalogos/status", { cache: "no-store" })
            const j = await res.json()
            setStatus(j.status ?? "disconnected")
            setQr(j.qr ?? null)
            setVpsError(j.error ?? null)
        } catch {
            setStatus("disconnected")
            setQr(null)
            setVpsError("falha ao contatar servidor")
        } finally {
            setLoading(false)
        }
    }, [])

    const fetchPause = useCallback(async () => {
        try {
            const res = await fetch("/api/whatsapp-catalogos/pause", { cache: "no-store" })
            if (res.ok) setPause(await res.json())
        } catch { /* silencioso */ } finally {
            setPauseLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchStatus()
        fetchPause()
        const t = setInterval(fetchStatus, 5000)
        return () => clearInterval(t)
    }, [fetchStatus, fetchPause])

    async function togglePause() {
        if (!pause || pauseSaving) return
        setPauseSaving(true)
        setPauseError(null)
        const target = !pause.paused
        try {
            const res = await fetch("/api/whatsapp-catalogos/pause", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paused: target }),
            })
            if (!res.ok) {
                const j = await res.json().catch(() => ({}))
                throw new Error(j.error || `HTTP ${res.status}`)
            }
            setPause(await res.json())
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
                        <QrCode className="h-4 w-4" /> Status da sessão de catálogos
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
                                    ? "Conectado, mas anexo automático em pausa. PDFs detectados ficam pendentes para anexar manualmente."
                                    : "Monitorando os grupos configurados em busca de PDFs de catálogo."}
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
                                <h4 className="font-bold mb-2">Escaneie pelo segundo número</h4>
                                <ol className="text-xs text-muted-foreground text-left space-y-1 list-decimal list-inside">
                                    <li>Abra o WhatsApp do número dedicado a monitoramento</li>
                                    <li>Configurações → Aparelhos Conectados</li>
                                    <li>Aponte a câmera para este QR</li>
                                </ol>
                                <p className="text-[11px] text-muted-foreground mt-3">
                                    Esta sessão é independente da Central WhatsApp comercial.
                                </p>
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
                                {vpsError
                                    ? `Falha ao falar com o servidor: ${vpsError}. Verifique o container formula_boi_whatsapp_catalogs no VPS.`
                                    : "Iniciando a sessão. O QR Code aparecerá em alguns segundos."}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-card text-card-foreground rounded-xl border overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                        {isPaused ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        Anexo automático
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
                                ? "PDFs continuam sendo capturados, mas nenhum anexo é gravado automaticamente — toda detecção fica como pendente para revisão."
                                : "Quando um PDF tem match confiante com um leilão do cronograma sem catálogo, ele é anexado sozinho."}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Pausar mantém a sessão logada e seguimos registrando o histórico das detecções. Útil para testar regras de matching sem ações ao vivo no cronograma.
                        </p>
                        {isPaused && pause?.paused_at && (
                            <p className="text-xs text-muted-foreground">
                                Pausado desde {formatDateTime(pause.paused_at)}.
                            </p>
                        )}
                        {pauseError && <p className="text-xs text-red-400">{pauseError}</p>}
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
                        {isPaused ? "Retomar anexo" : "Pausar anexo"}
                    </button>
                </div>
            </div>
        </div>
    )
}
