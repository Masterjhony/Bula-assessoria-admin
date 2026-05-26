'use client';

import { useState, useMemo } from 'react';
import { OKRView } from '@/components/admin/kanban/OKRView';
import { StrategyView } from '@/components/admin/kanban/StrategyView';
import { ReviewView } from '@/components/admin/kanban/ReviewView';
import { OperationDashboard } from '@/components/admin/okr/OperationDashboard';
import {
    Target, Compass, ClipboardList, Shield, AlertTriangle, Activity,
    LayoutDashboard, Users, Trophy,
} from 'lucide-react';
import {
    TacticalObjective, TacticalRisk, TacticalDecision, StrategicFlow,
} from '@/app/sistema/actions/tactical-strategic';
import { TacticalTask, TacticalColumn } from '@/app/sistema/actions/tactical-tasks';
import { OKRSnapshot } from '@/app/sistema/actions/okr-snapshot';

type OKRTab = 'panel' | 'okrs' | 'strategy' | 'review';

interface Props {
    initialObjectives: TacticalObjective[];
    initialRisks: TacticalRisk[];
    initialDecisions: TacticalDecision[];
    initialFlows: StrategicFlow[];
    initialTasks: TacticalTask[];
    initialColumns: TacticalColumn[];
    snapshot: OKRSnapshot;
}

function healthTheme(v: number) {
    if (v >= 70) return {
        text: 'text-emerald-600 dark:text-emerald-400',
        bg: 'bg-emerald-50 dark:bg-emerald-500/5',
        border: 'border-emerald-200 dark:border-emerald-500/20',
        bar: 'bg-emerald-500',
        stroke: '#10B981',
        label: 'Saudável',
    };
    if (v >= 40) return {
        text: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-50 dark:bg-amber-500/5',
        border: 'border-amber-200 dark:border-amber-500/20',
        bar: 'bg-amber-500',
        stroke: '#F59E0B',
        label: 'Atenção',
    };
    return {
        text: 'text-red-600 dark:text-red-400',
        bg: 'bg-red-50 dark:bg-red-500/5',
        border: 'border-red-200 dark:border-red-500/20',
        bar: 'bg-red-500',
        stroke: '#EF4444',
        label: 'Crítico',
    };
}

function RadialGauge({ pct, stroke, size = 52, sw = 4 }: {
    pct: number; stroke: string; size?: number; sw?: number;
}) {
    const r = (size - sw) / 2;
    const circ = 2 * Math.PI * r;
    const clamped = Math.min(100, Math.max(0, pct));
    const dash = (clamped / 100) * circ;
    const gap = circ - dash;
    return (
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
            <circle
                cx={size / 2} cy={size / 2} r={r}
                fill="none" strokeWidth={sw}
                stroke="#e5e7eb"
                className="dark:stroke-[#363636]"
            />
            <circle
                cx={size / 2} cy={size / 2} r={r}
                fill="none" strokeWidth={sw}
                stroke={stroke}
                strokeDasharray={`${dash.toFixed(2)} ${gap.toFixed(2)}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.7s ease' }}
            />
        </svg>
    );
}

const fmtBRL = (v: number) => {
    if (!v) return 'R$ 0';
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
    return `R$ ${v}`;
};

interface KPICardProps {
    label: string;
    value: string;
    sub: string;
    score: number;
    icon: React.ReactNode;
    forceAlert?: boolean;
}

function KPICard({ label, value, sub, score, icon, forceAlert }: KPICardProps) {
    const t = forceAlert ? healthTheme(0) : healthTheme(score);
    return (
        <div className={`relative rounded-2xl p-4 border ${t.bg} ${t.border} overflow-hidden`}>
            <div
                className="absolute -top-5 -right-5 w-20 h-20 rounded-full opacity-[0.06]"
                style={{ backgroundColor: t.stroke }}
            />
            <div className="flex items-start gap-3 relative">
                <div className="relative shrink-0">
                    <RadialGauge pct={forceAlert ? 0 : score} stroke={t.stroke} />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className={t.text}>{icon}</span>
                    </div>
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1.5">
                        {label}
                    </p>
                    <p className={`text-2xl font-black leading-none tracking-tight ${t.text}`}>
                        {value}
                    </p>
                    <p className="text-xs text-gray-500 mt-1.5 leading-tight truncate">{sub}</p>
                </div>
            </div>
            <div className={`absolute bottom-0 left-0 right-0 h-[2px] ${t.bar} opacity-30`} />
        </div>
    );
}

export function OKRPageClient({
    initialObjectives,
    initialRisks,
    initialDecisions,
    initialFlows,
    initialTasks,
    initialColumns,
    snapshot,
}: Props) {
    const [objectives, setObjectives] = useState(initialObjectives);
    const [risks, setRisks] = useState(initialRisks);
    const [decisions, setDecisions] = useState(initialDecisions);
    const [flows, setFlows] = useState(initialFlows);
    const [tasks, setTasks] = useState(initialTasks);
    const [tab, setTab] = useState<OKRTab>('panel');

    const doneStatus = useMemo(() =>
        initialColumns.find(c =>
            c.title.toLowerCase().includes('complet') || c.title.toLowerCase().includes('conclu')
        )?.title,
        [initialColumns]
    );

    const health = useMemo(() => {
        const total = tasks.length;
        const done = tasks.filter(t => t.status === doneStatus).length;
        const execution = total > 0 ? Math.round((done / total) * 100) : 0;

        const allKRs = objectives.flatMap(o => o.key_results ?? []);
        const okrProgress = allKRs.length > 0
            ? Math.round(allKRs.reduce((a, kr) => a + (kr.progress ?? 0), 0) / allKRs.length)
            : 0;

        const openTasks = tasks.filter(t => t.status !== doneStatus);
        const overdueCount = openTasks.filter(t => t.due_date && new Date(t.due_date) < new Date()).length;
        const consistency = openTasks.length > 0
            ? Math.round(((openTasks.length - overdueCount) / openTasks.length) * 100)
            : 100;

        const overall = Math.round((execution + okrProgress + consistency) / 3);
        const activeRisks = risks.filter(r => r.status === 'active').length;
        const totalKRs = allKRs.length;

        return { execution, okrProgress, consistency, overall, overdueCount, activeRisks, totalKRs };
    }, [tasks, objectives, risks, doneStatus]);

    const overallTheme = healthTheme(health.overall);

    // Captação score: leads 30d vs 30d anteriores normalizado (0–100).
    const captationScore = useMemo(() => {
        if (snapshot.leads.prev30d === 0) {
            return snapshot.leads.new30d > 0 ? 70 : 0;
        }
        const ratio = snapshot.leads.new30d / snapshot.leads.prev30d;
        return Math.min(100, Math.max(0, Math.round(50 + (ratio - 1) * 50)));
    }, [snapshot.leads]);

    const tabs: { key: OKRTab; label: string; icon: React.ReactNode; badge?: string; alertBadge?: boolean }[] = [
        {
            key: 'panel',
            label: 'Painel',
            icon: <LayoutDashboard size={14} />,
        },
        {
            key: 'okrs',
            label: 'Objetivos',
            icon: <Target size={14} />,
            badge: health.okrProgress > 0 ? `${health.okrProgress}%` : undefined,
        },
        { key: 'strategy', label: 'Estratégia', icon: <Compass size={14} /> },
        {
            key: 'review',
            label: 'Revisão',
            icon: <ClipboardList size={14} />,
            badge: health.activeRisks > 0 ? String(health.activeRisks) : undefined,
            alertBadge: health.activeRisks > 0,
        },
    ];

    return (
        <div className="h-full flex flex-col bg-white dark:bg-[#1d1d1d] rounded-2xl border border-gray-200 dark:border-[#2A2A2A] overflow-hidden shadow-sm">

            {/* Gold accent line */}
            <div className="h-[3px] bg-gradient-to-r from-[#A0792E] via-[#D4A85C] to-[#A0792E]/10 shrink-0" />

            {/* Header */}
            <div className="px-6 pt-5 pb-0 shrink-0 border-b border-gray-100 dark:border-[#262626]">

                <div className="flex items-start justify-between mb-5">
                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#A0792E] opacity-60" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#A0792E]" />
                            </span>
                            <span className="text-[10px] font-bold text-[#A0792E] uppercase tracking-[0.18em]">
                                Painel Estratégico
                            </span>
                        </div>
                        <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-none">
                            Fórmula do Boi
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">
                            Visão executiva: estratégia → projetos → tarefas → indicadores em uma só tela.
                        </p>
                    </div>

                    <div className="text-right shrink-0 ml-4">
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${overallTheme.bg} ${overallTheme.border} ${overallTheme.text}`}>
                            <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: overallTheme.stroke }}
                            />
                            {overallTheme.label} · {health.overall}%
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1.5 font-medium">Q2 2026</p>
                    </div>
                </div>

                {/* KPI Cards — agora misturando saúde tática com indicadores reais */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                    <KPICard
                        label="Saúde Geral"
                        value={`${health.overall}%`}
                        sub={`${overallTheme.label} · OKR ${health.okrProgress}% · execução ${health.execution}%`}
                        score={health.overall}
                        icon={<Shield size={13} />}
                    />
                    <KPICard
                        label="Captação 30d"
                        value={String(snapshot.leads.new30d)}
                        sub={snapshot.leads.prev30d > 0
                            ? `${snapshot.leads.trendDeltaPct >= 0 ? '+' : ''}${snapshot.leads.trendDeltaPct.toFixed(0)}% vs período anterior`
                            : `${snapshot.leads.new7d} em 7d`}
                        score={captationScore}
                        icon={<Users size={13} />}
                    />
                    <KPICard
                        label="Conversão MQL"
                        value={snapshot.leads.mqlTotal > 0 ? `${snapshot.leads.mqlConvPct.toFixed(0)}%` : '—'}
                        sub={`${snapshot.leads.mqlActive} MQLs ativos · pipeline ${fmtBRL(snapshot.leads.pipelineValue)}`}
                        score={snapshot.leads.mqlConvPct}
                        icon={<Activity size={13} />}
                    />
                    <KPICard
                        label="Resultado 90d"
                        value={fmtBRL(snapshot.auctions.vgv90d)}
                        sub={snapshot.auctions.roi90dPct > 0
                            ? `ROI ${snapshot.auctions.roi90dPct.toFixed(0)}% · receita ${fmtBRL(snapshot.auctions.receita90d)}`
                            : `${snapshot.auctions.recent.length} fechamento(s)`}
                        score={snapshot.auctions.roi90dPct > 0 ? Math.min(100, snapshot.auctions.roi90dPct / 2) : 0}
                        icon={<Trophy size={13} />}
                    />
                </div>

                {/* Alerta visual de bloqueios — uma faixa fininha acima das tabs */}
                {(health.activeRisks > 0 || health.overdueCount > 0 || snapshot.leads.stalledCount >= 5) && (
                    <div className="flex flex-wrap items-center gap-2 mb-3 -mt-1">
                        {health.activeRisks > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400">
                                <AlertTriangle size={10} /> {health.activeRisks} risco{health.activeRisks > 1 ? 's' : ''} ativo{health.activeRisks > 1 ? 's' : ''}
                            </span>
                        )}
                        {health.overdueCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                {health.overdueCount} tarefa{health.overdueCount > 1 ? 's' : ''} atrasada{health.overdueCount > 1 ? 's' : ''}
                            </span>
                        )}
                        {snapshot.leads.stalledCount >= 5 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                {snapshot.leads.stalledCount} leads parados +30d
                            </span>
                        )}
                        {snapshot.leads.closingSoonCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                {snapshot.leads.closingSoonCount} fechando em 7d
                            </span>
                        )}
                    </div>
                )}

                {/* Tab bar */}
                <div className="flex gap-0 overflow-x-auto">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`relative flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${
                                tab === t.key
                                    ? 'border-[#A0792E] text-[#A0792E] dark:text-[#D4A85C]'
                                    : 'border-transparent text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-200 dark:hover:border-[#363636]'
                            }`}
                        >
                            {t.icon}
                            {t.label}
                            {t.badge && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight ${
                                    t.alertBadge
                                        ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                                        : 'bg-[#A0792E]/10 text-[#A0792E]'
                                }`}>
                                    {t.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-auto p-6 bg-gray-50/40 dark:bg-[#181818]">
                {tab === 'panel' && (
                    <OperationDashboard
                        snapshot={snapshot}
                        objectives={objectives}
                        risks={risks}
                        tasks={tasks}
                        columns={initialColumns}
                    />
                )}
                {tab === 'okrs' && (
                    <OKRView
                        objectives={objectives}
                        onObjectivesChange={setObjectives}
                        snapshot={snapshot}
                        tasks={tasks}
                        doneStatus={doneStatus}
                    />
                )}
                {tab === 'strategy' && (
                    <StrategyView
                        flows={flows}
                        onFlowsChange={setFlows}
                        tasks={tasks}
                        onTasksChange={setTasks}
                        objectives={objectives}
                        doneStatus={doneStatus}
                    />
                )}
                {tab === 'review' && (
                    <ReviewView
                        tasks={tasks}
                        columns={initialColumns}
                        risks={risks}
                        decisions={decisions}
                        onRisksChange={setRisks}
                        onDecisionsChange={setDecisions}
                    />
                )}
            </div>
        </div>
    );
}
