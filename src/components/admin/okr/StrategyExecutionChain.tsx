'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
    Target, Briefcase, ArrowRight, ChevronRight, AlertTriangle, Clock,
    CheckCircle2, Users, Crown, MessageSquare, Trophy, Sparkles, Gavel,
    Activity, Plus,
} from 'lucide-react';
import { TacticalObjective } from '@/app/sistema/actions/tactical-strategic';
import { TacticalTask } from '@/app/sistema/actions/tactical-tasks';
import { OKRSnapshot } from '@/app/sistema/actions/okr-snapshot';

// ── Helpers ────────────────────────────────────────────────────────────────
// Mantemos cópias locais e enxutas dos helpers de quarter/pacing usados em
// OKRView. Duplicar ~30 linhas é mais barato do que expor utilitários só pra
// isso; quando o terceiro consumidor aparecer, extraímos pra src/lib.

type ObjStatus = 'completed' | 'ahead' | 'on_track' | 'at_risk' | 'behind' | 'not_started';

function computeQuarterPacing(quarter: string) {
    const match = quarter.match(/Q(\d)\s+(\d{4})/);
    if (!match) return null;
    const q = parseInt(match[1]);
    const year = parseInt(match[2]);
    const startMonth = (q - 1) * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0);
    const now = new Date();
    const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000);
    if (now < start) return { pct: 0, phase: 'future' as const };
    if (now > end) return { pct: 100, phase: 'past' as const };
    const daysElapsed = Math.round((now.getTime() - start.getTime()) / 86400000);
    return { pct: Math.round((daysElapsed / totalDays) * 100), phase: 'active' as const };
}

function getStatus(progress: number, quarterPct: number, phase: string): ObjStatus {
    if (progress >= 100) return 'completed';
    if (phase === 'future') return 'not_started';
    const gap = progress - quarterPct;
    if (gap >= 5) return 'ahead';
    if (gap >= -10) return 'on_track';
    if (gap >= -25) return 'at_risk';
    return 'behind';
}

function quarterRange(quarter: string): { start: string; end: string } | null {
    const match = quarter.match(/Q(\d)\s+(\d{4})/);
    if (!match) return null;
    const q = parseInt(match[1]);
    const year = parseInt(match[2]);
    const startMonth = (q - 1) * 3;
    const start = new Date(year, startMonth, 1).toISOString().split('T')[0];
    const end = new Date(year, startMonth + 3, 0).toISOString().split('T')[0];
    return { start, end };
}

const STATUS_CFG: Record<ObjStatus, { label: string; color: string; bg: string; text: string; border: string }> = {
    completed:   { label: 'Concluído',    color: '#10B981', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-500/30' },
    ahead:       { label: 'Adiantado',    color: '#3B82F6', bg: 'bg-blue-50 dark:bg-blue-500/10',       text: 'text-blue-700 dark:text-blue-400',       border: 'border-blue-200 dark:border-blue-500/30' },
    on_track:    { label: 'No ritmo',     color: '#10B981', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-500/30' },
    at_risk:     { label: 'Em risco',     color: '#F59E0B', bg: 'bg-amber-50 dark:bg-amber-500/10',     text: 'text-amber-700 dark:text-amber-400',     border: 'border-amber-200 dark:border-amber-500/30' },
    behind:      { label: 'Atrasado',     color: '#EF4444', bg: 'bg-red-50 dark:bg-red-500/10',         text: 'text-red-700 dark:text-red-400',         border: 'border-red-200 dark:border-red-500/30' },
    not_started: { label: 'Não iniciado', color: '#9CA3AF', bg: 'bg-gray-50 dark:bg-gray-500/10',        text: 'text-gray-500 dark:text-gray-400',       border: 'border-gray-200 dark:border-gray-500/20' },
};

const fmtBRL = (v: number) => {
    if (!v) return 'R$ 0';
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
    return `R$ ${v}`;
};

interface ChainIndicator {
    label: string;
    value: string;
    trend?: number;
    href: string;
    icon: React.ReactNode;
    color: string;
}

function detectIndicators(obj: TacticalObjective, snapshot: OKRSnapshot): ChainIndicator[] {
    const text = `${obj.title} ${obj.description ?? ''} ${(obj.key_results ?? []).map(k => k.title).join(' ')}`.toLowerCase();
    const has = (...ks: string[]) => ks.some(k => text.includes(k));
    const out: ChainIndicator[] = [];

    if (has('lead', 'capta', 'aquisi')) {
        out.push({
            label: 'Leads · 30d', value: String(snapshot.leads.new30d),
            trend: snapshot.leads.prev30d > 0 ? snapshot.leads.trendDeltaPct : undefined,
            href: '/crm', icon: <Users size={11} />, color: '#A0792E',
        });
    }
    if (has('mql', 'qualific')) {
        out.push({
            label: 'MQLs ativos', value: String(snapshot.leads.mqlActive),
            href: '/crm', icon: <Crown size={11} />, color: '#D4A85C',
        });
    }
    if (has('conver', 'fech', 'venda', 'cliente')) {
        out.push({
            label: 'Conversão', value: `${snapshot.leads.conversionPct.toFixed(0)}%`,
            href: '/crm', icon: <CheckCircle2 size={11} />, color: '#10B981',
        });
    }
    if (has('vgv', 'leil', 'receita', 'fatur', 'resultado')) {
        out.push({
            label: 'VGV · 90d', value: fmtBRL(snapshot.auctions.vgv90d),
            href: '/leiloes', icon: <Trophy size={11} />, color: '#7FD4A0',
        });
        if (snapshot.auctions.roi90dPct > 0) {
            out.push({
                label: 'ROI · 90d', value: `${snapshot.auctions.roi90dPct.toFixed(0)}%`,
                href: '/leiloes', icon: <Gavel size={11} />, color: '#1E3A5F',
            });
        }
    }
    if (has('whatsapp', 'mensagem', 'engaj', 'resposta', 'atendimento')) {
        out.push({
            label: 'Resp. WPP', value: `${snapshot.whatsapp.replyRatePct.toFixed(0)}%`,
            href: '/whatsapp', icon: <MessageSquare size={11} />, color: '#3B82F6',
        });
    }
    if (has('pipeline', 'oportun')) {
        out.push({
            label: 'Pipeline', value: fmtBRL(snapshot.leads.pipelineValue),
            href: '/crm', icon: <Target size={11} />, color: '#1E3A5F',
        });
    }
    return out;
}

// ── Component ───────────────────────────────────────────────────────────────

interface Props {
    objectives: TacticalObjective[];
    tasks: TacticalTask[];
    snapshot: OKRSnapshot;
    doneStatus?: string;
}

export function StrategyExecutionChain({ objectives, tasks, snapshot, doneStatus }: Props) {
    const lanes = useMemo(() => {
        return objectives.map(obj => {
            const krs = obj.key_results ?? [];
            const progress = krs.length > 0
                ? Math.round(krs.reduce((a, kr) => a + (kr.progress ?? 0), 0) / krs.length)
                : 0;

            const linkedTaskIds = new Set<string>();
            for (const kr of krs) {
                (snapshot.krTaskLinks[kr.id] ?? []).forEach(id => linkedTaskIds.add(id));
            }
            const linkedTasks = tasks.filter(t => linkedTaskIds.has(t.id));
            const linkedDone = linkedTasks.filter(t => t.status === doneStatus).length;
            const linkedOpen = linkedTasks.filter(t => t.status !== doneStatus);
            const overdueSet = new Set(
                linkedOpen.filter(t => t.due_date && new Date(t.due_date) < new Date()).map(t => t.id)
            );
            const linkedOverdue = linkedOpen.filter(t => overdueSet.has(t.id));
            const linkedInProgress = linkedOpen.filter(t => !overdueSet.has(t.id));

            const indicators = detectIndicators(obj, snapshot);

            const pacing = computeQuarterPacing(obj.quarter);
            const status = getStatus(progress, pacing?.pct ?? 0, pacing?.phase ?? 'active');
            const gap = pacing ? progress - pacing.pct : 0;

            const range = quarterRange(obj.quarter);
            const fechamentosQ = range
                ? snapshot.auctions.recent.filter(f => f.data >= range.start && f.data <= range.end)
                : [];
            const upcomingQ = range
                ? snapshot.auctions.upcoming.filter(l => l.data >= range.start && l.data <= range.end)
                : [];

            return {
                obj, progress, krs,
                linkedTasks, linkedDone, linkedOpen, linkedOverdue, linkedInProgress,
                indicators, status, gap,
                fechamentosQ, upcomingQ,
            };
        }).sort((a, b) => {
            const order: ObjStatus[] = ['behind', 'at_risk', 'on_track', 'ahead', 'not_started', 'completed'];
            return order.indexOf(a.status) - order.indexOf(b.status);
        });
    }, [objectives, tasks, snapshot, doneStatus]);

    if (objectives.length === 0) {
        return <EmptyChainPreview snapshot={snapshot} />;
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-[#A0792E]" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                        Estratégia <span className="text-gray-300">→</span> Projetos <span className="text-gray-300">→</span> Tarefas <span className="text-gray-300">→</span> Indicadores
                    </h3>
                </div>
                <Link href="/okr?tab=okrs" className="text-[10px] font-bold uppercase tracking-wider text-[#A0792E] flex items-center gap-0.5 hover:underline">
                    detalhar OKRs <ArrowRight size={10} />
                </Link>
            </div>

            {/* Column headers — visíveis só em telas largas */}
            <div className="hidden lg:grid grid-cols-[1.1fr_1.3fr_1.3fr_1.5fr] gap-3 px-3">
                <ColHeader idx={1} label="ESTRATÉGIA" hint="Objetivo + ritmo" />
                <ColHeader idx={2} label="RESULTADOS-CHAVE" hint="O que medimos" />
                <ColHeader idx={3} label="PROJETOS & TAREFAS" hint="O que destrava" />
                <ColHeader idx={4} label="INDICADORES REAIS" hint="O que está acontecendo" />
            </div>

            <div className="space-y-2.5">
                {lanes.slice(0, 5).map(lane => (
                    <Lane key={lane.obj.id} lane={lane} />
                ))}
            </div>

            {lanes.length > 5 && (
                <p className="text-[10px] text-gray-400 text-center pt-1">
                    +{lanes.length - 5} objetivo(s) ocultos — veja todos em{' '}
                    <Link href="/okr?tab=okrs" className="text-[#A0792E] underline">Objetivos</Link>
                </p>
            )}
        </div>
    );
}

// ── Lane ────────────────────────────────────────────────────────────────────

interface LaneData {
    obj: TacticalObjective;
    progress: number;
    krs: NonNullable<TacticalObjective['key_results']>;
    linkedTasks: TacticalTask[];
    linkedDone: number;
    linkedOpen: TacticalTask[];
    linkedOverdue: TacticalTask[];
    linkedInProgress: TacticalTask[];
    indicators: ChainIndicator[];
    status: ObjStatus;
    gap: number;
    fechamentosQ: OKRSnapshot['auctions']['recent'];
    upcomingQ: OKRSnapshot['auctions']['upcoming'];
}

function Lane({ lane }: { lane: LaneData }) {
    const cfg = STATUS_CFG[lane.status];
    const obj = lane.obj;

    const blockerCount = lane.linkedOverdue.length;

    return (
        <div
            className="rounded-xl border bg-white dark:bg-[#1B1B1B] overflow-hidden transition-colors"
            style={{
                borderColor:
                    lane.status === 'behind' ? '#EF44444D'
                    : lane.status === 'at_risk' ? '#F59E0B4D'
                    : '#1f1f1f1A',
            }}
        >
            <div
                className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.3fr_1.3fr_1.5fr] divide-y lg:divide-y-0 lg:divide-x divide-gray-100 dark:divide-[#262626]"
            >
                {/* ── Col 1: Estratégia ─────────────────────────────── */}
                <div className="p-3 relative" style={{ borderLeft: `3px solid ${obj.color}` }}>
                    <span className="lg:hidden text-[9px] font-bold text-gray-400 uppercase tracking-widest">1. Estratégia</span>
                    <div className="flex items-start gap-2.5 mt-1 lg:mt-0">
                        <Ring pct={lane.progress} color={cfg.color} size={46} sw={4.5} />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-900 dark:text-white leading-snug line-clamp-2">{obj.title}</p>
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                                <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                    {cfg.label}
                                </span>
                                <span className="text-[9px] text-gray-400">{obj.quarter}</span>
                            </div>
                            {lane.status !== 'completed' && lane.status !== 'not_started' && (
                                <p className={`text-[9px] mt-0.5 font-mono font-bold ${
                                    lane.gap >= 0 ? 'text-emerald-500' : lane.gap >= -15 ? 'text-amber-500' : 'text-red-500'
                                }`}>
                                    {lane.gap >= 0 ? '+' : ''}{lane.gap}pp vs ritmo
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Col 2: KRs ────────────────────────────────────── */}
                <div className="p-3">
                    <span className="lg:hidden text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">2. Resultados-Chave</span>
                    {lane.krs.length === 0 ? (
                        <EmptyCell
                            text="Sem KRs definidos"
                            hint="Defina o que mede esse objetivo"
                            cta="Adicionar KR"
                            href="/okr?tab=okrs"
                        />
                    ) : (
                        <div className="space-y-1.5">
                            {lane.krs.slice(0, 3).map(kr => {
                                const p = kr.progress ?? 0;
                                const c = p >= 70 ? '#10B981' : p >= 40 ? '#F59E0B' : '#EF4444';
                                return (
                                    <div key={kr.id}>
                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                            <span className="text-[10px] text-gray-700 dark:text-gray-300 truncate flex-1 leading-tight">{kr.title}</span>
                                            <span className="text-[10px] font-bold font-mono shrink-0" style={{ color: c }}>{p}%</span>
                                        </div>
                                        <div className="h-1 bg-gray-100 dark:bg-[#262626] rounded-full overflow-hidden">
                                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${p}%`, backgroundColor: c }} />
                                        </div>
                                    </div>
                                );
                            })}
                            {lane.krs.length > 3 && (
                                <p className="text-[9px] text-gray-400 pt-0.5">+{lane.krs.length - 3} KR(s)</p>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Col 3: Projetos & Tarefas ──────────────────────── */}
                <div className="p-3">
                    <span className="lg:hidden text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">3. Projetos & Tarefas</span>
                    {lane.linkedTasks.length === 0 ? (
                        <EmptyCell
                            text="Nenhuma tarefa vinculada"
                            hint="Vincule tarefas aos KRs no plano tático para conectar execução ao objetivo"
                            cta="Vincular tarefa"
                            href="/projetos"
                        />
                    ) : (
                        <div>
                            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                <Pill color="#10B981" label={`${lane.linkedDone} feita${lane.linkedDone !== 1 ? 's' : ''}`} icon={<CheckCircle2 size={9} />} />
                                <Pill color="#A0792E" label={`${lane.linkedInProgress.length} em curso`} icon={<Briefcase size={9} />} />
                                {blockerCount > 0 && (
                                    <Pill color="#EF4444" label={`${blockerCount} atrasada${blockerCount !== 1 ? 's' : ''}`} icon={<Clock size={9} />} />
                                )}
                            </div>
                            <ul className="space-y-0.5">
                                {lane.linkedOverdue.slice(0, 2).map(t => (
                                    <li key={t.id} className="flex items-center gap-1.5 text-[10px]">
                                        <span className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
                                        <span className="text-gray-800 dark:text-gray-200 truncate flex-1">{t.title}</span>
                                        <span className="text-[8px] text-red-500 font-bold shrink-0">⏰ atrasada</span>
                                    </li>
                                ))}
                                {lane.linkedInProgress.slice(0, Math.max(0, 3 - Math.min(2, lane.linkedOverdue.length))).map(t => (
                                    <li key={t.id} className="flex items-center gap-1.5 text-[10px]">
                                        <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                                        <span className="text-gray-600 dark:text-gray-400 truncate flex-1">{t.title}</span>
                                        <span className="text-[8px] text-gray-400 shrink-0">{t.status}</span>
                                    </li>
                                ))}
                            </ul>
                            <Link href="/projetos" className="text-[9px] font-bold text-[#A0792E] hover:underline flex items-center gap-0.5 mt-1.5">
                                abrir tarefas <ChevronRight size={9} />
                            </Link>
                        </div>
                    )}
                </div>

                {/* ── Col 4: Indicadores reais ───────────────────────── */}
                <div className="p-3">
                    <span className="lg:hidden text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">4. Indicadores reais</span>
                    {lane.indicators.length === 0 ? (
                        <EmptyCell
                            text="Sem indicadores ligados"
                            hint="Use palavras-chave nos KRs (leads, MQL, VGV, conversão, WhatsApp...) para o painel conectar dado real"
                        />
                    ) : (
                        <div className="grid grid-cols-2 gap-1.5">
                            {lane.indicators.slice(0, 4).map((ind, i) => (
                                <Link
                                    key={i}
                                    href={ind.href}
                                    className="rounded-lg border border-gray-100 dark:border-[#2e2e2e] p-1.5 hover:bg-gray-50 dark:hover:bg-[#262626] transition-colors group"
                                >
                                    <div className="flex items-center gap-1 mb-0.5">
                                        <span style={{ color: ind.color }}>{ind.icon}</span>
                                        <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">{ind.label}</span>
                                    </div>
                                    <div className="flex items-baseline gap-1">
                                        <p className="text-xs font-black text-gray-900 dark:text-white font-mono leading-none">{ind.value}</p>
                                        {typeof ind.trend === 'number' && (
                                            <span className={`text-[9px] font-bold ${ind.trend >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                {ind.trend >= 0 ? '+' : ''}{ind.trend.toFixed(0)}%
                                            </span>
                                        )}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Rodapé contextual: leilões do trimestre + alerta de bloqueio */}
            {(lane.fechamentosQ.length > 0 || lane.upcomingQ.length > 0 || blockerCount > 0) && (
                <div className="border-t border-gray-100 dark:border-[#262626] px-3 py-1.5 bg-gray-50/60 dark:bg-[#171717] flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                    {lane.upcomingQ.length > 0 && (
                        <span className="text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
                            <Gavel size={10} className="text-amber-500" />
                            {lane.upcomingQ.length} leilão{lane.upcomingQ.length !== 1 ? 'ões' : ''} no trimestre
                        </span>
                    )}
                    {lane.fechamentosQ.length > 0 && (
                        <span className="text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
                            <Activity size={10} className="text-emerald-500" />
                            {lane.fechamentosQ.length} fechamento{lane.fechamentosQ.length !== 1 ? 's' : ''}
                            {' · '}
                            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                {fmtBRL(lane.fechamentosQ.reduce((s, f) => s + f.vgv_total, 0))}
                            </span>
                            {' VGV'}
                        </span>
                    )}
                    {blockerCount > 0 && (
                        <span className="text-red-600 dark:text-red-400 font-bold inline-flex items-center gap-1 ml-auto">
                            <AlertTriangle size={10} />
                            {blockerCount} tarefa{blockerCount !== 1 ? 's' : ''} bloqueando este objetivo
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Ring({ pct, color, size = 46, sw = 4.5 }: { pct: number; color: string; size?: number; sw?: number }) {
    const r = (size - sw) / 2;
    const circ = 2 * Math.PI * r;
    const clamped = Math.min(100, Math.max(0, pct));
    const dash = (clamped / 100) * circ;
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={sw}
                    stroke="#e5e7eb" className="dark:stroke-[#2e2e2e]" />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={sw}
                    stroke={color}
                    strokeDasharray={`${dash.toFixed(2)} ${(circ - dash).toFixed(2)}`}
                    strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-black text-gray-800 dark:text-gray-200 leading-none">{pct}%</span>
            </div>
        </div>
    );
}

function Pill({ color, label, icon }: { color: string; label: string; icon?: React.ReactNode }) {
    return (
        <span
            className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md font-mono"
            style={{ color, backgroundColor: `${color}14` }}
        >
            {icon}{label}
        </span>
    );
}

function EmptyCell({ text, hint, cta, href }: { text: string; hint?: string; cta?: string; href?: string }) {
    return (
        <div className="h-full min-h-[60px] flex flex-col items-center justify-center text-center py-2 px-1">
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{text}</p>
            {hint && <p className="text-[9px] text-gray-300 dark:text-gray-600 mt-0.5 leading-tight">{hint}</p>}
            {cta && href && (
                <Link href={href} className="text-[9px] font-bold text-[#A0792E] hover:underline mt-1.5 inline-flex items-center gap-0.5">
                    {cta} <ChevronRight size={9} />
                </Link>
            )}
        </div>
    );
}

function ColHeader({ idx, label, hint }: { idx: number; label: string; hint: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-md bg-[#A0792E]/10 text-[#A0792E] text-[9px] font-black flex items-center justify-center shrink-0">
                {idx}
            </span>
            <div className="min-w-0">
                <p className="text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase tracking-widest leading-none">{label}</p>
                <p className="text-[9px] text-gray-400 leading-tight mt-0.5">{hint}</p>
            </div>
        </div>
    );
}

// ── Empty preview ──────────────────────────────────────────────────────────
// Quando ainda não há OKRs cadastrados, renderiza a MESMA estrutura de 4
// colunas com placeholders nas 3 primeiras e indicadores reais (vivos) na
// 4ª. Faz o usuário ver a forma final da ferramenta — e o que ele perde por
// não ter cadastrado um objetivo ainda.

function EmptyChainPreview({ snapshot }: { snapshot: OKRSnapshot }) {
    // Indicadores reais que detectamos *sem* depender de KRs — pegamos os 4
    // mais expressivos do snapshot pra ilustrar.
    const liveIndicators: ChainIndicator[] = [
        {
            label: 'Leads · 30d', value: String(snapshot.leads.new30d),
            trend: snapshot.leads.prev30d > 0 ? snapshot.leads.trendDeltaPct : undefined,
            href: '/crm', icon: <Users size={11} />, color: '#A0792E',
        },
        {
            label: 'MQLs ativos', value: String(snapshot.leads.mqlActive),
            href: '/crm', icon: <Crown size={11} />, color: '#D4A85C',
        },
        {
            label: 'VGV · 90d', value: fmtBRL(snapshot.auctions.vgv90d),
            href: '/leiloes', icon: <Trophy size={11} />, color: '#7FD4A0',
        },
        {
            label: 'Pipeline', value: fmtBRL(snapshot.leads.pipelineValue),
            href: '/crm', icon: <Target size={11} />, color: '#1E3A5F',
        },
    ];

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-[#A0792E]" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                        Estratégia <span className="text-gray-300">→</span> Projetos <span className="text-gray-300">→</span> Tarefas <span className="text-gray-300">→</span> Indicadores
                    </h3>
                </div>
                <Link
                    href="/okr?tab=okrs"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#A0792E] to-[#D4A85C] text-black rounded-lg font-bold text-[11px] hover:shadow-md transition-all"
                >
                    <Plus size={12} /> Criar primeiro objetivo
                </Link>
            </div>

            {/* Banner explicativo */}
            <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5 px-3 py-2 flex items-start gap-2">
                <AlertTriangle size={12} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
                    <span className="font-bold">Você ainda não tem objetivos cadastrados.</span>{' '}
                    Sem OKRs, a página é só um dashboard de indicadores soltos. Cadastre o primeiro objetivo pra
                    o painel começar a explicar <em>quais projetos</em> e <em>quais tarefas</em> explicam — ou
                    travam — esses números que você vê na coluna 4.
                </p>
            </div>

            {/* Column headers */}
            <div className="hidden lg:grid grid-cols-[1.1fr_1.3fr_1.3fr_1.5fr] gap-3 px-3">
                <ColHeader idx={1} label="ESTRATÉGIA" hint="Objetivo + ritmo" />
                <ColHeader idx={2} label="RESULTADOS-CHAVE" hint="O que medimos" />
                <ColHeader idx={3} label="PROJETOS & TAREFAS" hint="O que destrava" />
                <ColHeader idx={4} label="INDICADORES REAIS" hint="O que está acontecendo" />
            </div>

            {/* Preview lane */}
            <div className="rounded-xl border border-dashed border-gray-300 dark:border-[#363636] bg-white/50 dark:bg-[#1B1B1B]/60 overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.3fr_1.3fr_1.5fr] divide-y lg:divide-y-0 lg:divide-x divide-gray-100 dark:divide-[#262626]">

                    {/* Col 1 — CTA */}
                    <div className="p-3 relative border-l-[3px] border-l-gray-300 dark:border-l-[#3f3f3f]">
                        <span className="lg:hidden text-[9px] font-bold text-gray-400 uppercase tracking-widest">1. Estratégia</span>
                        <div className="flex flex-col items-start gap-2 mt-1 lg:mt-0">
                            <div className="w-10 h-10 rounded-xl bg-[#A0792E]/10 border border-dashed border-[#A0792E]/40 flex items-center justify-center">
                                <Target size={16} className="text-[#A0792E]" />
                            </div>
                            <p className="text-xs font-bold text-gray-700 dark:text-gray-300 leading-snug">
                                Ex.: <span className="text-gray-400 dark:text-gray-500 italic">"Bater R$ 10M de VGV em Q2 2026"</span>
                            </p>
                            <Link
                                href="/okr?tab=okrs"
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-[#A0792E] hover:underline"
                            >
                                <Plus size={10} /> Criar objetivo
                            </Link>
                        </div>
                    </div>

                    {/* Col 2 — Ghost KRs */}
                    <div className="p-3">
                        <span className="lg:hidden text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">2. Resultados-Chave</span>
                        <div className="space-y-1.5 opacity-60">
                            <GhostBar label="KR 1 — 12 leilões fechados" />
                            <GhostBar label="KR 2 — 300 leads/mês" />
                            <GhostBar label="KR 3 — Conversão MQL ≥ 25%" />
                        </div>
                        <p className="text-[9px] text-gray-400 mt-2 leading-tight">
                            KRs viram barras de progresso reais aqui.
                        </p>
                    </div>

                    {/* Col 3 — Ghost tasks */}
                    <div className="p-3">
                        <span className="lg:hidden text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">3. Projetos & Tarefas</span>
                        <div className="opacity-60">
                            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md font-mono text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10">
                                    <CheckCircle2 size={9} /> 0 feitas
                                </span>
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md font-mono text-[#A0792E] bg-[#A0792E]/10">
                                    <Briefcase size={9} /> 0 em curso
                                </span>
                            </div>
                            <ul className="space-y-0.5">
                                <li className="flex items-center gap-1.5 text-[10px] text-gray-400">
                                    <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                                    <span className="italic">"Captar leads MT/MS"</span>
                                </li>
                                <li className="flex items-center gap-1.5 text-[10px] text-gray-400">
                                    <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                                    <span className="italic">"Fechar pauta Camparino"</span>
                                </li>
                            </ul>
                        </div>
                        <p className="text-[9px] text-gray-400 mt-2 leading-tight">
                            Vincule tarefas a KRs no <Link href="/projetos" className="text-[#A0792E] hover:underline">plano tático</Link>.
                        </p>
                    </div>

                    {/* Col 4 — REAL indicators (live) */}
                    <div className="p-3 bg-emerald-50/30 dark:bg-emerald-500/[0.03]">
                        <span className="lg:hidden text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">4. Indicadores reais</span>
                        <div className="grid grid-cols-2 gap-1.5">
                            {liveIndicators.map((ind, i) => (
                                <Link
                                    key={i}
                                    href={ind.href}
                                    className="rounded-lg border border-gray-100 dark:border-[#2e2e2e] bg-white dark:bg-[#1B1B1B] p-1.5 hover:bg-gray-50 dark:hover:bg-[#262626] transition-colors"
                                >
                                    <div className="flex items-center gap-1 mb-0.5">
                                        <span style={{ color: ind.color }}>{ind.icon}</span>
                                        <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">{ind.label}</span>
                                    </div>
                                    <div className="flex items-baseline gap-1">
                                        <p className="text-xs font-black text-gray-900 dark:text-white font-mono leading-none">{ind.value}</p>
                                        {typeof ind.trend === 'number' && (
                                            <span className={`text-[9px] font-bold ${ind.trend >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                {ind.trend >= 0 ? '+' : ''}{ind.trend.toFixed(0)}%
                                            </span>
                                        )}
                                    </div>
                                </Link>
                            ))}
                        </div>
                        <p className="text-[9px] text-emerald-700 dark:text-emerald-400 font-bold mt-2 leading-tight inline-flex items-center gap-1">
                            <Activity size={10} /> Indicadores já estão vivos — só falta ligar a um objetivo.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function GhostBar({ label }: { label: string }) {
    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate flex-1 italic">{label}</span>
                <span className="text-[10px] font-bold font-mono text-gray-300">—%</span>
            </div>
            <div className="h-1 bg-gray-100 dark:bg-[#262626] rounded-full overflow-hidden" />
        </div>
    );
}
