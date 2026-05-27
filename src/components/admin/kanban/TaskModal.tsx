'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Calendar, Save, Plus, Trash2, CheckCircle2, MessageSquare, Send, Paperclip, Download, FileText, FileImage, FileVideo, File, Zap, Link, Map, Copy, Archive } from 'lucide-react';
import { TacticalTask, TacticalComment, TacticalAttachment, getComments, addComment, getAttachments, saveAttachmentRecord, deleteAttachment } from '@/app/sistema/actions/tactical-tasks';
import { TacticalMember } from '@/app/sistema/actions/tactical-strategic';
import { createClient } from '@/utils/supabase/client';

const STRATEGIC_STAGES = ['', 'Aquisição', 'Conversão', 'Retenção', 'Receita'];

interface TaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    task?: TacticalTask;
    defaultStatus?: string;
    onSave: (taskData: any) => Promise<void>;
    onDelete?: (taskId: string) => Promise<void>;
    onDuplicate?: (taskData: any) => Promise<void>;
    onArchive?: (taskId: string) => Promise<void>;
    columns: { title: string }[];
    allTasks?: TacticalTask[];
    members?: TacticalMember[];
}

export function TaskModal({ isOpen, onClose, task, defaultStatus, onSave, onDelete, onDuplicate, onArchive, columns, allTasks = [], members = [] }: TaskModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState('A fazer');
    const [priority, setPriority] = useState('Média');
    const [startDate, setStartDate] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [assignees, setAssignees] = useState<string[]>([]);
    const [checklists, setChecklists] = useState<{ id: string, title: string, completed: boolean, assignee?: string | null, due_date?: string | null }[]>([]);
    const [newChecklistTitle, setNewChecklistTitle] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const initialSnapshotRef = useRef<string>('');

    // ICE Scoring
    const [iceImpact, setIceImpact] = useState(5);
    const [iceConfidence, setIceConfidence] = useState(5);
    const [iceEase, setIceEase] = useState(5);

    // Dependencies & Strategy
    const [dependsOn, setDependsOn] = useState<string[]>([]);
    const [strategicStage, setStrategicStage] = useState('');

    // Comments State
    const [comments, setComments] = useState<TacticalComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isLoadingComments, setIsLoadingComments] = useState(false);
    const [isSendingComment, setIsSendingComment] = useState(false);

    // Attachments State
    const [attachments, setAttachments] = useState<TacticalAttachment[]>([]);
    const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Active section tab
    const [activeSection, setActiveSection] = useState<'main' | 'scoring' | 'comments' | 'attachments'>('main');

    useEffect(() => {
        setSaveError(null);
        if (task) {
            const next = {
                title: task.title,
                description: task.description || '',
                status: task.status,
                priority: task.priority,
                startDate: task.start_date ? new Date(task.start_date).toISOString().split('T')[0] : '',
                dueDate: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : '',
                assignees: task.assignees ? Array.from(new Set(task.assignees)) : [],
                checklists: task.checklists || [],
                iceImpact: task.ice_impact ?? 5,
                iceConfidence: task.ice_confidence ?? 5,
                iceEase: task.ice_ease ?? 5,
                dependsOn: task.depends_on || [],
                strategicStage: task.strategic_stage || '',
            };
            setTitle(next.title);
            setDescription(next.description);
            setStatus(next.status);
            setPriority(next.priority);
            setStartDate(next.startDate);
            setDueDate(next.dueDate);
            setAssignees(next.assignees);
            setChecklists(next.checklists);
            setIceImpact(next.iceImpact);
            setIceConfidence(next.iceConfidence);
            setIceEase(next.iceEase);
            setDependsOn(next.dependsOn);
            setStrategicStage(next.strategicStage);
            initialSnapshotRef.current = JSON.stringify(next);

            const taskId = task.id;
            const loadComments = async () => {
                setIsLoadingComments(true);
                try { setComments(await getComments(taskId)); }
                catch (e) { console.error(e); }
                finally { setIsLoadingComments(false); }
            };
            loadComments();

            const loadAttachments = async () => {
                setIsLoadingAttachments(true);
                try { setAttachments(await getAttachments(taskId)); }
                catch (e) { console.error(e); }
                finally { setIsLoadingAttachments(false); }
            };
            loadAttachments();
        } else {
            const next = {
                title: '',
                description: '',
                status: defaultStatus || 'A fazer',
                priority: 'Média',
                startDate: '',
                dueDate: '',
                assignees: [] as string[],
                checklists: [] as { id: string, title: string, completed: boolean, assignee?: string | null, due_date?: string | null }[],
                iceImpact: 5,
                iceConfidence: 5,
                iceEase: 5,
                dependsOn: [] as string[],
                strategicStage: '',
            };
            setTitle(next.title);
            setDescription(next.description);
            setStatus(next.status);
            setPriority(next.priority);
            setStartDate(next.startDate);
            setDueDate(next.dueDate);
            setAssignees(next.assignees);
            setChecklists(next.checklists);
            setIceImpact(next.iceImpact);
            setIceConfidence(next.iceConfidence);
            setIceEase(next.iceEase);
            setDependsOn(next.dependsOn);
            setStrategicStage(next.strategicStage);
            setComments([]);
            setNewComment('');
            setAttachments([]);
            initialSnapshotRef.current = JSON.stringify(next);
        }
        setActiveSection('main');
    }, [task?.id, defaultStatus, isOpen]);

    const buildPayload = () => ({
        title,
        description,
        status,
        priority,
        start_date: startDate ? new Date(startDate).toISOString() : null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        assignees: Array.from(new Set(assignees)),
        checklists,
        ice_impact: iceImpact,
        ice_confidence: iceConfidence,
        ice_ease: iceEase,
        depends_on: dependsOn,
        strategic_stage: strategicStage || null,
        status_changed_at: task?.status !== status ? new Date().toISOString() : undefined,
    });

    const computeSnapshot = () => JSON.stringify({
        title, description, status, priority, startDate, dueDate, assignees, checklists,
        iceImpact, iceConfidence, iceEase, dependsOn, strategicStage,
    });

    const isDirty = () => computeSnapshot() !== initialSnapshotRef.current;

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!title.trim() || isSaving) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            await onSave(buildPayload());
            onClose();
        } catch (error: any) {
            setSaveError(error?.message || 'Não foi possível salvar. Tente novamente.');
        } finally {
            setIsSaving(false);
        }
    };

    const requestClose = async () => {
        if (isSaving) return;
        if (title.trim() && isDirty()) {
            setIsSaving(true);
            setSaveError(null);
            try {
                await onSave(buildPayload());
                onClose();
            } catch (error: any) {
                setSaveError(error?.message || 'Não foi possível salvar. Suas alterações ainda estão aqui.');
                setIsSaving(false);
                return;
            }
            setIsSaving(false);
            return;
        }
        onClose();
    };

    const requestCloseRef = useRef(requestClose);
    requestCloseRef.current = requestClose;

    const handleDuplicate = async () => {
        if (!task || !title.trim() || !onDuplicate || isSaving) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            if (isDirty()) {
                await onSave(buildPayload());
            }
            await onDuplicate({
                ...buildPayload(),
                title: `${title} (cópia)`,
                status_changed_at: undefined,
            });
            onClose();
        } catch (error: any) {
            setSaveError(error?.message || 'Não foi possível duplicar a tarefa.');
        } finally {
            setIsSaving(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') requestCloseRef.current();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen]);

    if (!isOpen) return null;

    const iceScore = iceImpact * iceConfidence * iceEase;

    const toggleAssignee = (name: string) => {
        setAssignees(a => a.includes(name) ? a.filter(x => x !== name) : [...a, name]);
    };

    const toggleDependency = (taskId: string) => {
        setDependsOn(d => d.includes(taskId) ? d.filter(x => x !== taskId) : [...d, taskId]);
    };

    const handleSendComment = async () => {
        if (!newComment.trim() || !task) return;
        setIsSendingComment(true);
        try {
            const added = await addComment(task.id, newComment.trim());
            setComments([...comments, added]);
            setNewComment('');
        } catch (e) { console.error(e); }
        finally { setIsSendingComment(false); }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!task || !e.target.files?.length) return;
        const file = e.target.files[0];
        setIsUploading(true);
        const supabase = createClient();
        let uploadedFilePath: string | null = null;
        try {
            const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
            const baseName = file.name
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9._-]/g, '_');
            const safeName = ext ? baseName : `${baseName}`;
            const filePath = `${task.id}/${Date.now()}_${safeName}`;

            const { error: uploadError } = await supabase.storage
                .from('tactical-attachments')
                .upload(filePath, file, { contentType: file.type || 'application/octet-stream' });

            if (uploadError) throw new Error(uploadError.message);
            uploadedFilePath = filePath;

            const { data: urlData } = supabase.storage.from('tactical-attachments').getPublicUrl(filePath);
            const saved = await saveAttachmentRecord(task.id, file.name, urlData.publicUrl, filePath, file.type || 'application/octet-stream', file.size);
            setAttachments(prev => [...prev, saved]);
        } catch (error: any) {
            if (uploadedFilePath) supabase.storage.from('tactical-attachments').remove([uploadedFilePath]).catch(() => {});
            alert(`Erro ao fazer upload: ${error?.message || String(error)}`);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDeleteAttachment = async (att: TacticalAttachment) => {
        if (!window.confirm(`Excluir o anexo "${att.file_name}"?`)) return;
        try {
            await deleteAttachment(att.id, att.file_path);
            setAttachments(prev => prev.filter(a => a.id !== att.id));
        } catch (e) { console.error(e); }
    };

    const getFileIcon = (fileType?: string) => {
        if (!fileType) return <File size={16} />;
        if (fileType.startsWith('image/')) return <FileImage size={16} />;
        if (fileType.startsWith('video/')) return <FileVideo size={16} />;
        if (fileType.includes('pdf') || fileType.includes('document') || fileType.includes('text')) return <FileText size={16} />;
        return <File size={16} />;
    };

    const formatFileSize = (bytes?: number) => {
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const addChecklistItem = () => {
        if (!newChecklistTitle.trim()) return;
        setChecklists([...checklists, { id: Date.now().toString(), title: newChecklistTitle, completed: false, assignee: null, due_date: null }]);
        setNewChecklistTitle('');
    };

    const updateChecklistItem = (id: string, updates: Partial<{ title: string, assignee: string | null, due_date: string | null }>) => {
        setChecklists(c => c.map(ci => ci.id === id ? { ...ci, ...updates } : ci));
    };

    const ScoreSlider = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
        <div>
            <div className="flex justify-between items-center mb-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">{label}</label>
                <span className="text-xs font-bold text-[#A68B4B]">{value}/10</span>
            </div>
            <input
                type="range"
                min={1}
                max={10}
                value={value}
                onChange={e => onChange(parseInt(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none bg-gray-200 dark:bg-[#2e2e2e] accent-[#A68B4B]"
            />
        </div>
    );

    const sections = [
        { key: 'main' as const, label: 'Detalhes' },
        { key: 'scoring' as const, label: `ICE (${iceScore})` },
        ...(task ? [
            { key: 'comments' as const, label: `Comentários${comments.length > 0 ? ` (${comments.length})` : ''}` },
            { key: 'attachments' as const, label: `Anexos${attachments.length > 0 ? ` (${attachments.length})` : ''}` },
        ] : []),
    ];

    const otherTasks = allTasks.filter(t => t.id !== task?.id);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}
        >
            <div className="bg-white dark:bg-[#1A1A1A] w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-[#2A2A2A] flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-[#2A2A2A] shrink-0">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        {task ? 'Editar Tarefa' : 'Nova Tarefa'}
                    </h2>
                    <button onClick={requestClose} disabled={isSaving} className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50">
                        <X size={24} />
                    </button>
                </div>

                {/* Section Tabs */}
                <div className="flex gap-0 border-b border-gray-100 dark:border-[#2A2A2A] shrink-0 px-6 overflow-x-auto">
                    {sections.map(s => (
                        <button
                            key={s.key}
                            type="button"
                            onClick={() => setActiveSection(s.key)}
                            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeSection === s.key
                                ? 'border-[#A68B4B] text-[#A68B4B]'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                <form id="task-form" onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1">

                    {/* ── MAIN TAB ─────────────────────────────────────────── */}
                    {activeSection === 'main' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Título</label>
                                <input
                                    type="text"
                                    required
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent transition-all outline-none text-gray-900 dark:text-white placeholder-gray-400"
                                    placeholder="Ex: Atualizar contrato..."
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descrição</label>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        rows={3}
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent transition-all outline-none text-gray-900 dark:text-white placeholder-gray-400 resize-none"
                                        placeholder="Detalhes da tarefa..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                                    <select value={status} onChange={e => setStatus(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent outline-none text-gray-900 dark:text-white">
                                        {columns.map(col => <option key={col.title} value={col.title}>{col.title}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prioridade</label>
                                    <select value={priority} onChange={e => setPriority(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent outline-none text-gray-900 dark:text-white">
                                        <option value="Baixa">Baixa</option>
                                        <option value="Média">Média</option>
                                        <option value="Alta">Alta 🔥</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Início</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                                            className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent outline-none text-gray-900 dark:text-white" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prazo</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                                            className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent outline-none text-gray-900 dark:text-white" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                                        <Map size={14} className="text-[#A68B4B]" /> Etapa Estratégica
                                    </label>
                                    <select value={strategicStage} onChange={e => setStrategicStage(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent outline-none text-gray-900 dark:text-white">
                                        {STRATEGIC_STAGES.map(s => <option key={s} value={s}>{s || '— Nenhuma —'}</option>)}
                                    </select>
                                </div>

                                {/* Assignees */}
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Responsáveis</label>
                                    {members.length > 0 ? (
                                        <div className="bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl p-3 max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                                            {members.map(m => (
                                                <label key={m.id} className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-[#2e2e2e] rounded-lg cursor-pointer transition-colors">
                                                    <input type="checkbox" checked={assignees.includes(m.name)} onChange={() => toggleAssignee(m.name)}
                                                        className="w-4 h-4 text-[#A68B4B] border-gray-300 rounded focus:ring-[#A68B4B]" />
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-black shrink-0"
                                                            style={{ backgroundColor: m.avatar_color }}>
                                                            {m.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <span className="text-sm text-gray-700 dark:text-gray-300">{m.name}</span>
                                                            {m.role && <span className="ml-2 text-[10px] text-gray-400">{m.role}</span>}
                                                        </div>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl p-3">
                                            Nenhum membro cadastrado. Adicione membros na aba <strong>Equipe</strong>.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Dependencies */}
                            {otherTasks.length > 0 && (
                                <div className="pt-4 border-t border-gray-100 dark:border-[#2A2A2A]">
                                    <label className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white mb-3">
                                        <Link size={16} className="text-[#A68B4B]" /> Depende de
                                        {dependsOn.length > 0 && <span className="text-xs text-gray-400">({dependsOn.length} selecionada{dependsOn.length > 1 ? 's' : ''})</span>}
                                    </label>
                                    <div className="bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-xl p-3 max-h-40 overflow-y-auto space-y-1.5 custom-scrollbar">
                                        {otherTasks.map(t => (
                                            <label key={t.id} className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-[#2e2e2e] rounded-lg cursor-pointer transition-colors">
                                                <input type="checkbox" checked={dependsOn.includes(t.id)} onChange={() => toggleDependency(t.id)}
                                                    className="w-4 h-4 text-[#A68B4B] border-gray-300 rounded focus:ring-[#A68B4B]" />
                                                <div className="flex-1 min-w-0">
                                                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate block">{t.title}</span>
                                                    <span className="text-[10px] text-gray-400">{t.status} · {t.priority}</span>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Checklists */}
                            <div className="pt-4 border-t border-gray-100 dark:border-[#2A2A2A]">
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white mb-4">
                                    <CheckCircle2 size={18} className="text-[#A68B4B]" /> Checklist
                                </label>
                                <div className="flex items-center gap-2 mb-4">
                                    <input
                                        type="text"
                                        value={newChecklistTitle}
                                        onChange={e => setNewChecklistTitle(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); } }}
                                        className="flex-1 px-4 py-2 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-lg focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent transition-all outline-none text-gray-900 dark:text-white placeholder-gray-500 text-sm"
                                        placeholder="Adicionar item..."
                                    />
                                    <button type="button" onClick={addChecklistItem} disabled={!newChecklistTitle.trim()}
                                        className="p-2.5 bg-gray-100 dark:bg-[#2e2e2e] text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-[#3f3f3f] transition-colors disabled:opacity-50">
                                        <Plus size={18} />
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {checklists.map(check => {
                                        const itemDueDate = check.due_date ? check.due_date.split('T')[0] : '';
                                        const isItemOverdue = itemDueDate && !check.completed && new Date(itemDueDate) < new Date(new Date().toISOString().split('T')[0]);
                                        return (
                                            <div key={check.id} className="group bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-lg p-2.5 space-y-2">
                                                <div className="flex items-start gap-3">
                                                    <button type="button" className="mt-1 flex-shrink-0" onClick={() => setChecklists(c => c.map(ci => ci.id === check.id ? { ...ci, completed: !ci.completed } : ci))}>
                                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${check.completed ? 'bg-[#A68B4B] border-[#A68B4B] text-black' : 'border-gray-300 dark:border-gray-600'}`}>
                                                            {check.completed && <CheckCircle2 size={14} />}
                                                        </div>
                                                    </button>
                                                    <input
                                                        type="text"
                                                        value={check.title}
                                                        onChange={e => updateChecklistItem(check.id, { title: e.target.value })}
                                                        className={`flex-1 text-sm pt-1 bg-transparent border-none outline-none focus:ring-0 transition-all ${check.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}
                                                    />
                                                    <button type="button" onClick={() => setChecklists(c => c.filter(ci => ci.id !== check.id))}
                                                        className="p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all mt-0.5">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-8">
                                                    <select
                                                        value={check.assignee || ''}
                                                        onChange={e => updateChecklistItem(check.id, { assignee: e.target.value || null })}
                                                        className="px-3 py-1.5 text-xs bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A] rounded-md focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent outline-none text-gray-700 dark:text-gray-300"
                                                    >
                                                        <option value="">— Responsável —</option>
                                                        {members.map(m => (
                                                            <option key={m.id} value={m.name}>{m.name}</option>
                                                        ))}
                                                    </select>
                                                    <div className="relative">
                                                        <Calendar className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${isItemOverdue ? 'text-red-500' : 'text-gray-400'}`} size={14} />
                                                        <input
                                                            type="date"
                                                            value={itemDueDate}
                                                            onChange={e => updateChecklistItem(check.id, { due_date: e.target.value || null })}
                                                            className={`w-full pl-8 pr-2 py-1.5 text-xs bg-white dark:bg-[#1A1A1A] border rounded-md focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent outline-none ${isItemOverdue ? 'border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400' : 'border-gray-200 dark:border-[#2A2A2A] text-gray-700 dark:text-gray-300'}`}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── ICE SCORING TAB ───────────────────────────────────── */}
                    {activeSection === 'scoring' && (
                        <div className="space-y-6">
                            <div className="bg-gradient-to-r from-[#A68B4B]/10 to-[#C8A96E]/5 border border-[#A68B4B]/20 rounded-2xl p-5 text-center">
                                <p className="text-sm text-gray-500 mb-1">ICE Score</p>
                                <p className="text-4xl font-bold text-[#A68B4B]">{iceScore}</p>
                                <p className="text-xs text-gray-400 mt-1">Impacto × Confiança × Facilidade</p>
                                <div className="flex justify-center gap-2 mt-3 flex-wrap">
                                    {iceScore >= 500 && <span className="px-2 py-1 text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 rounded-md">Alta Prioridade</span>}
                                    {iceScore >= 200 && iceScore < 500 && <span className="px-2 py-1 text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 rounded-md">Média Prioridade</span>}
                                    {iceScore < 200 && <span className="px-2 py-1 text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20 rounded-md">Baixa Prioridade</span>}
                                </div>
                            </div>

                            <div className="bg-white dark:bg-[#141414] rounded-2xl p-5 border border-gray-200 dark:border-[#2A2A2A] space-y-5">
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <Zap size={16} className="text-[#A68B4B]" />
                                        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Metodologia ICE</h3>
                                    </div>
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        ICE = Impacto × Confiança × Facilidade. Cada dimensão de 1 a 10.<br />
                                        Score máximo: 1.000. Foque nas tarefas com maior score.
                                    </p>
                                </div>

                                <ScoreSlider
                                    label="Impacto — qual o potencial de resultado desta tarefa? (1=mínimo, 10=transformador)"
                                    value={iceImpact}
                                    onChange={setIceImpact}
                                />
                                <ScoreSlider
                                    label="Confiança — quão certo você está que terá esse impacto? (1=incerto, 10=garantido)"
                                    value={iceConfidence}
                                    onChange={setIceConfidence}
                                />
                                <ScoreSlider
                                    label="Facilidade — quão fácil é executar? (1=muito difícil, 10=trivial)"
                                    value={iceEase}
                                    onChange={setIceEase}
                                />
                            </div>
                        </div>
                    )}

                    {/* ── COMMENTS TAB ──────────────────────────────────────── */}
                    {activeSection === 'comments' && task && (
                        <div className="space-y-4">
                            {isLoadingComments ? (
                                <p className="text-sm text-gray-500">Carregando...</p>
                            ) : comments.length === 0 ? (
                                <div className="text-center py-8 text-gray-400">
                                    <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">Nenhum comentário ainda.</p>
                                </div>
                            ) : (
                                comments.map(comment => (
                                    <div key={comment.id} className="bg-gray-50 dark:bg-[#141414] p-3 rounded-lg border border-gray-100 dark:border-[#2A2A2A]">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#A68B4B] to-[#9A7209] flex items-center justify-center text-[9px] font-bold text-black min-w-[20px]">
                                                {(comment.profiles?.full_name || comment.profiles?.email || '?').charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                                                {comment.profiles?.full_name || comment.profiles?.email || 'Usuário'}
                                            </span>
                                            <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                                {new Date(comment.created_at).toLocaleString('pt-BR')}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap pl-7">{comment.content}</p>
                                    </div>
                                ))
                            )}
                            <div className="flex items-end gap-2">
                                <textarea
                                    value={newComment}
                                    onChange={e => setNewComment(e.target.value)}
                                    className="flex-1 px-3 py-2 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-lg focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent transition-all outline-none text-gray-900 dark:text-white placeholder-gray-500 text-sm resize-none custom-scrollbar"
                                    placeholder="Escreva um comentário..."
                                    rows={2}
                                />
                                <button type="button" onClick={handleSendComment} disabled={!newComment.trim() || isSendingComment}
                                    className="p-2.5 bg-[#A68B4B] text-black rounded-lg hover:bg-[#C8A96E] transition-colors disabled:opacity-50 flex items-center justify-center shrink-0 mb-0.5">
                                    {isSendingComment ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Send size={16} />}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── ATTACHMENTS TAB ───────────────────────────────────── */}
                    {activeSection === 'attachments' && task && (
                        <div className="space-y-4">
                            <div className="flex justify-end">
                                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-[#2e2e2e] hover:bg-gray-200 dark:hover:bg-[#3f3f3f] rounded-lg transition-colors disabled:opacity-50 border border-gray-200 dark:border-[#333]">
                                    {isUploading ? <div className="w-3.5 h-3.5 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" /> : <Plus size={14} />}
                                    {isUploading ? 'Enviando...' : 'Adicionar arquivo'}
                                </button>
                                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
                            </div>

                            {isLoadingAttachments ? (
                                <p className="text-sm text-gray-500">Carregando...</p>
                            ) : attachments.length === 0 ? (
                                <div className="text-center py-8 text-gray-400">
                                    <Paperclip size={32} className="mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">Nenhum anexo ainda.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {attachments.map(att => (
                                        <div key={att.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-[#141414] border border-gray-100 dark:border-[#2A2A2A] rounded-lg group">
                                            <span className="text-[#A68B4B] shrink-0">{getFileIcon(att.file_type)}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{att.file_name}</p>
                                                {att.file_size && <p className="text-[11px] text-gray-400">{formatFileSize(att.file_size)}</p>}
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <a href={att.file_url} target="_blank" rel="noopener noreferrer" download={att.file_name}
                                                    className="p-1.5 text-gray-400 hover:text-[#A68B4B] rounded-md transition-colors" title="Baixar">
                                                    <Download size={15} />
                                                </a>
                                                <button type="button" onClick={() => handleDeleteAttachment(att)}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-md transition-colors opacity-0 group-hover:opacity-100" title="Excluir">
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </form>

                <div className="p-6 flex flex-col gap-3 shrink-0 bg-gray-50 dark:bg-[#1A1A1A] rounded-b-2xl border-t border-gray-200 dark:border-[#2A2A2A]">
                    {saveError && (
                        <div className="px-4 py-2.5 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 text-sm rounded-lg border border-red-200 dark:border-red-500/20">
                            {saveError}
                        </div>
                    )}
                    <div className="flex justify-between gap-3 flex-wrap">
                        <div className="flex gap-3 flex-wrap">
                            {task && onDelete && (
                                <button type="button" onClick={async () => {
                                    if (window.confirm("Tem certeza que deseja excluir esta tarefa?")) {
                                        setIsSaving(true);
                                        try { await onDelete(task.id); onClose(); }
                                        finally { setIsSaving(false); }
                                    }
                                }} disabled={isSaving}
                                    className="px-5 py-2.5 rounded-xl text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-500/10 border border-transparent hover:border-red-200 dark:hover:border-red-500/20 transition-all flex items-center gap-2 disabled:opacity-50">
                                    <Trash2 size={18} /> Excluir
                                </button>
                            )}
                            {task && onDuplicate && (
                                <button type="button" onClick={handleDuplicate} disabled={isSaving || !title.trim()}
                                    className="px-5 py-2.5 rounded-xl text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-[#2e2e2e] border border-transparent hover:border-gray-300 dark:hover:border-[#333] transition-all flex items-center gap-2 disabled:opacity-50">
                                    <Copy size={18} /> Duplicar
                                </button>
                            )}
                            {task && onArchive && (
                                <button type="button" onClick={async () => {
                                    setIsSaving(true);
                                    try { await onArchive(task.id); onClose(); }
                                    catch (e: any) { setSaveError(e?.message || 'Não foi possível arquivar a tarefa.'); }
                                    finally { setIsSaving(false); }
                                }} disabled={isSaving}
                                    className="px-5 py-2.5 rounded-xl text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-[#2e2e2e] border border-transparent hover:border-gray-300 dark:hover:border-[#333] transition-all flex items-center gap-2 disabled:opacity-50"
                                    title="Arquivar tarefa (mantém o histórico, some do board)">
                                    <Archive size={18} /> Arquivar
                                </button>
                            )}
                            <button type="button" onClick={requestClose} disabled={isSaving}
                                className="px-5 py-2.5 rounded-xl text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-200 dark:hover:bg-[#2e2e2e] transition-colors disabled:opacity-50">
                                Fechar
                            </button>
                        </div>
                        <button type="submit" form="task-form" disabled={isSaving || !title.trim()}
                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#A68B4B] to-[#C8A96E] text-black font-bold shadow-lg shadow-[#A68B4B]/20 hover:shadow-[#A68B4B]/40 transform hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                            {isSaving ? <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <><Save size={18} /> Salvar</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
