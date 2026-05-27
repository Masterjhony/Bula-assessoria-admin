import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { KanbanBoard } from '@/components/admin/kanban/KanbanBoard'
import { getTasks, getColumns } from '@/app/sistema/actions/tactical-tasks'
import { getMembers } from '@/app/sistema/actions/tactical-strategic'

export const dynamic = 'force-dynamic'

export default async function TacticalPlanPage() {
  const [tasks, columns, members] = await Promise.all([
    getTasks(),
    getColumns(),
    getMembers(),
  ])

  return (
    <div className="h-full flex flex-col">
      <div className="page-head">
        <h1>
          <small>Operações</small>
          Projetos
          <span className="block text-[12px] font-normal subtle mt-2">
            Gerencie tarefas e prioridades da equipe.
          </span>
        </h1>
      </div>

      <div className="flex-1 min-h-0">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-24">
              <Loader2 size={24} className="animate-spin text-[var(--gold)]" />
            </div>
          }
        >
          <KanbanBoard
            initialTasks={tasks || []}
            initialColumns={columns || []}
            initialMembers={members || []}
          />
        </Suspense>
      </div>
    </div>
  )
}
