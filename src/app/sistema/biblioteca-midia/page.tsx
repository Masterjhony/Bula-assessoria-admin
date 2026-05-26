'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
    ImageIcon, Film, FileText, Upload, Grid3X3, List, Search, X,
    Copy, Download, Trash2, RefreshCw, File, Check, AlertCircle,
    Eye, FolderOpen, ChevronDown, SortAsc, SortDesc, Cloud, Database,
} from 'lucide-react';
import R2Library from './R2Library';

type Provider = 'supabase' | 'r2';

// ── Types ─────────────────────────────────────────────────────────────────────

type StorageFile = {
    name: string;
    id: string | null;
    updated_at: string | null;
    created_at: string | null;
    metadata: { mimetype?: string; size?: number; [k: string]: unknown } | null;
    publicUrl: string;
};

type FilterType = 'all' | 'images' | 'videos' | 'docs' | 'others';
type ViewMode = 'grid' | 'list';
type SortBy = 'date_desc' | 'date_asc' | 'name_asc' | 'size_desc';

const BUCKET = 'media';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFileType(mimetype: string = ''): FilterType {
    if (mimetype.startsWith('image/')) return 'images';
    if (mimetype.startsWith('video/')) return 'videos';
    if (
        mimetype.includes('pdf') ||
        mimetype.includes('document') ||
        mimetype.includes('spreadsheet') ||
        mimetype.includes('presentation') ||
        mimetype.includes('text/')
    ) return 'docs';
    return 'others';
}

function formatBytes(bytes: number = 0): string {
    if (!bytes) return '—';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
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

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="bg-white dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#2e2e2e] rounded-2xl px-5 py-4 flex flex-col gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-wider font-medium">{label}</span>
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{value}</span>
            {sub && <span className="text-xs text-gray-400 dark:text-gray-600">{sub}</span>}
        </div>
    );
}

function TypeBadge({ type }: { type: FilterType }) {
    const map: Record<FilterType, { label: string; className: string }> = {
        images: { label: 'Foto', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
        videos: { label: 'Vídeo', className: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
        docs: { label: 'Doc', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
        others: { label: 'Arquivo', className: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
        all: { label: 'Arquivo', className: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
    };
    const { label, className } = map[type];
    return (
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${className}`}>
            {label}
        </span>
    );
}

function FileIcon({ type, ext }: { type: FilterType; ext: string }) {
    if (type === 'images') return <ImageIcon size={22} className="text-blue-400" />;
    if (type === 'videos') return <Film size={22} className="text-purple-400" />;
    if (type === 'docs') return <FileText size={22} className="text-emerald-400" />;
    return <File size={22} className="text-gray-400" />;
}

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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BibliotecaMidia() {
    const supabase = createClient();

    const [provider, setProvider] = useState<Provider>('supabase');
    const [files, setFiles] = useState<StorageFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadCount, setUploadCount] = useState(0);
    const [uploadTotal, setUploadTotal] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<FilterType>('all');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [sortBy, setSortBy] = useState<SortBy>('date_desc');
    const [isDragging, setIsDragging] = useState(false);
    const [previewFile, setPreviewFile] = useState<StorageFile | null>(null);
    const [deletingName, setDeletingName] = useState<string | null>(null);
    const [copiedName, setCopiedName] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [bucketError, setBucketError] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    const fetchFiles = useCallback(async () => {
        setLoading(true);
        setBucketError(false);
        try {
            const { data, error } = await supabase.storage.from(BUCKET).list('', {
                limit: 500,
                offset: 0,
                sortBy: { column: 'created_at', order: 'desc' },
            });

            if (error) {
                setBucketError(true);
                return;
            }

            const filtered = (data || []).filter(f => f.name !== '.emptyFolderPlaceholder');
            const withUrls: StorageFile[] = filtered.map(file => ({
                ...file,
                publicUrl: supabase.storage.from(BUCKET).getPublicUrl(file.name).data.publicUrl,
            }));

            setFiles(withUrls);
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    useEffect(() => { fetchFiles(); }, [fetchFiles]);

    // Drag & drop
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
    };

    const uploadFiles = async (fileList: FileList) => {
        setUploading(true);
        const uploads = Array.from(fileList);
        setUploadTotal(uploads.length);
        setUploadCount(0);
        let errors = 0;

        for (const file of uploads) {
            const safeName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_');
            const fileName = `${Date.now()}_${safeName}`;
            const { error } = await supabase.storage.from(BUCKET).upload(fileName, file, {
                cacheControl: '3600',
                upsert: false,
            });
            if (error) errors++;
            setUploadCount(prev => prev + 1);
        }

        setUploading(false);
        if (errors === 0) {
            showToast(`${uploads.length} arquivo(s) enviado(s) com sucesso!`, 'success');
        } else {
            showToast(`${uploads.length - errors} enviado(s), ${errors} erro(s).`, 'error');
        }
        fetchFiles();
    };

    const handleDelete = async (fileName: string) => {
        setDeletingName(fileName);
        const { error } = await supabase.storage.from(BUCKET).remove([fileName]);
        if (error) {
            showToast('Erro ao remover arquivo.', 'error');
        } else {
            showToast('Arquivo removido.', 'success');
            setFiles(prev => prev.filter(f => f.name !== fileName));
            if (previewFile?.name === fileName) setPreviewFile(null);
        }
        setDeletingName(null);
    };

    const handleCopyUrl = (file: StorageFile) => {
        navigator.clipboard.writeText(file.publicUrl);
        setCopiedName(file.name);
        setTimeout(() => setCopiedName(null), 2000);
        showToast('URL copiada para a área de transferência!', 'success');
    };

    // Filtering & sorting
    const displayFiles = files
        .filter(file => {
            const matchSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase());
            const type = getFileType(file.metadata?.mimetype);
            const matchType = filterType === 'all' || type === filterType;
            return matchSearch && matchType;
        })
        .sort((a, b) => {
            if (sortBy === 'date_desc') return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
            if (sortBy === 'date_asc') return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
            if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
            if (sortBy === 'size_desc') return (b.metadata?.size ?? 0) - (a.metadata?.size ?? 0);
            return 0;
        });

    // Stats
    const totalSize = files.reduce((acc, f) => acc + (f.metadata?.size ?? 0), 0);
    const imageCount = files.filter(f => getFileType(f.metadata?.mimetype) === 'images').length;
    const videoCount = files.filter(f => getFileType(f.metadata?.mimetype) === 'videos').length;
    const docCount = files.filter(f => getFileType(f.metadata?.mimetype) === 'docs').length;

    const filterTabs: { id: FilterType; label: string; count: number }[] = [
        { id: 'all', label: 'Todos', count: files.length },
        { id: 'images', label: 'Fotos', count: imageCount },
        { id: 'videos', label: 'Vídeos', count: videoCount },
        { id: 'docs', label: 'Documentos', count: docCount },
        { id: 'others', label: 'Outros', count: files.length - imageCount - videoCount - docCount },
    ];

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div
            className="space-y-6 relative"
            onDragOver={provider === 'supabase' ? handleDragOver : undefined}
            onDragLeave={provider === 'supabase' ? handleDragLeave : undefined}
            onDrop={provider === 'supabase' ? handleDrop : undefined}
        >
            {/* Drag overlay (apenas no provider Supabase) */}
            {provider === 'supabase' && isDragging && (
                <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                    <div className="flex flex-col items-center gap-4 text-center">
                        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#A0792E] to-[#D4A85C] flex items-center justify-center shadow-2xl shadow-[#A0792E]/40">
                            <Upload size={44} className="text-black" />
                        </div>
                        <p className="text-2xl font-bold text-white">Solte para enviar</p>
                        <p className="text-gray-400 text-sm">Múltiplos arquivos suportados</p>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Biblioteca de Mídia</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-500 mt-0.5">
                        {provider === 'supabase'
                            ? 'Central unificada de fotos, vídeos e fichas técnicas'
                            : 'Backups e arquivos grandes no Cloudflare R2 (bucket privado)'}
                    </p>
                </div>
                {provider === 'supabase' && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={fetchFiles}
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
                            {uploading ? (
                                <>
                                    <RefreshCw size={16} className="animate-spin" />
                                    {uploadCount}/{uploadTotal} enviando...
                                </>
                            ) : (
                                <>
                                    <Upload size={16} />
                                    Enviar arquivos
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
                )}
            </div>

            {/* Provider selector */}
            <div className="inline-flex items-center gap-1 bg-white dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#2e2e2e] rounded-xl p-1">
                <button
                    onClick={() => setProvider('supabase')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${provider === 'supabase'
                        ? 'bg-gradient-to-r from-[#A0792E] to-[#D4A85C] text-black shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                >
                    <Database size={14} />
                    Supabase
                    <span className={`text-[10px] ${provider === 'supabase' ? 'text-black/60' : 'text-gray-400 dark:text-gray-600'}`}>
                        (mídia editorial)
                    </span>
                </button>
                <button
                    onClick={() => setProvider('r2')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${provider === 'r2'
                        ? 'bg-gradient-to-r from-[#A0792E] to-[#D4A85C] text-black shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                >
                    <Cloud size={14} />
                    R2
                    <span className={`text-[10px] ${provider === 'r2' ? 'text-black/60' : 'text-gray-400 dark:text-gray-600'}`}>
                        (backups / arquivos grandes)
                    </span>
                </button>
            </div>

            {provider === 'r2' && <R2Library />}

            {provider === 'supabase' && (<>
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total de arquivos" value={files.length} sub={formatBytes(totalSize) + ' usados'} />
                <StatCard label="Fotos" value={imageCount} sub="imagens" />
                <StatCard label="Vídeos" value={videoCount} sub="clipes" />
                <StatCard label="Documentos" value={docCount} sub="PDFs e docs" />
            </div>

            {/* Bucket error */}
            {bucketError && (
                <div className="flex items-start gap-4 p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                    <AlertCircle size={20} className="text-amber-400 mt-0.5 shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-amber-300">Bucket &quot;media&quot; não encontrado</p>
                        <p className="text-xs text-amber-400/70 mt-1">
                            Crie o bucket <code className="bg-amber-500/10 px-1 rounded">media</code> no Supabase Storage com acesso público para começar a usar a biblioteca.
                        </p>
                    </div>
                </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar arquivos..."
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

                {/* Filter tabs */}
                <div className="flex items-center gap-1 bg-white dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#2e2e2e] rounded-xl p-1">
                    {filterTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setFilterType(tab.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${filterType === tab.id
                                ? 'bg-gradient-to-r from-[#A0792E] to-[#D4A85C] text-black shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                }`}
                        >
                            {tab.label}
                            <span className={`ml-1.5 text-[10px] ${filterType === tab.id ? 'text-black/60' : 'text-gray-400 dark:text-gray-600'}`}>
                                {tab.count}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Sort */}
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

                {/* View toggle */}
                <div className="flex items-center gap-1 bg-white dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#2e2e2e] rounded-xl p-1">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-[#262626] text-white' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                    >
                        <Grid3X3 size={16} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-[#262626] text-white' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                    >
                        <List size={16} />
                    </button>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="aspect-square rounded-2xl bg-gray-100 dark:bg-[#1d1d1d] animate-pulse" />
                    ))}
                </div>
            ) : displayFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#A0792E]/15 to-[#D4A85C]/5 border border-[#A0792E]/15 flex items-center justify-center">
                        <FolderOpen size={34} className="text-[#A0792E]/60" />
                    </div>
                    <div>
                        <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
                            {searchQuery || filterType !== 'all' ? 'Nenhum arquivo encontrado' : 'Biblioteca vazia'}
                        </p>
                        <p className="text-sm text-gray-400 dark:text-gray-600 mt-1">
                            {searchQuery || filterType !== 'all'
                                ? 'Tente ajustar a busca ou os filtros.'
                                : 'Arraste arquivos aqui ou clique em "Enviar arquivos" para começar.'}
                        </p>
                    </div>
                    {!(searchQuery || filterType !== 'all') && (
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#A0792E] to-[#D4A85C] text-black font-semibold text-sm hover:opacity-90 transition-opacity"
                        >
                            <Upload size={16} />
                            Enviar primeiro arquivo
                        </button>
                    )}
                </div>
            ) : viewMode === 'grid' ? (
                /* Grid view */
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {displayFiles.map(file => {
                        const type = getFileType(file.metadata?.mimetype);
                        const isImage = type === 'images';
                        const isDeleting = deletingName === file.name;
                        const isCopied = copiedName === file.name;

                        return (
                            <div
                                key={file.name}
                                className="group relative rounded-2xl overflow-hidden border border-gray-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1d1d1d] hover:border-[#A0792E]/40 transition-all duration-200 hover:shadow-lg hover:shadow-[#A0792E]/5"
                            >
                                {/* Thumbnail */}
                                <div className="aspect-square relative bg-gray-50 dark:bg-[#191919] flex items-center justify-center overflow-hidden">
                                    {isImage ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={file.publicUrl}
                                            alt={file.name}
                                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 opacity-50">
                                            <FileIcon type={type} ext={getExtension(file.name)} />
                                            <span className="text-[10px] font-bold text-gray-400 tracking-widest">
                                                {getExtension(file.name)}
                                            </span>
                                        </div>
                                    )}

                                    {/* Hover overlay */}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                        {isImage && (
                                            <button
                                                onClick={() => setPreviewFile(file)}
                                                className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                                                title="Visualizar"
                                            >
                                                <Eye size={15} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleCopyUrl(file)}
                                            className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                                            title="Copiar URL"
                                        >
                                            {isCopied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                                        </button>
                                        <a
                                            href={file.publicUrl}
                                            download={file.name}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                                            title="Download"
                                        >
                                            <Download size={15} />
                                        </a>
                                        <button
                                            onClick={() => handleDelete(file.name)}
                                            disabled={isDeleting}
                                            className="w-9 h-9 rounded-xl bg-red-500/20 backdrop-blur-sm border border-red-500/30 flex items-center justify-center text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                                            title="Remover"
                                        >
                                            {isDeleting ? <RefreshCw size={15} className="animate-spin" /> : <Trash2 size={15} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="p-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <TypeBadge type={type} />
                                    </div>
                                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate" title={file.name}>
                                        {file.name.replace(/^\d+_/, '')}
                                    </p>
                                    <p className="text-[11px] text-gray-400 dark:text-gray-600 mt-0.5">
                                        {formatBytes(file.metadata?.size)} · {formatDate(file.created_at)}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* List view */
                <div className="bg-white dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#2e2e2e] rounded-2xl overflow-hidden">
                    <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-0 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600 px-5 py-3 border-b border-gray-100 dark:border-[#262626]">
                        <span className="w-10" />
                        <span>Nome</span>
                        <span className="w-24 text-right">Tamanho</span>
                        <span className="w-32 text-right">Data</span>
                        <span className="w-28 text-right">Ações</span>
                    </div>
                    {displayFiles.map((file, idx) => {
                        const type = getFileType(file.metadata?.mimetype);
                        const isImage = type === 'images';
                        const isDeleting = deletingName === file.name;
                        const isCopied = copiedName === file.name;

                        return (
                            <div
                                key={file.name}
                                className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-0 items-center px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-[#191919] transition-colors ${idx < displayFiles.length - 1 ? 'border-b border-gray-100 dark:border-[#262626]' : ''}`}
                            >
                                {/* Icon / thumb */}
                                <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 dark:bg-[#262626] flex items-center justify-center shrink-0">
                                    {isImage ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={file.publicUrl} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                                    ) : (
                                        <FileIcon type={type} ext={getExtension(file.name)} />
                                    )}
                                </div>
                                {/* Name */}
                                <div className="pl-4 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                        {file.name.replace(/^\d+_/, '')}
                                    </p>
                                    <div className="mt-0.5">
                                        <TypeBadge type={type} />
                                    </div>
                                </div>
                                {/* Size */}
                                <span className="w-24 text-right text-xs text-gray-500 dark:text-gray-500">
                                    {formatBytes(file.metadata?.size)}
                                </span>
                                {/* Date */}
                                <span className="w-32 text-right text-xs text-gray-400 dark:text-gray-600">
                                    {formatDate(file.created_at)}
                                </span>
                                {/* Actions */}
                                <div className="w-28 flex items-center justify-end gap-1.5">
                                    {isImage && (
                                        <button onClick={() => setPreviewFile(file)} title="Visualizar" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 dark:hover:bg-[#2e2e2e] transition-colors">
                                            <Eye size={15} />
                                        </button>
                                    )}
                                    <button onClick={() => handleCopyUrl(file)} title="Copiar URL" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 dark:hover:bg-[#2e2e2e] transition-colors">
                                        {isCopied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                                    </button>
                                    <a href={file.publicUrl} download={file.name} target="_blank" rel="noreferrer" title="Download" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 dark:hover:bg-[#2e2e2e] transition-colors">
                                        <Download size={15} />
                                    </a>
                                    <button
                                        onClick={() => handleDelete(file.name)}
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
                </div>
            )}

            {/* Results count */}
            {!loading && displayFiles.length > 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-600 text-center">
                    Exibindo {displayFiles.length} de {files.length} arquivo(s)
                </p>
            )}

            {/* Image Preview Modal */}
            {previewFile && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
                    onClick={() => setPreviewFile(null)}
                >
                    <div
                        className="relative max-w-5xl max-h-full flex flex-col gap-4"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal header */}
                        <div className="flex items-center justify-between px-1">
                            <div>
                                <p className="text-sm font-semibold text-white">{previewFile.name.replace(/^\d+_/, '')}</p>
                                <p className="text-xs text-gray-400">
                                    {formatBytes(previewFile.metadata?.size)} · {formatDate(previewFile.created_at)}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleCopyUrl(previewFile)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs hover:bg-white/20 transition-colors"
                                >
                                    {copiedName === previewFile.name ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                                    Copiar URL
                                </button>
                                <a
                                    href={previewFile.publicUrl}
                                    download={previewFile.name}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs hover:bg-white/20 transition-colors"
                                >
                                    <Download size={13} />
                                    Download
                                </a>
                                <button
                                    onClick={() => setPreviewFile(null)}
                                    className="p-2 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Image */}
                        <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={previewFile.publicUrl}
                                alt={previewFile.name}
                                className="max-h-[75vh] max-w-full object-contain block"
                            />
                        </div>
                    </div>
                </div>
            )}
            </>)}

            {/* Toast (compartilhado entre providers) */}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
}
