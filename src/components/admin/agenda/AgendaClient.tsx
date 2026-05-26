'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
    Plus, ChevronLeft, ChevronRight, CalendarDays, Columns3, Square,
    List as ListIcon, Filter, AlertTriangle, Calendar as CalIcon, MapPin,
    Clock, User, Gavel, Briefcase, ListChecks, ScrollText, Award,
    UserCircle2, Sparkles, X, ExternalLink,
} from 'lucide-react';
import type { AgendaEvent, AgendaEventInput, AgendaRelatedOptions, AgendaEventType } from '@/app/sistema/actions/agenda';
import { createAgendaEvent, updateAgendaEvent, deleteAgendaEvent } from '@/app/sistema/actions/agenda';
import {
    EVENT_TYPES, EVENT_TYPES_MAP, EVENT_STATUS_MAP, PRIORITY_DOT,
    MES_NOMES, DIAS_CURTOS,
    startOfDay, sameDay, addDays, addMonths, startOfMonth, startOfWeek,
    formatHora, formatDataLonga,
} from './types';
import { EventModal } from './EventModal';

interface Props {
    initialEvents: AgendaEvent[];
    options: AgendaRelatedOptions;
}

type ViewMode = 'mes' | 'semana' | 'dia' | 'lista';
const VALID_VIEWS: ViewMode[] = ['mes', 'semana', 'dia', 'lista'];

const VIEW_LABEL: Record<ViewMode, { label: string; icon: typeof CalendarDays }> = {
    mes:    { label: 'Mês',    icon: CalendarDays },
    semana: { label: 'Semana', icon: Columns3 },
    dia:    { label: 'Dia',    icon: Square },
    lista:  { label: 'Lista',  icon: ListIcon },
};

export function AgendaClient({ initialEvents, options }: Props) {
    const [events, setEvents] = useState<AgendaEvent[]>(initialEvents);
    const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()));
    const [typeFilters, setTypeFilters] = useState<Set<AgendaEventType>>(new Set());
    const [responsibleFilter, setResponsibleFilter] = useState<string>('');
    const [showFilters, setShowFilters] = useState(false);

    const [creating, setCreating] = useState(false);
    const [createPreset, setCreatePreset] = useState<Date | null>(null);

    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const rawView = searchParams.get('view');
    const view: ViewMode = (rawView && (VALID_VIEWS as string[]).includes(rawView))
        ? (rawView as ViewMode) : 'mes';

    // editing is derived state from the URL — no useEffect needed
    const eventId = searchParams.get('event');
    const editing = useMemo<AgendaEvent | null>(
        () => (eventId ? events.find(e => e.id === eventId) ?? null : null),
        [eventId, events]
    );

    const setView = useCallback((v: ViewMode) => {
        const params = new URLSearchParams(searchParams.toString());
        if (v === 'mes') params.delete('view'); else params.set('view', v);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [pathname, router, searchParams]);

    const openEvent = useCallback((id: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('event', id);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, [pathname, router, searchParams]);

    const closeEvent = useCallback(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('event');
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        setCreating(false);
        setCreatePreset(null);
    }, [pathname, router, searchParams]);

    // ── Filtering ─────────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        return events.filter(e => {
            if (typeFilters.size > 0 && !typeFilters.has(e.event_type)) return false;
            if (responsibleFilter && e.responsible_member_id !== responsibleFilter) return false;
            return true;
        });
    }, [events, typeFilters, responsibleFilter]);

    // Index events by day-key for fast lookup
    const byDay = useMemo(() => {
        const m = new Map<string, AgendaEvent[]>();
        for (const e of filtered) {
            const key = dayKey(new Date(e.start_at));
            const arr = m.get(key) ?? [];
            arr.push(e);
            m.set(key, arr);
        }
        // Sort within day
        for (const arr of m.values()) arr.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
        return m;
    }, [filtered]);

    // ── Counts for sidebar filter chips ──────────────────────────────────────
    const typeCounts = useMemo(() => {
        const c: Partial<Record<AgendaEventType, number>> = {};
        for (const e of events) c[e.event_type] = (c[e.event_type] ?? 0) + 1;
        return c;
    }, [events]);

    // ── Alerts ───────────────────────────────────────────────────────────────
    const alerts = useMemo(() => {
        const now = new Date();
        const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const overdue: AgendaEvent[] = [];
        const next24: AgendaEvent[] = [];
        const noResponsible: AgendaEvent[] = [];

        for (const e of events) {
            const start = new Date(e.start_at);
            if (e.status !== 'concluido' && e.status !== 'cancelado') {
                if (start < now) overdue.push(e);
                else if (start <= in24h) next24.push(e);
            }
            if (!e.responsible_member_id && e.status !== 'concluido' && e.status !== 'cancelado') {
                noResponsible.push(e);
            }
        }
        overdue.sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());
        next24.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
        return { overdue, next24, noResponsible };
    }, [events]);

    // ── Mutation handlers ────────────────────────────────────────────────────
    const handleSave = useCallback(async (payload: Partial<AgendaEventInput>) => {
        if (editing) {
            const updated = await updateAgendaEvent(editing.id, payload);
            setEvents(prev => prev.map(e => e.id === updated.id ? updated : e));
        } else {
            const created = await createAgendaEvent(payload);
            setEvents(prev => [...prev, created]);
        }
    }, [editing]);

    const handleDelete = useCallback(async (id: string) => {
        await deleteAgendaEvent(id);
        setEvents(prev => prev.filter(e => e.id !== id));
        closeEvent();
    }, [closeEvent]);

    // ── Navigation ───────────────────────────────────────────────────────────
    const goPrev = () => {
        if (view === 'mes') setCursor(addMonths(cursor, -1));
        else if (view === 'semana') setCursor(addDays(cursor, -7));
        else setCursor(addDays(cursor, -1));
    };
    const goNext = () => {
        if (view === 'mes') setCursor(addMonths(cursor, 1));
        else if (view === 'semana') setCursor(addDays(cursor, 7));
        else setCursor(addDays(cursor, 1));
    };
    const goToday = () => setCursor(startOfDay(new Date()));

    const headerTitle = useMemo(() => {
        if (view === 'mes') return `${MES_NOMES[cursor.getMonth()]} de ${cursor.getFullYear()}`;
        if (view === 'semana') {
            const a = startOfWeek(cursor);
            const b = addDays(a, 6);
            return `${a.getDate()} ${MES_NOMES[a.getMonth()].slice(0, 3)} — ${b.getDate()} ${MES_NOMES[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`;
        }
        if (view === 'dia') return formatDataLonga(cursor);
        return 'Próximos eventos';
    }, [view, cursor]);

    const toggleType = (t: AgendaEventType) => {
        setTypeFilters(prev => {
            const next = new Set(prev);
            if (next.has(t)) next.delete(t); else next.add(t);
            return next;
        });
    };
    const clearFilters = () => { setTypeFilters(new Set()); setResponsibleFilter(''); };

    return (
        <div className="flex flex-col h-full">
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3 pb-4 border-b border-gray-200/60 dark:border-[rgba(212,168,92,0.14)]">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <p style={{
                            fontFamily: 'var(--font-mono), ui-monospace, monospace',
                            fontSize: 10, fontWeight: 600, letterSpacing: '0.24em',
                            textTransform: 'uppercase', color: '#A0792E',
                        }}>
                            § Operações · Central temporal
                        </p>
                        <h1 className="mt-1 text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-[#F5F0E4] dark:to-[#A0792E]" style={{ letterSpacing: '-0.02em' }}>
                            Agenda Oficial
                        </h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-[#F5F0E4]/55">
                            Tudo que tem data, prazo ou compromisso da empresa — ligado ao projeto, leilão, criador ou tarefa correspondente.
                        </p>
                    </div>
                    <button
                        onClick={() => { setCreating(true); setCreatePreset(cursor); }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold bg-[#A0792E] hover:bg-[#8a661f] text-[#161616] transition-colors shrink-0"
                        style={{ borderRadius: 3, boxShadow: '0 0 0 1px rgba(212,168,92,0.35), 0 8px 24px rgba(160,121,46,0.20)' }}
                    >
                        <Plus size={15} /> Novo evento
                    </button>
                </div>

                {/* Toolbar */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                        <button onClick={goToday} className="px-3 py-1.5 text-sm font-medium border border-gray-200 dark:border-[rgba(212,168,92,0.22)] hover:bg-gray-50 dark:hover:bg-[#232323] text-gray-700 dark:text-[#F5F0E4]/85 transition-colors" style={{ borderRadius: 3 }}>
                            Hoje
                        </button>
                        <button onClick={goPrev} className="p-1.5 border border-gray-200 dark:border-[rgba(212,168,92,0.22)] hover:bg-gray-50 dark:hover:bg-[#232323] text-gray-600 dark:text-[#F5F0E4]/70 transition-colors" style={{ borderRadius: 3 }} aria-label="Anterior">
                            <ChevronLeft size={15} />
                        </button>
                        <button onClick={goNext} className="p-1.5 border border-gray-200 dark:border-[rgba(212,168,92,0.22)] hover:bg-gray-50 dark:hover:bg-[#232323] text-gray-600 dark:text-[#F5F0E4]/70 transition-colors" style={{ borderRadius: 3 }} aria-label="Próximo">
                            <ChevronRight size={15} />
                        </button>
                        <h2 className="ml-2 text-base sm:text-lg font-bold text-gray-900 dark:text-[#F5F0E4] capitalize" style={{ letterSpacing: '-0.01em' }}>
                            {headerTitle}
                        </h2>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <div className="inline-flex p-0.5 bg-gray-100 dark:bg-[#232323] border border-gray-200 dark:border-[rgba(212,168,92,0.18)]" style={{ borderRadius: 3 }}>
                            {(Object.keys(VIEW_LABEL) as ViewMode[]).map(v => {
                                const Icon = VIEW_LABEL[v].icon;
                                const active = v === view;
                                return (
                                    <button
                                        key={v}
                                        onClick={() => setView(v)}
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-all ${active ? 'bg-[#A0792E] text-[#161616]' : 'text-gray-600 dark:text-[#F5F0E4]/70 hover:text-gray-900 dark:hover:text-[#D4A85C]'}`}
                                        style={{ borderRadius: 2 }}
                                    >
                                        <Icon size={12} />
                                        <span className="hidden sm:inline">{VIEW_LABEL[v].label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => setShowFilters(s => !s)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border transition-colors ${showFilters || typeFilters.size > 0 || responsibleFilter ? 'bg-[rgba(160,121,46,0.12)] border-[#A0792E] text-[#A0792E]' : 'border-gray-200 dark:border-[rgba(212,168,92,0.22)] text-gray-600 dark:text-[#F5F0E4]/70 hover:bg-gray-50 dark:hover:bg-[#232323]'}`}
                            style={{ borderRadius: 3 }}
                        >
                            <Filter size={12} /> Filtros
                            {(typeFilters.size > 0 || responsibleFilter) && (
                                <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-bold bg-[#A0792E] text-[#161616]" style={{ borderRadius: 2 }}>
                                    {typeFilters.size + (responsibleFilter ? 1 : 0)}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {showFilters && (
                    <div className="rounded-none border border-gray-200 dark:border-[rgba(212,168,92,0.18)] bg-gray-50/60 dark:bg-[#181818] p-3 flex flex-col gap-2" style={{ borderRadius: 3 }}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p style={{
                                fontFamily: 'var(--font-mono), ui-monospace, monospace',
                                fontSize: 10, fontWeight: 600, letterSpacing: '0.22em',
                                textTransform: 'uppercase', color: '#D4A85C',
                            }}>
                                Filtrar por tipo
                            </p>
                            {(typeFilters.size > 0 || responsibleFilter) && (
                                <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-[#A0792E] inline-flex items-center gap-1">
                                    <X size={11} /> Limpar filtros
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {EVENT_TYPES.map(t => {
                                const active = typeFilters.has(t.key);
                                const count = typeCounts[t.key] ?? 0;
                                return (
                                    <button
                                        key={t.key}
                                        onClick={() => toggleType(t.key)}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-all"
                                        style={{
                                            borderRadius: 3,
                                            border: `1px solid ${active ? t.color : 'rgba(160,121,46,0.18)'}`,
                                            background: active ? `${t.color}1F` : 'transparent',
                                            color: active ? t.color : 'inherit',
                                            opacity: count === 0 ? 0.5 : 1,
                                        }}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />
                                        {t.label}
                                        <span className="text-[10px] opacity-70">·</span>
                                        <span className="text-[10px] font-bold">{count}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {options.members.length > 0 && (
                            <div className="flex items-center gap-2 pt-1">
                                <p style={{
                                    fontFamily: 'var(--font-mono), ui-monospace, monospace',
                                    fontSize: 10, fontWeight: 600, letterSpacing: '0.22em',
                                    textTransform: 'uppercase', color: '#D4A85C',
                                }}>
                                    Responsável
                                </p>
                                <select
                                    value={responsibleFilter}
                                    onChange={(e) => setResponsibleFilter(e.target.value)}
                                    className="text-xs bg-white dark:bg-[#232323] border border-gray-200 dark:border-[rgba(212,168,92,0.18)] px-2 py-1 text-gray-900 dark:text-[#F5F0E4] focus:outline-none focus:border-[#A0792E]"
                                    style={{ borderRadius: 3 }}
                                >
                                    <option value="">— qualquer —</option>
                                    {options.members.map(m => (
                                        <option key={m.id} value={String(m.id)}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Body grid: sidebar + main view ──────────────────────────── */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 mt-4 min-h-0">
                <Sidebar
                    cursor={cursor}
                    setCursor={setCursor}
                    alerts={alerts}
                    openEvent={openEvent}
                />

                <div className="flex flex-col min-w-0 min-h-0">
                    {view === 'mes' && (
                        <MonthView
                            cursor={cursor}
                            byDay={byDay}
                            onPickDay={(d) => { setCursor(d); setView('dia'); }}
                            onCreateOnDay={(d) => { setCreating(true); setCreatePreset(d); }}
                            onOpen={openEvent}
                        />
                    )}
                    {view === 'semana' && (
                        <WeekView
                            cursor={cursor}
                            byDay={byDay}
                            onOpen={openEvent}
                            onCreateOnDay={(d) => { setCreating(true); setCreatePreset(d); }}
                        />
                    )}
                    {view === 'dia' && (
                        <DayView cursor={cursor} byDay={byDay} onOpen={openEvent} />
                    )}
                    {view === 'lista' && (
                        <ListView events={filtered} onOpen={openEvent} options={options} />
                    )}
                </div>
            </div>

            <EventModal
                isOpen={creating || editing != null}
                event={editing}
                presetDate={createPreset}
                options={options}
                onClose={closeEvent}
                onSave={handleSave}
                onDelete={handleDelete}
            />
        </div>
    );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({
    cursor, setCursor, alerts, openEvent,
}: {
    cursor: Date;
    setCursor: (d: Date) => void;
    alerts: { overdue: AgendaEvent[]; next24: AgendaEvent[]; noResponsible: AgendaEvent[] };
    openEvent: (id: string) => void;
}) {
    return (
        <aside className="hidden lg:flex flex-col gap-3 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-[#2e2e2e]">
            <MiniMonth cursor={cursor} setCursor={setCursor} />

            {/* Alerts */}
            <div className="border border-gray-200 dark:border-[rgba(212,168,92,0.18)] bg-white dark:bg-[#1b1b1b]" style={{ borderRadius: 3 }}>
                <div className="px-3 pt-2.5 pb-2 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="text-[#A0792E]" />
                    <p style={{
                        fontFamily: 'var(--font-mono), ui-monospace, monospace',
                        fontSize: 10, fontWeight: 600, letterSpacing: '0.22em',
                        textTransform: 'uppercase', color: '#A0792E',
                    }}>
                        Alertas críticos
                    </p>
                </div>

                <AlertSection
                    title="Atrasados"
                    color="#DC2626"
                    items={alerts.overdue.slice(0, 6)}
                    total={alerts.overdue.length}
                    openEvent={openEvent}
                />
                <AlertSection
                    title="Próximas 24h"
                    color="#F59E0B"
                    items={alerts.next24.slice(0, 6)}
                    total={alerts.next24.length}
                    openEvent={openEvent}
                />
                <AlertSection
                    title="Sem responsável"
                    color="#64748B"
                    items={alerts.noResponsible.slice(0, 6)}
                    total={alerts.noResponsible.length}
                    openEvent={openEvent}
                    last
                />
            </div>

            {/* Legend */}
            <div className="border border-gray-200 dark:border-[rgba(212,168,92,0.18)] bg-white dark:bg-[#1b1b1b] px-3 py-2.5" style={{ borderRadius: 3 }}>
                <p className="mb-2" style={{
                    fontFamily: 'var(--font-mono), ui-monospace, monospace',
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.22em',
                    textTransform: 'uppercase', color: '#D4A85C',
                }}>
                    Tipos
                </p>
                <ul className="space-y-1">
                    {EVENT_TYPES.map(t => (
                        <li key={t.key} className="flex items-center gap-2 text-xs text-gray-700 dark:text-[#F5F0E4]/75">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
                            <span className="flex-1 truncate">{t.label}</span>
                            <span className="text-[10px] text-gray-400 dark:text-[#F5F0E4]/40 truncate">{t.description}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </aside>
    );
}

function AlertSection({
    title, color, items, total, openEvent, last,
}: {
    title: string; color: string;
    items: AgendaEvent[]; total: number;
    openEvent: (id: string) => void;
    last?: boolean;
}) {
    return (
        <div className={`px-3 py-2 ${last ? '' : 'border-b border-gray-100 dark:border-[rgba(212,168,92,0.10)]'}`}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5" style={{ background: color }} />
                    <span className="text-[11px] font-bold text-gray-800 dark:text-[#F5F0E4]/90">{title}</span>
                </div>
                <span className="text-[10px] font-bold text-gray-500 dark:text-[#F5F0E4]/55">{total}</span>
            </div>
            {items.length === 0 ? (
                <p className="text-[11px] italic text-gray-400 dark:text-[#F5F0E4]/40">Tudo certo</p>
            ) : (
                <ul className="space-y-0.5">
                    {items.map(e => {
                        const t = EVENT_TYPES_MAP[e.event_type];
                        return (
                            <li key={e.id}>
                                <button
                                    onClick={() => openEvent(e.id)}
                                    className="w-full text-left px-1.5 py-1 -mx-1.5 hover:bg-gray-50 dark:hover:bg-[rgba(212,168,92,0.06)] transition-colors flex items-start gap-1.5"
                                    style={{ borderRadius: 2 }}
                                >
                                    <span className="w-1 h-1 mt-1.5 shrink-0" style={{ background: t.color }} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-medium text-gray-800 dark:text-[#F5F0E4]/90 truncate" title={e.title}>{e.title}</p>
                                        <p className="text-[10px] text-gray-500 dark:text-[#F5F0E4]/50">
                                            {new Date(e.start_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                            {!e.all_day ? ` · ${formatHora(new Date(e.start_at))}` : ''}
                                        </p>
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

// ─── Mini-month (sidebar calendar) ───────────────────────────────────────────

function MiniMonth({ cursor, setCursor }: { cursor: Date; setCursor: (d: Date) => void }) {
    const [view, setView] = useState<Date>(() => startOfMonth(cursor));

    useEffect(() => { setView(startOfMonth(cursor)); }, [cursor]);

    const grid = useMemo(() => buildMonthGrid(view), [view]);
    const today = startOfDay(new Date());

    return (
        <div className="border border-gray-200 dark:border-[rgba(212,168,92,0.18)] bg-white dark:bg-[#1b1b1b] px-3 py-2.5" style={{ borderRadius: 3 }}>
            <div className="flex items-center justify-between mb-2">
                <button onClick={() => setView(v => addMonths(v, -1))} className="p-1 text-gray-400 hover:text-[#A0792E]"><ChevronLeft size={14} /></button>
                <p className="text-xs font-bold text-gray-800 dark:text-[#F5F0E4]" style={{ letterSpacing: '-0.005em' }}>
                    {MES_NOMES[view.getMonth()]} <span className="text-gray-400 dark:text-[#F5F0E4]/50">{view.getFullYear()}</span>
                </p>
                <button onClick={() => setView(v => addMonths(v, 1))} className="p-1 text-gray-400 hover:text-[#A0792E]"><ChevronRight size={14} /></button>
            </div>

            <div className="grid grid-cols-7 gap-0 mb-1">
                {DIAS_CURTOS.map(d => (
                    <div key={d} className="text-center" style={{
                        fontFamily: 'var(--font-mono), ui-monospace, monospace',
                        fontSize: 9, color: '#D4A85C', letterSpacing: '0.1em',
                    }}>{d.charAt(0)}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-0">
                {grid.map((d, i) => {
                    const isCurMonth = d.getMonth() === view.getMonth();
                    const isToday = sameDay(d, today);
                    const isSel = sameDay(d, cursor);
                    return (
                        <button
                            key={i}
                            onClick={() => setCursor(d)}
                            className={`aspect-square flex items-center justify-center text-[11px] font-medium transition-colors ${
                                isSel
                                    ? 'bg-[#A0792E] text-[#161616]'
                                    : isToday
                                        ? 'text-[#A0792E] font-bold'
                                        : isCurMonth
                                            ? 'text-gray-700 dark:text-[#F5F0E4]/85 hover:bg-gray-100 dark:hover:bg-[rgba(212,168,92,0.08)]'
                                            : 'text-gray-300 dark:text-[#F5F0E4]/25 hover:bg-gray-50 dark:hover:bg-[rgba(212,168,92,0.04)]'
                            }`}
                            style={{ borderRadius: 2 }}
                        >
                            {d.getDate()}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Month view ──────────────────────────────────────────────────────────────

function MonthView({
    cursor, byDay, onPickDay, onCreateOnDay, onOpen,
}: {
    cursor: Date;
    byDay: Map<string, AgendaEvent[]>;
    onPickDay: (d: Date) => void;
    onCreateOnDay: (d: Date) => void;
    onOpen: (id: string) => void;
}) {
    const grid = useMemo(() => buildMonthGrid(cursor), [cursor]);
    const today = startOfDay(new Date());

    return (
        <div className="flex flex-col flex-1 min-h-0 border border-gray-200 dark:border-[rgba(212,168,92,0.18)] bg-white dark:bg-[#161616] overflow-hidden" style={{ borderRadius: 3 }}>
            <div className="grid grid-cols-7 border-b border-gray-200 dark:border-[rgba(212,168,92,0.18)]">
                {DIAS_CURTOS.map(d => (
                    <div key={d} className="px-3 py-2 text-center" style={{
                        fontFamily: 'var(--font-mono), ui-monospace, monospace',
                        fontSize: 10, fontWeight: 600, letterSpacing: '0.22em',
                        textTransform: 'uppercase', color: '#D4A85C',
                    }}>{d}</div>
                ))}
            </div>

            <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-0">
                {grid.map((d, i) => {
                    const isCurMonth = d.getMonth() === cursor.getMonth();
                    const isToday = sameDay(d, today);
                    const dayEvents = byDay.get(dayKey(d)) ?? [];
                    const visible = dayEvents.slice(0, 3);
                    const overflow = dayEvents.length - visible.length;

                    return (
                        <div
                            key={i}
                            className={`relative border-r border-b border-gray-100 dark:border-[rgba(212,168,92,0.10)] p-1.5 flex flex-col gap-1 group ${(i + 1) % 7 === 0 ? 'border-r-0' : ''} ${i >= 35 ? 'border-b-0' : ''} ${isCurMonth ? 'bg-white dark:bg-[#161616]' : 'bg-gray-50/60 dark:bg-[#131313]'}`}
                        >
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={() => onPickDay(d)}
                                    className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1 text-xs font-bold transition-colors ${
                                        isToday
                                            ? 'bg-[#A0792E] text-[#161616]'
                                            : isCurMonth
                                                ? 'text-gray-800 dark:text-[#F5F0E4]/85 hover:text-[#A0792E]'
                                                : 'text-gray-300 dark:text-[#F5F0E4]/25'
                                    }`}
                                    style={{ borderRadius: 2 }}
                                >
                                    {d.getDate()}
                                </button>
                                <button
                                    onClick={() => onCreateOnDay(d)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-gray-400 hover:text-[#A0792E]"
                                    aria-label="Adicionar evento"
                                >
                                    <Plus size={12} />
                                </button>
                            </div>

                            <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                                {visible.map(e => (
                                    <EventChipMonth key={e.id} event={e} onOpen={() => onOpen(e.id)} />
                                ))}
                                {overflow > 0 && (
                                    <button
                                        onClick={() => onPickDay(d)}
                                        className="text-left text-[10px] text-gray-500 dark:text-[#F5F0E4]/55 hover:text-[#A0792E] px-1"
                                    >
                                        +{overflow} mais
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function EventChipMonth({ event, onOpen }: { event: AgendaEvent; onOpen: () => void }) {
    const t = EVENT_TYPES_MAP[event.event_type];
    const isDone = event.status === 'concluido' || event.status === 'cancelado';
    return (
        <button
            onClick={onOpen}
            className="group/chip text-left flex items-center gap-1 px-1.5 py-0.5 text-[10.5px] font-medium hover:brightness-110 transition-all overflow-hidden"
            style={{
                background: `${t.color}1A`,
                borderLeft: `3px solid ${t.color}`,
                color: t.color,
                borderRadius: 2,
                opacity: isDone ? 0.55 : 1,
                textDecoration: isDone ? 'line-through' : 'none',
            }}
            title={`${event.title} · ${EVENT_STATUS_MAP[event.status].label}`}
        >
            {!event.all_day && (
                <span className="font-bold opacity-80 shrink-0">{formatHora(new Date(event.start_at))}</span>
            )}
            <span className="truncate flex-1">{event.title}</span>
        </button>
    );
}

// ─── Week view ───────────────────────────────────────────────────────────────

function WeekView({
    cursor, byDay, onOpen, onCreateOnDay,
}: {
    cursor: Date;
    byDay: Map<string, AgendaEvent[]>;
    onOpen: (id: string) => void;
    onCreateOnDay: (d: Date) => void;
}) {
    const days = useMemo(() => {
        const start = startOfWeek(cursor);
        return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }, [cursor]);
    const today = startOfDay(new Date());

    const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7h..20h

    return (
        <div className="flex flex-col flex-1 min-h-0 border border-gray-200 dark:border-[rgba(212,168,92,0.18)] bg-white dark:bg-[#161616] overflow-hidden" style={{ borderRadius: 3 }}>
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-gray-200 dark:border-[rgba(212,168,92,0.18)]">
                <div />
                {days.map(d => {
                    const isToday = sameDay(d, today);
                    return (
                        <button
                            key={d.toISOString()}
                            onClick={() => onCreateOnDay(d)}
                            className={`px-2 py-2 text-center border-l border-gray-100 dark:border-[rgba(212,168,92,0.10)] hover:bg-gray-50 dark:hover:bg-[#232323] ${isToday ? 'bg-[rgba(160,121,46,0.06)]' : ''}`}
                        >
                            <div style={{
                                fontFamily: 'var(--font-mono), ui-monospace, monospace',
                                fontSize: 9, letterSpacing: '0.2em',
                                color: '#D4A85C', textTransform: 'uppercase',
                            }}>
                                {DIAS_CURTOS[d.getDay()]}
                            </div>
                            <div className={`mt-0.5 inline-flex items-center justify-center min-w-[26px] h-[26px] px-1.5 text-sm font-bold ${isToday ? 'bg-[#A0792E] text-[#161616]' : 'text-gray-800 dark:text-[#F5F0E4]/90'}`} style={{ borderRadius: 2 }}>
                                {d.getDate()}
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-[#2e2e2e]">
                <div className="grid grid-cols-[56px_repeat(7,1fr)] relative">
                    {HOURS.map(h => (
                        <div key={`h-${h}`} className="contents">
                            <div className="px-2 py-1.5 text-right text-[10px] text-gray-400 dark:text-[#F5F0E4]/40 border-r border-gray-100 dark:border-[rgba(212,168,92,0.10)]">
                                {String(h).padStart(2, '0')}:00
                            </div>
                            {days.map(d => (
                                <div
                                    key={`${d.toISOString()}-${h}`}
                                    className="border-l border-b border-gray-100 dark:border-[rgba(212,168,92,0.08)] min-h-[44px] p-0.5"
                                />
                            ))}
                        </div>
                    ))}

                    {/* Absolute positioned events */}
                    {days.map((d, dayIdx) => {
                        const list = byDay.get(dayKey(d)) ?? [];
                        return list.map(e => {
                            const start = new Date(e.start_at);
                            const h = start.getHours() + start.getMinutes() / 60;
                            if (h < 7 || h > 21) return null;
                            const top = (h - 7) * 44; // each row = 44px (min-h-[44px])
                            const end = e.end_at ? new Date(e.end_at) : new Date(start.getTime() + 60 * 60_000);
                            const durHours = Math.max(0.5, Math.min(14, (end.getTime() - start.getTime()) / 3_600_000));
                            const height = Math.max(20, durHours * 44 - 2);
                            const t = EVENT_TYPES_MAP[e.event_type];
                            const isDone = e.status === 'concluido' || e.status === 'cancelado';
                            // grid column: 2..8 → use percent positioning since grid template is fixed
                            const col = dayIdx + 2;
                            return (
                                <button
                                    key={e.id}
                                    onClick={() => onOpen(e.id)}
                                    className="absolute text-left px-1.5 py-1 hover:brightness-110 transition-all overflow-hidden"
                                    style={{
                                        gridColumn: col,
                                        top, height,
                                        left: `calc((100% - 56px) / 7 * ${dayIdx} + 56px + 2px)`,
                                        width: `calc((100% - 56px) / 7 - 4px)`,
                                        background: `${t.color}22`,
                                        borderLeft: `3px solid ${t.color}`,
                                        color: t.color,
                                        borderRadius: 2,
                                        opacity: isDone ? 0.55 : 1,
                                    }}
                                >
                                    <p className="text-[10.5px] font-bold leading-tight truncate">{e.title}</p>
                                    <p className="text-[10px] opacity-70 truncate">
                                        {formatHora(start)}{e.end_at ? `–${formatHora(end)}` : ''}
                                    </p>
                                </button>
                            );
                        });
                    })}
                </div>
            </div>
        </div>
    );
}

// ─── Day view ────────────────────────────────────────────────────────────────

function DayView({
    cursor, byDay, onOpen,
}: {
    cursor: Date;
    byDay: Map<string, AgendaEvent[]>;
    onOpen: (id: string) => void;
}) {
    const list = byDay.get(dayKey(cursor)) ?? [];
    const allDay = list.filter(e => e.all_day);
    const timed = list.filter(e => !e.all_day);
    const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6..21

    return (
        <div className="flex flex-col flex-1 min-h-0 border border-gray-200 dark:border-[rgba(212,168,92,0.18)] bg-white dark:bg-[#161616] overflow-hidden" style={{ borderRadius: 3 }}>
            {allDay.length > 0 && (
                <div className="px-3 py-2 border-b border-gray-100 dark:border-[rgba(212,168,92,0.10)] flex items-center gap-2 flex-wrap">
                    <span style={{
                        fontFamily: 'var(--font-mono), ui-monospace, monospace',
                        fontSize: 9, color: '#D4A85C', letterSpacing: '0.2em', textTransform: 'uppercase',
                    }}>Dia inteiro:</span>
                    {allDay.map(e => {
                        const t = EVENT_TYPES_MAP[e.event_type];
                        return (
                            <button
                                key={e.id}
                                onClick={() => onOpen(e.id)}
                                className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium hover:brightness-110"
                                style={{ background: `${t.color}1F`, color: t.color, borderRadius: 2, borderLeft: `3px solid ${t.color}` }}
                            >
                                <t.icon size={11} /> {e.title}
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-[#2e2e2e]">
                <div className="relative grid grid-cols-[56px_1fr]">
                    {HOURS.map(h => (
                        <div key={`h-${h}`} className="contents">
                            <div className="px-2 py-1 text-right text-[10px] text-gray-400 dark:text-[#F5F0E4]/40 border-r border-gray-100 dark:border-[rgba(212,168,92,0.10)]">
                                {String(h).padStart(2, '0')}:00
                            </div>
                            <div className="border-b border-gray-100 dark:border-[rgba(212,168,92,0.08)] min-h-[56px] p-0.5" />
                        </div>
                    ))}

                    {timed.map(e => {
                        const start = new Date(e.start_at);
                        const h = start.getHours() + start.getMinutes() / 60;
                        if (h < 6 || h > 22) return null;
                        const top = (h - 6) * 56;
                        const end = e.end_at ? new Date(e.end_at) : new Date(start.getTime() + 60 * 60_000);
                        const durHours = Math.max(0.5, Math.min(16, (end.getTime() - start.getTime()) / 3_600_000));
                        const height = Math.max(28, durHours * 56 - 2);
                        const t = EVENT_TYPES_MAP[e.event_type];
                        const isDone = e.status === 'concluido' || e.status === 'cancelado';
                        return (
                            <button
                                key={e.id}
                                onClick={() => onOpen(e.id)}
                                className="absolute text-left px-2 py-1.5 hover:brightness-110 transition-all overflow-hidden"
                                style={{
                                    top, height,
                                    left: `calc(56px + 4px)`,
                                    right: 8,
                                    background: `${t.color}22`,
                                    borderLeft: `3px solid ${t.color}`,
                                    color: t.color,
                                    borderRadius: 2,
                                    opacity: isDone ? 0.55 : 1,
                                }}
                            >
                                <p className="text-xs font-bold truncate">{e.title}</p>
                                <p className="text-[10px] opacity-80 truncate">
                                    {formatHora(start)}{e.end_at ? ` – ${formatHora(end)}` : ''}{e.location ? ` · ${e.location}` : ''}
                                </p>
                            </button>
                        );
                    })}

                    {list.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center">
                                <Sparkles size={20} className="mx-auto text-[#A0792E]/40 mb-2" />
                                <p className="text-sm text-gray-400 dark:text-[#F5F0E4]/40">Nenhum compromisso para esse dia.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── List view ───────────────────────────────────────────────────────────────

function ListView({
    events, onOpen, options,
}: {
    events: AgendaEvent[];
    onOpen: (id: string) => void;
    options: AgendaRelatedOptions;
}) {
    const now = new Date();
    const sorted = useMemo(() => {
        return [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    }, [events]);

    const grouped = useMemo(() => {
        const map = new Map<string, AgendaEvent[]>();
        for (const e of sorted) {
            const d = new Date(e.start_at);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const arr = map.get(key) ?? [];
            arr.push(e);
            map.set(key, arr);
        }
        return Array.from(map.entries());
    }, [sorted]);

    if (grouped.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center border border-gray-200 dark:border-[rgba(212,168,92,0.18)] bg-white dark:bg-[#161616]" style={{ borderRadius: 3 }}>
                <div className="text-center">
                    <CalIcon size={28} className="mx-auto text-[#A0792E]/40 mb-2" />
                    <p className="text-sm text-gray-400 dark:text-[#F5F0E4]/40">Nenhum evento na agenda.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-[#2e2e2e]">
            <div className="space-y-4">
                {grouped.map(([key, list]) => {
                    const [y, m, d] = key.split('-').map(Number);
                    const date = new Date(y, m - 1, d);
                    const isToday = sameDay(date, startOfDay(now));
                    return (
                        <div key={key}>
                            <div className="flex items-center gap-2 mb-2">
                                <div
                                    className={`inline-flex items-center justify-center min-w-[36px] h-[36px] px-2 ${isToday ? 'bg-[#A0792E] text-[#161616]' : 'bg-gray-100 dark:bg-[#232323] text-gray-800 dark:text-[#F5F0E4]/85'}`}
                                    style={{ borderRadius: 3 }}
                                >
                                    <div className="text-center leading-tight">
                                        <div className="text-base font-bold">{d}</div>
                                        <div className="text-[8px] uppercase opacity-70">{MES_NOMES[m - 1].slice(0, 3)}</div>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-gray-800 dark:text-[#F5F0E4]/90 capitalize">{formatDataLonga(date)}</p>
                                    <p className="text-[10px] text-gray-500 dark:text-[#F5F0E4]/50">{list.length} {list.length === 1 ? 'evento' : 'eventos'}</p>
                                </div>
                            </div>
                            <ul className="space-y-1.5">
                                {list.map(e => (
                                    <ListRow key={e.id} event={e} onOpen={() => onOpen(e.id)} options={options} />
                                ))}
                            </ul>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ListRow({ event, onOpen, options }: { event: AgendaEvent; onOpen: () => void; options: AgendaRelatedOptions }) {
    const t = EVENT_TYPES_MAP[event.event_type];
    const s = EVENT_STATUS_MAP[event.status];
    const start = new Date(event.start_at);
    const end = event.end_at ? new Date(event.end_at) : null;
    const responsible = event.responsible_member_id
        ? options.members.find(m => String(m.id) === event.responsible_member_id)?.label
        : undefined;

    const linkSummary = summarizeLinks(event, options);

    return (
        <li>
            <button
                onClick={onOpen}
                className="w-full text-left bg-white dark:bg-[#1b1b1b] border border-gray-200 dark:border-[rgba(212,168,92,0.18)] hover:border-[#A0792E] dark:hover:border-[#A0792E] transition-all px-3 py-2.5 flex items-start gap-3"
                style={{ borderRadius: 3 }}
            >
                <div
                    className="shrink-0 flex items-center justify-center"
                    style={{ width: 30, height: 30, background: `${t.color}22`, color: t.color, borderRadius: 2 }}
                >
                    <t.icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900 dark:text-[#F5F0E4]" style={{ letterSpacing: '-0.005em' }}>{event.title}</p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 ${s.badge}`} style={{ borderRadius: 2 }}>{s.label}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500 dark:text-[#F5F0E4]/55">
                        <span className="inline-flex items-center gap-1"><Clock size={10} />{event.all_day ? 'Dia inteiro' : `${formatHora(start)}${end ? ` – ${formatHora(end)}` : ''}`}</span>
                        {event.location && <span className="inline-flex items-center gap-1"><MapPin size={10} />{event.location}</span>}
                        {responsible && <span className="inline-flex items-center gap-1"><User size={10} />{responsible}</span>}
                        <span className="inline-flex items-center gap-1" style={{ color: PRIORITY_DOT[event.priority] }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: PRIORITY_DOT[event.priority] }} />
                            {event.priority === 'alta' ? 'Alta prioridade' : event.priority === 'media' ? 'Média' : 'Baixa'}
                        </span>
                    </div>
                    {linkSummary.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {linkSummary.map((l, i) => (
                                <span key={i} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-[#232323] text-gray-600 dark:text-[#F5F0E4]/65" style={{ borderRadius: 2 }}>
                                    <l.icon size={10} className="text-[#A0792E]" />
                                    <span className="font-medium">{l.kind}:</span>
                                    <span className="truncate max-w-[160px]">{l.label}</span>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <ExternalLink size={13} className="text-gray-300 dark:text-[#F5F0E4]/30 shrink-0 mt-1" />
            </button>
        </li>
    );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dayKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildMonthGrid(cursor: Date): Date[] {
    const start = startOfMonth(cursor);
    const first = startOfWeek(start);
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

function summarizeLinks(event: AgendaEvent, options: AgendaRelatedOptions) {
    const out: { kind: string; label: string; icon: typeof Gavel }[] = [];
    if (event.linked_leilao_id) {
        const x = options.leiloes.find(o => String(o.id) === event.linked_leilao_id);
        if (x) out.push({ kind: 'Leilão', label: x.label, icon: Gavel });
    }
    if (event.linked_flow_id) {
        const x = options.flows.find(o => String(o.id) === event.linked_flow_id);
        if (x) out.push({ kind: 'Projeto', label: x.label, icon: Briefcase });
    }
    if (event.linked_task_id) {
        const x = options.tasks.find(o => String(o.id) === event.linked_task_id);
        if (x) out.push({ kind: 'Tarefa', label: x.label, icon: ListChecks });
    }
    if (event.linked_contract_id) {
        const x = options.contracts.find(o => String(o.id) === event.linked_contract_id);
        if (x) out.push({ kind: 'Contrato', label: x.label, icon: ScrollText });
    }
    if (event.linked_breeder_id) {
        const x = options.breeders.find(o => Number(o.id) === event.linked_breeder_id);
        if (x) out.push({ kind: 'Criador', label: x.label, icon: Award });
    }
    if (event.linked_lead_id) {
        const x = options.leads.find(o => String(o.id) === event.linked_lead_id);
        if (x) out.push({ kind: 'Cliente', label: x.label, icon: UserCircle2 });
    }
    if (event.linked_product_id) {
        const x = options.products.find(o => Number(o.id) === event.linked_product_id);
        if (x) out.push({ kind: 'Lote', label: x.label, icon: Award });
    }
    return out;
}
