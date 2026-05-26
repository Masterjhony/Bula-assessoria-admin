'use client';

import { CRMLead } from '@/app/sistema/actions/crm-leads';
import { CRMStage } from '@/lib/crm-types';
import { TrendingUp, DollarSign, Target, Clock, Percent, Trophy } from 'lucide-react';

interface FunnelMetricsProps {
    leads: CRMLead[];
    stages: CRMStage[];
}

const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function FunnelMetrics({ leads, stages }: FunnelMetricsProps) {
    const isClosedWon = (status: string) => status === 'Fechado';
    const isClosedLost = (status: string) => status === 'Perdido';
    const isActive = (status: string) => !isClosedWon(status) && !isClosedLost(status);

    const activeLeads = leads.filter(l => isActive(l.status));
    const wonLeads = leads.filter(l => isClosedWon(l.status));
    const lostLeads = leads.filter(l => isClosedLost(l.status));
    const closedTotal = wonLeads.length + lostLeads.length;

    const pipelineValue = activeLeads.reduce((s, l) => s + (Number(l.valor_estimado) || 0), 0);
    const wonValue = wonLeads.reduce((s, l) => s + (Number(l.valor_estimado) || 0), 0);

    // Weighted forecast: value * probability
    const stageProbMap = new Map(stages.map(s => [s.name, s.probability ?? 0]));
    const weightedForecast = activeLeads.reduce((s, l) => {
        const prob = l.probabilidade ?? stageProbMap.get(l.status) ?? 0;
        return s + ((Number(l.valor_estimado) || 0) * prob / 100);
    }, 0);

    const avgTicket = wonLeads.length > 0 ? wonValue / wonLeads.length : 0;

    const winRate = closedTotal > 0 ? (wonLeads.length / closedTotal) * 100 : 0;

    // Avg days in pipeline for closed leads
    const avgCycleDays = (() => {
        const cycles = wonLeads
            .map(l => {
                const created = new Date(l.created_at).getTime();
                const updated = new Date(l.updated_at).getTime();
                return Math.max(0, (updated - created) / (1000 * 60 * 60 * 24));
            })
            .filter(d => d > 0);
        if (cycles.length === 0) return 0;
        return cycles.reduce((s, d) => s + d, 0) / cycles.length;
    })();

    const metrics = [
        {
            label: 'Leads ativos',
            value: activeLeads.length.toString(),
            sub: `${leads.length} totais`,
            icon: Target,
            color: 'text-blue-500 bg-blue-500/10',
        },
        {
            label: 'Pipeline ativo',
            value: fmtBRL(pipelineValue),
            sub: `${activeLeads.filter(l => l.valor_estimado).length} com valor`,
            icon: DollarSign,
            color: 'text-emerald-500 bg-emerald-500/10',
        },
        {
            label: 'Previsão ponderada',
            value: fmtBRL(weightedForecast),
            sub: 'valor × probabilidade',
            icon: TrendingUp,
            color: 'text-[#A0792E] bg-[#A0792E]/10',
        },
        {
            label: 'Taxa de conversão',
            value: `${winRate.toFixed(1)}%`,
            sub: `${wonLeads.length} ganhos / ${lostLeads.length} perdidos`,
            icon: Percent,
            color: 'text-purple-500 bg-purple-500/10',
        },
        {
            label: 'Ticket médio',
            value: fmtBRL(avgTicket),
            sub: `${wonLeads.length} fechados`,
            icon: Trophy,
            color: 'text-amber-500 bg-amber-500/10',
        },
        {
            label: 'Ciclo médio',
            value: avgCycleDays > 0 ? `${Math.round(avgCycleDays)} dias` : '—',
            sub: 'criação → fechamento',
            icon: Clock,
            color: 'text-rose-500 bg-rose-500/10',
        },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {metrics.map(m => {
                const Icon = m.icon;
                return (
                    <div
                        key={m.label}
                        className="bg-white dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#2e2e2e] rounded-2xl p-4"
                    >
                        <div className="flex items-start justify-between mb-2">
                            <span className="text-xs text-gray-500 font-medium">{m.label}</span>
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${m.color}`}>
                                <Icon size={14} />
                            </div>
                        </div>
                        <div className="text-xl font-bold text-gray-900 dark:text-white">{m.value}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{m.sub}</div>
                    </div>
                );
            })}
        </div>
    );
}
