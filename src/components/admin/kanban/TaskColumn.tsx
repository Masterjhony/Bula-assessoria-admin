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

    const columnColors: Record<string, string> = {
        'A fazer': 'bg-red-500/10 text-red-500 border-red-500/20',
        'Em andamento': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        'Completa': 'bg-green-500/10 text-green-500 border-green-500/20',
        'default': 'bg-gray-500/10 text-gray-500 border-gray-500/20'
    };

    const headerColor = columnColors[title] || columnColors['default'];

    return (
        <div
            ref={setNodeRef}
            className="w-[350px] shrink-0 flex flex-col gap-4 bg-gray-50/80 dark:bg-[#1d1d1d]/80 p-4 rounded-2xl border border-gray-200 dark:border-[#2e2e2e] max-h-full"
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
                        className="w-full px-2 py-1 text-sm bg-white dark:bg-[#1d1d1d] border border-[#A0792E] rounded focus:outline-none"
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

            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pr-2 pb-2 flex flex-col gap-3 min-h-[150px]">
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
            </div>
        </div>
    );
}
