'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    X, Save, Trash2, Loader2, Calendar as CalIcon, Clock, MapPin,
    AlertCircle, Gavel, Users, Briefcase, Award,
    UserCircle2, ScrollText, ListChecks, type LucideIcon,
} from 'lucide-react';
import type {
    AgendaEvent, AgendaEventInput, AgendaRelatedOptions, AgendaEventType,
    AgendaEventStatus, AgendaEventPriority,
} from '@/app/sistema/actions/agenda';
import {
    EVENT_TYPES, EVENT_STATUS, PRIORITY_LABELS, EVENT_TYPES_MAP,
    toIsoLocal, fromInputLocal,
} from './types';

interface Props {
    isOpen: boolean;
    event?: AgendaEvent | null;
    presetDate?: Date | null;
    options: AgendaRelatedOptions;
    onClose: () => void;
    onSave: (payload: Partial<AgendaEventInput>) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
}

type LinkKey =
    | 'linked_leilao_id'
    | 'linked_flow_id'
    | 'linked_task_id'
    | 'linked_contract_id'
    | 'linked_breeder_id'
    | 'linked_lead_id'
    | 'linked_product_id';

interface LinkKind {
    key: LinkKey;
    icon: LucideIcon;
    label: string;
    listKey: keyof AgendaRelatedOptions;
}

const LINK_KINDS: LinkKind[] = [
    { key: 'linked_leilao_id',   icon: Gavel,       label: 'Leilão',   listKey: 'leiloes' },
    { key: 'linked_flow_id',     icon: Briefcase,   label: 'Projeto',  listKey: 'flows' },
    { key: 'linked_task_id',     icon: ListChecks,  label: 'Tarefa',   listKey: 'tasks' },
    { key: 'linked_contract_id', icon: ScrollText,  label: 'Contrato', listKey: 'contracts' },
    { key: 'linked_breeder_id',  icon: Award,       label: 'Criador',  listKey: 'breeders' },
    { key: 'linked_lead_id',     icon: UserCircle2, label: 'Cliente',  listKey: 'leads' },
    { key: 'linked_product_id',  icon: Award,       label: 'Lote',     listKey: 'products' },
];

export function EventModal({ isOpen, event, presetDate, options, onClose, onSave, onDelete }: Props) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [eventType, setEventType] = useState<AgendaEventType>('reuniao');
    const [status, setStatus] = useState<AgendaEventStatus>('planejado');
    const [priority, setPriority] = useState<AgendaEventPriority>('media');
    const [startAt, setStartAt] = useState('');
    const [endAt, setEndAt] = useState('');
    const [allDay, setAllDay] = useState(false);
    const [location, setLocation] = useState('');
    const [notes, setNotes] = useState('');
    const [responsible, setResponsible] = useState<string>('');
    const [links, setLinks] = useState<Record<string, string | number>>({});
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setErr(null);
        setConfirmDelete(false);

        if (event) {
            setTitle(event.title);
            setDescription(event.description || '');
            setEventType(event.event_type);
            setStatus(event.status);
            setPriority(event.priority);
            setAllDay(event.all_day);
            setStartAt(event.start_at ? toIsoLocal(new Date(event.start_at)) : '');
            setEndAt(event.end_at ? toIsoLocal(new Date(event.end_at)) : '');
            setLocation(event.location || '');
            setNotes(event.notes || '');
            setResponsible(event.responsible_member_id || '');
            const next: Record<string, string | number> = {};
            for (const k of LINK_KINDS) {
                const v = event[k.key];
                if (v !== null && v !== undefined && v !== '') next[k.key] = v;
            }
            setLinks(next);
        } else {
            const base = presetDate ?? new Date();
            const start = new Date(base);
            if (start.getHours() === 0 && start.getMinutes() === 0) {
                start.setHours(9, 0, 0, 0);
            }
            const end = new Date(start);
            end.setHours(end.getHours() + 1);

            setTitle('');
            setDescription('');
            setEventType('reuniao');
            setStatus('planejado');
            setPriority('media');
            setAllDay(false);
            setStartAt(toIsoLocal(start));
            setEndAt(toIsoLocal(end));
            setLocation('');
            setNotes('');
            setResponsible('');
            setLinks({});
        }
    }, [isOpen, event, presetDate]);

    const typeMeta = EVENT_TYPES_MAP[eventType];

    const handleSave = async () => {
        setErr(null);
        if (!title.trim()) { setErr('Dê um título ao evento.'); return; }
        if (!startAt)      { setErr('Defina a data e hora de início.'); return; }

        setBusy(true);
        try {
            const payload: Partial<AgendaEventInput> = {
                title: title.trim(),
                description: description.trim() || null,
                event_type: eventType,
                status,
                priority,
                start_at: fromInputLocal(startAt),
                end_at: endAt ? fromInputLocal(endAt) : null,
                all_day: allDay,
                location: location.trim() || null,
                notes: notes.trim() || null,
                responsible_member_id: responsible || null,
                linked_leilao_id:   (links.linked_leilao_id   as string) || null,
                linked_task_id:     (links.linked_task_id     as string) || null,
                linked_flow_id:     (links.linked_flow_id     as string) || null,
                linked_product_id:  links.linked_product_id  != null && links.linked_product_id  !== ''
                    ? Number(links.linked_product_id)  : null,
                linked_breeder_id:  links.linked_breeder_id  != null && links.linked_breeder_id  !== ''
                    ? Number(links.linked_breeder_id)  : null,
                linked_lead_id:     (links.linked_lead_id     as string) || null,
                linked_contract_id: (links.linked_contract_id as string) || null,
            };
            await onSave(payload);
            onClose();
        } catch (e: unknown) {
            setErr(errorMessage(e, 'Falha ao salvar.'));
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async () => {
        if (!event || !onDelete) return;
        setBusy(true);
        try { await onDelete(event.id); onClose(); }
        catch (e: unknown) { setErr(errorMessage(e, 'Falha ao excluir.')); }
        finally { setBusy(false); }
    };

    const linkedCount = useMemo(
        () => Object.values(links).filter(v => v != null && v !== '').length,
        [links]
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-sm p-3 sm:p-6"
             onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div
                className="relative w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col bg-white dark:bg-[#141414] border border-gray-200 dark:border-[rgba(200, 169, 110,0.22)] shadow-2xl"
                style={{ borderRadius: 4 }}
            >
                {/* Gold hairline */}
                <span aria-hidden className="absolute top-0 left-0" style={{ width: 48, height: 1, background: '#A68B4B' }} />

                {/* Header */}
                <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-[rgba(200, 169, 110,0.14)]">
                    <div className="flex items-start gap-3 min-w-0">
                        <div
                            className="shrink-0 mt-0.5 flex items-center justify-center"
                            style={{ width: 36, height: 36, background: typeMeta.color, borderRadius: 3 }}
                        >
                            <typeMeta.icon size={18} color="#fff" />
                        </div>
                        <div className="min-w-0">
                            <p style={{
                                fontFamily: 'var(--font-mono), ui-monospace, monospace',
                                fontSize: 9, fontWeight: 500, letterSpacing: '0.24em',
                                textTransform: 'uppercase', color: '#C8A96E',
                            }}>
                                {event ? 'Editar evento' : 'Novo evento'} · {typeMeta.short}
                            </p>
                            <h2 className="mt-0.5 text-lg font-bold text-gray-900 dark:text-[#F5F5F5] truncate" style={{ letterSpacing: '-0.01em' }}>
                                {title || (event ? event.title : 'Novo evento na agenda')}
                            </h2>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-[#C8A96E] transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto px-5 py-4 space-y-5 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-[#2e2e2e]">
                    {err && (
                        <div className="flex items-center gap-2 px-3 py-2 border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 text-sm" style={{ borderRadius: 3 }}>
                            <AlertCircle size={15} /> {err}
                        </div>
                    )}

                    {/* Title + description */}
                    <div className="space-y-3">
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Ex.: Reunião com Fazenda Camparino — alinhamento do leilão"
                            className="w-full px-3 py-2.5 bg-gray-50 dark:bg-[#232323] border border-gray-200 dark:border-[rgba(200, 169, 110,0.18)] text-gray-900 dark:text-[#F5F5F5] focus:outline-none focus:border-[#A68B4B] text-base font-semibold"
                            style={{ borderRadius: 3, letterSpacing: '-0.01em' }}
                        />
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Pauta, observações, contexto…"
                            rows={2}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-[#232323] border border-gray-200 dark:border-[rgba(200, 169, 110,0.18)] text-sm text-gray-800 dark:text-[#F5F5F5]/90 focus:outline-none focus:border-[#A68B4B] resize-none"
                            style={{ borderRadius: 3 }}
                        />
                    </div>

                    {/* Type chips */}
                    <div>
                        <SectionLabel>Tipo de evento</SectionLabel>
                        <div className="flex flex-wrap gap-1.5">
                            {EVENT_TYPES.map(t => {
                                const active = t.key === eventType;
                                return (
                                    <button
                                        key={t.key}
                                        type="button"
                                        onClick={() => setEventType(t.key)}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-all"
                                        style={{
                                            borderRadius: 3,
                                            border: `1px solid ${active ? t.color : 'rgba(166, 139, 75,0.18)'}`,
                                            background: active ? `${t.color}1F` : 'transparent',
                                            color: active ? t.color : 'inherit',
                                        }}
                                    >
                                        <t.icon size={13} />
                                        {t.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Dates + flags */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field icon={CalIcon} label="Início">
                            <input
                                type={allDay ? 'date' : 'datetime-local'}
                                value={allDay ? startAt.slice(0, 10) : startAt}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setStartAt(allDay ? `${v}T00:00` : v);
                                }}
                                className="w-full bg-transparent text-sm text-gray-900 dark:text-[#F5F5F5] focus:outline-none"
                            />
                        </Field>
                        <Field icon={Clock} label="Término (opcional)">
                            <input
                                type={allDay ? 'date' : 'datetime-local'}
                                value={allDay ? endAt.slice(0, 10) : endAt}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setEndAt(allDay ? `${v}T23:59` : v);
                                }}
                                className="w-full bg-transparent text-sm text-gray-900 dark:text-[#F5F5F5] focus:outline-none"
                            />
                        </Field>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-[#F5F5F5]/80">
                            <input
                                type="checkbox"
                                checked={allDay}
                                onChange={(e) => setAllDay(e.target.checked)}
                                className="accent-[#A68B4B]"
                            />
                            Dia inteiro
                        </label>

                        <div className="flex items-center gap-2">
                            <SmallTag>Prioridade</SmallTag>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as AgendaEventPriority)}
                                className="text-sm bg-gray-50 dark:bg-[#232323] border border-gray-200 dark:border-[rgba(200, 169, 110,0.18)] px-2 py-1 text-gray-900 dark:text-[#F5F5F5] focus:outline-none focus:border-[#A68B4B]"
                                style={{ borderRadius: 3 }}
                            >
                                {(Object.keys(PRIORITY_LABELS) as AgendaEventPriority[]).map(p => (
                                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-2">
                            <SmallTag>Status</SmallTag>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value as AgendaEventStatus)}
                                className="text-sm bg-gray-50 dark:bg-[#232323] border border-gray-200 dark:border-[rgba(200, 169, 110,0.18)] px-2 py-1 text-gray-900 dark:text-[#F5F5F5] focus:outline-none focus:border-[#A68B4B]"
                                style={{ borderRadius: 3 }}
                            >
                                {EVENT_STATUS.map(s => (
                                    <option key={s.key} value={s.key}>{s.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Location + responsible */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field icon={MapPin} label="Local">
                            <input
                                type="text"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="Ex.: Fazenda Camparino · Online · WhatsApp"
                                className="w-full bg-transparent text-sm text-gray-900 dark:text-[#F5F5F5] focus:outline-none placeholder:text-gray-400"
                            />
                        </Field>
                        <Field icon={Users} label="Responsável">
                            <select
                                value={responsible}
                                onChange={(e) => setResponsible(e.target.value)}
                                className="w-full bg-transparent text-sm text-gray-900 dark:text-[#F5F5F5] focus:outline-none"
                            >
                                <option value="">— sem responsável —</option>
                                {options.members.map(m => (
                                    <option key={m.id} value={String(m.id)}>{m.label}{m.sub ? ` · ${m.sub}` : ''}</option>
                                ))}
                            </select>
                        </Field>
                    </div>

                    {/* Cross-links */}
                    <div>
                        <SectionLabel>
                            Vínculos
                            {linkedCount > 0 && (
                                <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-[#A68B4B] text-[#161616]" style={{ borderRadius: 2 }}>
                                    {linkedCount}
                                </span>
                            )}
                        </SectionLabel>
                        <p className="text-xs text-gray-500 dark:text-[#F5F5F5]/55 mb-2">
                            Amarre este evento a projetos, leilões ou tarefas — assim o contexto aparece em todos os lugares.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {LINK_KINDS.map(lk => {
                                const list = options[lk.listKey];
                                const value = links[lk.key];
                                const Icon = lk.icon;
                                return (
                                    <Field key={lk.key} icon={Icon} label={lk.label} compact>
                                        <select
                                            value={value == null ? '' : String(value)}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setLinks(prev => {
                                                    const next = { ...prev };
                                                    if (!v) delete next[lk.key];
                                                    else next[lk.key] = v;
                                                    return next;
                                                });
                                            }}
                                            className="w-full bg-transparent text-sm text-gray-900 dark:text-[#F5F5F5] focus:outline-none"
                                        >
                                            <option value="">—</option>
                                            {list.map(o => (
                                                <option key={String(o.id)} value={String(o.id)}>
                                                    {o.label}{o.sub ? ` · ${o.sub}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>
                                );
                            })}
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <SectionLabel>Observações</SectionLabel>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Checklists, ata curta, decisões…"
                            rows={3}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-[#232323] border border-gray-200 dark:border-[rgba(200, 169, 110,0.18)] text-sm text-gray-800 dark:text-[#F5F5F5]/90 focus:outline-none focus:border-[#A68B4B] resize-none"
                            style={{ borderRadius: 3 }}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-gray-100 dark:border-[rgba(200, 169, 110,0.14)] bg-gray-50/60 dark:bg-[#181818]">
                    {event && onDelete ? (
                        confirmDelete ? (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-red-600 dark:text-red-400">Excluir definitivamente?</span>
                                <button
                                    onClick={handleDelete}
                                    disabled={busy}
                                    className="px-2.5 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors"
                                    style={{ borderRadius: 3 }}
                                >Sim, excluir</button>
                                <button
                                    onClick={() => setConfirmDelete(false)}
                                    className="px-2.5 py-1.5 text-xs text-gray-600 dark:text-[#F5F5F5]/60 hover:text-gray-900 dark:hover:text-[#F5F5F5]"
                                >Cancelar</button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setConfirmDelete(true)}
                                disabled={busy}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                                style={{ borderRadius: 3 }}
                            >
                                <Trash2 size={14} /> Excluir
                            </button>
                        )
                    ) : <span />}

                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            disabled={busy}
                            className="px-3 py-1.5 text-sm text-gray-700 dark:text-[#F5F5F5]/70 hover:bg-gray-100 dark:hover:bg-[#232323] transition-colors"
                            style={{ borderRadius: 3 }}
                        >Cancelar</button>
                        <button
                            onClick={handleSave}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-semibold bg-[#A68B4B] hover:bg-[#8a661f] text-[#161616] transition-colors disabled:opacity-50"
                            style={{ borderRadius: 3 }}
                        >
                            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            {event ? 'Salvar alterações' : 'Criar evento'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <p className="mb-2 flex items-center" style={{
            fontFamily: 'var(--font-mono), ui-monospace, monospace',
            fontSize: 10, fontWeight: 600, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: '#A68B4B',
        }}>
            {children}
        </p>
    );
}

function SmallTag({ children }: { children: React.ReactNode }) {
    return (
        <span style={{
            fontFamily: 'var(--font-mono), ui-monospace, monospace',
            fontSize: 9, fontWeight: 600, letterSpacing: '0.20em',
            textTransform: 'uppercase', color: '#C8A96E',
        }}>{children}</span>
    );
}

function Field({
    icon: Icon, label, children, compact,
}: { icon: LucideIcon; label: string; children: React.ReactNode; compact?: boolean }) {
    return (
        <div
            className={`bg-gray-50 dark:bg-[#232323] border border-gray-200 dark:border-[rgba(200, 169, 110,0.18)] focus-within:border-[#A68B4B] ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}
            style={{ borderRadius: 3 }}
        >
            <div className="flex items-center gap-1.5 mb-0.5" style={{
                fontFamily: 'var(--font-mono), ui-monospace, monospace',
                fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                textTransform: 'uppercase', color: '#C8A96E',
            }}>
                <Icon size={11} />
                {label}
            </div>
            {children}
        </div>
    );
}

function errorMessage(e: unknown, fallback: string): string {
    if (e instanceof Error) return e.message;
    if (typeof e === 'string') return e;
    return fallback;
}
