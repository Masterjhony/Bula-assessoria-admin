'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    Clock,
    MessageCircle,
    QrCode,
    RefreshCw,
    Send,
    UserCheck,
    XCircle,
} from 'lucide-react';
import type { WAStatus } from '@/components/admin/central-whatsapp/types';

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
    counters_24h: {
        sent: number;
        queued: number;
        failed: number;
    };
    recent: ActivityRow[];
    server: {
        reachable: boolean;
        status: string | null;
        queue_size: number | null;
        processing: boolean | null;
    };
};

function formatDateTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
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

function statusLabel(status: string | null): string {
    if (status === 'sent') return 'enviado';
    if (status === 'queued') return 'fila';
    if (status === 'failed') return 'falhou';
    return status || '-';
}

function statusClass(status: string | null): string {
    if (status === 'sent') return 'border-green-500/30 bg-green-500/10 text-green-400';
    if (status === 'queued') return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
    if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-400';
    return 'border-muted bg-muted text-muted-foreground';
}

export function CRMWhatsappView() {
    const [status, setStatus] = useState<WAStatus>('disconnected');
    const [qr, setQr] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [activity, setActivity] = useState<ActivityData | null>(null);
    const [activityLoading, setActivityLoading] = useState(true);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/whatsapp/status', { cache: 'no-store' });
            const data = await res.json();
            setStatus(data.status ?? 'disconnected');
            setQr(data.qr ?? null);
        } catch {
            setStatus('disconnected');
            setQr(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchActivity = useCallback(async () => {
        try {
            const res = await fetch('/api/whatsapp/crm-assessor/activity', { cache: 'no-store' });
            if (res.ok) setActivity(await res.json());
        } catch {
            // O card fica em estado vazio quando a telemetria nao carrega.
        } finally {
            setActivityLoading(false);
        }
    }, []);

    const refreshAll = useCallback(() => {
        setLoading(true);
        setActivityLoading(true);
        void fetchStatus();
        void fetchActivity();
    }, [fetchActivity, fetchStatus]);

    useEffect(() => {
        refreshAll();
        const statusTimer = setInterval(fetchStatus, 5000);
        const activityTimer = setInterval(fetchActivity, 15000);
        return () => {
            clearInterval(statusTimer);
            clearInterval(activityTimer);
        };
    }, [fetchActivity, fetchStatus, refreshAll]);

    const total24h = activity
        ? activity.counters_24h.sent + activity.counters_24h.queued + activity.counters_24h.failed
        : 0;

    return (
        <div className="max-w-5xl space-y-5 pb-8">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    <MessageCircle size={14} />
                    <span>WhatsApp do CRM para encaminhamento de leads aos usuários da equipe.</span>
                </div>
                <button
                    type="button"
                    onClick={refreshAll}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted"
                >
                    <RefreshCw size={13} />
                    Atualizar
                </button>
            </div>

            <div className="bg-card text-card-foreground rounded-xl border overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                        <QrCode className="h-4 w-4" />
                        Status de conexão
                    </h3>
                    {activity?.server.reachable === false && (
                        <span className="text-xs px-2 py-0.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-400">
                            servidor inacessível
                        </span>
                    )}
                </div>

                <div className="p-8 flex flex-col items-center justify-center min-h-[280px]">
                    {loading && (
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                    )}

                    {!loading && status === 'connected' && (
                        <div className="text-center space-y-3">
                            <CheckCircle2 className="h-14 w-14 text-green-600 mx-auto" />
                            <h4 className="text-xl font-bold">Número conectado</h4>
                            <p className="text-sm text-muted-foreground max-w-md">
                                Encaminhamentos para assessores liberados.
                            </p>
                        </div>
                    )}

                    {!loading && status === 'qr' && qr && (
                        <div className="space-y-4 flex flex-col items-center">
                            <div className="bg-white p-4 rounded-xl border shadow-sm">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={qr} alt="QR" className="w-60 h-60 object-contain" />
                            </div>
                            <div className="text-center max-w-sm">
                                <h4 className="font-bold mb-2">Escaneie o QR Code</h4>
                                <p className="text-xs text-muted-foreground">
                                    Use o número que vai enviar os encaminhamentos do CRM.
                                </p>
                            </div>
                        </div>
                    )}

                    {!loading && (status === 'disconnected' || status === 'connecting') && (
                        <div className="text-center space-y-3">
                            <div className="animate-pulse">
                                <AlertCircle className="h-14 w-14 text-amber-500 mx-auto" />
                            </div>
                            <h4 className="text-xl font-bold">
                                {status === 'connecting' ? 'Conectando...' : 'Desconectado'}
                            </h4>
                            <p className="text-sm text-muted-foreground max-w-md">
                                O QR Code aparece quando o servidor WhatsApp está rodando.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-card text-card-foreground rounded-xl border overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                        <UserCheck className="h-4 w-4" />
                        Encaminhamento para assessor
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full border border-green-500/40 bg-green-500/10 text-green-400">
                        ativo
                    </span>
                </div>
                <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
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

            <div className="bg-card text-card-foreground rounded-xl border overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Send className="h-4 w-4" />
                        Últimos encaminhamentos
                    </h3>
                </div>

                {activityLoading && !activity ? (
                    <div className="p-8 flex justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                    </div>
                ) : !activity || activity.recent.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                        Nenhum encaminhamento registrado.
                    </div>
                ) : (
                    <ul className="divide-y max-h-[420px] overflow-y-auto">
                        {activity.recent.map(row => (
                            <li key={row.id} className="px-6 py-3 flex items-start gap-3 text-xs hover:bg-muted/30">
                                <div className="pt-0.5">
                                    {row.status === 'failed' ? (
                                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                                    ) : row.status === 'queued' ? (
                                        <Clock className="h-3.5 w-3.5 text-amber-400" />
                                    ) : (
                                        <Send className="h-3.5 w-3.5 text-green-400" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-muted-foreground tabular-nums">
                                            {formatDateTime(row.created_at)}
                                        </span>
                                        <span className={`px-1.5 py-0.5 rounded border text-[10px] ${statusClass(row.status)}`}>
                                            {statusLabel(row.status)}
                                        </span>
                                        <span className="text-muted-foreground font-mono">
                                            {formatPhoneShort(row.phone)}
                                        </span>
                                        {row.name && (
                                            <span className="text-muted-foreground truncate">· {row.name}</span>
                                        )}
                                    </div>
                                    <p className="text-muted-foreground mt-1 truncate">
                                        {row.body?.split('\n').find(Boolean) || 'Encaminhamento CRM'}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
