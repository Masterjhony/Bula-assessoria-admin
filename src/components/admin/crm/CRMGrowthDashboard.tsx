'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
    Users, Crown, TrendingUp, TrendingDown, CheckCircle2, XCircle,
    MessageSquare, ArrowRight, Layers,
} from 'lucide-react';
import type { CRMLead } from '@/app/sistema/actions/crm-leads';
import type { CRMConfig } from '@/lib/crm-types';
import {
    normalizeCRMStatus, getStageColorHex, CRM_STAGE_ENTRY,
    CRM_STAGE_REGISTRATION, CRM_STAGE_LOST,
} from '@/lib/crm-types';
import { Sparkline } from '@/components/admin/Sparkline';

const card = 'rounded-2xl border border-gray-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414]';
const BRONZE = '#A68B4B';

function leadDate(l: CRMLead): Date | null {
    const d = l.data_entrada || l.created_at;
    return d ? new Date(d) : null;
}

function pct(part: number, whole: number): number {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

interface Props {
    leads: CRMLead[];
    archived: CRMLead[];
    crmConfig: CRMConfig;
}

export function CRMGrowthDashboard({ leads, archived, crmConfig }: Props) {
    const stages = crmConfig.funnels[0]?.stages ?? crmConfig.stages;

    const m = useMemo(() => {
        const total = leads.length;
        const mql = leads.filter(l => l.is_mql).length;

        // Contagem por etapa (status normalizado).
        const byStage = new Map<string, number>();
        for (const l of leads) {
            const s = normalizeCRMStatus(l.status);
            byStage.set(s, (byStage.get(s) ?? 0) + 1);
        }

        const cadastroAtivo = byStage.get(CRM_STAGE_REGISTRATION) ?? 0;
        const perdidos = byStage.get(CRM_STAGE_LOST) ?? 0;
        // Cadastros aprovados saem de getLeads (viram cliente + arquivados).
        const aprovados = archived.filter(l => l.extra_data?.cadastro_aprovado).length;

        // Leads "respondidos" segundo a cor sincronizada da planilha.
        const respondidos = leads.filter(l => {
            const s = l.extra_data?.sheet_color_status;
            return s && s !== CRM_STAGE_ENTRY;
        }).length;

        // Série de novos leads nos últimos 30 dias.
        const DAYS = 30;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const keys: string[] = [];
        const idxByKey = new Map<string, number>();
        for (let i = DAYS - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const k = d.toISOString().slice(0, 10);
            idxByKey.set(k, keys.length);
            keys.push(k);
        }
        const series = new Array(DAYS).fill(0);
        for (const l of leads) {
            const d = leadDate(l);
            if (!d) continue;
            const k = d.toISOString().slice(0, 10);
            const idx = idxByKey.get(k);
            if (idx != null) series[idx] += 1;
        }
        const last7 = series.slice(-7).reduce((a, b) => a + b, 0);
        const prev7 = series.slice(-14, -7).reduce((a, b) => a + b, 0);
        const trend7 = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : (last7 > 0 ? 100 : 0);

        // Funil ordenado conforme a config.
        const funnel = stages.map(s => ({
            name: s.name,
            color: getStageColorHex(s.color),
            count: byStage.get(s.name) ?? 0,
        }));
        const funnelMax = Math.max(1, ...funnel.map(f => f.count));

        // Origem.
        const bySource = new Map<string, number>();
        for (const l of leads) {
            const src = (l.source || l.origem || 'Sem origem').trim() || 'Sem origem';
            bySource.set(src, (bySource.get(src) ?? 0) + 1);
        }
        const sources = [...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

        return {
            total, mql, cadastroAtivo, perdidos, aprovados, respondidos,
            series, last7, prev7, trend7, funnel, funnelMax, sources,
        };
    }, [leads, archived, stages]);

    const kpis = [
        { label: 'Leads ativos', value: m.total, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10', sub: `${m.last7} nos últimos 7 dias` },
        { label: 'MQL', value: m.mql, icon: Crown, color: 'text-[#A68B4B]', bg: 'bg-[#A68B4B]/10', sub: `${pct(m.mql, m.total)}% dos leads` },
        { label: 'Cadastros aprovados', value: m.aprovados, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', sub: `${m.cadastroAtivo} em cadastro` },
        { label: 'Respostas', value: m.respondidos, icon: MessageSquare, color: 'text-cyan-500', bg: 'bg-cyan-500/10', sub: `${pct(m.respondidos, m.total)}% engajaram` },
        { label: 'Perdidos', value: m.perdidos, icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-500/10', sub: `${pct(m.perdidos, m.total)}% do total` },
    ];

    return (
        <div className="space-y-4">
            <div className="page-head flex items-start justify-between gap-3">
                <h1>
                    <small>CRM</small>
                    Dashboard de Growth
                    <span className="block text-[12px] font-normal subtle mt-2">
                        Visão geral do funil, qualificação e conversão dos leads.
                    </span>
                </h1>
                <Link href="/sistema/crm" className="btn ghost shrink-0">
                    Abrir CRM <ArrowRight size={14} />
                </Link>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                {kpis.map(k => (
                    <div key={k.label} className={`${card} p-4`}>
                        <div className="flex items-center gap-2.5 mb-2">
                            <div className={`w-9 h-9 rounded-xl ${k.bg} flex items-center justify-center shrink-0`}>
                                <k.icon size={17} className={k.color} />
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{k.label}</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{k.value}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{k.sub}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Funil por etapa */}
                <section className={`${card} p-5 lg:col-span-2`}>
                    <div className="flex items-center gap-2 mb-4">
                        <Layers size={16} className="text-[#A68B4B]" />
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Funil por etapa</h2>
                    </div>
                    <div className="space-y-2.5">
                        {m.funnel.map(f => (
                            <div key={f.name} className="flex items-center gap-3">
                                <span className="w-44 shrink-0 text-xs font-medium text-gray-600 dark:text-gray-300 truncate">{f.name}</span>
                                <div className="flex-1 h-6 rounded-lg bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                                    <div
                                        className="h-full rounded-lg transition-all flex items-center justify-end pr-2"
                                        style={{ width: `${Math.max(4, (f.count / m.funnelMax) * 100)}%`, backgroundColor: f.color + '33', borderRight: `3px solid ${f.color}` }}
                                    >
                                        <span className="text-[11px] font-bold tabular-nums" style={{ color: f.color }}>{f.count}</span>
                                    </div>
                                </div>
                                <span className="w-10 shrink-0 text-right text-[11px] text-gray-400 tabular-nums">{pct(f.count, m.total)}%</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Novos leads no tempo */}
                <section className={`${card} p-5`}>
                    <div className="flex items-center justify-between mb-1">
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Novos leads (30 dias)</h2>
                        <span className={`inline-flex items-center gap-1 text-xs font-bold ${m.trend7 >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {m.trend7 >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                            {m.trend7 >= 0 ? '+' : ''}{m.trend7}%
                        </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">{m.last7} esta semana · {m.prev7} na anterior</p>
                    <Sparkline data={m.series} color={BRONZE} height={56} />
                </section>
            </div>

            {/* Origem */}
            <section className={`${card} p-5`}>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Leads por origem</h2>
                {m.sources.length === 0 ? (
                    <p className="text-xs text-gray-400">Sem dados de origem.</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                        {m.sources.map(([src, count]) => (
                            <div key={src} className="flex items-center gap-3">
                                <span className="w-32 shrink-0 text-xs text-gray-600 dark:text-gray-300 truncate">{src}</span>
                                <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                                    <div className="h-full rounded-full bg-[#A68B4B]" style={{ width: `${pct(count, m.total)}%` }} />
                                </div>
                                <span className="w-14 shrink-0 text-right text-[11px] text-gray-400 tabular-nums">{count} · {pct(count, m.total)}%</span>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
