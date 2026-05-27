'use client';

import { useState, useMemo } from 'react';
import { CRMLead } from '@/app/sistema/actions/crm-leads';
import { Search, Phone, MapPin, Calendar, Instagram, TrendingUp, Users, Plus, Download, SlidersHorizontal, X } from 'lucide-react';
import { Pagination } from '@/components/admin/Pagination';

interface CRMLeadsViewProps {
    leads: CRMLead[];
    stages: string[];
    onEditLead: (lead: CRMLead) => void;
    onAddLead: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    google: 'Google',
    whatsapp: 'WhatsApp',
    indicacao: 'Indicação',
    site: 'Site',
    'google-ads': 'Google Ads',
    'facebook-ads': 'Facebook Ads',
};

const SOURCE_COLORS: Record<string, string> = {
    facebook: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    instagram: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
    google: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300',
    'google-ads': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300',
    whatsapp: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
    indicacao: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
    site: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300',
    'facebook-ads': 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
};

const STAGE_COLORS: Record<string, string> = {
    Lead: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
    Qualificado: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    Proposta: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    'Negociação': 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
    Fechado: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
    Perdido: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    'Sem Status': 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300',
};

function csvEscape(v: unknown) {
    const s = v == null ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
}

function exportLeadsCSV(rows: CRMLead[]) {
    const header = [
        'Nome', 'Empresa', 'Status', 'Origem', 'Telefone', 'Celular', 'Instagram',
        'Cidade', 'Estado', 'O que busca', 'Quantidade animais', 'Interesse',
        'Valor estimado', 'Probabilidade', 'Prioridade', 'Responsável',
        'Última interação', 'Data estimada fechamento', 'Data entrada', 'Criado em',
        'Source page', 'Medium', 'Campanha',
    ];
    const lines = rows.map(l => [
        l.nome, l.empresa || '', l.status || '', l.source || '',
        l.telefone || '', l.celular || '', l.instagram || '',
        l.cidade || '', l.estado || '', l.o_que_busca || '', l.quantidade_animais || '',
        l.interesse || '', l.valor_estimado ?? '', l.probabilidade ?? '', l.prioridade || '',
        l.responsavel || '',
        l.ultimo_contato ? new Date(l.ultimo_contato).toLocaleDateString('pt-BR') : '',
        l.data_estimada_fechamento ? new Date(l.data_estimada_fechamento).toLocaleDateString('pt-BR') : '',
        l.data_entrada ? new Date(l.data_entrada).toLocaleDateString('pt-BR') : '',
        l.created_at ? new Date(l.created_at).toLocaleDateString('pt-BR') : '',
        l.source_page || '', l.medium || '', l.campaign || '',
    ].map(csvEscape).join(';'));
    const csv = '﻿' + [header.map(csvEscape).join(';'), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export function CRMLeadsView({ leads, stages, onEditLead, onAddLead }: CRMLeadsViewProps) {
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterEstado, setFilterEstado] = useState('');
    const [filterCidade, setFilterCidade] = useState('');
    const [filterSource, setFilterSource] = useState('');
    const [filterResponsavel, setFilterResponsavel] = useState('');
    const [filterPrioridade, setFilterPrioridade] = useState('');
    const [filterBusca, setFilterBusca] = useState('');
    const [filterDataDe, setFilterDataDe] = useState('');
    const [filterDataAte, setFilterDataAte] = useState('');
    const [showAdvFilters, setShowAdvFilters] = useState(true);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(25);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 7);

    const todayCount = leads.filter(l => {
        const d = l.data_entrada || l.created_at;
        return d && new Date(d) >= today;
    }).length;

    const weekCount = leads.filter(l => {
        const d = l.data_entrada || l.created_at;
        return d && new Date(d) >= weekStart;
    }).length;

    const estados = useMemo(
        () => [...new Set(leads.map(l => l.estado).filter(Boolean) as string[])].sort(),
        [leads]
    );
    const cidades = useMemo(
        () => [...new Set(leads.map(l => l.cidade).filter(Boolean) as string[])].sort(),
        [leads]
    );
    const sources = useMemo(
        () => [...new Set(leads.map(l => l.source).filter(Boolean) as string[])].sort(),
        [leads]
    );
    const responsaveis = useMemo(
        () => [...new Set(leads.map(l => l.responsavel).filter(Boolean) as string[])].sort(),
        [leads]
    );
    const prioridades = useMemo(
        () => [...new Set(leads.map(l => l.prioridade).filter(Boolean) as string[])].sort(),
        [leads]
    );

    const filtered = useMemo(() => {
        setPage(1);
        const dataDe = filterDataDe ? new Date(filterDataDe + 'T00:00:00') : null;
        const dataAte = filterDataAte ? new Date(filterDataAte + 'T23:59:59') : null;
        const buscaQ = filterBusca.toLowerCase();
        return leads.filter(lead => {
            const q = search.toLowerCase();
            const matchSearch =
                !search ||
                lead.nome.toLowerCase().includes(q) ||
                lead.celular?.includes(search) ||
                lead.telefone?.includes(search) ||
                lead.cidade?.toLowerCase().includes(q) ||
                lead.empresa?.toLowerCase().includes(q) ||
                lead.instagram?.toLowerCase().includes(q);
            const matchStatus = !filterStatus || lead.status === filterStatus;
            const matchEstado = !filterEstado || lead.estado === filterEstado;
            const matchCidade = !filterCidade || lead.cidade === filterCidade;
            const matchSource = !filterSource || lead.source === filterSource;
            const matchResp = !filterResponsavel || lead.responsavel === filterResponsavel;
            const matchPrio = !filterPrioridade || lead.prioridade === filterPrioridade;
            const matchBusca = !filterBusca ||
                (lead.o_que_busca?.toLowerCase().includes(buscaQ)) ||
                (lead.interesse?.toLowerCase().includes(buscaQ));
            const dt = lead.data_entrada || lead.created_at;
            const d = dt ? new Date(dt) : null;
            const matchData = (!dataDe || (d && d >= dataDe)) && (!dataAte || (d && d <= dataAte));
            return matchSearch && matchStatus && matchEstado && matchCidade
                && matchSource && matchResp && matchPrio && matchBusca && matchData;
        });
    }, [leads, search, filterStatus, filterEstado, filterCidade, filterSource,
        filterResponsavel, filterPrioridade, filterBusca, filterDataDe, filterDataAte]);

    const activeFiltersCount =
        (filterStatus ? 1 : 0) + (filterEstado ? 1 : 0) + (filterCidade ? 1 : 0) +
        (filterSource ? 1 : 0) + (filterResponsavel ? 1 : 0) + (filterPrioridade ? 1 : 0) +
        (filterBusca ? 1 : 0) + (filterDataDe ? 1 : 0) + (filterDataAte ? 1 : 0);

    const clearFilters = () => {
        setFilterStatus(''); setFilterEstado(''); setFilterCidade('');
        setFilterSource(''); setFilterResponsavel(''); setFilterPrioridade('');
        setFilterBusca(''); setFilterDataDe(''); setFilterDataAte('');
    };

    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    const paginated = filtered.slice((page - 1) * perPage, page * perPage);

    return (
        <div className="flex flex-col gap-4 h-full min-h-0">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 shrink-0">
                <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-[#2A2A2A] p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                        <Users size={18} className="text-blue-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{leads.length}</p>
                        <p className="text-xs text-gray-500">Total de leads</p>
                    </div>
                </div>
                <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-[#2A2A2A] p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-500/10 flex items-center justify-center shrink-0">
                        <Calendar size={18} className="text-green-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{todayCount}</p>
                        <p className="text-xs text-gray-500">Hoje</p>
                    </div>
                </div>
                <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-[#2A2A2A] p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center shrink-0">
                        <TrendingUp size={18} className="text-orange-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{weekCount}</p>
                        <p className="text-xs text-gray-500">Últimos 7 dias</p>
                    </div>
                </div>
            </div>

            {/* Search + filters */}
            <div className="flex flex-col gap-3 shrink-0">
                <div className="flex gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por nome, telefone, cidade, instagram..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-xl text-sm focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent outline-none dark:text-white placeholder:text-gray-400"
                        />
                    </div>
                    <select
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                        className="px-4 py-2.5 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-xl text-sm focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent outline-none dark:text-white"
                    >
                        <option value="">Todos os status</option>
                        {stages.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {estados.length > 0 && (
                        <select
                            value={filterEstado}
                            onChange={e => setFilterEstado(e.target.value)}
                            className="px-4 py-2.5 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-xl text-sm focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent outline-none dark:text-white"
                        >
                            <option value="">Todos os estados</option>
                            {estados.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                    )}
                    <button
                        onClick={() => setShowAdvFilters(v => !v)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${showAdvFilters || activeFiltersCount > 0
                            ? 'border-[#A68B4B] bg-[#A68B4B]/10 text-[#A68B4B]'
                            : 'border-gray-200 dark:border-[#333] text-gray-600 dark:text-gray-300 hover:border-[#A68B4B]/40 hover:text-[#A68B4B]'}`}
                    >
                        <SlidersHorizontal size={15} /> Filtros
                        {activeFiltersCount > 0 && (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#A68B4B] text-white text-[10px] font-bold">
                                {activeFiltersCount}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => exportLeadsCSV(filtered)}
                        disabled={filtered.length === 0}
                        title="Exportar leads filtrados em CSV"
                        className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-[#A68B4B] hover:text-[#A68B4B] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        <Download size={15} /> Exportar
                    </button>
                    <button
                        onClick={onAddLead}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
                    >
                        <Plus size={15} /> Novo lead
                    </button>
                </div>

                {/* Advanced filters panel */}
                {showAdvFilters && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-2xl border border-gray-200 dark:border-[#2A2A2A] bg-gray-50/50 dark:bg-[#141414]">
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Origem</label>
                            <select
                                value={filterSource}
                                onChange={e => setFilterSource(e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-lg text-sm dark:text-white focus:outline-none focus:border-[#A68B4B]"
                            >
                                <option value="">Todas</option>
                                {sources.map(s => (
                                    <option key={s} value={s}>{SOURCE_LABELS[s.toLowerCase()] || s}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Responsável</label>
                            <select
                                value={filterResponsavel}
                                onChange={e => setFilterResponsavel(e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-lg text-sm dark:text-white focus:outline-none focus:border-[#A68B4B]"
                            >
                                <option value="">Todos</option>
                                {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Cidade</label>
                            <select
                                value={filterCidade}
                                onChange={e => setFilterCidade(e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-lg text-sm dark:text-white focus:outline-none focus:border-[#A68B4B]"
                            >
                                <option value="">Todas</option>
                                {cidades.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Prioridade</label>
                            <select
                                value={filterPrioridade}
                                onChange={e => setFilterPrioridade(e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-lg text-sm dark:text-white focus:outline-none focus:border-[#A68B4B]"
                            >
                                <option value="">Todas</option>
                                {prioridades.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div className="lg:col-span-2">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">O que busca / interesse</label>
                            <input
                                type="text"
                                value={filterBusca}
                                onChange={e => setFilterBusca(e.target.value)}
                                placeholder="Touro, embrião, fêmea P.O., bezerra..."
                                className="w-full px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-lg text-sm dark:text-white focus:outline-none focus:border-[#A68B4B]"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Entrada de</label>
                            <input
                                type="date"
                                value={filterDataDe}
                                onChange={e => setFilterDataDe(e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-lg text-sm dark:text-white focus:outline-none focus:border-[#A68B4B]"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Entrada até</label>
                            <input
                                type="date"
                                value={filterDataAte}
                                onChange={e => setFilterDataAte(e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-lg text-sm dark:text-white focus:outline-none focus:border-[#A68B4B]"
                            />
                        </div>
                        {activeFiltersCount > 0 && (
                            <div className="lg:col-span-4 flex justify-end">
                                <button
                                    onClick={clearFilters}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-red-500 transition-colors"
                                >
                                    <X size={13} /> Limpar filtros
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0 bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-[#2A2A2A] overflow-hidden flex flex-col">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50 dark:bg-[#141414] border-b border-gray-200 dark:border-[#333] z-10">
                            <tr>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Nome</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Contato</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Origem</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Localização</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">O que busca</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Status</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Entrada</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Responsável</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-[#2e2e2e]">
                            {paginated.map(lead => {
                                const src = lead.source?.toLowerCase() || '';
                                const sourceLabel = SOURCE_LABELS[src] || lead.source || null;
                                const sourceColor = SOURCE_COLORS[src] || 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300';
                                const stageColor = STAGE_COLORS[lead.status] || 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300';
                                const dateStr = lead.data_entrada || lead.created_at;

                                return (
                                    <tr
                                        key={lead.id}
                                        onClick={() => onEditLead(lead)}
                                        className="hover:bg-gray-50 dark:hover:bg-[#2e2e2e] cursor-pointer transition-colors"
                                    >
                                        <td className="px-5 py-3.5">
                                            <div className="font-medium text-gray-900 dark:text-white leading-tight">{lead.nome}</div>
                                            {lead.empresa && (
                                                <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[160px]">{lead.empresa}</div>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex flex-col gap-0.5">
                                                {(lead.celular || lead.telefone) && (
                                                    <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                                                        <Phone size={11} className="shrink-0" />
                                                        <span>{lead.celular || lead.telefone}</span>
                                                    </div>
                                                )}
                                                {lead.instagram && (
                                                    <div className="flex items-center gap-1 text-xs text-gray-400">
                                                        <Instagram size={11} className="shrink-0" />
                                                        <span>{lead.instagram}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {sourceLabel ? (
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sourceColor}`}>
                                                    {sourceLabel}
                                                </span>
                                            ) : (
                                                <span className="text-gray-300 dark:text-gray-600">—</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {(lead.cidade || lead.estado) ? (
                                                <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                                                    <MapPin size={11} className="text-orange-400 shrink-0" />
                                                    <span>
                                                        {lead.cidade && lead.estado
                                                            ? `${lead.cidade}/${lead.estado}`
                                                            : (lead.cidade || lead.estado)}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-gray-300 dark:text-gray-600">—</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5 max-w-[180px]">
                                            <span className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                                                {lead.o_que_busca || lead.interesse || <span className="text-gray-300 dark:text-gray-600">—</span>}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 whitespace-nowrap">
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${stageColor}`}>
                                                {lead.status}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                                            {dateStr
                                                ? new Date(dateStr).toLocaleDateString('pt-BR')
                                                : <span className="text-gray-300 dark:text-gray-600">—</span>}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {lead.responsavel ? (
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-6 h-6 rounded-full bg-[#A68B4B]/20 text-[#A68B4B] text-xs font-bold flex items-center justify-center shrink-0">
                                                        {lead.responsavel.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[80px]">
                                                        {lead.responsavel}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-gray-300 dark:text-gray-600">—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {filtered.length === 0 && (
                        <div className="p-12 text-center text-gray-400 text-sm">
                            {search || activeFiltersCount > 0
                                ? 'Nenhum lead encontrado com esses filtros.'
                                : 'Nenhum lead cadastrado ainda.'}
                        </div>
                    )}
                </div>

                <Pagination
                    page={page}
                    totalPages={totalPages}
                    totalItems={filtered.length}
                    pageSize={perPage}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => { setPerPage(size); setPage(1); }}
                    itemLabel={{ singular: 'lead', plural: 'leads' }}
                    summaryPrefix={
                        filtered.length === leads.length
                            ? `${leads.length} lead${leads.length !== 1 ? 's' : ''}`
                            : `${filtered.length} de ${leads.length} leads`
                    }
                />
            </div>
        </div>
    );
}
