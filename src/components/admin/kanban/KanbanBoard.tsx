'use client';

import { useState, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
    DndContext,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    DragStartEvent,
    DragOverEvent,
    DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { TaskColumn } from './TaskColumn';
import { TaskCardView } from './TaskCard';
import { TaskModal } from './TaskModal';
import { GanttView } from './GanttView';
import { WhiteboardView } from './WhiteboardView';
import { MembersView } from './MembersView';
import { ArchivedTasksModal } from './ArchivedTasksModal';
import {
    TacticalTask, TacticalColumn, TacticalUnidade,
    updateTask, createTask, moveTask, deleteTask,
    createColumn, updateColumn, deleteColumn, reorderColumns,
    archiveTask,
} from '@/app/sistema/actions/tactical-tasks';
import {
    TacticalMember,
} from '@/app/sistema/actions/tactical-strategic';
import { createPortal } from 'react-dom';
import {
    Plus, LayoutGrid, Calendar as CalendarIcon, Filter, Maximize2, Minimize2,
    Presentation, Eye, Users, Archive,
} from 'lucide-react';

type ViewMode = 'kanban' | 'gantt' | 'whiteboard' | 'members';
const VALID_VIEWS: ViewMode[] = ['kanban', 'gantt', 'whiteboard', 'members'];

// Board único no web-bula. Mantemos o tipo TacticalUnidade compatível
// com o schema do banco (que ainda aceita 'formula_boi' | 'bula_formula'
// por causa da origem das migrations), mas a UI usa só um board "bula".
const ACTIVE_BOARD: TacticalUnidade = 'bula_formula';

interface KanbanBoardProps {
    initialTasks: TacticalTask[];
    initialColumns: TacticalColumn[];
    initialMembers: TacticalMember[];
}

export function KanbanBoard({
    initialTasks,
    initialColumns,
    initialMembers,
}: KanbanBoardProps) {
    const [tasks, setTasks] = useState<TacticalTask[]>(initialTasks);
    const [columns, setColumns] = useState<TacticalColumn[]>(initialColumns);
    const [members, setMembers] = useState<TacticalMember[]>(initialMembers);

    const [isCreatingColumn, setIsCreatingColumn] = useState(false);
    const [newColumnTitle, setNewColumnTitle] = useState('');
    const [activeTask, setActiveTask] = useState<TacticalTask | null>(null);
    // Modal "novo" (sem id) é estado local; modal de edição é derivado de `?task=<id>`.
    const [isCreatingTask, setIsCreatingTask] = useState(false);
    const [defaultStatus, setDefaultStatus] = useState('A fazer');

    // Deep-link: `?view=<kanban|gantt|…>` controla a aba ativa,
    // `?task=<id>` controla qual tarefa está aberta no modal.
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const rawView = searchParams.get('view');
    const viewMode: ViewMode = (rawView && (VALID_VIEWS as string[]).includes(rawView))
        ? (rawView as ViewMode) : 'kanban';
    // Board único no web-bula — sem switcher de operação.
    const board: TacticalUnidade = ACTIVE_BOARD;
    const editingTaskId = searchParams.get('task');
    const editingTask = useMemo<TacticalTask | undefined>(
        () => (editingTaskId ? tasks.find(t => t.id === editingTaskId) : undefined),
        [tasks, editingTaskId]
    );
    const isModalOpen = isCreatingTask || editingTask != null;

    const updateUrl = useCallback((mutate: (params: URLSearchParams) => void) => {
        const params = new URLSearchParams(searchParams.toString());
        mutate(params);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [router, pathname, searchParams]);

    const setViewMode = (next: ViewMode) => {
        updateUrl(p => { if (next === 'kanban') p.delete('view'); else p.set('view', next); });
    };
    const setEditingTaskId = (id: string | null) => {
        updateUrl(p => { if (id) p.set('task', id); else p.delete('task'); });
    };

    const [filterAssignee, setFilterAssignee] = useState<string>('all');
    const [filterPriority, setFilterPriority] = useState<string>('all');
    const [focusMode, setFocusMode] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isArchivedOpen, setIsArchivedOpen] = useState(false);

    const doneStatus = useMemo(() =>
        columns.find(c =>
            c.title.toLowerCase().includes('complet') || c.title.toLowerCase().includes('conclu')
        )?.title,
        [columns]
    );

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Tarefas do board ativo — base de tudo que a tela mostra.
    const boardTasks = useMemo(
        () => tasks.filter(t => (t.unidade ?? ACTIVE_BOARD) === board),
        [tasks, board]
    );

    const filteredTasks = useMemo(() => {
        let result = boardTasks;
        if (filterAssignee !== 'all') result = result.filter(t => t.assignees?.includes(filterAssignee));
        if (filterPriority !== 'all') result = result.filter(t => t.priority === filterPriority);
        if (focusMode) result = result.filter(t => t.priority === 'Alta' || t.status !== doneStatus);
        return result;
    }, [boardTasks, filterAssignee, filterPriority, focusMode, doneStatus]);

    const assigneeOptions = useMemo(() => {
        const fromTasks = boardTasks.flatMap(t => t.assignees || []);
        return Array.from(new Set(fromTasks)).filter(Boolean);
    }, [boardTasks]);

    const handleTaskClick = (task: TacticalTask) => {
        setEditingTaskId(task.id);
        setIsCreatingTask(false);
    };

    const handleAddTask = (status: string) => {
        setEditingTaskId(null);
        setDefaultStatus(status);
        setIsCreatingTask(true);
    };

    const closeModal = () => {
        setIsCreatingTask(false);
        setEditingTaskId(null);
    };

    const handleSaveTask = async (taskData: any) => {
        if (editingTask) {
            const updated = await updateTask(editingTask.id, taskData);
            setTasks(prev => prev.map(t => t.id === updated.id ? {
                ...updated,
                tactical_task_comments: t.tactical_task_comments,
                tactical_task_attachments: t.tactical_task_attachments,
            } : t));
        } else {
            const newTask = await createTask({ ...taskData, unidade: board });
            setTasks(prev => [...prev, newTask]);
        }
    };

    const handleDuplicateTask = async (taskData: any) => {
        const newTask = await createTask({ ...taskData, unidade: board });
        setTasks(prev => [...prev, newTask]);
    };

    const handleDeleteTask = async (taskId: string) => {
        try {
            await deleteTask(taskId);
            setTasks(tasks.filter(t => t.id !== taskId));
        } catch (e) { console.error('Failed to delete task', e); }
    };

    const handleArchiveTask = async (taskId: string) => {
        try {
            await archiveTask(taskId);
            setTasks(prev => prev.filter(t => t.id !== taskId));
        } catch (e) { console.error('Failed to archive task', e); }
    };

    const handleRestoreTask = (task: TacticalTask) => {
        setTasks(prev => prev.some(t => t.id === task.id) ? prev : [...prev, task]);
    };

    // Move uma coluna para a esquerda (-1) ou direita (+1) e persiste a ordem.
    const handleMoveColumn = async (colId: string, dir: -1 | 1) => {
        const idx = columns.findIndex(c => c.id === colId);
        const target = idx + dir;
        if (idx < 0 || target < 0 || target >= columns.length) return;
        const prev = columns;
        const reordered = arrayMove(columns, idx, target);
        setColumns(reordered); // otimista
        try {
            await reorderColumns(reordered.map(c => c.id));
        } catch (e) {
            console.error('Failed to reorder columns', e);
            setColumns(prev); // rollback
        }
    };

    const handleDeleteFromArchive = (taskId: string) => {
        setTasks(prev => prev.filter(t => t.id !== taskId));
    };

    // Drag Handlers
    const onDragStart = (event: DragStartEvent) => {
        const task = tasks.find(t => t.id === event.active.id);
        if (task) setActiveTask(task);
    };

    const onDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;
        const activeId = active.id;
        const overId = over.id;
        if (activeId === overId) return;

        const isActiveTask = active.data.current?.type === 'Task';
        if (!isActiveTask) return;

        const isOverTask = over.data.current?.type === 'Task';
        const isOverColumn = over.data.current?.type === 'Column';

        setTasks(prev => {
            // Guard: durante o arrasto o dnd-kit pode disparar com um id que ainda
            // não está na lista (reordenamento otimístico em andamento / nó transitório).
            // Sem isso, prev[-1].status lançava TypeError e derrubava a tela.
            const activeIndex = prev.findIndex(t => t.id === activeId);
            if (activeIndex === -1) return prev;
            const activeTask = prev[activeIndex];

            // Sobre outro card: adota o status da coluna do card de destino e reordena.
            if (isOverTask) {
                const overIndex = prev.findIndex(t => t.id === overId);
                if (overIndex === -1) return prev;
                const overTask = prev[overIndex];
                if (activeTask.status !== overTask.status) {
                    // Novo objeto (sem mutar o estado) com o status de destino.
                    const updated = [...prev];
                    updated[activeIndex] = { ...activeTask, status: overTask.status };
                    return arrayMove(updated, activeIndex, overIndex);
                }
                return arrayMove(prev, activeIndex, overIndex);
            }

            // Sobre a área vazia de uma coluna: só troca o status (sem reordenar).
            if (isOverColumn) {
                const newStatus = overId as string;
                if (activeTask.status !== newStatus) {
                    const updated = [...prev];
                    updated[activeIndex] = { ...activeTask, status: newStatus };
                    return updated;
                }
            }

            return prev;
        });
    };

    const onDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveTask(null);
        if (!over) return;

        const activeId = active.id as string;
        const changedTask = tasks.find(t => t.id === activeId);
        if (!changedTask) return;

        const columnTasks = tasks.filter(t =>
            t.status === changedTask.status && (t.unidade ?? ACTIVE_BOARD) === board);
        const indexInColumn = columnTasks.findIndex(t => t.id === changedTask.id);
        const prevTask = columnTasks[indexInColumn - 1];
        const nextTask = columnTasks[indexInColumn + 1];

        let newPosition = changedTask.position;
        if (!prevTask && !nextTask) newPosition = 1000;
        else if (!prevTask) newPosition = (nextTask?.position || 2000) / 2;
        else if (!nextTask) newPosition = (prevTask?.position || 0) + 1000;
        else newPosition = (prevTask.position + nextTask.position) / 2;

        try {
            await moveTask(changedTask.id, changedTask.status, newPosition);
            // Fixa a position calculada no estado otimístico (mantém a ordem após o reload).
            setTasks(prev => prev.map(t => t.id === changedTask.id ? { ...t, position: newPosition } : t));
        } catch (e) {
            console.error('Failed to move task', e);
            setTasks(initialTasks); // rollback para o estado do servidor
        }
    };

    const dropAnimation = {
        sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.5' } } }),
    };

    const viewTabs: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
        { key: 'kanban', label: 'Kanban', icon: <LayoutGrid size={15} /> },
        { key: 'gantt', label: 'Gantt', icon: <CalendarIcon size={15} /> },
        { key: 'whiteboard', label: 'Lousa', icon: <Presentation size={15} /> },
        { key: 'members', label: `Equipe${members.length > 0 ? ` (${members.length})` : ''}`, icon: <Users size={15} /> },
    ];

    const showKanbanFilters = viewMode === 'kanban' || viewMode === 'gantt';

    return (
        <div className={
            isFullscreen
                ? "fixed inset-0 z-[100] bg-[#f9fafb] dark:bg-[#0D0D0D] p-6 w-screen h-screen flex flex-col overflow-hidden"
                : "h-full flex flex-col pt-4"
        }>
            {/* Toolbar */}
            <div className="flex flex-col gap-3 mb-4 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* View Tabs */}
                    <div className="flex gap-1 bg-gray-100 dark:bg-[#1A1A1A] p-1 rounded-xl border border-gray-200 dark:border-[#2A2A2A] overflow-x-auto">
                        {viewTabs.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setViewMode(tab.key)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${viewMode === tab.key
                                    ? 'bg-white dark:bg-[#363636] text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                            >
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Filters — shown for kanban/gantt */}
                        {showKanbanFilters && (
                            <>
                                <div className="flex items-center gap-1.5">
                                    <Filter size={14} className="text-gray-400" />
                                    <select
                                        value={filterAssignee}
                                        onChange={e => setFilterAssignee(e.target.value)}
                                        className="text-sm bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A] rounded-lg px-3 py-1.5 text-gray-700 dark:text-gray-300 outline-none focus:ring-2 focus:ring-[#A68B4B]"
                                    >
                                        <option value="all">Todos</option>
                                        {assigneeOptions.map(name => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </select>
                                </div>
                                <select
                                    value={filterPriority}
                                    onChange={e => setFilterPriority(e.target.value)}
                                    className="text-sm bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A] rounded-lg px-3 py-1.5 text-gray-700 dark:text-gray-300 outline-none focus:ring-2 focus:ring-[#A68B4B]"
                                >
                                    <option value="all">Todas prioridades</option>
                                    <option value="Alta">Alta 🔥</option>
                                    <option value="Média">Média</option>
                                    <option value="Baixa">Baixa</option>
                                </select>
                                <button
                                    onClick={() => setFocusMode(!focusMode)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${focusMode
                                        ? 'bg-[#A68B4B]/10 border-[#A68B4B]/30 text-[#A68B4B]'
                                        : 'bg-white dark:bg-[#1A1A1A] border-gray-200 dark:border-[#2A2A2A] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                        }`}
                                    title="Modo Foco — apenas tarefas críticas"
                                >
                                    <Eye size={14} /> Foco
                                </button>
                            </>
                        )}

                        {(viewMode === 'kanban' || viewMode === 'gantt') && (
                            <button
                                onClick={() => setIsArchivedOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg bg-gray-100 dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A]"
                                title="Tarefas arquivadas"
                            >
                                <Archive size={14} /> Arquivados
                            </button>
                        )}

                        <button
                            onClick={() => setIsFullscreen(!isFullscreen)}
                            className="flex items-center justify-center p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg bg-gray-100 dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A]"
                            title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
                        >
                            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        </button>

                        {(viewMode === 'kanban' || viewMode === 'gantt') && (
                            <button
                                onClick={() => handleAddTask('A fazer')}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#A68B4B] to-[#C8A96E] text-black rounded-lg font-bold hover:shadow-lg hover:shadow-[#A68B4B]/20 transition-all hover:-translate-y-0.5 whitespace-nowrap text-sm"
                            >
                                <Plus size={16} /> Nova Tarefa
                            </button>
                        )}
                    </div>
                </div>

            </div>

            {/* ── Views ── */}
            <div className="flex-1 min-h-[0px] overflow-hidden flex flex-col pb-2">

                {/* KANBAN */}
                {viewMode === 'kanban' && (
                    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
                        <div className="flex-1 flex gap-6 overflow-x-auto overflow-y-hidden custom-scrollbar pb-4 h-full snap-x pr-4">
                            {columns.map((col, colIndex) => (
                                <TaskColumn
                                    key={col.id}
                                    id={col.title}
                                    columnId={col.id}
                                    index={colIndex}
                                    total={columns.length}
                                    onMoveColumn={handleMoveColumn}
                                    title={col.title}
                                    tasks={filteredTasks.filter(t => t.status === col.title)}
                                    onTaskClick={handleTaskClick}
                                    onAddTask={handleAddTask}
                                    allTasks={boardTasks}
                                    doneStatus={doneStatus}
                                    onUpdateColumn={async (id, newTitle) => {
                                        try {
                                            await updateColumn(col.id, newTitle);
                                            setColumns(columns.map(c => c.id === col.id ? { ...c, title: newTitle } : c));
                                            setTasks(tasks.map(t => t.status === id ? { ...t, status: newTitle } : t));
                                        } catch (e) { console.error(e); }
                                    }}
                                    onDeleteColumn={async () => {
                                        try {
                                            await deleteColumn(col.id);
                                            setColumns(columns.filter(c => c.id !== col.id));
                                        } catch (e) { console.error(e); }
                                    }}
                                />
                            ))}
                            {/* New Column */}
                            <div className="shrink-0 w-[320px] bg-gray-50 dark:bg-[#1A1A1A] rounded-2xl p-4 border border-gray-200 dark:border-[#2A2A2A] h-fit">
                                {isCreatingColumn ? (
                                    <input
                                        autoFocus
                                        type="text"
                                        value={newColumnTitle}
                                        onChange={e => setNewColumnTitle(e.target.value)}
                                        onKeyDown={async e => {
                                            if (e.key === 'Enter' && newColumnTitle.trim()) {
                                                try {
                                                    const newCol = await createColumn(newColumnTitle.trim());
                                                    setColumns([...columns, newCol]);
                                                    setNewColumnTitle('');
                                                    setIsCreatingColumn(false);
                                                } catch (err) { console.error(err); }
                                            } else if (e.key === 'Escape') {
                                                setIsCreatingColumn(false);
                                                setNewColumnTitle('');
                                            }
                                        }}
                                        onBlur={() => { setIsCreatingColumn(false); setNewColumnTitle(''); }}
                                        className="w-full px-3 py-2 bg-white dark:bg-[#141414] border border-[#A68B4B] rounded-lg focus:outline-none text-sm text-gray-900 dark:text-white"
                                        placeholder="Nome da coluna..."
                                    />
                                ) : (
                                    <button
                                        onClick={() => setIsCreatingColumn(true)}
                                        className="flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors w-full p-2"
                                    >
                                        <Plus size={18} />
                                        <span className="font-medium text-sm">Adicionar Coluna</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {createPortal(
                            <DragOverlay dropAnimation={dropAnimation}>
                                {activeTask && <TaskCardView task={activeTask} allTasks={boardTasks} doneStatus={doneStatus} />}
                            </DragOverlay>,
                            document.body
                        )}
                    </DndContext>
                )}

                {/* GANTT */}
                {viewMode === 'gantt' && (
                    <div className="flex-1 min-h-[0px] pb-2 pr-2">
                        <GanttView tasks={filteredTasks} onTaskClick={handleTaskClick} />
                    </div>
                )}

                {/* WHITEBOARD — always mounted to avoid state loss */}
                <div className="flex-1 min-h-[0px] pb-2 pr-2 h-full flex-col" style={{ display: viewMode === 'whiteboard' ? 'flex' : 'none' }}>
                    <WhiteboardView />
                </div>

                {/* MEMBERS */}
                {viewMode === 'members' && (
                    <MembersView
                        members={members}
                        onMembersChange={setMembers}
                        tasks={boardTasks}
                    />
                )}

            </div>

            <TaskModal
                isOpen={isModalOpen}
                onClose={closeModal}
                task={editingTask}
                defaultStatus={defaultStatus}
                onSave={handleSaveTask}
                onDelete={handleDeleteTask}
                onDuplicate={handleDuplicateTask}
                onArchive={handleArchiveTask}
                columns={columns}
                allTasks={boardTasks}
                members={members}
            />

            <ArchivedTasksModal
                isOpen={isArchivedOpen}
                onClose={() => setIsArchivedOpen(false)}
                onRestore={handleRestoreTask}
                onDelete={handleDeleteFromArchive}
                board={board}
            />
        </div>
    );
}
