'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Upload, Search, X, Copy, Download, Trash2, RefreshCw, File,
    Check, AlertCircle, ChevronDown, Cloud, Link2, Clock,
} from 'lucide-react';

function errMsg(e: unknown): string {
    return e instanceof Error ? e.message : 'Erro inesperado.';
}

// ── Types ─────────────────────────────────────────────────────────────────────

type R2Object = {
    key: string;
    name: string;
    size: number;
    lastModified: string | null;
    etag: string | null;
};

type SortBy = 'date_desc' | 'date_asc' | 'name_asc' | 'size_desc';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number = 0): string {
    if (!bytes) return '—';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

function getExtension(name: string): string {
    return name.split('.').pop()?.toUpperCase() ?? 'ARQ';
}

const TTL_OPTIONS: { label: string; seconds: number }[] = [
    { label: '15 min', seconds: 15 * 60 },
    { label: '1 hora', seconds: 60 * 60 },
    { label: '24 horas', seconds: 24 * 60 * 60 },
    { label: '7 dias', seconds: 7 * 24 * 60 * 60 },
];

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
    return (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${type === 'success'
            ? 'bg-[#1d1d1d] border-emerald-500/30 text-emerald-400'
            : 'bg-[#1d1d1d] border-red-500/30 text-red-400'
            }`}>
            {type === 'success'
                ? <Check size={16} className="shrink-0" />
                : <AlertCircle size={16} className="shrink-0" />
            }
            {message}
            <button onClick={onClose} className="ml-2 opacity-50 hover:opacity-100 transition-opacity">
                <X size={14} />
            </button>
        </div>
    );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="bg-white dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#2e2e2e] rounded-2xl px-5 py-4 flex flex-col gap-1">
            <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</span>
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{value}</span>
            {sub && <span className="text-xs text-gray-400 dark:text-gray-600">{sub}</span>}
        </div>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function R2Library() {
    const [objects, setObjects] = useState<R2Object[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<SortBy>('date_desc');
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);

    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{ name: string; pct: number } | null>(null);

    const [deletingKey, setDeletingKey] = useState<string | null>(null);
    const [linkModal, setLinkModal] = useState<{ obj: R2Object; ttl: number; url: string | null; loading: boolean } | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    const fetchList = useCallback(async (opts?: { append?: boolean; cursor?: string }) => {
        const append = !!opts?.append;
        if (append) setLoadingMore(true); else setLoading(true);
        setError(null);
        try {
            const url = new URL('/api/r2/list', window.location.origin);
            if (opts?.cursor) url.searchParams.set('cursor', opts.cursor);
            const res = await fetch(url.toString(), { cache: 'no-store' });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `Falha ao listar (${res.status}).`);
            }
            const data = await res.json() as { objects: R2Object[]; nextToken: string | null; truncated: boolean };
            setObjects(prev => append ? [...prev, ...data.objects] : data.objects);
            setNextCursor(data.truncated ? data.nextToken : null);
        } catch (e: unknown) {
            setError(errMsg(e));
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, []);

    useEffect(() => { fetchList(); }, [fetchList]);

    // ── Upload via presigned PUT ───────────────────────────────────────────────
    const uploadFiles = async (fileList: FileList) => {
        setUploading(true);
        const files = Array.from(fileList);
        let success = 0;
        let errors = 0;
        for (const file of files) {
            try {
                setUploadProgress({ name: file.name, pct: 0 });
                const res = await fetch('/api/r2/upload-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream' }),
                });
                if (!res.ok) throw new Error('Falha gerando URL de upload.');
                const { url } = await res.json() as { url: string; key: string };

                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('PUT', url);
                    if (file.type) xhr.setRequestHeader('Content-Type', file.type);
                    xhr.upload.onprogress = (evt) => {
                        if (evt.lengthComputable) {
                            const pct = Math.round((evt.loaded / evt.total) * 100);
                            setUploadProgress({ name: file.name, pct });
                        }
                    };
                    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
                    xhr.onerror = () => reject(new Error('Falha de rede'));
                    xhr.send(file);
                });
                success++;
            } catch {
                errors++;
            }
        }
        setUploadProgress(null);
        setUploading(false);
        if (errors === 0) showToast(`${success} arquivo(s) enviado(s) ao R2.`, 'success');
        else showToast(`${success} ok, ${errors} erro(s).`, 'error');
        fetchList();
    };

    // ── Generate signed download URL ───────────────────────────────────────────
    const openLinkModal = (obj: R2Object) => {
        setLinkModal({ obj, ttl: 3600, url: null, loading: false });
    };

    const generateLink = async (ttl: number) => {
        if (!linkModal) return;
        setLinkModal({ ...linkModal, ttl, url: null, loading: true });
        try {
            const url = new URL('/api/r2/download-url', window.location.origin);
            url.searchParams.set('key', linkModal.obj.key);
            url.searchParams.set('ttl', String(ttl));
            const res = await fetch(url.toString(), { cache: 'no-store' });
            if (!res.ok) {
                const b = await res.json().catch(() => ({}));
                throw new Error(b.error ?? `Falha (${res.status}).`);
            }
            const data = await res.json() as { url: string };
            setLinkModal({ ...linkModal, ttl, url: data.url, loading: false });
        } catch (e: unknown) {
            showToast(errMsg(e), 'error');
            setLinkModal({ ...linkModal, ttl, url: null, loading: false });
        }
    };

    const downloadDirect = async (obj: R2Object) => {
        try {
            const url = new URL('/api/r2/download-url', window.location.origin);
            url.searchParams.set('key', obj.key);
            url.searchParams.set('ttl', '300');
            const res = await fetch(url.toString(), { cache: 'no-store' });
            if (!res.ok) throw new Error('Falha ao gerar link.');
            const data = await res.json() as { url: string };
            window.open(data.url, '_blank', 'noopener,noreferrer');
        } catch (e: unknown) {
            showToast(errMsg(e), 'error');
        }
    };

    const handleDelete = async (obj: R2Object) => {
        if (!confirm(`Remover "${obj.name}" do R2? Essa ação é irreversível.`)) return;
        setDeletingKey(obj.key);
        try {
            const res = await fetch('/api/r2/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: obj.key }),
            });
            if (!res.ok) {
                const b = await res.json().catch(() => ({}));
                throw new Error(b.error ?? 'Falha ao remover.');
            }
            setObjects(prev => prev.filter(o => o.key !== obj.key));
            showToast('Objeto removido.', 'success');
        } catch (e: unknown) {
            showToast(errMsg(e), 'error');
        } finally {
            setDeletingKey(null);
        }
    };

    // ── Filter / sort ──────────────────────────────────────────────────────────
    const display = objects
        .filter(o => o.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            if (sortBy === 'date_desc') return new Date(b.lastModified ?? 0).getTime() - new Date(a.lastModified ?? 0).getTime();
            if (sortBy === 'date_asc') return new Date(a.lastModified ?? 0).getTime() - new Date(b.lastModified ?? 0).getTime();
            if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
            if (sortBy === 'size_desc') return b.size - a.size;
            return 0;
        });

    const totalSize = objects.reduce((acc, o) => acc + o.size, 0);

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Objetos no R2" value={objects.length} sub={nextCursor ? '+ não carregados' : 'todos carregados'} />
                <StatCard label="Espaço usado" value={formatBytes(totalSize)} sub="prefix libmedia/" />
                <StatCard label="Provider" value="Cloudflare R2" sub="bucket privado" />
                <StatCard label="Acesso" value="Signed URL" sub="link com expiração" />
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar no R2..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#2e2e2e] text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-[#A0792E]/50 transition-colors"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                            <X size={14} />
                        </button>
                    )}
                </div>

                <div className="relative">
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as SortBy)}
                        className="appearance-none pl-3 pr-8 py-2.5 rounded-xl bg-white dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#2e2e2e] text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:border-[#A0792E]/50 cursor-pointer"
                    >
                        <option value="date_desc">Mais recentes</option>
                        <option value="date_asc">Mais antigos</option>
                        <option value="name_asc">Nome A→Z</option>
                        <option value="size_desc">Maior tamanho</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>

                <button
                    onClick={() => fetchList()}
                    disabled={loading}
                    className="p-2.5 rounded-xl border border-gray-200 dark:border-[#2e2e2e] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#262626] transition-all"
                    title="Atualizar"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>

                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#A0792E] to-[#D4A85C] text-black font-semibold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-[#A0792E]/20 disabled:opacity-60"
                >
                    {uploading && uploadProgress ? (
                        <>
                            <RefreshCw size={16} className="animate-spin" />
                            {uploadProgress.pct}% — {uploadProgress.name.slice(0, 24)}
                        </>
                    ) : (
                        <>
                            <Upload size={16} />
                            Enviar para R2
                        </>
                    )}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={e => e.target.files && uploadFiles(e.target.files)}
                />
            </div>

            {/* Error banner */}
            {error && (
                <div className="flex items-start gap-4 p-5 rounded-2xl bg-red-500/5 border border-red-500/20">
                    <AlertCircle size={20} className="text-red-400 mt-0.5 shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-red-300">Falha ao acessar o R2</p>
                        <p className="text-xs text-red-400/70 mt-1">{error}</p>
                    </div>
                </div>
            )}

            {/* Content — list view (R2 não tem thumb pública, lista é melhor) */}
            {loading ? (
                <div className="bg-white dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#2e2e2e] rounded-2xl">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="px-5 py-4 border-b border-gray-100 dark:border-[#262626] last:border-0">
                            <div className="h-4 bg-gray-100 dark:bg-[#262626] rounded animate-pulse" />
                        </div>
                    ))}
                </div>
            ) : display.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#A0792E]/15 to-[#D4A85C]/5 border border-[#A0792E]/15 flex items-center justify-center">
                        <Cloud size={34} className="text-[#A0792E]/60" />
                    </div>
                    <div>
                        <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
                            {searchQuery ? 'Nenhum arquivo encontrado' : 'Bucket vazio'}
                        </p>
                        <p className="text-sm text-gray-400 dark:text-gray-600 mt-1">
                            {searchQuery
                                ? 'Tente ajustar a busca.'
                                : 'Envie o primeiro arquivo ou aguarde o sync via rclone.'}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="bg-white dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#2e2e2e] rounded-2xl overflow-hidden">
                    <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-0 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600 px-5 py-3 border-b border-gray-100 dark:border-[#262626]">
                        <span className="w-10" />
                        <span>Nome</span>
                        <span className="w-24 text-right">Tamanho</span>
                        <span className="w-32 text-right">Modificado</span>
                        <span className="w-32 text-right">Ações</span>
                    </div>
                    {display.map((obj, idx) => {
                        const isDeleting = deletingKey === obj.key;
                        return (
                            <div
                                key={obj.key}
                                className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-0 items-center px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-[#191919] transition-colors ${idx < display.length - 1 ? 'border-b border-gray-100 dark:border-[#262626]' : ''}`}
                            >
                                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-[#262626] flex items-center justify-center shrink-0">
                                    <File size={18} className="text-gray-400" />
                                </div>
                                <div className="pl-4 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={obj.name}>
                                        {obj.name}
                                    </p>
                                    <p className="text-[11px] text-gray-400 dark:text-gray-600 mt-0.5">
                                        <span className="font-mono">.{getExtension(obj.name)}</span>
                                        <span className="mx-1.5">·</span>
                                        <span>{obj.key}</span>
                                    </p>
                                </div>
                                <span className="w-24 text-right text-xs text-gray-500 tabular-nums">
                                    {formatBytes(obj.size)}
                                </span>
                                <span className="w-32 text-right text-xs text-gray-400 dark:text-gray-600">
                                    {formatDate(obj.lastModified)}
                                </span>
                                <div className="w-32 flex items-center justify-end gap-1.5">
                                    <button
                                        onClick={() => openLinkModal(obj)}
                                        title="Gerar link temporário"
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 dark:hover:bg-[#2e2e2e] transition-colors"
                                    >
                                        <Link2 size={15} />
                                    </button>
                                    <button
                                        onClick={() => downloadDirect(obj)}
                                        title="Baixar agora"
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 dark:hover:bg-[#2e2e2e] transition-colors"
                                    >
                                        <Download size={15} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(obj)}
                                        disabled={isDeleting}
                                        title="Remover"
                                        className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                                    >
                                        {isDeleting ? <RefreshCw size={15} className="animate-spin" /> : <Trash2 size={15} />}
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {nextCursor && (
                        <div className="px-5 py-4 border-t border-gray-100 dark:border-[#262626] flex justify-center">
                            <button
                                onClick={() => fetchList({ append: true, cursor: nextCursor })}
                                disabled={loadingMore}
                                className="text-xs font-medium text-[#A0792E] hover:text-[#D4A85C] disabled:opacity-50"
                            >
                                {loadingMore ? 'Carregando...' : 'Carregar mais'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Results count */}
            {!loading && display.length > 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-600 text-center">
                    Exibindo {display.length} de {objects.length} objeto(s){nextCursor ? ' (mais disponíveis)' : ''}
                </p>
            )}

            {/* Link modal */}
            {linkModal && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
                    onClick={() => setLinkModal(null)}
                >
                    <div
                        className="w-full max-w-lg bg-[#191919] border border-[#2e2e2e] rounded-2xl p-6 flex flex-col gap-5"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-[#A0792E]/10 border border-[#A0792E]/20 flex items-center justify-center shrink-0">
                                    <Link2 size={18} className="text-[#A0792E]" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-white truncate">{linkModal.obj.name}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{formatBytes(linkModal.obj.size)}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setLinkModal(null)}
                                className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                                <Clock size={12} /> Validade do link
                            </p>
                            <div className="grid grid-cols-4 gap-2">
                                {TTL_OPTIONS.map(opt => (
                                    <button
                                        key={opt.seconds}
                                        onClick={() => generateLink(opt.seconds)}
                                        className={`py-2 rounded-lg text-xs font-medium transition-colors ${linkModal.ttl === opt.seconds && linkModal.url
                                            ? 'bg-gradient-to-r from-[#A0792E] to-[#D4A85C] text-black'
                                            : 'bg-[#262626] text-gray-300 hover:bg-[#2e2e2e]'
                                            }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {linkModal.loading ? (
                            <div className="py-6 flex items-center justify-center gap-2 text-gray-400 text-sm">
                                <RefreshCw size={14} className="animate-spin" />
                                Gerando link...
                            </div>
                        ) : linkModal.url ? (
                            <div className="space-y-3">
                                <div className="bg-[#262626] border border-[#2e2e2e] rounded-xl p-3 break-all text-[11px] font-mono text-gray-300 max-h-32 overflow-auto">
                                    {linkModal.url}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(linkModal.url!);
                                            showToast('Link copiado!', 'success');
                                        }}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm font-medium hover:bg-white/20 transition-colors"
                                    >
                                        <Copy size={14} /> Copiar
                                    </button>
                                    <a
                                        href={linkModal.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[#A0792E] to-[#D4A85C] text-black text-sm font-semibold hover:opacity-90 transition-opacity"
                                    >
                                        <Download size={14} /> Abrir / Baixar
                                    </a>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-gray-500 text-center py-2">
                                Escolha a validade desejada para gerar o link.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
}
