'use client';

import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';

interface PaginationProps {
    page: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    pageSizeOptions?: number[];
    itemLabel?: { singular: string; plural: string };
    /** Texto extra opcional renderizado antes da contagem (ex.: "5 de 200 leads filtrados"). */
    summaryPrefix?: string;
}

const DEFAULT_OPTIONS = [25, 50, 100, 200];

export function Pagination({
    page,
    totalPages,
    totalItems,
    pageSize,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = DEFAULT_OPTIONS,
    itemLabel = { singular: 'item', plural: 'itens' },
    summaryPrefix,
}: PaginationProps) {
    const safeTotalPages = Math.max(1, totalPages);
    const hasPages = safeTotalPages > 1;

    // Janela de até 5 números centrada na página atual.
    const numericPages = (() => {
        const window = Math.min(5, safeTotalPages);
        const start = (() => {
            if (safeTotalPages <= 5) return 1;
            if (page <= 3) return 1;
            if (page >= safeTotalPages - 2) return safeTotalPages - 4;
            return page - 2;
        })();
        return Array.from({ length: window }, (_, i) => start + i);
    })();

    const goto = (n: number) => onPageChange(Math.min(safeTotalPages, Math.max(1, n)));

    return (
        <div className="border-t border-gray-200 dark:border-[#333] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-gray-500">
                {summaryPrefix ?? `${totalItems} ${totalItems !== 1 ? itemLabel.plural : itemLabel.singular}`}
                {hasPages && ` · página ${page} de ${safeTotalPages}`}
            </span>

            <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span>Por página</span>
                    <select
                        value={pageSize}
                        onChange={e => onPageSizeChange(Number(e.target.value))}
                        className="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-[#333] bg-white dark:bg-[#1A1A1A] text-gray-700 dark:text-gray-300 focus:outline-none focus:border-[#A68B4B] cursor-pointer"
                    >
                        {pageSizeOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                </label>

                {hasPages && (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => goto(1)}
                            disabled={page === 1}
                            title="Primeira página"
                            className="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-[#333] disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-[#2e2e2e] transition-colors text-gray-600 dark:text-gray-300 inline-flex items-center"
                        >
                            <ChevronsLeft size={14} />
                        </button>
                        <button
                            onClick={() => goto(page - 1)}
                            disabled={page === 1}
                            title="Página anterior"
                            className="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-[#333] disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-[#2e2e2e] transition-colors text-gray-600 dark:text-gray-300 inline-flex items-center"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        {numericPages.map(p => (
                            <button
                                key={p}
                                onClick={() => goto(p)}
                                className={`w-7 h-7 text-xs rounded-lg border transition-colors ${
                                    p === page
                                        ? 'bg-[#A68B4B] border-[#A68B4B] text-white font-medium'
                                        : 'border-gray-200 dark:border-[#333] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2e2e2e]'
                                }`}
                            >
                                {p}
                            </button>
                        ))}
                        <button
                            onClick={() => goto(page + 1)}
                            disabled={page === safeTotalPages}
                            title="Próxima página"
                            className="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-[#333] disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-[#2e2e2e] transition-colors text-gray-600 dark:text-gray-300 inline-flex items-center"
                        >
                            <ChevronRight size={14} />
                        </button>
                        <button
                            onClick={() => goto(safeTotalPages)}
                            disabled={page === safeTotalPages}
                            title="Última página"
                            className="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-[#333] disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-[#2e2e2e] transition-colors text-gray-600 dark:text-gray-300 inline-flex items-center"
                        >
                            <ChevronsRight size={14} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
