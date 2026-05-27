'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
    FileBarChart, Download, FileText, RefreshCw, Filter,
    CheckCircle2, AlertTriangle, Clock, ListChecks, Users,
    Briefcase, TrendingUp, Zap, ChevronRight, Wand2, Settings, X,
} from 'lucide-react'
import type { TacticalTask, TacticalUnidade } from '@/app/sistema/actions/tactical-tasks'
import type { TacticalMember } from '@/app/sistema/actions/tactical-strategic'
import {
    applyFilters, computeMetrics, generateTacticalPlanPDF,
    type PdfFilters, type ReportMode,
} from '@/lib/tactical-plan-pdf'

// ─── Constants ────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['Ideias', 'A fazer', 'Em andamento', 'Completa', 'Recorrente', 'Bloqueado']
const PRIORITY_OPTIONS = ['Alta', 'Média', 'Baixa']
const STAGE_OPTIONS = ['Aquisição', 'Conversão', 'Operação', 'Produto', 'Regulatório']

// Board único no web-bula.
const ACTIVE_BOARD: TacticalUnidade = 'bula_formula'

type PeriodPreset = 'all' | 'today' | '7d' | '30d' | 'month' | 'custom'

const PERIOD_LABELS: Record<PeriodPreset, string> = {
    all: 'Todo o período',
    today: 'Hoje',
    '7d': 'Últimos 7 dias',
    '30d': 'Últimos 30 dias',
    month: 'Mês atual',
    custom: 'Personalizado',
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const fmtNum = (v: number) => (Number(v) || 0).toLocaleString('pt-BR')
const fmtPct = (v: number) => `${(Math.max(0, Math.min(100, v)) || 0).toFixed(1).replace('.', ',')}%`

function isOverdueNow(t: TacticalTask, now: Date) {
    return !!t.due_date && t.status !== 'Completa' && new Date(t.due_date) < now
}

function periodToRange(p: PeriodPreset, customFrom: string, customTo: string): { from: string | null; to: string | null; label: string } {
    const now = new Date()
    const toISO = (d: Date) => d.toISOString().slice(0, 10)
    switch (p) {
        case 'today': {
            const d = toISO(now)
            return { from: d, to: d, label: 'Hoje · ' + d.split('-').reverse().join('/') }
        }
        case '7d': {
            const start = new Date(now); start.setDate(start.getDate() - 6)
            return { from: toISO(start), to: toISO(now), label: 'Últimos 7 dias' }
        }
        case '30d': {
            const start = new Date(now); start.setDate(start.getDate() - 29)
            return { from: toISO(start), to: toISO(now), label: 'Últimos 30 dias' }
        }
        case 'month': {
            const start = new Date(now.getFullYear(), now.getMonth(), 1)
            return { from: toISO(start), to: toISO(now), label: 'Mês atual' }
        }
        case 'custom': {
            if (customFrom && customTo) {
                return { from: customFrom, to: customTo, label: `${customFrom.split('-').reverse().join('/')} → ${customTo.split('-').reverse().join('/')}` }
            }
            return { from: null, to: null, label: 'Personalizado' }
        }
        default:
            return { from: null, to: null, label: 'Todo o período' }
    }
}

function tasksInPeriod(tasks: TacticalTask[], from: string | null, to: string | null): TacticalTask[] {
    if (!from || !to) return tasks
    return tasks.filter(t => {
        const ref = (t.status_changed_at || t.created_at).slice(0, 10)
        return ref >= from && ref <= to
    })
}

// ─── UI primitives ────────────────────────────────────────────────────────

function FilterSelect({
    label, value, onChange, options, placeholder = 'Todos',
}: {
    label: string
    value: string
    onChange: (v: string) => void
    options: { value: string; label: string }[]
    placeholder?: string
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500 dark:text-[#F5F5F5]/50">{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="bg-white dark:bg-[#141414] border border-gray-200 dark:border-[rgba(200, 169, 110,0.22)] rounded text-sm py-2 px-3 focus:outline-none focus:border-[#A68B4B] text-gray-900 dark:text-[#F5F5F5]"
                style={{ borderRadius: 3 }}
            >
                <option value="">{placeholder}</option>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </label>
    )
}

function KPICard({
    label, value, sub, tone = 'gold', icon: Icon,
}: {
    label: string
    value: string
    sub?: string
    tone?: 'gold' | 'green' | 'red' | 'amber' | 'ink'
    icon?: React.ElementType
}) {
    const toneClasses: Record<string, { stripe: string; text: string }> = {
        gold: { stripe: 'bg-[#A68B4B]', text: 'text-[#A68B4B] dark:text-[#C8A96E]' },
        green: { stripe: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
        red: { stripe: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
        amber: { stripe: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
        ink: { stripe: 'bg-gray-700 dark:bg-[#F5F5F5]/80', text: 'text-gray-900 dark:text-[#F5F5F5]' },
    }
    const t = toneClasses[tone] ?? toneClasses.gold
    return (
        <div className="relative bg-white dark:bg-[#141414] border border-gray-200/70 dark:border-[rgba(200, 169, 110,0.22)] p-4 overflow-hidden" style={{ borderRadius: 3 }}>
            <span className={`absolute top-0 left-0 right-0 h-[2px] ${t.stripe}`} aria-hidden />
            <div className="flex items-start justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500 dark:text-[#F5F5F5]/50">
                    {label}
                </span>
                {Icon && <Icon size={14} className={t.text} />}
            </div>
            <div className={`text-2xl font-bold ${t.text} tracking-tight`} style={{ fontFamily: 'var(--font-mono), ui-monospace, monospace', letterSpacing: '-0.02em' }}>
                {value}
            </div>
            {sub && <div className="text-[11px] text-gray-500 dark:text-[#F5F5F5]/50 mt-1">{sub}</div>}
        </div>
    )
}

// ─── Main component ──────────────────────────────────────────────────────

export function RelatoriosClient({
    initialTasks,
    initialMembers,
}: {
    initialTasks: TacticalTask[]
    initialMembers: TacticalMember[]
}) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const pathname = usePathname()
    const [pending, startTransition] = useTransition()

    const [period, setPeriod] = useState<PeriodPreset>('30d')
    const [customFrom, setCustomFrom] = useState('')
    const [customTo, setCustomTo] = useState('')
    const [responsible, setResponsible] = useState('')
    const [status, setStatus] = useState('')
    const [priority, setPriority] = useState('')
    const [stage, setStage] = useState('')
    const [itemType, setItemType] = useState<'both' | 'task' | 'checklist'>('both')
    const [situation, setSituation] = useState<PdfFilters['situation']>('all')
    const [generating, setGenerating] = useState<ReportMode | null>(null)
    const [configOpen, setConfigOpen] = useState(false)
    const [normalizing, setNormalizing] = useState<'idle' | 'preview' | 'apply'>('idle')
    const [normalizeResult, setNormalizeResult] = useState<{
        dryRun: boolean
        tasksScanned: number
        tasksUpdated: number
        itemsUpdated: number
        totalChanges: number
        changes: { taskId: string; taskTitle: string; item: { id: string; from: string; to: string; assignee: string } }[]
    } | null>(null)

    // Board único no web-bula — sem switcher.
    const board: TacticalUnidade = ACTIVE_BOARD
    const boardTasks = useMemo(
        () => initialTasks.filter(t => (t.unidade ?? ACTIVE_BOARD) === board),
        [initialTasks, board],
    )
    const setBoard = (next: TacticalUnidade) => {
        setResponsible('')
        const params = new URLSearchParams(searchParams.toString())
        if (next === ACTIVE_BOARD) params.delete('board'); else params.set('board', next)
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }

    const periodRange = useMemo(() => periodToRange(period, customFrom, customTo), [period, customFrom, customTo])
    const tasksInWindow = useMemo(() => tasksInPeriod(boardTasks, periodRange.from, periodRange.to), [boardTasks, periodRange])

    const filters: PdfFilters = useMemo(() => ({
        period: periodRange,
        responsible: responsible || null,
        status: status || null,
        priority: priority || null,
        strategicStage: stage || null,
        itemType, situation,
    }), [periodRange, responsible, status, priority, stage, itemType, situation])

    const filtered = useMemo(() => applyFilters(tasksInWindow, filters), [tasksInWindow, filters])
    const metrics = useMemo(() => computeMetrics(filtered), [filtered])

    // Recomputed when the visible task set changes so the timestamp matches the snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const now = useMemo(() => new Date(), [filtered])
    const overdueList = useMemo(() => filtered
        .filter(t => isOverdueNow(t, now))
        .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
        .slice(0, 8), [filtered, now])

    const allResponsibleNames = useMemo(() => {
        const s = new Set<string>()
        for (const m of initialMembers) s.add(m.name)
        for (const t of boardTasks) for (const a of (t.assignees || [])) s.add(a)
        return Array.from(s).sort()
    }, [initialMembers, boardTasks])

    async function handleGenerate(mode: ReportMode) {
        try {
            setGenerating(mode)
            await generateTacticalPlanPDF(filtered, initialMembers, filters, mode)
        } catch (e) {
            console.error('[relatorio-pdf]', e)
            alert('Falha ao gerar o PDF. Veja o console para detalhes.')
        } finally {
            setGenerating(null)
        }
    }

    async function handleNormalizeChecklists(dryRun: boolean) {
        try {
            setNormalizing(dryRun ? 'preview' : 'apply')
            const res = await fetch('/api/admin/normalize-checklist-assignees', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ dryRun }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json?.error || 'Falha na normalização')
            setNormalizeResult(json)
            if (!dryRun) {
                startTransition(() => router.refresh())
            }
        } catch (e) {
            console.error('[normalize-checklists]', e)
            alert('Falha ao normalizar checklists: ' + (e instanceof Error ? e.message : 'erro desconhecido'))
        } finally {
            setNormalizing('idle')
        }
    }

    const sortedStatus = Array.from(metrics.byStatus.entries()).sort((a, b) => b[1] - a[1])
    const sortedResp = Array.from(metrics.byResponsavel.entries())
        .sort((a, b) => (b[1].total - b[1].completas) - (a[1].total - a[1].completas))

    return (
        <div className="space-y-6">
            {/* ─── Cabeçalho ─── */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#A68B4B] dark:text-[#C8A96E]">— § Operações</span>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-[#F5F5F5]" style={{ letterSpacing: '-0.02em' }}>
                        Relatórios <span className="text-[#A68B4B] dark:text-[#C8A96E] font-normal italic">Operacionais</span>
                    </h1>
                    <p className="text-gray-500 dark:text-[#F5F5F5]/60 mt-1.5 text-sm">
                        Acompanhe status, atrasos, responsáveis, checklists e evolução das entregas da equipe.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setConfigOpen(v => !v)}
                        className={`flex items-center gap-1.5 px-3.5 py-2 text-sm transition-colors ${configOpen
                            ? 'bg-[#A68B4B]/10 border border-[#A68B4B] text-[#A68B4B] dark:text-[#C8A96E]'
                            : 'bg-white dark:bg-[#141414] border border-gray-200 dark:border-[rgba(200, 169, 110,0.22)] text-gray-700 dark:text-[#F5F5F5]/80 hover:border-[#A68B4B]'
                            }`}
                        style={{ borderRadius: 3 }}
                        aria-expanded={configOpen}
                        aria-controls="rel-config-panel"
                    >
                        <Settings size={14} />
                        Configurações
                    </button>
                    <button
                        type="button"
                        onClick={() => handleGenerate('executive')}
                        disabled={generating !== null}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-sm bg-white dark:bg-[#141414] border border-[#A68B4B]/60 text-[#A68B4B] dark:text-[#C8A96E] hover:bg-[#A68B4B]/5 transition-colors disabled:opacity-50"
                        style={{ borderRadius: 3 }}
                    >
                        <FileText size={14} />
                        {generating === 'executive' ? 'Gerando…' : 'Relatório Executivo'}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleGenerate('detailed')}
                        disabled={generating !== null}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-sm bg-[#A68B4B] text-[#161616] hover:bg-[#8A6826] transition-colors disabled:opacity-50 font-medium shadow-sm shadow-[#A68B4B]/30"
                        style={{ borderRadius: 3 }}
                    >
                        <Download size={14} />
                        {generating === 'detailed' ? 'Gerando…' : 'Relatório Detalhado'}
                    </button>
                </div>
            </div>

            {/* ─── Filtros ─── */}
            <div className="bg-gradient-to-br from-white to-gray-50 dark:from-[#1B1B1B] dark:to-[#0D0D0D] border border-gray-200/70 dark:border-[rgba(200, 169, 110,0.22)] p-4 sm:p-5" style={{ borderRadius: 3 }}>
                <div className="flex items-center gap-2 mb-4">
                    <Filter size={14} className="text-[#A68B4B] dark:text-[#C8A96E]" />
                    <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-gray-700 dark:text-[#F5F5F5]/80 font-medium">Filtros</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-[#A68B4B]/40 to-transparent" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
                    <FilterSelect
                        label="Período"
                        value={period}
                        onChange={(v) => setPeriod(v as PeriodPreset)}
                        options={(['all', 'today', '7d', '30d', 'month', 'custom'] as PeriodPreset[]).map(p => ({ value: p, label: PERIOD_LABELS[p] }))}
                        placeholder="Selecione…"
                    />
                    <FilterSelect
                        label="Responsável"
                        value={responsible}
                        onChange={setResponsible}
                        options={allResponsibleNames.map(n => ({ value: n, label: n }))}
                    />
                    <FilterSelect
                        label="Status"
                        value={status}
                        onChange={setStatus}
                        options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))}
                    />
                    <FilterSelect
                        label="Prioridade"
                        value={priority}
                        onChange={setPriority}
                        options={PRIORITY_OPTIONS.map(p => ({ value: p, label: p }))}
                    />
                    <FilterSelect
                        label="Etapa estratégica"
                        value={stage}
                        onChange={setStage}
                        options={STAGE_OPTIONS.map(s => ({ value: s, label: s }))}
                    />
                    <FilterSelect
                        label="Tipo de item"
                        value={itemType}
                        onChange={(v) => setItemType(v as typeof itemType)}
                        options={[
                            { value: 'both', label: 'Ambos' },
                            { value: 'task', label: 'Tarefa principal' },
                            { value: 'checklist', label: 'Com checklist' },
                        ]}
                        placeholder="Ambos"
                    />
                    <FilterSelect
                        label="Situação"
                        value={situation}
                        onChange={(v) => setSituation(v as PdfFilters['situation'])}
                        options={[
                            { value: 'all', label: 'Todas' },
                            { value: 'on_track', label: 'Em dia' },
                            { value: 'overdue', label: 'Atrasada' },
                            { value: 'stale', label: 'Parada (>7d)' },
                            { value: 'blocked', label: 'Bloqueada' },
                            { value: 'no_due', label: 'Sem prazo' },
                        ]}
                        placeholder="Todas"
                    />
                </div>
                {period === 'custom' && (
                    <div className="grid grid-cols-2 gap-3 mt-3 max-w-md">
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500 dark:text-[#F5F5F5]/50">De</span>
                            <input
                                type="date"
                                value={customFrom}
                                onChange={(e) => setCustomFrom(e.target.value)}
                                className="bg-white dark:bg-[#141414] border border-gray-200 dark:border-[rgba(200, 169, 110,0.22)] rounded text-sm py-2 px-3 focus:outline-none focus:border-[#A68B4B] text-gray-900 dark:text-[#F5F5F5]"
                                style={{ borderRadius: 3 }}
                            />
                        </label>
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500 dark:text-[#F5F5F5]/50">Até</span>
                            <input
                                type="date"
                                value={customTo}
                                onChange={(e) => setCustomTo(e.target.value)}
                                className="bg-white dark:bg-[#141414] border border-gray-200 dark:border-[rgba(200, 169, 110,0.22)] rounded text-sm py-2 px-3 focus:outline-none focus:border-[#A68B4B] text-gray-900 dark:text-[#F5F5F5]"
                                style={{ borderRadius: 3 }}
                            />
                        </label>
                    </div>
                )}
                <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                    <p className="text-[11px] text-gray-500 dark:text-[#F5F5F5]/50">
                        <span className="font-mono">{periodRange.label}</span>
                        <span className="mx-2">·</span>
                        {fmtNum(filtered.length)} tarefa{filtered.length === 1 ? '' : 's'} no escopo
                    </p>
                    {(responsible || status || priority || stage || itemType !== 'both' || situation !== 'all') && (
                        <button
                            type="button"
                            onClick={() => {
                                setResponsible(''); setStatus(''); setPriority(''); setStage('')
                                setItemType('both'); setSituation('all')
                            }}
                            className="text-[11px] text-gray-500 hover:text-[#A68B4B] underline-offset-2 hover:underline"
                        >
                            Limpar filtros
                        </button>
                    )}
                </div>
            </div>

            {/* ─── Configurações (sub-painel) ─── */}
            {configOpen && (
                <div
                    id="rel-config-panel"
                    className="bg-white dark:bg-[#141414] border border-[#A68B4B]/40 overflow-hidden"
                    style={{ borderRadius: 3 }}
                >
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-[rgba(200, 169, 110,0.14)] flex items-center gap-2 bg-gradient-to-r from-[#A68B4B]/5 to-transparent">
                        <Settings size={14} className="text-[#A68B4B] dark:text-[#C8A96E]" />
                        <h3 className="text-sm font-bold text-gray-900 dark:text-[#F5F5F5]">Configurações</h3>
                        <span aria-hidden className="flex-1 h-px bg-gradient-to-r from-[#A68B4B]/30 to-transparent" />
                        <button
                            type="button"
                            onClick={() => setConfigOpen(false)}
                            className="p-1 -m-1 text-gray-400 hover:text-gray-700 dark:hover:text-[#F5F5F5]"
                            aria-label="Fechar Configurações"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Atualizar dados */}
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-[rgba(200, 169, 110,0.14)]">
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex-1 min-w-[200px]">
                                <h4 className="text-[13px] font-semibold text-gray-900 dark:text-[#F5F5F5]">Atualizar dados</h4>
                                <p className="text-[11px] text-gray-500 dark:text-[#F5F5F5]/50 mt-0.5">
                                    Recarrega tarefas, checklists e membros direto do banco.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => startTransition(() => router.refresh())}
                                disabled={pending}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] bg-white dark:bg-[#141414] border border-gray-200 dark:border-[rgba(200, 169, 110,0.22)] hover:border-[#A68B4B] text-gray-700 dark:text-[#F5F5F5]/80 transition-colors disabled:opacity-50"
                                style={{ borderRadius: 3 }}
                            >
                                <RefreshCw size={12} className={pending ? 'animate-spin' : ''} />
                                {pending ? 'Atualizando…' : 'Atualizar dados'}
                            </button>
                        </div>
                    </div>

                    {/* Manutenção · responsáveis em checklists */}
                    <div className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Wand2 size={13} className="text-[#A68B4B] dark:text-[#C8A96E]" />
                            <h4 className="text-[13px] font-semibold text-gray-900 dark:text-[#F5F5F5]">Manutenção · Responsáveis em checklists</h4>
                        </div>
                        <p className="text-[12px] text-gray-600 dark:text-[#F5F5F5]/60 leading-relaxed mb-3">
                            Vasculha todos os checklists e move o nome do responsável que está no título entre colchetes
                            (ex.: <span className="font-mono text-[#A68B4B] dark:text-[#C8A96E]">[João Eduardo] Leads — CPL</span>) para o campo
                            próprio <span className="font-medium text-gray-800 dark:text-[#F5F5F5]/80">Responsável</span>. Só altera itens com
                            responsável vazio e quando o nome bate com a aba <span className="font-mono">Equipe</span>. Idempotente.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => handleNormalizeChecklists(true)}
                                disabled={normalizing !== 'idle'}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] bg-white dark:bg-[#141414] border border-gray-200 dark:border-[rgba(200, 169, 110,0.22)] hover:border-[#A68B4B] text-gray-700 dark:text-[#F5F5F5]/80 transition-colors disabled:opacity-50"
                                style={{ borderRadius: 3 }}
                            >
                                <RefreshCw size={12} className={normalizing === 'preview' ? 'animate-spin' : ''} />
                                {normalizing === 'preview' ? 'Analisando…' : 'Pré-visualizar'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!confirm('Aplicar normalização? Vai mover nomes em [colchetes] para o campo Responsável dos checklists.')) return
                                    handleNormalizeChecklists(false)
                                }}
                                disabled={normalizing !== 'idle'}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] bg-[#A68B4B] text-[#161616] hover:bg-[#8A6826] transition-colors disabled:opacity-50 font-medium"
                                style={{ borderRadius: 3 }}
                            >
                                <Wand2 size={12} />
                                {normalizing === 'apply' ? 'Aplicando…' : 'Aplicar correção'}
                            </button>
                            {normalizeResult && (
                                <span className="text-[11px] font-mono text-gray-500 dark:text-[#F5F5F5]/50 ml-2">
                                    {normalizeResult.dryRun ? 'PRÉVIA · ' : 'APLICADO · '}
                                    {normalizeResult.itemsUpdated} item{normalizeResult.itemsUpdated === 1 ? '' : 's'} em {normalizeResult.tasksUpdated} tarefa{normalizeResult.tasksUpdated === 1 ? '' : 's'}
                                    {' · '}{normalizeResult.tasksScanned} analisadas
                                </span>
                            )}
                        </div>

                        {normalizeResult && normalizeResult.changes.length > 0 && (
                            <div className="mt-4 border border-gray-100 dark:border-[rgba(200, 169, 110,0.14)] overflow-hidden" style={{ borderRadius: 3 }}>
                                <div className="bg-gray-50 dark:bg-[#0D0D0D] px-3 py-2 text-[10px] font-mono uppercase tracking-[0.16em] text-gray-500 dark:text-[#F5F5F5]/40 flex items-center justify-between">
                                    <span>Mostrando {Math.min(normalizeResult.changes.length, 50)} de {normalizeResult.totalChanges} alterações</span>
                                    {normalizeResult.dryRun && <span className="text-amber-600 dark:text-amber-400">DRY RUN</span>}
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                    {normalizeResult.changes.map((c, i) => (
                                        <div key={i} className="px-3 py-2 border-t border-gray-100 dark:border-[rgba(200, 169, 110,0.1)] text-[11px]">
                                            <div className="text-gray-500 dark:text-[#F5F5F5]/50 mb-0.5">
                                                <span className="font-mono">{c.taskTitle}</span>
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-gray-400 dark:text-[#F5F5F5]/40 line-through">{c.item.from}</span>
                                                <ChevronRight size={11} className="text-gray-400" />
                                                <span className="text-gray-800 dark:text-[#F5F5F5]/90">{c.item.to}</span>
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono bg-[#A68B4B]/10 text-[#A68B4B] dark:text-[#C8A96E] rounded-full border border-[#A68B4B]/30">
                                                    → {c.item.assignee}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {normalizeResult && normalizeResult.changes.length === 0 && (
                            <div className="mt-3 px-3 py-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/30 text-[12px] text-emerald-700 dark:text-emerald-400" style={{ borderRadius: 3 }}>
                                ✓ Nenhum checklist com prefixo <span className="font-mono">[Nome]</span> pendente — tudo já está no campo correto.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ─── KPIs principais ─── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard label="Tarefas totais" value={fmtNum(metrics.total)} sub="no escopo" tone="ink" icon={Briefcase} />
                <KPICard label="Em andamento" value={fmtNum(metrics.em_andamento)} sub="ativas agora" tone="gold" icon={Zap} />
                <KPICard label="Atrasadas" value={fmtNum(metrics.atrasadas)} sub="prazo vencido" tone="red" icon={AlertTriangle} />
                <KPICard label="Paradas" value={fmtNum(metrics.paradas)} sub="sem mover há 7+ dias" tone="amber" icon={Clock} />
                <KPICard label="Checklists pendentes" value={fmtNum(metrics.checklistPendentes)} sub={`de ${fmtNum(metrics.checklistTotal)} itens`} tone="amber" icon={ListChecks} />
                <KPICard label="Checklists atrasadas" value={fmtNum(metrics.checklistAtrasadas)} sub="com prazo vencido" tone="red" icon={AlertTriangle} />
                <KPICard label="Taxa de conclusão" value={fmtPct(metrics.taxaConclusao)} sub={`${fmtNum(metrics.completas)} completas`} tone="green" icon={CheckCircle2} />
                <KPICard
                    label="Maior carga"
                    value={metrics.responsavelMaiorCarga?.name ?? '—'}
                    sub={metrics.responsavelMaiorCarga ? `${metrics.responsavelMaiorCarga.count} itens abertos` : '—'}
                    tone="gold"
                    icon={TrendingUp}
                />
            </div>

            {/* ─── Status geral + Por responsável ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Status geral */}
                <div className="lg:col-span-2 bg-white dark:bg-[#141414] border border-gray-200/70 dark:border-[rgba(200, 169, 110,0.22)] overflow-hidden" style={{ borderRadius: 3 }}>
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-[rgba(200, 169, 110,0.14)] flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-[#F5F5F5]">Status geral das tarefas</h3>
                            <p className="text-[11px] text-gray-500 dark:text-[#F5F5F5]/50 mt-0.5">Distribuição no escopo filtrado</p>
                        </div>
                        <span aria-hidden className="block w-7 h-px bg-[#A68B4B]" />
                    </div>
                    <div className="p-1">
                        {sortedStatus.length === 0 ? (
                            <p className="px-3 py-6 text-sm text-gray-500 text-center">Sem dados para o filtro atual.</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-[0.16em] text-gray-500 dark:text-[#F5F5F5]/40 font-mono">
                                        <th className="text-left px-3 py-2 font-medium">Status</th>
                                        <th className="text-right px-3 py-2 font-medium">Qtd</th>
                                        <th className="text-right px-3 py-2 font-medium">%</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedStatus.map(([st, n]) => {
                                        const pct = metrics.total > 0 ? (n / metrics.total) * 100 : 0
                                        return (
                                            <tr key={st} className="border-t border-gray-100 dark:border-[rgba(200, 169, 110,0.1)]">
                                                <td className="px-3 py-2.5 text-gray-800 dark:text-[#F5F5F5]/90">{st}</td>
                                                <td className="px-3 py-2.5 text-right font-mono text-gray-900 dark:text-[#F5F5F5]">{fmtNum(n)}</td>
                                                <td className="px-3 py-2.5 text-right font-mono">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <span className="text-[11px] text-gray-500">{fmtPct(pct)}</span>
                                                        <span className="block h-1.5 bg-gray-100 dark:bg-[#1A1A1A] rounded-full overflow-hidden w-16">
                                                            <span className="block h-full bg-[#A68B4B]" style={{ width: `${pct}%` }} />
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Por responsável (ranking) */}
                <div className="lg:col-span-3 bg-white dark:bg-[#141414] border border-gray-200/70 dark:border-[rgba(200, 169, 110,0.22)] overflow-hidden" style={{ borderRadius: 3 }}>
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-[rgba(200, 169, 110,0.14)] flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-[#F5F5F5]">Carga por responsável</h3>
                            <p className="text-[11px] text-gray-500 dark:text-[#F5F5F5]/50 mt-0.5">Tarefas e checklists abertos</p>
                        </div>
                        <Users size={14} className="text-[#A68B4B] dark:text-[#C8A96E]" />
                    </div>
                    <div className="overflow-x-auto">
                        {sortedResp.length === 0 ? (
                            <p className="px-3 py-6 text-sm text-gray-500 text-center">Sem responsáveis no escopo.</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-[0.16em] text-gray-500 dark:text-[#F5F5F5]/40 font-mono">
                                        <th className="text-left px-3 py-2 font-medium">Responsável</th>
                                        <th className="text-right px-3 py-2 font-medium">Total</th>
                                        <th className="text-right px-3 py-2 font-medium">Em andam.</th>
                                        <th className="text-right px-3 py-2 font-medium">Atrasadas</th>
                                        <th className="text-right px-3 py-2 font-medium">Completas</th>
                                        <th className="text-right px-3 py-2 font-medium">Chk pend.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedResp.map(([name, rec]) => {
                                        const pctComp = rec.total > 0 ? (rec.completas / rec.total) * 100 : 0
                                        return (
                                            <tr key={name} className="border-t border-gray-100 dark:border-[rgba(200, 169, 110,0.1)]">
                                                <td className="px-3 py-2.5">
                                                    <div className="font-medium text-gray-900 dark:text-[#F5F5F5]">{name}</div>
                                                    <div className="mt-1 h-1 w-full max-w-[180px] bg-gray-100 dark:bg-[#1A1A1A] rounded-full overflow-hidden">
                                                        <span className="block h-full bg-emerald-500" style={{ width: `${pctComp}%` }} />
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 text-right font-mono text-gray-800 dark:text-[#F5F5F5]/90">{fmtNum(rec.total)}</td>
                                                <td className="px-3 py-2.5 text-right font-mono text-gray-800 dark:text-[#F5F5F5]/90">{fmtNum(rec.em_andamento)}</td>
                                                <td className={`px-3 py-2.5 text-right font-mono ${rec.atrasadas > 0 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>{fmtNum(rec.atrasadas)}</td>
                                                <td className="px-3 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">{fmtNum(rec.completas)}</td>
                                                <td className={`px-3 py-2.5 text-right font-mono ${rec.checklistPendentes > 0 ? 'text-amber-500' : 'text-gray-400'}`}>{fmtNum(rec.checklistPendentes)}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── Atrasadas + Checklists preview ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Atrasadas */}
                <div className="bg-white dark:bg-[#141414] border border-gray-200/70 dark:border-[rgba(200, 169, 110,0.22)] overflow-hidden" style={{ borderRadius: 3 }}>
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-[rgba(200, 169, 110,0.14)] flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-[#F5F5F5] flex items-center gap-2">
                                <AlertTriangle size={14} className="text-red-500" />
                                Tarefas atrasadas
                            </h3>
                            <p className="text-[11px] text-gray-500 dark:text-[#F5F5F5]/50 mt-0.5">Top 8 com maior atraso</p>
                        </div>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200/60 dark:border-red-500/30">
                            {metrics.atrasadas}
                        </span>
                    </div>
                    <div>
                        {overdueList.length === 0 ? (
                            <p className="px-4 py-8 text-sm text-gray-500 text-center">Nenhuma tarefa atrasada. ✦</p>
                        ) : overdueList.map(t => {
                            const days = Math.floor((now.getTime() - new Date(t.due_date!).getTime()) / 86400000)
                            return (
                                <div key={t.id} className="px-4 py-3 border-t border-gray-100 dark:border-[rgba(200, 169, 110,0.1)] flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-gray-900 dark:text-[#F5F5F5] truncate">{t.title}</div>
                                        <div className="text-[11px] text-gray-500 dark:text-[#F5F5F5]/50 mt-0.5">
                                            {(t.assignees || []).join(', ') || '—'} · {t.status}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-[11px] font-mono text-gray-600 dark:text-[#F5F5F5]/70">{t.due_date}</div>
                                        <div className="text-[11px] font-mono text-red-500 font-semibold">{days}d</div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Checklists snapshot */}
                <div className="bg-white dark:bg-[#141414] border border-gray-200/70 dark:border-[rgba(200, 169, 110,0.22)] overflow-hidden" style={{ borderRadius: 3 }}>
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-[rgba(200, 169, 110,0.14)] flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-[#F5F5F5] flex items-center gap-2">
                                <ListChecks size={14} className="text-[#A68B4B] dark:text-[#C8A96E]" />
                                Checklists em aberto
                            </h3>
                            <p className="text-[11px] text-gray-500 dark:text-[#F5F5F5]/50 mt-0.5">Top tarefas com mais itens pendentes</p>
                        </div>
                        <span aria-hidden className="block w-7 h-px bg-[#A68B4B]" />
                    </div>
                    <div>
                        {(() => {
                            const withOpen = filtered
                                .map(t => ({
                                    t,
                                    open: (t.checklists || []).filter((c: { completed?: boolean }) => !c.completed).length,
                                    total: (t.checklists || []).length,
                                }))
                                .filter(x => x.open > 0)
                                .sort((a, b) => b.open - a.open)
                                .slice(0, 8)
                            if (withOpen.length === 0) {
                                return <p className="px-4 py-8 text-sm text-gray-500 text-center">Nenhum checklist em aberto.</p>
                            }
                            return withOpen.map(({ t, open, total }) => {
                                const pct = total > 0 ? ((total - open) / total) * 100 : 0
                                return (
                                    <div key={t.id} className="px-4 py-3 border-t border-gray-100 dark:border-[rgba(200, 169, 110,0.1)]">
                                        <div className="flex items-center justify-between gap-3 mb-1.5">
                                            <div className="text-sm font-medium text-gray-900 dark:text-[#F5F5F5] truncate flex-1">{t.title}</div>
                                            <div className="text-[11px] font-mono text-gray-600 dark:text-[#F5F5F5]/70 shrink-0">
                                                {total - open}/{total}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="h-1.5 flex-1 bg-gray-100 dark:bg-[#1A1A1A] rounded-full overflow-hidden">
                                                <span className="block h-full bg-[#A68B4B]" style={{ width: `${pct}%` }} />
                                            </div>
                                            <span className="text-[10px] font-mono text-gray-500 dark:text-[#F5F5F5]/50 shrink-0">{fmtPct(pct)}</span>
                                        </div>
                                        {(t.assignees && t.assignees.length > 0) && (
                                            <div className="text-[11px] text-gray-500 dark:text-[#F5F5F5]/50 mt-1">{t.assignees.join(', ')}</div>
                                        )}
                                    </div>
                                )
                            })
                        })()}
                    </div>
                </div>
            </div>

            {/* ─── Footer note ─── */}
            <div className="border-t border-gray-100 dark:border-[rgba(200, 169, 110,0.14)] pt-4 text-[11px] text-gray-400 dark:text-[#F5F5F5]/40 font-mono flex items-center gap-2">
                <FileBarChart size={12} />
                <span>RELATÓRIOS · GERADO COM BASE NO KANBAN OPERACIONAL · BRANDBOOK V1.0</span>
                <span className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-[rgba(200, 169, 110,0.15)] to-transparent" />
                <ChevronRight size={12} />
            </div>
        </div>
    )
}
