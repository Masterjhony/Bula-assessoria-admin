'use client';

import { useId, useMemo } from 'react';
import Link from 'next/link';
import {
    Users, Crown, MessageSquare, Trophy, Target, TrendingUp, TrendingDown,
    Activity, Lightbulb, Calendar, ArrowRight, Hourglass, Megaphone,
    ChevronRight, ShieldAlert, Gavel, BarChart3,
} from 'lucide-react';
import { OKRSnapshot } from '@/app/sistema/actions/okr-snapshot';
import { TacticalObjective, TacticalRisk } from '@/app/sistema/actions/tactical-strategic';
import { TacticalTask, TacticalColumn } from '@/app/sistema/actions/tactical-tasks';
import { StrategyExecutionChain } from '@/components/admin/okr/StrategyExecutionChain';

const BRAND = {
    BRONZE: '#A68B4B',
    BRONZE_DEEP: '#6B4F1E',
    BRONZE_PALE: '#C8A96E',
    TECH_GREEN: '#7FD4A0',
    TECH_BLUE: '#1E3A5F',
    LOSS: '#A04545',
};

const card = 'rounded-2xl border border-gray-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414]';
const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400';
const dataCls = 'font-mono tabular-nums';

const fmtPct = (v: number) => `${v.toFixed(0)}%`;
const fmtSignedPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`;
const fmtBRL = (v: number) => {
    if (!v) return 'R$ 0';
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2).replace('.', ',')}M`;
    if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
    return `R$ ${v.toLocaleString('pt-BR')}`;
};
const fmtDateBR = (d: string) => {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y.slice(2)}`;
};

function Sparkline({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) {
    const id = useId();
    if (data.length === 0) return null;
    const max = Math.max(...data, 1);
    const w = 100;
    const stepX = data.length > 1 ? w / (data.length - 1) : 0;
    const points = data.map((v, i) => `${(i * stepX).toFixed(2)},${(height - (v / max) * height).toFixed(2)}`).join(' ');
    const lastX = (data.length - 1) * stepX;
    const lastY = height - (data[data.length - 1] / max) * height;
    return (
        <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
            <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={`0,${height} ${points} ${w},${height}`} fill={`url(#${id})`} />
            <polyline points={points} fill="none" stroke={color} strokeWidth="1.5"
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <circle cx={lastX} cy={lastY} r="1.6" fill={color} />
        </svg>
    );
}

interface Props {
    snapshot: OKRSnapshot;
    objectives: TacticalObjective[];
    risks: TacticalRisk[];
    tasks: TacticalTask[];
    columns: TacticalColumn[];
}

export function OperationDashboard({ snapshot, objectives, risks, tasks, columns }: Props) {
    const { leads, whatsapp, auctions, campaigns } = snapshot;

    const doneStatus = useMemo(() =>
        columns.find(c =>
            c.title.toLowerCase().includes('complet') || c.title.toLowerCase().includes('conclu')
        )?.title,
        [columns]
    );

    // ── Execução & OKR aggregates ──────────────────────────────────────────
    const allKRs = useMemo(() => objectives.flatMap(o => o.key_results ?? []), [objectives]);
    const okrProgress = allKRs.length > 0
        ? Math.round(allKRs.reduce((a, kr) => a + (kr.progress ?? 0), 0) / allKRs.length)
        : 0;

    const openTasks = useMemo(() => tasks.filter(t => t.status !== doneStatus), [tasks, doneStatus]);
    const overdueCount = openTasks.filter(t => t.due_date && new Date(t.due_date) < new Date()).length;
    const activeRisks = risks.filter(r => r.status === 'active');
    const criticalRisks = activeRisks.filter(r => {
        const p = ['baixa', 'media', 'alta'].indexOf(r.probability);
        const i = ['baixo', 'medio', 'alto'].indexOf(r.impact);
        return p + i >= 3;
    });

    // ── Insights automáticos baseados em dados reais ──────────────────────
    const insights = useMemo(() => {
        const out: { kind: 'positive' | 'attention' | 'opportunity'; title: string; body: string; cta: string; href: string }[] = [];

        if (leads.mqlTotal > 0 && leads.mqlConvPct >= 25) {
            out.push({
                kind: 'positive',
                title: `MQLs convertem ${fmtPct(leads.mqlConvPct)}`,
                body: `${(leads.mqlConvPct / Math.max(leads.conversionPct, 1)).toFixed(1)}× a conversão geral. Priorize captação no perfil ≥100 cabeças.`,
                cta: 'Ver MQLs',
                href: '/crm',
            });
        }
        if (leads.closingSoonCount > 0) {
            out.push({
                kind: 'opportunity',
                title: `${leads.closingSoonCount} lead${leads.closingSoonCount > 1 ? 's' : ''} fechando em 7 dias`,
                body: `Pipeline de ${fmtBRL(leads.pipelineValue)}. Priorize esses contatos hoje.`,
                cta: 'Abrir CRM',
                href: '/crm',
            });
        }
        if (leads.stalledCount >= 5) {
            out.push({
                kind: 'attention',
                title: `${leads.stalledCount} leads parados há +30 dias`,
                body: 'Sem movimento em Qualificado/Proposta/Negociação. Cadência está quebrando o funil.',
                cta: 'Revisar pipeline',
                href: '/crm',
            });
        }
        if (leads.trendDeltaPct >= 20) {
            out.push({
                kind: 'positive',
                title: `Captação acelerando ${fmtSignedPct(leads.trendDeltaPct)}`,
                body: `${leads.new30d} leads nos últimos 30d vs ${leads.prev30d} no período anterior.`,
                cta: 'Ver canais',
                href: '/vendas-marketing',
            });
        } else if (leads.trendDeltaPct <= -20 && leads.prev30d > 5) {
            out.push({
                kind: 'attention',
                title: `Captação em queda ${fmtSignedPct(leads.trendDeltaPct)}`,
                body: `${leads.new30d} leads versus ${leads.prev30d} anteriores. Avalie investimento em mídia.`,
                cta: 'Revisar campanhas',
                href: '/vendas-marketing',
            });
        }
        if (auctions.roi90dPct > 100 && auctions.receita90d > 0) {
            out.push({
                kind: 'opportunity',
                title: `ROI dos leilões em ${fmtPct(auctions.roi90dPct)}`,
                body: `${fmtBRL(auctions.receita90d)} de receita sobre ${fmtBRL(auctions.vgv90d)} de VGV (90d).`,
                cta: 'Ver leilões',
                href: '/leiloes',
            });
        }
        if (criticalRisks.length > 0) {
            out.push({
                kind: 'attention',
                title: `${criticalRisks.length} risco${criticalRisks.length > 1 ? 's' : ''} crítico${criticalRisks.length > 1 ? 's' : ''} ativo${criticalRisks.length > 1 ? 's' : ''}`,
                body: criticalRisks.slice(0, 2).map(r => r.title).join(' · '),
                cta: 'Tratar agora',
                href: '/okr?tab=review',
            });
        }
        if (overdueCount > 0) {
            out.push({
                kind: 'attention',
                title: `${overdueCount} tarefa${overdueCount > 1 ? 's' : ''} atrasada${overdueCount > 1 ? 's' : ''}`,
                body: 'Execução do plano tático em risco. Revise prazos e responsáveis.',
                cta: 'Plano tático',
                href: '/projetos',
            });
        }
        if (out.length === 0) {
            out.push({
                kind: 'opportunity',
                title: 'Operação equilibrada',
                body: `${leads.mqlActive} MQLs no pipeline · ${whatsapp.msgs7d} mensagens em 7d. Mantenha cadência.`,
                cta: 'Abrir CRM',
                href: '/crm',
            });
        }
        return out;
    }, [leads, whatsapp, auctions, criticalRisks, overdueCount]);

    const TrendIcon = leads.trendDeltaPct >= 0 ? TrendingUp : TrendingDown;
    const deltaColor = leads.trendDeltaPct >= 0 ? BRAND.TECH_GREEN : BRAND.LOSS;

    return (
        <div className="space-y-5 pb-6">

            {/* ── Indicadores reais (4 KPIs comerciais) ──────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Leads */}
                <div className={`${card} p-4 relative overflow-hidden`}
                    style={{ borderColor: `${BRAND.BRONZE}4D`, background: `linear-gradient(135deg, ${BRAND.BRONZE}10, transparent 60%)` }}>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${BRAND.BRONZE}1F`, color: BRAND.BRONZE }}>
                            <Users size={13} />
                        </div>
                        <span className={labelCls}>Leads · 30d</span>
                        {leads.prev30d > 0 && (
                            <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-black px-1.5 py-0.5 rounded"
                                style={{ color: deltaColor, backgroundColor: `${deltaColor}14` }}>
                                <TrendIcon size={10} />
                                {fmtSignedPct(leads.trendDeltaPct)}
                            </span>
                        )}
                    </div>
                    <p className={`text-2xl font-black text-gray-900 dark:text-white leading-none ${dataCls}`}>{leads.new30d}</p>
                    <p className="text-[11px] text-gray-500 mt-1.5">{leads.new7d} em 7d · {leads.newMonth} no mês</p>
                </div>

                {/* MQL */}
                <div className={`${card} p-4 relative overflow-hidden`}>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${BRAND.BRONZE_PALE}1F`, color: BRAND.BRONZE_PALE }}>
                            <Crown size={13} />
                        </div>
                        <span className={labelCls}>MQLs ativos</span>
                    </div>
                    <p className={`text-2xl font-black text-gray-900 dark:text-white leading-none ${dataCls}`}>{leads.mqlActive}</p>
                    <p className="text-[11px] text-gray-500 mt-1.5">
                        {leads.mql30d} novos · conversão {leads.mqlTotal > 0 ? fmtPct(leads.mqlConvPct) : '—'}
                    </p>
                </div>

                {/* Pipeline */}
                <div className={`${card} p-4 relative overflow-hidden`}>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${BRAND.TECH_BLUE}1F`, color: BRAND.TECH_BLUE }}>
                            <Target size={13} />
                        </div>
                        <span className={labelCls}>Pipeline R$</span>
                    </div>
                    <p className={`text-2xl font-black text-gray-900 dark:text-white leading-none ${dataCls}`}>{fmtBRL(leads.pipelineValue)}</p>
                    <p className="text-[11px] text-gray-500 mt-1.5">
                        {leads.closingSoonCount > 0 ? `${leads.closingSoonCount} fechando em 7d` : 'Em negociação'}
                    </p>
                </div>

                {/* Resultado 90d */}
                <div className={`${card} p-4 relative overflow-hidden`}
                    style={{ borderColor: `${BRAND.TECH_GREEN}4D`, background: `linear-gradient(135deg, ${BRAND.TECH_GREEN}10, transparent 60%)` }}>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${BRAND.TECH_GREEN}1F`, color: BRAND.TECH_GREEN }}>
                            <Trophy size={13} />
                        </div>
                        <span className={labelCls}>VGV · 90d</span>
                        {auctions.roi90dPct > 0 && (
                            <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-black px-1.5 py-0.5 rounded"
                                style={{ color: BRAND.TECH_GREEN, backgroundColor: `${BRAND.TECH_GREEN}14` }}>
                                ROI {fmtPct(auctions.roi90dPct)}
                            </span>
                        )}
                    </div>
                    <p className={`text-2xl font-black text-gray-900 dark:text-white leading-none ${dataCls}`}>{fmtBRL(auctions.vgv90d)}</p>
                    <p className="text-[11px] text-gray-500 mt-1.5">Receita {fmtBRL(auctions.receita90d)}</p>
                </div>
            </div>

            {/* ── Fio de ligação: Estratégia → Projetos → Tarefas → Indicadores ── */}
            <section className="rounded-2xl border border-gray-200 dark:border-[#2A2A2A] bg-gradient-to-br from-white via-white to-[#A68B4B]/[0.025] dark:from-[#1B1B1B] dark:via-[#1B1B1B] dark:to-[#A68B4B]/[0.04] p-4 lg:p-5">
                <StrategyExecutionChain
                    objectives={objectives}
                    tasks={tasks}
                    snapshot={snapshot}
                    doneStatus={doneStatus}
                />
            </section>

            {/* ── Tendência + Insights ─────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3">
                <div className={`${card} p-4`}>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Calendar size={13} style={{ color: BRAND.BRONZE }} />
                            <div>
                                <p className={labelCls}>Captação diária · 30 dias</p>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                                    Pico:{' '}
                                    <span className={`${dataCls} text-[#A68B4B]`}>{Math.max(...leads.daily30d)}</span>
                                    {' '}leads/dia · Média:{' '}
                                    <span className={dataCls}>{(leads.daily30d.reduce((s, n) => s + n, 0) / 30).toFixed(1)}</span>
                                </p>
                            </div>
                        </div>
                        <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: BRAND.BRONZE }}>
                            {leads.new30d} no período
                        </span>
                    </div>
                    <Sparkline data={leads.daily30d} color={BRAND.BRONZE} height={48} />
                    <div className="flex justify-between mt-1.5 text-[9px] text-gray-400 font-mono">
                        <span>30d atrás</span>
                        <span>15d</span>
                        <span>hoje</span>
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    {insights.slice(0, 3).map((ins, i) => {
                        const accent = ins.kind === 'positive' ? BRAND.TECH_GREEN : ins.kind === 'attention' ? BRAND.LOSS : BRAND.BRONZE;
                        const Icon = ins.kind === 'positive' ? TrendingUp : ins.kind === 'attention' ? Activity : Lightbulb;
                        return (
                            <Link key={i} href={ins.href} className={`${card} p-2.5 group transition-all hover:shadow-md flex items-start gap-2`}
                                style={{ borderColor: `${accent}4D` }}>
                                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}1F`, color: accent }}>
                                    <Icon size={11} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-bold text-gray-900 dark:text-white leading-tight">{ins.title}</p>
                                    <p className="text-[10px] text-gray-500 leading-relaxed mt-0.5">{ins.body}</p>
                                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider mt-1" style={{ color: accent }}>
                                        {ins.cta} <ArrowRight size={9} />
                                    </span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* ── Conexão Estratégia ↔ Execução ────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

                {/* Saúde estratégica */}
                <div className={`${card} p-4`}>
                    <div className="flex items-center gap-2 mb-3">
                        <BarChart3 size={13} style={{ color: BRAND.BRONZE }} />
                        <p className={labelCls}>Saúde estratégica</p>
                    </div>
                    <div className="space-y-2.5">
                        <Bar label="Progresso OKR" value={okrProgress} suffix={`${allKRs.length} KRs`} />
                        <Bar label="Conversão geral" value={leads.conversionPct} suffix={`${leads.total} leads`} />
                        <Bar label="Taxa de resposta WhatsApp" value={whatsapp.replyRatePct} suffix={`${whatsapp.in30d}/${whatsapp.out30d}`} />
                        <Bar label="Velocity lead→cliente" value={leads.velocityDays > 0 ? Math.max(0, 100 - leads.velocityDays * 2) : 0}
                            suffix={leads.velocityDays > 0 ? `${leads.velocityDays.toFixed(0)} dias` : 'sem fechamentos'} />
                    </div>
                </div>

                {/* Próximos leilões */}
                <div className={`${card} p-4`}>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Gavel size={13} style={{ color: BRAND.BRONZE_PALE }} />
                            <p className={labelCls}>Próximos leilões</p>
                        </div>
                        <Link href="/leiloes" className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-0.5" style={{ color: BRAND.BRONZE }}>
                            ver todos <ArrowRight size={9} />
                        </Link>
                    </div>
                    {auctions.upcoming.length === 0 ? (
                        <p className="text-xs text-gray-400 py-4 text-center">Nenhum leilão agendado.</p>
                    ) : (
                        <ul className="space-y-2">
                            {auctions.upcoming.slice(0, 4).map(l => (
                                <li key={l.id} className="flex items-center justify-between gap-2 text-xs">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-gray-900 dark:text-white font-semibold truncate">{l.nome}</p>
                                        <p className={`text-[10px] text-gray-500 ${dataCls}`}>{fmtDateBR(l.data)} · {l.status}</p>
                                    </div>
                                    <span className={`text-[10px] font-bold whitespace-nowrap ${dataCls}`} style={{ color: BRAND.BRONZE }}>
                                        {fmtBRL(l.meta_bula || l.expectativa)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Campanhas ativas */}
                <div className={`${card} p-4`}>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Megaphone size={13} style={{ color: BRAND.TECH_GREEN }} />
                            <p className={labelCls}>Campanhas WhatsApp</p>
                        </div>
                        <Link href="/whatsapp?tab=campanhas" className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-0.5" style={{ color: BRAND.TECH_GREEN }}>
                            ver todas <ArrowRight size={9} />
                        </Link>
                    </div>
                    {campaigns.length === 0 ? (
                        <p className="text-xs text-gray-400 py-4 text-center">Nenhuma campanha em execução.</p>
                    ) : (
                        <ul className="space-y-2.5">
                            {campaigns.slice(0, 4).map(c => {
                                const sentPct = c.total_recipients > 0 ? (c.sent_count / c.total_recipients) * 100 : 0;
                                const replyPct = c.sent_count > 0 ? (c.replied_count / c.sent_count) * 100 : 0;
                                return (
                                    <li key={c.id}>
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{c.name}</p>
                                            <span className={`text-[9px] ${dataCls} text-gray-500`}>{c.status}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className="flex-1 h-1 rounded-full bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                                                <div className="h-full rounded-full" style={{ width: `${sentPct}%`, backgroundColor: BRAND.TECH_GREEN, opacity: 0.85 }} />
                                            </div>
                                            <span className={`text-[9px] ${dataCls} w-12 text-right text-gray-500`}>
                                                {c.sent_count}/{c.total_recipients}
                                            </span>
                                        </div>
                                        {c.replied_count > 0 && (
                                            <p className={`text-[9px] text-gray-400 mt-0.5 ${dataCls}`}>
                                                {c.replied_count} respostas · {fmtPct(replyPct)}
                                            </p>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>

            {/* ── Bloqueios & Riscos ───────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

                {/* Bloqueios da execução */}
                <div className={`${card} p-4`}>
                    <div className="flex items-center gap-2 mb-3">
                        <Hourglass size={13} style={{ color: BRAND.LOSS }} />
                        <p className={labelCls}>Bloqueios da execução</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <StatBlock value={leads.stalledCount} label="Leads parados" hint="+30 dias" color={BRAND.LOSS} />
                        <StatBlock value={overdueCount} label="Tarefas atrasadas" hint="vencidas" color={BRAND.LOSS} />
                        <StatBlock value={activeRisks.length} label="Riscos ativos" hint={`${criticalRisks.length} críticos`} color={criticalRisks.length > 0 ? BRAND.LOSS : BRAND.BRONZE} />
                    </div>
                </div>

                {/* Riscos críticos */}
                <div className={`${card} p-4`}>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <ShieldAlert size={13} style={{ color: criticalRisks.length > 0 ? BRAND.LOSS : BRAND.TECH_GREEN }} />
                            <p className={labelCls}>Riscos críticos</p>
                        </div>
                        {activeRisks.length > 0 && (
                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: BRAND.BRONZE }}>
                                {activeRisks.length} ativo{activeRisks.length > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                    {criticalRisks.length === 0 ? (
                        <p className="text-xs text-gray-400 py-3 text-center">
                            {activeRisks.length === 0 ? 'Nenhum risco mapeado.' : 'Nenhum risco crítico ativo.'}
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {criticalRisks.slice(0, 4).map(r => (
                                <li key={r.id} className="flex items-center gap-2 text-xs">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: BRAND.LOSS }} />
                                    <span className="text-gray-900 dark:text-white truncate flex-1">{r.title}</span>
                                    <span className="text-[9px] text-gray-500 shrink-0">
                                        {r.probability}·{r.impact}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* ── Atalhos para módulos da operação ─────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <ModuleLink href="/crm" icon={<Users size={14} />} label="CRM" hint="Pipeline + MQLs" color={BRAND.BRONZE} />
                <ModuleLink href="/whatsapp" icon={<MessageSquare size={14} />} label="WhatsApp" hint="Inbox + campanhas" color={BRAND.TECH_GREEN} />
                <ModuleLink href="/leiloes" icon={<Gavel size={14} />} label="Leilões" hint="Cronograma + VGV" color={BRAND.TECH_BLUE} />
                <ModuleLink href="/projetos" icon={<Target size={14} />} label="Plano Tático" hint="Tarefas e responsáveis" color={BRAND.BRONZE_PALE} />
            </div>
        </div>
    );
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function Bar({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
    const clamped = Math.min(100, Math.max(0, value));
    const color = clamped >= 70 ? '#10B981' : clamped >= 40 ? '#F59E0B' : '#EF4444';
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-gray-600 dark:text-gray-400">{label}</span>
                <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold ${dataCls}`} style={{ color }}>{value.toFixed(0)}%</span>
                    {suffix && <span className={`text-[9px] text-gray-400 ${dataCls}`}>{suffix}</span>}
                </div>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${clamped}%`, backgroundColor: color }} />
            </div>
        </div>
    );
}

function StatBlock({ value, label, hint, color }: { value: number; label: string; hint: string; color: string }) {
    return (
        <div className="rounded-xl border border-gray-100 dark:border-[#262626] p-2.5 text-center">
            <p className={`text-xl font-black ${dataCls}`} style={{ color: value > 0 ? color : '#9CA3AF' }}>{value}</p>
            <p className="text-[9px] text-gray-700 dark:text-gray-300 font-bold uppercase tracking-wide mt-0.5">{label}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{hint}</p>
        </div>
    );
}

function ModuleLink({ href, icon, label, hint, color }: {
    href: string; icon: React.ReactNode; label: string; hint: string; color: string;
}) {
    return (
        <Link href={href} className={`${card} p-3 group flex items-center gap-2.5 transition-all hover:shadow-md`}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${color}14`, color }}>
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-900 dark:text-white">{label}</p>
                <p className="text-[10px] text-gray-500 truncate">{hint}</p>
            </div>
            <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" style={{ color }} />
        </Link>
    );
}
