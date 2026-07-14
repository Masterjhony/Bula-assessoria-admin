'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
    Users, Crown, TrendingUp, TrendingDown, CheckCircle2, XCircle,
    ArrowRight, Filter, Megaphone, Wallet, DollarSign,
    MousePointerClick, Target, MapPin, Activity, Reply, MessageSquare, MessageCircle, Send,
    Hand, BellOff,
} from 'lucide-react';
import type { CRMLead } from '@/app/sistema/actions/crm-leads';
import type { CRMConfig } from '@/lib/crm-types';
import type { AtendimentoGrowth } from '@/lib/atendimento-stats';
import {
    normalizeCRMStatus, getStageColorHex, CRM_STAGE_ENTRY,
    CRM_STAGE_CONNECTION, CRM_STAGE_QUALIFICATION, CRM_STAGE_INFO_CAPTURED,
    CRM_STAGE_REGISTRATION, CRM_STAGE_LOST,
} from '@/lib/crm-types';
import { Sparkline } from '@/components/admin/Sparkline';
import { META_CAMPAIGNS, metaCampaignTotals, cpmqlOf } from '@/lib/meta-campaigns';
import { foneKey } from '@/lib/atendimento-stats';

const card = 'rounded-2xl border border-gray-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414]';
const BRONZE = '#A68B4B';

const fmtInt = (n: number) => n.toLocaleString('pt-BR');
const fmtBRL = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

function leadDate(l: CRMLead): Date | null {
    const d = l.data_entrada || l.created_at;
    return d ? new Date(d) : null;
}

function pct(part: number, whole: number): number {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Funil em trapézios contínuos. Cada faixa é um trapézio cuja largura do topo é a
// do estágio atual e a da base é a do próximo — encaixando num funil contínuo.
interface FunnelNode { label: string; value: number; color: string; }
function FunnelChart({ nodes, exponent = 1, minPct = 12 }: { nodes: FunnelNode[]; exponent?: number; minPct?: number }) {
    const max = Math.max(1, ...nodes.map(n => n.value));
    const widths = nodes.map(n => Math.max(minPct, Math.pow(n.value / max, exponent) * 100));
    const top = nodes[0]?.value ?? 0;
    return (
        <div>
            {nodes.map((n, i) => {
                const wt = widths[i];
                const wb = widths[i + 1] ?? wt;
                const clip = `polygon(${(50 - wt / 2).toFixed(2)}% 0, ${(50 + wt / 2).toFixed(2)}% 0, ${(50 + wb / 2).toFixed(2)}% 100%, ${(50 - wb / 2).toFixed(2)}% 100%)`;
                const conv = i === 0 ? null : pct(n.value, nodes[i - 1].value);
                return (
                    <div key={n.label} className="flex items-stretch gap-3">
                        <div className="w-36 shrink-0 flex flex-col justify-center py-1.5 text-right">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 leading-tight">{n.label}</span>
                            <span className="text-[10px] text-gray-400">{pct(n.value, top)}% do topo</span>
                        </div>
                        <div className="flex-1 relative" style={{ height: 56 }}>
                            <div
                                className="absolute inset-0 flex items-center justify-center transition-all"
                                style={{
                                    clipPath: clip,
                                    background: `linear-gradient(90deg, ${n.color}cc, ${n.color})`,
                                }}
                            >
                                <span className="text-sm font-extrabold text-white tabular-nums drop-shadow">{fmtInt(n.value)}</span>
                            </div>
                        </div>
                        <div className="w-16 shrink-0 flex items-center justify-end">
                            {conv != null && (
                                <span className={`text-[11px] font-bold tabular-nums ${conv >= 50 ? 'text-emerald-500' : conv >= 25 ? 'text-amber-500' : 'text-gray-400'}`}>
                                    {conv}%
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function StatChip({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: string; color: string }) {
    return (
        <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 dark:border-[#2A2A2A] px-3 py-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + '1A' }}>
                <Icon size={15} style={{ color }} />
            </div>
            <div className="min-w-0">
                <p className="text-base font-bold text-gray-900 dark:text-white tabular-nums leading-none">{value}</p>
                <p className="text-[10px] text-gray-500 mt-1 truncate">{label}</p>
            </div>
        </div>
    );
}

interface Props {
    leads: CRMLead[];
    archived: CRMLead[];
    crmConfig: CRMConfig;
    atendimento: AtendimentoGrowth | null;
}

export function CRMGrowthDashboard({ leads, archived, crmConfig, atendimento }: Props) {
    const stages = crmConfig.funnels[0]?.stages ?? crmConfig.stages;
    const media = META_CAMPAIGNS;

    // Filtro da seção de mídia por campanha — recalcula chips, funil e a lista
    // a partir do subconjunto selecionado. (Filtro por período exige a
    // integração ao vivo do Meta; o snapshot atual é acumulado/lifetime.)
    const [campaignFilter, setCampaignFilter] = useState<string>('all');
    const filteredSnap = useMemo(
        () => (campaignFilter === 'all'
            ? media
            : { ...media, campaigns: media.campaigns.filter(c => c.id === campaignFilter) }),
        [media, campaignFilter],
    );
    const mediaTotals = useMemo(() => metaCampaignTotals(filteredSnap), [filteredSnap]);

    const m = useMemo(() => {
        const total = leads.length;
        const mql = leads.filter(l => l.is_mql).length;

        const byStage = new Map<string, number>();
        for (const l of leads) {
            const s = normalizeCRMStatus(l.status);
            byStage.set(s, (byStage.get(s) ?? 0) + 1);
        }

        const cEntrada = byStage.get(CRM_STAGE_ENTRY) ?? 0;
        const cConexao = byStage.get(CRM_STAGE_CONNECTION) ?? 0;
        const cQualif = byStage.get(CRM_STAGE_QUALIFICATION) ?? 0;
        const cInfo = byStage.get(CRM_STAGE_INFO_CAPTURED) ?? 0;
        const cCadastro = byStage.get(CRM_STAGE_REGISTRATION) ?? 0;
        const perdidos = byStage.get(CRM_STAGE_LOST) ?? 0;
        const aprovados = archived.filter(l => l.extra_data?.cadastro_aprovado).length;

        // Funil de conversão cumulativo (assume progressão; PERDIDOS à parte).
        const convFunnel: FunnelNode[] = [
            { label: 'Total de leads', value: total, color: '#3b82f6' },
            { label: 'No CRM', value: total - cEntrada, color: '#6366f1' },
            { label: 'Qualificados+', value: cQualif + cInfo + cCadastro + aprovados, color: '#eab308' },
            { label: 'Info captadas+', value: cInfo + cCadastro + aprovados, color: '#22c55e' },
            { label: 'Cadastro+', value: cCadastro + aprovados, color: '#06b6d4' },
            { label: 'Clientes', value: aprovados, color: BRONZE },
        ];

        // Distribuição por etapa (status atual) — barras.
        const dist = stages.map(s => ({
            name: s.name,
            color: getStageColorHex(s.color),
            count: byStage.get(s.name) ?? 0,
        }));
        const distMax = Math.max(1, ...dist.map(f => f.count));

        // Séries 30 dias: novos leads + MQL.
        const DAYS = 30;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const idxByKey = new Map<string, number>();
        for (let i = DAYS - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            idxByKey.set(d.toISOString().slice(0, 10), DAYS - 1 - i);
        }
        const series = new Array(DAYS).fill(0);
        const mqlSeries = new Array(DAYS).fill(0);
        for (const l of leads) {
            const d = leadDate(l);
            if (!d) continue;
            const idx = idxByKey.get(d.toISOString().slice(0, 10));
            if (idx != null) {
                series[idx] += 1;
                if (l.is_mql) mqlSeries[idx] += 1;
            }
        }
        const last7 = series.slice(-7).reduce((a, b) => a + b, 0);
        const prev7 = series.slice(-14, -7).reduce((a, b) => a + b, 0);
        const trend7 = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : (last7 > 0 ? 100 : 0);
        const mqlLast7 = mqlSeries.slice(-7).reduce((a, b) => a + b, 0);

        // Origem.
        const bySource = new Map<string, number>();
        for (const l of leads) {
            const src = (l.source || l.origem || 'Sem origem').trim() || 'Sem origem';
            bySource.set(src, (bySource.get(src) ?? 0) + 1);
        }
        const sources = [...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

        // Top estados (UF).
        const byUf = new Map<string, number>();
        for (const l of leads) {
            const uf = (l.estado || '').trim().toUpperCase();
            if (uf) byUf.set(uf, (byUf.get(uf) ?? 0) + 1);
        }
        const ufs = [...byUf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

        // Interesses consolidados das campanhas (mídia).
        const interMap = new Map<string, number>();
        for (const c of media.campaigns)
            for (const it of c.interesses) interMap.set(it.label, (interMap.get(it.label) ?? 0) + it.n);
        const interesses = [...interMap.entries()].sort((a, b) => b[1] - a[1]);
        const interTotal = interesses.reduce((a, b) => a + b[1], 0);

        const taxaConversao = total > 0 ? +(((cCadastro + aprovados) / total) * 100).toFixed(1) : 0;

        return {
            total, mql, perdidos, aprovados, cCadastro,
            convFunnel, dist, distMax, series, mqlSeries, last7, prev7, trend7, mqlLast7,
            sources, ufs, interesses, interTotal, taxaConversao,
        };
    }, [leads, archived, stages, media]);

    // Atendimento cruzado com o CRM: funil contatado→respondeu→MQL→cadastro→cliente
    // (cruzando o telefone dos respondentes com os leads) + interesse/handoff/opt-out.
    const atd = useMemo(() => {
        // Interesse / handoff / opt-out saem direto dos leads ativos.
        const interMap = new Map<string, number>();
        let handoff = 0, optout = 0, comInteresse = 0;
        for (const l of leads) {
            if (l.handoff_humano) handoff++;
            if (l.optout_whatsapp) optout++;
            if (l.interesse_principal) {
                comInteresse++;
                interMap.set(l.interesse_principal, (interMap.get(l.interesse_principal) ?? 0) + 1);
            }
        }
        const interesses = [...interMap.entries()].sort((a, b) => b[1] - a[1]);
        const interTotal = interesses.reduce((a, b) => a + b[1], 0);

        if (!atendimento) return { funnel: null, interesses, interTotal, handoff, optout, comInteresse };

        // Índice telefone→lead e telefone→cliente aprovado.
        const leadByKey = new Map<string, CRMLead>();
        for (const l of leads) for (const p of [l.telefone, l.celular]) {
            const k = foneKey(p);
            if (k && !leadByKey.has(k)) leadByKey.set(k, l);
        }
        const aprovadoKeys = new Set<string>();
        for (const l of archived) {
            if (!l.extra_data?.cadastro_aprovado) continue;
            for (const p of [l.telefone, l.celular]) { const k = foneKey(p); if (k) aprovadoKeys.add(k); }
        }

        let respMql = 0, respCad = 0, respCli = 0;
        for (const k of atendimento.respondentes_keys) {
            const lead = leadByKey.get(k);
            const cliente = aprovadoKeys.has(k);
            if (cliente) respCli++;
            if (cliente || (lead && normalizeCRMStatus(lead.status) === CRM_STAGE_REGISTRATION)) respCad++;
            if (cliente || lead?.is_mql) respMql++;
        }

        const funnel: FunnelNode[] = [
            { label: 'Contatados', value: atendimento.disparados, color: '#a855f7' },
            { label: 'Responderam', value: atendimento.responderam, color: '#0ea5e9' },
            { label: 'MQL', value: respMql, color: BRONZE },
            { label: 'Cadastro', value: respCad, color: '#06b6d4' },
            { label: 'Clientes', value: respCli, color: '#10b981' },
        ];
        return { funnel, interesses, interTotal, handoff, optout, comInteresse };
    }, [atendimento, leads, archived]);

    const kpis = [
        { label: 'Leads ativos', value: fmtInt(m.total), icon: Users, color: '#3b82f6', sub: `${m.last7} nos últimos 7 dias` },
        { label: 'MQL', value: fmtInt(m.mql), icon: Crown, color: BRONZE, sub: `${pct(m.mql, m.total)}% dos leads · +${m.mqlLast7} (7d)` },
        { label: 'Taxa de conversão', value: `${m.taxaConversao}%`, icon: Target, color: '#22c55e', sub: `${m.cCadastro + m.aprovados} em cadastro/clientes` },
        {
            label: 'Responderam',
            value: atendimento ? fmtInt(atendimento.responderam) : '—',
            icon: Reply,
            color: '#0ea5e9',
            sub: atendimento ? `de ${fmtInt(atendimento.disparados)} contatados · ${atendimento.pct}%` : 'sem dados de atendimento',
        },
        { label: 'Clientes aprovados', value: fmtInt(m.aprovados), icon: CheckCircle2, color: '#10b981', sub: `${pct(m.aprovados, m.total)}% do total` },
        { label: 'Perdidos', value: fmtInt(m.perdidos), icon: XCircle, color: '#6b7280', sub: `${pct(m.perdidos, m.total)}% do total` },
    ];

    // Funil de mídia (Meta): Impressões → Alcance → Cliques → Leads → MQL.
    const mediaFunnel: FunnelNode[] = [
        { label: 'Impressões', value: mediaTotals.impressions, color: '#6366f1' },
        { label: 'Alcance', value: mediaTotals.reach, color: '#3b82f6' },
        { label: 'Cliques', value: mediaTotals.clicks, color: '#06b6d4' },
        { label: 'Leads', value: mediaTotals.leads, color: '#22c55e' },
        { label: 'MQL', value: mediaTotals.mql, color: BRONZE },
    ];

    return (
        <div className="space-y-4">
            <div className="page-head flex items-start justify-between gap-3">
                <h1>
                    <small>CRM</small>
                    Dashboard de Growth
                    <span className="block text-[12px] font-normal subtle mt-2">
                        Funil de conversão, qualificação e desempenho de mídia (Meta Ads).
                    </span>
                </h1>
                <Link href="/sistema/crm" className="btn ghost shrink-0">
                    Abrir CRM <ArrowRight size={14} />
                </Link>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                {kpis.map(k => (
                    <div key={k.label} className={`${card} p-4`}>
                        <div className="flex items-center gap-2.5 mb-2">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: k.color + '1A' }}>
                                <k.icon size={17} style={{ color: k.color }} />
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{k.label}</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{k.value}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{k.sub}</p>
                    </div>
                ))}
            </div>

            {/* Funil de conversão + distribuição por etapa */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <section className={`${card} p-5 lg:col-span-3`}>
                    <div className="flex items-center gap-2 mb-1">
                        <Filter size={16} className="text-[#A68B4B]" />
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Funil de conversão</h2>
                    </div>
                    <p className="text-[11px] text-gray-400 mb-4">% à direita = conversão da etapa anterior.</p>
                    <FunnelChart nodes={m.convFunnel} exponent={0.65} minPct={14} />
                </section>

                <section className={`${card} p-5 lg:col-span-2`}>
                    <div className="flex items-center gap-2 mb-4">
                        <Activity size={16} className="text-[#A68B4B]" />
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Distribuição por etapa</h2>
                    </div>
                    <div className="space-y-2.5">
                        {m.dist.map(f => (
                            <div key={f.name} className="flex items-center gap-2.5">
                                <span className="w-28 shrink-0 text-[11px] font-medium text-gray-600 dark:text-gray-300 truncate">{f.name}</span>
                                <div className="flex-1 h-5 rounded-lg bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                                    <div
                                        className="h-full rounded-lg flex items-center justify-end pr-1.5"
                                        style={{ width: `${Math.max(6, (f.count / m.distMax) * 100)}%`, backgroundColor: f.color + '33', borderRight: `3px solid ${f.color}` }}
                                    >
                                        <span className="text-[10px] font-bold tabular-nums" style={{ color: f.color }}>{f.count}</span>
                                    </div>
                                </div>
                                <span className="w-8 shrink-0 text-right text-[10px] text-gray-400 tabular-nums">{pct(f.count, m.total)}%</span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {/* Atendimento (WhatsApp) — dado REAL de mensagens, sem grupos, por pessoa */}
            {atendimento && (
                <section className={`${card} p-5`}>
                    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                        <div className="flex items-center gap-2">
                            <Reply size={16} className="text-[#A68B4B]" />
                            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Atendimento — WhatsApp</h2>
                        </div>
                        <span className="text-[10px] text-gray-400">
                            últimos {atendimento.janela_dias} dias · grupos não contam · 1 pessoa = 1 contato
                        </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
                        <StatChip icon={Send} label="Contatados (disparo)" value={fmtInt(atendimento.disparados)} color="#a855f7" />
                        <StatChip icon={Reply} label="Responderam" value={fmtInt(atendimento.responderam)} color="#22c55e" />
                        <StatChip icon={Target} label="Taxa de resposta" value={`${atendimento.pct}%`} color="#0ea5e9" />
                        <StatChip icon={Users} label="Contatos únicos" value={fmtInt(atendimento.contatos)} color="#3b82f6" />
                        <StatChip icon={MessageSquare} label="Mensagens enviadas" value={fmtInt(atendimento.enviadas)} color="#6366f1" />
                        <StatChip icon={MessageCircle} label="Mensagens recebidas" value={fmtInt(atendimento.recebidas)} color="#06b6d4" />
                        <StatChip icon={Hand} label="Em atendimento humano" value={fmtInt(atd.handoff)} color="#f59e0b" />
                        <StatChip icon={BellOff} label="Opt-outs" value={fmtInt(atd.optout)} color="#ef4444" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                        {/* Funil completo: contatado → respondeu → MQL → cadastro → cliente */}
                        <div>
                            <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">Funil — do contato ao cliente</h3>
                            {atd.funnel && <FunnelChart nodes={atd.funnel} exponent={0.5} minPct={13} />}
                            <p className="text-[11px] text-gray-400 mt-3">
                                % à direita = conversão da etapa anterior. MQL/cadastro/cliente são os respondentes
                                cruzados com o CRM pelo telefone.
                            </p>
                        </div>

                        {/* Evolução temporal: contatados x responderam por dia */}
                        <div className="rounded-xl border border-gray-100 dark:border-[#2A2A2A] p-4">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Contatados / dia ({atendimento.janela_dias}d)</h3>
                                <span className="text-4xl font-extrabold tabular-nums text-gray-900 dark:text-white">{atendimento.pct}%</span>
                            </div>
                            <Sparkline data={atendimento.serie_contatados} color="#a855f7" height={44} />
                            <div className="flex items-center justify-between mt-3 mb-1">
                                <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Responderam / dia</h3>
                                <span className="text-[11px] text-gray-400">taxa de resposta média</span>
                            </div>
                            <Sparkline data={atendimento.serie_responderam} color="#22c55e" height={44} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Resposta por origem / campanha */}
                        <div>
                            <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">Taxa de resposta por disparo</h3>
                            {atendimento.por_origem.length === 0 ? (
                                <p className="text-xs text-gray-400">Nenhum disparo no período.</p>
                            ) : (
                                <div className="space-y-2.5">
                                    {atendimento.por_origem.slice(0, 8).map(o => (
                                        <div key={o.origin}>
                                            <div className="flex items-center justify-between text-xs mb-0.5">
                                                <span className="truncate pr-2 text-gray-600 dark:text-gray-300">{o.origin}</span>
                                                <span className="text-gray-400 tabular-nums whitespace-nowrap">
                                                    {o.responderam}/{o.enviados} · <strong className="text-gray-700 dark:text-gray-200">{o.pct}%</strong>
                                                </span>
                                            </div>
                                            <div className="h-1.5 rounded-full bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${o.pct >= 20 ? 'bg-emerald-500' : o.pct >= 8 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                    style={{ width: `${Math.min(100, o.pct)}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Distribuição de interesse (dos leads) */}
                        <div>
                            <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                                Interesse identificado ({fmtInt(atd.comInteresse)} leads)
                            </h3>
                            {atd.interesses.length === 0 ? (
                                <p className="text-xs text-gray-400">Nenhum interesse identificado ainda.</p>
                            ) : (
                                <div className="space-y-2.5">
                                    {atd.interesses.slice(0, 8).map(([label, n]) => (
                                        <div key={label} className="flex items-center gap-2.5">
                                            <span className="w-32 shrink-0 text-[11px] text-gray-600 dark:text-gray-300 truncate">{label}</span>
                                            <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                                                <div className="h-full rounded-full bg-[#A68B4B]" style={{ width: `${pct(n, atd.interTotal)}%` }} />
                                            </div>
                                            <span className="w-14 shrink-0 text-right text-[10px] text-gray-400 tabular-nums">{n} · {pct(n, atd.interTotal)}%</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            )}

            {/* Mídia & Aquisição (Meta Ads) */}
            <section className={`${card} p-5`}>
                <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Megaphone size={16} className="text-[#A68B4B]" />
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Mídia &amp; Aquisição — Meta Ads</h2>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                            <Filter size={13} className="text-gray-400" />
                            <select
                                value={campaignFilter}
                                onChange={e => setCampaignFilter(e.target.value)}
                                className="text-[11px] rounded-lg border border-gray-200 dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] px-2 py-1 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#A68B4B]/40 max-w-[220px]"
                            >
                                <option value="all">Todas as campanhas ({media.campaigns.length})</option>
                                {media.campaigns.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.status === 'ACTIVE' ? '● ' : '○ '}{c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <span className="text-[10px] text-gray-400">
                            {media.account} · atualizado {new Date(media.updatedAt).toLocaleDateString('pt-BR')}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 mb-5">
                    <StatChip icon={Wallet} label="Investimento" value={fmtBRL(mediaTotals.spend)} color="#a855f7" />
                    <StatChip icon={Users} label="Leads (mídia)" value={fmtInt(mediaTotals.leads)} color="#22c55e" />
                    <StatChip icon={DollarSign} label="CPL médio" value={fmtBRL(mediaTotals.cpl)} color="#3b82f6" />
                    <StatChip icon={Crown} label="MQL (mídia)" value={fmtInt(mediaTotals.mql)} color={BRONZE} />
                    <StatChip icon={Target} label="CPMQL médio" value={fmtBRL(mediaTotals.cpmql)} color="#ef4444" />
                    <StatChip icon={MousePointerClick} label="CTR médio" value={`${mediaTotals.ctr.toFixed(2)}%`} color="#06b6d4" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Funil de mídia */}
                    <div>
                        <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">Funil de mídia</h3>
                        <FunnelChart nodes={mediaFunnel} exponent={0.42} minPct={13} />
                        <div className="flex justify-around mt-3 text-center">
                            <div><p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{mediaTotals.ctr.toFixed(2)}%</p><p className="text-[10px] text-gray-400">CTR (cliques/impr.)</p></div>
                            <div><p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{((mediaTotals.leads / Math.max(1, mediaTotals.clicks)) * 100).toFixed(1)}%</p><p className="text-[10px] text-gray-400">Leads/cliques</p></div>
                            <div><p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{mediaTotals.mqlRate.toFixed(1)}%</p><p className="text-[10px] text-gray-400">MQL/leads</p></div>
                        </div>
                    </div>

                    {/* Por campanha */}
                    <div>
                        <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">Desempenho por campanha</h3>
                        <div className="space-y-2.5">
                            {filteredSnap.campaigns.map(c => (
                                <div key={c.id} className="rounded-xl border border-gray-100 dark:border-[#2A2A2A] p-3">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{c.name}</span>
                                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${c.status === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-gray-500/15 text-gray-500'}`}>
                                            {c.status === 'ACTIVE' ? 'Ativa' : 'Pausada'}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-5 gap-1.5 text-center">
                                        <div><p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{fmtInt(c.leads)}</p><p className="text-[9px] text-gray-400">Leads</p></div>
                                        <div><p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{fmtInt(c.mql)}</p><p className="text-[9px] text-gray-400">MQL</p></div>
                                        <div><p className="text-sm font-bold tabular-nums" style={{ color: '#3b82f6' }}>{fmtBRL(c.cpl)}</p><p className="text-[9px] text-gray-400">CPL</p></div>
                                        <div><p className="text-sm font-bold tabular-nums" style={{ color: '#ef4444' }}>{fmtBRL(cpmqlOf(c))}</p><p className="text-[9px] text-gray-400">CPMQL</p></div>
                                        <div><p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{fmtBRL(c.spend)}</p><p className="text-[9px] text-gray-400">Investido</p></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Tendências */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

                <section className={`${card} p-5`}>
                    <div className="flex items-center justify-between mb-1">
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">MQL gerados (30 dias)</h2>
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#A68B4B]">
                            <Crown size={13} /> {m.mqlLast7} esta semana
                        </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">{pct(m.mql, m.total)}% dos leads são MQL</p>
                    <Sparkline data={m.mqlSeries} color="#22c55e" height={56} />
                </section>
            </div>

            {/* Origem · Interesses · Estados */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <section className={`${card} p-5`}>
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Leads por origem</h2>
                    {m.sources.length === 0 ? (
                        <p className="text-xs text-gray-400">Sem dados de origem.</p>
                    ) : (
                        <div className="space-y-2.5">
                            {m.sources.map(([src, count]) => (
                                <div key={src} className="flex items-center gap-2.5">
                                    <span className="w-28 shrink-0 text-[11px] text-gray-600 dark:text-gray-300 truncate">{src}</span>
                                    <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                                        <div className="h-full rounded-full bg-[#A68B4B]" style={{ width: `${pct(count, m.total)}%` }} />
                                    </div>
                                    <span className="w-12 shrink-0 text-right text-[10px] text-gray-400 tabular-nums">{count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className={`${card} p-5`}>
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Interesses (mídia)</h2>
                    {m.interesses.length === 0 ? (
                        <p className="text-xs text-gray-400">Sem dados de interesse.</p>
                    ) : (
                        <div className="space-y-2.5">
                            {m.interesses.map(([label, n]) => (
                                <div key={label} className="flex items-center gap-2.5">
                                    <span className="w-28 shrink-0 text-[11px] text-gray-600 dark:text-gray-300 truncate">{label}</span>
                                    <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${pct(n, m.interTotal)}%`, backgroundColor: '#22c55e' }} />
                                    </div>
                                    <span className="w-14 shrink-0 text-right text-[10px] text-gray-400 tabular-nums">{n} · {pct(n, m.interTotal)}%</span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className={`${card} p-5`}>
                    <div className="flex items-center gap-2 mb-4">
                        <MapPin size={15} className="text-[#A68B4B]" />
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Top estados</h2>
                    </div>
                    {m.ufs.length === 0 ? (
                        <p className="text-xs text-gray-400">Sem dados de localização.</p>
                    ) : (
                        <div className="space-y-2.5">
                            {m.ufs.map(([uf, count]) => (
                                <div key={uf} className="flex items-center gap-2.5">
                                    <span className="w-10 shrink-0 text-[11px] font-semibold text-gray-600 dark:text-gray-300">{uf}</span>
                                    <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct(count, m.ufs[0][1])}%` }} />
                                    </div>
                                    <span className="w-12 shrink-0 text-right text-[10px] text-gray-400 tabular-nums">{count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
