"use client"

/**
 * Editor visual da sequência de uma campanha (paralelo ao editor de fluxo).
 *
 * O grafo é estritamente linear: start → mensagem (passo 0) → (esperar →
 * mensagem)* → fim. O passo 0 corresponde aos campos da própria campanha
 * (template_id/body/media_*); os passos 1..N são gravados em
 * whatsapp_campaign_steps. Carregamento e salvamento são feitos via
 * /api/whatsapp/central/campaigns/[id] e .../steps[/stepId].
 *
 * Edição completa só rola quando a campanha está em rascunho — após o
 * disparo, todo o canvas vira read-only (palette e save desabilitados,
 * side panel também).
 */

import "@xyflow/react/dist/style.css"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    Panel,
    Handle,
    Position,
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    type Connection,
    type Edge as RFEdge,
    type EdgeChange,
    type Node as RFNode,
    type NodeChange,
    type NodeProps,
} from "@xyflow/react"
import {
    PlayCircle,
    MessageSquareText,
    Clock,
    Send,
    Save,
    RotateCcw,
    Loader2,
    AlertCircle,
    CheckCircle2,
    X,
    Sparkles,
    Maximize2,
    Minimize2,
    Trash2,
    ImageIcon,
    Lock,
} from "lucide-react"
import type { Campaign, CampaignStep, CampaignDelayUnit, Template } from "./types"
import { useR2Upload } from "./useR2Upload"
import {
    buildCampaignGraph,
    flattenCampaignGraph,
    validateCampaignGraph,
    type CampaignGraph,
    type CampaignNode,
    type CampaignNodeType,
    type CampaignMessageNode,
    type CampaignWaitNode,
} from "@/lib/whatsapp-campaign-graph"

/* ─── React Flow node shape ─────────────────────────────────────────── */

interface MessageNodeData extends Record<string, unknown> {
    label: string
    isStepZero: boolean
    stepId: string | null
    template_id: string | null
    body: string | null
    media_url: string | null
    media_type: "image" | "video" | "audio" | "document" | null
    media_mime: string | null
    media_filename: string | null
    media_caption: string | null
}

interface WaitNodeData extends Record<string, unknown> {
    label: string
    delay_value: number
    delay_unit: CampaignDelayUnit
}

interface PlainNodeData extends Record<string, unknown> {
    label: string
}

type RFCampNode =
    | RFNode<MessageNodeData>
    | RFNode<WaitNodeData>
    | RFNode<PlainNodeData>

/* ─── Conversão grafo lib ↔ ReactFlow ──────────────────────────────── */

function graphToRF(graph: CampaignGraph): { nodes: RFCampNode[]; edges: RFEdge[] } {
    const nodes: RFCampNode[] = graph.nodes.map(n => {
        if (n.type === "c_message") {
            return {
                id: n.id,
                type: n.type,
                position: n.position,
                data: {
                    label: n.label ?? "Mensagem",
                    isStepZero: n.data.isStepZero ?? false,
                    stepId: n.data.stepId ?? null,
                    template_id: n.data.template_id,
                    body: n.data.body,
                    media_url: n.data.media_url,
                    media_type: n.data.media_type,
                    media_mime: n.data.media_mime,
                    media_filename: n.data.media_filename,
                    media_caption: n.data.media_caption,
                } satisfies MessageNodeData,
            } as RFNode<MessageNodeData>
        }
        if (n.type === "c_wait") {
            return {
                id: n.id,
                type: n.type,
                position: n.position,
                data: {
                    label: n.label ?? "Esperar",
                    delay_value: n.data.delay_value,
                    delay_unit: n.data.delay_unit,
                } satisfies WaitNodeData,
            } as RFNode<WaitNodeData>
        }
        return {
            id: n.id,
            type: n.type,
            position: n.position,
            data: { label: n.label ?? defaultLabelFor(n.type) } satisfies PlainNodeData,
        } as RFNode<PlainNodeData>
    })

    const edges: RFEdge[] = graph.edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        style: { stroke: "#94a3b8", strokeWidth: 1.5 },
    }))
    return { nodes, edges }
}

function rfToGraph(rfNodes: RFCampNode[], rfEdges: RFEdge[]): CampaignGraph {
    const nodes: CampaignNode[] = rfNodes.map(rf => {
        const base = { id: rf.id, position: rf.position, label: (rf.data as PlainNodeData).label }
        switch (rf.type as CampaignNodeType) {
            case "c_message": {
                const d = rf.data as MessageNodeData
                return {
                    ...base,
                    type: "c_message",
                    data: {
                        isStepZero: d.isStepZero,
                        stepId: d.stepId,
                        template_id: d.template_id,
                        body: d.body,
                        media_url: d.media_url,
                        media_type: d.media_type,
                        media_mime: d.media_mime,
                        media_filename: d.media_filename,
                        media_caption: d.media_caption,
                    },
                } as CampaignMessageNode
            }
            case "c_wait": {
                const d = rf.data as WaitNodeData
                return {
                    ...base,
                    type: "c_wait",
                    data: { delay_value: d.delay_value, delay_unit: d.delay_unit },
                } as CampaignWaitNode
            }
            case "c_start":
                return { ...base, type: "c_start" }
            case "c_end":
                return { ...base, type: "c_end" }
        }
    })
    const edges = rfEdges.map(e => ({ id: e.id, source: e.source, target: e.target }))
    return { version: 1, nodes, edges }
}

function defaultLabelFor(t: CampaignNodeType): string {
    switch (t) {
        case "c_start":   return "Início da campanha"
        case "c_message": return "Mensagem"
        case "c_wait":    return "Esperar"
        case "c_end":     return "Fim da campanha"
    }
}

/* ─── Custom nodes ──────────────────────────────────────────────────── */

const handleStyle: React.CSSProperties = {
    width: 9,
    height: 9,
    background: "var(--background, #fff)",
    border: "1.5px solid var(--muted-foreground, #64748b)",
}

function NodeShell({
    icon: Icon, type, label, sub, theme,
}: {
    icon: typeof PlayCircle
    type: string
    label: string
    sub?: string
    theme: { ring: string; bg: string; text: string; sub: string }
}) {
    return (
        <div className={`min-w-[200px] max-w-[240px] rounded-xl border border-black/10 dark:border-white/10 ring-1 ${theme.ring} ${theme.bg} ${theme.text} shadow-sm dark:shadow-black/40 px-3 py-2`}>
            <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wide ${theme.sub} opacity-80`}>
                <Icon className="h-3 w-3" />
                <span>{type}</span>
            </div>
            <div className="font-semibold text-[12px] leading-tight mt-0.5">{label}</div>
            {sub && <div className={`text-[11px] mt-0.5 leading-tight ${theme.sub}`}>{sub}</div>}
        </div>
    )
}

const THEME_START = {
    ring: "ring-slate-400/70 dark:ring-slate-400/50",
    bg:   "bg-slate-100 dark:bg-slate-800/70",
    text: "text-slate-900 dark:text-slate-100",
    sub:  "text-slate-700 dark:text-slate-300",
}
const THEME_MSG = {
    ring: "ring-emerald-400/70 dark:ring-emerald-400/50",
    bg:   "bg-emerald-50 dark:bg-emerald-900/40",
    text: "text-emerald-900 dark:text-emerald-100",
    sub:  "text-emerald-800 dark:text-emerald-200",
}
const THEME_MSG_ZERO = {
    ring: "ring-amber-400/70 dark:ring-amber-400/50",
    bg:   "bg-amber-50 dark:bg-amber-900/40",
    text: "text-amber-900 dark:text-amber-100",
    sub:  "text-amber-800 dark:text-amber-200",
}
const THEME_WAIT = {
    ring: "ring-sky-400/70 dark:ring-sky-400/50",
    bg:   "bg-sky-50 dark:bg-sky-900/40",
    text: "text-sky-900 dark:text-sky-100",
    sub:  "text-sky-800 dark:text-sky-200",
}
const THEME_END = {
    ring: "ring-slate-400/70 dark:ring-slate-400/50",
    bg:   "bg-white dark:bg-zinc-900/70",
    text: "text-slate-700 dark:text-slate-200",
    sub:  "text-slate-600 dark:text-slate-400",
}

function StartNodeView({ data }: NodeProps<RFNode<PlainNodeData>>) {
    return (
        <>
            <NodeShell icon={PlayCircle} type="início" label={data.label} sub="Disparado quando você clicar em 'Disparar' na lista de campanhas" theme={THEME_START} />
            <Handle type="source" position={Position.Bottom} style={handleStyle} />
        </>
    )
}

function MessageNodeView({ data, templates }: NodeProps<RFNode<MessageNodeData>> & { templates?: Template[] }) {
    const tplList = templates ?? []
    const tpl = data.template_id ? tplList.find(t => t.id === data.template_id) : null
    const theme = data.isStepZero ? THEME_MSG_ZERO : THEME_MSG
    const sub = data.isStepZero
        ? "Passo 0 — mensagem inicial da campanha"
        : tpl ? `Template: ${tpl.slug}`
        : data.body ? data.body.slice(0, 70) + (data.body.length > 70 ? "…" : "")
        : data.media_url ? "Mídia anexada"
        : "(sem conteúdo)"
    return (
        <>
            <Handle type="target" position={Position.Top} style={handleStyle} />
            <NodeShell icon={MessageSquareText} type={data.isStepZero ? "passo 0" : "mensagem"} label={data.label} sub={sub} theme={theme} />
            {data.media_url && (
                <div className={`absolute -top-1 -right-1 rounded-full p-0.5 ring-1 ring-emerald-500/40 bg-white dark:bg-emerald-900/60 ${theme.text}`}>
                    <ImageIcon className="h-2.5 w-2.5" />
                </div>
            )}
            <Handle type="source" position={Position.Bottom} style={handleStyle} />
        </>
    )
}

function WaitNodeView({ data }: NodeProps<RFNode<WaitNodeData>>) {
    const unitLabel = data.delay_unit === "minutes" ? "min" : data.delay_unit === "hours" ? "h" : "d"
    return (
        <>
            <Handle type="target" position={Position.Top} style={handleStyle} />
            <NodeShell icon={Clock} type="esperar" label={data.label} sub={`${data.delay_value} ${unitLabel} antes do próximo`} theme={THEME_WAIT} />
            <Handle type="source" position={Position.Bottom} style={handleStyle} />
        </>
    )
}

function EndNodeView({ data }: NodeProps<RFNode<PlainNodeData>>) {
    return (
        <>
            <Handle type="target" position={Position.Top} style={handleStyle} />
            <NodeShell icon={Send} type="fim" label={data.label} sub="Sequência termina aqui" theme={THEME_END} />
        </>
    )
}

/* ─── Componente principal ──────────────────────────────────────────── */

interface Props {
    campaignId: string
    templates: Template[]
    /** Quando o operador trocar de fluxo/campanha pelo seletor — controlado pelo pai. */
    headerExtras?: React.ReactNode
    /** Notifica o pai depois de save bem-sucedido (pra refazer a lista de campanhas). */
    onCampaignChanged?: () => void
}

export function CampanhaFlowEditor({ campaignId, templates, headerExtras, onCampaignChanged }: Props) {
    const [campaign, setCampaign] = useState<Campaign | null>(null)
    const [rfNodes, setRfNodes] = useState<RFCampNode[]>([])
    const [rfEdges, setRfEdges] = useState<RFEdge[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null)
    const [dirty, setDirty] = useState(false)
    const [fullscreen, setFullscreen] = useState(false)
    const [isDark, setIsDark] = useState(false)
    const [validation, setValidation] = useState<{ errors: string[]; warnings: string[] } | null>(null)

    const readOnly = !!campaign && campaign.status !== "rascunho"

    // Detecta dark mode (Tailwind .dark no <html>)
    useEffect(() => {
        if (typeof document === "undefined") return
        const root = document.documentElement
        const update = () => setIsDark(root.classList.contains("dark"))
        update()
        const obs = new MutationObserver(update)
        obs.observe(root, { attributes: true, attributeFilter: ["class"] })
        return () => obs.disconnect()
    }, [])

    // ESC fecha fullscreen
    useEffect(() => {
        if (!fullscreen) return
        function onKey(e: KeyboardEvent) { if (e.key === "Escape") setFullscreen(false) }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [fullscreen])

    const loadCampaign = useCallback(async () => {
        setLoading(true)
        setFeedback(null)
        try {
            const res = await fetch(`/api/whatsapp/central/campaigns/${campaignId}`, { cache: "no-store" })
            const j = await res.json()
            if (!res.ok) throw new Error(j.error || "Falha ao carregar campanha")
            const c: Campaign = j.campaign
            const steps: CampaignStep[] = j.steps ?? []
            setCampaign(c)
            const graph = buildCampaignGraph(c, steps)
            const { nodes, edges } = graphToRF(graph)
            setRfNodes(nodes)
            setRfEdges(edges)
            setDirty(false)
            setValidation(null)
            setSelectedId(null)
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Erro desconhecido"
            setFeedback({ type: "err", msg })
        } finally {
            setLoading(false)
        }
    }, [campaignId])

    useEffect(() => { loadCampaign() }, [loadCampaign])

    /* ─── Handlers de canvas ─── */
    const onNodesChange = useCallback((changes: NodeChange<RFCampNode>[]) => {
        if (readOnly) {
            // só permite seleção/posição; bloqueia add/remove
            const filtered = changes.filter(c => c.type === "position" || c.type === "select" || c.type === "dimensions")
            if (filtered.length === 0) return
            setRfNodes(nds => applyNodeChanges(filtered, nds))
            return
        }
        setRfNodes(nds => applyNodeChanges(changes, nds))
        if (changes.some(c => c.type === "position" || c.type === "remove" || c.type === "add" || c.type === "replace")) {
            setDirty(true)
        }
    }, [readOnly])

    const onEdgesChange = useCallback((changes: EdgeChange<RFEdge>[]) => {
        if (readOnly) {
            const filtered = changes.filter(c => c.type === "select")
            if (filtered.length === 0) return
            setRfEdges(eds => applyEdgeChanges(filtered, eds))
            return
        }
        setRfEdges(eds => applyEdgeChanges(changes, eds))
        if (changes.some(c => c.type === "remove" || c.type === "add")) setDirty(true)
    }, [readOnly])

    const onConnect = useCallback((params: Connection) => {
        if (readOnly) return
        const id = `e_${crypto.randomUUID().slice(0, 8)}`
        setRfEdges(eds => addEdge({
            ...params,
            id,
            style: { stroke: "#94a3b8", strokeWidth: 1.5 },
        }, eds))
        setDirty(true)
    }, [readOnly])

    const selectedNode = useMemo(
        () => rfNodes.find(n => n.id === selectedId) ?? null,
        [rfNodes, selectedId]
    )

    /**
     * Aplica patch nos dados do nó selecionado. O cast aqui é necessário porque
     * `RFCampNode` é uma union — TypeScript não consegue narrar pela `id` match,
     * mas em runtime o spread é seguro (sempre clona o `data` correto do nó
     * antes de mesclar o patch).
     */
    function updateSelectedData(patch: Record<string, unknown>) {
        if (!selectedId || readOnly) return
        setRfNodes(nds => nds.map(n => {
            if (n.id !== selectedId) return n
            return { ...n, data: { ...n.data, ...patch } } as RFCampNode
        }))
        setDirty(true)
    }

    function deleteSelected() {
        if (!selectedId || readOnly) return
        const node = rfNodes.find(n => n.id === selectedId)
        if (!node) return
        if (node.type === "c_start" || node.type === "c_end") {
            setFeedback({ type: "err", msg: `Não dá pra remover o nó "${(node.data as PlainNodeData).label}".` })
            return
        }
        if (node.type === "c_message" && (node.data as MessageNodeData).isStepZero) {
            setFeedback({ type: "err", msg: "A mensagem inicial (passo 0) é obrigatória — não pode ser removida." })
            return
        }
        setRfNodes(nds => nds.filter(n => n.id !== selectedId))
        setRfEdges(eds => eds.filter(e => e.source !== selectedId && e.target !== selectedId))
        setSelectedId(null)
        setDirty(true)
    }

    function addNode(type: "c_message" | "c_wait") {
        if (readOnly) return
        const id = `n_${crypto.randomUUID().slice(0, 8)}`
        // Posiciona ao lado dos nós existentes; o operador arrasta depois
        const maxY = rfNodes.reduce((m, n) => Math.max(m, n.position.y), 0)
        const position = { x: 380 + Math.random() * 60, y: maxY + 60 }
        const newNode: RFCampNode =
            type === "c_message"
                ? {
                    id, type, position,
                    data: {
                        label: "Follow-up",
                        isStepZero: false,
                        stepId: null,
                        template_id: null,
                        body: null,
                        media_url: null,
                        media_type: null,
                        media_mime: null,
                        media_filename: null,
                        media_caption: null,
                    } satisfies MessageNodeData,
                } as RFNode<MessageNodeData>
                : {
                    id, type, position,
                    data: { label: "Esperar", delay_value: 1, delay_unit: "days" } satisfies WaitNodeData,
                } as RFNode<WaitNodeData>
        setRfNodes(nds => [...nds, newNode])
        setSelectedId(id)
        setDirty(true)
    }

    /* ─── Salvamento ─── */

    async function handleSave() {
        if (!campaign || readOnly) return
        setSaving(true)
        setFeedback(null)
        setValidation(null)
        try {
            const graph = rfToGraph(rfNodes, rfEdges)
            const v = validateCampaignGraph(graph)
            if (!v.ok) {
                setValidation({ errors: v.errors, warnings: v.warnings })
                setFeedback({ type: "err", msg: "Não dá pra salvar — corrija os erros do fluxo." })
                return
            }
            setValidation({ errors: [], warnings: v.warnings })

            const flat = flattenCampaignGraph(graph)

            // 1) Atualiza o passo 0 (campos da própria campanha)
            const z = flat.stepZero
            const putCampaignRes = await fetch(`/api/whatsapp/central/campaigns/${campaignId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    template_id: z.template_id,
                    body: z.body,
                    media_url: z.media_url,
                    media_type: z.media_type,
                    media_mime: z.media_mime,
                    media_filename: z.media_filename,
                    media_caption: z.media_caption,
                }),
            })
            const putCampaignJson = await putCampaignRes.json().catch(() => ({}))
            if (!putCampaignRes.ok) {
                throw new Error(putCampaignJson.error || "Falha ao salvar a mensagem inicial.")
            }

            // 2) Sincroniza os steps 1..N
            //    Estratégia simples: deletar todos os steps existentes que não
            //    sobreviveram + criar os novos na ordem correta. Reaproveitar
            //    edits in-place daria menos churn de IDs mas dobraria a
            //    complexidade pra ganho marginal (campanha em rascunho não
            //    tem recipients ainda).
            // 2a) Pega steps atuais
            const stepsRes = await fetch(`/api/whatsapp/central/campaigns/${campaignId}/steps`, { cache: "no-store" })
            const stepsJson = await stepsRes.json()
            if (!stepsRes.ok) throw new Error(stepsJson.error || "Falha ao ler steps atuais")
            const currentSteps: CampaignStep[] = stepsJson.steps ?? []

            // 2b) Deleta todos os atuais (a ordem importa pouco em rascunho)
            for (const s of currentSteps) {
                const delRes = await fetch(`/api/whatsapp/central/campaigns/${campaignId}/steps/${s.id}`, { method: "DELETE" })
                if (!delRes.ok) {
                    const j = await delRes.json().catch(() => ({}))
                    throw new Error(j.error || `Falha ao remover step antigo (${s.id})`)
                }
            }

            // 2c) Cria novos na ordem do grafo
            for (const f of flat.followUps) {
                const postRes = await fetch(`/api/whatsapp/central/campaigns/${campaignId}/steps`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        delay_value: f.delay_value,
                        delay_unit: f.delay_unit,
                        template_id: f.content.template_id,
                        body: f.content.body,
                        media_url: f.content.media_url,
                        media_type: f.content.media_type,
                        media_mime: f.content.media_mime,
                        media_filename: f.content.media_filename,
                        media_caption: f.content.media_caption,
                    }),
                })
                const postJson = await postRes.json().catch(() => ({}))
                if (!postRes.ok) {
                    throw new Error(postJson.error || "Falha ao criar novo step")
                }
            }

            setFeedback({ type: "ok", msg: "Campanha salva. Volte na lista de campanhas para disparar." })
            setDirty(false)
            onCampaignChanged?.()
            // Recarrega pra pegar os novos stepIds
            await loadCampaign()
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Erro desconhecido"
            setFeedback({ type: "err", msg })
        } finally {
            setSaving(false)
        }
    }

    async function handleResetFollowUps() {
        if (readOnly) return
        if (!confirm("Resetar follow-ups? Isso remove TODOS os passos adicionais e deixa só a mensagem inicial. (Só vale após salvar.)")) return
        // Faz isso só na visualização — efetiva ao salvar
        const newNodes = rfNodes.filter(n =>
            n.type === "c_start" ||
            n.type === "c_end" ||
            (n.type === "c_message" && (n.data as MessageNodeData).isStepZero)
        )
        const startId = newNodes.find(n => n.type === "c_start")?.id ?? "c_start"
        const msgId = newNodes.find(n => n.type === "c_message")?.id ?? "c_msg_0"
        const endId = newNodes.find(n => n.type === "c_end")?.id ?? "c_end"
        const newEdges: RFEdge[] = [
            { id: `e_${startId}_${msgId}`, source: startId, target: msgId, style: { stroke: "#94a3b8", strokeWidth: 1.5 } },
            { id: `e_${msgId}_${endId}`, source: msgId, target: endId, style: { stroke: "#94a3b8", strokeWidth: 1.5 } },
        ]
        setRfNodes(newNodes)
        setRfEdges(newEdges)
        setDirty(true)
    }

    /* ─── Render ─── */

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[400px] text-zinc-500 dark:text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando campanha…
            </div>
        )
    }
    if (!campaign) {
        return (
            <div className="flex items-center justify-center h-[400px] text-rose-600 text-sm">
                Não foi possível carregar a campanha.
            </div>
        )
    }

    // nodeTypes precisa fechar sobre templates (pra MessageNodeView renderizar
    // o slug). Memoized pra não disparar warnings do ReactFlow.
    const nodeTypes = {
        c_start: StartNodeView,
        c_message: (props: NodeProps<RFNode<MessageNodeData>>) => <MessageNodeView {...props} templates={templates} />,
        c_wait: WaitNodeView,
        c_end: EndNodeView,
    } as const

    const editor = (
        <div
            className={`text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col ${
                fullscreen
                    ? "fixed inset-0 z-[9999] rounded-none bg-white dark:bg-zinc-950"
                    : "flex-1 min-h-0 rounded-xl bg-white dark:bg-zinc-900"
            }`}
        >
            <div className="px-5 py-3 border-b flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Editor de campanha
                        {dirty && <span className="text-[10px] text-amber-800 dark:text-amber-200 bg-amber-500/15 ring-1 ring-amber-500/40 px-1.5 py-0.5 rounded">não salvo</span>}
                        {readOnly && (
                            <span className="text-[10px] flex items-center gap-1 text-zinc-700 dark:text-zinc-300 bg-zinc-500/15 ring-1 ring-zinc-500/40 px-1.5 py-0.5 rounded">
                                <Lock className="h-2.5 w-2.5" /> somente leitura
                            </span>
                        )}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Editando <strong className="text-zinc-900 dark:text-zinc-100">{campaign.name}</strong> ·{" "}
                        {readOnly
                            ? `Campanha em status "${campaign.status}" — para editar, duplique em rascunho.`
                            : "A mensagem inicial e os follow-ups serão gravados ao clicar em Salvar. O disparo é feito separadamente pela aba Campanhas."}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {headerExtras}
                    <button
                        onClick={() => setFullscreen(f => !f)}
                        className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title={fullscreen ? "Sair do modo tela cheia (Esc)" : "Modo tela cheia"}
                    >
                        {fullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                        {fullscreen ? "Sair tela cheia" : "Tela cheia"}
                    </button>
                    {!readOnly && (
                        <>
                            <button
                                onClick={handleResetFollowUps}
                                className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                <RotateCcw className="h-3 w-3" />
                                Limpar follow-ups
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !dirty}
                                className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                Salvar campanha
                            </button>
                        </>
                    )}
                </div>
            </div>

            {feedback && (
                <div className={`px-5 py-2 text-xs flex items-start gap-1.5 border-b ${
                    feedback.type === "ok"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                }`}>
                    {feedback.type === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5" /> : <AlertCircle className="h-3.5 w-3.5 mt-0.5" />}
                    <span>{feedback.msg}</span>
                    <button onClick={() => setFeedback(null)} className="ml-auto opacity-60 hover:opacity-100">
                        <X className="h-3 w-3" />
                    </button>
                </div>
            )}

            {validation && (validation.errors?.length || validation.warnings?.length) ? (
                <div className="px-5 py-2 text-xs border-b bg-amber-500/10 space-y-0.5">
                    {validation.errors?.map((err, i) => (
                        <div key={`e${i}`} className="text-rose-700 dark:text-rose-300 flex items-start gap-1">
                            <AlertCircle className="h-3 w-3 mt-0.5" /> {err}
                        </div>
                    ))}
                    {validation.warnings?.map((w, i) => (
                        <div key={`w${i}`} className="text-amber-800 dark:text-amber-200 flex items-start gap-1">
                            <AlertCircle className="h-3 w-3 mt-0.5 opacity-60" /> {w}
                        </div>
                    ))}
                </div>
            ) : null}

            <div className="relative flex-1 min-h-0">
                <div className="absolute inset-0">
                    <ReactFlow
                        nodes={rfNodes}
                        edges={rfEdges}
                        nodeTypes={nodeTypes}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={(_, n) => setSelectedId(n.id)}
                        onPaneClick={() => setSelectedId(null)}
                        nodesDraggable={!readOnly}
                        nodesConnectable={!readOnly}
                        edgesFocusable={!readOnly}
                        elementsSelectable
                        fitView
                        fitViewOptions={{ padding: 0.18 }}
                        minZoom={0.3}
                        maxZoom={2}
                        proOptions={{ hideAttribution: true }}
                        colorMode={isDark ? "dark" : "light"}
                    >
                        <Background
                            variant={BackgroundVariant.Dots}
                            gap={18}
                            size={1}
                            color={isDark ? "rgba(148,163,184,0.25)" : "rgba(100,116,139,0.35)"}
                        />
                        <Controls position="bottom-left" />
                        <MiniMap
                            position="bottom-right"
                            zoomable
                            pannable
                            maskColor={isDark ? "rgba(15,23,42,0.7)" : "rgba(241,245,249,0.7)"}
                            style={{
                                background: isDark ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.92)",
                                border: `1px solid ${isDark ? "rgba(148,163,184,0.2)" : "rgba(100,116,139,0.2)"}`,
                            }}
                            nodeColor={n => {
                                switch (n.type as CampaignNodeType) {
                                    case "c_start":   return "#94a3b8"
                                    case "c_message": return "#34d399"
                                    case "c_wait":    return "#38bdf8"
                                    case "c_end":     return "#cbd5e1"
                                }
                                return "#94a3b8"
                            }}
                        />
                        {!readOnly && (
                            <Panel position="top-left">
                                <CampaignPalette onAdd={addNode} />
                            </Panel>
                        )}
                    </ReactFlow>
                </div>

                {selectedNode && (
                    <CampaignSidePanel
                        node={selectedNode}
                        templates={templates}
                        readOnly={readOnly}
                        onChangeMessage={(p) => updateSelectedData(p)}
                        onChangeWait={(p) => updateSelectedData(p)}
                        onChangeLabel={(l) => updateSelectedData({ label: l })}
                        onDelete={deleteSelected}
                        onClose={() => setSelectedId(null)}
                    />
                )}
            </div>
        </div>
    )

    if (fullscreen && typeof document !== "undefined") {
        return createPortal(editor, document.body)
    }
    return editor
}

/* ─── Palette (paleta restrita) ─────────────────────────────────────── */

function CampaignPalette({ onAdd }: { onAdd: (t: "c_message" | "c_wait") => void }) {
    return (
        <div className="bg-white/95 dark:bg-zinc-900/95 text-zinc-900 dark:text-zinc-100 backdrop-blur rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm dark:shadow-black/40 p-2 space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 px-1">Adicionar nó</div>
            <button
                type="button"
                onClick={() => onAdd("c_message")}
                className="w-full text-left text-xs flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
                <MessageSquareText className="h-3 w-3" />
                + Mensagem
            </button>
            <button
                type="button"
                onClick={() => onAdd("c_wait")}
                className="w-full text-left text-xs flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
                <Clock className="h-3 w-3" />
                + Esperar
            </button>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 px-1 pt-1 leading-snug max-w-[180px]">
                A sequência tem que alternar: Esperar antes de cada follow-up.
            </div>
        </div>
    )
}

/* ─── Side panel ────────────────────────────────────────────────────── */

function CampaignSidePanel({
    node, templates, readOnly,
    onChangeMessage, onChangeWait, onChangeLabel,
    onDelete, onClose,
}: {
    node: RFCampNode
    templates: Template[]
    readOnly: boolean
    onChangeMessage: (patch: Partial<MessageNodeData>) => void
    onChangeWait: (patch: Partial<WaitNodeData>) => void
    onChangeLabel: (label: string) => void
    onDelete: () => void
    onClose: () => void
}) {
    const type = node.type as CampaignNodeType
    const isMessage = type === "c_message"
    const isWait = type === "c_wait"

    return (
        <div className="absolute inset-y-0 right-0 z-30 w-full sm:w-[400px] bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase text-zinc-500 dark:text-zinc-400">
                        {type === "c_start" ? "início"
                        : type === "c_message" ? ((node.data as MessageNodeData).isStepZero ? "passo 0 — mensagem inicial" : "follow-up")
                        : type === "c_wait" ? "esperar"
                        : "fim"}
                    </div>
                    <div className="font-semibold text-sm truncate">{(node.data as PlainNodeData).label}</div>
                </div>
                <button onClick={onClose} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400" aria-label="Fechar">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
                <SideField label="Rótulo do nó">
                    <input
                        type="text"
                        disabled={readOnly}
                        value={(node.data as PlainNodeData).label}
                        onChange={e => onChangeLabel(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm disabled:opacity-60"
                    />
                </SideField>

                {isMessage && (
                    <MessageEditor
                        data={node.data as MessageNodeData}
                        templates={templates}
                        readOnly={readOnly}
                        onChange={onChangeMessage}
                    />
                )}

                {isWait && (
                    <WaitEditor
                        data={node.data as WaitNodeData}
                        readOnly={readOnly}
                        onChange={onChangeWait}
                    />
                )}

                {type === "c_start" && (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/40 p-2.5 rounded-md leading-relaxed">
                        A campanha é disparada manualmente pelo botão <strong>Disparar</strong> na aba <strong>Campanhas</strong>.
                        O nó de início aqui é só simbólico — não tem configuração própria.
                    </div>
                )}

                {type === "c_end" && (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/40 p-2.5 rounded-md leading-relaxed">
                        O destinatário sai da sequência aqui. A campanha continua marcada como <em>enviando</em> até que todos os destinatários cheguem ao fim (ou parem por uma das regras configuradas na aba Campanhas).
                    </div>
                )}
            </div>

            {!readOnly && (type === "c_message" || type === "c_wait") && (
                <div className="border-t p-3">
                    <button
                        onClick={onDelete}
                        disabled={type === "c_message" && (node.data as MessageNodeData).isStepZero}
                        className="w-full inline-flex items-center justify-center gap-1.5 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 text-xs font-medium border border-rose-500/30 rounded-md px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={type === "c_message" && (node.data as MessageNodeData).isStepZero ? "A mensagem inicial não pode ser removida" : undefined}
                    >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir nó
                    </button>
                </div>
            )}
        </div>
    )
}

function SideField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{label}</label>
            <div className="mt-1">{children}</div>
        </div>
    )
}

/* ─── Editor de Mensagem (passo 0 ou follow-up) ─────────────────────── */

function MessageEditor({
    data, templates, readOnly, onChange,
}: {
    data: MessageNodeData
    templates: Template[]
    readOnly: boolean
    onChange: (patch: Partial<MessageNodeData>) => void
}) {
    const { fileInputRef, uploading, uploadFile } = useR2Upload()

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        try {
            const up = await uploadFile(file)
            onChange({
                media_url: up.key,
                media_type: up.type,
                media_mime: up.mime,
                media_filename: up.filename,
            })
        } catch (e: unknown) {
            console.error("[CampanhaFlowEditor] upload:", e instanceof Error ? e.message : e)
        }
    }

    return (
        <>
            <SideField label="Template (opcional)">
                <select
                    disabled={readOnly}
                    value={data.template_id ?? ""}
                    onChange={e => onChange({ template_id: e.target.value || null })}
                    className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm disabled:opacity-60"
                >
                    <option value="">— sem template, usar texto/mídia abaixo —</option>
                    {templates
                        .filter(t => !t.archived)
                        .map(t => (
                            <option key={t.id} value={t.id}>{t.title} ({t.slug})</option>
                        ))}
                </select>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                    Se selecionado, o body abaixo é ignorado a menos que esteja preenchido (override).
                </p>
            </SideField>

            <SideField label="Texto da mensagem (override do template)">
                <textarea
                    disabled={readOnly}
                    rows={6}
                    value={data.body ?? ""}
                    onChange={e => onChange({ body: e.target.value || null })}
                    placeholder="Use {nome} pra interpolar o primeiro nome do destinatário."
                    className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm disabled:opacity-60"
                />
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                    {"Só {nome} é interpolado por destinatário. Outras chaves {…} saem como texto literal."}
                </p>
            </SideField>

            <SideField label="Mídia anexada">
                {data.media_url ? (
                    <div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950">
                        <ImageIcon className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="truncate flex-1">{data.media_filename ?? data.media_url}</span>
                        {!readOnly && (
                            <button
                                onClick={() => onChange({
                                    media_url: null, media_type: null, media_mime: null,
                                    media_filename: null, media_caption: null,
                                })}
                                className="text-rose-600 dark:text-rose-400 hover:text-rose-700"
                                title="Remover mídia"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                ) : !readOnly && (
                    <>
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            onChange={handleFile}
                        />
                        <button
                            type="button"
                            disabled={uploading}
                            onClick={() => fileInputRef.current?.click()}
                            className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed border-zinc-400 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                        >
                            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
                            {uploading ? "Enviando…" : "Enviar mídia"}
                        </button>
                    </>
                )}
            </SideField>

            {data.media_url && (
                <SideField label="Legenda da mídia (opcional)">
                    <input
                        type="text"
                        disabled={readOnly}
                        value={data.media_caption ?? ""}
                        onChange={e => onChange({ media_caption: e.target.value || null })}
                        className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm disabled:opacity-60"
                    />
                </SideField>
            )}

            {data.isStepZero && (
                <div className="text-[11px] text-amber-800 dark:text-amber-200 bg-amber-500/10 ring-1 ring-amber-500/30 rounded p-2 leading-snug">
                    <strong>Passo 0:</strong> esta é a mensagem que sai imediatamente quando você clica em Disparar na lista de campanhas. Não pode ser removida — todo destinatário recebe ela primeiro.
                </div>
            )}
        </>
    )
}

/* ─── Editor de Esperar ─────────────────────────────────────────────── */

function WaitEditor({
    data, readOnly, onChange,
}: {
    data: WaitNodeData
    readOnly: boolean
    onChange: (patch: Partial<WaitNodeData>) => void
}) {
    return (
        <>
            <SideField label="Tempo antes do próximo passo">
                <div className="flex gap-2">
                    <input
                        type="number"
                        min={0}
                        disabled={readOnly}
                        value={data.delay_value}
                        onChange={e => {
                            const v = Number.parseInt(e.target.value, 10)
                            onChange({ delay_value: Number.isFinite(v) ? Math.max(0, v) : 0 })
                        }}
                        className="w-24 px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm disabled:opacity-60"
                    />
                    <select
                        disabled={readOnly}
                        value={data.delay_unit}
                        onChange={e => onChange({ delay_unit: e.target.value as CampaignDelayUnit })}
                        className="flex-1 px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm disabled:opacity-60"
                    >
                        <option value="minutes">minuto(s)</option>
                        <option value="hours">hora(s)</option>
                        <option value="days">dia(s)</option>
                    </select>
                </div>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 leading-snug">
                    Contado a partir do envio bem-sucedido do passo anterior. O cron processa
                    com granularidade de 1-5 min (vide configuração da Vercel).
                </p>
            </SideField>
        </>
    )
}
