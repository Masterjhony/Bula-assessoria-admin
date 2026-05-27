'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TaskCard } from './TaskCard';
import { TacticalTask } from '@/app/sistema/actions/tactical-tasks';
import { Plus } from 'lucide-react';

interface TaskColumnProps {
    id: string;
    title: string;
    tasks: TacticalTask[];
    onTaskClick: (task: TacticalTask) => void;
    onAddTask: (status: string) => void;
    onUpdateColumn?: (id: string, newTitle: string) => void;
    onDeleteColumn?: (id: string) => void;
    allTasks?: TacticalTask[];
    doneStatus?: string;
}

export function TaskColumn({ id, title, tasks, onTaskClick, onAddTask, onUpdateColumn, onDeleteColumn, allTasks = [], doneStatus }: TaskColumnProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(title);

    const { setNodeRef } = useDroppable({
        id: id,
        data: {
            type: 'Column',
            status: id,
        },
    });

    const isOverlay = false; // logic to check if being dragged over

    // Cores discretas (tokens Bula). Antes usava saturação alta (red-500, etc.)
    // que destoava da paleta dourado/oliva.
    const columnColors: Record<string, string> = {
        'A fazer':     'bg-[var(--amber-bg)] text-[var(--amber)] border border-[rgba(212,168,67,0.25)]',
        'Em andamento':'bg-[var(--blue-bg)] text-[var(--blue)] border border-[rgba(74,143,191,0.25)]',
        'Completa':    'bg-[var(--olive-bg)] text-[var(--olive)] border border-[rgba(107,143,92,0.25)]',
        'Idéias':      'bg-[var(--gold-dim)] text-[var(--gold)] border border-[rgba(200,169,110,0.25)]',
        'default':     'bg-[var(--s2)] text-[var(--text2)] border border-[var(--border)]',
    };

    const headerColor = columnColors[title] || columnColors['default'];

    return (
        <div
            ref={setNodeRef}
            className="w-[280px] shrink-0 flex flex-col gap-3 bg-[var(--surface)] p-3.5 rounded-[var(--r-lg)] border border-[var(--border)] max-h-full"
        >
            <div className="flex items-center justify-between pointer-events-auto h-8 mb-1">
                {isEditing ? (
                    <input
                        autoFocus
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => {
                            if (editTitle.trim() && editTitle !== title) {
                                onUpdateColumn?.(id, editTitle.trim());
                            }
                            setIsEditing(false);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                if (editTitle.trim() && editTitle !== title) {
                                    onUpdateColumn?.(id, editTitle.trim());
                                }
                                setIsEditing(false);
                            } else if (e.key === 'Escape') {
                                setIsEditing(false);
                                setEditTitle(title);
                            }
                        }}
                        className="w-full px-2 py-1 text-sm bg-white dark:bg-[#141414] border border-[#A68B4B] rounded focus:outline-none"
                    />
                ) : (
                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditing(true)}>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold border ${headerColor}`}>
                            {title}
                            <span className="ml-2 opacity-50 text-[10px]">{tasks.length}</span>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!isEditing && onDeleteColumn && tasks.length === 0 && (
                        <button
                            onClick={() => onDeleteColumn(id)}
                            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-500/20 text-red-400 font-bold transition-all"
                            title="Excluir coluna"
                        >
                            <span className="text-lg leading-none mb-1">×</span>
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onAddTask(id);
                        }}
                        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-[#2e2e2e] text-gray-400 font-bold transition-all"
                        title="Nova tarefa"
                    >
                        <Plus size={14} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pr-1 pb-2 flex flex-col gap-2.5 min-h-[120px]">
                <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    {tasks.map((task) => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            onClick={onTaskClick}
                            allTasks={allTasks}
                            doneStatus={doneStatus}
                        />
                    ))}
                </SortableContext>
                {tasks.length === 0 && (
                    <button
                        onClick={() => onAddTask(id)}
                        className="flex-1 min-h-[120px] flex items-center justify-center text-[12px] subtle border border-dashed border-[var(--border)] rounded-[var(--r)] hover:border-[var(--gold)] hover:text-[var(--gold)] transition-colors"
                    >
                        + Adicionar tarefa
                    </button>
                )}
            </div>
        </div>
    );
}
