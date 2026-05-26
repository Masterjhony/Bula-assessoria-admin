'use client';

import { useEffect, useMemo, useState } from 'react';
import { CRMLead, updateLead } from '@/app/sistema/actions/crm-leads';
import type { CRMConfig } from '@/lib/crm-types';
import { isQualificationStage } from '@/lib/crm-types';
import { Pagination } from '@/components/admin/Pagination';
import {
    ChevronRight, Phone, Instagram, MapPin, Beef, Search,
    AlertCircle, ArrowRight, Loader2, Check, ListChecks, Sparkles,
    Crown, Mail,
} from 'lucide-react';

// Rótulos amigáveis para os enums de "momento na pecuária" vindos do quiz
// (`public/lp/index.html`) — exibidos como badge na lista da qualificação.
const MOMENTO_LABELS: Record<string, string> = {
    'nao-trabalho-quero-aprender': 'Quer aprender',
    'pecuaria-de-corte':           'Corte',
    'corte-e-po':                  'Corte + P.O.',
    'criador-renomado-po':         'Criador P.O.',
};

function momentoLabel(v?: string | null): string | null {
    if (!v) return null;
    return MOMENTO_LABELS[v] ?? v;
}

interface CRMQualificacaoViewProps {
    leads: CRMLead[];
    crmConfig: CRMConfig;
    onLeadUpdated: (lead: CRMLead) => void;
    onOpenLead: (lead: CRMLead) => void;
}

const REQUIRED_FIELDS: { key: keyof CRMLead; label: string }[] = [
    { key: 'celular', label: 'Celular / WhatsApp' },
    { key: 'estado', label: 'Estado' },
    { key: 'cidade', label: 'Cidade' },
    { key: 'quantidade_animais', label: 'Cabeçinhas' },
    { key: 'o_que_busca', label: 'O que busca' },
];

function fieldFilled(lead: CRMLead, key: keyof CRMLead): boolean {
    const v = lead[key];
    if (v == null) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    return true;
}

function missingFieldsCount(lead: CRMLead): number {
    return REQUIRED_FIELDS.reduce((acc, f) => acc + (fieldFilled(lead, f.key) ? 0 : 1), 0);
}

export function CRMQualificacaoView({ leads, crmConfig, onLeadUpdated, onOpenLead }: CRMQualificacaoViewProps) {
    const [search, setSearch] = useState('');
    const [savingId, setSavingId] = useState<string | null>(null);
    const [qualifyingId, setQualifyingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<Record<string, Partial<CRMLead>>>({});
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(25);

    const qualificationStageNames = useMemo(
        () => new Set(crmConfig.stages.filter(isQualificationStage).map(s => s.name)),
        [crmConfig.stages]
    );

    const firstAdvancedStage = useMemo(
        () => crmConfig.stages.find(s => !isQualificationStage(s))?.name || 'Qualificado',
        [crmConfig.stages]
    );

    const qualificationLeads = useMemo(() => {
        return leads
            .filter(l => qualificationStageNames.has(l.status))
            .filter(l => {
                if (!search) return true;
                const q = search.toLowerCase();
                return (
                    l.nome?.toLowerCase().includes(q) ||
                    l.celular?.includes(search) ||
                    l.telefone?.includes(search) ||
                    l.cidade?.toLowerCase().includes(q) ||
                    l.estado?.toLowerCase().includes(q) ||
                    l.o_que_busca?.toLowerCase().includes(q) ||
                    l.momento_pecuaria?.toLowerCase().includes(q)
                );
            })
            .sort((a, b) => {
                // 1) MQLs no topo — prioridade de atendimento.
                if (!!a.is_mql !== !!b.is_mql) return a.is_mql ? -1 : 1;
                // 2) Dentro do mesmo grupo, mais incompletos primeiro (ainda dependem da equipe pra ficarem prontos).
                const ma = missingFieldsCount(a);
                const mb = missingFieldsCount(b);
                if (ma !== mb) return mb - ma;
                // 3) Empate → mais recentes primeiro.
                const da = a.data_entrada || a.created_at;
                const db = b.data_entrada || b.created_at;
                return (db || '').localeCompare(da || '');
            });
    }, [leads, qualificationStageNames, search]);

    // Reset pra primeira página sempre que filtros ou per-page mudam.
    useEffect(() => { setPage(1); }, [search, perPage]);

    const totalPages = Math.max(1, Math.ceil(qualificationLeads.length / perPage));
    const paginatedLeads = useMemo(
        () => qualificationLeads.slice((page - 1) * perPage, page * perPage),
        [qualificationLeads, page, perPage]
    );

    const stats = useMemo(() => {
        const all = leads.filter(l => qualificationStageNames.has(l.status));
        const semAnimais = all.filter(l => !fieldFilled(l, 'quantidade_animais')).length;
        const semInteresse = all.filter(l => !fieldFilled(l, 'o_que_busca')).length;
        const semLocal = all.filter(l => !fieldFilled(l, 'estado') && !fieldFilled(l, 'cidade')).length;
        const completos = all.filter(l => missingFieldsCount(l) === 0).length;
        const mqls = all.filter(l => !!l.is_mql).length;
        return { total: all.length, semAnimais, semInteresse, semLocal, completos, mqls };
    }, [leads, qualificationStageNames]);

    const updateDraft = (leadId: string, patch: Partial<CRMLead>) => {
        setDraft(prev => ({ ...prev, [leadId]: { ...prev[leadId], ...patch } }));
    };

    const persistField = async (lead: CRMLead, patch: Partial<CRMLead>) => {
        setSavingId(lead.id);
        try {
            const updated = await updateLead(lead.id, patch);
            onLeadUpdated(updated);
            // limpa o draft do lead após salvar
            setDraft(prev => {
                const cur: Partial<CRMLead> = { ...(prev[lead.id] || {}) };
                Object.keys(patch).forEach(k => { delete cur[k as keyof CRMLead]; });
                if (Object.keys(cur).length === 0) {
                    const next = { ...prev };
                    delete next[lead.id];
                    return next;
                }
                return { ...prev, [lead.id]: cur };
            });
        } finally {
            setSavingId(null);
        }
    };

    const qualificar = async (lead: CRMLead) => {
        if (missingFieldsCount(lead) > 0) {
            const ok = window.confirm(
                'Este lead ainda tem campos importantes vazios. Mover para o CRM principal mesmo assim?'
            );
            if (!ok) return;
        }
        setQualifyingId(lead.id);
        try {
            const updated = await updateLead(lead.id, { status: firstAdvancedStage });
            onLeadUpdated(updated);
        } finally {
            setQualifyingId(null);
        }
    };

    const inputCls = 'w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-[#363636] bg-white dark:bg-[#1B1B1B] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#A0792E] transition-colors';

    return (
        <div className="flex flex-col gap-4 pb-2">
            {/* Header / KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {[
                    { label: 'Aguardando qualificação', value: stats.total, icon: ListChecks, color: 'text-[#A0792E]', bg: 'bg-[#A0792E]/10' },
                    { label: 'MQLs (≥100 cab.)', value: stats.mqls, icon: Crown, color: 'text-fuchsia-600 dark:text-fuchsia-400', bg: 'bg-fuchsia-500/10' },
                    { label: 'Sem cabeçinhas', value: stats.semAnimais, icon: Beef, color: 'text-rose-500', bg: 'bg-rose-500/10' },
                    { label: 'Sem interesse', value: stats.semInteresse, icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                    { label: 'Sem localização', value: stats.semLocal, icon: MapPin, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    { label: 'Prontos p/ CRM', value: stats.completos, icon: Sparkles, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="bg-white dark:bg-[#262626] rounded-xl border border-gray-200 dark:border-[#2e2e2e] p-4 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                            <Icon size={18} className={color} />
                        </div>
                        <div>
                            <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
                            <p className="text-xs text-gray-500 leading-tight">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Search */}
            <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar por nome, telefone, cidade, interesse…"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#2e2e2e] bg-white dark:bg-[#262626] text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-[#A0792E]"
                />
            </div>

            {/* Help message */}
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-[#A0792E]/5 border border-[#A0792E]/20 text-xs text-gray-700 dark:text-gray-300">
                <Sparkles size={14} className="text-[#A0792E] flex-shrink-0 mt-0.5" />
                <p>
                    Os leads que entram pelo grupo de WhatsApp aparecem aqui para serem qualificados.
                    Preencha os campos obrigatórios (cabeçinhas, interesse, localização, contato) e clique em
                    <span className="font-semibold text-[#A0792E]"> &ldquo;Mover para o CRM&rdquo;</span> quando o lead estiver pronto.
                </p>
            </div>

            {/* Lista */}
            {qualificationLeads.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 dark:border-[#363636] py-12 text-center text-gray-400">
                    <ListChecks size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Nenhum lead aguardando qualificação.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {paginatedLeads.map(lead => {
                        const missing = REQUIRED_FIELDS.filter(f => !fieldFilled(lead, f.key));
                        const ready = missing.length === 0;
                        const isSaving = savingId === lead.id;
                        const isMoving = qualifyingId === lead.id;
                        const lDraft = draft[lead.id] || {};
                        const dt = lead.data_entrada || lead.created_at;
                        const isMql = !!lead.is_mql;

                        // MQL ganha visual de prioridade — borda dourada e fundo levemente
                        // âmbar — para o operador identificar de relance quem atender primeiro.
                        const cardBorder = isMql
                            ? 'border-[#A0792E]/60 bg-gradient-to-r from-[#A0792E]/[0.06] to-transparent ring-1 ring-[#A0792E]/30'
                            : ready
                                ? 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/[0.04]'
                                : 'border-gray-200 dark:border-[#2e2e2e] bg-white dark:bg-[#262626]';

                        return (
                            <div
                                key={lead.id}
                                className={`rounded-2xl border p-4 transition-all ${cardBorder}`}
                            >
                                {/* Top row */}
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {isMql && (
                                                <span
                                                    className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-gradient-to-r from-[#A0792E] to-[#D4A85C] text-black shadow-sm"
                                                    title="Marketing Qualified Lead — ≥100 cabeças. Prioridade de atendimento."
                                                >
                                                    <Crown size={10} /> MQL
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => onOpenLead(lead)}
                                                className="font-bold text-gray-900 dark:text-white text-base hover:text-[#A0792E] transition-colors leading-tight text-left"
                                            >
                                                {lead.nome}
                                            </button>
                                            {ready ? (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                                    <Check size={10} /> Completo
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                                    {missing.length} dado{missing.length > 1 ? 's' : ''} faltando
                                                </span>
                                            )}
                                            {momentoLabel(lead.momento_pecuaria) && (
                                                <span className="inline-flex items-center text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-300">
                                                    {momentoLabel(lead.momento_pecuaria)}
                                                </span>
                                            )}
                                            {lead.source && (
                                                <span className="inline-flex items-center text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#2e2e2e] text-gray-500 dark:text-gray-400">
                                                    {lead.source}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                                            {(lead.celular || lead.telefone) && (
                                                <span className="inline-flex items-center gap-1"><Phone size={11} /> {lead.celular || lead.telefone}</span>
                                            )}
                                            {lead.email && (
                                                <span className="inline-flex items-center gap-1 truncate max-w-[220px]"><Mail size={11} /> {lead.email}</span>
                                            )}
                                            {lead.instagram && (
                                                <span className="inline-flex items-center gap-1"><Instagram size={11} /> {lead.instagram}</span>
                                            )}
                                            {lead.empresa && (
                                                <span className="inline-flex items-center gap-1 text-gray-400 truncate max-w-[200px]">{lead.empresa}</span>
                                            )}
                                            {dt && (
                                                <span className="inline-flex items-center gap-1 text-gray-400">
                                                    Entrou {new Date(dt).toLocaleDateString('pt-BR')}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => qualificar(lead)}
                                        disabled={isMoving}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-[#A0792E] to-[#D4A85C] text-black text-xs font-bold hover:shadow-md transition-all disabled:opacity-50 flex-shrink-0"
                                        title="Mover para o CRM principal"
                                    >
                                        {isMoving ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                                        Mover para o CRM
                                    </button>
                                </div>

                                {/* Quick fill grid */}
                                <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5">
                                    <Field
                                        label="Celular / WhatsApp"
                                        value={lDraft.celular ?? lead.celular ?? ''}
                                        onChange={v => updateDraft(lead.id, { celular: v })}
                                        onBlur={v => v !== (lead.celular || '') && persistField(lead, { celular: v || null })}
                                        placeholder="(00) 00000-0000"
                                        inputCls={inputCls}
                                        missing={!fieldFilled(lead, 'celular')}
                                    />
                                    <Field
                                        label="Estado"
                                        value={lDraft.estado ?? lead.estado ?? ''}
                                        onChange={v => updateDraft(lead.id, { estado: v.toUpperCase() })}
                                        onBlur={v => v.toUpperCase() !== (lead.estado || '') && persistField(lead, { estado: v ? v.toUpperCase() : null })}
                                        placeholder="MG"
                                        inputCls={inputCls}
                                        missing={!fieldFilled(lead, 'estado')}
                                    />
                                    <Field
                                        label="Cidade"
                                        value={lDraft.cidade ?? lead.cidade ?? ''}
                                        onChange={v => updateDraft(lead.id, { cidade: v })}
                                        onBlur={v => v !== (lead.cidade || '') && persistField(lead, { cidade: v || null })}
                                        placeholder="Uberaba"
                                        inputCls={inputCls}
                                        missing={!fieldFilled(lead, 'cidade')}
                                    />
                                    <Field
                                        label="Cabeçinhas"
                                        value={lDraft.quantidade_animais ?? lead.quantidade_animais ?? ''}
                                        onChange={v => updateDraft(lead.id, { quantidade_animais: v })}
                                        onBlur={v => {
                                            if (v === (lead.quantidade_animais || '')) return;
                                            // Recalcula MQL pela mesma regra canônica do quiz/webhook.
                                            const MQL_FAIXAS = new Set(['100-300','300-500','500+','100 a 300','300 a 500','500 ou mais']);
                                            const num = v.match(/^(\d+)\s*$/);
                                            const isMqlNow = MQL_FAIXAS.has(v) || (num ? Number(num[1]) >= 100 : false);
                                            persistField(lead, {
                                                quantidade_animais: v || null,
                                                is_mql: isMqlNow,
                                            });
                                        }}
                                        placeholder="500"
                                        inputCls={inputCls}
                                        missing={!fieldFilled(lead, 'quantidade_animais')}
                                    />
                                    <Field
                                        label="O que busca"
                                        value={lDraft.o_que_busca ?? lead.o_que_busca ?? ''}
                                        onChange={v => updateDraft(lead.id, { o_que_busca: v })}
                                        onBlur={v => v !== (lead.o_que_busca || '') && persistField(lead, { o_que_busca: v || null })}
                                        placeholder="Touros, matrizes…"
                                        inputCls={inputCls}
                                        missing={!fieldFilled(lead, 'o_que_busca')}
                                    />
                                    <SelectField
                                        label="Momento"
                                        value={lDraft.momento_pecuaria ?? lead.momento_pecuaria ?? ''}
                                        onChange={v => persistField(lead, { momento_pecuaria: v || null })}
                                        options={[
                                            { value: '', label: '—' },
                                            { value: 'nao-trabalho-quero-aprender', label: 'Quer aprender' },
                                            { value: 'pecuaria-de-corte', label: 'Corte' },
                                            { value: 'corte-e-po', label: 'Corte + P.O.' },
                                            { value: 'criador-renomado-po', label: 'Criador P.O.' },
                                        ]}
                                        inputCls={inputCls}
                                    />
                                </div>

                                <div className="flex items-center justify-between mt-3">
                                    <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                                        {isSaving ? (
                                            <><Loader2 size={10} className="animate-spin" /> Salvando…</>
                                        ) : (
                                            <span>Edição inline · TAB para próximo · BLUR salva automaticamente</span>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onOpenLead(lead)}
                                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#A0792E] transition-colors"
                                    >
                                        Ver perfil completo <ChevronRight size={12} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {qualificationLeads.length > 0 && (
                        <div className="rounded-xl border border-gray-200 dark:border-[#2e2e2e] bg-white dark:bg-[#262626]">
                            <Pagination
                                page={page}
                                totalPages={totalPages}
                                totalItems={qualificationLeads.length}
                                pageSize={perPage}
                                onPageChange={setPage}
                                onPageSizeChange={setPerPage}
                                itemLabel={{ singular: 'lead', plural: 'leads' }}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function Field({
    label, value, onChange, onBlur, placeholder, inputCls, missing,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    onBlur: (v: string) => void;
    placeholder?: string;
    inputCls: string;
    missing: boolean;
}) {
    return (
        <div>
            <label className={`block text-[9px] font-bold uppercase tracking-wider mb-1 ${missing ? 'text-amber-500' : 'text-gray-400'}`}>
                {label}
                {missing && <span className="ml-1">•</span>}
            </label>
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                onBlur={e => onBlur(e.target.value)}
                placeholder={placeholder}
                className={`${inputCls} ${missing ? 'border-amber-500/40' : ''}`}
            />
        </div>
    );
}

function SelectField({
    label, value, onChange, options, inputCls,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    inputCls: string;
}) {
    return (
        <div>
            <label className="block text-[9px] font-bold uppercase tracking-wider mb-1 text-gray-400">
                {label}
            </label>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className={inputCls}
            >
                {options.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
        </div>
    );
}
