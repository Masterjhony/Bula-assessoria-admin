'use client';

import { useState, useMemo } from 'react';
import {
    TacticalTask,
    updateTask,
} from '@/app/sistema/actions/tactical-tasks';
import {
    StrategicFlow,
    StrategicStage,
    TacticalObjective,
    createFlow,
    updateFlow,
    deleteFlow,
    createStage,
    updateStage,
    deleteStage,
} from '@/app/sistema/actions/tactical-strategic';
import {
    Zap, AlertTriangle, TrendingUp, Target, Plus, Trash2, Edit2,
    Check, X, ChevronUp, ChevronDown, Eye, Settings, ArrowRight,
    Flame, Clock, ChevronRight, Activity, Shield, BarChart2,
} from 'lucide-react';

interface StrategyViewProps {
    flows: StrategicFlow[];
    onFlowsChange: (flows: StrategicFlow[]) => void;
    tasks: TacticalTask[];
    onTasksChange: (tasks: TacticalTask[]) => void;
    objectives: TacticalObjective[];
    doneStatus?: string;
}

const STAGE_COLORS = [
    '#3B82F6', '#F59E0B', '#A0792E', '#EC4899',
    '#10B981', '#8B5CF6', '#EF4444', '#06B6D4',
];

function iceScore(t: TacticalTask) {
    const i = t.ice_impact ?? 0;
    const c = t.ice_confidence ?? 0;
    const e = t.ice_ease ?? 0;
    return i * c * e;
}

function isOverdue(t: TacticalTask, doneStatus?: string) {
    if (!t.due_date) return false;
    if (t.status === doneStatus) return false;
    return new Date(t.due_date) < new Date();
}

export function StrategyView({
    flows,
    onFlowsChange,
    tasks,
    onTasksChange,
    objectives,
    doneStatus,
}: StrategyViewProps) {
    const [activeFlowId, setActiveFlowId] = useState<string | null>(
        flows.find(f => f.active)?.id ?? flows[0]?.id ?? null
    );
    const [ceoMode, setCeoMode] = useState(false);
    const [editingFlow, setEditingFlow] = useState(false);
    const [creatingFlow, setCreatingFlow] = useState(false);
    const [newFlowName, setNewFlowName] = useState('');
    const [newFlowDesc, setNewFlowDesc] = useState('');
    const [editingStageId, setEditingStageId] = useState<string | null>(null);
    const [stageEdits, setStageEdits] = useState<Partial<StrategicStage>>({});
    const [addingStage, setAddingStage] = useState(false);
    const [newStageName, setNewStageName] = useState('');
    const [newStageWeight, setNewStageWeight] = useState(3);
    const [newStageColor, setNewStageColor] = useState('#A0792E');
    const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);

    const activeFlow = flows.find(f => f.id === activeFlowId) ?? null;
    const stages = activeFlow?.stages ?? [];

    // ── Per-stage metrics ──────────────────────────────────────────────────────
    const stageMetrics = useMemo(() => {
        return stages.map(stage => {
            const stageTasks = tasks.filter(t => t.strategic_stage === stage.id);
            const doneTasks = stageTasks.filter(t => t.status === doneStatus);
            const overdueTasks = stageTasks.filter(t => isOverdue(t, doneStatus));
            const openTasks = stageTasks.filter(t => t.status !== doneStatus);
            const progress = stageTasks.length > 0
                ? Math.round((doneTasks.length / stageTasks.length) * 100)
                : 0;
            const iceScores = stageTasks.map(iceScore).filter(s => s > 0);
            const avgIce = iceScores.length > 0
                ? Math.round(iceScores.reduce((a, b) => a + b, 0) / iceScores.length)
                : 0;
            const isBottleneck = stageTasks.length >= 3 && progress < 30;

            return { stage, stageTasks, doneTasks, overdueTasks, openTasks, progress, avgIce, isBottleneck };
        });
    }, [stages, tasks, doneStatus]);

    // ── FOCO AGORA detection ───────────────────────────────────────────────────
    const focusStage = useMemo(() => {
        if (!stageMetrics.length) return null;

        // Score: (1 - progress/100) × weight × (1 + overdue*0.5)
        const scored = stageMetrics
            .filter(m => m.stageTasks.length > 0)
            .map(m => ({
                ...m,
                focusScore: (1 - m.progress / 100) * m.stage.weight * (1 + m.overdueTasks.length * 0.5),
            }))
            .sort((a, b) => b.focusScore - a.focusScore);

        return scored[0] ?? null;
    }, [stageMetrics]);

    // ── Impact ranking (ICE × stage weight) ───────────────────────────────────
    const impactRanking = useMemo(() => {
        const stageWeightMap = new Map(stages.map(s => [s.id, s.weight]));
        return tasks
            .filter(t => t.status !== doneStatus)
            .map(t => ({
                task: t,
                score: iceScore(t) * (stageWeightMap.get(t.strategic_stage ?? '') ?? 1),
                ice: iceScore(t),
            }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);
    }, [tasks, stages, doneStatus]);

    // ── System health ──────────────────────────────────────────────────────────
    const health = useMemo(() => {
        const total = tasks.length;
        const done = tasks.filter(t => t.status === doneStatus).length;
        const execution = total > 0 ? Math.round((done / total) * 100) : 0;

        const allKRs = objectives.flatMap(o => o.key_results ?? []);
        const strategy = allKRs.length > 0
            ? Math.round(allKRs.reduce((a, kr) => a + (kr.progress ?? 0), 0) / allKRs.length)
            : 0;

        const openTasks = tasks.filter(t => t.status !== doneStatus);
        const overdueCount = openTasks.filter(t => isOverdue(t, doneStatus)).length;
        const consistency = openTasks.length > 0
            ? Math.round(((openTasks.length - overdueCount) / openTasks.length) * 100)
            : 100;

        const overall = Math.round((execution + strategy + consistency) / 3);

        return { execution, strategy, consistency, overall, overdueCount };
    }, [tasks, objectives, doneStatus]);

    const healthColor = (v: number) =>
        v >= 70 ? 'text-emerald-600 dark:text-emerald-400' :
            v >= 40 ? 'text-amber-500' :
                'text-red-500';

    const healthBg = (v: number) =>
        v >= 70 ? 'bg-emerald-500' :
            v >= 40 ? 'bg-amber-500' :
                'bg-red-500';

    const healthLabel = (v: number) =>
        v >= 70 ? 'Saudável' : v >= 40 ? 'Atenção' : 'Crítico';

    const tasksWithoutStage = tasks.filter(t =>
        t.status !== doneStatus && !t.strategic_stage
    );

    // ── Handlers ──────────────────────────────────────────────────────────────
    async function handleCreateFlow() {
        if (!newFlowName.trim()) return;
        try {
            const created = await createFlow({ name: newFlowName.trim(), description: newFlowDesc || undefined });
            const updated = [...flows, { ...created, stages: [] }];
            onFlowsChange(updated);
            setActiveFlowId(created.id);
            setNewFlowName('');
            setNewFlowDesc('');
            setCreatingFlow(false);
        } catch (e) { console.error(e); }
    }

    async function handleDeleteFlow(id: string) {
        if (!confirm('Excluir este fluxo e todas as suas etapas?')) return;
        try {
            await deleteFlow(id);
            const updated = flows.filter(f => f.id !== id);
            onFlowsChange(updated);
            setActiveFlowId(updated[0]?.id ?? null);
        } catch (e) { console.error(e); }
    }

    async function handleAddStage() {
        if (!activeFlowId || !newStageName.trim()) return;
        const maxPos = stages.length > 0 ? Math.max(...stages.map(s => s.position)) + 1000 : 1000;
        try {
            const created = await createStage({
                flow_id: activeFlowId,
                name: newStageName.trim(),
                position: maxPos,
                weight: newStageWeight,
                color: newStageColor,
            });
            onFlowsChange(flows.map(f =>
                f.id === activeFlowId
                    ? { ...f, stages: [...(f.stages ?? []), created] }
                    : f
            ));
            setNewStageName('');
            setNewStageWeight(3);
            setNewStageColor('#A0792E');
            setAddingStage(false);
        } catch (e) { console.error(e); }
    }

    async function handleSaveStage(stageId: string) {
        if (!stageEdits.name?.trim()) return;
        try {
            const updated = await updateStage(stageId, stageEdits);
            onFlowsChange(flows.map(f =>
                f.id === activeFlowId
                    ? { ...f, stages: (f.stages ?? []).map(s => s.id === stageId ? { ...s, ...updated } : s) }
                    : f
            ));
            setEditingStageId(null);
            setStageEdits({});
        } catch (e) { console.error(e); }
    }

    async function handleDeleteStage(stageId: string) {
        if (!confirm('Excluir esta etapa? As tarefas associadas perderão a vinculação.')) return;
        try {
            await deleteStage(stageId);
            onFlowsChange(flows.map(f =>
                f.id === activeFlowId
                    ? { ...f, stages: (f.stages ?? []).filter(s => s.id !== stageId) }
                    : f
            ));
        } catch (e) { console.error(e); }
    }

    async function handleReorderStage(stageId: string, dir: 'up' | 'down') {
        const idx = stages.findIndex(s => s.id === stageId);
        if (idx < 0) return;
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= stages.length) return;

        const posA = stages[idx].position;
        const posB = stages[swapIdx].position;
        try {
            await Promise.all([
                updateStage(stages[idx].id, { position: posB }),
                updateStage(stages[swapIdx].id, { position: posA }),
            ]);
            onFlowsChange(flows.map(f => {
                if (f.id !== activeFlowId) return f;
                const newStages = [...(f.stages ?? [])];
                newStages[idx] = { ...newStages[idx], position: posB };
                newStages[swapIdx] = { ...newStages[swapIdx], position: posA };
                return { ...f, stages: newStages.sort((a, b) => a.position - b.position) };
            }));
        } catch (e) { console.error(e); }
    }

    async function handleAssignTaskToStage(taskId: string, stageId: string | null) {
        try {
            const updated = await updateTask(taskId, { strategic_stage: stageId ?? undefined });
            onTasksChange(tasks.map(t => t.id === taskId ? { ...t, strategic_stage: stageId ?? undefined } : t));
            setAssigningTaskId(null);
        } catch (e) { console.error(e); }
    }

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="flex-1 overflow-y-auto space-y-5 pb-6 pr-1">

            {/* ── Health Bar ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-3">
                {/* Overall */}
                <div className="col-span-1 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-2xl p-4 flex flex-col items-center justify-center">
                    <div className="relative w-16 h-16">
                        <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" className="dark:stroke-[#3f3f3f]" />
                            <circle
                                cx="18" cy="18" r="15.9" fill="none"
                                strokeWidth="3"
                                strokeDasharray={`${health.overall} ${100 - health.overall}`}
                                strokeLinecap="round"
                                className={health.overall >= 70 ? 'stroke-emerald-500' : health.overall >= 40 ? 'stroke-amber-500' : 'stroke-red-500'}
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className={`text-sm font-bold ${healthColor(health.overall)}`}>{health.overall}%</span>
                        </div>
                    </div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-1">Saúde Geral</p>
                    <span className={`text-[10px] font-bold mt-0.5 ${healthColor(health.overall)}`}>
                        {healthLabel(health.overall)}
                    </span>
                </div>

                {/* 3 indicators */}
                {[
                    { label: 'Execução', value: health.execution, icon: <Activity size={14} />, hint: 'tarefas concluídas' },
                    { label: 'Estratégia', value: health.strategy, icon: <Target size={14} />, hint: 'progresso OKRs' },
                    { label: 'Consistência', value: health.consistency, icon: <Shield size={14} />, hint: `${health.overdueCount} atrasadas` },
                ].map(({ label, value, icon, hint }) => (
                    <div key={label} className="bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                                {icon}
                                <span className="text-xs font-medium">{label}</span>
                            </div>
                            <span className={`text-sm font-bold ${healthColor(value)}`}>{value}%</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-[#1d1d1d] rounded-full h-2">
                            <div className={`h-2 rounded-full transition-all ${healthBg(value)}`} style={{ width: `${value}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1.5">{hint}</p>
                    </div>
                ))}
            </div>

            {/* ── Flow selector + CEO mode ───────────────────────────────── */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Fluxo:</span>
                    {flows.map(f => (
                        <button
                            key={f.id}
                            onClick={() => setActiveFlowId(f.id)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${f.id === activeFlowId
                                ? 'bg-[#A0792E]/10 border-[#A0792E]/40 text-[#A0792E]'
                                : 'bg-white dark:bg-[#262626] border-gray-200 dark:border-[#2e2e2e] text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'
                                }`}
                        >
                            {f.name}
                        </button>
                    ))}
                    {creatingFlow ? (
                        <div className="flex items-center gap-1">
                            <input
                                autoFocus
                                value={newFlowName}
                                onChange={e => setNewFlowName(e.target.value)}
                                placeholder="Nome do fluxo"
                                className="text-sm px-2 py-1 border border-[#A0792E] rounded-lg bg-white dark:bg-[#1d1d1d] text-gray-900 dark:text-white outline-none w-36"
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateFlow(); if (e.key === 'Escape') setCreatingFlow(false); }}
                            />
                            <button onClick={handleCreateFlow} className="text-emerald-500 hover:text-emerald-600"><Check size={15} /></button>
                            <button onClick={() => setCreatingFlow(false)} className="text-gray-400 hover:text-gray-600"><X size={15} /></button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setCreatingFlow(true)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border border-dashed border-gray-300 dark:border-[#3f3f3f] transition-all"
                        >
                            <Plus size={13} /> Novo fluxo
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {activeFlow && (
                        <button
                            onClick={() => setEditingFlow(!editingFlow)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-all ${editingFlow
                                ? 'bg-[#A0792E]/10 border-[#A0792E]/40 text-[#A0792E]'
                                : 'bg-white dark:bg-[#262626] border-gray-200 dark:border-[#2e2e2e] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            <Settings size={13} /> Editar
                        </button>
                    )}
                    {activeFlow && (
                        <button
                            onClick={() => handleDeleteFlow(activeFlow.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 border border-gray-200 dark:border-[#2e2e2e] bg-white dark:bg-[#262626] transition-colors"
                        >
                            <Trash2 size={13} />
                        </button>
                    )}
                    <button
                        onClick={() => setCeoMode(!ceoMode)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${ceoMode
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400'
                            : 'bg-white dark:bg-[#262626] border-gray-200 dark:border-[#2e2e2e] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                    >
                        <Eye size={13} /> CEO Mode
                    </button>
                </div>
            </div>

            {/* ── Flow Editor ───────────────────────────────────────────── */}
            {editingFlow && activeFlow && (
                <div className="bg-white dark:bg-[#262626] border border-[#A0792E]/30 rounded-2xl p-4">
                    <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
                        Editar etapas — {activeFlow.name}
                    </h3>
                    <div className="space-y-2">
                        {stages.map((stage, idx) => (
                            <div key={stage.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-[#1d1d1d]">
                                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                                {editingStageId === stage.id ? (
                                    <>
                                        <input
                                            value={stageEdits.name ?? stage.name}
                                            onChange={e => setStageEdits({ ...stageEdits, name: e.target.value })}
                                            className="flex-1 text-sm px-2 py-1 rounded bg-white dark:bg-[#262626] border border-[#A0792E] outline-none text-gray-900 dark:text-white"
                                        />
                                        <select
                                            value={stageEdits.weight ?? stage.weight}
                                            onChange={e => setStageEdits({ ...stageEdits, weight: Number(e.target.value) })}
                                            className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-[#3f3f3f] bg-white dark:bg-[#262626] text-gray-700 dark:text-gray-300"
                                        >
                                            {[1, 2, 3, 4, 5].map(w => <option key={w} value={w}>Peso {w}</option>)}
                                        </select>
                                        <div className="flex gap-1">
                                            {STAGE_COLORS.map(c => (
                                                <button
                                                    key={c}
                                                    onClick={() => setStageEdits({ ...stageEdits, color: c })}
                                                    className={`w-4 h-4 rounded-full border-2 transition-all ${(stageEdits.color ?? stage.color) === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}`}
                                                    style={{ backgroundColor: c }}
                                                />
                                            ))}
                                        </div>
                                        <button onClick={() => handleSaveStage(stage.id)} className="text-emerald-500"><Check size={14} /></button>
                                        <button onClick={() => { setEditingStageId(null); setStageEdits({}); }} className="text-gray-400"><X size={14} /></button>
                                    </>
                                ) : (
                                    <>
                                        <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{stage.name}</span>
                                        <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-[#2e2e2e] px-2 py-0.5 rounded">Peso {stage.weight}</span>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleReorderStage(stage.id, 'up')}
                                                disabled={idx === 0}
                                                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30"
                                            ><ChevronUp size={13} /></button>
                                            <button
                                                onClick={() => handleReorderStage(stage.id, 'down')}
                                                disabled={idx === stages.length - 1}
                                                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30"
                                            ><ChevronDown size={13} /></button>
                                            <button
                                                onClick={() => { setEditingStageId(stage.id); setStageEdits({ name: stage.name, weight: stage.weight, color: stage.color }); }}
                                                className="text-gray-400 hover:text-[#A0792E]"
                                            ><Edit2 size={13} /></button>
                                            <button onClick={() => handleDeleteStage(stage.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}

                        {/* Add stage */}
                        {addingStage ? (
                            <div className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-[#A0792E]/40">
                                <input
                                    autoFocus
                                    value={newStageName}
                                    onChange={e => setNewStageName(e.target.value)}
                                    placeholder="Nome da etapa"
                                    className="flex-1 text-sm px-2 py-1 rounded bg-white dark:bg-[#262626] border border-[#A0792E] outline-none text-gray-900 dark:text-white"
                                    onKeyDown={e => { if (e.key === 'Enter') handleAddStage(); if (e.key === 'Escape') setAddingStage(false); }}
                                />
                                <select
                                    value={newStageWeight}
                                    onChange={e => setNewStageWeight(Number(e.target.value))}
                                    className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-[#3f3f3f] bg-white dark:bg-[#262626] text-gray-700 dark:text-gray-300"
                                >
                                    {[1, 2, 3, 4, 5].map(w => <option key={w} value={w}>Peso {w}</option>)}
                                </select>
                                <div className="flex gap-1">
                                    {STAGE_COLORS.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setNewStageColor(c)}
                                            className={`w-4 h-4 rounded-full border-2 transition-all ${newStageColor === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                                <button onClick={handleAddStage} className="text-emerald-500"><Check size={14} /></button>
                                <button onClick={() => setAddingStage(false)} className="text-gray-400"><X size={14} /></button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setAddingStage(true)}
                                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-gray-300 dark:border-[#3f3f3f] text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-[#A0792E]/40 transition-all"
                            >
                                <Plus size={13} /> Adicionar etapa
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Flow Visualization ────────────────────────────────────── */}
            {!activeFlow ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <BarChart2 size={40} className="mb-3 opacity-30" />
                    <p className="text-sm font-medium">Nenhum fluxo criado</p>
                    <p className="text-xs mt-1">Clique em "+ Novo fluxo" para começar</p>
                </div>
            ) : stages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <p className="text-sm">Fluxo sem etapas — clique em "Editar" para adicionar etapas.</p>
                </div>
            ) : (
                <>
                    {/* Stage cards horizontal flow */}
                    <div className="overflow-x-auto pb-2">
                        <div className="flex items-stretch gap-0 min-w-max">
                            {stageMetrics.map((m, idx) => {
                                const isFocus = focusStage?.stage.id === m.stage.id;
                                const showOnCeo = !ceoMode || isFocus || m.overdueTasks.length > 0 || m.isBottleneck;

                                if (!showOnCeo) return (
                                    <div key={m.stage.id} className="flex items-center">
                                        <div className="opacity-30 flex flex-col items-center justify-center px-3 py-2 w-24 text-center">
                                            <div className="w-2 h-2 rounded-full mx-auto mb-1" style={{ backgroundColor: m.stage.color }} />
                                            <span className="text-[10px] text-gray-400 truncate w-full">{m.stage.name}</span>
                                        </div>
                                        {idx < stages.length - 1 && (
                                            <ArrowRight size={14} className="text-gray-300 dark:text-gray-700 shrink-0 mx-1" />
                                        )}
                                    </div>
                                );

                                return (
                                    <div key={m.stage.id} className="flex items-center">
                                        <div className={`relative flex flex-col w-[200px] rounded-2xl p-4 border transition-all ${isFocus
                                            ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-400/50 shadow-md shadow-amber-200/20 dark:shadow-amber-900/20'
                                            : m.isBottleneck
                                                ? 'bg-red-50 dark:bg-red-950/20 border-red-300/50'
                                                : 'bg-white dark:bg-[#262626] border-gray-200 dark:border-[#2e2e2e]'
                                            }`}>

                                            {/* Stage header */}
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.stage.color }} />
                                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate flex-1">
                                                    {m.stage.name}
                                                </span>
                                                <span className="text-[10px] text-gray-400 shrink-0">×{m.stage.weight}</span>
                                            </div>

                                            {/* Badges */}
                                            <div className="flex flex-wrap gap-1 mb-3">
                                                {isFocus && (
                                                    <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400">
                                                        <Zap size={9} /> FOCO
                                                    </span>
                                                )}
                                                {m.isBottleneck && (
                                                    <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-600 dark:text-red-400">
                                                        <AlertTriangle size={9} /> GARGALO
                                                    </span>
                                                )}
                                                {m.overdueTasks.length > 0 && (
                                                    <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400">
                                                        <Clock size={9} /> {m.overdueTasks.length} atras.
                                                    </span>
                                                )}
                                            </div>

                                            {/* Stats */}
                                            <div className="grid grid-cols-2 gap-2 mb-3">
                                                <div className="text-center">
                                                    <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{m.stageTasks.length}</p>
                                                    <p className="text-[10px] text-gray-400">tarefas</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className={`text-lg font-bold ${healthColor(m.progress)}`}>{m.progress}%</p>
                                                    <p className="text-[10px] text-gray-400">concluído</p>
                                                </div>
                                            </div>

                                            {/* Progress bar */}
                                            <div className="w-full bg-gray-100 dark:bg-[#1d1d1d] rounded-full h-1.5 mb-2">
                                                <div
                                                    className={`h-1.5 rounded-full transition-all ${healthBg(m.progress)}`}
                                                    style={{ width: `${m.progress}%` }}
                                                />
                                            </div>

                                            {/* ICE avg */}
                                            {m.avgIce > 0 && (
                                                <p className="text-[10px] text-gray-400">
                                                    ICE médio: <span className="font-semibold text-gray-600 dark:text-gray-400">{m.avgIce}</span>
                                                </p>
                                            )}

                                            {/* Open tasks list (top 3) */}
                                            {m.openTasks.length > 0 && (
                                                <div className="mt-3 space-y-1">
                                                    {m.openTasks.slice(0, 3).map(t => (
                                                        <div key={t.id} className="text-[11px] text-gray-600 dark:text-gray-400 truncate flex items-center gap-1">
                                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOverdue(t, doneStatus) ? 'bg-red-400' : 'bg-gray-300 dark:bg-gray-600'}`} />
                                                            {t.title}
                                                        </div>
                                                    ))}
                                                    {m.openTasks.length > 3 && (
                                                        <p className="text-[10px] text-gray-400">+{m.openTasks.length - 3} mais</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {idx < stages.length - 1 && (
                                            <ChevronRight size={18} className="text-gray-300 dark:text-gray-700 shrink-0 mx-2" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── FOCO AGORA panel ──────────────────────────────── */}
                    {focusStage && (
                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-400/40 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <Flame size={16} className="text-amber-500" />
                                <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400">FOCO AGORA</h3>
                                <span className="text-xs text-amber-600/70 dark:text-amber-500/70">— {activeFlow.name}</span>
                            </div>
                            <div className="flex items-start gap-4 flex-wrap">
                                <div className="min-w-[160px]">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: focusStage.stage.color }} />
                                        <span className="text-base font-bold text-gray-800 dark:text-gray-200">{focusStage.stage.name}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {focusStage.progress}% concluído · Peso {focusStage.stage.weight}
                                    </p>
                                    {focusStage.overdueTasks.length > 0 && (
                                        <p className="text-xs text-red-500 mt-0.5">{focusStage.overdueTasks.length} tarefa(s) atrasada(s)</p>
                                    )}
                                </div>

                                <div className="flex-1 min-w-[200px]">
                                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Tarefas prioritárias nesta etapa:</p>
                                    <div className="space-y-1.5">
                                        {focusStage.openTasks
                                            .sort((a, b) => {
                                                const wa = focusStage.stage.weight;
                                                return iceScore(b) * wa - iceScore(a) * wa;
                                            })
                                            .slice(0, 5)
                                            .map(t => (
                                                <div key={t.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                                    {isOverdue(t, doneStatus) && <Clock size={11} className="text-red-400 shrink-0" />}
                                                    {t.priority === 'Alta' && <Flame size={11} className="text-amber-500 shrink-0" />}
                                                    <span className="truncate flex-1">{t.title}</span>
                                                    {iceScore(t) > 0 && (
                                                        <span className="text-[10px] text-gray-400 shrink-0">
                                                            score: {Math.round(iceScore(t) * focusStage.stage.weight)}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Bottom panels ─────────────────────────────────── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                        {/* Impact ranking */}
                        <div className="bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-2xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <TrendingUp size={14} className="text-[#A0792E]" />
                                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Top Impacto</h3>
                                <span className="text-[10px] text-gray-400">ICE × peso da etapa</span>
                            </div>
                            {impactRanking.length === 0 ? (
                                <p className="text-xs text-gray-400">Nenhuma tarefa com score ICE definido.</p>
                            ) : (
                                <div className="space-y-2">
                                    {impactRanking.map((item, i) => (
                                        <div key={item.task.id} className="flex items-center gap-3">
                                            <span className={`text-xs font-bold w-4 shrink-0 ${i === 0 ? 'text-[#A0792E]' : 'text-gray-400'}`}>
                                                {i + 1}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{item.task.title}</p>
                                                <p className="text-[10px] text-gray-400">{item.task.status}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className="text-sm font-bold text-[#A0792E]">{item.score}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Tasks without stage */}
                        <div className="bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-2xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <AlertTriangle size={14} className={tasksWithoutStage.length > 0 ? 'text-amber-500' : 'text-gray-400'} />
                                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Sem Etapa Estratégica</h3>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${tasksWithoutStage.length > 0
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                    : 'bg-gray-100 dark:bg-[#2e2e2e] text-gray-400'
                                    }`}>
                                    {tasksWithoutStage.length}
                                </span>
                            </div>
                            {tasksWithoutStage.length === 0 ? (
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <Check size={12} /> Todas as tarefas têm etapa definida.
                                </p>
                            ) : (
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                    {tasksWithoutStage.map(t => (
                                        <div key={t.id} className="flex items-center gap-2">
                                            <span className="text-sm text-gray-600 dark:text-gray-400 flex-1 truncate">{t.title}</span>
                                            <select
                                                value=""
                                                onChange={e => { if (e.target.value) handleAssignTaskToStage(t.id, e.target.value); }}
                                                className="text-[11px] px-1.5 py-0.5 rounded border border-gray-200 dark:border-[#3f3f3f] bg-white dark:bg-[#262626] text-gray-600 dark:text-gray-400 outline-none"
                                            >
                                                <option value="">Atribuir etapa</option>
                                                {stages.map(s => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
