'use client';

/**
 * DASHBOARD DE GROWTH — reformado em 18/08/2026 a pedido do chefe:
 *
 *   1. UM funil único, de Impressões até clientes que compraram — só TRÁFEGO
 *      PAGO (apuração multi-fonte de src/lib/funil-campanhas.json + planilha
 *      ao vivo). Listas frias não entram.
 *   2. Painel de GARGALO: qual etapa está mais longe da meta e por que o
 *      painel diverge do executado (vendas sem parâmetro de URL, vendas que o
 *      assessor assina sem prova de campanha, cadastros de carteira).
 *   3. Leads de listas frias (fonte `planilha` = Base Unificada e
 *      `whatsapp-contatos` = agenda importada) ficam SEPARADOS, num bloco
 *      próprio de operação de CRM — fora de qualquer funil de mídia.
 *   4. Atendimento WhatsApp saiu desta página (vive em /sistema/crm/atendimento
 *      e nos Relatórios).
 *   5. Funil por campanha continua embaixo, com coluna de gargalo por campanha.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import {
    Users, Crown, TrendingUp, TrendingDown, CheckCircle2, XCircle,
    ArrowRight, Target, MapPin, Activity, Eye, MousePointerClick, UserPlus,
    FileCheck2, BadgeCheck, ShoppingCart, AlertTriangle, Snowflake, Wallet,
} from 'lucide-react';
import type { CRMLead } from '@/app/sistema/actions/crm-leads';
import type { CRMConfig } from '@/lib/crm-types';
import { normalizeCRMStatus, getStageColorHex, CRM_STAGE_LOST } from '@/lib/crm-types';
import { Sparkline } from '@/components/admin/Sparkline';
import { FunilPorCampanha, type DadosDoFunil } from '@/components/admin/crm/FunilPorCampanha';
import { FUNIL_CAMPANHAS } from '@/lib/funil-campanhas';

const card = 'rounded-2xl border border-gray-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414]';
const BRONZE = '#A68B4B';
const OURO = '#C9A84C';

/** Fontes que são lista fria / agenda importada — nunca tráfego pago. */
const FONTES_FRIAS = new Set(['planilha', 'whatsapp-contatos']);
const fonteDe = (l: CRMLead) => ((l.source || l.origem || '') as string).trim();
const ehListaFria = (l: CRMLead) => FONTES_FRIAS.has(fonteDe(l));

const fmtInt = (n: number) => n.toLocaleString('pt-BR');
const brl0 = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const taxa = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 10000) / 100 : 0);

function leadDate(l: CRMLead): Date | null {
    const d = l.data_entrada || l.created_at;
    return d ? new Date(d) : null;
}

function pct(part: number, whole: number): number {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Funil em trapézios contínuos.
interface FunnelNode { label: string; value: number; color: string; sub?: string }
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
                const conv = i === 0 ? null : taxa(n.value, nodes[i - 1].value);
                return (
                    <div key={n.label} className="flex items-stretch gap-3">
                        <div className="w-40 shrink-0 flex flex-col justify-center py-1.5 text-right">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 leading-tight">{n.label}</span>
                            <span className="text-[10px] text-gray-400">{n.sub ?? `${pct(n.value, top)}% do topo`}</span>
                        </div>
                        <div className="flex-1 relative" style={{ height: 52 }}>
                            <div
                                className="absolute inset-0 flex items-center justify-center transition-all"
                                style={{ clipPath: clip, background: `linear-gradient(90deg, ${n.color}cc, ${n.color})` }}
                            >
                                <span className="text-sm font-extrabold text-white tabular-nums drop-shadow">{fmtInt(n.value)}</span>
                            </div>
                        </div>
                        <div className="w-16 shrink-0 flex items-center justify-end">
                            {conv != null && (
                                <span className={`text-[11px] font-bold tabular-nums ${conv >= 50 ? 'text-emerald-500' : conv >= 25 ? 'text-amber-500' : 'text-gray-400'}`}>
                                    {conv.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

interface Props {
    leads: CRMLead[];
    archived: CRMLead[];
    crmConfig: CRMConfig;
    /** Funil por campanha, com o topo relido da planilha pelo servidor. */
    funil?: DadosDoFunil;
}

export function CRMGrowthDashboard({ leads, archived, crmConfig, funil }: Props) {
    const stages = crmConfig.funnels[0]?.stages ?? crmConfig.stages;
    const d = funil ?? (FUNIL_CAMPANHAS as DadosDoFunil);

    // ── FUNIL ÚNICO — tráfego pago, de impressões a clientes ────────────────
    const pago = useMemo(() => {
        const t = d.totais;
        const nodes: FunnelNode[] = [
            { label: 'Impressões', value: t.impressoes, color: '#6366f1' },
            { label: 'Cliques', value: t.cliques, color: '#3b82f6', sub: `CTR ${taxa(t.cliques, t.impressoes)}% · meta ${d.metas.ctr}%` },
            { label: 'Leads', value: t.leads, color: '#0ea5e9' },
            { label: 'Qualificados (MQL)', value: t.mql, color: '#eab308', sub: `meta ${d.metas.mqlPorLead}% dos leads` },
            { label: 'Cadastros submetidos', value: t.cadastrosSubmetidos, color: '#a855f7', sub: `meta ${d.metas.cadastroPorMql}% dos MQL` },
            { label: 'Cadastros aprovados', value: t.cadastrosAprovados, color: '#06b6d4', sub: `meta ${d.metas.aprovadoPorCadastro}% dos submetidos` },
            { label: 'Clientes que compraram', value: t.clientes, color: '#10b981', sub: `meta ${d.metas.clientePorAprovado}% dos aprovados` },
        ];
        const roas = t.investido > 0 ? t.faturamento / t.investido : 0;

        // Gargalo: etapa cuja taxa apurada fica mais longe da meta.
        const etapasComMeta = [
            { nome: 'CTR (cliques/impressões)', taxa: taxa(t.cliques, t.impressoes), meta: d.metas.ctr },
            { nome: 'MQL por lead', taxa: taxa(t.mql, t.leads), meta: d.metas.mqlPorLead },
            { nome: 'Cadastro por MQL', taxa: taxa(t.cadastrosSubmetidos, t.mql), meta: d.metas.cadastroPorMql },
            { nome: 'Aprovação do cadastro', taxa: taxa(t.cadastrosAprovados, t.cadastrosSubmetidos), meta: d.metas.aprovadoPorCadastro },
            { nome: 'Compra por aprovado', taxa: taxa(t.clientes, t.cadastrosAprovados), meta: d.metas.clientePorAprovado },
        ].map(e => ({ ...e, pctDaMeta: e.meta > 0 ? Math.round((e.taxa / e.meta) * 100) : null }));
        const gargalo = [...etapasComMeta].filter(e => e.pctDaMeta != null).sort((a, b) => (a.pctDaMeta! - b.pctDaMeta!))[0] ?? null;

        // Divergência sistema × executado — o que aconteceu mas o funil não prova.
        const declarado = (d.confirmadosPeloAssessor ?? []).reduce((a, x) => a + x.valor, 0);
        const declaradoN = (d.confirmadosPeloAssessor ?? []).length;
        return { nodes, roas, etapasComMeta, gargalo, declarado, declaradoN, t };
    }, [d]);

    // ── CRM operacional: pagos/orgânicos separados das listas frias ─────────
    const m = useMemo(() => {
        const frios = leads.filter(ehListaFria);
        const quentes = leads.filter(l => !ehListaFria(l));

        const total = leads.length;
        const mql = quentes.filter(l => l.is_mql).length;
        const mqlFrios = frios.filter(l => l.is_mql).length;

        const byStage = new Map<string, number>();
        for (const l of quentes) {
            const s = normalizeCRMStatus(l.status);
            byStage.set(s, (byStage.get(s) ?? 0) + 1);
        }
        const perdidos = byStage.get(CRM_STAGE_LOST) ?? 0;
        const aprovados = archived.filter(l => l.extra_data?.cadastro_aprovado).length;

        // Distribuição por etapa (status atual) — só quem não é lista fria.
        const dist = stages.map(s => ({
            name: s.name,
            color: getStageColorHex(s.color),
            count: byStage.get(s.name) ?? 0,
        }));
        const distMax = Math.max(1, ...dist.map(f => f.count));

        // Séries 30 dias (novos leads que NÃO são de lista fria + MQL).
        const DAYS = 30;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const idxByKey = new Map<string, number>();
        for (let i = DAYS - 1; i >= 0; i--) {
            const dt = new Date(today);
            dt.setDate(today.getDate() - i);
            idxByKey.set(dt.toISOString().slice(0, 10), DAYS - 1 - i);
        }
        const series = new Array(DAYS).fill(0);
        const mqlSeries = new Array(DAYS).fill(0);
        for (const l of quentes) {
            const dt = leadDate(l);
            if (!dt) continue;
            const idx = idxByKey.get(dt.toISOString().slice(0, 10));
            if (idx != null) {
                series[idx] += 1;
                if (l.is_mql) mqlSeries[idx] += 1;
            }
        }
        const last7 = series.slice(-7).reduce((a, b) => a + b, 0);
        const prev7 = series.slice(-14, -7).reduce((a, b) => a + b, 0);
        const trend7 = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : (last7 > 0 ? 100 : 0);
        const mqlLast7 = mqlSeries.slice(-7).reduce((a, b) => a + b, 0);

        // Origem — separa frias explicitamente.
        const bySource = new Map<string, number>();
        for (const l of quentes) {
            const src = fonteDe(l) || 'Sem origem';
            bySource.set(src, (bySource.get(src) ?? 0) + 1);
        }
        const sources = [...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
        const friasPorFonte = new Map<string, number>();
        for (const l of frios) {
            const src = fonteDe(l) || 'Sem origem';
            friasPorFonte.set(src, (friasPorFonte.get(src) ?? 0) + 1);
        }

        // Top estados (UF) — só quentes.
        const byUf = new Map<string, number>();
        for (const l of quentes) {
            const uf = (l.estado || '').trim().toUpperCase();
            if (uf) byUf.set(uf, (byUf.get(uf) ?? 0) + 1);
        }
        const ufs = [...byUf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

        return {
            total, quentes: quentes.length, frios: frios.length, mql, mqlFrios, perdidos, aprovados,
            dist, distMax, series, mqlSeries, last7, prev7, trend7, mqlLast7,
            sources, friasPorFonte: [...friasPorFonte.entries()].sort((a, b) => b[1] - a[1]), ufs,
        };
    }, [leads, archived, stages]);

    const roasTxt = pago.roas ? `${pago.roas.toFixed(1)}×` : '—';

    return (
        <div className="space-y-4">
            <div className="page-head flex items-start justify-between gap-3">
                <h1>
                    <small>CRM</small>
                    Dashboard de Growth
                    <span className="block text-[12px] font-normal subtle mt-2">
                        Funil único do tráfego pago — de impressões a clientes que compraram — apurado no Meta,
                        na planilha, nos grupos de cadastro e no ERP. Listas frias ficam separadas, embaixo.
                    </span>
                </h1>
                <Link href="/sistema/crm" className="btn ghost shrink-0">
                    Abrir CRM <ArrowRight size={14} />
                </Link>
            </div>

            {/* ── FUNIL ÚNICO — tráfego pago ─────────────────────────────────── */}
            <section className={`${card} p-5`}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <Target size={16} style={{ color: OURO }} />
                            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Funil único — do anúncio à compra</h2>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">
                            Só tráfego pago. Lead sem prova de campanha não entra — está no painel de divergência, embaixo.
                            {' '}Mídia lida em {d.metaExtraidoEm?.split('-').reverse().join('/')}.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {[
                            { l: 'Investido', v: brl0(pago.t.investido), icon: Wallet },
                            { l: 'Faturamento', v: brl0(pago.t.faturamento), icon: ShoppingCart },
                            { l: 'Retorno (ROAS)', v: roasTxt, icon: TrendingUp },
                            { l: 'Animais', v: fmtInt(pago.t.animais), icon: Activity },
                        ].map(k => (
                            <div key={k.l} className="rounded-lg border border-gray-100 dark:border-[#2A2A2A] px-3 py-2 text-right">
                                <p className="text-[15px] font-bold tabular-nums text-gray-900 dark:text-white leading-none">{k.v}</p>
                                <p className="text-[9px] text-gray-500 mt-1 uppercase tracking-wide">{k.l}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <FunnelChart nodes={pago.nodes} exponent={0.32} minPct={10} />
            </section>

            {/* ── GARGALO + divergência sistema × executado ───────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <section className={`${card} p-5`}>
                    <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle size={15} className="text-amber-500" />
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Onde o funil trava</h2>
                    </div>
                    {pago.gargalo && (
                        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-3.5 py-3 mb-3">
                            <p className="text-[13px] font-bold text-amber-900 dark:text-amber-200">
                                Gargalo: {pago.gargalo.nome}
                            </p>
                            <p className="text-[11.5px] text-amber-800 dark:text-amber-300/90 mt-1 leading-snug">
                                Apurado {pago.gargalo.taxa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% contra meta de {pago.gargalo.meta}% —
                                a etapa está a {pago.gargalo.pctDaMeta}% da meta, a pior do funil.
                            </p>
                        </div>
                    )}
                    <div className="space-y-2">
                        {pago.etapasComMeta.map(e => {
                            const cor = e.pctDaMeta == null ? '#6b7280' : e.pctDaMeta >= 100 ? '#10b981' : e.pctDaMeta >= 60 ? '#eab308' : '#ef4444';
                            return (
                                <div key={e.nome} className="flex items-center gap-2.5">
                                    <span className="w-44 shrink-0 text-[11px] text-gray-600 dark:text-gray-300 truncate">{e.nome}</span>
                                    <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, e.pctDaMeta ?? 0)}%`, backgroundColor: cor }} />
                                    </div>
                                    <span className="w-28 shrink-0 text-right text-[10px] tabular-nums" style={{ color: cor }}>
                                        {e.taxa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% / meta {e.meta}%
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </section>

                <section className={`${card} p-5`}>
                    <div className="flex items-center gap-2 mb-3">
                        <Eye size={15} className="text-rose-500" />
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Por que o sistema diverge do executado</h2>
                    </div>
                    <ul className="text-[11.5px] text-gray-600 dark:text-gray-300 space-y-2.5 leading-relaxed">
                        <li className="flex gap-2">
                            <MousePointerClick size={13} className="mt-[2px] shrink-0 text-rose-400" />
                            <span>
                                <strong>{fmtInt(d.fora?.landingSemParametro?.length ?? 0)} leads chegaram pelas nossas páginas sem parâmetro de campanha na URL</strong> —
                                o sistema não consegue provar de qual anúncio vieram, então nenhuma campanha os recebe.
                                Entre eles {d.fora?.vendaSemCampanha?.clientes === 1 ? 'há uma venda' : `há ${d.fora?.vendaSemCampanha?.clientes ?? 0} vendas`} de{' '}
                                <strong>{brl0(d.fora?.vendaSemCampanha?.valor ?? 0)}</strong>.
                            </span>
                        </li>
                        {pago.declaradoN > 0 && (
                            <li className="flex gap-2">
                                <UserPlus size={13} className="mt-[2px] shrink-0 text-rose-400" />
                                <span>
                                    <strong>{pago.declaradoN} venda(s) de {brl0(pago.declarado)} que o assessor assina como fruto de campanha</strong> —
                                    sem parâmetro na URL, o funil não conta. É o executado que o medido não alcança.
                                </span>
                            </li>
                        )}
                        <li className="flex gap-2">
                            <FileCheck2 size={13} className="mt-[2px] shrink-0 text-rose-400" />
                            <span>
                                <strong>{fmtInt(d.cadastros?.semLeadNenhum ?? 0)} cadastros submetidos nos grupos sem existir como lead de anúncio</strong> —
                                carteira de assessor, não mídia. Aparecem no executado, nunca no funil pago.
                            </span>
                        </li>
                        <li className="flex gap-2">
                            <BadgeCheck size={13} className="mt-[2px] shrink-0 text-rose-400" />
                            <span>
                                Criativo apontando para a landing de outro produto redireciona lead e conversão para a
                                campanha errada (caso TOUROS→/femeas em 12–15/08). O alerta vermelho no funil da campanha
                                acusa quando isso acontece.
                            </span>
                        </li>
                    </ul>
                    <p className="text-[10.5px] text-gray-400 mt-3 leading-snug">
                        Correção na origem: taguear toda landing com utm_campaign + ad-id e conferir o destino dos criativos
                        a cada campanha nova. Enquanto isso, o funil mostra o que dá para PROVAR.
                    </p>
                </section>
            </div>

            {/* ── FUNIL POR CAMPANHA ──────────────────────────────────────────── */}
            <FunilPorCampanha dados={funil} />

            {/* ── OPERAÇÃO DO CRM (sem listas frias; frias ficam no card ao lado) ─ */}
            <div className="page-head pt-2">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Operação do CRM</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                    Leads de campanhas, WhatsApp e indicação. Listas frias (Base Unificada e agenda importada)
                    estão separadas — não entram nestes números.
                </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                {[
                    { label: 'Leads (sem listas frias)', value: fmtInt(m.quentes), icon: Users, color: '#3b82f6', sub: `${m.last7} nos últimos 7 dias` },
                    { label: 'MQL', value: fmtInt(m.mql), icon: Crown, color: BRONZE, sub: `${pct(m.mql, m.quentes)}% · +${m.mqlLast7} (7d)` },
                    { label: 'Clientes aprovados', value: fmtInt(m.aprovados), icon: CheckCircle2, color: '#10b981', sub: 'cadastro aprovado em leiloeira' },
                    { label: 'Perdidos', value: fmtInt(m.perdidos), icon: XCircle, color: '#6b7280', sub: `${pct(m.perdidos, m.quentes)}% dos leads` },
                    {
                        label: 'Listas frias', value: fmtInt(m.frios), icon: Snowflake, color: '#64748b',
                        sub: m.friasPorFonte.map(([k, v]) => `${k}: ${fmtInt(v)}`).join(' · ') || '—',
                    },
                    { label: 'MQL vindos de frias', value: fmtInt(m.mqlFrios), icon: Crown, color: '#64748b', sub: 'qualificados após reativação' },
                ].map(k => (
                    <div key={k.label} className={`${card} p-4`}>
                        <div className="flex items-center gap-2.5 mb-2">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: k.color + '1A' }}>
                                <k.icon size={17} style={{ color: k.color }} />
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{k.label}</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{k.value}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate" title={k.sub}>{k.sub}</p>
                    </div>
                ))}
            </div>

            {/* Distribuição por etapa + tendências */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
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
                                <span className="w-8 shrink-0 text-right text-[10px] text-gray-400 tabular-nums">{pct(f.count, m.quentes)}%</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className={`${card} p-5 lg:col-span-3`}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Novos leads (30 dias)</h2>
                                <span className={`inline-flex items-center gap-1 text-xs font-bold ${m.trend7 >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {m.trend7 >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                                    {m.trend7 >= 0 ? '+' : ''}{m.trend7}%
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mb-3">{m.last7} esta semana · {m.prev7} na anterior · sem listas frias</p>
                            <Sparkline data={m.series} color={BRONZE} height={56} />
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">MQL gerados (30 dias)</h2>
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#A68B4B]">
                                    <Crown size={13} /> {m.mqlLast7} esta semana
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mb-3">{pct(m.mql, m.quentes)}% dos leads são MQL</p>
                            <Sparkline data={m.mqlSeries} color="#22c55e" height={56} />
                        </div>
                    </div>
                </section>
            </div>

            {/* Origem · Estados */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <section className={`${card} p-5`}>
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Leads por origem (sem listas frias)</h2>
                    {m.sources.length === 0 ? (
                        <p className="text-xs text-gray-400">Sem dados de origem.</p>
                    ) : (
                        <div className="space-y-2.5">
                            {m.sources.map(([src, count]) => (
                                <div key={src} className="flex items-center gap-2.5">
                                    <span className="w-40 shrink-0 text-[11px] text-gray-600 dark:text-gray-300 truncate">{src}</span>
                                    <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                                        <div className="h-full rounded-full bg-[#A68B4B]" style={{ width: `${pct(count, m.quentes)}%` }} />
                                    </div>
                                    <span className="w-12 shrink-0 text-right text-[10px] text-gray-400 tabular-nums">{fmtInt(count)}</span>
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
                                    <span className="w-12 shrink-0 text-right text-[10px] text-gray-400 tabular-nums">{fmtInt(count)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
