'use client';

import { CRMLead } from '@/app/sistema/actions/crm-leads';
import { CRMStage, getStageColorHex } from '@/lib/crm-types';
import { TrendingDown } from 'lucide-react';

interface FunnelChartProps {
    leads: CRMLead[];
    stages: CRMStage[];
}

const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function FunnelChart({ leads, stages }: FunnelChartProps) {
    // Exclude terminal "Perdido" from the funnel flow, keep others in user order
    const flowStages = stages.filter(s => s.id !== 'Perdido' && s.name !== 'Perdido');

    const byStage = flowStages.map(stage => {
        const stageLeads = leads.filter(l => l.status === stage.name);
        const count = stageLeads.length;
        const value = stageLeads.reduce((sum, l) => sum + (Number(l.valor_estimado) || 0), 0);
        return { stage, count, value };
    });

    const maxCount = Math.max(...byStage.map(s => s.count), 1);
    const firstCount = byStage[0]?.count || 0;

    return (
        <div className="bg-white dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#2e2e2e] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Funil de Vendas</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Conversão etapa a etapa + valor em pipeline</p>
                </div>
            </div>

            <div className="space-y-3">
                {byStage.map((row, i) => {
                    const prev = byStage[i - 1];
                    const widthPct = (row.count / maxCount) * 100;
                    const fromFirstPct = firstCount > 0 ? (row.count / firstCount) * 100 : 0;
                    const fromPrevPct = prev && prev.count > 0 ? (row.count / prev.count) * 100 : null;
                    const dropoff = prev ? prev.count - row.count : 0;
                    const color = getStageColorHex(row.stage.color);

                    return (
                        <div key={row.stage.id}>
                            {prev && dropoff > 0 && (
                                <div className="flex items-center gap-2 pl-4 pb-1 text-xs text-gray-400 dark:text-gray-500">
                                    <TrendingDown size={12} />
                                    <span>
                                        -{dropoff} lead{dropoff !== 1 ? 's' : ''} ({(100 - (fromPrevPct || 0)).toFixed(0)}% drop-off)
                                    </span>
                                </div>
                            )}
                            <div className="relative flex items-center gap-4">
                                <div className="w-32 shrink-0 flex items-center gap-2">
                                    <span
                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                        style={{ background: color }}
                                    />
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                                        {row.stage.name}
                                    </span>
                                </div>
                                <div className="flex-1 h-11 bg-gray-50 dark:bg-[#161616] rounded-lg overflow-hidden relative border border-gray-100 dark:border-[#262626]">
                                    <div
                                        className="h-full flex items-center px-3 transition-all duration-500"
                                        style={{
                                            width: `${Math.max(widthPct, 3)}%`,
                                            background: `linear-gradient(90deg, ${color}dd, ${color}99)`,
                                        }}
                                    >
                                        <span className="text-white font-semibold text-sm drop-shadow">
                                            {row.count}
                                        </span>
                                    </div>
                                    <div className="absolute inset-0 flex items-center justify-end pr-3 pointer-events-none">
                                        <div className="flex items-center gap-3 text-xs">
                                            {fromPrevPct !== null && (
                                                <span className="text-gray-500 dark:text-gray-400">
                                                    {fromPrevPct.toFixed(0)}%
                                                </span>
                                            )}
                                            <span className="font-semibold text-gray-900 dark:text-white">
                                                {fmtBRL(row.value)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="w-20 shrink-0 text-right">
                                    <div className="text-xs font-semibold text-gray-900 dark:text-white">
                                        {fromFirstPct.toFixed(0)}%
                                    </div>
                                    <div className="text-[10px] text-gray-400">do topo</div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {byStage.length === 0 && (
                <div className="text-center py-12 text-gray-400 text-sm">
                    Nenhuma etapa configurada.
                </div>
            )}
        </div>
    );
}
