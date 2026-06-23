'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Upload, Trash2, Download, Loader2 } from 'lucide-react';
import {
    listLeadDocumentos,
    uploadLeadDocumento,
    getLeadDocumentoUrl,
    deleteLeadDocumento,
    type LeadDocumento,
} from '@/app/sistema/actions/crm-leads';

const TIPOS = [
    { value: 'cpf', label: 'CPF/RG' },
    { value: 'ie', label: 'Inscrição Estadual' },
    { value: 'comprovante', label: 'Comprovante' },
    { value: 'contrato', label: 'Contrato' },
    { value: 'outro', label: 'Outro' },
];

function formatBytes(bytes: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CRMLeadDocumentos({ leadId }: { leadId: string }) {
    const [docs, setDocs] = useState<LeadDocumento[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [tipo, setTipo] = useState('outro');
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let active = true;
        setLoading(true);
        listLeadDocumentos(leadId)
            .then(d => { if (active) setDocs(d); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [leadId]);

    async function handleUpload(file: File) {
        setUploading(true);
        setError(null);
        try {
            const fd = new FormData();
            fd.set('file', file);
            fd.set('leadId', leadId);
            fd.set('tipo', tipo);
            const created = await uploadLeadDocumento(fd);
            setDocs(prev => [created, ...prev]);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Falha ao subir documento.');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    }

    async function handleDownload(doc: LeadDocumento) {
        setBusyId(doc.id);
        try {
            const url = await getLeadDocumentoUrl(doc.path);
            window.open(url, '_blank', 'noopener');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Falha ao gerar link.');
        } finally {
            setBusyId(null);
        }
    }

    async function handleDelete(doc: LeadDocumento) {
        if (!window.confirm(`Excluir "${doc.nomeArquivo}"?`)) return;
        setBusyId(doc.id);
        try {
            await deleteLeadDocumento(doc.id, doc.path);
            setDocs(prev => prev.filter(d => d.id !== doc.id));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Falha ao excluir.');
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <select
                    value={tipo}
                    onChange={e => setTipo(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 dark:border-[#333] bg-white dark:bg-[#141414] text-sm text-gray-700 dark:text-gray-200 outline-none focus:border-[#A68B4B]"
                >
                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }}
                />
                <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#A68B4B] text-black text-sm font-semibold hover:shadow-md transition-all disabled:opacity-50"
                >
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    Anexar documento
                </button>
            </div>

            {error && (
                <p className="text-xs text-red-500">{error}</p>
            )}

            {loading ? (
                <p className="text-xs text-gray-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Carregando…</p>
            ) : docs.length === 0 ? (
                <p className="text-xs text-gray-400">Nenhum documento anexado.</p>
            ) : (
                <ul className="divide-y divide-gray-100 dark:divide-[#2e2e2e] border border-gray-200 dark:border-[#333] rounded-lg overflow-hidden">
                    {docs.map(doc => (
                        <li key={doc.id} className="flex items-center gap-3 px-3 py-2.5">
                            <FileText size={16} className="text-gray-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{doc.nomeArquivo}</p>
                                <p className="text-[11px] text-gray-400">
                                    {TIPOS.find(t => t.value === doc.tipo)?.label || doc.tipo}
                                    {doc.tamanhoBytes ? ` · ${formatBytes(doc.tamanhoBytes)}` : ''}
                                    {` · ${new Date(doc.createdAt).toLocaleDateString('pt-BR')}`}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleDownload(doc)}
                                disabled={busyId === doc.id}
                                title="Baixar / visualizar"
                                className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-[#A68B4B] hover:bg-gray-100 dark:hover:bg-[#2e2e2e] disabled:opacity-50"
                            >
                                {busyId === doc.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDelete(doc)}
                                disabled={busyId === doc.id}
                                title="Excluir"
                                className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                            >
                                <Trash2 size={14} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
