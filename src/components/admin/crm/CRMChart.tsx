'use client';

import { useMemo, useState } from 'react';
import { CRMLead } from '@/app/sistema/actions/crm-leads';
import { Users, TrendingUp, MapPin, Target, Activity, Filter } from 'lucide-react';
import { FunnelChart } from '@/components/charts/FunnelChart';

// ── Brandbook V1.0 ──────────────────────────────────────────────────────────────
// Bronze 500 #A0792E principal · Tech Green #7FD4A0 (positivo) · Tech Blue #1E3A5F (dado)
const BRAND = {
    BRONZE: '#A0792E',
    BRONZE_DEEP: '#6B4F1E',
    BRONZE_PALE: '#D4A85C',
    BRONZE_LIGHT: '#E8CB85',
    TECH_GREEN: '#7FD4A0',
    TECH_BLUE: '#1E3A5F',
    LOSS: '#A04545',
} as const;

interface CRMChartProps {
    leads: CRMLead[];
    stages?: string[];
}

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const SOURCE_LABELS: Record<string, string> = {
    facebook: 'Facebook', instagram: 'Instagram', google: 'Google',
    whatsapp: 'WhatsApp', indicacao: 'Indicação', site: 'Site',
    'google-ads': 'Google Ads', 'facebook-ads': 'Facebook Ads',
};

const card = 'rounded-2xl border border-gray-200 dark:border-[#2A2A2A] bg-white dark:bg-[#161616]';
const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400';
const dataCls = 'font-mono tabular-nums';

// ── Conversion Funnel ──────────────────────────────────────────────────────────

function ConversionFunnel({ leads, stages }: { leads: CRMLead[]; stages: string[] }) {
    const data = useMemo(() => {
        const pipeline = stages.filter(s => s !== 'Perdido' && s !== 'Sem Status');
        const counts = pipeline.map(s => leads.filter(l => l.status === s).length);
        const lost = leads.filter(l => l.status === 'Perdido').length;
        return { pipeline, counts, lost };
    }, [leads, stages]);

    if (data.pipeline.length < 2) return null;

    const overall = data.counts[0] > 0 ? (data.counts[data.counts.length - 1] / data.counts[0]) * 100 : 0;
    const funnelStages = data.pipeline.map((s, i) => ({ label: s, count: data.counts[i] }));

    return (
        <div className={`${card} p-5`}>
            <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
                <div>
                    <p className={labelCls}>Funil de Conversão</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                        {leads.length} leads no pipeline ·{' '}
                        <span className={`${dataCls} text-[#A0792E]`}>{overall.toFixed(0)}%</span> conversão geral
                    </p>
                </div>
                <div className="flex gap-2 text-[10px]">
                    <span className="px-2.5 py-1 rounded-full" style={{ backgroundColor: `${BRAND.TECH_GREEN}1F`, color: BRAND.TECH_GREEN }}>
                        <span className={dataCls}>{data.counts[data.counts.length - 1]}</span> fechados
                    </span>
                    <span className="px-2.5 py-1 rounded-full" style={{ backgroundColor: `${BRAND.LOSS}1F`, color: BRAND.LOSS }}>
                        <span className={dataCls}>{data.lost}</span> perdidos
                    </span>
                </div>
            </div>

            <FunnelChart stages={funnelStages} />
        </div>
    );
}

// ── Line Chart ─────────────────────────────────────────────────────────────────

function LineChart({ data, color = BRAND.BRONZE }: { data: number[]; color?: string }) {
    if (data.length < 2) return <div className="h-20 flex items-center justify-center text-xs text-gray-400">Sem dados</div>;

    const W = 600, H = 90;
    const pad = { t: 8, b: 8, l: 4, r: 4 };
    const max = Math.max(...data, 1);
    const gradId = `lg-${color.replace('#', '')}`;

    const pts = data.map((v, i) => ({
        x: pad.l + (i / (data.length - 1)) * (W - pad.l - pad.r),
        y: pad.t + (1 - v / max) * (H - pad.t - pad.b),
    }));

    let line = '';
    pts.forEach((p, i) => {
        if (i === 0) { line = `M${p.x} ${p.y}`; return; }
        const pr = pts[i - 1];
        const cx1 = pr.x + (p.x - pr.x) * 0.5;
        const cx2 = p.x - (p.x - pr.x) * 0.5;
        line += ` C${cx1} ${pr.y},${cx2} ${p.y},${p.x} ${p.y}`;
    });
    const area = `${line} L${pts[pts.length - 1].x} ${H - pad.b} L${pts[0].x} ${H - pad.b} Z`;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: '90px' }}>
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradId})`} />
            <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((p, i) => data[i] > 0 && (
                <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} opacity="0.9" />
            ))}
        </svg>
    );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function CRMChart({ leads, stages }: CRMChartProps) {
    const [monthOffset, setMonthOffset] = useState(0);
    const [nowRef] = useState(() => new Date());

    const now = nowRef;
    const monthTabs = [0, 1, 2].map(offset => {
        const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        return { label: offset === 0 ? 'Mês corrente' : MONTHS_PT[d.getMonth()], year: d.getFullYear(), month: d.getMonth() };
    });

    const activeStages = useMemo(
        () => stages?.length ? stages : ['Lead', 'Qualificado', 'Proposta', 'Negociação', 'Fechado', 'Perdido', 'Sem Status'],
        [stages]
    );

    // KPIs
    const fechados = leads.filter(l => l.status === 'Fechado').length;
    const perdidos = leads.filter(l => l.status === 'Perdido').length;
    const semStatus = leads.filter(l => l.status === 'Sem Status').length;
    const emAberto = leads.length - fechados - perdidos - semStatus;
    const taxaGeral = leads.length > 0 ? Math.round((fechados / leads.length) * 100) : 0;

    // Pipeline value
    const pipelineValue = useMemo(
        () => leads
            .filter(l => l.status !== 'Fechado' && l.status !== 'Perdido' && l.status !== 'Sem Status')
            .reduce((s, l) => s + (Number(l.valor_estimado) || 0), 0),
        [leads]
    );

    // Monthly stats
    const tab = monthTabs[monthOffset];
    const monthLeads = useMemo(() => leads.filter(l => {
        const raw = l.data_entrada || l.created_at;
        if (!raw) return false;
        const d = new Date(raw);
        return d.getFullYear() === tab.year && d.getMonth() === tab.month;
    }), [leads, tab]);

    const mStats = useMemo(() => {
        const mFechados = monthLeads.filter(l => l.status === 'Fechado').length;
        const mPerdidos = monthLeads.filter(l => l.status === 'Perdido').length;
        return {
            novos: monthLeads.length, fechados: mFechados, perdidos: mPerdidos,
            emAberto: monthLeads.length - mFechados - mPerdidos,
            taxa: monthLeads.length > 0 ? Math.round((mFechados / monthLeads.length) * 100) : 0,
        };
    }, [monthLeads]);

    // Daily last 30 days
    const daily = useMemo(() => {
        const days: number[] = [];
        const labels: string[] = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
            const next = new Date(d); next.setDate(d.getDate() + 1);
            days.push(leads.filter(l => {
                const raw = l.data_entrada || l.created_at;
                if (!raw) return false;
                const ld = new Date(raw);
                return ld >= d && ld < next;
            }).length);
            labels.push(d.getDate().toString());
        }
        return { days, labels };
    }, [leads]);

    // Source breakdown
    const sourceCounts = useMemo(() => {
        const c: Record<string, number> = {};
        leads.forEach(l => {
            const k = l.source?.toLowerCase() || '';
            const src = SOURCE_LABELS[k] || l.source || 'Sem origem';
            c[src] = (c[src] || 0) + 1;
        });
        return Object.entries(c).sort(([, a], [, b]) => b - a).slice(0, 6);
    }, [leads]);
    const maxSource = sourceCounts[0]?.[1] || 1;

    // Top estados
    const topEstados = useMemo(() => {
        const c: Record<string, number> = {};
        leads.forEach(l => { if (l.estado) c[l.estado] = (c[l.estado] || 0) + 1; });
        return Object.entries(c).sort(([, a], [, b]) => b - a).slice(0, 6);
    }, [leads]);
    const maxEstado = topEstados[0]?.[1] || 1;

    // Atividades por responsável (richer)
    const responsaveis = useMemo(() => {
        type Stat = { name: string; total: number; abertos: number; fechados: number; perdidos: number; valor: number; ultimoContato: number };
        const map = new Map<string, Stat>();
        leads.forEach(l => {
            const name = l.responsavel || 'Sem responsável';
            const cur = map.get(name) ?? { name, total: 0, abertos: 0, fechados: 0, perdidos: 0, valor: 0, ultimoContato: 0 };
            cur.total += 1;
            if (l.status === 'Fechado') cur.fechados += 1;
            else if (l.status === 'Perdido') cur.perdidos += 1;
            else if (l.status !== 'Sem Status') cur.abertos += 1;
            cur.valor += Number(l.valor_estimado) || 0;
            const lastDate = l.ultimo_contato || l.updated_at || l.created_at;
            if (lastDate) {
                const t = new Date(lastDate).getTime();
                if (t > cur.ultimoContato) cur.ultimoContato = t;
            }
            map.set(name, cur);
        });
        return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 6);
    }, [leads]);
    const maxRespTotal = responsaveis[0]?.total || 1;

    // Prioridade
    const prioridades = useMemo(() => {
        const c: Record<string, number> = {};
        leads.forEach(l => { const p = l.prioridade || 'Normal'; c[p] = (c[p] || 0) + 1; });
        return Object.entries(c).sort(([, a], [, b]) => b - a);
    }, [leads]);

    const fmtBRL = (v: number) => v >= 1_000_000 ? `R$ ${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `R$ ${Math.round(v / 1_000)}k` : `R$ ${v}`;

    const nowMs = nowRef.getTime();
    const fmtRelative = (t: number) => {
        if (!t) return '—';
        const days = Math.floor((nowMs - t) / 86400000);
        if (days === 0) return 'hoje';
        if (days === 1) return 'ontem';
        if (days < 30) return `${days}d`;
        if (days < 365) return `${Math.floor(days / 30)}m`;
        return `${Math.floor(days / 365)}a`;
    };

    return (
        <div className="flex flex-col gap-4 overflow-auto pb-2">

            {/* Funil de Conversão (NEW) */}
            <ConversionFunnel leads={leads} stages={activeStages} />

            {/* KPI cards — paleta brand */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {([
                    { label: 'Total de leads', value: leads.length.toLocaleString('pt-BR'), sub: `${emAberto} em aberto`, icon: Users, accent: BRAND.BRONZE },
                    { label: 'Pipeline em valor', value: fmtBRL(pipelineValue), sub: 'estimado · em aberto', icon: Target, accent: BRAND.BRONZE_PALE },
                    { label: 'Taxa de fechamento', value: `${taxaGeral}%`, sub: `${fechados} fechados · ${perdidos} perdidos`, icon: TrendingUp, accent: BRAND.TECH_GREEN },
                    { label: 'Atividade 30d', value: daily.days.reduce((s, n) => s + n, 0).toLocaleString('pt-BR'), sub: `pico de ${Math.max(...daily.days)}/dia`, icon: Activity, accent: BRAND.TECH_BLUE },
                ]).map(({ label, value, sub, icon: Icon, accent }) => (
                    <div key={label} className={`${card} p-4 flex items-center gap-3 transition-all hover:shadow-md`}>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}1A`, color: accent }}>
                            <Icon size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className={`text-xl font-bold text-gray-900 dark:text-white ${dataCls}`}>{value}</p>
                            <p className={`${labelCls} mt-0.5 truncate`}>{label}</p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-0.5 truncate">{sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Mês selecionável */}
            <div className={`${card} p-5`}>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div>
                        <p className={labelCls}>Recorte mensal</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">Captação e desfecho do período</p>
                    </div>
                    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-gray-50 dark:bg-[#1d1d1d] border border-gray-100 dark:border-[#2A2A2A]">
                        {monthTabs.map((t, i) => (
                            <button
                                key={i}
                                onClick={() => setMonthOffset(i)}
                                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                                    monthOffset === i
                                        ? 'bg-white dark:bg-[#262626] text-[#A0792E] shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {([
                        { label: 'Novos', value: mStats.novos, accent: 'text-gray-900 dark:text-white' },
                        { label: 'Em aberto', value: mStats.emAberto, accent: 'text-[#A0792E]' },
                        { label: 'Fechados', value: mStats.fechados, accent: 'text-[#7FD4A0]' },
                        { label: 'Perdidos', value: mStats.perdidos, accent: 'text-[#A04545]' },
                        { label: 'Taxa', value: `${mStats.taxa}%`, accent: 'text-[#1E3A5F] dark:text-[#7FD4A0]' },
                    ]).map(({ label, value, accent }) => (
                        <div key={label} className="rounded-lg bg-gray-50 dark:bg-[#1d1d1d] p-3 border border-gray-100 dark:border-[#2A2A2A]">
                            <p className={labelCls}>{label}</p>
                            <p className={`text-2xl font-bold mt-1 ${accent} ${dataCls}`}>{value}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Linha 30d + Origem */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className={`${card} lg:col-span-2 p-5`}>
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className={labelCls}>Captação diária</p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">Últimos 30 dias</p>
                        </div>
                        <span className={`text-[10px] text-gray-400 ${dataCls}`}>pico {Math.max(...daily.days)}/dia</span>
                    </div>
                    <LineChart data={daily.days} color={BRAND.BRONZE} />
                    <div className="flex justify-between mt-1 px-1">
                        {daily.labels.map((lbl, i) => (i % 5 === 0 || i === 29) && (
                            <span key={i} className={`text-[10px] text-gray-400 ${dataCls}`}>{lbl}</span>
                        ))}
                    </div>
                </div>

                <div className={`${card} p-5`}>
                    <div className="flex items-center gap-2 mb-3">
                        <Filter size={12} className="text-[#A0792E]" />
                        <p className={labelCls}>Origem</p>
                    </div>
                    {sourceCounts.length === 0 ? (
                        <p className="text-xs text-gray-400">Sem dados de origem</p>
                    ) : (
                        <div className="flex flex-col gap-2.5">
                            {sourceCounts.map(([src, count]) => (
                                <div key={src}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-gray-700 dark:text-gray-300 truncate max-w-[130px]">{src}</span>
                                        <span className={`text-gray-500 font-medium ${dataCls}`}>{count}</span>
                                    </div>
                                    <div className="h-1.5 bg-gray-100 dark:bg-[#262626] rounded-full overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${(count / maxSource) * 100}%`, backgroundColor: BRAND.BRONZE }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Atividades por responsável (enriched) */}
            <div className={`${card} p-5`}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <p className={labelCls}>Atividade por responsável</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">Carteira ativa e produtividade</p>
                    </div>
                    <Activity size={14} className="text-[#A0792E]" />
                </div>
                {responsaveis.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">Sem leads atribuídos</p>
                ) : (
                    <div className="overflow-x-auto -mx-5 px-5">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className={labelCls}>
                                    <th className="text-left pb-3 font-bold">Responsável</th>
                                    <th className="text-center pb-3 font-bold">Carteira</th>
                                    <th className="text-center pb-3 font-bold">Aberto</th>
                                    <th className="text-center pb-3 font-bold">Fechado</th>
                                    <th className="text-right pb-3 font-bold">Pipeline</th>
                                    <th className="text-right pb-3 font-bold">Último toque</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-[#2A2A2A]">
                                {responsaveis.map((r, i) => {
                                    const taxaResp = r.total > 0 ? Math.round((r.fechados / r.total) * 100) : 0;
                                    return (
                                        <tr key={r.name} className="group hover:bg-gray-50 dark:hover:bg-[#1d1d1d] transition-colors">
                                            <td className="py-2.5">
                                                <div className="flex items-center gap-2.5">
                                                    <div
                                                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0"
                                                        style={{
                                                            backgroundColor: i === 0 ? BRAND.BRONZE : `${BRAND.BRONZE}1F`,
                                                            color: i === 0 ? '#000' : BRAND.BRONZE,
                                                        }}
                                                    >
                                                        {r.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{r.name}</p>
                                                        <p className={`text-[9px] text-gray-500 ${dataCls}`}>taxa {taxaResp}%</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-2.5 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <span className={`text-sm font-bold text-gray-900 dark:text-white ${dataCls}`}>{r.total}</span>
                                                    <div className="w-16 h-1 rounded-full bg-gray-100 dark:bg-[#262626] overflow-hidden">
                                                        <div className="h-full rounded-full" style={{ width: `${(r.total / maxRespTotal) * 100}%`, backgroundColor: BRAND.BRONZE }} />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className={`py-2.5 text-center text-sm font-semibold ${dataCls} text-[#A0792E]`}>{r.abertos}</td>
                                            <td className={`py-2.5 text-center text-sm font-semibold ${dataCls} text-[#7FD4A0]`}>{r.fechados}</td>
                                            <td className={`py-2.5 text-right text-xs font-bold ${dataCls} text-gray-700 dark:text-gray-300`}>{fmtBRL(r.valor)}</td>
                                            <td className={`py-2.5 text-right text-[10px] text-gray-500 ${dataCls}`}>{fmtRelative(r.ultimoContato)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Estados + Prioridade */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={`${card} p-5`}>
                    <div className="flex items-center gap-2 mb-3">
                        <MapPin size={12} className="text-[#A0792E]" />
                        <p className={labelCls}>Distribuição por UF</p>
                    </div>
                    {topEstados.length === 0 ? (
                        <p className="text-xs text-gray-400">Sem dados de localização</p>
                    ) : (
                        <div className="flex flex-col gap-2.5">
                            {topEstados.map(([estado, count]) => (
                                <div key={estado} className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${BRAND.BRONZE}14`, color: BRAND.BRONZE }}>
                                        <span className="text-[10px] font-black">{estado}</span>
                                    </div>
                                    <div className="flex-1 h-1.5 bg-gray-100 dark:bg-[#262626] rounded-full overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${(count / maxEstado) * 100}%`, backgroundColor: BRAND.BRONZE }} />
                                    </div>
                                    <span className={`text-xs text-gray-500 w-8 text-right shrink-0 ${dataCls}`}>{count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className={`${card} p-5`}>
                    <div className="flex items-center gap-2 mb-3">
                        <Target size={12} className="text-[#A0792E]" />
                        <p className={labelCls}>Por prioridade</p>
                    </div>
                    {prioridades.length === 0 ? (
                        <p className="text-xs text-gray-400">Sem dados</p>
                    ) : (
                        <div className="flex flex-col gap-2.5">
                            {prioridades.map(([prio, count]) => {
                                const maxP = prioridades[0][1];
                                const color = prio === 'Alta' ? BRAND.LOSS : prio === 'Média' ? BRAND.BRONZE : BRAND.TECH_BLUE;
                                return (
                                    <div key={prio}>
                                        <div className="flex justify-between items-center text-xs mb-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                                <span className="text-gray-700 dark:text-gray-300 font-medium">{prio}</span>
                                            </div>
                                            <span className={`text-gray-500 font-medium ${dataCls}`}>{count}</span>
                                        </div>
                                        <div className="h-1.5 bg-gray-100 dark:bg-[#262626] rounded-full overflow-hidden">
                                            <div className="h-full rounded-full" style={{ width: `${(count / maxP) * 100}%`, backgroundColor: color }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
