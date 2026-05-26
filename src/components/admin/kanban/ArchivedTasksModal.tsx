'use client';

import { useEffect, useState } from 'react';
import { X, ArchiveRestore, Trash2, Search, Loader2, Inbox } from 'lucide-react';
import {
    TacticalTask,
    TacticalUnidade,
    getArchivedTasks,
    unarchiveTask,
    deleteTask,
} from '@/app/sistema/actions/tactical-tasks';

interface ArchivedTasksModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRestore: (task: TacticalTask) => void;
    onDelete: (taskId: string) => void;
    /** Board atual — só lista as tarefas arquivadas dessa operação. */
    board: TacticalUnidade;
}

export function ArchivedTasksModal({ isOpen, onClose, onRestore, onDelete, board }: ArchivedTasksModalProps) {
    const [tasks, setTasks] = useState<TacticalTask[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [actingId, setActingId] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setLoading(true);
        getArchivedTasks()
            .then(data => { if (!cancelled) setTasks(data); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const boardTasks = tasks.filter(t => (t.unidade ?? 'formula_boi') === board);
    const filtered = search.trim()
        ? boardTasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
        : boardTasks;

    const handleRestore = async (task: TacticalTask) => {
        setActingId(task.id);
        try {
            const restored = await unarchiveTask(task.id);
            setTasks(prev => prev.filter(t => t.id !== task.id));
            onRestore(restored);
        } catch (e) { console.error(e); }
        finally { setActingId(null); }
    };

    const handleDelete = async (task: TacticalTask) => {
        if (!window.confirm(`Excluir permanentemente "${task.title}"? Esta ação não pode ser desfeita.`)) return;
        setActingId(task.id);
        try {
            await deleteTask(task.id);
            setTasks(prev => prev.filter(t => t.id !== task.id));
            onDelete(task.id);
        } catch (e) { console.error(e); }
        finally { setActingId(null); }
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white dark:bg-[#262626] w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-[#2e2e2e] flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-[#2e2e2e] shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Arquivados</h2>
                        <p className="text-xs text-gray-500 mt-1">
                            Tarefas arquivadas ficam fora do board mas continuam acessíveis aqui.
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="px-6 pt-4 pb-2 shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por título..."
                            className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#2e2e2e] rounded-lg focus:ring-2 focus:ring-[#A0792E] focus:border-transparent outline-none text-sm text-gray-900 dark:text-white placeholder-gray-500"
                        />
                    </div>
                </div>

                <div className="px-6 py-4 overflow-y-auto custom-scrollbar flex-1 space-y-2">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-gray-400">
                            <Loader2 size={20} className="animate-spin" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <Inbox size={32} className="mx-auto mb-2 opacity-40" />
                            <p className="text-sm">
                                {search.trim() ? 'Nenhuma tarefa arquivada com esse título.' : 'Nenhuma tarefa arquivada.'}
                            </p>
                        </div>
                    ) : (
                        filtered.map(task => (
                            <div
                                key={task.id}
                                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-[#1d1d1d] border border-gray-100 dark:border-[#2e2e2e] rounded-lg group hover:border-gray-200 dark:hover:border-[#3f3f3f] transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{task.title}</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                        {task.status} · {task.priority}
                                        {task.archived_at && (
                                            <> · arquivada em {new Date(task.archived_at).toLocaleDateString('pt-BR')}</>
                                        )}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => handleRestore(task)}
                                        disabled={actingId === task.id}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#3f3f3f] rounded-md hover:border-[#A0792E]/40 hover:text-[#A0792E] transition-colors disabled:opacity-50"
                                        title="Restaurar para o board"
                                    >
                                        <ArchiveRestore size={14} /> Restaurar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(task)}
                                        disabled={actingId === task.id}
                                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-md transition-colors disabled:opacity-50"
                                        title="Excluir permanentemente"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
