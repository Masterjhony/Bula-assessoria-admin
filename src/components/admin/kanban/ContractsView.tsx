'use client';

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
    FileText, Plus, Search, Download, Trash2, X, Save,
    Calendar, DollarSign, User, AlertTriangle, CheckCircle,
    Clock, XCircle, Upload, ExternalLink, StickyNote,
    Grid3X3, List, Folder, FolderOpen, ChevronRight,
    Mail, Phone, IdCard, Send, RefreshCw, Ban, PenLine,
    PlugZap, CloudDownload, Wifi, WifiOff,
} from 'lucide-react';
import {
    Contract, ContractInput,
    createContract, updateContract, deleteContract,
    uploadContractFile, deleteContractFile,
    sendContractToClickSign, syncContractFromClickSign, cancelContractClickSign,
} from '@/app/sistema/actions/contracts';

const STATUS_CONFIG = {
    Ativo:     { label: 'Ativo',     color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500', icon: CheckCircle,   folderColor: 'text-emerald-500' },
    Pendente:  { label: 'Pendente',  color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',         dot: 'bg-amber-500',   icon: Clock,          folderColor: 'text-amber-500' },
    Vencido:   { label: 'Vencido',   color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',                 dot: 'bg-red-500',     icon: AlertTriangle,  folderColor: 'text-red-500' },
    Cancelado: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',               dot: 'bg-gray-400',    icon: XCircle,        folderColor: 'text-gray-400' },
};

const STATUSES = Object.keys(STATUS_CONFIG) as Contract['status'][];

const EMPTY_FORM: ContractInput = {
    client_name: '', title: '', status: 'Pendente',
    value: null, start_date: null, end_date: null,
    file_url: null, file_path: null, file_name: null, notes: null,
};

function formatCurrency(v?: number | null) {
    if (v == null) return '—';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(d?: string | null) {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
}

function daysUntil(d?: string | null): number | null {
    if (!d) return null;
    return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

type SignerDraft = {
    name: string;
    email: string;
    phone_number?: string;
    documentation?: string;
    auths: Array<'email' | 'whatsapp' | 'sms'>;
};

const EMPTY_SIGNER: SignerDraft = { name: '', email: '', phone_number: '', documentation: '', auths: ['email'] };

const CLICKSIGN_STATUS_LABEL: Record<string, { label: string; color: string }> = {
    running:     { label: 'Aguardando assinaturas', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    closed:      { label: 'Concluído',              color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    auto_closed: { label: 'Concluído (auto)',       color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    cancelled:   { label: 'Cancelado',              color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
    canceled:    { label: 'Cancelado',              color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
};

interface Props { initialContracts: Contract[]; }

export function ContractsView({ initialContracts }: Props) {
    const [contracts, setContracts] = useState<Contract[]>(initialContracts);
    const [search, setSearch] = useState('');
    const [currentFolder, setCurrentFolder] = useState<'all' | Contract['status']>('all');

    // ── ClickSign import modal & connection state ──
    const [csImportOpen, setCsImportOpen] = useState(false);
    const [csConn, setCsConn] = useState<{ ok: boolean | null; error?: string; hint?: string }>({ ok: null });
    const [csDocs, setCsDocs] = useState<Array<any>>([]);
    const [csLoadingDocs, setCsLoadingDocs] = useState(false);
    const [csImporting, setCsImporting] = useState<string | null>(null);

    const checkClickSign = useCallback(async () => {
        try {
            const r = await fetch('/api/clicksign/test', { cache: 'no-store' });
            const j = await r.json().catch(() => ({}));
            setCsConn(j.ok ? { ok: true } : { ok: false, error: j.error || `HTTP ${r.status}`, hint: j.hint });
        } catch (e: any) {
            setCsConn({ ok: false, error: e?.message || 'Falha de rede.' });
        }
    }, []);

    const loadClickSignDocs = useCallback(async () => {
        setCsLoadingDocs(true);
        try {
            const r = await fetch('/api/clicksign/documents?page=1', { cache: 'no-store' });
            const j = await r.json().catch(() => ({}));
            if (r.ok && Array.isArray(j.documents)) {
                setCsDocs(j.documents);
                setCsConn({ ok: true });
            } else {
                setCsDocs([]);
                setCsConn({ ok: false, error: j.error || `HTTP ${r.status}`, hint: j.hint });
            }
        } catch (e: any) {
            setCsConn({ ok: false, error: e?.message || 'Falha de rede.' });
        } finally { setCsLoadingDocs(false); }
    }, []);

    useEffect(() => { if (csConn.ok === null) void checkClickSign(); }, [csConn.ok, checkClickSign]);
    useEffect(() => { if (csImportOpen) void loadClickSignDocs(); }, [csImportOpen, loadClickSignDocs]);

    const importClickSignDoc = async (docKey: string) => {
        setCsImporting(docKey);
        try {
            const r = await fetch('/api/clicksign/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentKey: docKey }),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
            window.location.reload();
        } catch (err: any) {
            alert(`Erro ao importar: ${err.message}`);
        } finally { setCsImporting(null); }
    };
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Contract | null>(null);
    const [form, setForm] = useState<ContractInput>(EMPTY_FORM);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadedFile, setUploadedFile] = useState<{ url: string; path: string; name: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── ClickSign state ──
    const [signers, setSigners] = useState<SignerDraft[]>([{ ...EMPTY_SIGNER }]);
    const [csMessage, setCsMessage] = useState('');
    const [csDeadline, setCsDeadline] = useState('');
    const [csSequence, setCsSequence] = useState(false);
    const [isSendingCs, setIsSendingCs] = useState(false);
    const [isSyncingCs, setIsSyncingCs] = useState(false);
    const [isCancellingCs, setIsCancellingCs] = useState(false);

    const resetCsForm = () => {
        setSigners([{ ...EMPTY_SIGNER }]);
        setCsMessage('');
        setCsDeadline('');
        setCsSequence(false);
    };

    const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setUploadedFile(null); resetCsForm(); setModalOpen(true); };
    const openEdit = (c: Contract) => {
        setEditing(c);
        setForm({ client_name: c.client_name, title: c.title, status: c.status, value: c.value ?? null, start_date: c.start_date ?? null, end_date: c.end_date ?? null, file_url: c.file_url ?? null, file_path: c.file_path ?? null, file_name: c.file_name ?? null, notes: c.notes ?? null });
        setUploadedFile(c.file_url ? { url: c.file_url, path: c.file_path!, name: c.file_name! } : null);
        resetCsForm();
        setModalOpen(true);
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const result = await uploadContractFile(fd);
            setUploadedFile(result);
            setForm(f => ({ ...f, file_url: result.url, file_path: result.path, file_name: result.name }));
        } catch (err: any) { alert(`Erro no upload: ${err.message}`); }
        finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
    };

    const handleRemoveFile = async () => {
        if (!uploadedFile) return;
        await deleteContractFile(uploadedFile.path).catch(() => {});
        setUploadedFile(null);
        setForm(f => ({ ...f, file_url: null, file_path: null, file_name: null }));
    };

    const handleSave = async () => {
        if (!form.client_name.trim() || !form.title.trim()) return;
        setIsSaving(true);
        try {
            if (editing) {
                const updated = await updateContract(editing.id, form);
                setContracts(cs => cs.map(c => c.id === updated.id ? updated : c));
            } else {
                const created = await createContract(form);
                setContracts(cs => [created, ...cs]);
            }
            setModalOpen(false);
        } catch (err: any) { alert(`Erro ao salvar: ${err.message}`); }
        finally { setIsSaving(false); }
    };

    const handleDelete = async (id: string, clientName: string) => {
        if (!confirm(`Excluir contrato de "${clientName}"?`)) return;
        await deleteContract(id);
        setContracts(cs => cs.filter(c => c.id !== id));
    };

    // ── ClickSign handlers ──
    const handleSendClickSign = async () => {
        if (!editing) { alert('Salve o contrato antes de enviar para assinatura.'); return; }
        if (!editing.file_url) { alert('Anexe o PDF do contrato antes de enviar.'); return; }
        const cleaned = signers
            .map(s => ({
                ...s,
                name: s.name.trim(),
                email: s.email.trim(),
                phone_number: s.phone_number?.trim() || undefined,
                documentation: s.documentation?.trim() || undefined,
            }))
            .filter(s => s.name && s.email);
        if (!cleaned.length) { alert('Adicione pelo menos um signatário com nome e email.'); return; }

        setIsSendingCs(true);
        try {
            const updated = await sendContractToClickSign({
                contractId: editing.id,
                signers: cleaned,
                deadlineAt: csDeadline ? new Date(csDeadline + 'T23:59:59-03:00').toISOString() : undefined,
                message: csMessage.trim() || undefined,
                sequenceEnabled: csSequence,
            });
            setEditing(updated);
            setContracts(cs => cs.map(c => c.id === updated.id ? updated : c));
            alert('Contrato enviado para assinatura. Os signatários receberão um email do ClickSign.');
        } catch (err: any) {
            alert(`Erro ao enviar para ClickSign: ${err.message}`);
        } finally { setIsSendingCs(false); }
    };

    const handleSyncClickSign = async () => {
        if (!editing?.clicksign_document_key) return;
        setIsSyncingCs(true);
        try {
            const updated = await syncContractFromClickSign(editing.id);
            setEditing(updated);
            setContracts(cs => cs.map(c => c.id === updated.id ? updated : c));
        } catch (err: any) {
            alert(`Erro ao atualizar status: ${err.message}`);
        } finally { setIsSyncingCs(false); }
    };

    const handleCancelClickSign = async () => {
        if (!editing?.clicksign_document_key) return;
        if (!confirm('Cancelar este envio no ClickSign? Os signatários não poderão mais assinar.')) return;
        setIsCancellingCs(true);
        try {
            const updated = await cancelContractClickSign(editing.id);
            setEditing(updated);
            setContracts(cs => cs.map(c => c.id === updated.id ? updated : c));
        } catch (err: any) {
            alert(`Erro ao cancelar: ${err.message}`);
        } finally { setIsCancellingCs(false); }
    };

    const updateSigner = (i: number, patch: Partial<SignerDraft>) => {
        setSigners(ss => ss.map((s, idx) => idx === i ? { ...s, ...patch } : s));
    };
    const addSigner = () => setSigners(ss => [...ss, { ...EMPTY_SIGNER }]);
    const removeSigner = (i: number) => setSigners(ss => ss.length > 1 ? ss.filter((_, idx) => idx !== i) : ss);

    const counts = useMemo(() => {
        const total = contracts.length;
        const byStatus = Object.fromEntries(STATUSES.map(s => [s, contracts.filter(c => c.status === s).length]));
        const ativo = byStatus['Ativo'] ?? 0;
        const vencendo = contracts.filter(c => { const d = daysUntil(c.end_date); return d !== null && d >= 0 && d <= 30 && c.status === 'Ativo'; }).length;
        const valor = contracts.filter(c => c.status === 'Ativo').reduce((s, c) => s + (c.value || 0), 0);
        return { total, byStatus, ativo, vencendo, valor };
    }, [contracts]);

    const filtered = useMemo(() => {
        let result = currentFolder === 'all' ? contracts : contracts.filter(c => c.status === currentFolder);
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(c => c.client_name.toLowerCase().includes(q) || c.title.toLowerCase().includes(q));
        }
        return result;
    }, [contracts, currentFolder, search]);

    const isRoot = currentFolder === 'all' && !search.trim();
    const importedKeys = useMemo(
        () => new Set(contracts.map(c => c.clicksign_document_key).filter(Boolean) as string[]),
        [contracts],
    );

    return (
        <div className="flex flex-1 min-h-0 h-full gap-0 overflow-hidden rounded-2xl border border-[#E4C99E]/20 dark:border-[#E4C99E]/14 bg-white dark:bg-[#0D0D0D] shadow-sm">

            {/* ── Sidebar ── */}
            <aside className="w-56 shrink-0 flex flex-col bg-white dark:bg-[#141414] border-r border-[#E4C99E]/20 dark:border-[#E4C99E]/10">
                <div className="px-5 pt-6 pb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A68B4B]/70 dark:text-[#C8A96E]/60">Pastas</p>
                </div>

                <nav className="flex flex-col gap-0.5 px-2">
                    {/* Todos */}
                    <SidebarItem
                        active={currentFolder === 'all'}
                        icon={<Folder size={15} />}
                        label="Todos os Contratos"
                        count={counts.total}
                        onClick={() => { setCurrentFolder('all'); setSearch(''); }}
                    />
                    {STATUSES.map(status => {
                        const cfg = STATUS_CONFIG[status];
                        const StatusIcon = cfg.icon;
                        return (
                            <SidebarItem
                                key={status}
                                active={currentFolder === status}
                                icon={<StatusIcon size={14} className={currentFolder === status ? '' : cfg.folderColor} />}
                                label={status}
                                count={counts.byStatus[status] ?? 0}
                                onClick={() => { setCurrentFolder(status); setSearch(''); }}
                            />
                        );
                    })}
                </nav>

                {/* Bottom: valor + vencendo */}
                <div className="mt-auto mx-3 mb-4 mt-4 rounded-xl bg-gradient-to-br from-[#E4C99E]/[0.08] via-[#A68B4B]/[0.04] to-transparent border border-[#E4C99E]/20 dark:border-[#E4C99E]/12 p-4">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#A68B4B]/70 dark:text-[#C8A96E]/60 mb-1.5">Valor em Ativos</p>
                    <p className="text-lg font-bold bg-gradient-to-r from-[#E4C99E] via-[#C8A96E] to-[#A68B4B] bg-clip-text text-transparent leading-tight">
                        {formatCurrency(counts.valor)}
                    </p>
                    {counts.vencendo > 0 && (
                        <div className="mt-2.5 pt-2.5 border-t border-[#E4C99E]/15 flex items-center gap-1.5 text-[11px] text-amber-500">
                            <AlertTriangle size={11} />
                            <span>{counts.vencendo} vencendo em 30d</span>
                        </div>
                    )}
                </div>
            </aside>

            {/* ── Main ── */}
            <main className="flex-1 flex flex-col min-w-0 bg-gradient-to-b from-gray-50 to-white dark:from-[#0D0D0D] dark:to-[#1B1B1B]">

                {/* Toolbar */}
                <div className="flex items-center gap-3 px-6 py-4 bg-white/95 dark:bg-[#141414]/95 backdrop-blur border-b border-[#E4C99E]/14 shrink-0">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-[#9A928A] mr-2 shrink-0">
                        <span
                            className="hover:text-[#A68B4B] cursor-pointer transition-colors"
                            onClick={() => { setCurrentFolder('all'); setSearch(''); }}
                        >
                            Contratos
                        </span>
                        {currentFolder !== 'all' && (
                            <>
                                <ChevronRight size={13} className="text-[#A68B4B]/50" />
                                <span className="text-gray-900 dark:text-[#F5F5F5] font-semibold">{currentFolder}</span>
                            </>
                        )}
                    </div>

                    {/* Search */}
                    <div className="relative flex-1 min-w-0 max-w-xl">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#9A928A]" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por cliente ou título..."
                            className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-[#202020] border border-[#E4C99E]/14 rounded-xl outline-none focus:border-[#A68B4B]/40 focus:ring-2 focus:ring-[#A68B4B]/15 text-gray-900 dark:text-[#F5F5F5] placeholder:text-gray-400 dark:placeholder:text-[#9A928A] transition-all"
                        />
                    </div>

                    {/* View toggle */}
                    <div className="flex items-center bg-gray-100 dark:bg-[#202020] rounded-xl p-1 border border-[#E4C99E]/10">
                        <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-[#2A2A2A] shadow-sm text-[#A68B4B]' : 'text-gray-400 hover:text-gray-600 dark:hover:text-[#C8A96E]'}`}>
                            <Grid3X3 size={14} />
                        </button>
                        <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-[#2A2A2A] shadow-sm text-[#A68B4B]' : 'text-gray-400 hover:text-gray-600 dark:hover:text-[#C8A96E]'}`}>
                            <List size={14} />
                        </button>
                    </div>

                    {/* ClickSign cortado nesta versão — botão removido (fica só no fórmula). */}

                    {/* New contract */}
                    <button
                        onClick={openCreate}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#E4C99E] via-[#C8A96E] to-[#A68B4B] text-black rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-[#A68B4B]/30 transition-all hover:-translate-y-0.5 whitespace-nowrap shrink-0"
                    >
                        <Plus size={15} /> Novo Contrato
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">

                    {/* Stats */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[
                            { label: counts.total,                      sub: 'Total',     accent: 'text-gray-900 dark:text-[#F5F5F5]',          icon: FileText,      iconBg: 'bg-gray-100 dark:bg-[#2A2A2A]',  iconColor: 'text-[#A68B4B] dark:text-[#C8A96E]' },
                            { label: counts.ativo,                       sub: 'Ativos',    accent: 'text-emerald-400',         icon: CheckCircle,   iconBg: 'bg-emerald-500/10',             iconColor: 'text-emerald-400' },
                            { label: counts.vencendo,                    sub: 'Vencendo',  accent: 'text-amber-400',           icon: Clock,         iconBg: 'bg-amber-500/10',               iconColor: 'text-amber-400' },
                            { label: counts.byStatus['Pendente'] ?? 0,   sub: 'Pendentes', accent: 'text-[#4A7FB8]',           icon: AlertTriangle, iconBg: 'bg-[#4A7FB8]/10',               iconColor: 'text-[#4A7FB8]' },
                        ].map((s, i) => {
                            const Icon = s.icon;
                            return (
                                <div key={i} className="relative group bg-white dark:bg-[#202020] border border-[#E4C99E]/14 rounded-2xl p-4 hover:border-[#A68B4B]/30 hover:shadow-lg hover:shadow-[#A68B4B]/5 transition-all overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-[#E4C99E]/[0.04] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="relative flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl ${s.iconBg} flex items-center justify-center shrink-0`}>
                                            <Icon size={18} className={s.iconColor} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`text-2xl font-bold leading-none ${s.accent}`}>{s.label}</p>
                                            <p className="text-[10px] font-semibold text-[#9A928A] tracking-[0.18em] uppercase mt-1.5">{s.sub}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Root: folder cards */}
                    {isRoot && (
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A68B4B]/70 dark:text-[#C8A96E]/60 mb-3">Pastas</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {STATUSES.map(status => {
                                    const cfg = STATUS_CONFIG[status];
                                    const StatusIcon = cfg.icon;
                                    return (
                                        <button
                                            key={status}
                                            onClick={() => setCurrentFolder(status)}
                                            className="group relative flex flex-col gap-3 p-4 bg-white dark:bg-[#202020] border border-[#E4C99E]/14 rounded-2xl hover:border-[#A68B4B]/40 hover:shadow-lg hover:shadow-[#A68B4B]/8 hover:-translate-y-0.5 transition-all text-left overflow-hidden"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-br from-[#E4C99E]/[0.06] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <div className="relative flex items-center justify-between">
                                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 dark:from-[#2A2A2A] dark:to-[#0D0D0D] flex items-center justify-center group-hover:scale-105 transition-transform">
                                                    <StatusIcon size={20} className={cfg.folderColor} />
                                                </div>
                                                <ChevronRight size={14} className="text-gray-300 dark:text-[#9A928A]/40 group-hover:text-[#A68B4B] transition-colors" />
                                            </div>
                                            <div className="relative">
                                                <p className="font-semibold text-gray-900 dark:text-[#F5F5F5] text-sm">{status}</p>
                                                <p className="text-xs text-[#9A928A] mt-0.5">{counts.byStatus[status] ?? 0} contrato{(counts.byStatus[status] ?? 0) !== 1 ? 's' : ''}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Contract list (when searching or inside a folder) */}
                    {(!isRoot || search.trim()) && (
                        <div>
                            {!search.trim() && currentFolder !== 'all' && (
                                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A68B4B]/70 dark:text-[#C8A96E]/60 mb-3">{currentFolder}</p>
                            )}
                            {search.trim() && (
                                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A68B4B]/70 dark:text-[#C8A96E]/60 mb-3">
                                    Resultados para &ldquo;<span className="text-gray-900 dark:text-[#F5F5F5]">{search}</span>&rdquo;
                                </p>
                            )}

                            {filtered.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-64 rounded-2xl border border-dashed border-[#E4C99E]/20 dark:border-[#E4C99E]/15 bg-gradient-to-br from-gray-50 to-white dark:from-[#202020] dark:to-[#1B1B1B] text-gray-500 dark:text-[#9A928A]">
                                    <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-[#2A2A2A] flex items-center justify-center mb-4">
                                        <FileText size={22} className="text-gray-400 dark:text-[#9A928A]/60" />
                                    </div>
                                    <p className="font-semibold text-sm text-gray-700 dark:text-[#F5F5F5]/80">Nenhum contrato encontrado</p>
                                    <p className="text-xs mt-1 text-gray-500 dark:text-[#9A928A]">Crie um novo contrato ou importe do ClickSign.</p>
                                </div>
                            ) : viewMode === 'grid' ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {filtered.map(c => <ContractCard key={c.id} contract={c} onEdit={openEdit} onDelete={handleDelete} />)}
                                </div>
                            ) : (
                                <div className="bg-white dark:bg-[#202020] border border-[#E4C99E]/20 dark:border-[#E4C99E]/14 rounded-2xl overflow-hidden">
                                    <table className="w-full min-w-[600px] text-sm">
                                        <thead>
                                            <tr className="border-b border-[#E4C99E]/15 dark:border-[#E4C99E]/10 bg-gray-50 dark:bg-[#141414]">
                                                {['Cliente', 'Título', 'Status', 'Vigência', 'Valor', 'Arquivo', ''].map(h => (
                                                    <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-[#A68B4B]/70 dark:text-[#C8A96E]/60 uppercase tracking-[0.18em]">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#E4C99E]/8">
                                            {filtered.map(c => <ContractRow key={c.id} contract={c} onEdit={openEdit} onDelete={handleDelete} />)}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* ── Modal ── */}
            {modalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-[#1A1A1A] w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-[#2A2A2A] flex flex-col max-h-[90vh]">

                        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-[#2A2A2A] shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#A68B4B]/10 rounded-xl">
                                    <FileText size={20} className="text-[#A68B4B]" />
                                </div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                    {editing ? 'Editar Contrato' : 'Novo Contrato'}
                                </h2>
                            </div>
                            <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors p-1">
                                <X size={22} />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 p-6 space-y-5 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5"><User size={13} /> Cliente</label>
                                    <input type="text" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Nome do cliente..." className="w-full px-4 py-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent outline-none text-gray-900 dark:text-white text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5"><FileText size={13} /> Título do Contrato</label>
                                    <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Contrato de Venda — Touro Prometeu..." className="w-full px-4 py-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent outline-none text-gray-900 dark:text-white text-sm" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Contract['status'] }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl focus:ring-2 focus:ring-[#A68B4B] outline-none text-gray-900 dark:text-white text-sm">
                                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5"><DollarSign size={13} /> Valor (R$)</label>
                                    <input type="number" min="0" step="0.01" value={form.value ?? ''} onChange={e => setForm(f => ({ ...f, value: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="0,00" className="w-full px-4 py-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl focus:ring-2 focus:ring-[#A68B4B] outline-none text-gray-900 dark:text-white text-sm" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5"><Calendar size={13} /> Início da Vigência</label>
                                    <input type="date" value={form.start_date ?? ''} onChange={e => setForm(f => ({ ...f, start_date: e.target.value || null }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl focus:ring-2 focus:ring-[#A68B4B] outline-none text-gray-900 dark:text-white text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5"><Calendar size={13} /> Fim da Vigência</label>
                                    <input type="date" value={form.end_date ?? ''} onChange={e => setForm(f => ({ ...f, end_date: e.target.value || null }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl focus:ring-2 focus:ring-[#A68B4B] outline-none text-gray-900 dark:text-white text-sm" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5"><StickyNote size={13} /> Observações</label>
                                <textarea value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))} rows={3} placeholder="Detalhes adicionais sobre o contrato..." className="w-full px-4 py-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl focus:ring-2 focus:ring-[#A68B4B] outline-none text-gray-900 dark:text-white text-sm resize-none" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5"><Upload size={13} /> Arquivo do Contrato</label>
                                {uploadedFile ? (
                                    <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                                        <FileText size={18} className="text-blue-500 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-blue-700 dark:text-blue-300 truncate">{uploadedFile.name}</p>
                                        </div>
                                        <a href={uploadedFile.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-blue-500 hover:text-blue-700 transition-colors rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40">
                                            <Download size={15} />
                                        </a>
                                        <button type="button" onClick={handleRemoveFile} className="p-1.5 text-red-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                                            <X size={15} />
                                        </button>
                                    </div>
                                ) : (
                                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="w-full flex flex-col items-center gap-2 px-4 py-6 bg-gray-50 dark:bg-[#141414] border-2 border-dashed border-gray-200 dark:border-[#333] rounded-xl hover:border-[#A68B4B] hover:bg-[#A68B4B]/5 transition-all disabled:opacity-50 cursor-pointer">
                                        {isUploading ? <div className="w-6 h-6 border-2 border-[#A68B4B]/30 border-t-[#A68B4B] rounded-full animate-spin" /> : <Upload size={22} className="text-gray-400" />}
                                        <span className="text-sm text-gray-500">{isUploading ? 'Enviando...' : 'Clique para fazer upload do contrato (PDF)'}</span>
                                    </button>
                                )}
                                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleUpload} />
                            </div>

                            {/* ── ClickSign — assinatura eletrônica ── */}
                            {editing && (
                                <div className="pt-4 border-t border-gray-100 dark:border-[#2A2A2A]">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="p-1.5 bg-blue-500/10 rounded-lg">
                                            <PenLine size={14} className="text-blue-500" />
                                        </div>
                                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Assinatura Eletrônica (ClickSign)</h3>
                                    </div>

                                    {editing.clicksign_document_key ? (
                                        <ClickSignSentBlock
                                            contract={editing}
                                            onSync={handleSyncClickSign}
                                            onCancel={handleCancelClickSign}
                                            isSyncing={isSyncingCs}
                                            isCancelling={isCancellingCs}
                                        />
                                    ) : (
                                        <ClickSignSendBlock
                                            signers={signers}
                                            updateSigner={updateSigner}
                                            addSigner={addSigner}
                                            removeSigner={removeSigner}
                                            csMessage={csMessage}
                                            setCsMessage={setCsMessage}
                                            csDeadline={csDeadline}
                                            setCsDeadline={setCsDeadline}
                                            csSequence={csSequence}
                                            setCsSequence={setCsSequence}
                                            onSend={handleSendClickSign}
                                            isSending={isSendingCs}
                                            hasFile={!!editing.file_url}
                                        />
                                    )}
                                </div>
                            )}
                            {!editing && (
                                <div className="pt-4 border-t border-gray-100 dark:border-[#2A2A2A] text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <PenLine size={13} className="text-gray-400" />
                                    Salve o contrato e anexe o PDF para enviar para assinatura via ClickSign.
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-[#2A2A2A] shrink-0">
                            <button type="button" onClick={() => setModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-[#2e2e2e] hover:bg-gray-200 dark:hover:bg-[#363636] rounded-xl transition-colors">
                                Cancelar
                            </button>
                            <button type="button" onClick={handleSave} disabled={isSaving || !form.client_name.trim() || !form.title.trim()} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#E4C99E] via-[#C8A96E] to-[#A68B4B] text-black rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-[#A68B4B]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                {isSaving ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Save size={15} />}
                                {isSaving ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── ClickSign import modal ── */}
            {csImportOpen && (
                <ClickSignImportModal
                    onClose={() => setCsImportOpen(false)}
                    conn={csConn}
                    docs={csDocs}
                    loading={csLoadingDocs}
                    onReload={loadClickSignDocs}
                    onTest={checkClickSign}
                    onImport={importClickSignDoc}
                    importing={csImporting}
                    importedKeys={importedKeys}
                />
            )}
        </div>
    );
}

/* ── Helper: Sidebar Item ── */
function SidebarItem({
    active, icon, label, count, onClick,
}: {
    active: boolean;
    icon: React.ReactNode;
    label: string;
    count: number;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`relative flex items-center justify-between pl-4 pr-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                active
                    ? 'text-[#A68B4B] dark:text-[#C8A96E] bg-gradient-to-r from-[#A68B4B]/10 to-transparent'
                    : 'text-gray-600 dark:text-[#9A928A] hover:text-gray-900 dark:hover:text-[#F5F5F5] hover:bg-gray-100 dark:hover:bg-[#1A1A1A]/40'
            }`}
        >
            {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gradient-to-b from-[#E4C99E] via-[#C8A96E] to-[#A68B4B]" />}
            <div className="flex items-center gap-2.5">
                <span className={active ? 'text-[#A68B4B] dark:text-[#C8A96E]' : 'text-gray-400 dark:text-[#9A928A]'}>{icon}</span>
                {label}
            </div>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                active
                    ? 'bg-gradient-to-r from-[#C8A96E] to-[#A68B4B] text-black'
                    : 'bg-gray-100 text-gray-500 dark:bg-[#2A2A2A] dark:text-[#9A928A]'
            }`}>
                {count}
            </span>
        </button>
    );
}

/* ── Contract Card (grid view) ── */
function ContractCard({ contract: c, onEdit, onDelete }: { contract: Contract; onEdit: (c: Contract) => void; onDelete: (id: string, name: string) => void }) {
    const cfg = STATUS_CONFIG[c.status];
    const StatusIcon = cfg.icon;
    const days = daysUntil(c.end_date);
    const expiringSoon = days !== null && days >= 0 && days <= 30 && c.status === 'Ativo';
    const hasClickSign = !!c.clicksign_document_key;

    return (
        <div
            onClick={() => onEdit(c)}
            className="group relative bg-white dark:bg-[#202020] border border-[#E4C99E]/14 rounded-2xl p-4 hover:border-[#A68B4B]/40 hover:shadow-lg hover:shadow-[#A68B4B]/8 hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden"
        >
            {/* Bronze hover sheen */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#E4C99E]/[0.04] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

            {/* Delete btn */}
            <button
                onClick={e => { e.stopPropagation(); onDelete(c.id, c.client_name); }}
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 text-[#9A928A] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all z-10"
            >
                <Trash2 size={13} />
            </button>

            {/* Icon + title */}
            <div className="relative flex items-start gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#E4C99E]/15 via-[#A68B4B]/10 to-transparent border border-[#E4C99E]/15 flex items-center justify-center shrink-0">
                    <FileText size={18} className="text-[#C8A96E]" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                    <p className="font-semibold text-gray-900 dark:text-[#F5F5F5] text-sm truncate pr-6">{c.title}</p>
                    <p className="text-xs text-[#9A928A] truncate mt-0.5">{c.client_name}</p>
                </div>
            </div>

            {/* Status + valor */}
            <div className="relative flex items-center justify-between mt-2">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.color}`}>
                    <StatusIcon size={10} />
                    {cfg.label}
                </span>
                {c.value && (
                    <span className="text-xs font-bold bg-gradient-to-r from-[#C8A96E] to-[#A68B4B] bg-clip-text text-transparent">
                        {formatCurrency(c.value)}
                    </span>
                )}
            </div>

            {/* Dates */}
            {(c.start_date || c.end_date) && (
                <div className="relative mt-2.5 pt-2.5 border-t border-[#E4C99E]/8 flex items-center gap-1 text-[11px] text-[#9A928A]">
                    <Calendar size={10} />
                    <span>{formatDate(c.start_date)} → {formatDate(c.end_date)}</span>
                    {expiringSoon && (
                        <span className="ml-auto text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full font-semibold">
                            {days}d
                        </span>
                    )}
                </div>
            )}

            {/* Footer: file + ClickSign chip */}
            <div className="relative mt-2 flex items-center justify-between gap-2">
                {c.file_url ? (
                    <a
                        href={c.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 text-[11px] text-[#9A928A] hover:text-[#C8A96E] transition-colors min-w-0"
                    >
                        <ExternalLink size={10} className="shrink-0" />
                        <span className="truncate">{c.file_name || 'Ver arquivo'}</span>
                    </a>
                ) : <span />}
                {hasClickSign && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-[#C8A96E] bg-[#A68B4B]/10 px-1.5 py-0.5 rounded-md border border-[#A68B4B]/20 shrink-0">
                        <PenLine size={9} /> ClickSign
                    </span>
                )}
            </div>
        </div>
    );
}

/* ── Contract Row (list view) ── */
function ContractRow({ contract: c, onEdit, onDelete }: { contract: Contract; onEdit: (c: Contract) => void; onDelete: (id: string, name: string) => void }) {
    const cfg = STATUS_CONFIG[c.status];
    const StatusIcon = cfg.icon;
    const days = daysUntil(c.end_date);
    const expiringSoon = days !== null && days >= 0 && days <= 30 && c.status === 'Ativo';
    const expired = days !== null && days < 0 && c.status === 'Ativo';

    return (
        <tr onClick={() => onEdit(c)} className="hover:bg-gray-50 dark:hover:bg-[#191919] transition-colors cursor-pointer group">
            <td className="px-4 py-3.5">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#A68B4B] to-[#9A7209] text-black text-xs flex items-center justify-center font-bold shrink-0">
                        {c.client_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold text-gray-900 dark:text-white truncate max-w-[130px]" title={c.client_name}>{c.client_name}</span>
                </div>
            </td>
            <td className="px-4 py-3.5">
                <span className="text-gray-700 dark:text-gray-300 truncate max-w-[180px] block" title={c.title}>{c.title}</span>
                {c.notes && <span className="text-xs text-gray-400 truncate max-w-[180px] block mt-0.5">{c.notes}</span>}
            </td>
            <td className="px-4 py-3.5">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
                    <StatusIcon size={11} />
                    {cfg.label}
                </span>
            </td>
            <td className="px-4 py-3.5">
                <div className="text-xs space-y-0.5 text-gray-600 dark:text-gray-400">
                    {c.start_date && <div className="flex items-center gap-1"><Calendar size={10} className="text-gray-400" />{formatDate(c.start_date)}</div>}
                    {c.end_date && (
                        <div className={`flex items-center gap-1 ${expiringSoon ? 'text-amber-500 font-semibold' : expired ? 'text-red-500' : ''}`}>
                            <Calendar size={10} className={expiringSoon ? 'text-amber-500' : expired ? 'text-red-500' : 'text-gray-400'} />
                            {formatDate(c.end_date)}
                            {expiringSoon && <span className="ml-1 text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 px-1.5 py-0.5 rounded-full">vence em {days}d</span>}
                            {expired && <span className="ml-1 text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 px-1.5 py-0.5 rounded-full">vencido</span>}
                        </div>
                    )}
                    {!c.start_date && !c.end_date && <span className="text-gray-400">—</span>}
                </div>
            </td>
            <td className="px-4 py-3.5">
                <span className={`font-semibold ${c.value ? 'text-[#A68B4B]' : 'text-gray-400'}`}>{formatCurrency(c.value)}</span>
            </td>
            <td className="px-4 py-3.5">
                {c.file_url ? (
                    <a href={c.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                        <FileText size={12} />
                        <span className="truncate max-w-[90px]">{c.file_name || 'Contrato'}</span>
                        <ExternalLink size={10} />
                    </a>
                ) : (
                    <span className="text-gray-400 text-xs">Sem arquivo</span>
                )}
            </td>
            <td className="px-4 py-3.5">
                <button onClick={e => { e.stopPropagation(); onDelete(c.id, c.client_name); }} className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all">
                    <Trash2 size={14} />
                </button>
            </td>
        </tr>
    );
}

/* ── ClickSign — modal de importação ── */
function ClickSignImportModal({
    onClose, conn, docs, loading, onReload, onTest, onImport, importing, importedKeys,
}: {
    onClose: () => void;
    conn: { ok: boolean | null; error?: string; hint?: string };
    docs: any[];
    loading: boolean;
    onReload: () => void;
    onTest: () => void;
    onImport: (key: string) => void;
    importing: string | null;
    importedKeys: Set<string>;
}) {
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white dark:bg-[#141414] w-full max-w-3xl rounded-2xl shadow-2xl border border-[#E4C99E]/25 dark:border-[#E4C99E]/20 flex flex-col max-h-[85vh] overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header com gradiente bronze sutil */}
                <div className="relative px-6 py-5 border-b border-[#E4C99E]/14 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-[#E4C99E]/[0.06] via-transparent to-transparent" />
                    <div className="relative flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E4C99E]/20 via-[#A68B4B]/15 to-transparent flex items-center justify-center border border-[#E4C99E]/20">
                                <PlugZap size={20} className="text-[#C8A96E]" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-[#F5F5F5]">Documentos no ClickSign</h2>
                                <p className="text-xs text-[#9A928A] mt-0.5">Importe contratos existentes ou acompanhe assinaturas em andamento.</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="text-[#9A928A] hover:text-gray-900 dark:text-[#F5F5F5] transition-colors p-1">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Connection bar */}
                <div className={`px-6 py-3 border-b border-[#E4C99E]/10 flex items-center gap-3 ${
                    conn.ok === true ? 'bg-emerald-500/[0.04]' : conn.ok === false ? 'bg-red-500/[0.04]' : 'bg-gray-50 dark:bg-[#2A2A2A]/30'
                }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                        conn.ok === true ? 'bg-emerald-500 shadow-[0_0_6px_rgba(127,212,160,0.7)]' : conn.ok === false ? 'bg-red-500' : 'bg-gray-400 animate-pulse'
                    }`} />
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-[#F5F5F5]">
                            {conn.ok === true ? 'Conectado ao ClickSign' : conn.ok === false ? 'Falha ao conectar com o ClickSign' : 'Verificando conexão…'}
                        </p>
                        {conn.ok === false && (
                            <p className="text-[11px] text-red-400 mt-0.5 break-all">{conn.error}</p>
                        )}
                        {conn.ok === false && conn.hint && (
                            <p className="text-[11px] text-amber-400 mt-1 leading-relaxed">{conn.hint}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onTest}
                        className="text-[11px] font-semibold text-[#9A928A] hover:text-[#C8A96E] transition-colors px-2"
                    >
                        Re-testar
                    </button>
                </div>

                {/* Documents */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A68B4B]/70 dark:text-[#C8A96E]/60">
                            {docs.length > 0 ? `${docs.length} documento${docs.length !== 1 ? 's' : ''}` : 'Documentos'}
                        </p>
                        <button
                            type="button"
                            onClick={onReload}
                            disabled={loading}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-[#9A928A] hover:text-[#C8A96E] transition-colors disabled:opacity-50"
                        >
                            {loading
                                ? <div className="w-3 h-3 border-2 border-[#C8A96E]/30 border-t-[#C8A96E] rounded-full animate-spin" />
                                : <RefreshCw size={11} />}
                            Recarregar
                        </button>
                    </div>

                    {loading && docs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-[#9A928A]">
                            <div className="w-7 h-7 border-2 border-[#C8A96E]/30 border-t-[#C8A96E] rounded-full animate-spin mb-3" />
                            <p className="text-sm">Carregando documentos…</p>
                        </div>
                    ) : conn.ok === false ? (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-4 text-sm text-red-400">
                            Não é possível listar documentos enquanto a conexão estiver com erro.
                        </div>
                    ) : docs.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#E4C99E]/20 dark:border-[#E4C99E]/15 bg-gray-50 dark:bg-[#202020]/40 py-10 flex flex-col items-center text-gray-500 dark:text-[#9A928A]">
                            <FileText size={28} className="mb-3 opacity-40" />
                            <p className="text-sm font-medium">Nenhum documento encontrado na conta ClickSign.</p>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-[#E4C99E]/20 dark:border-[#E4C99E]/14 bg-white dark:bg-[#202020] overflow-hidden divide-y divide-[#E4C99E]/15 dark:divide-[#E4C99E]/8">
                            {docs.map(d => {
                                const cfg = CLICKSIGN_STATUS_LABEL[d.status as string] || { label: d.status, color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' };
                                const filename = d.filename || (d.path ? d.path.split('/').pop() : null) || d.key;
                                const isImported = importedKeys.has(d.key);
                                return (
                                    <div key={d.key} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#1A1A1A]/60 transition-colors">
                                        <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-[#2A2A2A] flex items-center justify-center shrink-0">
                                            <FileText size={15} className="text-[#C8A96E]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-gray-900 dark:text-[#F5F5F5] text-sm truncate">{filename}</p>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color}`}>
                                                    {cfg.label}
                                                </span>
                                                <span className="text-[10px] text-[#9A928A]">
                                                    {(d.signers || []).length} signatário{(d.signers || []).length !== 1 ? 's' : ''}
                                                </span>
                                                {d.deadline_at && (
                                                    <span className="text-[10px] text-[#9A928A]">
                                                        prazo {new Date(d.deadline_at).toLocaleDateString('pt-BR')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <a
                                            href={`https://app.clicksign.com/documents/${d.key}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[11px] text-[#9A928A] hover:text-[#C8A96E] underline-offset-2 hover:underline shrink-0 px-2 transition-colors"
                                        >
                                            abrir
                                        </a>
                                        {isImported ? (
                                            <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 shrink-0 px-2">
                                                <CheckCircle size={11} /> Importado
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => onImport(d.key)}
                                                disabled={importing === d.key}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#E4C99E]/15 to-[#A68B4B]/15 hover:from-[#E4C99E]/25 hover:to-[#A68B4B]/25 border border-[#E4C99E]/20 text-[#C8A96E] rounded-lg text-[11px] font-semibold transition-all shrink-0 disabled:opacity-50"
                                            >
                                                {importing === d.key
                                                    ? <div className="w-3 h-3 border-2 border-[#C8A96E]/30 border-t-[#C8A96E] rounded-full animate-spin" />
                                                    : <CloudDownload size={12} />}
                                                Importar
                                            </button>
                                        )}
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

/* ── ClickSign — bloco de envio (modo "ainda não enviado") ── */
function ClickSignSendBlock({
    signers, updateSigner, addSigner, removeSigner,
    csMessage, setCsMessage, csDeadline, setCsDeadline, csSequence, setCsSequence,
    onSend, isSending, hasFile,
}: {
    signers: SignerDraft[];
    updateSigner: (i: number, patch: Partial<SignerDraft>) => void;
    addSigner: () => void;
    removeSigner: (i: number) => void;
    csMessage: string; setCsMessage: (v: string) => void;
    csDeadline: string; setCsDeadline: (v: string) => void;
    csSequence: boolean; setCsSequence: (v: boolean) => void;
    onSend: () => void; isSending: boolean; hasFile: boolean;
}) {
    return (
        <div className="space-y-3">
            {!hasFile && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    <AlertTriangle size={13} /> Anexe o PDF do contrato acima antes de enviar para assinatura.
                </div>
            )}

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Signatários</p>
                    <button type="button" onClick={addSigner} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400">
                        <Plus size={12} /> Adicionar
                    </button>
                </div>
                {signers.map((s, i) => (
                    <div key={i} className="bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-gray-500 uppercase">Signatário {i + 1}</span>
                            {signers.length > 1 && (
                                <button type="button" onClick={() => removeSigner(i)} className="text-gray-400 hover:text-red-500 transition-colors">
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="relative">
                                <User size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Nome completo *"
                                    value={s.name}
                                    onChange={e => updateSigner(i, { name: e.target.value })}
                                    className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A] rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div className="relative">
                                <Mail size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="email"
                                    placeholder="email@exemplo.com *"
                                    value={s.email}
                                    onChange={e => updateSigner(i, { email: e.target.value })}
                                    className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A] rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div className="relative">
                                <Phone size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="tel"
                                    placeholder="+5511999999999"
                                    value={s.phone_number || ''}
                                    onChange={e => updateSigner(i, { phone_number: e.target.value })}
                                    className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A] rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div className="relative">
                                <IdCard size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="CPF (opcional)"
                                    value={s.documentation || ''}
                                    onChange={e => updateSigner(i, { documentation: e.target.value })}
                                    className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A] rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                            <span className="font-semibold">Autenticação:</span>
                            {(['email', 'whatsapp', 'sms'] as const).map(a => {
                                const checked = s.auths.includes(a);
                                return (
                                    <label key={a} className="flex items-center gap-1 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={e => {
                                                const next = e.target.checked
                                                    ? Array.from(new Set([...s.auths, a]))
                                                    : s.auths.filter(x => x !== a);
                                                updateSigner(i, { auths: next.length ? next : ['email'] });
                                            }}
                                            className="accent-blue-500"
                                        />
                                        {a}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Prazo (opcional)</label>
                    <input
                        type="date"
                        value={csDeadline}
                        onChange={e => setCsDeadline(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A] rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                    />
                </div>
                <div className="flex items-end">
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={csSequence}
                            onChange={e => setCsSequence(e.target.checked)}
                            className="accent-blue-500"
                        />
                        Assinatura sequencial (na ordem dos signatários)
                    </label>
                </div>
            </div>

            <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Mensagem para os signatários (opcional)</label>
                <textarea
                    rows={2}
                    value={csMessage}
                    onChange={e => setCsMessage(e.target.value)}
                    placeholder="Olá! Segue o contrato para assinatura."
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A] rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white resize-none"
                />
            </div>

            <button
                type="button"
                onClick={onSend}
                disabled={isSending || !hasFile}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isSending
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Send size={14} />}
                {isSending ? 'Enviando…' : 'Enviar para Assinatura'}
            </button>
        </div>
    );
}

/* ── ClickSign — bloco de status (modo "já enviado") ── */
function ClickSignSentBlock({
    contract: c, onSync, onCancel, isSyncing, isCancelling,
}: {
    contract: Contract;
    onSync: () => void;
    onCancel: () => void;
    isSyncing: boolean;
    isCancelling: boolean;
}) {
    const status = c.clicksign_status || 'running';
    const statusCfg = CLICKSIGN_STATUS_LABEL[status] || { label: status, color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' };
    const isFinished = status === 'closed' || status === 'auto_closed' || status === 'cancelled' || status === 'canceled';
    const csSigners = c.clicksign_signers ?? [];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statusCfg.color}`}>
                    <PenLine size={10} />
                    {statusCfg.label}
                </span>
                {c.clicksign_url && (
                    <a
                        href={c.clicksign_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        <ExternalLink size={11} /> Abrir no ClickSign
                    </a>
                )}
            </div>

            {csSigners.length > 0 && (
                <div className="bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl divide-y divide-gray-200 dark:divide-[#2e2e2e]">
                    {csSigners.map(s => (
                        <div key={s.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${s.signed_at ? 'bg-emerald-500/20 text-emerald-600' : 'bg-amber-500/20 text-amber-600'}`}>
                                {s.signed_at ? <CheckCircle size={13} /> : <Clock size={13} />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 dark:text-white truncate">{s.name}</p>
                                <p className="text-xs text-gray-500 truncate">{s.email}</p>
                            </div>
                            <span className="text-[11px] text-gray-400 shrink-0">
                                {s.signed_at ? `assinou ${new Date(s.signed_at).toLocaleDateString('pt-BR')}` : 'pendente'}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {c.clicksign_signed_url && (
                <a
                    href={c.clicksign_signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm font-semibold hover:bg-emerald-500/20 transition-colors"
                >
                    <Download size={13} /> Baixar PDF assinado
                </a>
            )}

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={onSync}
                    disabled={isSyncing}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 dark:bg-[#2e2e2e] hover:bg-gray-200 dark:hover:bg-[#363636] text-gray-700 dark:text-gray-300 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                    {isSyncing
                        ? <div className="w-3.5 h-3.5 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" />
                        : <RefreshCw size={13} />}
                    Atualizar status
                </button>
                {!isFinished && (
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isCancelling}
                        className="flex items-center justify-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                        {isCancelling
                            ? <div className="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-500 rounded-full animate-spin" />
                            : <Ban size={13} />}
                        Cancelar
                    </button>
                )}
            </div>

            <p className="text-[11px] text-gray-400">
                Enviado em {c.clicksign_sent_at ? new Date(c.clicksign_sent_at).toLocaleString('pt-BR') : '—'}.
            </p>
        </div>
    );
}
