"use client"

import { useEffect, useState, useCallback } from "react"
import {
    Inbox, RefreshCw, Search, FileText, ExternalLink, Loader2,
    CheckCircle2, AlertTriangle, HelpCircle, XCircle, Link2, Trash2,
} from "lucide-react"

type MatchStatus = "pending" | "matched" | "ambiguous" | "no_match" | "attached" | "manual"

type Candidate = {
    cronograma_id: string
    nome: string
    data: string
    score: number
    has_catalog: boolean
}

type CronogramaJoin = {
    id: string
    data: string
    nome: string
    catalogo_url: string | null
}

type Detection = {
    id: string
    received_at: string
    group_jid: string
    group_name: string | null
    sender_name: string | null
    file_name: string
    file_mime: string | null
    file_size: number | null
    r2_key: string | null
    match_status: MatchStatus
    match_score: number | null
    match_method: string | null
    cronograma_id: string | null
    candidates: Candidate[] | null
    attached: boolean
    attached_at: string | null
    attached_by: string | null
    overwrote_existing: boolean
    error: string | null
    notes: string | null
    cronograma?: CronogramaJoin | null
}

type Leilao = {
    id: string
    data: string
    nome: string
    catalogo_url: string | null
    leiloeira: string | null
    criador: string | null
}

const FILTERS: { id: MatchStatus | "todos"; label: string }[] = [
    { id: "todos",     label: "Todos" },
    { id: "pending",   label: "Pendentes" },
    { id: "ambiguous", label: "Ambíguos" },
    { id: "attached",  label: "Anexados" },
    { id: "manual",    label: "Manuais" },
    { id: "no_match",  label: "Sem match" },
]

function formatDateTime(iso: string) {
    try {
        return new Date(iso).toLocaleString("pt-BR", {
            day: "2-digit", month: "2-digit",
            hour: "2-digit", minute: "2-digit",
        })
    } catch {
        return iso
    }
}

function formatDataBR(iso: string | null | undefined) {
    if (!iso) return "—"
    try {
        const [y, m, d] = iso.split("-")
        return `${d}/${m}/${y}`
    } catch {
        return iso
    }
}

function formatBytes(n: number | null) {
    if (!n) return "—"
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function statusBadge(s: MatchStatus) {
    const map: Record<MatchStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
        attached:  { label: "Anexado",   cls: "border-green-500/40 bg-green-500/10 text-green-400",   Icon: CheckCircle2 },
        manual:    { label: "Manual",    cls: "border-blue-500/40 bg-blue-500/10 text-blue-400",      Icon: Link2 },
        matched:   { label: "Match",     cls: "border-green-500/40 bg-green-500/10 text-green-400",   Icon: CheckCircle2 },
        ambiguous: { label: "Ambíguo",   cls: "border-amber-500/40 bg-amber-500/10 text-amber-400",   Icon: AlertTriangle },
        pending:   { label: "Pendente",  cls: "border-amber-500/40 bg-amber-500/10 text-amber-400",   Icon: HelpCircle },
        no_match:  { label: "Sem match", cls: "border-gray-500/40 bg-gray-500/10 text-gray-400",      Icon: XCircle },
    }
    const e = map[s]
    const Icon = e.Icon
    return (
        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${e.cls}`}>
            <Icon className="h-3 w-3" /> {e.label}
        </span>
    )
}

export function DeteccoesTab() {
    const [filter, setFilter] = useState<MatchStatus | "todos">("todos")
    const [search, setSearch] = useState("")
    const [detections, setDetections] = useState<Detection[]>([])
    const [loading, setLoading] = useState(true)
    const [selected, setSelected] = useState<Detection | null>(null)

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (filter !== "todos") params.set("status", filter)
            if (search.trim()) params.set("q", search.trim())
            const res = await fetch(`/api/whatsapp-catalogos/detections?${params}`, { cache: "no-store" })
            if (res.ok) {
                const j = await res.json()
                setDetections(j.detections ?? [])
            }
        } finally {
            setLoading(false)
        }
    }, [filter, search])

    useEffect(() => { fetchList() }, [filter])
    useEffect(() => {
        const t = setTimeout(fetchList, 300)
        return () => clearTimeout(t)
    }, [search])
    useEffect(() => {
        const i = setInterval(fetchList, 20000)
        return () => clearInterval(i)
    }, [filter, search])

    return (
        <div className="space-y-4">
            <div className="bg-[var(--surface)] text-[var(--text)] rounded-xl border border-[var(--border2)] overflow-hidden">
                <div className="px-6 py-4 border-b flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex flex-wrap gap-1">
                        {FILTERS.map(f => (
                            <button
                                key={f.id}
                                onClick={() => setFilter(f.id)}
                                className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                                    filter === f.id
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "hover:bg-muted"
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar arquivo, grupo, remetente"
                                className="pl-7 pr-3 py-1.5 text-sm rounded-md border bg-background w-64"
                            />
                        </div>
                        <button
                            onClick={fetchList}
                            className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border hover:bg-muted"
                        >
                            <RefreshCw className="h-3 w-3" /> Atualizar
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="p-12 flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                ) : detections.length === 0 ? (
                    <div className="p-12 text-center text-sm text-muted-foreground">
                        <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        Nenhuma detecção ainda. Quando alguém compartilhar um PDF num grupo monitorado, ele aparece aqui.
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <th className="text-left px-4 py-2 font-medium">Recebido</th>
                                <th className="text-left px-4 py-2 font-medium">Arquivo</th>
                                <th className="text-left px-4 py-2 font-medium">Grupo / remetente</th>
                                <th className="text-left px-4 py-2 font-medium">Match</th>
                                <th className="text-left px-4 py-2 font-medium">Status</th>
                                <th className="text-right px-4 py-2 font-medium">Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {detections.map(d => (
                                <tr key={d.id} className="border-t hover:bg-muted/20">
                                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                        {formatDateTime(d.received_at)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                            <span className="font-medium truncate max-w-xs" title={d.file_name}>
                                                {d.file_name}
                                            </span>
                                        </div>
                                        <div className="text-[11px] text-muted-foreground mt-0.5">
                                            {formatBytes(d.file_size)}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-xs">
                                        <div className="font-medium">{d.group_name || "—"}</div>
                                        <div className="text-muted-foreground">{d.sender_name || "—"}</div>
                                    </td>
                                    <td className="px-4 py-3 text-xs">
                                        {d.cronograma ? (
                                            <>
                                                <div className="font-medium">{d.cronograma.nome}</div>
                                                <div className="text-muted-foreground">
                                                    {formatDataBR(d.cronograma.data)}
                                                    {d.match_score != null && ` · ${d.match_score}%`}
                                                </div>
                                            </>
                                        ) : (
                                            <span className="text-muted-foreground">
                                                {d.match_score != null ? `top ${d.match_score}%` : "—"}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">{statusBadge(d.match_status)}</td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => setSelected(d)}
                                            className="text-xs px-2 py-1 rounded border hover:bg-muted"
                                        >
                                            Revisar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {selected && (
                <DetectionModal
                    detection={selected}
                    onClose={() => setSelected(null)}
                    onChanged={() => { setSelected(null); fetchList() }}
                />
            )}
        </div>
    )
}

function DetectionModal({
    detection, onClose, onChanged,
}: {
    detection: Detection
    onClose: () => void
    onChanged: () => void
}) {
    const [fileUrl, setFileUrl] = useState<string | null>(null)
    const [fresh, setFresh] = useState<Candidate[]>([])
    const [busy, setBusy] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [searchOpen, setSearchOpen] = useState(false)

    useEffect(() => {
        let cancel = false
        ;(async () => {
            const res = await fetch(`/api/whatsapp-catalogos/detections/${detection.id}`)
            if (res.ok && !cancel) {
                const j = await res.json()
                setFileUrl(j.file_url ?? null)
                setFresh(j.fresh_candidates ?? [])
            }
        })()
        return () => { cancel = true }
    }, [detection.id])

    async function attachTo(cronograma_id: string, overwrite = false) {
        setBusy(cronograma_id); setError(null)
        try {
            const res = await fetch(`/api/whatsapp-catalogos/detections/${detection.id}/attach`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cronograma_id, overwrite }),
            })
            const j = await res.json()
            if (!res.ok) {
                if (res.status === 409 && !overwrite) {
                    if (confirm(`Este leilão já tem catálogo (${j.existing}). Substituir?`)) {
                        return attachTo(cronograma_id, true)
                    }
                    setBusy(null); return
                }
                throw new Error(j.error || `HTTP ${res.status}`)
            }
            onChanged()
        } catch (e) {
            setError(e instanceof Error ? e.message : "Falha")
            setBusy(null)
        }
    }

    async function removeDetection() {
        if (!confirm("Remover esta detecção do histórico? O arquivo no R2 permanece.")) return
        const res = await fetch(`/api/whatsapp-catalogos/detections/${detection.id}`, { method: "DELETE" })
        if (res.ok) onChanged()
    }

    const candidates = fresh.length > 0 ? fresh : (detection.candidates || [])

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-[var(--surface)] text-[var(--text)] rounded-xl border border-[var(--border2)] shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-6 py-4 border-b">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="font-semibold flex items-center gap-2">
                                <FileText className="h-4 w-4" /> {detection.file_name}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                {detection.group_name} · {detection.sender_name} · {formatDateTime(detection.received_at)}
                            </p>
                        </div>
                        {statusBadge(detection.match_status)}
                    </div>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto">
                    {error && (
                        <div className="px-3 py-2 bg-red-500/10 text-red-400 text-sm rounded">{error}</div>
                    )}

                    {fileUrl && (
                        <a
                            href={fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                        >
                            <ExternalLink className="h-4 w-4" /> Abrir PDF original
                        </a>
                    )}

                    {detection.attached && detection.cronograma && (
                        <div className="px-3 py-2 bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded">
                            Anexado a <strong>{detection.cronograma.nome}</strong> ({formatDataBR(detection.cronograma.data)}).
                        </div>
                    )}

                    <div>
                        <h4 className="text-sm font-semibold mb-2">Candidatos do cronograma</h4>
                        {candidates.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                Nenhum candidato encontrado pelo nome do arquivo. Use a busca abaixo.
                            </p>
                        ) : (
                            <div className="space-y-1.5">
                                {candidates.map(c => (
                                    <div
                                        key={c.cronograma_id}
                                        className="flex items-center justify-between gap-3 px-3 py-2 border rounded-md"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{c.nome}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {formatDataBR(c.data)} · {c.score}% de match
                                                {c.has_catalog && " · já tem catálogo"}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => attachTo(c.cronograma_id)}
                                            disabled={busy === c.cronograma_id}
                                            className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                                        >
                                            {busy === c.cronograma_id ? "Anexando…" : "Anexar"}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <button
                            onClick={() => setSearchOpen(v => !v)}
                            className="text-xs text-primary hover:underline"
                        >
                            {searchOpen ? "Esconder busca" : "Não está aqui? Buscar outro leilão"}
                        </button>
                        {searchOpen && (
                            <ManualSearchPicker onPick={id => attachTo(id)} disabled={!!busy} />
                        )}
                    </div>
                </div>

                <div className="px-6 py-4 border-t flex items-center justify-between">
                    <button
                        onClick={removeDetection}
                        className="text-xs text-red-400 hover:underline inline-flex items-center gap-1"
                    >
                        <Trash2 className="h-3 w-3" /> Remover do histórico
                    </button>
                    <button onClick={onClose} className="px-3 py-2 text-sm rounded-md border hover:bg-muted">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    )
}

function ManualSearchPicker({
    onPick, disabled,
}: {
    onPick: (cronograma_id: string) => void
    disabled?: boolean
}) {
    const [q, setQ] = useState("")
    const [leiloes, setLeiloes] = useState<Leilao[]>([])

    useEffect(() => {
        const t = setTimeout(async () => {
            const params = new URLSearchParams()
            if (q.trim()) params.set("q", q.trim())
            const res = await fetch(`/api/whatsapp-catalogos/cronograma-search?${params}`)
            if (res.ok) {
                const j = await res.json()
                setLeiloes(j.leiloes ?? [])
            }
        }, 250)
        return () => clearTimeout(t)
    }, [q])

    return (
        <div className="mt-3 space-y-2">
            <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Filtrar por nome ou criador"
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
            />
            <div className="max-h-60 overflow-y-auto border rounded-md">
                {leiloes.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3">Nenhum leilão encontrado.</p>
                ) : leiloes.map(l => (
                    <div key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 border-b last:border-b-0">
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{l.nome}</div>
                            <div className="text-xs text-muted-foreground">
                                {formatDataBR(l.data)} · {l.leiloeira || "—"}
                                {l.catalogo_url && " · já tem catálogo"}
                            </div>
                        </div>
                        <button
                            onClick={() => onPick(l.id)}
                            disabled={disabled}
                            className="text-xs px-3 py-1.5 rounded-md border hover:bg-muted disabled:opacity-50"
                        >
                            Anexar
                        </button>
                    </div>
                ))}
            </div>
        </div>
    )
}
