'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    AlertCircle,
    BarChart3,
    Bot,
    CheckCircle2,
    Clock,
    Cloud,
    ExternalLink,
    FileText,
    Inbox,
    Loader2,
    Megaphone,
    MessageCircle,
    MessageSquareText,
    RefreshCw,
    Save,
    Send,
    ShieldCheck,
    Smartphone,
    UserCheck,
    Workflow,
    XCircle,
} from 'lucide-react';
import { InboxTab } from '@/components/admin/central-whatsapp/InboxTab';
import { MetricsTab } from '@/components/admin/central-whatsapp/MetricsTab';
import type { Template } from '@/components/admin/central-whatsapp/types';

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

type WelcomeConfig = {
    enabled: boolean;
    message: string;
};

type ConciergeConfig = {
    enabled: boolean;
    model: string;
    persona: string;
    thinkingSeconds: number;
    handoffContact: string;
    notifyGroupId: string;
    api_configured?: boolean;
    default_model?: string;
    default_persona?: string;
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

    // Mensagem automática de boas-vindas (editável aqui).
    const [welcome, setWelcome] = useState<WelcomeConfig | null>(null);
    const [welcomeSaving, setWelcomeSaving] = useState(false);
    const [welcomeSavedAt, setWelcomeSavedAt] = useState<number | null>(null);
    const [welcomeError, setWelcomeError] = useState<string | null>(null);

    // Atendimento automático por IA (concierge de qualificação).
    const [concierge, setConcierge] = useState<ConciergeConfig | null>(null);
    const [conciergeSaving, setConciergeSaving] = useState(false);
    const [conciergeSavedAt, setConciergeSavedAt] = useState<number | null>(null);
    const [conciergeError, setConciergeError] = useState<string | null>(null);

    // Operação de conversas: sub-view (conversas/status) e canal selecionado.
    const [view, setView] = useState<'conversas' | 'status' | 'metricas'>('conversas');
    const [channel, setChannel] = useState<'oficial' | 'baileys'>('oficial');
    const [templates, setTemplates] = useState<Template[]>([]);

    // Conectar por número de telefone (alternativa ao QR).
    const [pairPhoneInput, setPairPhoneInput] = useState('');
    const [pairing, setPairing] = useState(false);
    const [pairCode, setPairCode] = useState<string | null>(null);
    const [pairError, setPairError] = useState<string | null>(null);

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

    const fetchWelcome = useCallback(async () => {
        try {
            const res = await fetch('/api/whatsapp/crm-welcome', { cache: 'no-store' });
            if (res.ok) setWelcome(await res.json());
        } catch {
            // mantém vazio; o card mostra carregando
        }
    }, []);

    const fetchConcierge = useCallback(async () => {
        try {
            const res = await fetch('/api/whatsapp/concierge', { cache: 'no-store' });
            if (res.ok) setConcierge(await res.json());
        } catch {
            // mantém vazio
        }
    }, []);

    const refreshAll = useCallback(() => {
        void fetchCockpit();
        void fetchActivity();
    }, [fetchCockpit, fetchActivity]);

    useEffect(() => {
        refreshAll();
        void fetchWelcome();
        void fetchConcierge();
        const t1 = setInterval(fetchCockpit, 6000);
        const t2 = setInterval(fetchActivity, 15000);
        return () => { clearInterval(t1); clearInterval(t2); };
    }, [fetchCockpit, fetchActivity, fetchWelcome, fetchConcierge, refreshAll]);

    // Templates (para o inbox, incluindo os aprovados pela Meta).
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/whatsapp/central/templates');
                if (!res.ok || cancelled) return;
                const data = await res.json();
                if (!cancelled) setTemplates(data.templates ?? []);
            } catch { /* silencioso — inbox funciona sem templates */ }
        })();
        return () => { cancelled = true; };
    }, []);

    const requestPairing = useCallback(async () => {
        setPairing(true);
        setPairError(null);
        setPairCode(null);
        try {
            const res = await fetch('/api/whatsapp/pair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: pairPhoneInput }),
            });
            const data = await res.json().catch(() => ({}));
            if (data.pairing_code) {
                setPairCode(data.pairing_code as string);
            } else if (!res.ok) {
                throw new Error(data.error || data.message || `Erro ${res.status}`);
            } else {
                setPairError(data.message || 'Código sendo gerado — tente de novo em alguns segundos.');
            }
        } catch (e) {
            setPairError(e instanceof Error ? e.message : 'Falha ao gerar código.');
        } finally {
            setPairing(false);
        }
    }, [pairPhoneInput]);

    const saveWelcome = useCallback(async (next: WelcomeConfig) => {
        setWelcomeSaving(true);
        setWelcomeError(null);
        try {
            const res = await fetch('/api/whatsapp/crm-welcome', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(next),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Erro ${res.status}`);
            }
            setWelcome(await res.json());
            setWelcomeSavedAt(Date.now());
        } catch (e) {
            setWelcomeError(e instanceof Error ? e.message : 'Falha ao salvar.');
        } finally {
            setWelcomeSaving(false);
        }
    }, []);

    const saveConcierge = useCallback(async (next: { enabled: boolean; model: string; persona: string; thinkingSeconds: number; handoffContact: string; notifyGroupId: string }) => {
        setConciergeSaving(true);
        setConciergeError(null);
        try {
            const res = await fetch('/api/whatsapp/concierge', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(next),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Erro ${res.status}`);
            }
            const saved = await res.json();
            setConcierge(prev => ({ ...(prev ?? {} as ConciergeConfig), ...saved }));
            setConciergeSavedAt(Date.now());
        } catch (e) {
            setConciergeError(e instanceof Error ? e.message : 'Falha ao salvar.');
        } finally {
            setConciergeSaving(false);
        }
    }, []);

    const b = cockpit?.baileys;
    const c = cockpit?.cloud;
    const g = cockpit?.guardrails;
    const total24h = activity
        ? activity.counters_24h.sent + activity.counters_24h.queued + activity.counters_24h.failed
        : 0;

    return (
        <div className={view === 'conversas' ? 'space-y-4 pb-8' : 'max-w-5xl mx-auto space-y-5 pb-8'}>
            {/* Sub-navegação (Conversas / Status) + seletor de canal */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-lg border p-0.5 bg-muted/40 text-sm">
                    <button
                        type="button"
                        onClick={() => setView('conversas')}
                        className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
                            view === 'conversas' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <MessageCircle size={14} /> Conversas
                    </button>
                    <button
                        type="button"
                        onClick={() => setView('status')}
                        className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
                            view === 'status' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <ShieldCheck size={14} /> Status<span className="hidden sm:inline">&nbsp;&amp; configuração</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setView('metricas')}
                        className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
                            view === 'metricas' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <BarChart3 size={14} /> Métricas
                    </button>
                </div>

                {view === 'conversas' ? (
                    <div className="inline-flex rounded-lg border p-0.5 bg-muted/40 text-sm">
                        <button
                            type="button"
                            onClick={() => setChannel('oficial')}
                            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
                                channel === 'oficial' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium' : 'text-muted-foreground hover:text-foreground'
                            }`}
                            title="Enviar pela API oficial da Meta (regras de janela de 24h e templates aprovados)"
                        >
                            <Cloud size={14} /> API oficial
                        </button>
                        <button
                            type="button"
                            onClick={() => setChannel('baileys')}
                            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
                                channel === 'baileys' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground hover:text-foreground'
                            }`}
                            title="Enviar pelo número conectado via Baileys (texto livre, sem janela de 24h)"
                        >
                            <Smartphone size={14} /> Baileys
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={refreshAll}
                        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted"
                    >
                        <RefreshCw size={13} /> Atualizar
                    </button>
                )}
            </div>

            {view === 'conversas' && (
                <InboxTab templates={templates} channel={channel} />
            )}

            {view === 'metricas' && <MetricsTab />}

            {view === 'status' && (
            <div className="space-y-5">

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

                        {/* Conectar por número (alternativa ao QR) */}
                        {b && b.reachable && b.status !== 'connected' && (
                            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                                <p className="text-[11px] font-medium flex items-center gap-1.5">
                                    <Smartphone className="h-3 w-3" /> Conectar por número (sem QR)
                                </p>
                                {pairCode ? (
                                    <div className="space-y-1">
                                        <p className="text-[11px] text-muted-foreground">
                                            No WhatsApp <b>do número informado</b> (no aparelho dele): <b>Aparelhos conectados → Conectar com número de telefone</b> e digite:
                                        </p>
                                        <p className="text-2xl font-bold tracking-[0.25em] tabular-nums text-center select-all py-1">{pairCode}</p>
                                        <p className="text-[10px] text-muted-foreground text-center">Expira em ~3 min — digite logo, com WiFi estável. Se falhar, gere outro.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <input
                                                value={pairPhoneInput}
                                                onChange={(e) => setPairPhoneInput(e.target.value)}
                                                placeholder="DDD + número (ex: 67998894887)"
                                                inputMode="numeric"
                                                className="flex-1 rounded-md border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                                            />
                                            <button
                                                type="button"
                                                onClick={requestPairing}
                                                disabled={pairing || pairPhoneInput.replace(/\D/g, '').length < 10}
                                                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                                            >
                                                {pairing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />} Gerar código
                                            </button>
                                        </div>
                                        {pairError && <p className="text-[11px] text-red-500">{pairError}</p>}
                                    </>
                                )}
                            </div>
                        )}
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

            {/* Mensagem automática de boas-vindas */}
            <div className="bg-card text-card-foreground rounded-xl border overflow-hidden">
                <div className="px-5 py-3 border-b flex items-center justify-between gap-3">
                    <h3 className="font-semibold flex items-center gap-2 text-sm">
                        <MessageSquareText className="h-4 w-4" /> Mensagem automática de boas-vindas
                    </h3>
                    {welcome && (
                        <button
                            type="button"
                            onClick={() => saveWelcome({ enabled: !welcome.enabled, message: welcome.message })}
                            disabled={welcomeSaving}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition disabled:opacity-50 ${
                                welcome.enabled ? 'bg-green-500' : 'bg-muted'
                            }`}
                            aria-label={welcome.enabled ? 'Desativar' : 'Ativar'}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                                welcome.enabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`} />
                        </button>
                    )}
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-[11px] text-muted-foreground">
                        Disparada automaticamente pelo número conectado (Baileys) para <b>todo lead novo</b> que entra no CRM.
                        Use <code className="px-1 rounded bg-muted">{'{nome}'}</code> para inserir o primeiro nome do lead.
                        Cada número recebe no máximo uma vez por dia (anti-duplicidade).
                    </p>
                    {!welcome ? (
                        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                    ) : (
                        <>
                            <textarea
                                value={welcome.message}
                                onChange={(e) => setWelcome({ ...welcome, message: e.target.value })}
                                rows={14}
                                disabled={!welcome.enabled}
                                className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
                                placeholder="Olá, {nome}! Tudo bem?…"
                            />
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] min-h-[16px]">
                                    {welcomeError ? (
                                        <span className="text-red-500 flex items-center gap-1"><XCircle className="h-3 w-3" /> {welcomeError}</span>
                                    ) : welcomeSavedAt ? (
                                        <span className="text-green-500 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Salvo</span>
                                    ) : !welcome.enabled ? (
                                        <span className="text-amber-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Disparo desativado</span>
                                    ) : null}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => saveWelcome(welcome)}
                                    disabled={welcomeSaving}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                                >
                                    {welcomeSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                    Salvar mensagem
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Atendimento automático por IA (concierge) */}
            <div className="bg-card text-card-foreground rounded-xl border overflow-hidden">
                <div className="px-5 py-3 border-b flex items-center justify-between gap-3">
                    <h3 className="font-semibold flex items-center gap-2 text-sm">
                        <Bot className="h-4 w-4" /> Atendimento automático (IA)
                    </h3>
                    {concierge && (
                        <button
                            type="button"
                            onClick={() => saveConcierge({ enabled: !concierge.enabled, model: concierge.model, persona: concierge.persona, thinkingSeconds: concierge.thinkingSeconds, handoffContact: concierge.handoffContact, notifyGroupId: concierge.notifyGroupId ?? '' })}
                            disabled={conciergeSaving || (!concierge.enabled && !concierge.api_configured)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition disabled:opacity-50 ${
                                concierge.enabled ? 'bg-green-500' : 'bg-muted'
                            }`}
                            aria-label={concierge.enabled ? 'Desativar' : 'Ativar'}
                            title={!concierge.api_configured ? 'Configure OPENROUTER_API_KEY para ativar' : undefined}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                                concierge.enabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`} />
                        </button>
                    )}
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-[11px] text-muted-foreground">
                        Depois do template de abertura, a IA conduz a conversa de qualificação (intenção → interesse → habilitação),
                        pede e recebe os documentos, atualiza os campos do lead no CRM e, ao receber a documentação, marca
                        <b> Em análise cadastral</b> e passa para um humano. Responde sempre pela <b>API oficial</b> dentro da janela de 24h.
                    </p>
                    {!concierge ? (
                        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                    ) : (
                        <>
                            {!concierge.api_configured && (
                                <div className="flex items-start gap-2 text-xs rounded-md px-2.5 py-2 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                                    <span>Falta a variável <code>OPENROUTER_API_KEY</code> no ambiente. Sem ela a IA fica desligada e o fluxo legado assume.</span>
                                </div>
                            )}
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Modelo (OpenRouter)</label>
                                <input
                                    value={concierge.model}
                                    onChange={(e) => setConcierge({ ...concierge, model: e.target.value })}
                                    placeholder={concierge.default_model || 'google/gemini-2.5-flash'}
                                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    Vazio = padrão (<code>{concierge.default_model || 'google/gemini-2.5-flash'}</code>). Ex.: <code>openai/gpt-4o-mini</code>, <code>deepseek/deepseek-chat</code>.
                                </p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Janela de resposta (segundos)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={18}
                                        value={concierge.thinkingSeconds}
                                        onChange={(e) => setConcierge({ ...concierge, thinkingSeconds: Math.max(0, Math.min(18, Number(e.target.value) || 0)) })}
                                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    />
                                    <p className="text-[10px] text-muted-foreground">Tempo que o bot espera antes de responder (agrupa mensagens em sequência). 0–18s.</p>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Contato humano (handoff)</label>
                                    <input
                                        value={concierge.handoffContact}
                                        onChange={(e) => setConcierge({ ...concierge, handoffContact: e.target.value })}
                                        placeholder="João Antônio — +55 67 9889-4887"
                                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    />
                                    <p className="text-[10px] text-muted-foreground">Repassado ao lead quando ele pede pra falar com uma pessoa.</p>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Grupo de avisos internos (Baileys)</label>
                                <input
                                    value={concierge.notifyGroupId ?? ''}
                                    onChange={(e) => setConcierge({ ...concierge, notifyGroupId: e.target.value })}
                                    placeholder="1203630XXXXXXXXX@g.us"
                                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    ID do grupo do WhatsApp da equipe que recebe os avisos das automações (habilitação completa,
                                    cadastro enviado às leiloeiras) pelo número conectado. Vazio = avisos desligados.
                                </p>
                            </div>
                            <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Como a IA move as etapas (regra fixa, auditável)</p>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    A etapa é decidida pelos <b>dados coletados</b>, nunca pelo &ldquo;feeling&rdquo; do modelo, e o lead <b>só avança</b>:
                                    respondeu → <b>CONEXÃO</b> · informou qualquer dado de qualificação → <b>QUALIFICAÇÃO</b> (dispara consulta de
                                    score/I.E. se houver CPF) · checklist de habilitação completo, ou interesse + I.E. + documento → <b>INFORMAÇÕES CAPTADAS</b>
                                    (avisa o grupo interno) · <b>CADASTRO</b> e aprovação são sempre decisão humana; ao aprovar, o cliente é criado e o
                                    cadastro segue por e-mail às leiloeiras. Cada movimentação fica registrada no lead com o motivo.
                                </p>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Instruções / persona (opcional)</label>
                                <textarea
                                    value={concierge.persona}
                                    onChange={(e) => setConcierge({ ...concierge, persona: e.target.value })}
                                    rows={8}
                                    placeholder={'Vazio = usa a persona padrão da Bula (voz do João, funil guiado por lacunas).'}
                                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] min-h-[16px]">
                                    {conciergeError ? (
                                        <span className="text-red-500 flex items-center gap-1"><XCircle className="h-3 w-3" /> {conciergeError}</span>
                                    ) : conciergeSavedAt ? (
                                        <span className="text-green-500 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Salvo</span>
                                    ) : !concierge.enabled ? (
                                        <span className="text-amber-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> IA desligada — fluxo legado ativo</span>
                                    ) : null}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => saveConcierge({ enabled: concierge.enabled, model: concierge.model, persona: concierge.persona, thinkingSeconds: concierge.thinkingSeconds, handoffContact: concierge.handoffContact, notifyGroupId: concierge.notifyGroupId ?? '' })}
                                    disabled={conciergeSaving}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                                >
                                    {conciergeSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                    Salvar
                                </button>
                            </div>
                        </>
                    )}
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
                    <span className="text-xs px-2 py-0.5 rounded-full border border-muted bg-muted text-muted-foreground">desativado</span>
                </div>
                <div className="px-6 pt-3 -mb-1">
                    <p className="text-[11px] text-muted-foreground">
                        Desativado por enquanto — apenas a mensagem de boas-vindas dispara para leads novos. Os números abaixo são histórico.
                    </p>
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
            )}
        </div>
    );
}
