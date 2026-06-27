'use client';

import { useState, useMemo, useEffect } from 'react';
import { CRMLead } from '@/app/sistema/actions/crm-leads';
import { Search, Phone, MapPin, Calendar, Instagram, TrendingUp, Users, Plus, Download, SlidersHorizontal, X, Crown, ArrowRight, Archive, Loader2, Check } from 'lucide-react';
import { Pagination } from '@/components/admin/Pagination';

interface CRMLeadsViewProps {
    leads: CRMLead[];
    stages: string[];
    onEditLead: (lead: CRMLead) => void;
    onAddLead: () => void;
    /** Status que representam a fila pré-CRM (Entrada Leads). Leads nestes status
     *  exibem o botão "Enviar para o CRM"; os demais aparecem como "No CRM". */
    qualificationStatuses?: string[];
    /** Move o lead da Entrada para a primeira coluna do Kanban (CONEXÃO). */
    onMoveToCrm?: (lead: CRMLead) => Promise<void> | void;
    /** Arquiva o lead (soft-delete). */
    onArchive?: (lead: CRMLead) => Promise<void> | void;
}

// Campos mínimos para um lead estar "pronto" para o CRM. Espelha a Entrada Leads.
const REQUIRED_FIELDS: (keyof CRMLead)[] = ['celular', 'estado', 'cidade', 'quantidade_animais', 'o_que_busca'];

function fieldFilled(lead: CRMLead, key: keyof CRMLead): boolean {
    const v = lead[key];
    if (v == null) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    return true;
}

function missingFieldsCount(lead: CRMLead): number {
    return REQUIRED_FIELDS.reduce((acc, k) => acc + (fieldFilled(lead, k) ? 0 : 1), 0);
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
    'ENTRADA': 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300',
    'CONEXÃO': 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    'QUALIFICAÇÃO': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300',
    'INFORMAÇÕES CAPTADAS': 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
    'CADASTRO': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300',
    'PERDIDOS': 'bg-gray-200 text-gray-500 dark:bg-gray-600/30 dark:text-gray-400',
    'ASSESSORES': 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
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

type ExportField = {
    id: string;
    label: string;
    value: (lead: CRMLead) => string | number | boolean;
};

const EXPORT_FIELDS: ExportField[] = [
    { id: 'nome', label: 'Nome', value: l => l.nome || '' },
    { id: 'empresa', label: 'Empresa/Fazenda', value: l => l.empresa || '' },
    { id: 'status', label: 'Status', value: l => l.status || '' },
    { id: 'usuario', label: 'Usuário', value: l => l.responsavel || '' },
    { id: 'prioridade', label: 'Prioridade', value: l => l.prioridade || '' },
    { id: 'temperatura', label: 'Temperatura', value: l => l.temperatura || '' },
    { id: 'telefone', label: 'Telefone', value: l => l.telefone || '' },
    { id: 'celular', label: 'Celular/WhatsApp', value: l => l.celular || '' },
    { id: 'email', label: 'E-mail', value: l => l.email || '' },
    { id: 'instagram', label: 'Instagram', value: l => l.instagram || '' },
    { id: 'cidade', label: 'Cidade', value: l => l.cidade || '' },
    { id: 'estado', label: 'Estado', value: l => l.estado || '' },
    { id: 'cpf', label: 'CPF', value: l => l.cpf || '' },
    { id: 'ie', label: 'Inscrição Estadual', value: l => l.inscricao_estadual || '' },
    { id: 'tem_ie', label: 'Tem I.E.', value: l => l.tem_inscricao_estadual || '' },
    { id: 'score_serasa', label: 'Score Serasa', value: l => l.score_serasa ?? '' },
    { id: 'pendencias_financeiras', label: 'Pendências financeiras', value: l => l.pendencias_financeiras || '' },
    { id: 'o_que_busca', label: 'O que busca', value: l => l.o_que_busca || '' },
    { id: 'quantidade_animais', label: 'Quantidade animais', value: l => l.quantidade_animais || '' },
    { id: 'momento_pecuaria', label: 'Momento pecuária', value: l => l.momento_pecuaria || '' },
    { id: 'operacao_pecuaria', label: 'Operação pecuária', value: l => l.operacao_pecuaria || '' },
    { id: 'interesse', label: 'Interesse', value: l => l.interesse || '' },
    { id: 'assessoria', label: 'Assessoria', value: l => l.assessoria || '' },
    { id: 'mql', label: 'MQL', value: l => l.is_mql ? 'Sim' : 'Não' },
    { id: 'preferencial', label: 'Preferencial', value: l => l.is_preferencial ? 'Sim' : 'Não' },
    { id: 'valor_estimado', label: 'Valor estimado', value: l => l.valor_estimado ?? '' },
    { id: 'probabilidade', label: 'Probabilidade', value: l => l.probabilidade ?? '' },
    { id: 'origem', label: 'Origem', value: l => l.origem || l.source || '' },
    { id: 'source_page', label: 'Source page', value: l => l.source_page || '' },
    { id: 'source', label: 'Source', value: l => l.source || '' },
    { id: 'medium', label: 'Medium', value: l => l.medium || '' },
    { id: 'campaign', label: 'Campanha', value: l => l.campaign || '' },
    { id: 'utm_content', label: 'UTM content', value: l => l.utm_content || '' },
    { id: 'utm_term', label: 'UTM term', value: l => l.utm_term || '' },
    { id: 'gclid', label: 'GCLID', value: l => l.gclid || '' },
    { id: 'fbclid', label: 'FBCLID', value: l => l.fbclid || '' },
    { id: 'landing_url', label: 'Landing URL', value: l => l.landing_url || '' },
    { id: 'ultimo_contato', label: 'Último contato', value: l => l.ultimo_contato ? new Date(l.ultimo_contato).toLocaleDateString('pt-BR') : '' },
    { id: 'data_estimada_fechamento', label: 'Data estimada fechamento', value: l => l.data_estimada_fechamento ? new Date(l.data_estimada_fechamento).toLocaleDateString('pt-BR') : '' },
    { id: 'data_entrada', label: 'Data entrada', value: l => l.data_entrada ? new Date(l.data_entrada).toLocaleDateString('pt-BR') : '' },
    { id: 'created_at', label: 'Criado em', value: l => l.created_at ? new Date(l.created_at).toLocaleDateString('pt-BR') : '' },
    { id: 'notes', label: 'Notas', value: l => l.notes || '' },
];

async function exportLeadsXLSX(rows: CRMLead[], selectedIds: string[]) {
    const XLSX = await import('xlsx');
    const fields = EXPORT_FIELDS.filter(f => selectedIds.includes(f.id));
    const data = rows.map(lead => Object.fromEntries(fields.map(field => [field.label, field.value(lead)])));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = fields.map(field => ({
        wch: Math.max(field.label.length + 2, ...data.map(row => String(row[field.label] ?? '').length + 2), 12),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    XLSX.writeFile(wb, `leads-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function CRMLeadsView({ leads, stages, onEditLead, onAddLead, qualificationStatuses, onMoveToCrm, onArchive }: CRMLeadsViewProps) {
    const entryStatuses = useMemo(() => new Set(qualificationStatuses ?? []), [qualificationStatuses]);
    const [movingId, setMovingId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [mqlOnly, setMqlOnly] = useState(false);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterEstado, setFilterEstado] = useState('');
    const [filterCidade, setFilterCidade] = useState('');
    const [filterSource, setFilterSource] = useState('');
    const [filterResponsavel, setFilterResponsavel] = useState('');
    const [filterPrioridade, setFilterPrioridade] = useState('');
    const [filterCampanha, setFilterCampanha] = useState('');
    const [filterTemperatura, setFilterTemperatura] = useState('');
    const [filterCadastro, setFilterCadastro] = useState(''); // '' | 'completo' | 'incompleto'
    const [filterContato, setFilterContato] = useState('');   // '' | 'com' | 'sem'
    const [filterBusca, setFilterBusca] = useState('');
    const [filterDataDe, setFilterDataDe] = useState('');
    const [filterDataAte, setFilterDataAte] = useState('');
    const [showAdvFilters, setShowAdvFilters] = useState(true);
    const [showExportFields, setShowExportFields] = useState(false);
    const [selectedExportFields, setSelectedExportFields] = useState<string[]>(() => EXPORT_FIELDS.slice(0, 24).map(f => f.id));
    const [isExporting, setIsExporting] = useState(false);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(25);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 7);

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
    const temperaturas = useMemo(
        () => [...new Set(leads.map(l => l.temperatura).filter(Boolean) as string[])].sort(),
        [leads]
    );
    const campanhas = useMemo(
        () => [...new Set(leads.map(l => l.campaign).filter(Boolean) as string[])].sort(),
        [leads]
    );

    // Volta para a 1ª página sempre que um filtro muda (evita ficar numa página
    // inexistente). Fica no efeito — chamar setPage dentro do useMemo dispara um
    // setState durante o render.
    useEffect(() => {
        setPage(1);
    }, [search, mqlOnly, filterStatus, filterEstado, filterCidade, filterSource,
        filterResponsavel, filterPrioridade, filterCampanha, filterTemperatura, filterCadastro,
        filterContato, filterBusca, filterDataDe, filterDataAte]);

    // baseFiltered aplica TODOS os filtros, exceto o toggle de MQL. Os cards do
    // painel (Total/Hoje/7 dias/MQL) são calculados sobre este conjunto, então
    // refletem proporcionalmente o que está filtrado. A tabela usa `filtered`,
    // que é baseFiltered + o recorte de MQL quando o card de MQL está ativo.
    const baseFiltered = useMemo(() => {
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
            const matchCampanha = !filterCampanha || lead.campaign === filterCampanha;
            const matchTemp = !filterTemperatura || lead.temperatura === filterTemperatura;
            const isComplete = missingFieldsCount(lead) === 0;
            const matchCadastro = !filterCadastro
                || (filterCadastro === 'completo' ? isComplete : !isComplete);
            const hasContato = !!(lead.celular || lead.telefone);
            const matchContato = !filterContato
                || (filterContato === 'com' ? hasContato : !hasContato);
            const matchBusca = !filterBusca ||
                (lead.o_que_busca?.toLowerCase().includes(buscaQ)) ||
                (lead.interesse?.toLowerCase().includes(buscaQ));
            const dt = lead.data_entrada || lead.created_at;
            const d = dt ? new Date(dt) : null;
            const matchData = (!dataDe || (d && d >= dataDe)) && (!dataAte || (d && d <= dataAte));
            return matchSearch && matchStatus && matchEstado && matchCidade
                && matchSource && matchResp && matchPrio && matchCampanha && matchTemp
                && matchCadastro && matchContato && matchBusca && matchData;
        });
    }, [leads, search, filterStatus, filterEstado, filterCidade, filterSource,
        filterResponsavel, filterPrioridade, filterCampanha, filterTemperatura, filterCadastro,
        filterContato, filterBusca, filterDataDe, filterDataAte]);

    const filtered = useMemo(
        () => mqlOnly ? baseFiltered.filter(l => !!l.is_mql) : baseFiltered,
        [baseFiltered, mqlOnly]
    );

    // Estatísticas proporcionais ao recorte atual. Total/Hoje/7 dias descrevem os
    // leads efetivamente mostrados (filtered); MQL conta quantos MQL existem no
    // recorte de filtros (baseFiltered), independente do toggle de MQL estar ligado.
    const todayCount = useMemo(() => filtered.filter(l => {
        const d = l.data_entrada || l.created_at;
        return d && new Date(d) >= today;
    }).length, [filtered]);
    const weekCount = useMemo(() => filtered.filter(l => {
        const d = l.data_entrada || l.created_at;
        return d && new Date(d) >= weekStart;
    }).length, [filtered]);
    const mqlCount = useMemo(() => baseFiltered.filter(l => l.is_mql).length, [baseFiltered]);

    const activeFiltersCount =
        (filterStatus ? 1 : 0) + (filterEstado ? 1 : 0) + (filterCidade ? 1 : 0) +
        (filterSource ? 1 : 0) + (filterResponsavel ? 1 : 0) + (filterPrioridade ? 1 : 0) +
        (filterCampanha ? 1 : 0) + (filterTemperatura ? 1 : 0) + (filterCadastro ? 1 : 0) +
        (filterContato ? 1 : 0) + (filterBusca ? 1 : 0) + (filterDataDe ? 1 : 0) + (filterDataAte ? 1 : 0);

    // Conjunto está recortado em relação ao total? (inclui busca e o toggle de MQL)
    const isFiltering = activeFiltersCount > 0 || !!search || mqlOnly;

    const clearFilters = () => {
        setFilterStatus(''); setFilterEstado(''); setFilterCidade('');
        setFilterSource(''); setFilterResponsavel(''); setFilterPrioridade('');
        setFilterCampanha(''); setFilterTemperatura(''); setFilterCadastro(''); setFilterContato('');
        setFilterBusca(''); setFilterDataDe(''); setFilterDataAte('');
    };

    const setDatePreset = (days: number) => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);
        const fmt = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };
        setFilterDataDe(fmt(start));
        setFilterDataAte(fmt(end));
    };

    const toggleExportField = (id: string) => {
        setSelectedExportFields(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleExport = async () => {
        if (filtered.length === 0 || selectedExportFields.length === 0) return;
        setIsExporting(true);
        try {
            await exportLeadsXLSX(filtered, selectedExportFields);
        } finally {
            setIsExporting(false);
        }
    };

    const handleMove = async (lead: CRMLead) => {
        if (!onMoveToCrm) return;
        setMovingId(lead.id);
        try {
            await onMoveToCrm(lead);
        } finally {
            setMovingId(null);
        }
    };

    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    const paginated = filtered.slice((page - 1) * perPage, page * perPage);

    return (
        <div className="flex flex-col gap-4 h-full min-h-0">
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
                <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-[#2A2A2A] p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                        <Users size={18} className="text-blue-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{filtered.length}</p>
                        <p className="text-xs text-gray-500">
                            {isFiltering ? `de ${leads.length} no total` : 'Total de leads'}
                        </p>
                    </div>
                </div>
                <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-[#2A2A2A] p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-500/10 flex items-center justify-center shrink-0">
                        <Calendar size={18} className="text-green-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{todayCount}</p>
                        <p className="text-xs text-gray-500">{isFiltering ? 'Hoje (no filtro)' : 'Hoje'}</p>
                    </div>
                </div>
                <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-[#2A2A2A] p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center shrink-0">
                        <TrendingUp size={18} className="text-orange-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{weekCount}</p>
                        <p className="text-xs text-gray-500">{isFiltering ? '7 dias (no filtro)' : 'Últimos 7 dias'}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setMqlOnly(v => !v)}
                    title="Filtrar apenas leads MQL"
                    className={`rounded-xl border p-4 flex items-center gap-3 text-left transition-all ${mqlOnly
                        ? 'border-[#A68B4B] bg-[#A68B4B]/10'
                        : 'border-gray-200 dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] hover:border-[#A68B4B]/40'}`}
                >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#A68B4B]/20 to-[#C8A96E]/10 flex items-center justify-center shrink-0">
                        <Crown size={18} className="text-[#A68B4B]" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{mqlCount}</p>
                        <p className="text-xs text-gray-500">
                            {mqlOnly ? 'MQL (filtrando)' : isFiltering ? 'MQL no filtro' : 'MQL'}
                        </p>
                    </div>
                </button>
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
                        onClick={() => setShowExportFields(v => !v)}
                        disabled={filtered.length === 0}
                        title="Exportar leads filtrados em Excel"
                        className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-[#A68B4B] hover:text-[#A68B4B] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        <Download size={15} /> Excel
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
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Usuário</label>
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
                        {campanhas.length > 0 && (
                            <div className="lg:col-span-2">
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Campanha</label>
                                <select
                                    value={filterCampanha}
                                    onChange={e => setFilterCampanha(e.target.value)}
                                    className="w-full px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-lg text-sm dark:text-white focus:outline-none focus:border-[#A68B4B]"
                                >
                                    <option value="">Todas</option>
                                    {campanhas.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        )}
                        {temperaturas.length > 0 && (
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Temperatura</label>
                                <select
                                    value={filterTemperatura}
                                    onChange={e => setFilterTemperatura(e.target.value)}
                                    className="w-full px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-lg text-sm dark:text-white focus:outline-none focus:border-[#A68B4B]"
                                >
                                    <option value="">Todas</option>
                                    {temperaturas.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        )}
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Cadastro</label>
                            <select
                                value={filterCadastro}
                                onChange={e => setFilterCadastro(e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-lg text-sm dark:text-white focus:outline-none focus:border-[#A68B4B]"
                            >
                                <option value="">Todos</option>
                                <option value="completo">Completo</option>
                                <option value="incompleto">Incompleto</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Contato</label>
                            <select
                                value={filterContato}
                                onChange={e => setFilterContato(e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-lg text-sm dark:text-white focus:outline-none focus:border-[#A68B4B]"
                            >
                                <option value="">Todos</option>
                                <option value="com">Com telefone/WhatsApp</option>
                                <option value="sem">Sem telefone/WhatsApp</option>
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
                        <div className="lg:col-span-4 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Período:</span>
                                {[
                                    { label: 'Hoje', days: 0 },
                                    { label: '7 dias', days: 7 },
                                    { label: '30 dias', days: 30 },
                                    { label: '90 dias', days: 90 },
                                ].map(p => (
                                    <button
                                        key={p.label}
                                        type="button"
                                        onClick={() => setDatePreset(p.days)}
                                        className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-[#333] text-gray-600 dark:text-gray-300 hover:border-[#A68B4B] hover:text-[#A68B4B] transition-colors"
                                    >
                                        {p.label}
                                    </button>
                                ))}
                                {(filterDataDe || filterDataAte) && (
                                    <button
                                        type="button"
                                        onClick={() => { setFilterDataDe(''); setFilterDataAte(''); }}
                                        className="px-2 py-1 text-xs rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                        limpar datas
                                    </button>
                                )}
                            </div>
                            {activeFiltersCount > 0 && (
                                <button
                                    onClick={clearFilters}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-red-500 transition-colors"
                                >
                                    <X size={13} /> Limpar filtros
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {showExportFields && (
                    <div className="p-4 rounded-2xl border border-[#A68B4B]/30 bg-white dark:bg-[#141414]">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <p className="text-sm font-bold text-gray-900 dark:text-white">Campos da exportação</p>
                                <p className="text-xs text-gray-500">{filtered.length} lead(s) filtrado(s)</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => setSelectedExportFields(EXPORT_FIELDS.map(f => f.id))} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-[#333] text-gray-500 hover:text-[#A68B4B]">
                                    Todos
                                </button>
                                <button type="button" onClick={() => setSelectedExportFields(EXPORT_FIELDS.slice(0, 12).map(f => f.id))} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-[#333] text-gray-500 hover:text-[#A68B4B]">
                                    Básicos
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExport}
                                    disabled={isExporting || selectedExportFields.length === 0}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#A68B4B] text-black font-bold disabled:opacity-50"
                                >
                                    <Download size={13} /> {isExporting ? 'Exportando...' : 'Exportar .xlsx'}
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {EXPORT_FIELDS.map(field => (
                                <label key={field.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-gray-100 dark:border-[#2A2A2A] text-xs text-gray-600 dark:text-gray-300 hover:border-[#A68B4B]/40 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selectedExportFields.includes(field.id)}
                                        onChange={() => toggleExportField(field.id)}
                                        className="w-3.5 h-3.5 accent-[#A68B4B]"
                                    />
                                    <span className="truncate">{field.label}</span>
                                </label>
                            ))}
                        </div>
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
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Usuário</th>
                                {(onMoveToCrm || onArchive) && (
                                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Ações</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-[#2e2e2e]">
                            {paginated.map(lead => {
                                const src = lead.source?.toLowerCase() || '';
                                const sourceLabel = SOURCE_LABELS[src] || lead.source || null;
                                const sourceColor = SOURCE_COLORS[src] || 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300';
                                const stageColor = STAGE_COLORS[lead.status] || 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300';
                                const dateStr = lead.data_entrada || lead.created_at;
                                const isEntry = entryStatuses.has(lead.status);
                                const missing = missingFieldsCount(lead);
                                const isMoving = movingId === lead.id;

                                return (
                                    <tr
                                        key={lead.id}
                                        onClick={() => onEditLead(lead)}
                                        className={`hover:bg-gray-50 dark:hover:bg-[#2e2e2e] cursor-pointer transition-colors ${lead.is_mql ? 'bg-[#A68B4B]/[0.04]' : ''}`}
                                    >
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {lead.is_mql && (
                                                    <span
                                                        className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-gradient-to-r from-[#A68B4B] to-[#C8A96E] text-black shadow-sm shrink-0"
                                                        title="Marketing Qualified Lead — prioridade de atendimento"
                                                    >
                                                        <Crown size={9} /> MQL
                                                    </span>
                                                )}
                                                <span className="font-medium text-gray-900 dark:text-white leading-tight">{lead.nome}</span>
                                            </div>
                                            {lead.empresa && (
                                                <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[160px]">{lead.empresa}</div>
                                            )}
                                            {isEntry && (
                                                missing === 0 ? (
                                                    <span className="inline-flex items-center gap-1 mt-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                                        <Check size={9} /> Completo
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center mt-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                                        {missing} dado{missing > 1 ? 's' : ''} faltando
                                                    </span>
                                                )
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
                                        {(onMoveToCrm || onArchive) && (
                                            <td className="px-5 py-3.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {onMoveToCrm && (
                                                        isEntry ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleMove(lead)}
                                                                disabled={isMoving}
                                                                title="Enviar para o CRM (move para CONEXÃO)"
                                                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-[#A68B4B] to-[#C8A96E] text-black text-[11px] font-bold hover:shadow-md transition-all disabled:opacity-50"
                                                            >
                                                                {isMoving ? <Loader2 size={11} className="animate-spin" /> : <ArrowRight size={11} />}
                                                                Enviar p/ CRM
                                                            </button>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-[#2e2e2e] text-gray-400 text-[11px] font-semibold">
                                                                <Check size={11} /> No CRM
                                                            </span>
                                                        )
                                                    )}
                                                    {onArchive && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onArchive(lead)}
                                                            title="Arquivar lead"
                                                            className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-[#2e2e2e] text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-[#333] hover:bg-gray-200 dark:hover:bg-[#3a3a3a] transition-colors"
                                                        >
                                                            <Archive size={13} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        )}
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
