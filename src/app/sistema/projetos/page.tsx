import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { KanbanBoard } from '@/components/admin/kanban/KanbanBoard';
import { getTasks, getColumns } from '@/app/sistema/actions/tactical-tasks';
import { getMembers } from '@/app/sistema/actions/tactical-strategic';

export const dynamic = 'force-dynamic';

export default async function TacticalPlanPage() {
    const [tasks, columns, members] = await Promise.all([
        getTasks(),
        getColumns(),
        getMembers(),
    ]);

    return (
        <div className="h-full min-h-[500px] flex flex-col resize-y overflow-auto border-b border-gray-200/50 dark:border-[#333]/50 pb-2">
            <div className="mb-6 flex justify-between items-end shrink-0">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
                        Projetos
                    </h1>
                    <p className="text-gray-500 mt-2">
                        Gerencie as tarefas e prioridades da equipe.
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-hidden">
                <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 size={28} className="animate-spin text-[#A68B4B]" /></div>}>
                    <KanbanBoard
                        initialTasks={tasks || []}
                        initialColumns={columns || []}
                        initialMembers={members || []}
                    />
                </Suspense>
            </div>
        </div>
    );
}
