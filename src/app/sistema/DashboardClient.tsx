'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    Gavel, Target, Trophy, PhoneCall, ListTodo,
    Filter, ArrowRight, Download, MoreHorizontal,
    Sparkles, CheckCircle2, Clock, MapPin,
    TrendingUp, TrendingDown, Users, MessageSquare,
    Medal, BarChart3, Package, Dna,
} from 'lucide-react';
import './dashboard.css';

// ─── types ──────────────────────────────────────────────────────────────────

export type ProximoLeilao = {
    nome: string;
    tipo: string | null;
    animais: number;
    meta_bula: number;
    expectativa: number;
    horario: string | null;
    leiloeira: string | null;
    local: string | null;
    status: string;
    data: string; // ISO YYYY-MM-DD
    wk: string;   // Seg, Ter…
    day: string;  // 28
    mo: string;   // Abr
    targetTs: number | null; // ms (hora do leilão) para countdown
    diasParaProximo: number | null;
};

export type ProximoLeilaoRow = {
    id: string;
    d: string; m: string; wk: string;
    title: string; type: string;
    status: 'ok' | 'warn' | 'pend';
    statusLabel: string;
    pct: number;
    animais: number;
    expectativaLabel: string;
};

export type VgvPoint = { label: string; meta: number; vgv: number; prev: number };

export type FunnelStep = { label: string; n: number; pct: number };

export type FeedItem = {
    id: string;
    kind: 'lead' | 'wpp' | 'fechamento' | 'task' | 'ai';
    text: string;
    when: string;
};

export type PerformanceData = {
    ticketMedio: number;
    maiorLance: number;
    lotesVendidos: number;
    lotesOfertados: number;
    taxaConversao: number;
    animaisVendidos: number;
    compradoresUnicos: number;
    estadosUnicos: number;
};

export type RegionItem = { uf: string; estado: string; vgv: number; lotes: number; pct: number };

export type LeilaoTopItem = { nome: string; data: string; vgv: number; lotesVendidos: number; animais: number };
export type CompradorItem = { fazenda: string; uf: string; vgv: number; lotes: number };
export type LanceItem = { lote: string; fazenda: string; uf: string; vgv: number; leilao: string };

export type CatCount = { label: string; count: number };
export type ReservaStatusItem = { status: string; label: string; count: number; valor: number };

export type DashboardProps = {
    today: string;
    proximo: ProximoLeilao | null;
    upcoming: ProximoLeilaoRow[];
    kpi: {
        upcomingCount: number;
        confirmedCount: number;
        totalMetaBula: number;
        totalAnimaisUpcoming: number;
        totalVgvFechado: number;
        totalFechamentos: number;
        activeLeads: number;
        hotLeads: number;
        totalLeads: number;
        ticketMedio: number;
        vgvSpark: number[];
        metaSpark: number[];
        leadsSpark: number[];
    };
    vgv: VgvPoint[];
    funnel: FunnelStep[];
    feed: FeedItem[];
    performance: PerformanceData;
    regions: RegionItem[];
    rankings: {
        topLeiloes: LeilaoTopItem[];
        compradores: CompradorItem[];
        lances: LanceItem[];
    };
    formula: {
        produtosTotal: number;
        produtosByCategory: CatCount[];
        reservasAtivas: number;
        reservasNovas: number;
        reservasValor: number;
        reservasByStatus: ReservaStatusItem[];
    };
    aiInsight: { projection: number; metaTotal: number; pct: number; hint: string };
};

// Item genérico de KPI — montado no root e passado ao componente <KPIs />.
export type KpiItem = {
    label: string;
    val: string;
    delta: string;
    dir?: 'up' | 'down';
    icon: React.ReactNode;
    spark: number[];
    color: string;
    tone: string;
    href: string;
};

// ─── helpers ────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtBRLCompact = (v: number) => {
    const abs = Math.abs(v);
    const sign = v < 0 ? '−' : '';
    if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(2).replace('.', ',')}M`;
    if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(0)}k`;
    return fmtBRL(v);
};
const fmtNum = (v: number) => v.toLocaleString('pt-BR');
const MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function useCountdown(target: number | null) {
    const [now, setNow] = useState<number>(() => Date.now());
    useEffect(() => {
        if (target == null) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [target]);
    if (target == null) return { d: 0, h: 0, m: 0, s: 0, done: true };
    const ms = Math.max(0, target - now);
    return {
        d: Math.floor(ms / 86400000),
        h: Math.floor((ms % 86400000) / 3600000),
        m: Math.floor((ms % 3600000) / 60000),
        s: Math.floor((ms % 60000) / 1000),
        done: ms === 0,
    };
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

// ─── Sparkline ──────────────────────────────────────────────────────────────

function Sparkline({ data, color, fill = true }: { data: number[]; color: string; fill?: boolean }) {
    const w = 58, h = 22, pad = 2;
    if (!data.length) return null;
    const min = Math.min(...data), max = Math.max(...data);
    const rng = max - min || 1;
    const pts = data.map((v, i) => {
        const x = pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v - min) / rng) * (h - pad * 2);
        return [x, y] as const;
    });
    const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const fillPath = path + ` L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`;
    const gid = 'sp-' + color.replace(/[^a-z0-9]/gi, '');
    return (
        <svg className="dcl-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <defs>
                <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            {fill && <path d={fillPath} fill={`url(#${gid})`} />}
            <path d={path} fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// ─── Hero ───────────────────────────────────────────────────────────────────

function Hero({ data }: { data: ProximoLeilao | null }) {
    const { d, h, m, s, done } = useCountdown(data?.targetTs ?? null);
    if (!data) {
        return (
            <div className="dcl-hero" style={{ gridTemplateColumns: '1fr', textAlign: 'center' }}>
                <div>
                    <div className="dcl-hero-tags"><span className="dcl-tag dcl-dim">Nenhum leilão próximo cadastrado</span></div>
                    <h2 className="dcl-hero-title">Sem leilões agendados</h2>
                    <p style={{ color: 'var(--dcl-ink-3)', fontSize: 13, marginTop: 4 }}>Adicione um novo evento na página de Leilões.</p>
                </div>
            </div>
        );
    }
    const diasLabel = data.diasParaProximo === 0 ? 'hoje' : data.diasParaProximo === 1 ? 'amanhã' : `em ${data.diasParaProximo} dias`;
    const statusMap: Record<string, { cls: string; label: string }> = {
        confirmado: { cls: 'dcl-green', label: 'Confirmado' },
        negociacao: { cls: 'dcl-dim', label: 'Em negociação' },
        prospecto: { cls: 'dcl-dim', label: 'Prospecto' },
    };
    const st = statusMap[data.status] ?? statusMap.prospecto;
    return (
        <Link href="/leiloes" className="dcl-hero">
            <div className="dcl-date-block">
                <div className="dcl-wk">{data.wk}</div>
                <div className="dcl-day">{data.day}</div>
                <div className="dcl-mo">{data.mo}</div>
            </div>
            <div className="dcl-hero-body">
                <div className="dcl-hero-tags">
                    <span className="dcl-tag dcl-gold"><Gavel size={11} /><span>Próximo leilão</span></span>
                    <span className={`dcl-tag ${st.cls}`}>{data.status === 'confirmado' ? <CheckCircle2 size={11} /> : null}<span>{st.label}</span></span>
                    {data.horario && (
                        <span className="dcl-tag dcl-dim"><Clock size={11} />{diasLabel} · {data.horario}</span>
                    )}
                </div>
                <h2 className="dcl-hero-title">
                    {data.nome}
                    {data.tipo && <span className="dcl-sub"> · {data.tipo}</span>}
                </h2>
                <div className="dcl-hero-meta">
                    {data.animais > 0 && <><span>{fmtNum(data.animais)} animais catalogados</span><span className="dcl-dot" /></>}
                    {data.meta_bula > 0 && <><span>Meta: {fmtBRLCompact(data.meta_bula)}</span><span className="dcl-dot" /></>}
                    {data.expectativa > 0 && <><span>Expectativa: {fmtBRLCompact(data.expectativa)}</span><span className="dcl-dot" /></>}
                    {data.leiloeira && <><span>{data.leiloeira}</span><span className="dcl-dot" /></>}
                    {data.local && <span><MapPin size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{data.local}</span>}
                </div>
            </div>
            <div className="dcl-countdown">
                <div className="dcl-cd-cell"><div className="dcl-n">{done ? '00' : pad2(d)}</div><div className="dcl-l">dias</div></div>
                <div className="dcl-cd-cell"><div className="dcl-n">{done ? '00' : pad2(h)}</div><div className="dcl-l">horas</div></div>
                <div className="dcl-cd-cell"><div className="dcl-n">{done ? '00' : pad2(m)}</div><div className="dcl-l">min</div></div>
                <div className="dcl-cd-cell"><div className="dcl-n">{done ? '00' : pad2(s)}</div><div className="dcl-l">seg</div></div>
            </div>
        </Link>
    );
}

// ─── KPIs ───────────────────────────────────────────────────────────────────

const KPI_GOLD = '#D4A85C', KPI_GREEN = '#5db87a', KPI_BLUE = '#6a8fd4', KPI_VIOLET = '#9b86c4';

function KPIs({ items }: { items: KpiItem[] }) {
    return (
        <div className="dcl-kpi-row">
            {items.map(it => (
                <Link key={it.label} href={it.href} className="dcl-kpi dcl-k-gold">
                    <div className="dcl-kpi-head">
                        <div className="dcl-kpi-label">{it.label}</div>
                        <div className={`dcl-kpi-ic dcl-${it.tone}`}>{it.icon}</div>
                    </div>
                    <div className="dcl-kpi-val">{it.val}</div>
                    <div className="dcl-kpi-delta">
                        <span className={it.dir === 'down' ? 'dcl-delta-dn' : 'dcl-delta-up'}>
                            {it.dir === 'down' ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
                        </span>
                        <span>{it.delta}</span>
                    </div>
                    {it.spark?.length > 0 && <Sparkline data={it.spark} color={it.color} />}
                </Link>
            ))}
        </div>
    );
}

// ─── VGV Chart ──────────────────────────────────────────────────────────────

function VGVChart({ data, totalMeta, totalVgv, projection }: { data: VgvPoint[]; totalMeta: number; totalVgv: number; projection: number }) {
    const [hover, setHover] = useState<number | null>(null);
    const safe = data.length ? data : [{ label: '—', meta: 0, vgv: 0, prev: 0 }];
    const w = 820, h = 260, pad = { l: 48, r: 16, t: 16, b: 30 };
    const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
    const allVals = safe.flatMap(p => [p.meta, p.vgv, p.prev]);
    const rawMax = Math.max(...allVals, 0.1);
    const max = Math.ceil(rawMax * 1.2 * 10) / 10;
    const xFor = (i: number) => pad.l + (i / Math.max(1, safe.length - 1)) * innerW;
    const yFor = (v: number) => pad.t + innerH - (v / max) * innerH;
    const mkArea = (arr: number[]) => {
        const p = arr.map((v, i) => (i === 0 ? 'M' : 'L') + xFor(i) + ',' + yFor(v)).join(' ');
        return p + ` L${xFor(arr.length - 1)},${pad.t + innerH} L${xFor(0)},${pad.t + innerH} Z`;
    };
    const mkLine = (arr: number[]) => arr.map((v, i) => (i === 0 ? 'M' : 'L') + xFor(i) + ',' + yFor(v)).join(' ');
    const yTicks = [0, max / 4, max / 2, (3 * max) / 4, max];
    const meta = safe.map(p => p.meta);
    const vgv = safe.map(p => p.vgv);
    const prev = safe.map(p => p.prev);
    const pctMeta = totalMeta > 0 ? (totalVgv / totalMeta) * 100 : 0;
    const prevSum = prev.reduce((a, b) => a + b, 0);
    const currSum = vgv.reduce((a, b) => a + b, 0);
    const deltaPct = prevSum > 0 ? ((currSum - prevSum) / prevSum) * 100 : 0;

    return (
        <div className="dcl-card dcl-col-8">
            <div className="dcl-card-head">
                <div>
                    <h3>Volume geral de vendas · R$</h3>
                    <span className="dcl-sub">Meta confirmada vs VGV fechado · comparação com ano anterior</span>
                </div>
                <div className="dcl-row">
                    <button className="dcl-timeframe" style={{ padding: 0 }}>
                        <span style={{ padding: '6px 11px', fontSize: 12, color: 'var(--dcl-ink-2)' }}>6M</span>
                    </button>
                    <button className="dcl-link-btn" title="Exportar"><Download size={14} /></button>
                    <button className="dcl-link-btn" title="Mais"><MoreHorizontal size={14} /></button>
                </div>
            </div>
            <div className="dcl-chart-stats">
                <div className="dcl-s">
                    <div className="dcl-n">{fmtBRLCompact(totalMeta)}</div>
                    <div className="dcl-l">Meta confirmada · acumulado</div>
                    <div className="dcl-d" style={{ color: deltaPct >= 0 ? 'var(--dcl-green)' : 'var(--dcl-red)' }}>
                        {deltaPct >= 0 ? '↑' : '↓'} {Math.abs(deltaPct).toFixed(1)}% vs período anterior
                    </div>
                </div>
                <div className="dcl-s">
                    <div className="dcl-n">{fmtBRLCompact(totalVgv)}</div>
                    <div className="dcl-l">VGV fechado ({pctMeta.toFixed(0)}% da meta)</div>
                    <div className="dcl-d" style={{ color: 'var(--dcl-gold)' }}>Projeção IA: {fmtBRLCompact(projection)}</div>
                </div>
                <div className="dcl-s" style={{ marginLeft: 'auto' }}>
                    <div className="dcl-chart-legend" style={{ marginTop: 16 }}>
                        <span><span className="dcl-sw" style={{ background: 'var(--dcl-gold)' }} />Meta</span>
                        <span><span className="dcl-sw" style={{ background: '#6a8fd4' }} />VGV</span>
                        <span><span className="dcl-sw" style={{ background: 'var(--dcl-ink-4)' }} />Ano anterior</span>
                    </div>
                </div>
            </div>
            <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 260, display: 'block' }}
                onMouseLeave={() => setHover(null)}
                onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * w;
                    const i = Math.round(((x - pad.l) / innerW) * (safe.length - 1));
                    if (i >= 0 && i < safe.length) setHover(i);
                }}>
                <defs>
                    <linearGradient id="dclGMeta" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#D4A85C" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#D4A85C" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="dclGVgv" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#6a8fd4" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#6a8fd4" stopOpacity="0" />
                    </linearGradient>
                </defs>
                {yTicks.map(t => (
                    <g key={t}>
                        <line x1={pad.l} x2={w - pad.r} y1={yFor(t)} y2={yFor(t)} style={{ stroke: 'var(--dcl-line)' }} strokeDasharray="2 4" />
                        <text x={pad.l - 10} y={yFor(t) + 3} fontSize="10" textAnchor="end" fontFamily="var(--font-mono), ui-monospace, monospace" style={{ fill: 'var(--dcl-ink-3)' }}>{t >= 1 ? t.toFixed(1) + 'M' : (t * 1000).toFixed(0) + 'k'}</text>
                    </g>
                ))}
                <path d={mkLine(prev)} fill="none" style={{ stroke: 'var(--dcl-ink-4)' }} strokeWidth="1.3" strokeDasharray="4 4" />
                <path d={mkArea(vgv)} fill="url(#dclGVgv)" />
                <path d={mkLine(vgv)} fill="none" stroke="#6a8fd4" strokeWidth="2" />
                <path d={mkArea(meta)} fill="url(#dclGMeta)" />
                <path d={mkLine(meta)} fill="none" stroke="#D4A85C" strokeWidth="2" />
                {safe.map((_, i) => (
                    <g key={i}>
                        <circle cx={xFor(i)} cy={yFor(meta[i])} r={hover === i ? 4.5 : 2.5} fill="#D4A85C" />
                        <circle cx={xFor(i)} cy={yFor(vgv[i])} r={hover === i ? 4 : 2.3} fill="#6a8fd4" />
                    </g>
                ))}
                {safe.map((p, i) => (
                    <text key={p.label + i} x={xFor(i)} y={h - 10} fontSize="11" textAnchor="middle" fontFamily="var(--font-mono), ui-monospace, monospace" style={{ fill: 'var(--dcl-ink-3)' }}>{p.label}</text>
                ))}
                {hover !== null && (
                    <g>
                        <line x1={xFor(hover)} x2={xFor(hover)} y1={pad.t} y2={pad.t + innerH} stroke="#D4A85C" strokeOpacity="0.35" strokeDasharray="2 3" />
                        <g transform={`translate(${Math.min(xFor(hover) + 12, w - 170)}, ${pad.t + 8})`}>
                            <rect width="156" height="68" rx="8" style={{ fill: 'var(--dcl-bg-card)', stroke: 'var(--dcl-line)' }} />
                            <text x="12" y="20" fontSize="10.5" style={{ fill: 'var(--dcl-ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{safe[hover].label}</text>
                            <circle cx="14" cy="37" r="3" fill="#D4A85C" />
                            <text x="24" y="40" fontSize="11" style={{ fill: 'var(--dcl-ink-2)' }}>Meta</text>
                            <text x="145" y="40" fontSize="11.5" textAnchor="end" fontFamily="var(--font-mono), ui-monospace, monospace" style={{ fill: 'var(--dcl-ink)' }}>{fmtBRLCompact(safe[hover].meta * 1_000_000)}</text>
                            <circle cx="14" cy="55" r="3" fill="#6a8fd4" />
                            <text x="24" y="58" fontSize="11" style={{ fill: 'var(--dcl-ink-2)' }}>VGV</text>
                            <text x="145" y="58" fontSize="11.5" textAnchor="end" fontFamily="var(--font-mono), ui-monospace, monospace" style={{ fill: 'var(--dcl-ink)' }}>{fmtBRLCompact(safe[hover].vgv * 1_000_000)}</text>
                        </g>
                    </g>
                )}
            </svg>
        </div>
    );
}

// ─── AI Insight ─────────────────────────────────────────────────────────────

function AIInsight({ ai }: { ai: DashboardProps['aiInsight'] }) {
    const pct = Math.max(0, Math.min(120, ai.pct));
    return (
        <div className="dcl-card dcl-ai-card dcl-col-4">
            <div className="dcl-ai-head">
                <div className="dcl-ai-mark"><Sparkles size={14} /></div>
                <div className="dcl-ai-title">Leitura <span className="dcl-serif">inteligente</span></div>
                <span className="dcl-pill dcl-warn" style={{ marginLeft: 'auto' }}>Beta</span>
            </div>
            <div className="dcl-ai-body">
                <p style={{ margin: '0 0 10px' }}>
                    Com o ritmo atual, projeção de fechar <span className="dcl-hl">{fmtBRLCompact(ai.projection)}</span> no período — <span className="dcl-hl" style={{ color: ai.pct >= 100 ? 'var(--dcl-green)' : 'var(--dcl-red)' }}>{ai.pct >= 100 ? '+' : ''}{(ai.pct - 100).toFixed(1)}% vs meta</span>.
                </p>
                <p style={{ margin: 0, color: 'var(--dcl-ink-3)', fontSize: 12.5 }}>{ai.hint}</p>
            </div>
            <div className="dcl-ai-prog">
                <div>
                    <div className="dcl-ai-prog-label dcl-mono" style={{ marginBottom: 6 }}>Projeção · {Math.round(pct)}% da meta</div>
                    <div style={{ position: 'relative', height: 8, borderRadius: 99, background: 'var(--dcl-bg-card-2)', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, pct)}%`, background: 'linear-gradient(90deg,#6a8fd4,#D4A85C)', borderRadius: 99 }} />
                        <div style={{ position: 'absolute', left: '100%', top: -4, bottom: -4, width: 1, background: 'var(--dcl-green)', transform: 'translateX(-1px)' }} />
                    </div>
                </div>
            </div>
            <div className="dcl-ai-chips">
                <Link href="/leads" className="dcl-ai-chip">Ver leads sugeridos</Link>
                <Link href="/leiloes" className="dcl-ai-chip">Simular cenário</Link>
            </div>
        </div>
    );
}

// ─── Agenda ─────────────────────────────────────────────────────────────────

function Agenda({ rows }: { rows: ProximoLeilaoRow[] }) {
    return (
        <div className="dcl-card dcl-col-8">
            <div className="dcl-card-head">
                <div>
                    <h3>Próximos leilões</h3>
                    <span className="dcl-sub">Preview dos {rows.length} próximos eventos</span>
                </div>
                <div className="dcl-row">
                    <Link href="/leiloes" className="dcl-link-btn"><Filter size={13} /> Filtrar</Link>
                    <Link href="/leiloes" className="dcl-link-btn">Ver agenda completa <ArrowRight size={13} /></Link>
                </div>
            </div>
            {rows.length === 0 ? (
                <div style={{ color: 'var(--dcl-ink-3)', fontSize: 13, padding: '18px 0' }}>Nenhum leilão agendado.</div>
            ) : rows.map((r, i) => (
                <Link href={`/leiloes/${r.id}`} key={r.id + i} className="dcl-agenda-row">
                    <div className="dcl-agenda-date"><div className="dcl-d">{r.d}</div><div className="dcl-m">{r.m}</div></div>
                    <div>
                        <div className="dcl-agenda-title">
                            {r.title}
                            {i === 0 && <span className="dcl-pill dcl-warn" style={{ marginLeft: 10, verticalAlign: 2 }}>PRÓXIMO</span>}
                        </div>
                        <div className="dcl-agenda-meta">
                            <span>{r.type || '—'}</span>
                            <span className="dcl-dot" />
                            <span className="dcl-mono">{fmtNum(r.animais)} animais</span>
                            {r.expectativaLabel && (<><span className="dcl-dot" /><span>{r.expectativaLabel}</span></>)}
                        </div>
                    </div>
                    <div className="dcl-agenda-bars">
                        <div style={{ textAlign: 'right' }}>
                            <div className="dcl-mono" style={{ fontSize: 11, color: 'var(--dcl-ink-2)' }}>{r.pct}%</div>
                            <div className="dcl-bar-mini" style={{ marginTop: 4 }}><span style={{ width: r.pct + '%' }} /></div>
                        </div>
                        <span className={`dcl-pill dcl-${r.status}`}>{r.statusLabel}</span>
                    </div>
                </Link>
            ))}
        </div>
    );
}

// ─── Funnel ─────────────────────────────────────────────────────────────────

function Funnel({ steps, totalConv }: { steps: FunnelStep[]; totalConv: number }) {
    return (
        <div className="dcl-card dcl-col-4">
            <div className="dcl-card-head">
                <div>
                    <h3>Funil de leads</h3>
                    <span className="dcl-sub">Últimos leads · conversão {totalConv.toFixed(1)}%</span>
                </div>
                <Link href="/crm" className="dcl-link-btn"><ArrowRight size={14} /></Link>
            </div>
            <div className="dcl-funnel">
                {steps.length === 0 ? (
                    <div style={{ color: 'var(--dcl-ink-3)', fontSize: 13 }}>Sem dados de leads.</div>
                ) : steps.map((s, i) => (
                    <div key={s.label}>
                        <div className="dcl-funnel-step">
                            <div className="dcl-fn-label"><span>{s.label}</span></div>
                            <div><span className="dcl-fn-label"><span className="dcl-cnt dcl-mono">{fmtNum(s.n)}</span></span></div>
                        </div>
                        <div className="dcl-fn-bar"><span style={{ width: Math.max(2, s.pct) + '%' }} /></div>
                        <div className="dcl-fn-foot">
                            <span className="dcl-fn-pct">{s.pct.toFixed(1)}%</span>
                            {i > 0 && (
                                <span className="dcl-fn-pct" style={{ color: 'var(--dcl-ink-4)' }}>
                                    ↓ {fmtNum(Math.max(0, steps[i - 1].n - s.n))}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Activity Feed ──────────────────────────────────────────────────────────

function ActivityFeed({ items, href = '/leads' }: { items: FeedItem[]; href?: string }) {
    const kindToDot: Record<FeedItem['kind'], { cls: string; icon: React.ReactNode }> = {
        lead: { cls: 'dcl-b', icon: <PhoneCall size={11} /> },
        wpp: { cls: 'dcl-g', icon: <MessageSquare size={11} /> },
        fechamento: { cls: 'dcl-a', icon: <Gavel size={11} /> },
        task: { cls: 'dcl-v', icon: <ListTodo size={11} /> },
        ai: { cls: 'dcl-v', icon: <Sparkles size={11} /> },
    };
    return (
        <div className="dcl-card dcl-col-8">
            <div className="dcl-card-head">
                <div>
                    <h3>Atividade recente</h3>
                    <span className="dcl-sub">
                        <span className="dcl-status-pill" style={{ padding: '2px 8px', fontSize: 10.5 }}>
                            <span className="dcl-ping" />em tempo real
                        </span>
                    </span>
                </div>
                <Link href={href} className="dcl-link-btn">Ver tudo <ArrowRight size={13} /></Link>
            </div>
            <div className="dcl-feed">
                {items.length === 0 ? (
                    <div style={{ color: 'var(--dcl-ink-3)', fontSize: 13, padding: '10px 0' }}>Nenhuma atividade recente.</div>
                ) : items.map((f) => {
                    const dot = kindToDot[f.kind];
                    return (
                        <div key={f.id} className="dcl-feed-item">
                            <div className={`dcl-feed-dot ${dot.cls}`}>{dot.icon}</div>
                            <div className="dcl-feed-text" dangerouslySetInnerHTML={{ __html: f.text }} />
                            <div className="dcl-feed-time">{f.when}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Performance ────────────────────────────────────────────────────────────

function Performance({ p }: { p: PerformanceData }) {
    const conv = Math.max(0, Math.min(100, p.taxaConversao));
    const stats: { label: string; value: string }[] = [
        { label: 'Animais vendidos', value: fmtNum(p.animaisVendidos) },
        { label: 'Compradores únicos', value: fmtNum(p.compradoresUnicos) },
        { label: 'Estados alcançados', value: fmtNum(p.estadosUnicos) },
        { label: 'Maior lance', value: fmtBRLCompact(p.maiorLance) },
    ];
    return (
        <div className="dcl-card dcl-col-4">
            <div className="dcl-card-head">
                <div>
                    <h3>Performance</h3>
                    <span className="dcl-sub">Histórico de fechamentos</span>
                </div>
                <BarChart3 size={14} style={{ color: 'var(--dcl-gold)' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
                <div className="dcl-mono" style={{ fontSize: 11, color: 'var(--dcl-ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Conversão de lotes
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <div className="dcl-mono" style={{ fontSize: 22, color: 'var(--dcl-ink)', fontWeight: 500 }}>{conv.toFixed(1)}%</div>
                    <div style={{ fontSize: 11, color: 'var(--dcl-ink-3)' }}>{fmtNum(p.lotesVendidos)} de {fmtNum(p.lotesOfertados)} lotes</div>
                </div>
                <div style={{ position: 'relative', height: 6, borderRadius: 99, background: 'var(--dcl-bg-card-2)', overflow: 'hidden', marginTop: 8 }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${conv}%`, background: 'linear-gradient(90deg,#6a8fd4,#D4A85C)', borderRadius: 99 }} />
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {stats.map(s => (
                    <div key={s.label} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--dcl-bg-card-2)', border: '1px solid var(--dcl-line)' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--dcl-ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</div>
                        <div className="dcl-mono" style={{ fontSize: 14, color: 'var(--dcl-ink)' }}>{s.value}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Regions ────────────────────────────────────────────────────────────────

function RegionPanel({ regions }: { regions: RegionItem[] }) {
    const max = Math.max(...regions.map(r => r.vgv), 1);
    return (
        <div className="dcl-card dcl-col-4">
            <div className="dcl-card-head">
                <div>
                    <h3>Compradores por estado</h3>
                    <span className="dcl-sub">VGV total realizado por UF</span>
                </div>
                <Link href="/leiloes/fechamento" className="dcl-link-btn"><MapPin size={14} /></Link>
            </div>
            {regions.length === 0 ? (
                <div style={{ color: 'var(--dcl-ink-3)', fontSize: 13 }}>Sem dados regionais.</div>
            ) : regions.slice(0, 8).map(r => {
                const pct = (r.vgv / max) * 100;
                return (
                    <div key={r.uf} className="dcl-region-row">
                        <div className="dcl-n">{r.estado || r.uf}</div>
                        <div className="dcl-bar"><span style={{ width: pct + '%' }} /></div>
                        <div className="dcl-v">{fmtBRLCompact(r.vgv)}</div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Rankings (extras) ─────────────────────────────────────────────────────

function RankLeiloes({ rows }: { rows: LeilaoTopItem[] }) {
    const fmtShortDate = (iso: string) => {
        if (!iso) return '';
        const [, m, d] = iso.split('-').map(Number);
        if (!m || !d) return '';
        return `${String(d).padStart(2, '0')}/${MONTH_ABBR[m - 1]}`;
    };
    return (
        <div className="dcl-card dcl-col-4">
            <div className="dcl-card-head">
                <div>
                    <h3>Top leilões realizados</h3>
                    <span className="dcl-sub">Maiores VGV no histórico de fechamentos</span>
                </div>
                <Trophy size={14} style={{ color: 'var(--dcl-gold)' }} />
            </div>
            {rows.length === 0 ? <div style={{ color: 'var(--dcl-ink-3)', fontSize: 13 }}>Sem dados.</div> : rows.map((r, i) => (
                <div key={r.nome + i} className="dcl-rank-row">
                    <div className={`dcl-rank-pos${i > 2 ? ' dcl-mut' : ''}`}>{i + 1}</div>
                    <div>
                        <div className="dcl-rank-name">{r.nome}</div>
                        <div className="dcl-rank-meta">
                            {r.data && <span>{fmtShortDate(r.data)}</span>}
                            {r.data && <span className="dcl-dot" style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--dcl-ink-4)' }} />}
                            <span>{fmtNum(r.lotesVendidos)} lotes · {fmtNum(r.animais)} animais</span>
                        </div>
                    </div>
                    <div>
                        <div className="dcl-rank-v">{fmtBRLCompact(r.vgv)}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function RankCompradores({ rows }: { rows: CompradorItem[] }) {
    return (
        <div className="dcl-card dcl-col-4">
            <div className="dcl-card-head">
                <div>
                    <h3>Top compradores</h3>
                    <span className="dcl-sub">Fazendas com maior VGV</span>
                </div>
                <Users size={14} style={{ color: 'var(--dcl-gold)' }} />
            </div>
            {rows.length === 0 ? <div style={{ color: 'var(--dcl-ink-3)', fontSize: 13 }}>Sem dados.</div> : rows.map((r, i) => (
                <div key={r.fazenda + i} className="dcl-rank-row">
                    <div className={`dcl-rank-pos${i > 2 ? ' dcl-mut' : ''}`}>{i + 1}</div>
                    <div>
                        <div className="dcl-rank-name">{r.fazenda}</div>
                        <div className="dcl-rank-meta">
                            {r.uf && <span>{r.uf}</span>}
                            {r.uf && <span className="dcl-dot" style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--dcl-ink-4)' }} />}
                            <span>{fmtNum(r.lotes)} lotes</span>
                        </div>
                    </div>
                    <div>
                        <div className="dcl-rank-v">{fmtBRLCompact(r.vgv)}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function RankLances({ rows }: { rows: LanceItem[] }) {
    return (
        <div className="dcl-card dcl-col-4">
            <div className="dcl-card-head">
                <div>
                    <h3>Maiores lances</h3>
                    <span className="dcl-sub">Arrematações de destaque</span>
                </div>
                <Medal size={14} style={{ color: 'var(--dcl-gold)' }} />
            </div>
            {rows.length === 0 ? <div style={{ color: 'var(--dcl-ink-3)', fontSize: 13 }}>Sem dados.</div> : rows.map((r, i) => (
                <div key={r.lote + i} className="dcl-rank-row">
                    <div className={`dcl-rank-pos${i > 2 ? ' dcl-mut' : ''}`}>{i + 1}</div>
                    <div>
                        <div className="dcl-rank-name">Lote {r.lote} · {r.fazenda}</div>
                        <div className="dcl-rank-meta">
                            <span>{r.leilao}</span>
                            {r.uf && <><span className="dcl-dot" style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--dcl-ink-4)' }} /><span>{r.uf}</span></>}
                        </div>
                    </div>
                    <div>
                        <div className="dcl-rank-v">{fmtBRLCompact(r.vgv)}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Produtos & Reservas (operação Fórmula do Boi) ──────────────────────────

function ProdutosPanel({ items, total }: { items: CatCount[]; total: number }) {
    const max = Math.max(...items.map(i => i.count), 1);
    return (
        <div className="dcl-card dcl-col-6">
            <div className="dcl-card-head">
                <div>
                    <h3>Catálogo de produtos</h3>
                    <span className="dcl-sub">{fmtNum(total)} cards · distribuição por categoria</span>
                </div>
                <Link href="/products" className="dcl-link-btn"><Dna size={14} /></Link>
            </div>
            {items.length === 0 ? (
                <div style={{ color: 'var(--dcl-ink-3)', fontSize: 13, padding: '18px 0' }}>Nenhum produto cadastrado.</div>
            ) : items.map(it => {
                const pct = (it.count / max) * 100;
                return (
                    <div key={it.label} className="dcl-region-row">
                        <div className="dcl-n">{it.label}</div>
                        <div className="dcl-bar"><span style={{ width: pct + '%' }} /></div>
                        <div className="dcl-v">{fmtNum(it.count)}</div>
                    </div>
                );
            })}
        </div>
    );
}

function ReservasPanel({ items, total, valor }: { items: ReservaStatusItem[]; total: number; valor: number }) {
    const max = Math.max(...items.map(i => i.count), 1);
    return (
        <div className="dcl-card dcl-col-6">
            <div className="dcl-card-head">
                <div>
                    <h3>Reservas por etapa</h3>
                    <span className="dcl-sub">{fmtNum(total)} ativas · {fmtBRLCompact(valor)} em valor</span>
                </div>
                <Link href="/reservas" className="dcl-link-btn"><ArrowRight size={14} /></Link>
            </div>
            {items.length === 0 ? (
                <div style={{ color: 'var(--dcl-ink-3)', fontSize: 13, padding: '18px 0' }}>Nenhuma reserva ativa.</div>
            ) : items.map(it => {
                const pct = (it.count / max) * 100;
                return (
                    <div key={it.status} className="dcl-region-row">
                        <div className="dcl-n">{it.label}</div>
                        <div className="dcl-bar"><span style={{ width: pct + '%' }} /></div>
                        <div className="dcl-v">{fmtNum(it.count)}</div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Root ───────────────────────────────────────────────────────────────────

type OpView = 'bula' | 'formula';

export default function DashboardClient(props: DashboardProps) {
    // Operação visível: 'bula' (leilões — Bula × Fórmula do Boi) ou
    // 'formula' (produtos, reservas e CRM — só Fórmula do Boi).
    const [op, setOp] = useState<OpView>('bula');

    const totalMeta = useMemo(() => props.vgv.reduce((s, p) => s + p.meta, 0) * 1_000_000, [props.vgv]);
    const totalVgv = useMemo(() => props.vgv.reduce((s, p) => s + p.vgv, 0) * 1_000_000, [props.vgv]);
    const totalFunnel = props.funnel[0]?.n ?? 0;
    const totalClosed = props.funnel[props.funnel.length - 1]?.n ?? 0;
    const convRate = totalFunnel > 0 ? (totalClosed / totalFunnel) * 100 : 0;

    const k = props.kpi;
    const f = props.formula;
    const plural = (n: number) => (n === 1 ? '' : 's');

    const bulaKpis: KpiItem[] = [
        { label: 'Próx. leilões', val: String(k.upcomingCount), delta: `${k.confirmedCount} confirmado${plural(k.confirmedCount)}`, icon: <Gavel size={12} />, spark: k.metaSpark, color: KPI_GOLD, tone: 'gold', href: '/leiloes' },
        { label: 'Meta confirmada', val: fmtBRLCompact(k.totalMetaBula), delta: `${fmtNum(k.totalAnimaisUpcoming)} animais`, icon: <Target size={12} />, spark: k.metaSpark, color: KPI_GREEN, tone: 'green', href: '/leiloes' },
        { label: 'VGV fechado', val: fmtBRLCompact(k.totalVgvFechado), delta: `${k.totalFechamentos} fechamentos`, icon: <Trophy size={12} />, spark: k.vgvSpark, color: KPI_GOLD, tone: 'gold', href: '/leiloes/fechamento' },
        { label: 'Ticket médio', val: fmtBRLCompact(k.ticketMedio), delta: 'Por lote vendido', icon: <BarChart3 size={12} />, spark: k.vgvSpark, color: KPI_VIOLET, tone: 'violet', href: '/leiloes/fechamento' },
        { label: 'Fechamentos', val: String(k.totalFechamentos), delta: `${fmtNum(props.performance.animaisVendidos)} animais vendidos`, icon: <Medal size={12} />, spark: k.vgvSpark, color: KPI_BLUE, tone: 'blue', href: '/leiloes/fechamento' },
    ];

    const formulaKpis: KpiItem[] = [
        { label: 'Leads ativos', val: fmtNum(k.activeLeads), delta: `${k.hotLeads} quente${plural(k.hotLeads)}`, icon: <PhoneCall size={12} />, spark: k.leadsSpark, color: KPI_BLUE, tone: 'blue', href: '/leads' },
        { label: 'Total de leads', val: fmtNum(k.totalLeads), delta: 'No CRM', icon: <Users size={12} />, spark: k.leadsSpark, color: KPI_VIOLET, tone: 'violet', href: '/crm' },
        { label: 'Produtos', val: fmtNum(f.produtosTotal), delta: `${f.produtosByCategory.length} categoria${plural(f.produtosByCategory.length)}`, icon: <Dna size={12} />, spark: [], color: KPI_GOLD, tone: 'gold', href: '/products' },
        { label: 'Reservas ativas', val: fmtNum(f.reservasAtivas), delta: fmtBRLCompact(f.reservasValor), icon: <Package size={12} />, spark: [], color: KPI_GREEN, tone: 'green', href: '/reservas' },
        { label: 'Reservas novas', val: fmtNum(f.reservasNovas), delta: 'Aguardando contato', icon: <Package size={12} />, spark: [], color: KPI_GOLD, tone: 'gold', href: '/reservas' },
    ];

    const feedFechamento = props.feed.filter(i => i.kind === 'fechamento').slice(0, 7);
    const feedLeads = props.feed.filter(i => i.kind === 'lead').slice(0, 7);

    return (
        <div className="dcl-root">
            <div className="dcl-pagehead">
                <div>
                    <h1>Visão <span className="dcl-serif">geral</span></h1>
                    <div className="dcl-sub">{props.today}</div>
                </div>
                <div className="dcl-pagehead-right">
                    <div className="dcl-optoggle" role="tablist" aria-label="Operação">
                        <button
                            role="tab"
                            aria-selected={op === 'bula'}
                            className={op === 'bula' ? 'on' : ''}
                            onClick={() => setOp('bula')}
                        >
                            Bula × Fórmula do Boi
                        </button>
                        <button
                            role="tab"
                            aria-selected={op === 'formula'}
                            className={op === 'formula' ? 'on' : ''}
                            onClick={() => setOp('formula')}
                        >
                            Fórmula do Boi
                        </button>
                    </div>
                    <div className="dcl-status-pill"><span className="dcl-ping" /> Sistema ativo</div>
                </div>
            </div>

            {op === 'bula' ? (
                <>
                    <Hero data={props.proximo} />
                    <KPIs items={bulaKpis} />

                    <div className="dcl-bento">
                        <VGVChart data={props.vgv} totalMeta={totalMeta || props.kpi.totalMetaBula} totalVgv={totalVgv || props.kpi.totalVgvFechado} projection={props.aiInsight.projection} />
                        <AIInsight ai={props.aiInsight} />
                    </div>

                    <div className="dcl-bento">
                        <Agenda rows={props.upcoming} />
                        <Performance p={props.performance} />
                    </div>

                    <div className="dcl-bento">
                        <ActivityFeed items={feedFechamento} href="/leiloes/fechamento" />
                        <RegionPanel regions={props.regions} />
                    </div>

                    <div className="dcl-bento">
                        <RankLeiloes rows={props.rankings.topLeiloes} />
                        <RankCompradores rows={props.rankings.compradores} />
                        <RankLances rows={props.rankings.lances} />
                    </div>
                </>
            ) : (
                <>
                    <KPIs items={formulaKpis} />

                    <div className="dcl-bento">
                        <Funnel steps={props.funnel} totalConv={convRate} />
                        <ActivityFeed items={feedLeads} href="/leads" />
                    </div>

                    <div className="dcl-bento">
                        <ProdutosPanel items={f.produtosByCategory} total={f.produtosTotal} />
                        <ReservasPanel items={f.reservasByStatus} total={f.reservasAtivas} valor={f.reservasValor} />
                    </div>
                </>
            )}
        </div>
    );
}
