'use client';

import { CRMLead } from '@/app/sistema/actions/crm-leads';
import { CRMStage, getStageColorHex } from '@/lib/crm-types';

interface StageBreakdownProps {
    leads: CRMLead[];
    stages: CRMStage[];
}

const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function StageBreakdown({ leads, stages }: StageBreakdownProps) {
    const rows = stages.map(stage => {
        const stageLeads = leads.filter(l => l.status === stage.name);
        const count = stageLeads.length;
        const value = stageLeads.reduce((s, l) => s + (Number(l.valor_estimado) || 0), 0);
        const prob = stage.probability ?? 0;
        const weighted = stageLeads.reduce((s, l) => {
            const p = l.probabilidade ?? prob;
            return s + (Number(l.valor_estimado) || 0) * p / 100;
        }, 0);
        const avg = count > 0 ? value / count : 0;
        return { stage, count, value, weighted, avg };
    });

    const totals = rows.reduce(
        (acc, r) => ({
            count: acc.count + r.count,
            value: acc.value + r.value,
            weighted: acc.weighted + r.weighted,
        }),
        { count: 0, value: 0, weighted: 0 }
    );

    return (
        <div className="bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-[#2A2A2A]">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Resumo por etapa</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 dark:bg-[#0D0D0D] text-left text-xs text-gray-500 uppercase tracking-wide">
                            <th className="px-6 py-3 font-medium">Etapa</th>
                            <th className="px-6 py-3 font-medium text-right">Leads</th>
                            <th className="px-6 py-3 font-medium text-right">Probabilidade</th>
                            <th className="px-6 py-3 font-medium text-right">Valor total</th>
                            <th className="px-6 py-3 font-medium text-right">Ticket médio</th>
                            <th className="px-6 py-3 font-medium text-right">Ponderado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-[#262626]">
                        {rows.map(r => (
                            <tr key={r.stage.id} className="hover:bg-gray-50 dark:hover:bg-[#222222] transition-colors">
                                <td className="px-6 py-3">
                                    <div className="flex items-center gap-2.5">
                                        <span
                                            className="w-2.5 h-2.5 rounded-full"
                                            style={{ background: getStageColorHex(r.stage.color) }}
                                        />
                                        <span className="font-medium text-gray-900 dark:text-gray-100">
                                            {r.stage.name}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">{r.count}</td>
                                <td className="px-6 py-3 text-right text-gray-500">{r.stage.probability ?? 0}%</td>
                                <td className="px-6 py-3 text-right text-gray-900 dark:text-gray-100">{fmtBRL(r.value)}</td>
                                <td className="px-6 py-3 text-right text-gray-500">{fmtBRL(r.avg)}</td>
                                <td className="px-6 py-3 text-right font-semibold text-[#A68B4B]">{fmtBRL(r.weighted)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-gray-50 dark:bg-[#0D0D0D] font-semibold">
                            <td className="px-6 py-3 text-gray-700 dark:text-gray-300">Total</td>
                            <td className="px-6 py-3 text-right text-gray-900 dark:text-white">{totals.count}</td>
                            <td />
                            <td className="px-6 py-3 text-right text-gray-900 dark:text-white">{fmtBRL(totals.value)}</td>
                            <td />
                            <td className="px-6 py-3 text-right text-[#A68B4B]">{fmtBRL(totals.weighted)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
