"use client"

import { useEffect, useState, useCallback } from "react"
import {
    Inbox, RefreshCw, Search, FileText, ExternalLink, Loader2,
    CheckCircle2, AlertTriangle, HelpCircle, XCircle, Link2, Trash2,
    ScanSearch, Eye, EyeOff, Star, Copy, FileWarning,
} from "lucide-react"

/**
 * Detecções de catálogo.
 *
 * O que a tela precisa deixar claro, e antes não deixava: POR QUE o sistema
 * casou (ou não) o arquivo com um leilão. Cada linha agora mostra o que está
 * IMPRESSO no PDF — tipo do documento, nome do evento, data — e o motivo do
 * match. "top 57%" não dizia nada a ninguém; "21/08 confere, criatório
 * Colonial" resolve a dúvida sem abrir o arquivo.
 */

type MatchStatus =
    | "analyzing" | "attached" | "manual" | "review" | "no_match"
    | "not_catalog" | "duplicate" | "error"
    // Estados legados, de antes da leitura por conteúdo.
    | "pending" | "matched" | "ambiguous"

type Candidate = {
    cronograma_id: string
    nome: string
    data: string
    criador?: string | null
    score: number
    has_catalog: boolean
    motivos?: string[]
    conflito_data?: boolean
    data_confere?: boolean
    identidade?: boolean
}

type CronogramaJoin = {
    id: string
    data: string
    nome: string
    catalogo_url: string | null
}

type Documento = {
    id: string
    cronograma_id: string
    tipo: string
    titulo: string
    url: string
    publico: boolean
    principal: boolean
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
    match_reasons: string[] | null
    cronograma_id: string | null
    candidates: Candidate[] | null
    duplicate_of: string | null
    analyzed_at: string | null
    doc_tipo: string | null
    doc_evento: string | null
    doc_data: string | null
    doc_hora: string | null
    doc_leiloeira: string | null
    doc_criadores: string[] | null
    doc_local: string | null
    doc_lotes: number | null
    doc_paginas: number | null
    doc_fonte: string | null
    doc_confianca: number | null
    doc_trecho?: string | null
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

const FILTERS: { id: string; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "review,pending,ambiguous", label: "Revisar" },
    { id: "attached,manual,duplicate", label: "Anexados" },
    { id: "no_match", label: "Sem match" },
    { id: "not_catalog", label: "Não é catálogo" },
    { id: "analyzing,error", label: "Em análise / erro" },
]

const TIPO_LABEL: Record<string, string> = {
    catalogo: "Catálogo",
    ordem_entrada: "Ordem de entrada",
    relatorio: "Relatório",
    agenda: "Agenda",
    outro: "Outro",
}

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
    const [y, m, d] = iso.split("-")
    return y && m && d ? `${d}/${m}/${y}` : iso
}

function formatBytes(n: number | null) {
    if (!n) return "—"
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function statusBadge(s: MatchStatus) {
    const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
        attached: { label: "Anexado", cls: "border-green-500/40 bg-green-500/10 text-green-400", Icon: CheckCircle2 },
        manual: { label: "Manual", cls: "border-blue-500/40 bg-blue-500/10 text-blue-400", Icon: Link2 },
        matched: { label: "Match", cls: "border-green-500/40 bg-green-500/10 text-green-400", Icon: CheckCircle2 },
        duplicate: { label: "Reenvio", cls: "border-slate-500/40 bg-slate-500/10 text-slate-300", Icon: Copy },
        review: { label: "Revisar", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400", Icon: AlertTriangle },
        ambiguous: { label: "Revisar", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400", Icon: AlertTriangle },
        pending: { label: "Revisar", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400", Icon: HelpCircle },
        analyzing: { label: "Lendo PDF…", cls: "border-sky-500/40 bg-sky-500/10 text-sky-400", Icon: Loader2 },
        no_match: { label: "Sem match", cls: "border-gray-500/40 bg-gray-500/10 text-gray-400", Icon: XCircle },
        not_catalog: { label: "Não é catálogo", cls: "border-gray-500/40 bg-gray-500/10 text-gray-400", Icon: FileWarning },
        error: { label: "Erro", cls: "border-red-500/40 bg-red-500/10 text-red-400", Icon: XCircle },
    }
    const e = map[s] ?? map.review
    const Icon = e.Icon
    return (
        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${e.cls}`}>
            <Icon className={`h-3 w-3 ${s === "analyzing" ? "animate-spin" : ""}`} /> {e.label}
        </span>
    )
}

/** O que o PDF disse sobre si mesmo — resumido para caber numa célula. */
function ResumoDocumento({ d }: { d: Detection }) {
    if (!d.analyzed_at) {
        return <span className="text-muted-foreground">arquivo ainda não lido</span>
    }
    return (
        <>
            <div className="font-medium truncate" title={d.doc_evento ?? ""}>
                {d.doc_evento || <span className="text-muted-foreground">sem nome na capa</span>}
            </div>
            <div className="text-muted-foreground">
                {TIPO_LABEL[d.doc_tipo ?? ""] ?? d.doc_tipo ?? "—"}
                {d.doc_data && ` · ${formatDataBR(d.doc_data)}`}
                {d.doc_hora && ` ${d.doc_hora}`}
            </div>
            {d.doc_criadores && d.doc_criadores.length > 0 && (
                <div className="text-muted-foreground truncate" title={d.doc_criadores.join(", ")}>
                    {d.doc_criadores.slice(0, 2).join(", ")}
                </div>
            )}
        </>
    )
}

export function DeteccoesTab() {
    const [filter, setFilter] = useState<string>("todos")
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
                        Nenhuma detecção aqui. Quando alguém compartilhar um PDF num grupo monitorado, ele aparece nesta lista.
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <th className="text-left px-4 py-2 font-medium">Recebido</th>
                                <th className="text-left px-4 py-2 font-medium">Arquivo</th>
                                <th className="text-left px-4 py-2 font-medium">O documento diz</th>
                                <th className="text-left px-4 py-2 font-medium">Leilão</th>
                                <th className="text-left px-4 py-2 font-medium">Status</th>
                                <th className="text-right px-4 py-2 font-medium">Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {detections.map(d => (
                                <tr key={d.id} className="border-t hover:bg-muted/20 align-top">
                                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                        {formatDateTime(d.received_at)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                            <span className="font-medium truncate max-w-[15rem]" title={d.file_name}>
                                                {d.file_name}
                                            </span>
                                        </div>
                                        <div className="text-[11px] text-muted-foreground mt-0.5">
                                            {formatBytes(d.file_size)}
                                            {d.doc_paginas ? ` · ${d.doc_paginas} pág` : ""}
                                            {d.group_name ? ` · ${d.sender_name || d.group_name}` : ""}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-xs max-w-[16rem]">
                                        <ResumoDocumento d={d} />
                                    </td>
                                    <td className="px-4 py-3 text-xs max-w-[18rem]">
                                        {d.cronograma ? (
                                            <>
                                                <div className="font-medium">{d.cronograma.nome}</div>
                                                <div className="text-muted-foreground">
                                                    {formatDataBR(d.cronograma.data)}
                                                    {d.match_score != null && ` · ${d.match_score}%`}
                                                </div>
                                                {d.match_reasons && d.match_reasons.length > 0 && (
                                                    <div className="text-[11px] text-green-500/80 mt-0.5">
                                                        {d.match_reasons.slice(0, 2).join(" · ")}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <span className="text-muted-foreground">
                                                {d.error || (d.match_score != null ? `melhor palpite ${d.match_score}%` : "—")}
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
    const [det, setDet] = useState<Detection>(detection)
    const [fileUrl, setFileUrl] = useState<string | null>(null)
    const [fresh, setFresh] = useState<Candidate[]>([])
    const [documentos, setDocumentos] = useState<Documento[]>([])
    const [busy, setBusy] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [searchOpen, setSearchOpen] = useState(false)

    const carregar = useCallback(async () => {
        const res = await fetch(`/api/whatsapp-catalogos/detections/${detection.id}`, { cache: "no-store" })
        if (res.ok) {
            const j = await res.json()
            setDet(j.detection ?? detection)
            setFileUrl(j.file_url ?? null)
            setFresh(j.fresh_candidates ?? [])
            setDocumentos(j.documentos ?? [])
        }
    }, [detection])

    useEffect(() => { carregar() }, [carregar])

    async function reidentificar() {
        setBusy("reidentificar"); setError(null)
        try {
            const res = await fetch(`/api/whatsapp-catalogos/detections/${detection.id}/reidentify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ forcar: det.attached }),
            })
            const j = await res.json()
            if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
            await carregar()
        } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao reidentificar")
        } finally {
            setBusy(null)
        }
    }

    async function attachTo(cronograma_id: string, principal = false) {
        setBusy(cronograma_id); setError(null)
        try {
            const res = await fetch(`/api/whatsapp-catalogos/detections/${detection.id}/attach`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cronograma_id, principal }),
            })
            const j = await res.json()
            if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
            onChanged()
        } catch (e) {
            setError(e instanceof Error ? e.message : "Falha")
            setBusy(null)
        }
    }

    async function patchDocumento(id: string, patch: Record<string, unknown>) {
        setBusy(id)
        try {
            await fetch(`/api/leilao-documentos/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            })
            await carregar()
        } finally {
            setBusy(null)
        }
    }

    async function removerDocumento(id: string) {
        if (!confirm("Remover este documento do leilão? Ele sai da página pública.")) return
        setBusy(id)
        try {
            await fetch(`/api/leilao-documentos/${id}`, { method: "DELETE" })
            await carregar()
        } finally {
            setBusy(null)
        }
    }

    async function removeDetection() {
        if (!confirm("Remover esta detecção do histórico? O arquivo permanece no Storage.")) return
        const res = await fetch(`/api/whatsapp-catalogos/detections/${detection.id}`, { method: "DELETE" })
        if (res.ok) onChanged()
    }

    const candidates = fresh.length > 0 ? fresh : (det.candidates || [])

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-[var(--surface)] text-[var(--text)] rounded-xl border border-[var(--border2)] shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-6 py-4 border-b">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h3 className="font-semibold flex items-center gap-2 truncate">
                                <FileText className="h-4 w-4 shrink-0" /> {det.file_name}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                {det.group_name} · {det.sender_name} · {formatDateTime(det.received_at)}
                            </p>
                        </div>
                        {statusBadge(det.match_status)}
                    </div>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto">
                    {error && (
                        <div className="px-3 py-2 bg-red-500/10 text-red-400 text-sm rounded">{error}</div>
                    )}

                    <div className="flex flex-wrap items-center gap-4">
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
                        <button
                            onClick={reidentificar}
                            disabled={busy === "reidentificar"}
                            className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-md border hover:bg-muted disabled:opacity-50"
                            title="Baixa o PDF de novo, relê a capa e refaz o casamento com o cronograma"
                        >
                            {busy === "reidentificar"
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <ScanSearch className="h-4 w-4" />}
                            Reidentificar pelo conteúdo
                        </button>
                    </div>

                    {/* O que foi LIDO do arquivo — a base de toda a decisão. */}
                    <div className="rounded-md border p-4">
                        <h4 className="text-sm font-semibold mb-2">O que está no arquivo</h4>
                        {det.analyzed_at ? (
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
                                <Campo rotulo="Tipo" valor={TIPO_LABEL[det.doc_tipo ?? ""] ?? det.doc_tipo} />
                                <Campo rotulo="Evento" valor={det.doc_evento} span />
                                <Campo rotulo="Data impressa" valor={det.doc_data ? formatDataBR(det.doc_data) : null} />
                                <Campo rotulo="Hora" valor={det.doc_hora} />
                                <Campo rotulo="Leiloeira" valor={det.doc_leiloeira} />
                                <Campo rotulo="Criatórios" valor={det.doc_criadores?.join(", ") ?? null} span />
                                <Campo rotulo="Local" valor={det.doc_local} />
                                <Campo rotulo="Páginas" valor={det.doc_paginas ? String(det.doc_paginas) : null} />
                                <Campo
                                    rotulo="Leitura"
                                    valor={det.doc_fonte === "texto" ? "texto do PDF"
                                        : det.doc_fonte === "ia" ? "IA (capa em imagem)"
                                            : det.doc_fonte === "texto+ia" ? "texto + IA"
                                                : det.doc_fonte}
                                />
                            </dl>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                Este arquivo ainda não foi aberto — é uma detecção de antes da leitura por conteúdo.
                                Use “Reidentificar pelo conteúdo”.
                            </p>
                        )}
                        {det.error && (
                            <p className="text-xs text-amber-400 mt-3">{det.error}</p>
                        )}
                    </div>

                    {det.attached && det.cronograma && (
                        <div className="px-3 py-2 bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded">
                            Anexado a <strong>{det.cronograma.nome}</strong> ({formatDataBR(det.cronograma.data)}).
                        </div>
                    )}

                    {documentos.length > 0 && (
                        <div>
                            <h4 className="text-sm font-semibold mb-2">Documentos deste leilão</h4>
                            <div className="space-y-1.5">
                                {documentos.map(doc => (
                                    <div key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2 border rounded-md">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-medium truncate flex items-center gap-1.5">
                                                {doc.principal && <Star className="h-3 w-3 text-amber-400 shrink-0" />}
                                                {doc.titulo}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {TIPO_LABEL[doc.tipo] ?? doc.tipo}
                                                {doc.publico ? " · aparece no site" : " · interno"}
                                                {doc.principal && " · é o catálogo principal"}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => patchDocumento(doc.id, { publico: !doc.publico })}
                                                disabled={busy === doc.id}
                                                className="p-1.5 rounded border hover:bg-muted disabled:opacity-50"
                                                title={doc.publico ? "Esconder da página pública" : "Mostrar na página pública"}
                                            >
                                                {doc.publico ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                            </button>
                                            {!doc.principal && (
                                                <button
                                                    onClick={() => patchDocumento(doc.id, { principal: true })}
                                                    disabled={busy === doc.id}
                                                    className="p-1.5 rounded border hover:bg-muted disabled:opacity-50"
                                                    title="Tornar o catálogo principal do leilão"
                                                >
                                                    <Star className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                            <a
                                                href={doc.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-1.5 rounded border hover:bg-muted"
                                                title="Abrir"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                            <button
                                                onClick={() => removerDocumento(doc.id)}
                                                disabled={busy === doc.id}
                                                className="p-1.5 rounded border hover:bg-muted text-red-400 disabled:opacity-50"
                                                title="Remover do leilão"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <h4 className="text-sm font-semibold mb-2">Candidatos do cronograma</h4>
                        {candidates.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                Nenhum leilão do cronograma corresponde a este documento. Se ele for de um leilão
                                da casa, cadastre o leilão e use “Reidentificar”, ou escolha na busca abaixo.
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
                                                {formatDataBR(c.data)} · {c.score}%
                                                {c.has_catalog && " · já tem catálogo"}
                                            </div>
                                            {c.motivos && c.motivos.length > 0 && (
                                                <div className={`text-[11px] mt-0.5 ${c.conflito_data ? "text-red-400/80" : "text-green-500/80"}`}>
                                                    {c.motivos.join(" · ")}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => attachTo(c.cronograma_id)}
                                            disabled={busy === c.cronograma_id}
                                            className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 shrink-0"
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

function Campo({ rotulo, valor, span }: { rotulo: string; valor?: string | null; span?: boolean }) {
    return (
        <div className={span ? "col-span-2" : undefined}>
            <dt className="text-muted-foreground">{rotulo}</dt>
            <dd className="font-medium break-words">{valor || "—"}</dd>
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
