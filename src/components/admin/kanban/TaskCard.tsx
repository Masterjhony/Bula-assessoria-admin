'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, CheckSquare, MessageSquare, Paperclip, Zap, Link, AlertTriangle, Clock, Smartphone } from 'lucide-react';
import { TacticalTask } from '@/app/sistema/actions/tactical-tasks';

interface TaskCardProps {
    task: TacticalTask;
    onClick: (task: TacticalTask) => void;
    allTasks?: TacticalTask[];
    doneStatus?: string;
}

function iceScore(t: TacticalTask) {
    const i = t.ice_impact ?? 5;
    const c = t.ice_confidence ?? 5;
    const e = t.ice_ease ?? 5;
    return i * c * e;
}

export function TaskCard({ task, onClick, allTasks = [], doneStatus }: TaskCardProps) {
    const {
        setNodeRef,
        attributes,
        listeners,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: task.id,
        data: { type: 'Task', task },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const priorityColor = {
        'Alta': 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
        'Média': 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
        'Baixa': 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    }[task.priority] || 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20';

    // Bottleneck / overdue detection
    const now = new Date();
    const isOverdue = task.due_date && task.status !== doneStatus && new Date(task.due_date) < now;
    const staleDays = 7;
    const ref = new Date(task.status_changed_at || task.created_at);
    const daysStale = (now.getTime() - ref.getTime()) / 86400000;
    const isStale = daysStale > staleDays && task.status !== doneStatus;

    // Dependency check: is blocked by an unfinished task?
    const isBlocked = (task.depends_on || []).some(depId => {
        const dep = allTasks.find(t => t.id === depId);
        return dep && dep.status !== doneStatus;
    });

    const score = iceScore(task);
    const scoreUsed = (task.ice_impact ?? 5) !== 5 || (task.ice_confidence ?? 5) !== 5 || (task.ice_ease ?? 5) !== 5;

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="opacity-50 bg-[#262626] p-4 rounded-xl border-2 border-dashed border-[#A0792E]/50 h-[120px]"
            />
        );
    }

    const totalChecklists = task.checklists?.length || 0;
    const completedChecklists = task.checklists?.filter(c => c.completed).length || 0;
    const isChecklistComplete = totalChecklists > 0 && completedChecklists === totalChecklists;
    const commentCount = task.tactical_task_comments?.[0]?.count || 0;
    const attachmentCount = task.tactical_task_attachments?.[0]?.count || 0;

    // Border color based on state
    let borderClass = 'border-gray-200/80 dark:border-[#3f3f3f]/80 hover:border-[#A0792E]/60';
    if (isBlocked) borderClass = 'border-red-400/70 dark:border-red-500/50';
    else if (isOverdue) borderClass = 'border-red-300/70 dark:border-red-500/40';
    else if (isStale) borderClass = 'border-amber-300/70 dark:border-amber-500/40';

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={() => onClick(task)}
            className={`group relative bg-white dark:bg-[#262626] p-5 rounded-xl border ${borderClass} shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 cursor-grab active:cursor-grabbing flex flex-col gap-3`}
        >
            {/* Status badges row */}
            {(isBlocked || isOverdue || isStale || task.whatsapp_group_id) && (
                <div className="flex gap-1.5 flex-wrap -mb-1">
                    {task.whatsapp_group_id && (
                        <span
                            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded bg-green-50 text-green-700 border border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20"
                            title={task.whatsapp_sender_name ? `Criado por ${task.whatsapp_sender_name} via WhatsApp` : 'Criado via WhatsApp'}
                        >
                            <Smartphone size={9} /> WhatsApp
                        </span>
                    )}
                    {isBlocked && (
                        <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded bg-red-50 text-red-600 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
                            <Link size={9} /> Bloqueado
                        </span>
                    )}
                    {isOverdue && !isBlocked && (
                        <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded bg-red-50 text-red-600 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
                            <AlertTriangle size={9} /> Atrasado
                        </span>
                    )}
                    {isStale && !isBlocked && !isOverdue && (
                        <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                            <Clock size={9} /> Parado {Math.round(daysStale)}d
                        </span>
                    )}
                </div>
            )}

            <div className="flex justify-between items-start gap-2">
                <span className={`px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider font-bold border ${priorityColor}`}>
                    {task.priority === 'Alta' ? 'Alta 🔥' : task.priority}
                </span>
                <div className="flex items-center gap-1.5">
                    {scoreUsed && (
                        <div className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-[#A0792E]/10 text-[#A0792E] border border-[#A0792E]/20">
                            <Zap size={9} />
                            {score}
                        </div>
                    )}
                    {task.due_date && (
                        <div className={`flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md border ${isOverdue
                            ? 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/20'
                            : 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-[#2e2e2e] border-gray-100 dark:border-[#3f3f3f]'
                            }`}>
                            <Calendar size={12} />
                            <span>{new Date(task.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                        </div>
                    )}
                </div>
            </div>

            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug line-clamp-2">
                {task.title}
            </h3>

            {task.strategic_stage && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                    {task.strategic_stage}
                </span>
            )}

            {(totalChecklists > 0 || commentCount > 0 || attachmentCount > 0 || (task.assignees && task.assignees.length > 0)) && (
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-[#2e2e2e]">
                    <div className="flex items-center gap-1.5">
                        {totalChecklists > 0 && (
                            <div className={`flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-md flex-shrink-0 transition-colors
                                ${isChecklistComplete ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/50 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20' : 'bg-gray-50 text-gray-500 ring-1 ring-gray-200/50 dark:bg-[#2e2e2e] dark:text-gray-400 dark:ring-[#3f3f3f]'}`}
                            >
                                <CheckSquare size={10} />
                                {completedChecklists}/{totalChecklists}
                            </div>
                        )}
                        {commentCount > 0 && (
                            <div className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md flex-shrink-0 bg-gray-50 text-gray-500 ring-1 ring-gray-200/50 dark:bg-[#2e2e2e] dark:text-gray-400 dark:ring-[#3f3f3f]">
                                <MessageSquare size={10} />
                                {commentCount}
                            </div>
                        )}
                        {attachmentCount > 0 && (
                            <div className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md flex-shrink-0 bg-gray-50 text-gray-500 ring-1 ring-gray-200/50 dark:bg-[#2e2e2e] dark:text-gray-400 dark:ring-[#3f3f3f]">
                                <Paperclip size={10} />
                                {attachmentCount}
                            </div>
                        )}
                    </div>

                    {task.assignees && task.assignees.length > 0 && (() => {
                        const uniqueAssignees = Array.from(new Set(task.assignees));
                        return (
                            <div className="flex pl-2 -space-x-2">
                                {uniqueAssignees.slice(0, 3).map((assignee, index) => (
                                    <div
                                        key={index}
                                        className="w-6 h-6 rounded-full bg-gradient-to-br from-[#A0792E] to-[#9A7209] flex items-center justify-center text-[8px] font-bold text-black border border-[#262626] shrink-0 transform transition-transform hover:scale-110 hover:z-10"
                                        title={assignee}
                                    >
                                        {assignee.charAt(0).toUpperCase()}
                                    </div>
                                ))}
                                {uniqueAssignees.length > 3 && (
                                    <div className="w-6 h-6 rounded-full bg-[#2e2e2e] flex items-center justify-center text-[8px] text-gray-400 border border-[#262626] shrink-0 z-0">
                                        +{uniqueAssignees.length - 3}
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}
