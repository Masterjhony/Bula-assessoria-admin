'use client';

import { useState, useCallback } from 'react';
import { CRMLead } from '@/app/sistema/actions/crm-leads';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';

interface CRMTableProps {
    leads: CRMLead[];
    onEditLead: (lead: CRMLead) => void;
}

const PER_PAGE = 25;

const PRIORITY_STYLES: Record<string, string> = {
    Alta: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
    Média: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
    Baixa: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
};

function fmtDate(s: string | null | undefined) {
    if (!s) return '-';
    return new Date(s).toLocaleDateString('pt-BR');
}

// ── CSV export (no lib needed) ────────────────────────────────────────────────
function exportCSV(leads: CRMLead[]) {
    const cols: Array<[string, (l: CRMLead) => string]> = [
        ['Nome', l => l.nome],
        ['Status', l => l.status || ''],
        ['Prioridade', l => l.prioridade || ''],
        ['Empresa', l => l.empresa || ''],
        ['Interesse', l => l.interesse || ''],
        ['Telefone', l => l.telefone || l.celular || ''],
        ['Instagram', l => l.instagram || ''],
        ['Estado', l => l.estado || ''],
        ['Cidade', l => l.cidade || ''],
        ['Qtd. Animais', l => l.quantidade_animais || ''],
        ['Origem', l => l.source || ''],
        ['Responsável', l => l.responsavel || ''],
        ['Último Contato', l => fmtDate(l.ultimo_contato)],
        ['Previsão Fechamento', l => fmtDate(l.data_estimada_fechamento)],
        ['Data Entrada', l => fmtDate(l.data_entrada || l.created_at)],
    ];

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = cols.map(([h]) => escape(h)).join(',');
    const rows = leads.map(l => cols.map(([, fn]) => escape(fn(l))).join(','));
    const csv = [header, ...rows].join('\r\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm_leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── XLSX export (SheetJS) ─────────────────────────────────────────────────────
async function exportXLSX(leads: CRMLead[]) {
    const XLSX = await import('xlsx');

    const rows = leads.map(l => ({
        Nome: l.nome,
        Status: l.status || '',
        Prioridade: l.prioridade || '',
        Empresa: l.empresa || '',
        Interesse: l.interesse || '',
        Telefone: l.telefone || l.celular || '',
        Instagram: l.instagram || '',
        Estado: l.estado || '',
        Cidade: l.cidade || '',
        'Qtd. Animais': l.quantidade_animais || '',
        Origem: l.source || '',
        Responsável: l.responsavel || '',
        'Último Contato': fmtDate(l.ultimo_contato),
        'Previsão Fechamento': fmtDate(l.data_estimada_fechamento),
        'Data Entrada': fmtDate(l.data_entrada || l.created_at),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');

    // Auto column widths
    const colWidths = Object.keys(rows[0] || {}).map(k => ({
        wch: Math.max(k.length, ...rows.map(r => String((r as any)[k] || '').length)) + 2,
    }));
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `crm_leads_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── Pagination helpers ────────────────────────────────────────────────────────
function pageButtons(page: number, total: number): number[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (page <= 4) return [1, 2, 3, 4, 5, -1, total];
    if (page >= total - 3) return [1, -1, total - 4, total - 3, total - 2, total - 1, total];
    return [1, -1, page - 1, page, page + 1, -1, total];
}

// ─────────────────────────────────────────────────────────────────────────────

export function CRMTable({ leads, onEditLead }: CRMTableProps) {
    const [page, setPage] = useState(1);
    const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);

    const totalPages = Math.max(1, Math.ceil(leads.length / PER_PAGE));
    const safePage = Math.min(page, totalPages);
    const paginated = leads.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

    const handleExport = useCallback(async (fmt: 'csv' | 'xlsx') => {
        setExporting(fmt);
        try {
            if (fmt === 'csv') exportCSV(leads);
            else await exportXLSX(leads);
        } finally {
            setExporting(null);
        }
    }, [leads]);

    if (leads.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-gray-500">
                Nenhum registro encontrado nesta visualização.
            </div>
        );
    }

    const buttons = pageButtons(safePage, totalPages);

    return (
        <div className="bg-white dark:bg-[#262626] rounded-xl border border-gray-200 dark:border-[#2e2e2e] overflow-hidden h-full flex flex-col">

            {/* Table */}
            <div className="overflow-x-auto flex-1 overflow-y-auto">
                <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-[#1d1d1d] dark:text-gray-400 sticky top-0 z-10 border-b border-gray-200 dark:border-[#3f3f3f]">
                        <tr>
                            <th className="px-6 py-3 font-medium">Nome</th>
                            <th className="px-6 py-3 font-medium">Status</th>
                            <th className="px-6 py-3 font-medium">Prioridade</th>
                            <th className="px-6 py-3 font-medium">Empresa</th>
                            <th className="px-6 py-3 font-medium">Responsável</th>
                            <th className="px-6 py-3 font-medium">Último Contato</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.map((lead) => (
                            <tr
                                key={lead.id}
                                onClick={() => onEditLead(lead)}
                                className="bg-white border-b dark:bg-[#262626] dark:border-[#2e2e2e] hover:bg-gray-50 dark:hover:bg-[#2e2e2e] cursor-pointer transition-colors"
                            >
                                <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white max-w-[260px] truncate">
                                    {lead.nome}
                                </th>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-1 bg-gray-100 dark:bg-[#3f3f3f] rounded text-xs">
                                        {lead.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    {lead.prioridade ? (
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_STYLES[lead.prioridade] || 'bg-gray-100 dark:bg-[#3f3f3f] text-gray-600 dark:text-gray-400'}`}>
                                            {lead.prioridade}
                                        </span>
                                    ) : '-'}
                                </td>
                                <td className="px-6 py-4 max-w-[180px] truncate">
                                    {lead.empresa || '-'}
                                </td>
                                <td className="px-6 py-4">
                                    {lead.responsavel || '-'}
                                </td>
                                <td className="px-6 py-4">
                                    {fmtDate(lead.ultimo_contato)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer: pagination + export */}
            <div className="px-4 py-3 border-t border-gray-200 dark:border-[#3f3f3f] flex flex-wrap items-center justify-between gap-3">

                {/* Left: count + export */}
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 font-medium">
                        {leads.length} registro{leads.length !== 1 ? 's' : ''} · pág. {safePage}/{totalPages}
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => handleExport('csv')}
                            disabled={exporting !== null}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-[#313131] hover:bg-gray-200 dark:hover:bg-[#3A3A3A] border border-gray-200 dark:border-[#3f3f3f] rounded-lg transition-colors disabled:opacity-50"
                        >
                            <Download size={12} />
                            {exporting === 'csv' ? 'Exportando…' : 'CSV'}
                        </button>
                        <button
                            onClick={() => handleExport('xlsx')}
                            disabled={exporting !== null}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-[#313131] hover:bg-gray-200 dark:hover:bg-[#3A3A3A] border border-gray-200 dark:border-[#3f3f3f] rounded-lg transition-colors disabled:opacity-50"
                        >
                            <Download size={12} />
                            {exporting === 'xlsx' ? 'Exportando…' : 'XLSX'}
                        </button>
                    </div>
                </div>

                {/* Right: pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={safePage === 1}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-[#363636] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft size={15} />
                        </button>

                        {buttons.map((btn, i) =>
                            btn === -1 ? (
                                <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-xs select-none">…</span>
                            ) : (
                                <button
                                    key={btn}
                                    onClick={() => setPage(btn)}
                                    className={`min-w-[28px] h-7 px-1 rounded-lg text-xs font-medium transition-colors ${
                                        btn === safePage
                                            ? 'bg-[#A0792E] text-white border border-[#A0792E]'
                                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#363636] border border-transparent'
                                    }`}
                                >
                                    {btn}
                                </button>
                            )
                        )}

                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={safePage === totalPages}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-[#363636] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight size={15} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
