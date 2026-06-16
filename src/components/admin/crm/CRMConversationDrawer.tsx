'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    X, Send, Loader2, MessageCircle, ShieldCheck, AlertTriangle, CheckCircle2, Info, FileText,
} from 'lucide-react';

interface ThreadMsg {
    id: string;
    body: string | null;
    direction: 'inbound' | 'outbound';
    status: string;
    channel?: string | null;
    origin: string | null;
    created_at: string;
}

interface TemplateLite {
    id: string;
    title: string;
    meta_status: string;
    body: string;
}

interface Props {
    leadId: string | null;
    phone: string;
    name: string | null;
    onClose: () => void;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

function fmt(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function CRMConversationDrawer({ leadId, phone, name, onClose }: Props) {
    const [messages, setMessages] = useState<ThreadMsg[]>([]);
    const [loading, setLoading] = useState(true);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [notice, setNotice] = useState<{ type: 'ok' | 'err' | 'info'; msg: string } | null>(null);
    const [templates, setTemplates] = useState<TemplateLite[]>([]);
    const [showTemplates, setShowTemplates] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/whatsapp/central/thread/${encodeURIComponent(phone)}`, { cache: 'no-store' });
            if (res.ok) {
                const d = await res.json();
                setMessages(d.messages ?? []);
            }
        } finally {
            setLoading(false);
        }
    }, [phone]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const r = await fetch('/api/whatsapp/central/templates', { cache: 'no-store' });
            if (!r.ok || cancelled) return;
            const d = await r.json();
            if (!cancelled) {
                setTemplates((d.templates ?? []).map((t: { id: string; title: string; meta_status: string; body: string }) => ({
                    id: t.id, title: t.title, meta_status: t.meta_status, body: t.body,
                })));
            }
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, [messages]);

    // Janela de 24h: última inbound a menos de 24h mantém o canal Baileys aberto.
    const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound');
    const sessionOpen = lastInbound ? Date.now() - new Date(lastInbound.created_at).getTime() < WINDOW_MS : false;

    const send = useCallback(async (payload: Record<string, unknown>) => {
        setSending(true);
        setNotice(null);
        try {
            const res = await fetch('/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, leadId, name, origin: 'crm-card', ...payload }),
            });
            const d = await res.json().catch(() => ({}));
            if (res.ok && (d.status === 'sent' || d.status === 'queued')) {
                setText('');
                setShowTemplates(false);
                setNotice({ type: 'ok', msg: `Enviado via ${d.channel === 'cloud' ? 'API oficial' : 'Baileys'}.` });
                await load();
            } else if (d.status === 'held' && d.reason === 'outside_24h_needs_template') {
                setNotice({ type: 'info', msg: 'Fora da janela de 24h — escolha um template aprovado pela Meta para enviar pela API oficial.' });
                setShowTemplates(true);
            } else if (d.status === 'blocked' && d.reason === 'optout') {
                setNotice({ type: 'err', msg: 'Lead em opt-out — envio bloqueado por compliance.' });
            } else if (d.status === 'held' && d.reason === 'outside_business_hours') {
                setNotice({ type: 'err', msg: 'Fora do horário comercial configurado nos guard rails.' });
            } else {
                setNotice({ type: 'err', msg: d.error || d.reason || 'Falha ao enviar.' });
            }
        } catch {
            setNotice({ type: 'err', msg: 'Erro de rede ao enviar.' });
        } finally {
            setSending(false);
        }
    }, [phone, leadId, name, load]);

    return (
        <div className="fixed inset-0 z-[60] flex justify-end">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white dark:bg-[#141414] w-full max-w-md h-full flex flex-col border-l border-gray-200 dark:border-[#2A2A2A] shadow-2xl">
                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-200 dark:border-[#2A2A2A] flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                        <MessageCircle size={18} className="text-green-500 shrink-0" />
                        <div className="min-w-0">
                            <p className="font-semibold text-sm truncate dark:text-white">{name || phone}</p>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-gray-500 font-mono">{phone}</span>
                                {sessionOpen ? (
                                    <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider text-green-600 dark:text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                                        <ShieldCheck className="h-2.5 w-2.5" /> janela aberta
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                        <AlertTriangle className="h-2.5 w-2.5" /> fora das 24h
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-[#2e2e2e] rounded-full text-gray-500">
                        <X size={18} />
                    </button>
                </div>

                {/* Thread */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50 dark:bg-[#0e0e0e]">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#A68B4B]" size={22} /></div>
                    ) : messages.length === 0 ? (
                        <div className="text-center text-xs text-gray-400 py-10">Nenhuma mensagem ainda. Inicie a conversa abaixo.</div>
                    ) : (
                        messages.map(m => {
                            const out = m.direction === 'outbound';
                            const failed = m.status === 'failed' || m.status === 'held' || m.status === 'blocked';
                            return (
                                <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${
                                        out
                                            ? failed ? 'bg-red-500/15 text-red-700 dark:text-red-300' : 'bg-[#A68B4B]/20 text-gray-800 dark:text-gray-100'
                                            : 'bg-white dark:bg-[#1f1f1f] text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-[#333]'
                                    }`}>
                                        <p className="whitespace-pre-wrap break-words">{m.body || '(sem texto)'}</p>
                                        <div className="flex items-center gap-1 mt-1 opacity-60">
                                            <span className="text-[9px]">{fmt(m.created_at)}</span>
                                            {out && m.channel && <span className="text-[9px] uppercase">· {m.channel}</span>}
                                            {failed && <span className="text-[9px] uppercase font-bold">· {m.status}</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Notice */}
                {notice && (
                    <div className={`px-4 py-2 text-xs flex items-center gap-1.5 border-t ${
                        notice.type === 'ok' ? 'text-green-600 dark:text-green-400 border-green-500/20'
                            : notice.type === 'info' ? 'text-blue-600 dark:text-blue-400 border-blue-500/20'
                                : 'text-red-600 dark:text-red-400 border-red-500/20'
                    }`}>
                        {notice.type === 'ok' ? <CheckCircle2 size={13} /> : notice.type === 'info' ? <Info size={13} /> : <AlertTriangle size={13} />}
                        {notice.msg}
                    </div>
                )}

                {/* Template picker */}
                {showTemplates && (
                    <div className="border-t border-gray-200 dark:border-[#2A2A2A] max-h-48 overflow-y-auto bg-gray-50 dark:bg-[#0e0e0e]">
                        <div className="px-4 py-2 flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1">
                                <FileText size={12} /> Templates
                            </span>
                            <button onClick={() => setShowTemplates(false)} className="text-[11px] text-gray-400 hover:text-gray-600">fechar</button>
                        </div>
                        {templates.length === 0 ? (
                            <p className="px-4 pb-3 text-[11px] text-gray-400">Nenhum template cadastrado.</p>
                        ) : (
                            <div className="divide-y divide-gray-100 dark:divide-[#222]">
                                {templates.map(t => {
                                    const approved = t.meta_status === 'APPROVED';
                                    return (
                                        <button
                                            key={t.id}
                                            disabled={sending || (!sessionOpen && !approved)}
                                            onClick={() => send({ templateId: t.id })}
                                            className="w-full text-left px-4 py-2 hover:bg-white dark:hover:bg-[#1a1a1a] disabled:opacity-40 disabled:cursor-not-allowed"
                                            title={!sessionOpen && !approved ? 'Fora das 24h só templates aprovados pela Meta podem ser enviados' : ''}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{t.title}</span>
                                                {approved && (
                                                    <span className="text-[8px] uppercase tracking-wider text-green-600 dark:text-green-400 bg-green-500/10 px-1 py-0.5 rounded">aprovado</span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-gray-400 truncate">{t.body || '(sem texto)'}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Composer */}
                <div className="border-t border-gray-200 dark:border-[#2A2A2A] p-3">
                    <div className="flex items-end gap-2">
                        <textarea
                            value={text}
                            onChange={e => setText(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (text.trim() && !sending) void send({ text: text.trim() });
                                }
                            }}
                            rows={2}
                            placeholder={sessionOpen ? 'Mensagem (Enter envia)…' : 'Fora das 24h: use um template aprovado'}
                            className="flex-1 resize-none bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#333] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#A68B4B]"
                        />
                        <div className="flex flex-col gap-1">
                            <button
                                onClick={() => text.trim() && void send({ text: text.trim() })}
                                disabled={sending || !text.trim()}
                                className="p-2.5 rounded-xl bg-[#A68B4B] text-black hover:bg-[#C8A96E] disabled:opacity-40"
                                title="Enviar"
                            >
                                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            </button>
                            <button
                                onClick={() => setShowTemplates(s => !s)}
                                className="p-2.5 rounded-xl border border-gray-200 dark:border-[#333] text-gray-500 hover:bg-gray-100 dark:hover:bg-[#2e2e2e]"
                                title="Templates"
                            >
                                <FileText size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
