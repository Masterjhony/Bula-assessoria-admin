"use client"

/**
 * Editor visual do fluxo da Central WhatsApp (Path B — data-driven).
 *
 * O grafo persistido em site_settings.whatsapp_flow_v2 é carregado, exibido
 * como ReactFlow e pode ser editado livremente. Salvar dispara um POST que
 * passa pelo validateGraph antes de gravar — qualquer alteração impacta o
 * próximo inbound, porque o /api/whatsapp/inbound carrega o grafo a cada
 * mensagem e roda o interpretador.
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
    Brain,
    GitBranch,
    Wand2,
    MessageSquareText,
    Hand,
    Send,
    Save,
    RotateCcw,
    Loader2,
    Trash2,
    AlertCircle,
    CheckCircle2,
    X,
    Sparkles,
    Maximize2,
    Minimize2,
    Info,
    ChevronDown,
    ChevronUp,
    Settings2,
    Plus,
    Copy,
    CheckSquare,
    Pencil,
    Zap,
    SlidersHorizontal,
} from "lucide-react"
import type {
    ActionKind,
    ConditionExpr,
    FlowEdge as EngineEdge,
    FlowGraphV2,
    FlowNode as EngineNode,
    NodeType,
    TriggerKind,
} from "@/lib/whatsapp-flow-engine"
import {
    FLOW_SETTINGS_DEFAULTS,
    withDefaults as withSettingsDefaults,
    type FlowSettings,
} from "@/lib/whatsapp-flow-settings"
import type { Campaign, Template } from "./types"
import { CampanhaFlowEditor } from "./CampanhaFlowEditor"

/* ─── Tipos auxiliares ───────────────────────────────────────────── */

interface NodeConfig {
    expr?: ConditionExpr
    kind?: ActionKind
    tag?: string
    note?: string
    slug?: string
    dynamic?: "triagem_by_interesse"
    bot_step?: string
    fallback?: string
    contact_note?: string
    reason?: string
    /** Só usado em nós do tipo 'start'. Default = 'inbound' (backcompat). */
    trigger?: TriggerKind
}

interface RFNodeData extends Record<string, unknown> {
    label: string
    config: NodeConfig | null
}

type RFFlowNode = RFNode<RFNodeData>

/* ─── Conversão grafo persistido ↔ ReactFlow ────────────────────── */

function engineToRF(graph: FlowGraphV2): { nodes: RFFlowNode[]; edges: RFEdge[] } {
    const nodes: RFFlowNode[] = graph.nodes.map(n => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: {
            label: n.label ?? defaultLabel(n.type),
            config: ("data" in n && n.data ? { ...(n.data as NodeConfig) } : null),
        },
    }))
    const edges: RFEdge[] = graph.edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        label: e.label,
        animated: e.sourceHandle === "true" ? false : e.sourceHandle === "false" ? false : false,
        style: edgeStyle(e.sourceHandle),
        labelStyle: { fontSize: 10, fontWeight: 500 },
    }))
    return { nodes, edges }
}

function rfToEngine(graph: FlowGraphV2, rfNodes: RFFlowNode[], rfEdges: RFEdge[]): FlowGraphV2 {
    const nodes: EngineNode[] = rfNodes.map(rf => {
        const base = {
            id: rf.id,
            position: rf.position,
            label: rf.data.label,
        }
        const cfg = rf.data.config ?? undefined
        switch (rf.type as NodeType) {
            case "start":
                return {
                    ...base,
                    type: "start",
                    ...(cfg?.trigger ? { data: { trigger: cfg.trigger } } : {}),
                } as EngineNode
            case "classify":
                return { ...base, type: "classify" } as EngineNode
            case "condition":
                return { ...base, type: "condition", data: { expr: cfg?.expr ?? "lead.exists" } } as EngineNode
            case "action":
                return {
                    ...base,
                    type: "action",
                    data: { kind: cfg?.kind ?? "add_tag", tag: cfg?.tag, note: cfg?.note },
                } as EngineNode
            case "send_template":
                return {
                    ...base,
                    type: "send_template",
                    data: {
                        slug: cfg?.slug ?? "",
                        dynamic: cfg?.dynamic,
                        bot_step: cfg?.bot_step,
                        fallback: cfg?.fallback,
                        contact_note: cfg?.contact_note,
                    },
                } as EngineNode
            case "silence":
                return { ...base, type: "silence", data: { reason: cfg?.reason ?? "flow_silence" } } as EngineNode
            case "end":
                return { ...base, type: "end", data: { bot_step: cfg?.bot_step } } as EngineNode
            default:
                return { ...base, type: "end" } as EngineNode
        }
    })
    const edges: EngineEdge[] = rfEdges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        label: typeof e.label === "string" ? e.label : undefined,
    }))
    return { ...graph, nodes, edges }
}

function defaultLabel(type: NodeType): string {
    switch (type) {
        case "start":          return "Início"
        case "classify":       return "Classifica intenção"
        case "condition":      return "Condição"
        case "action":         return "Ação"
        case "send_template":  return "Enviar template"
        case "silence":        return "Silêncio"
        case "end":            return "Resposta enviada"
    }
}

function edgeStyle(handle: string | undefined): React.CSSProperties {
    // Cores escolhidas com luminância média — legíveis no claro e no escuro
    switch (handle) {
        case "true":         return { stroke: "#10b981", strokeWidth: 1.6 }
        case "false":        return { stroke: "#f87171", strokeWidth: 1.6, strokeDasharray: "4 4" }
        case "optout":       return { stroke: "#f43f5e", strokeWidth: 1.6 }
        case "resubscribe":  return { stroke: "#38bdf8", strokeWidth: 1.6 }
        case "human":        return { stroke: "#c084fc", strokeWidth: 1.6 }
        case "interest":     return { stroke: "#fbbf24", strokeWidth: 1.6 }
        case "unknown":      return { stroke: "#94a3b8", strokeWidth: 1.6 }
        default:             return { stroke: "#94a3b8", strokeWidth: 1.5 }
    }
}

/* ─── Custom nodes ────────────────────────────────────────────────── */

const NODE_THEME: Record<NodeType, { ring: string; bg: string; text: string; sub: string; icon: typeof PlayCircle }> = {
    start:         { ring: "ring-slate-400/70 dark:ring-slate-400/50",
                     bg:   "bg-slate-100 dark:bg-slate-800/70",
                     text: "text-slate-900 dark:text-slate-100",
                     sub:  "text-slate-700 dark:text-slate-300",
                     icon: PlayCircle },
    classify:      { ring: "ring-violet-400/70 dark:ring-violet-400/50",
                     bg:   "bg-violet-50 dark:bg-violet-900/40",
                     text: "text-violet-900 dark:text-violet-100",
                     sub:  "text-violet-800 dark:text-violet-200",
                     icon: Brain },
    condition:     { ring: "ring-amber-400/70 dark:ring-amber-400/50",
                     bg:   "bg-amber-50 dark:bg-amber-900/40",
                     text: "text-amber-900 dark:text-amber-100",
                     sub:  "text-amber-800 dark:text-amber-200",
                     icon: GitBranch },
    action:        { ring: "ring-blue-400/70 dark:ring-blue-400/50",
                     bg:   "bg-blue-50 dark:bg-blue-900/40",
                     text: "text-blue-900 dark:text-blue-100",
                     sub:  "text-blue-800 dark:text-blue-200",
                     icon: Wand2 },
    send_template: { ring: "ring-emerald-400/70 dark:ring-emerald-400/50",
                     bg:   "bg-emerald-50 dark:bg-emerald-900/40",
                     text: "text-emerald-900 dark:text-emerald-100",
                     sub:  "text-emerald-800 dark:text-emerald-200",
                     icon: MessageSquareText },
    silence:       { ring: "ring-zinc-400/70 dark:ring-zinc-500/50",
                     bg:   "bg-zinc-100 dark:bg-zinc-800/70",
                     text: "text-zinc-700 dark:text-zinc-200",
                     sub:  "text-zinc-600 dark:text-zinc-300",
                     icon: Hand },
    end:           { ring: "ring-slate-400/70 dark:ring-slate-400/50",
                     bg:   "bg-white dark:bg-zinc-900/70",
                     text: "text-slate-700 dark:text-slate-200",
                     sub:  "text-slate-600 dark:text-slate-400",
                     icon: Send },
}

/** Rótulo PT-BR para o tipo de nó — exibido no header de cada card. */
const NODE_TYPE_LABEL: Record<NodeType, string> = {
    start:         "início",
    classify:      "classificação",
    condition:     "condição",
    action:        "ação",
    send_template: "envia template",
    silence:       "silêncio",
    end:           "fim",
}

function NodeShell({
    type, label, sub, children,
}: { type: NodeType; label: string; sub?: string; children?: React.ReactNode }) {
    const theme = NODE_THEME[type]
    const Icon = theme.icon
    return (
        <div className={`min-w-[190px] max-w-[230px] rounded-xl border border-black/10 dark:border-white/10 ring-1 ${theme.ring} ${theme.bg} ${theme.text} shadow-sm dark:shadow-black/40 px-3 py-2`}>
            <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wide ${theme.sub} opacity-80`}>
                <Icon className="h-3 w-3" />
                <span>{NODE_TYPE_LABEL[type]}</span>
            </div>
            <div className="font-semibold text-[12px] leading-tight mt-0.5">{label}</div>
            {sub && <div className={`text-[11px] mt-0.5 leading-tight ${theme.sub}`}>{sub}</div>}
            {children}
        </div>
    )
}

// Handle dots — usam variáveis CSS pra ficarem visíveis em ambos os temas.
// O `background` aceita CSS var diretamente; cor de borda também.
const handleStyle: React.CSSProperties = {
    width: 9,
    height: 9,
    background: "var(--background, #fff)",
    border: "1.5px solid var(--muted-foreground, #64748b)",
}

const TRIGGER_BADGE: Record<TriggerKind, { label: string; cls: string; sub: string }> = {
    inbound: {
        label: "INBOUND",
        cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/30",
        sub: "Entrada do fluxo — toda inbound do VPS cai aqui",
    },
    new_lead: {
        label: "NOVO LEAD",
        cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30",
        sub: "Disparado quando o VPS pede render-welcome (lead criado no CRM)",
    },
}

function StartNodeView({ data }: NodeProps<RFFlowNode>) {
    const trigger: TriggerKind = data.config?.trigger ?? "inbound"
    const badge = TRIGGER_BADGE[trigger]
    return (
        <>
            <NodeShell type="start" label={data.label} sub={badge.sub}>
                <div className={`mt-1.5 inline-flex items-center text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded ${badge.cls}`}>
                    {badge.label}
                </div>
            </NodeShell>
            <Handle type="source" position={Position.Bottom} style={handleStyle} />
        </>
    )
}

function ClassifyNodeView({ data }: NodeProps<RFFlowNode>) {
    return (
        <>
            <Handle type="target" position={Position.Top} style={handleStyle} />
            <NodeShell type="classify" label={data.label} sub="5 saídas: opt-out / resubscribe / humano / interesse / sem match" />
            {/* 5 source handles distribuídos no rodapé */}
            <Handle id="optout"      type="source" position={Position.Bottom} style={{ ...handleStyle, left: "10%", background: "#f43f5e", border: "1.5px solid #be123c" }} />
            <Handle id="resubscribe" type="source" position={Position.Bottom} style={{ ...handleStyle, left: "30%", background: "#38bdf8", border: "1.5px solid #0369a1" }} />
            <Handle id="human"       type="source" position={Position.Bottom} style={{ ...handleStyle, left: "50%", background: "#c084fc", border: "1.5px solid #7e22ce" }} />
            <Handle id="interest"    type="source" position={Position.Bottom} style={{ ...handleStyle, left: "70%", background: "#fbbf24", border: "1.5px solid #b45309" }} />
            <Handle id="unknown"     type="source" position={Position.Bottom} style={{ ...handleStyle, left: "90%", background: "#94a3b8", border: "1.5px solid #475569" }} />
        </>
    )
}

function ConditionNodeView({ data }: NodeProps<RFFlowNode>) {
    const expr = data.config?.expr ?? "lead.exists"
    return (
        <>
            <Handle type="target" position={Position.Top} style={handleStyle} />
            <NodeShell type="condition" label={data.label} sub={`expressão: ${expr}`} />
            <Handle id="true"  type="source" position={Position.Bottom} style={{ ...handleStyle, left: "30%", background: "#10b981", border: "1.5px solid #047857" }} />
            <Handle id="false" type="source" position={Position.Bottom} style={{ ...handleStyle, left: "70%", background: "#f87171", border: "1.5px solid #b91c1c" }} />
        </>
    )
}

function ActionNodeView({ data }: NodeProps<RFFlowNode>) {
    const kind = data.config?.kind ?? "—"
    const tag = data.config?.tag
    return (
        <>
            <Handle type="target" position={Position.Top} style={handleStyle} />
            <NodeShell type="action" label={data.label} sub={tag ? `${kind} • ${tag}` : kind} />
            <Handle type="source" position={Position.Bottom} style={handleStyle} />
        </>
    )
}

function SendTemplateNodeView({ data }: NodeProps<RFFlowNode>) {
    const cfg = data.config
    const sub = cfg?.dynamic
        ? `slug dinâmico: ${cfg.dynamic}`
        : cfg?.slug ? `slug: ${cfg.slug}` : "(sem slug)"
    return (
        <>
            <Handle type="target" position={Position.Top} style={handleStyle} />
            <NodeShell type="send_template" label={data.label} sub={sub} />
            <Handle type="source" position={Position.Bottom} style={handleStyle} />
        </>
    )
}

function SilenceNodeView({ data }: NodeProps<RFFlowNode>) {
    const reason = data.config?.reason ?? "—"
    return (
        <>
            <Handle type="target" position={Position.Top} style={handleStyle} />
            <NodeShell type="silence" label={data.label} sub={`motivo: ${reason}`} />
        </>
    )
}

function EndNodeView({ data }: NodeProps<RFFlowNode>) {
    const step = data.config?.bot_step
    return (
        <>
            <Handle type="target" position={Position.Top} style={handleStyle} />
            <NodeShell type="end" label={data.label} sub={step ? `bot_step: ${step}` : undefined} />
        </>
    )
}

const NODE_TYPES = {
    start:         StartNodeView,
    classify:      ClassifyNodeView,
    condition:     ConditionNodeView,
    action:        ActionNodeView,
    send_template: SendTemplateNodeView,
    silence:       SilenceNodeView,
    end:           EndNodeView,
} as const

/* ─── Componente principal ───────────────────────────────────────── */

interface Props {
    templates: Template[]
    onTemplatesChanged: () => void
}

/** Metadados de cada fluxo na lista do seletor. O grafo completo é carregado
 * sob demanda quando o usuário escolhe um fluxo. */
interface FlowMeta {
    id: string
    name: string
    description: string | null
    is_active: boolean
    created_at: string
    updated_at: string
    last_activated_at?: string | null
    created_by?: string | null
    settings?: import('@/lib/whatsapp-flow-settings').FlowSettings
}

/**
 * Metadados mínimos de campanha pro seletor unificado. O grafo (passo 0 + steps)
 * é carregado pelo CampanhaFlowEditor sob demanda quando o operador escolhe a
 * campanha. Manter este shape em sincronia com /api/whatsapp/central/campaigns.
 */
interface CampaignMeta {
    id: string
    name: string
    status: Campaign["status"]
    steps_count?: number
}

export function FluxoTab({ templates }: Props) {
    const [flows, setFlows] = useState<FlowMeta[]>([])
    const [campaigns, setCampaigns] = useState<CampaignMeta[]>([])
    /**
     * Seleção atual do seletor unificado. `mode` decide qual editor é montado:
     *   - 'flow':     editor visual de fluxo (gatilhos inbound/new_lead)
     *   - 'campaign': editor visual de campanha (sequência linear de envios)
     *
     * Quando o operador troca de modo pelo seletor, o componente do editor
     * desmonta e o outro monta — cada um cuida do próprio carregamento.
     */
    const [mode, setMode] = useState<"flow" | "campaign">("flow")
    const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
    const [currentFlowId, setCurrentFlowId] = useState<string | null>(null)
    const [graph, setGraph] = useState<FlowGraphV2 | null>(null)
    const [rfNodes, setRfNodes] = useState<RFFlowNode[]>([])
    const [rfEdges, setRfEdges] = useState<RFEdge[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [resetting, setResetting] = useState(false)
    const [validation, setValidation] = useState<{ errors: string[]; warnings: string[] } | null>(null)
    const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null)
    const [dirty, setDirty] = useState(false)
    const [fullscreen, setFullscreen] = useState(false)
    const [triggerInfoOpen, setTriggerInfoOpen] = useState(true)
    const [isDark, setIsDark] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [flowSelectorOpen, setFlowSelectorOpen] = useState(false)

    const currentFlow = useMemo(
        () => flows.find(f => f.id === currentFlowId) ?? null,
        [flows, currentFlowId]
    )

    /** Recarrega a lista de campanhas (sem alterar a seleção atual). Best-effort
     *  — falhas não derrubam o editor de fluxo. */
    const loadCampaignsList = useCallback(async () => {
        try {
            const res = await fetch("/api/whatsapp/central/campaigns", { cache: "no-store" })
            if (!res.ok) {
                setCampaigns([])
                return
            }
            const j = await res.json()
            const list: CampaignMeta[] = (j.campaigns ?? []).map((c: Campaign) => ({
                id: c.id,
                name: c.name,
                status: c.status,
                steps_count: c.steps_count ?? 0,
            }))
            setCampaigns(list)
        } catch {
            setCampaigns([])
        }
    }, [])

    // ESC sai do modo tela cheia
    useEffect(() => {
        if (!fullscreen) return
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") setFullscreen(false)
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [fullscreen])

    // Detecta dark mode pela classe `dark` no <html> (padrão Tailwind do app).
    // O ReactFlow recebe `colorMode` correspondente — assim Controls, MiniMap
    // e Background ficam coerentes com o tema do admin.
    useEffect(() => {
        if (typeof document === "undefined") return
        const root = document.documentElement
        const update = () => setIsDark(root.classList.contains("dark"))
        update()
        const obs = new MutationObserver(update)
        obs.observe(root, { attributes: true, attributeFilter: ["class"] })
        return () => obs.disconnect()
    }, [])

    // Carrega lista de fluxos + abre o ATIVO (ou o 1º se nenhum ativo).
    // Se a tabela whatsapp_flows ainda não existir (migration não rodou),
    // cai pro endpoint legado /api/whatsapp/central/flow que opera em
    // site_settings.whatsapp_flow_v2 — mantém a UI funcional durante migração.
    const loadFlowsList = useCallback(async (selectAfter?: string | null) => {
        const res = await fetch("/api/whatsapp/central/flows", { cache: "no-store" })
        if (!res.ok) {
            // Fallback: tabela whatsapp_flows não criada ainda
            const legacyRes = await fetch("/api/whatsapp/central/flow", { cache: "no-store" })
            const legacy = await legacyRes.json()
            if (!legacyRes.ok) throw new Error(legacy.error || "Erro ao carregar fluxo")
            setFlows([])
            setCurrentFlowId(null)
            setGraph(legacy.graph)
            const { nodes, edges } = engineToRF(legacy.graph)
            setRfNodes(nodes)
            setRfEdges(edges)
            setValidation(legacy.validation ?? null)
            setDirty(false)
            return
        }
        const j = await res.json()
        const list: FlowMeta[] = j.flows ?? []
        setFlows(list)

        // Quem abrir: o id solicitado, ou o ativo, ou o primeiro
        const target = selectAfter
            ? list.find(f => f.id === selectAfter)
            : (list.find(f => f.is_active) ?? list[0])
        if (!target) {
            setCurrentFlowId(null)
            setGraph(null)
            return
        }
        await loadFlowById(target.id)
    }, [])

    async function loadFlowById(id: string) {
        const res = await fetch(`/api/whatsapp/central/flows/${id}`, { cache: "no-store" })
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || "Erro ao carregar fluxo")
        setCurrentFlowId(id)
        setGraph(j.flow.graph)
        const { nodes, edges } = engineToRF(j.flow.graph)
        setRfNodes(nodes)
        setRfEdges(edges)
        setValidation(j.validation ?? null)
        setDirty(false)
        setSelectedId(null)
    }

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setLoading(true)
            try {
                // Carrega flows + campaigns em paralelo. A lista de campanhas
                // alimenta o seletor unificado e o editor de campanha; falhas
                // dela não impedem o editor de fluxo de abrir.
                await Promise.all([loadFlowsList(), loadCampaignsList()])
            } catch (e) {
                if (cancelled) return
                const msg = e instanceof Error ? e.message : "Erro desconhecido"
                setFeedback({ type: "err", msg })
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [loadFlowsList, loadCampaignsList])

    async function handleSwitchFlow(id: string) {
        if (mode === "flow" && dirty && !confirm("Você tem alterações não salvas. Trocar de fluxo descarta? Para manter, cancele e clique em Salvar.")) {
            return
        }
        setLoading(true)
        try {
            await loadFlowById(id)
            setMode("flow")
            setSelectedCampaignId(null)
            setFlowSelectorOpen(false)
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Erro desconhecido"
            setFeedback({ type: "err", msg })
        } finally {
            setLoading(false)
        }
    }

    /**
     * Troca pro editor de campanha. Não carrega nada aqui — o CampanhaFlowEditor
     * é desmontado/remontado quando `campaignId` muda e cuida do próprio
     * fetch via /api/whatsapp/central/campaigns/[id].
     *
     * Aviso de descarte: se há mudanças não salvas no editor de fluxo, pede
     * confirmação. O editor de campanha tem o próprio `dirty` interno e
     * mostra "não salvo" no header, então a verificação aqui só cobre fluxo.
     */
    function handleSwitchCampaign(id: string) {
        if (mode === "flow" && dirty && !confirm("Você tem alterações não salvas no fluxo. Trocar pra editor de campanha descarta? Para manter, cancele e clique em Salvar.")) {
            return
        }
        setMode("campaign")
        setSelectedCampaignId(id)
        setSelectedId(null)
        setFlowSelectorOpen(false)
        setFeedback(null)
    }

    const onNodesChange = useCallback((changes: NodeChange<RFFlowNode>[]) => {
        setRfNodes(nds => applyNodeChanges(changes, nds))
        if (changes.some(c => c.type === "position" || c.type === "remove" || c.type === "add" || c.type === "replace")) {
            setDirty(true)
        }
    }, [])

    const onEdgesChange = useCallback((changes: EdgeChange<RFEdge>[]) => {
        setRfEdges(eds => applyEdgeChanges(changes, eds))
        if (changes.some(c => c.type === "remove" || c.type === "add")) setDirty(true)
    }, [])

    const onConnect = useCallback((params: Connection) => {
        const id = `e_${crypto.randomUUID().slice(0, 8)}`
        setRfEdges(eds => addEdge({
            ...params,
            id,
            style: edgeStyle(params.sourceHandle ?? undefined),
            label: params.sourceHandle ?? undefined,
            labelStyle: { fontSize: 10, fontWeight: 500 },
        }, eds))
        setDirty(true)
    }, [])

    const selectedNode = useMemo(
        () => rfNodes.find(n => n.id === selectedId) ?? null,
        [rfNodes, selectedId]
    )

    function updateSelected(patch: Partial<RFNodeData>) {
        if (!selectedId) return
        setRfNodes(nds => nds.map(n =>
            n.id === selectedId
                ? { ...n, data: { ...n.data, ...patch, config: patch.config !== undefined ? patch.config : n.data.config } }
                : n
        ))
        setDirty(true)
    }

    function updateSelectedConfig(patch: Partial<NodeConfig>) {
        if (!selectedId) return
        setRfNodes(nds => nds.map(n => {
            if (n.id !== selectedId) return n
            const newCfg = { ...(n.data.config ?? {}), ...patch }
            return { ...n, data: { ...n.data, config: newCfg } }
        }))
        setDirty(true)
    }

    function deleteSelected() {
        if (!selectedId) return
        const node = rfNodes.find(n => n.id === selectedId)
        if (node?.type === "start") {
            // Permite remover start nodes EXTRA, mas barra a remoção do último
            // start de cada gatilho. O grafo sem inbound = bot mudo; sem
            // new_lead = welcome cai no fallback hardcoded.
            const trigger = (node.data.config?.trigger ?? "inbound") as TriggerKind
            const sameTrigger = rfNodes.filter(n =>
                n.type === "start" && ((n.data.config?.trigger ?? "inbound") as TriggerKind) === trigger
            )
            if (sameTrigger.length <= 1) {
                setFeedback({
                    type: "err",
                    msg: `Não dá pra remover o único start "${trigger}". Crie outro antes ou troque o trigger deste.`,
                })
                return
            }
        }
        setRfNodes(nds => nds.filter(n => n.id !== selectedId))
        setRfEdges(eds => eds.filter(e => e.source !== selectedId && e.target !== selectedId))
        setSelectedId(null)
        setDirty(true)
    }

    function addNode(type: NodeType) {
        const id = `n_${crypto.randomUUID().slice(0, 8)}`
        const center = { x: 600 + Math.random() * 80, y: 400 + Math.random() * 80 }
        // Quando o usuário adiciona um start novo, escolhemos o trigger que
        // ainda falta no grafo (priorizando new_lead, já que inbound costuma
        // existir). Se ambos já existem, default 'new_lead' — validateGraph
        // sinaliza o conflito no save.
        const existingTriggers = new Set<TriggerKind>()
        for (const node of rfNodes) {
            if (node.type === "start") {
                existingTriggers.add((node.data.config?.trigger ?? "inbound") as TriggerKind)
            }
        }
        const nextTrigger: TriggerKind = !existingTriggers.has("new_lead")
            ? "new_lead"
            : !existingTriggers.has("inbound")
            ? "inbound"
            : "new_lead"

        const cfg: NodeConfig | null =
            type === "start" ? { trigger: nextTrigger } :
            type === "condition" ? { expr: "lead.exists" } :
            type === "action" ? { kind: "add_tag", tag: "" } :
            type === "send_template" ? { slug: "", bot_step: "" } :
            type === "silence" ? { reason: "flow_silence" } :
            type === "end" ? { bot_step: "" } :
            null
        const labelOverride =
            type === "start" && nextTrigger === "new_lead" ? "Início (novo lead)" :
            type === "start" && nextTrigger === "inbound"  ? "Início (inbound)" :
            defaultLabel(type)
        const newNode: RFFlowNode = {
            id,
            type,
            position: center,
            data: { label: labelOverride, config: cfg },
        }
        setRfNodes(nds => [...nds, newNode])
        setSelectedId(id)
        setDirty(true)
    }

    async function handleSave() {
        if (!graph) return
        setSaving(true)
        setFeedback(null)
        try {
            const updated = rfToEngine(graph, rfNodes, rfEdges)

            // PUT /flows/[id] se estamos editando um fluxo nomeado; senão
            // cai no endpoint legado (compatibilidade enquanto migration não rodou).
            const url = currentFlowId
                ? `/api/whatsapp/central/flows/${currentFlowId}`
                : "/api/whatsapp/central/flow"
            const payload = currentFlowId ? { graph: updated } : updated

            const res = await fetch(url, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            const j = await res.json()
            if (!res.ok) {
                if (j.validation) setValidation(j.validation)
                throw new Error(j.error || "Falha ao salvar")
            }
            const savedGraph = currentFlowId ? j.flow?.graph : j.graph
            if (savedGraph) {
                setGraph(savedGraph)
            }
            setValidation(j.validation ?? null)
            const activeNote = currentFlow?.is_active
                ? "O bot já está usando essa versão."
                : "Fluxo salvo. Ative-o em Configurações pra o bot usar."
            setFeedback({ type: "ok", msg: `Salvo. ${activeNote}` })
            setDirty(false)
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Erro desconhecido"
            setFeedback({ type: "err", msg })
        } finally {
            setSaving(false)
        }
    }

    async function handleReset() {
        if (!confirm("Resetar o grafo deste fluxo para o padrão? Suas alterações serão perdidas.")) return
        setResetting(true)
        setFeedback(null)
        try {
            // Resetar = sobrescrever o grafo deste fluxo com buildDefaultGraph().
            // Implementado client-side: gera o default, manda PUT pro fluxo atual.
            // Backend valida.
            const { buildDefaultGraph } = await import("@/lib/whatsapp-flow-engine")
            const def = buildDefaultGraph()
            const url = currentFlowId
                ? `/api/whatsapp/central/flows/${currentFlowId}`
                : "/api/whatsapp/central/flow"
            const payload = currentFlowId ? { graph: def } : def
            const res = await fetch(url, {
                method: currentFlowId ? "PUT" : "DELETE",
                headers: currentFlowId ? { "Content-Type": "application/json" } : undefined,
                body: currentFlowId ? JSON.stringify(payload) : undefined,
            })
            const j = await res.json()
            if (!res.ok) throw new Error(j.error || "Falha ao resetar")
            const newGraph = currentFlowId ? j.flow?.graph : j.graph
            if (newGraph) {
                setGraph(newGraph)
                const { nodes, edges } = engineToRF(newGraph)
                setRfNodes(nodes)
                setRfEdges(edges)
            }
            setValidation(null)
            setFeedback({ type: "ok", msg: "Fluxo resetado para o padrão." })
            setDirty(false)
            setSelectedId(null)
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Erro desconhecido"
            setFeedback({ type: "err", msg })
        } finally {
            setResetting(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[400px] text-zinc-500 dark:text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando fluxo…
            </div>
        )
    }

    // Modo campanha: o editor de campanha é autocontido (carrega passo 0 +
    // steps, valida, salva). Passamos o seletor unificado como headerExtras
    // pra que o operador consiga voltar pro editor de fluxo (ou trocar de
    // campanha) sem sair desta aba.
    if (mode === "campaign" && selectedCampaignId) {
        return (
            <CampanhaFlowEditor
                key={selectedCampaignId}
                campaignId={selectedCampaignId}
                templates={templates}
                onCampaignChanged={loadCampaignsList}
                headerExtras={
                    <FlowAndCampaignSelector
                        flows={flows}
                        campaigns={campaigns}
                        mode={mode}
                        currentFlowId={currentFlowId}
                        currentCampaignId={selectedCampaignId}
                        open={flowSelectorOpen}
                        onOpenChange={setFlowSelectorOpen}
                        onPickFlow={handleSwitchFlow}
                        onPickCampaign={handleSwitchCampaign}
                    />
                }
            />
        )
    }

    if (!graph) {
        return (
            <div className="flex items-center justify-center h-[400px] text-rose-600 text-sm">
                Não foi possível carregar o fluxo.
            </div>
        )
    }

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
                        <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Editor de fluxo
                        {dirty && <span className="text-[10px] text-amber-800 dark:text-amber-200 bg-amber-500/15 ring-1 ring-amber-500/40 px-1.5 py-0.5 rounded">não salvo</span>}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {currentFlow ? (
                            <>Editando <strong className="text-zinc-900 dark:text-zinc-100">{currentFlow.name}</strong>{currentFlow.is_active && <span className="ml-1 text-emerald-700 dark:text-emerald-400">(ativo)</span>}. Mudanças valem na próxima inbound após salvar.</>
                        ) : (
                            <>Cada inbound do bot executa este grafo. Edite nós, conecte handles, salve — vale na próxima mensagem.</>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {(flows.length > 0 || campaigns.length > 0) && (
                        <FlowAndCampaignSelector
                            flows={flows}
                            campaigns={campaigns}
                            mode={mode}
                            currentFlowId={currentFlowId}
                            currentCampaignId={selectedCampaignId}
                            open={flowSelectorOpen}
                            onOpenChange={setFlowSelectorOpen}
                            onPickFlow={handleSwitchFlow}
                            onPickCampaign={handleSwitchCampaign}
                        />
                    )}
                    {flows.length > 0 && currentFlow && (
                        <button
                            onClick={() => setSettingsOpen(true)}
                            className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            title="Configurações: renomear, ativar, duplicar, deletar, criar novo fluxo"
                        >
                            <Settings2 className="h-3 w-3" />
                            Configurações
                        </button>
                    )}
                    <button
                        onClick={() => setFullscreen(f => !f)}
                        className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title={fullscreen ? "Sair do modo tela cheia (Esc)" : "Modo tela cheia"}
                    >
                        {fullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                        {fullscreen ? "Sair tela cheia" : "Tela cheia"}
                    </button>
                    <button
                        onClick={handleReset}
                        disabled={resetting}
                        className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                    >
                        {resetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Resetar p/ padrão
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !dirty}
                        className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Salvar fluxo
                    </button>
                </div>
            </div>

            {settingsOpen && currentFlow && (
                <FlowSettingsModal
                    flow={currentFlow}
                    flows={flows}
                    graph={graph}
                    onClose={() => setSettingsOpen(false)}
                    onChanged={async (selectAfter) => {
                        setSettingsOpen(false)
                        await loadFlowsList(selectAfter)
                    }}
                    onFeedback={(type, msg) => setFeedback({ type, msg })}
                />
            )}

            {/* Painel "Como o welcome é disparado" — documenta os DOIS gatilhos
                da 1ª mensagem (LP/admin via dispatchWelcome + inbound desconhecido
                via este grafo), além do gate de pausa global. O engine só roda
                no caminho inbound — mas operadores precisam enxergar o sistema
                inteiro pra fazer ajustes manuais com confiança. */}
            <TriggerInfoPanel open={triggerInfoOpen} onToggle={() => setTriggerInfoOpen(o => !o)} />

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
                {/* Wrapper absolute inset-0: dá ao ReactFlow dimensões explícitas
                 * desde a primeira medição (sem isso, em layout flex o fitView
                 * roda com viewport 0x0 e os nós ficam fora da tela). */}
                <div className="absolute inset-0">
                    <ReactFlow
                        nodes={rfNodes}
                        edges={rfEdges}
                        nodeTypes={NODE_TYPES}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={(_, n) => setSelectedId(n.id)}
                        onPaneClick={() => setSelectedId(null)}
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
                                const t = n.type as NodeType
                                const palette: Record<NodeType, string> = {
                                    start:         "#94a3b8",
                                    classify:      "#a78bfa",
                                    condition:     "#fbbf24",
                                    action:        "#60a5fa",
                                    send_template: "#34d399",
                                    silence:       "#71717a",
                                    end:           "#cbd5e1",
                                }
                                return palette[t] ?? "#94a3b8"
                            }}
                        />
                        <Panel position="top-left">
                            <Palette onAdd={addNode} />
                        </Panel>
                    </ReactFlow>
                </div>

                {selectedNode && (
                    <SidePanel
                        node={selectedNode}
                        templates={templates}
                        onChangeLabel={l => updateSelected({ label: l })}
                        onChangeConfig={updateSelectedConfig}
                        onDelete={deleteSelected}
                        onClose={() => setSelectedId(null)}
                    />
                )}
            </div>
        </div>
    )

    // Em fullscreen, renderiza no body via Portal pra escapar de qualquer
    // stacking context da árvore (navbar do admin, max-w wrappers, etc).
    if (fullscreen && typeof document !== "undefined") {
        return createPortal(editor, document.body)
    }
    return editor
}

/* ─── Flow Selector (dropdown) ─────────────────────────────────── */

/**
 * Seletor unificado: lista fluxos (whatsapp_flows) e campanhas
 * (whatsapp_campaigns) em dois grupos no mesmo dropdown. O label do botão
 * reflete a seleção atual ("Fluxo: X" ou "Campanha: Y"). Quando clica num
 * fluxo, o pai troca pra modo flow; quando clica numa campanha, troca pra
 * modo campaign — cada modo monta um editor diferente.
 *
 * Status da campanha aparece como badge (rascunho/enviando/concluída/etc).
 * Só rascunhos são editáveis — o editor de campanha entra em read-only nos
 * outros casos, mas continua acessível pra visualização.
 */
function FlowAndCampaignSelector({
    flows, campaigns, mode, currentFlowId, currentCampaignId,
    open, onOpenChange, onPickFlow, onPickCampaign,
}: {
    flows: FlowMeta[]
    campaigns: CampaignMeta[]
    mode: "flow" | "campaign"
    currentFlowId: string | null
    currentCampaignId: string | null
    open: boolean
    onOpenChange: (v: boolean) => void
    onPickFlow: (id: string) => void
    onPickCampaign: (id: string) => void
}) {
    const currentFlow = flows.find(f => f.id === currentFlowId)
    const currentCampaign = campaigns.find(c => c.id === currentCampaignId)

    const buttonLabel = mode === "campaign" && currentCampaign
        ? `Campanha: ${currentCampaign.name}`
        : `Fluxo: ${currentFlow?.name ?? "—"}`

    return (
        <div className="relative">
            <button
                onClick={() => onOpenChange(!open)}
                className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 min-w-[220px] justify-between"
                title="Trocar fluxo ou campanha"
            >
                <span className="flex items-center gap-1.5 min-w-0">
                    <span className="font-medium truncate">{buttonLabel}</span>
                    {mode === "flow" && currentFlow?.is_active && (
                        <span className="text-[9px] uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-1 rounded">ativo</span>
                    )}
                    {mode === "campaign" && currentCampaign && (
                        <span className={`text-[9px] uppercase font-bold tracking-wider px-1 rounded ${campaignStatusBadge(currentCampaign.status)}`}>
                            {currentCampaign.status}
                        </span>
                    )}
                </span>
                <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} />
                    <div className="absolute right-0 mt-1 w-80 max-h-96 overflow-auto bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 rounded-md border border-zinc-200 dark:border-zinc-800 shadow-xl z-50 py-1">
                        {flows.length > 0 && (
                            <>
                                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-semibold">
                                    Fluxos (inbound)
                                </div>
                                {flows.map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => onPickFlow(f.id)}
                                        className={`w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs flex items-start gap-2 ${
                                            mode === "flow" && f.id === currentFlowId ? "bg-zinc-100 dark:bg-zinc-800/70" : ""
                                        }`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium flex items-center gap-1.5">
                                                <span className="truncate">{f.name}</span>
                                                {f.is_active && (
                                                    <span className="text-[9px] uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-1 rounded">ativo</span>
                                                )}
                                            </div>
                                            {f.description && (
                                                <div className="text-zinc-500 dark:text-zinc-400 text-[10px] truncate mt-0.5">{f.description}</div>
                                            )}
                                        </div>
                                        {mode === "flow" && f.id === currentFlowId && <CheckSquare className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />}
                                    </button>
                                ))}
                            </>
                        )}
                        {campaigns.length > 0 && (
                            <>
                                <div className="px-3 py-1 mt-1 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-semibold border-t border-zinc-200 dark:border-zinc-800 pt-2">
                                    Campanhas (envio em massa)
                                </div>
                                {campaigns.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => onPickCampaign(c.id)}
                                        className={`w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs flex items-start gap-2 ${
                                            mode === "campaign" && c.id === currentCampaignId ? "bg-zinc-100 dark:bg-zinc-800/70" : ""
                                        }`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium flex items-center gap-1.5">
                                                <span className="truncate">{c.name}</span>
                                                <span className={`text-[9px] uppercase font-bold tracking-wider px-1 rounded ${campaignStatusBadge(c.status)}`}>
                                                    {c.status}
                                                </span>
                                            </div>
                                            {(c.steps_count ?? 0) > 0 && (
                                                <div className="text-zinc-500 dark:text-zinc-400 text-[10px] mt-0.5">
                                                    +{c.steps_count} follow-up{(c.steps_count ?? 0) > 1 ? "s" : ""}
                                                </div>
                                            )}
                                        </div>
                                        {mode === "campaign" && c.id === currentCampaignId && <CheckSquare className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />}
                                    </button>
                                ))}
                            </>
                        )}
                        {flows.length === 0 && campaigns.length === 0 && (
                            <div className="px-3 py-4 text-xs text-zinc-500 dark:text-zinc-400 italic text-center">
                                Nenhum fluxo ou campanha disponível.
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}

function campaignStatusBadge(status: Campaign["status"]): string {
    switch (status) {
        case "rascunho":  return "text-zinc-700 dark:text-zinc-300 bg-zinc-500/15"
        case "enviando":  return "text-amber-700 dark:text-amber-300 bg-amber-500/15"
        case "concluida": return "text-emerald-700 dark:text-emerald-300 bg-emerald-500/15"
        case "cancelada": return "text-rose-700 dark:text-rose-300 bg-rose-500/15"
        case "erro":      return "text-rose-700 dark:text-rose-300 bg-rose-500/15"
    }
}

/* ─── Flow Settings Modal ──────────────────────────────────────── */

type SettingsTab = "geral" | "gatilhos" | "parametros"

function FlowSettingsModal({
    flow, flows, graph, onClose, onChanged, onFeedback,
}: {
    flow: FlowMeta
    flows: FlowMeta[]
    graph: FlowGraphV2 | null
    onClose: () => void
    onChanged: (selectAfter?: string | null) => void | Promise<void>
    onFeedback: (type: "ok" | "err", msg: string) => void
}) {
    const [tab, setTab] = useState<SettingsTab>("geral")
    const [name, setName] = useState(flow.name)
    const [description, setDescription] = useState(flow.description ?? "")
    const [settings, setSettings] = useState<FlowSettings>(flow.settings ?? {})
    const [busy, setBusy] = useState(false)
    const [createOpen, setCreateOpen] = useState(false)

    const metaDirty =
        name.trim() !== flow.name || description !== (flow.description ?? "")
    const settingsDirty = useMemo(() => {
        const a = JSON.stringify(flow.settings ?? {})
        const b = JSON.stringify(settings ?? {})
        return a !== b
    }, [flow.settings, settings])

    async function handleSaveGeral() {
        if (!name.trim() || !metaDirty) return
        setBusy(true)
        try {
            const res = await fetch(`/api/whatsapp/central/flows/${flow.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
            })
            const j = await res.json()
            if (!res.ok) throw new Error(j.error || "Falha ao salvar")
            onFeedback("ok", "Fluxo atualizado.")
            await onChanged(flow.id)
        } catch (e) {
            onFeedback("err", e instanceof Error ? e.message : "Erro desconhecido")
        } finally { setBusy(false) }
    }

    async function handleSaveSettings() {
        if (!settingsDirty) return
        setBusy(true)
        try {
            const res = await fetch(`/api/whatsapp/central/flows/${flow.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ settings }),
            })
            const j = await res.json()
            if (!res.ok) throw new Error(j.error || "Falha ao salvar")
            onFeedback("ok", "Parâmetros salvos.")
            await onChanged(flow.id)
        } catch (e) {
            onFeedback("err", e instanceof Error ? e.message : "Erro desconhecido")
        } finally { setBusy(false) }
    }

    async function handleActivate() {
        if (flow.is_active) return
        if (!confirm(`Ativar "${flow.name}"? Isso desativa o fluxo atual e o bot passa a usar este na próxima inbound.`)) return
        setBusy(true)
        try {
            const res = await fetch(`/api/whatsapp/central/flows/${flow.id}/activate`, { method: "POST" })
            const j = await res.json()
            if (!res.ok) throw new Error(j.error || "Falha ao ativar")
            onFeedback("ok", `"${flow.name}" agora é o fluxo ativo.`)
            await onChanged(flow.id)
        } catch (e) {
            onFeedback("err", e instanceof Error ? e.message : "Erro desconhecido")
        } finally { setBusy(false) }
    }

    async function handleDuplicate() {
        const newName = prompt("Nome do novo fluxo (cópia):", `${flow.name} (cópia)`)
        if (!newName?.trim()) return
        setBusy(true)
        try {
            const res = await fetch(`/api/whatsapp/central/flows`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newName.trim(), clone_from: flow.id }),
            })
            const j = await res.json()
            if (!res.ok) throw new Error(j.error || "Falha ao duplicar")
            onFeedback("ok", `"${newName}" criado a partir de "${flow.name}".`)
            await onChanged(j.flow.id)
        } catch (e) {
            onFeedback("err", e instanceof Error ? e.message : "Erro desconhecido")
        } finally { setBusy(false) }
    }

    async function handleDelete() {
        if (flow.is_active) {
            onFeedback("err", "Não dá pra deletar o fluxo ativo. Ative outro antes.")
            return
        }
        if (flows.length <= 1) {
            onFeedback("err", "Não dá pra deletar o último fluxo restante.")
            return
        }
        if (!confirm(`Deletar "${flow.name}"? Esta ação não pode ser desfeita.`)) return
        setBusy(true)
        try {
            const res = await fetch(`/api/whatsapp/central/flows/${flow.id}`, { method: "DELETE" })
            const j = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(j.error || "Falha ao deletar")
            onFeedback("ok", `"${flow.name}" removido.`)
            await onChanged(null)
        } catch (e) {
            onFeedback("err", e instanceof Error ? e.message : "Erro desconhecido")
        } finally { setBusy(false) }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <Settings2 className="h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                            <h3 className="font-semibold leading-tight truncate">Configurações de fluxo</h3>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                {flow.name}
                                {flow.is_active && <span className="ml-1.5 text-[9px] uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-1 rounded">ativo</span>}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 shrink-0">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 px-3 pt-2 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
                    <TabButton active={tab === "geral"} onClick={() => setTab("geral")} icon={<Info className="h-3.5 w-3.5" />}>Geral</TabButton>
                    <TabButton active={tab === "gatilhos"} onClick={() => setTab("gatilhos")} icon={<Zap className="h-3.5 w-3.5" />}>Gatilhos</TabButton>
                    <TabButton active={tab === "parametros"} onClick={() => setTab("parametros")} icon={<SlidersHorizontal className="h-3.5 w-3.5" />}>Parâmetros</TabButton>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto px-5 py-4">
                    {tab === "geral" && (
                        <GeralPanel
                            flow={flow}
                            flows={flows}
                            name={name} setName={setName}
                            description={description} setDescription={setDescription}
                            metaDirty={metaDirty}
                            busy={busy}
                            onSave={handleSaveGeral}
                            onActivate={handleActivate}
                            onDuplicate={handleDuplicate}
                            onCreateNew={() => setCreateOpen(true)}
                            onDelete={handleDelete}
                        />
                    )}
                    {tab === "gatilhos" && (
                        <GatilhosPanel graph={graph} />
                    )}
                    {tab === "parametros" && (
                        <ParametrosPanel
                            settings={settings}
                            onChange={setSettings}
                            dirty={settingsDirty}
                            busy={busy}
                            onSave={handleSaveSettings}
                            onReset={() => setSettings({})}
                        />
                    )}
                </div>
            </div>

            {createOpen && (
                <FlowCreateModal
                    flows={flows}
                    onClose={() => setCreateOpen(false)}
                    onCreated={async (newId) => {
                        setCreateOpen(false)
                        onFeedback("ok", "Fluxo criado.")
                        await onChanged(newId)
                    }}
                    onError={msg => onFeedback("err", msg)}
                />
            )}
        </div>
    )
}

/* ─── Tab Button ─────────────────────────────────────────────────── */

function TabButton({ active, onClick, icon, children }: {
    active: boolean
    onClick: () => void
    icon: React.ReactNode
    children: React.ReactNode
}) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-md inline-flex items-center gap-1.5 border-b-2 transition-colors ${
                active
                    ? "border-amber-600 text-amber-700 dark:text-amber-400"
                    : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
        >
            {icon}
            {children}
        </button>
    )
}

/* ─── Aba "Geral" ────────────────────────────────────────────────── */

function GeralPanel({
    flow, flows, name, setName, description, setDescription, metaDirty, busy,
    onSave, onActivate, onDuplicate, onCreateNew, onDelete,
}: {
    flow: FlowMeta
    flows: FlowMeta[]
    name: string
    setName: (v: string) => void
    description: string
    setDescription: (v: string) => void
    metaDirty: boolean
    busy: boolean
    onSave: () => void
    onActivate: () => void
    onDuplicate: () => void
    onCreateNew: () => void
    onDelete: () => void
}) {
    const fmt = (iso?: string | null) => {
        if (!iso) return "—"
        try { return new Date(iso).toLocaleString("pt-BR") } catch { return iso }
    }
    return (
        <div className="space-y-5">
            <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <Pencil className="h-3 w-3" /> Identificação
                </h4>
                <div>
                    <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Nome do fluxo</label>
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Ex: Padrão, Campanha leilões, Black Friday"
                        className="w-full mt-1 px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                    />
                </div>
                <div>
                    <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Descrição</label>
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Explica pra que serve este fluxo, em que contexto ativar etc."
                        rows={2}
                        className="w-full mt-1 px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                    />
                </div>
                <button
                    onClick={onSave}
                    disabled={busy || !name.trim() || !metaDirty}
                    className="text-xs px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    Salvar nome/descrição
                </button>
            </section>

            <section className="space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Metadados</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
                    <MetaRow label="Status">
                        {flow.is_active ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Ativo
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" /> Inativo (rascunho)
                            </span>
                        )}
                    </MetaRow>
                    <MetaRow label="ID interno">
                        <code className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate">{flow.id}</code>
                    </MetaRow>
                    <MetaRow label="Criado em">{fmt(flow.created_at)}</MetaRow>
                    <MetaRow label="Última edição">{fmt(flow.updated_at)}</MetaRow>
                    <MetaRow label="Última ativação">{fmt(flow.last_activated_at)}</MetaRow>
                    <MetaRow label="Total de fluxos">{flows.length}</MetaRow>
                </div>
            </section>

            <section className="space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Ações</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                        onClick={onActivate}
                        disabled={busy || flow.is_active}
                        className="text-sm px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 justify-center"
                        title={flow.is_active ? "Este fluxo já é o ativo" : "Tornar este o fluxo ativo do bot"}
                    >
                        <CheckSquare className="h-3.5 w-3.5" />
                        {flow.is_active ? "Já é o ativo" : "Ativar este fluxo"}
                    </button>
                    <button
                        onClick={onDuplicate}
                        disabled={busy}
                        className="text-sm px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 justify-center"
                    >
                        <Copy className="h-3.5 w-3.5" />
                        Duplicar
                    </button>
                    <button
                        onClick={onCreateNew}
                        disabled={busy}
                        className="text-sm px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 justify-center"
                        title="Criar um fluxo novo a partir do default em código"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Criar novo fluxo
                    </button>
                    <button
                        onClick={onDelete}
                        disabled={busy || flow.is_active || flows.length <= 1}
                        className="text-sm px-3 py-2 rounded-md border border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 justify-center"
                        title={flow.is_active ? "Não dá pra deletar o ativo" : flows.length <= 1 ? "Precisa ter mais de um fluxo" : "Remover este fluxo"}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Deletar
                    </button>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pt-1">
                    Apenas <strong>um fluxo é ativo</strong> por vez. Edite quantos quiser em paralelo e troque o ativo quando estiver pronto — o bot pega a mudança na próxima inbound.
                </p>
            </section>
        </div>
    )
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-2 px-2.5 py-1.5 rounded-md bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 min-w-0">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 shrink-0">{label}</span>
            <span className="text-zinc-900 dark:text-zinc-100 truncate text-right min-w-0">{children}</span>
        </div>
    )
}

/* ─── Aba "Gatilhos" ─────────────────────────────────────────────── */

function GatilhosPanel({ graph }: { graph: FlowGraphV2 | null }) {
    // Conta start nodes por trigger no grafo atual
    const starts = useMemo(() => {
        if (!graph) return { inbound: 0, new_lead: 0 }
        let inbound = 0, newLead = 0
        for (const n of graph.nodes) {
            if (n.type !== "start") continue
            const t = (n as { data?: { trigger?: string } }).data?.trigger ?? "inbound"
            if (t === "new_lead") newLead++
            else inbound++
        }
        return { inbound, new_lead: newLead }
    }, [graph])

    const total = starts.inbound + starts.new_lead

    return (
        <div className="space-y-4">
            <p className="text-[12px] text-zinc-600 dark:text-zinc-300">
                Cada gatilho é um ponto de entrada do grafo. Adicione um nó <strong>Início (gatilho)</strong>{" "}
                no editor e escolha o tipo no painel lateral — o engine usa o subgrafo correspondente
                quando esse evento acontece.
            </p>

            <div className="space-y-2">
                <TriggerRow
                    code="inbound"
                    title="Mensagem recebida"
                    desc="Toda inbound encaminhada pelo VPS pra /api/whatsapp/inbound."
                    activeCount={starts.inbound}
                    state="active"
                />
                <TriggerRow
                    code="new_lead"
                    title="Novo lead capturado"
                    desc="LP, admin ou Sheets criou um lead — VPS pede o welcome via /render-welcome."
                    activeCount={starts.new_lead}
                    state="active"
                />
                <TriggerRow
                    code="campaign_reply"
                    title="Resposta a campanha"
                    desc="Lead respondeu a uma mensagem de campanha. Hoje tratado em handleCampaignReply (lib separada)."
                    activeCount={0}
                    state="pending"
                />
                <TriggerRow
                    code="manual_start"
                    title="Disparo manual"
                    desc="Operador inicia um fluxo de fora do CRM (UI futura, ainda não exposta)."
                    activeCount={0}
                    state="pending"
                />
                <TriggerRow
                    code="group_command"
                    title="Comando em grupo (/ia, /tarefa…)"
                    desc="Comandos de grupo do WhatsApp. Hoje implementados como endpoints próprios — não passam pelo grafo."
                    activeCount={0}
                    state="external"
                />
            </div>

            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3 text-[11px] space-y-1">
                <div className="font-semibold text-zinc-700 dark:text-zinc-200">Resumo do grafo atual</div>
                <div className="text-zinc-600 dark:text-zinc-300">
                    {total === 0
                        ? "Nenhum nó de Início configurado — o engine não tem por onde começar."
                        : `${total} ${total === 1 ? "ponto de entrada" : "pontos de entrada"} configurados (${starts.inbound} inbound, ${starts.new_lead} new_lead).`}
                </div>
            </div>
        </div>
    )
}

function TriggerRow({
    code, title, desc, activeCount, state,
}: {
    code: string
    title: string
    desc: string
    activeCount: number
    state: "active" | "pending" | "external"
}) {
    const stateChip = {
        active: { label: "ativo", cls: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/15" },
        pending: { label: "em breve", cls: "text-amber-700 dark:text-amber-400 bg-amber-500/15" },
        external: { label: "externo", cls: "text-sky-700 dark:text-sky-400 bg-sky-500/15" },
    }[state]
    return (
        <div className="flex items-start gap-3 p-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40">
            <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 shrink-0 mt-0.5">{code}</code>
            <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium leading-tight">{title}</div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{desc}</div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${stateChip.cls}`}>
                    {stateChip.label}
                </span>
                {state === "active" && (
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        {activeCount === 0 ? "0 starts no grafo" : `${activeCount} start${activeCount > 1 ? "s" : ""}`}
                    </span>
                )}
            </div>
        </div>
    )
}

/* ─── Aba "Parâmetros" ───────────────────────────────────────────── */

function ParametrosPanel({
    settings, onChange, dirty, busy, onSave, onReset,
}: {
    settings: FlowSettings
    onChange: (s: FlowSettings) => void
    dirty: boolean
    busy: boolean
    onSave: () => void
    onReset: () => void
}) {
    // Helper que reescreve uma chave do settings preservando o resto.
    const patch = <K extends keyof FlowSettings>(key: K, value: FlowSettings[K]) => {
        const next = { ...settings, [key]: value }
        if (value === undefined || value === null || value === "" || (typeof value === "number" && Number.isNaN(value))) {
            delete next[key]
        }
        onChange(next)
    }
    const merged = withSettingsDefaults(settings)

    return (
        <div className="space-y-5">
            <p className="text-[12px] text-zinc-600 dark:text-zinc-300">
                Parâmetros aplicados <strong>antes</strong> de rodar o grafo. Mudam o comportamento global do fluxo
                (compliance, anti-spam, horário de operação) sem precisar editar nós.
            </p>

            <section className="space-y-3">
                <SectionHead>Welcome &amp; menu</SectionHead>
                <ParamRow
                    title="Dedup do welcome (horas)"
                    desc="Não reenvia welcome se o número recebeu nas últimas N horas."
                    status="active"
                >
                    <NumberInput
                        value={merged.welcome_dedup_hours}
                        onChange={v => patch("welcome_dedup_hours", v)}
                        min={1}
                        max={720}
                        suffix="h"
                    />
                </ParamRow>
                <ParamRow
                    title="Enviar welcome em 'sem match'"
                    desc="Quando o classifier não reconhece a 1ª mensagem, dispara welcome."
                    status="active"
                >
                    <Toggle
                        checked={merged.send_welcome_on_unknown}
                        onChange={v => patch("send_welcome_on_unknown", v)}
                    />
                </ParamRow>
                <ParamRow
                    title="Tag 'menu enviado'"
                    desc="Tag aplicada ao lead após enviar o menu — usada como gate p/ não repetir."
                    status="active"
                >
                    <TextInput
                        value={merged.menu_sent_tag}
                        onChange={v => patch("menu_sent_tag", v)}
                        placeholder={FLOW_SETTINGS_DEFAULTS.menu_sent_tag}
                        mono
                    />
                </ParamRow>
                <ParamRow
                    title="Template fallback"
                    desc="Slug usado se o template resolvido pelo grafo não existir no banco."
                    status="active"
                >
                    <TextInput
                        value={merged.fallback_template}
                        onChange={v => patch("fallback_template", v)}
                        placeholder={FLOW_SETTINGS_DEFAULTS.fallback_template}
                        mono
                    />
                </ParamRow>
                <ParamRow
                    title="Reenviar menu depois de X dias"
                    desc="Se o lead já recebeu menu há mais que X dias, reenvia. 0 = nunca reenviar."
                    status="pending"
                >
                    <NumberInput
                        value={merged.resend_menu_after_days}
                        onChange={v => patch("resend_menu_after_days", v)}
                        min={0}
                        max={365}
                        suffix="dias"
                    />
                </ParamRow>
                <ParamRow
                    title="Lead com interesse já definido recebe menu?"
                    desc="Se ON, mesmo lead com interesse_principal preenchido recebe o welcome de novo."
                    status="pending"
                >
                    <Toggle
                        checked={merged.send_menu_if_interest_already_set}
                        onChange={v => patch("send_menu_if_interest_already_set", v)}
                    />
                </ParamRow>
            </section>

            <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <SectionHead>Rate limit (anti-spam)</SectionHead>
                <ParamRow
                    title="Máximo de respostas auto/lead/dia"
                    desc="Após N respostas automáticas no mesmo dia, fica em silêncio. 0 = sem limite."
                    status="pending"
                >
                    <NumberInput
                        value={merged.max_auto_replies_per_lead_per_day}
                        onChange={v => patch("max_auto_replies_per_lead_per_day", v)}
                        min={0}
                        max={50}
                        suffix="msgs"
                    />
                </ParamRow>
                <ParamRow
                    title="Intervalo mínimo entre respostas (min)"
                    desc="Se a última resposta foi há menos de N min, fica em silêncio."
                    status="pending"
                >
                    <NumberInput
                        value={merged.min_interval_minutes_between_replies}
                        onChange={v => patch("min_interval_minutes_between_replies", v)}
                        min={0}
                        max={1440}
                        suffix="min"
                    />
                </ParamRow>
            </section>

            <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <SectionHead>Horário de operação</SectionHead>
                <ParamRow
                    title="Restringir automação a um horário"
                    desc="Fora da janela definida, inbound logado mas sem resposta automática. Operador segue respondendo manual."
                    status="active"
                >
                    <Toggle
                        checked={merged.allowed_hours_enabled}
                        onChange={v => patch("allowed_hours_enabled", v)}
                    />
                </ParamRow>
                <ParamRow
                    title="Janela permitida"
                    desc="Início e fim no fuso configurado abaixo. Suporta cruzar meia-noite (ex: 22:00 → 06:00)."
                    status="active"
                    disabled={!merged.allowed_hours_enabled}
                >
                    <div className="flex items-center gap-1.5">
                        <TimeInput
                            value={merged.allowed_hours_start}
                            onChange={v => patch("allowed_hours_start", v)}
                            disabled={!merged.allowed_hours_enabled}
                        />
                        <span className="text-zinc-500 text-xs">até</span>
                        <TimeInput
                            value={merged.allowed_hours_end}
                            onChange={v => patch("allowed_hours_end", v)}
                            disabled={!merged.allowed_hours_enabled}
                        />
                    </div>
                </ParamRow>
                <ParamRow
                    title="Fuso horário"
                    desc="IANA timezone — afeta o cálculo da janela acima."
                    status="active"
                    disabled={!merged.allowed_hours_enabled}
                >
                    <TextInput
                        value={merged.timezone}
                        onChange={v => patch("timezone", v)}
                        placeholder={FLOW_SETTINGS_DEFAULTS.timezone}
                        mono
                        disabled={!merged.allowed_hours_enabled}
                    />
                </ParamRow>
            </section>

            <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <SectionHead>Handoff &amp; opt-out</SectionHead>
                <ParamRow
                    title="Opt-out bloqueia automação (compliance)"
                    desc="Lead com opt-out NUNCA recebe automação. Recomendado manter ON."
                    status="active"
                >
                    <Toggle
                        checked={merged.optout_blocks_automation}
                        onChange={v => patch("optout_blocks_automation", v)}
                    />
                </ParamRow>
                <ParamRow
                    title="Handoff humano bloqueia automação"
                    desc="Lead em conversa com humano não recebe mais respostas do bot."
                    status="active"
                >
                    <Toggle
                        checked={merged.handoff_blocks_automation}
                        onChange={v => patch("handoff_blocks_automation", v)}
                    />
                </ParamRow>
                <ParamRow
                    title="Handoff expira em X horas"
                    desc="Após X horas sem atividade, devolve o lead pra automação. 0 = nunca expira."
                    status="pending"
                >
                    <NumberInput
                        value={merged.handoff_auto_expire_hours}
                        onChange={v => patch("handoff_auto_expire_hours", v)}
                        min={0}
                        max={720}
                        suffix="h"
                    />
                </ParamRow>
            </section>

            {/* Footer ações */}
            <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 flex items-center justify-between gap-2">
                <button
                    onClick={onReset}
                    disabled={busy}
                    className="text-xs px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center gap-1.5"
                    title="Limpa todas as configurações e volta pros defaults em código"
                >
                    <RotateCcw className="h-3 w-3" />
                    Restaurar defaults
                </button>
                <button
                    onClick={onSave}
                    disabled={busy || !dirty}
                    className="text-xs px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Salvar parâmetros
                </button>
            </div>
        </div>
    )
}

/* ─── Param Row primitivos ───────────────────────────────────────── */

function SectionHead({ children }: { children: React.ReactNode }) {
    return (
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{children}</h4>
    )
}

function ParamRow({
    title, desc, status, disabled, children,
}: {
    title: string
    desc: string
    status: "active" | "pending"
    disabled?: boolean
    children: React.ReactNode
}) {
    const statusChip = status === "active"
        ? { label: "ativo", cls: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/15" }
        : { label: "pendente", cls: "text-amber-700 dark:text-amber-400 bg-amber-500/15" }
    return (
        <div className={`flex items-start gap-3 p-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 ${disabled ? "opacity-50" : ""}`}>
            <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium leading-tight flex items-center gap-1.5">
                    {title}
                    <span
                        className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${statusChip.cls}`}
                        title={status === "active" ? "Este parâmetro já é respeitado pelo engine." : "Persiste no banco mas o engine ainda não consome — implementação pendente."}
                    >
                        {statusChip.label}
                    </span>
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{desc}</div>
            </div>
            <div className="shrink-0 flex items-center">{children}</div>
        </div>
    )
}

function NumberInput({ value, onChange, min, max, suffix }: {
    value: number
    onChange: (v: number) => void
    min?: number
    max?: number
    suffix?: string
}) {
    return (
        <div className="inline-flex items-center gap-1.5">
            <input
                type="number"
                value={value}
                min={min}
                max={max}
                onChange={e => onChange(parseInt(e.target.value, 10) || 0)}
                className="w-20 px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm text-right"
            />
            {suffix && <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{suffix}</span>}
        </div>
    )
}

function TextInput({ value, onChange, placeholder, mono, disabled }: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    mono?: boolean
    disabled?: boolean
}) {
    return (
        <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className={`w-48 px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500 disabled:opacity-50 ${mono ? "font-mono text-[12px]" : ""}`}
        />
    )
}

function TimeInput({ value, onChange, disabled }: {
    value: string
    onChange: (v: string) => void
    disabled?: boolean
}) {
    return (
        <input
            type="time"
            value={value}
            onChange={e => onChange(e.target.value)}
            disabled={disabled}
            className="px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm disabled:opacity-50"
        />
    )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!checked)}
            role="switch"
            aria-checked={checked}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                checked ? "bg-amber-600" : "bg-zinc-300 dark:bg-zinc-700"
            }`}
        >
            <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    checked ? "translate-x-5" : "translate-x-1"
                }`}
            />
        </button>
    )
}

function FlowCreateModal({
    flows, onClose, onCreated, onError,
}: {
    flows: FlowMeta[]
    onClose: () => void
    onCreated: (newId: string) => void | Promise<void>
    onError: (msg: string) => void
}) {
    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [cloneFrom, setCloneFrom] = useState<string>("")
    const [busy, setBusy] = useState(false)

    async function submit() {
        if (!name.trim()) return
        setBusy(true)
        try {
            const res = await fetch(`/api/whatsapp/central/flows`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim() || null,
                    clone_from: cloneFrom || null,
                }),
            })
            const j = await res.json()
            if (!res.ok) throw new Error(j.error || "Falha ao criar")
            await onCreated(j.flow.id)
        } catch (e) {
            onError(e instanceof Error ? e.message : "Erro desconhecido")
        } finally { setBusy(false) }
    }

    return (
        <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full p-5 space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="font-semibold flex items-center gap-2">
                        <Plus className="h-4 w-4" /> Novo fluxo
                    </h4>
                    <button onClick={onClose} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Nome (ex: Campanha verão 2026)"
                    className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                    autoFocus
                />
                <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Descrição (opcional)"
                    rows={2}
                    className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                />
                <div>
                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Começar a partir de</label>
                    <select
                        value={cloneFrom}
                        onChange={e => setCloneFrom(e.target.value)}
                        className="w-full mt-1 px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm"
                    >
                        <option value="">Padrão em código (buildDefaultGraph)</option>
                        {flows.map(f => (
                            <option key={f.id} value={f.id}>Clonar &quot;{f.name}&quot;{f.is_active ? " (ativo)" : ""}</option>
                        ))}
                    </select>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                        O fluxo novo é criado <strong>inativo</strong>. Edite e depois clique em &quot;Ativar este fluxo&quot; quando estiver pronto.
                    </p>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                        Cancelar
                    </button>
                    <button
                        onClick={submit}
                        disabled={busy || !name.trim()}
                        className="text-sm px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                    >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Criar
                    </button>
                </div>
            </div>
        </div>
    )
}

/* ─── Palette ────────────────────────────────────────────────────── */

function Palette({ onAdd }: { onAdd: (t: NodeType) => void }) {
    const items: { type: NodeType; label: string }[] = [
        { type: "start",         label: "+ Início (gatilho)" },
        { type: "condition",     label: "+ Condição" },
        { type: "action",        label: "+ Ação CRM" },
        { type: "send_template", label: "+ Template" },
        { type: "silence",       label: "+ Silêncio" },
        { type: "end",           label: "+ Fim" },
    ]
    return (
        <div className="bg-white/95 dark:bg-zinc-900/95 text-zinc-900 dark:text-zinc-100 backdrop-blur rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm dark:shadow-black/40 p-2 space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 px-1">Adicionar nó</div>
            {items.map(i => {
                const Icon = NODE_THEME[i.type].icon
                return (
                    <button
                        key={i.type}
                        type="button"
                        onClick={() => onAdd(i.type)}
                        className="w-full text-left text-xs flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        <Icon className="h-3 w-3" />
                        {i.label}
                    </button>
                )
            })}
        </div>
    )
}

/* ─── Trigger Info Panel ─────────────────────────────────────────── */

/**
 * Painel didático no topo do editor, explicando os DOIS pontos onde a 1ª
 * mensagem (welcome) é disparada e o gate de pausa global que cobre os dois.
 * O grafo abaixo cobre apenas o gatilho 2 (inbound). Manter este texto em
 * sincronia com /api/lp/lead, /lib/whatsapp.ts e /api/whatsapp/inbound.
 */
function TriggerInfoPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
    return (
        <div className="border-b">
            <button
                type="button"
                onClick={onToggle}
                className="w-full px-5 py-2 flex items-center gap-2 text-xs text-left hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40 transition-colors"
            >
                <Info className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                <span className="font-medium">Como o welcome é disparado &amp; o que este grafo cobre</span>
                <span className="text-zinc-500 dark:text-zinc-400 hidden sm:inline">— LP, inbound, pausa global</span>
                <span className="ml-auto text-zinc-500 dark:text-zinc-400">
                    {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </span>
            </button>
            {open && (
                <div className="px-5 pb-3 text-[12px] text-zinc-500 dark:text-zinc-400 space-y-2.5 bg-zinc-50 dark:bg-zinc-900/40">
                    <div className="flex items-start gap-2">
                        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 shrink-0">
                            Gatilho&nbsp;1
                        </span>
                        <div className="leading-relaxed">
                            <strong className="text-zinc-900 dark:text-zinc-100">Lead capturado na LP ou criado no admin</strong> — não passa por este grafo.
                            O <code>dispatchWelcome()</code> em <code>/lib/whatsapp.ts</code> respeita opt-out, faz dedup
                            de 24h e pede ao VPS renderizar o template <code>welcome-default</code> via <code>/api/whatsapp/render-welcome</code>.
                            Editar o welcome aqui não afeta este caminho — edite o template na aba <strong>Templates</strong>.
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
                            Gatilho&nbsp;2
                        </span>
                        <div className="leading-relaxed">
                            <strong className="text-zinc-900 dark:text-zinc-100">Inbound chega de um número desconhecido</strong> — entra
                            neste grafo pelo nó <em>Início</em>. O classificador roteia em 5 saídas. Quando cai em
                            <em> sem match</em> e o lead passa pelos gates (não está em opt-out, não está em handoff,
                            não tem <code>interesse_principal</code> e não tem a tag <code>whatsapp:menu_enviado</code>),
                            a engine envia o welcome e marca a tag — assim não repete.
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 shrink-0">
                            Pausa
                        </span>
                        <div className="leading-relaxed">
                            <strong className="text-zinc-900 dark:text-zinc-100">Gate global</strong> em <code>site_settings.whatsapp_central_paused</code>:
                            ativado pelo botão &quot;Pausar fluxo&quot; na aba <strong>Conexão</strong>, bloqueia welcome (gatilho 1) <em>e</em>
                            qualquer execução deste grafo (gatilho 2) antes mesmo do nó Início. Inbound continua sendo logada no Inbox.
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

/* ─── Side panel ─────────────────────────────────────────────────── */

const CONDITION_OPTIONS: { value: ConditionExpr; label: string }[] = [
    { value: "lead.exists",                label: "Lead existe?" },
    { value: "lead.optout_whatsapp",       label: "Lead em opt-out?" },
    { value: "lead.handoff_humano",        label: "Lead em handoff humano?" },
    { value: "lead.has_interesse",         label: "Lead já tem interesse_principal?" },
    { value: "lead.has_menu_sent_tag",     label: "Lead já recebeu o menu de welcome?" },
    { value: "lead.welcome_eligible",      label: "Elegível p/ welcome (sem interesse e sem menu)?" },
    { value: "lead.is_academia_audience",  label: "Lead é Academia Nelore P.O? (tag grupo_academia_nelore_po)" },
    { value: "lead.is_matheus_audience",   label: "Lead é Lista Matheus institucional? (tag lista_matheus_personalizada)" },
    { value: "lead.is_bate_papo_pendente", label: "Bate-papo pendente? (welcome v2 enviado, aguardando resposta)" },
]

const ACTION_OPTIONS: { value: ActionKind; label: string; needsTag?: boolean }[] = [
    { value: "apply_optout",      label: "Aplicar opt-out (CRM + tabela whatsapp_optouts)" },
    { value: "apply_resubscribe", label: "Reativar lead (limpa opt-out)" },
    { value: "apply_handoff",     label: "Marcar handoff humano" },
    { value: "apply_interest",    label: "Aplicar interesse classificado" },
    { value: "add_tag",           label: "Adicionar tag em tags_whatsapp", needsTag: true },
    { value: "remove_tag",        label: "Remover tag de tags_whatsapp", needsTag: true },
]

function SidePanel({
    node, templates, onChangeLabel, onChangeConfig, onDelete, onClose,
}: {
    node: RFFlowNode
    templates: Template[]
    onChangeLabel: (label: string) => void
    onChangeConfig: (patch: Partial<NodeConfig>) => void
    onDelete: () => void
    onClose: () => void
}) {
    const type = node.type as NodeType
    const theme = NODE_THEME[type]
    const Icon = theme.icon
    const cfg = node.data.config ?? {}

    return (
        <div className="absolute inset-y-0 right-0 z-30 w-full sm:w-[380px] bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-start gap-2">
                <div className={`p-2 rounded-md ring-1 ${theme.ring} ${theme.bg}`}>
                    <Icon className={`h-4 w-4 ${theme.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase text-zinc-500 dark:text-zinc-400">{type.replace(/_/g, " ")}</div>
                    <div className="font-semibold text-sm truncate">{node.data.label}</div>
                </div>
                <button onClick={onClose} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400" aria-label="Fechar">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
                <Field label="Rótulo do nó">
                    <input
                        type="text"
                        value={node.data.label}
                        onChange={e => onChangeLabel(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                    />
                </Field>

                {type === "condition" && (
                    <Field label="Expressão">
                        <select
                            value={cfg.expr ?? "lead.exists"}
                            onChange={e => onChangeConfig({ expr: e.target.value as ConditionExpr })}
                            className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                        >
                            {CONDITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                            Saída <strong>true</strong> (verde) é tomada quando a expressão é verdadeira; <strong>false</strong> (vermelha tracejada) caso contrário.
                        </p>
                    </Field>
                )}

                {type === "action" && (
                    <>
                        <Field label="Tipo de ação">
                            <select
                                value={cfg.kind ?? "add_tag"}
                                onChange={e => onChangeConfig({ kind: e.target.value as ActionKind })}
                                className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                            >
                                {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </Field>
                        {(cfg.kind === "add_tag" || cfg.kind === "remove_tag") && (
                            <Field label={cfg.kind === "add_tag" ? "Tag a adicionar" : "Tag a remover"}>
                                <input
                                    type="text"
                                    value={cfg.tag ?? ""}
                                    onChange={e => onChangeConfig({ tag: e.target.value })}
                                    placeholder="ex: whatsapp:menu_enviado"
                                    className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm font-mono placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                                />
                            </Field>
                        )}
                        <Field label="Nota (opcional)">
                            <input
                                type="text"
                                value={cfg.note ?? ""}
                                onChange={e => onChangeConfig({ note: e.target.value })}
                                placeholder="anotação interna"
                                className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                            />
                        </Field>
                    </>
                )}

                {type === "send_template" && (
                    <>
                        <Field label="Modo">
                            <select
                                value={cfg.dynamic ?? ""}
                                onChange={e => {
                                    const v = e.target.value
                                    onChangeConfig({ dynamic: v ? "triagem_by_interesse" : undefined })
                                }}
                                className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                            >
                                <option value="">Slug fixo</option>
                                <option value="triagem_by_interesse">Dinâmico — triagem por interesse</option>
                            </select>
                            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                                No modo dinâmico, o slug vira <code>triagem-{"{interesse}"}</code> com base na classificação.
                            </p>
                        </Field>

                        {!cfg.dynamic && (
                            <Field label="Template (slug)">
                                <select
                                    value={cfg.slug ?? ""}
                                    onChange={e => onChangeConfig({ slug: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                                >
                                    <option value="">— selecione —</option>
                                    {templates.map(t => (
                                        <option key={t.id} value={t.slug}>{t.title} ({t.slug})</option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                                    Edite o corpo dos templates na aba <strong>Templates</strong>.
                                </p>
                            </Field>
                        )}

                        <Field label="bot_step (label do log)">
                            <input
                                type="text"
                                value={cfg.bot_step ?? ""}
                                onChange={e => onChangeConfig({ bot_step: e.target.value })}
                                placeholder="ex: welcome, triagem, optout"
                                className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm font-mono placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                            />
                        </Field>

                        <Field label="Mensagem de fallback">
                            <textarea
                                value={cfg.fallback ?? ""}
                                onChange={e => onChangeConfig({ fallback: e.target.value })}
                                rows={3}
                                placeholder="Usado se o template não existir no banco."
                                className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                            />
                        </Field>

                        <Field label="Nota no contact_history (opcional)">
                            <input
                                type="text"
                                value={cfg.contact_note ?? ""}
                                onChange={e => onChangeConfig({ contact_note: e.target.value })}
                                placeholder="ex: Lead solicitou opt-out via WhatsApp"
                                className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                            />
                        </Field>
                    </>
                )}

                {type === "silence" && (
                    <Field label="Reason (telemetria)">
                        <input
                            type="text"
                            value={cfg.reason ?? ""}
                            onChange={e => onChangeConfig({ reason: e.target.value })}
                            placeholder="ex: lead_optout, unknown_intent"
                            className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm font-mono placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                        />
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                            Devolvido pro VPS no JSON <code>{"{ silent: true, reason }"}</code>. Útil pra debugar por que o bot ficou em silêncio.
                        </p>
                    </Field>
                )}

                {type === "end" && (
                    <Field label="bot_step (override do log)">
                        <input
                            type="text"
                            value={cfg.bot_step ?? ""}
                            onChange={e => onChangeConfig({ bot_step: e.target.value })}
                            placeholder="vazio = usa o do send_template anterior"
                            className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm font-mono placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                        />
                    </Field>
                )}

                {type === "classify" && (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/40 p-2.5 rounded-md">
                        O nó <strong>classify</strong> roda <code>classifyMessage()</code> sobre o texto recebido e tem 5 saídas
                        (handles) na borda inferior, da esquerda pra direita: <strong>opt-out</strong>, <strong>resubscribe</strong>,
                        <strong> humano</strong>, <strong>interesse</strong>, <strong>sem match</strong>. Conecte cada handle ao
                        próximo nó do ramo.
                    </div>
                )}

                {type === "start" && (
                    <>
                        <Field label="Gatilho">
                            <select
                                value={cfg.trigger ?? "inbound"}
                                onChange={e => onChangeConfig({ trigger: e.target.value as TriggerKind })}
                                className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                            >
                                <option value="inbound">Inbound — toda mensagem recebida do VPS</option>
                                <option value="new_lead">Novo lead — VPS pede render-welcome (LP / admin / Sheets)</option>
                            </select>
                            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                                Cada gatilho deve ter no máximo 1 nó de início. Os ramos abaixo de cada start formam fluxos independentes que rodam em momentos diferentes do ciclo do lead.
                            </p>
                        </Field>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/40 p-2.5 rounded-md">
                            <strong className="text-zinc-900 dark:text-zinc-100">Inbound</strong> roda no <code>/api/whatsapp/inbound</code> — classifica intenção e responde.
                            <br /><br />
                            <strong className="text-zinc-900 dark:text-zinc-100">Novo lead</strong> roda no <code>/api/whatsapp/render-welcome</code> via <code>resolveWelcomeDispatch()</code> — anda apenas por <strong>condição</strong> e termina num <strong>send_template</strong>, devolvendo o slug pro VPS renderizar. Actions/classify/send aqui são ignorados (efeitos colaterais e logging acontecem no envio real).
                        </div>
                    </>
                )}
            </div>

            <div className="border-t p-3 flex items-center gap-2">
                <button
                    onClick={onDelete}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 text-xs font-medium border border-rose-500/30 rounded-md px-3 py-2"
                >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir nó
                </button>
            </div>
        </div>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{label}</label>
            <div className="mt-1">{children}</div>
        </div>
    )
}
