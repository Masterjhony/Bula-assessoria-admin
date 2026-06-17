'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    AlertCircle,
    BarChart3,
    CheckCircle2,
    Clock,
    Cloud,
    ExternalLink,
    FileText,
    Inbox,
    Megaphone,
    MessageCircle,
    QrCode,
    RefreshCw,
    Send,
    ShieldCheck,
    Smartphone,
    UserCheck,
    Workflow,
    XCircle,
} from 'lucide-react';

type ActivityRow = {
    id: string;
    created_at: string;
    phone: string | null;
    name: string | null;
    body: string | null;
    status: string | null;
    lead_id: string | null;
};

type ActivityData = {
    counters_24h: { sent: number; queued: number; failed: number };
    recent: ActivityRow[];
    server: { reachable: boolean; status: string | null; queue_size: number | null; processing: boolean | null };
};

type CockpitData = {
    baileys: {
        reachable: boolean;
        status: string;
        qr: string | null;
        queue_size: number | null;
        processing: boolean | null;
        today: number;
        cap: number;
        warmup_active: boolean;
    };
    cloud: {
        configured: boolean;
        error: string | null;
        display_phone_number: string | null;
        verified_name: string | null;
        quality_rating: string | null;
        today: number;
        cap: number;
    };
    guardrails: {
        enabled: boolean;
        business_hours: { enabled: boolean; start: string; end: string; timezone: string };
        dedup_hours: number;
        baileys: { daily_cap: number; min_delay_ms: number; max_delay_ms: number; warmup_started_on: string | null };
        cloud: { daily_cap: number };
    };
};

const CENTRAL_LINKS: { tab: string; label: string; icon: typeof Inbox }[] = [
    { tab: 'inbox', label: 'Inbox', icon: Inbox },
    { tab: 'templates', label: 'Templates', icon: FileText },
    { tab: 'campanhas', label: 'Campanhas', icon: Megaphone },
    { tab: 'fluxo', label: 'Fluxo', icon: Workflow },
    { tab: 'metricas', label: 'Métricas', icon: BarChart3 },
];

function formatDateTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

function formatPhoneShort(phone: string | null): string {
    if (!phone) return '-';
    const d = phone.replace(/\D/g, '');
    if (d.length === 13 && d.startsWith('55')) return `${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
    if (d.length === 12 && d.startsWith('55')) return `${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
    return phone;
}

function statusLabel(s: string | null): string {
    if (s === 'sent') return 'enviado';
    if (s === 'queued') return 'fila';
    if (s === 'failed') return 'falhou';
    return s || '-';
}

function statusClass(s: string | null): string {
    if (s === 'sent') return 'border-green-500/30 bg-green-500/10 text-green-400';
    if (s === 'queued') return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
    if (s === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-400';
    return 'border-muted bg-muted text-muted-foreground';
}

function UsageBar({ today, cap }: { today: number; cap: number }) {
    const pct = cap > 0 ? Math.min(100, Math.round((today / cap) * 100)) : 0;
    const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500';
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Uso do dia</span>
                <span className="tabular-nums font-medium">{today} / {cap}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

function qualityClass(q: string | null): string {
    if (q === 'GREEN') return 'border-green-500/30 bg-green-500/10 text-green-400';
    if (q === 'YELLOW') return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
    if (q === 'RED') return 'border-red-500/30 bg-red-500/10 text-red-400';
    return 'border-muted bg-muted text-muted-foreground';
}

export function CRMWhatsappView() {
    const [cockpit, setCockpit] = useState<CockpitData | null>(null);
    const [activity, setActivity] = useState<ActivityData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activityLoading, setActivityLoading] = useState(true);

    const fetchCockpit = useCallback(async () => {
        try {
            const res = await fetch('/api/whatsapp/cockpit', { cache: 'no-store' });
            if (res.ok) setCockpit(await res.json());
        } catch {
            // mantém último estado conhecido
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchActivity = useCallback(async () => {
        try {
            const res = await fetch('/api/whatsapp/crm-assessor/activity', { cache: 'no-store' });
            if (res.ok) setActivity(await res.json());
        } catch {
            // card fica em estado vazio
        } finally {
            setActivityLoading(false);
        }
    }, []);

    const refreshAll = useCallback(() => {
        void fetchCockpit();
        void fetchActivity();
    }, [fetchCockpit, fetchActivity]);

    useEffect(() => {
        refreshAll();
        const t1 = setInterval(fetchCockpit, 6000);
        const t2 = setInterval(fetchActivity, 15000);
        return () => { clearInterval(t1); clearInterval(t2); };
    }, [fetchCockpit, fetchActivity, refreshAll]);

    const b = cockpit?.baileys;
    const c = cockpit?.cloud;
    const g = cockpit?.guardrails;
    const total24h = activity
        ? activity.counters_24h.sent + activity.counters_24h.queued + activity.counters_24h.failed
        : 0;

    return (
        <div className="max-w-5xl mx-auto space-y-5 pb-8">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    <MessageCircle size={14} />
                    <span>Cockpit de WhatsApp — saúde dos dois canais, guard rails e atalhos da Central.</span>
                </div>
                <button
                    type="button"
                    onClick={refreshAll}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted"
                >
                    <RefreshCw size={13} /> Atualizar
                </button>
            </div>

            {/* Dois canais lado a lado */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Baileys */}
                <div className="bg-card text-card-foreground rounded-xl border overflow-hidden">
                    <div className="px-5 py-3 border-b flex items-center justify-between">
                        <h3 className="font-semibold flex items-center gap-2 text-sm">
                            <Smartphone className="h-4 w-4" /> Baileys (VPS) — canal quente
                        </h3>
                        {b && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                b.status === 'connected' ? 'border-green-500/30 bg-green-500/10 text-green-400'
                                    : !b.reachable ? 'border-red-500/30 bg-red-500/10 text-red-400'
                                        : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                            }`}>
                                {!b.reachable ? 'servidor inacessível' : b.status === 'connected' ? 'conectado' : b.status === 'qr' ? 'aguardando QR' : b.status}
                            </span>
                        )}
                    </div>
                    <div className="p-5 space-y-4">
                        {loading && !cockpit ? (
                            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
                        ) : b?.status === 'qr' && b.qr ? (
                            <div className="flex flex-col items-center gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <div className="bg-white p-3 rounded-xl border"><img src={b.qr} alt="QR" className="w-44 h-44 object-contain" /></div>
                                <p className="text-[11px] text-muted-foreground text-center">Escaneie com o número que dispara as conversas do CRM.</p>
                            </div>
                        ) : b?.status === 'connected' ? (
                            <div className="flex items-center gap-2 text-sm">
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                                <span>Número conectado. Conversas 1:1 e encaminhamentos liberados.</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <AlertCircle className="h-5 w-5 text-amber-500" />
                                <span>{b?.reachable ? 'Conectando…' : 'Servidor WhatsApp fora do ar (religue o VPS).'}</span>
                            </div>
                        )}

                        {b && <UsageBar today={b.today} cap={b.cap} />}
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span>Fila: <b className="text-foreground tabular-nums">{b?.queue_size ?? '-'}</b></span>
                            {b?.warmup_active && (
                                <span className="inline-flex items-center gap-0.5 text-amber-500"><Clock className="h-3 w-3" /> aquecimento ativo</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Cloud */}
                <div className="bg-card text-card-foreground rounded-xl border overflow-hidden">
                    <div className="px-5 py-3 border-b flex items-center justify-between">
                        <h3 className="font-semibold flex items-center gap-2 text-sm">
                            <Cloud className="h-4 w-4" /> API oficial (Cloud) — massa
                        </h3>
                        {c && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                c.configured ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-muted bg-muted text-muted-foreground'
                            }`}>
                                {c.configured ? 'configurada' : 'não configurada'}
                            </span>
                        )}
                    </div>
                    <div className="p-5 space-y-4">
                        {loading && !cockpit ? (
                            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
                        ) : !c?.configured ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <AlertCircle className="h-5 w-5 text-amber-500" />
                                <span>Faltam as env vars <code>WHATSAPP_CLOUD_*</code>. Sem ela, massa cai pro Baileys.</span>
                            </div>
                        ) : c.error ? (
                            <div className="flex items-center gap-2 text-sm text-red-400">
                                <XCircle className="h-5 w-5" /><span className="break-words">{c.error}</span>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="font-medium">{c.display_phone_number || '—'}</span>
                                    {c.quality_rating && (
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${qualityClass(c.quality_rating)}`}>
                                            qualidade {c.quality_rating}
                                        </span>
                                    )}
                                </div>
                                {c.verified_name && <p className="text-[11px] text-muted-foreground">{c.verified_name}</p>}
                            </div>
                        )}

                        {c && <UsageBar today={c.today} cap={c.cap} />}
                    </div>
                </div>
            </div>

            {/* Guard rails */}
            <div className="bg-card text-card-foreground rounded-xl border px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold flex items-center gap-2 text-sm">
                        <ShieldCheck className="h-4 w-4" /> Guard rails anti-ban
                    </h3>
                    {g && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                            g.enabled ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'
                        }`}>
                            {g.enabled ? 'ativos' : 'desligados'}
                        </span>
                    )}
                </div>
                {g && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cap Baileys / dia</p>
                            <p className="font-semibold tabular-nums">{g.baileys.daily_cap}</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cap Cloud / dia</p>
                            <p className="font-semibold tabular-nums">{g.cloud.daily_cap}</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Jitter Baileys</p>
                            <p className="font-semibold tabular-nums">{(g.baileys.min_delay_ms / 1000).toFixed(0)}–{(g.baileys.max_delay_ms / 1000).toFixed(0)}s</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Horário</p>
                            <p className="font-semibold">
                                {g.business_hours.enabled ? `${g.business_hours.start}–${g.business_hours.end}` : 'sem restrição'}
                            </p>
                        </div>
                    </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-3">
                    Opt-out, dedup ({g?.dedup_hours ?? '—'}h) e cap diário travam massa; conversas 1:1 e encaminhamentos não são bloqueados.
                </p>
            </div>

            {/* Atalhos Central */}
            <div className="bg-card text-card-foreground rounded-xl border px-5 py-4">
                <h3 className="font-semibold flex items-center gap-2 text-sm mb-3">
                    <ExternalLink className="h-4 w-4" /> Central WhatsApp (edição profunda)
                </h3>
                <div className="flex flex-wrap gap-2">
                    {CENTRAL_LINKS.map(l => {
                        const Icon = l.icon;
                        return (
                            <a
                                key={l.tab}
                                href={`/sistema/whatsapp?tab=${l.tab}`}
                                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"
                            >
                                <Icon className="h-3.5 w-3.5" /> {l.label}
                            </a>
                        );
                    })}
                </div>
            </div>

            {/* Encaminhamento para assessor */}
            <div className="bg-card text-card-foreground rounded-xl border overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                        <UserCheck className="h-4 w-4" /> Encaminhamento para assessor
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full border border-green-500/40 bg-green-500/10 text-green-400">ativo</span>
                </div>
                <div className="px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="space-y-0.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Últimas 24h</p>
                        <p className="text-2xl font-bold tabular-nums">{total24h}</p>
                    </div>
                    <div className="space-y-0.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Enviados</p>
                        <p className="text-2xl font-bold tabular-nums text-green-400">{activity?.counters_24h.sent ?? 0}</p>
                    </div>
                    <div className="space-y-0.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Na fila</p>
                        <p className="text-2xl font-bold tabular-nums text-amber-400">{activity?.counters_24h.queued ?? 0}</p>
                    </div>
                    <div className="space-y-0.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Falhas</p>
                        <p className="text-2xl font-bold tabular-nums text-red-400">{activity?.counters_24h.failed ?? 0}</p>
                    </div>
                </div>
            </div>

            {/* Últimos encaminhamentos */}
            <div className="bg-card text-card-foreground rounded-xl border overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Send className="h-4 w-4" /> Últimos encaminhamentos
                    </h3>
                </div>
                {activityLoading && !activity ? (
                    <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" /></div>
                ) : !activity || activity.recent.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">Nenhum encaminhamento registrado.</div>
                ) : (
                    <ul className="divide-y max-h-[420px] overflow-y-auto">
                        {activity.recent.map(row => (
                            <li key={row.id} className="px-6 py-3 flex items-start gap-3 text-xs hover:bg-muted/30">
                                <div className="pt-0.5">
                                    {row.status === 'failed' ? <XCircle className="h-3.5 w-3.5 text-red-400" />
                                        : row.status === 'queued' ? <Clock className="h-3.5 w-3.5 text-amber-400" />
                                            : <Send className="h-3.5 w-3.5 text-green-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-muted-foreground tabular-nums">{formatDateTime(row.created_at)}</span>
                                        <span className={`px-1.5 py-0.5 rounded border text-[10px] ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
                                        <span className="text-muted-foreground font-mono">{formatPhoneShort(row.phone)}</span>
                                        {row.name && <span className="text-muted-foreground truncate">· {row.name}</span>}
                                    </div>
                                    <p className="text-muted-foreground mt-1 truncate">{row.body?.split('\n').find(Boolean) || 'Encaminhamento CRM'}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
