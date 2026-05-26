import { OKRPageClient } from '@/components/admin/okr/OKRPageClient';
import { getObjectives, getRisks, getDecisions, getFlows } from '@/app/sistema/actions/tactical-strategic';
import { getTasks, getColumns } from '@/app/sistema/actions/tactical-tasks';
import { getOKRSnapshot } from '@/app/sistema/actions/okr-snapshot';

export const dynamic = 'force-dynamic';

export default async function OKRPage() {
    const [objectives, risks, decisions, flows, tasks, columns, snapshot] = await Promise.all([
        getObjectives(),
        getRisks(),
        getDecisions(),
        getFlows(),
        getTasks(),
        getColumns(),
        getOKRSnapshot(),
    ]);

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 overflow-hidden">
                <OKRPageClient
                    initialObjectives={objectives || []}
                    initialRisks={risks || []}
                    initialDecisions={decisions || []}
                    initialFlows={flows || []}
                    initialTasks={tasks || []}
                    initialColumns={columns || []}
                    snapshot={snapshot}
                />
            </div>
        </div>
    );
}
