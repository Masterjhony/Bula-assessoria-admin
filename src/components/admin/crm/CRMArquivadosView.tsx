'use client';

import { useEffect, useMemo, useState } from 'react';
import { CRMLead } from '@/app/sistema/actions/crm-leads';
import { Pagination } from '@/components/admin/Pagination';
import {
    Archive, ArchiveRestore, Trash2, Search, Phone, Mail, MapPin,
    Loader2, ChevronRight,
} from 'lucide-react';

interface CRMArquivadosViewProps {
    leads: CRMLead[];
    loading: boolean;
    onRestore: (lead: CRMLead) => Promise<void> | void;
    onDelete: (lead: CRMLead) => Promise<void> | void;
    onOpenLead: (lead: CRMLead) => void;
}

export function CRMArquivadosView({ leads, loading, onRestore, onDelete, onOpenLead }: CRMArquivadosViewProps) {
    const [search, setSearch] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(25);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = !q
            ? leads
            : leads.filter(l =>
                l.nome?.toLowerCase().includes(q) ||
                l.celular?.includes(search) ||
                l.telefone?.includes(search) ||
                l.cidade?.toLowerCase().includes(q) ||
                l.estado?.toLowerCase().includes(q) ||
                l.o_que_busca?.toLowerCase().includes(q) ||
                l.email?.toLowerCase().includes(q)
            );
        // Mais recentemente arquivados primeiro.
        return [...list].sort((a, b) =>
            (b.arquivado_at || b.updated_at || '').localeCompare(a.arquivado_at || a.updated_at || '')
        );
    }, [leads, search]);

    useEffect(() => { setPage(1); }, [search, perPage]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    const paginated = useMemo(
        () => filtered.slice((page - 1) * perPage, page * perPage),
        [filtered, page, perPage]
    );

    const handleRestore = async (lead: CRMLead) => {
        setBusyId(lead.id);
        try { await onRestore(lead); } finally { setBusyId(null); }
    };

    const handleDelete = async (lead: CRMLead) => {
        const ok = window.confirm(
            `Excluir "${lead.nome}" definitivamente? Esta ação não pode ser desfeita.`
        );
        if (!ok) return;
        setBusyId(lead.id);
        try { await onDelete(lead); } finally { setBusyId(null); }
    };

    return (
        <div className="flex flex-col gap-4 pb-2">
            {/* Aviso */}
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-gray-500/5 border border-gray-300/30 dark:border-[#333] text-xs text-gray-700 dark:text-gray-300">
                <Archive size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <p>
                    Leads arquivados ficam fora da Qualificação e do CRM, mas continuam guardados aqui.
                    Use <span className="font-semibold">Restaurar</span> para devolvê-los ao fluxo, ou
                    <span className="font-semibold"> Excluir</span> para apagar de vez (sem volta).
                </p>
            </div>

            {/* Busca */}
            <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar arquivados por nome, telefone, cidade, interesse…"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-[#A68B4B]"
                />
            </div>

            {/* Lista */}
            {loading ? (
                <div className="rounded-2xl border border-dashed border-gray-200 dark:border-[#333] py-12 text-center text-gray-400">
                    <Loader2 size={28} className="mx-auto mb-2 animate-spin opacity-60" />
                    <p className="text-sm">Carregando arquivados…</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 dark:border-[#333] py-12 text-center text-gray-400">
                    <Archive size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Nenhum lead arquivado.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {paginated.map(lead => {
                        const isBusy = busyId === lead.id;
                        const dtArq = lead.arquivado_at;
                        return (
                            <div
                                key={lead.id}
                                className="rounded-2xl border border-gray-200 dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] p-4 flex items-start justify-between gap-3 opacity-90 hover:opacity-100 transition-opacity"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={() => onOpenLead(lead)}
                                            className="font-bold text-gray-900 dark:text-white text-base hover:text-[#A68B4B] transition-colors leading-tight text-left"
                                        >
                                            {lead.nome}
                                        </button>
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-gray-200 dark:bg-[#2e2e2e] text-gray-500 dark:text-gray-400">
                                            <Archive size={10} /> Arquivado
                                        </span>
                                        {lead.status && (
                                            <span className="inline-flex items-center text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#222] text-gray-500 dark:text-gray-400">
                                                {lead.status}
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
                                        {(lead.cidade || lead.estado) && (
                                            <span className="inline-flex items-center gap-1"><MapPin size={11} /> {[lead.cidade, lead.estado].filter(Boolean).join(' / ')}</span>
                                        )}
                                        {lead.o_que_busca && (
                                            <span className="inline-flex items-center gap-1 text-gray-400 truncate max-w-[200px]">{lead.o_que_busca}</span>
                                        )}
                                        {dtArq && (
                                            <span className="inline-flex items-center gap-1 text-gray-400">
                                                Arquivado em {new Date(dtArq).toLocaleDateString('pt-BR')}
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onOpenLead(lead)}
                                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#A68B4B] transition-colors mt-2"
                                    >
                                        Ver perfil completo <ChevronRight size={12} />
                                    </button>
                                </div>

                                <div className="flex flex-col gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => handleRestore(lead)}
                                        disabled={isBusy}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                                        title="Restaurar lead (volta para a Qualificação/CRM)"
                                    >
                                        {isBusy ? <Loader2 size={12} className="animate-spin" /> : <ArchiveRestore size={12} />}
                                        Restaurar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(lead)}
                                        disabled={isBusy}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 text-xs font-bold hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                        title="Excluir definitivamente"
                                    >
                                        <Trash2 size={12} /> Excluir
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    <div className="rounded-xl border border-gray-200 dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A]">
                        <Pagination
                            page={page}
                            totalPages={totalPages}
                            totalItems={filtered.length}
                            pageSize={perPage}
                            onPageChange={setPage}
                            onPageSizeChange={setPerPage}
                            itemLabel={{ singular: 'lead', plural: 'leads' }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
