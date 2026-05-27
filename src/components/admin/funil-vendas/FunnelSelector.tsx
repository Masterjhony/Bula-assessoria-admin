'use client';

import { CRMFunnel, getStageColorHex } from '@/lib/crm-types';
import { Check, GitBranch } from 'lucide-react';

interface FunnelSelectorProps {
    funnels: CRMFunnel[];
    activeFunnelId: string;
    onSelect: (funnelId: string) => void;
    counts?: Record<string, number>;
}

export function FunnelSelector({ funnels, activeFunnelId, onSelect, counts = {} }: FunnelSelectorProps) {
    return (
        <div className="flex flex-wrap gap-2">
            {funnels.map(f => {
                const active = f.id === activeFunnelId;
                const color = getStageColorHex(f.color || 'yellow');
                const count = counts[f.id] ?? 0;
                return (
                    <button
                        key={f.id}
                        onClick={() => onSelect(f.id)}
                        className={`group flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-xl border transition-all text-sm font-medium ${
                            active
                                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white shadow-md'
                                : 'bg-white dark:bg-[#141414] border-gray-200 dark:border-[#2A2A2A] text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-[#333]'
                        }`}
                    >
                        <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: color }}
                        />
                        <GitBranch size={14} className="opacity-60" />
                        <span>{f.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                            active
                                ? 'bg-white/20 dark:bg-gray-900/10'
                                : 'bg-gray-100 dark:bg-[#1A1A1A] text-gray-500'
                        }`}>{count}</span>
                        {active && <Check size={13} className="opacity-80" />}
                    </button>
                );
            })}
        </div>
    );
}
