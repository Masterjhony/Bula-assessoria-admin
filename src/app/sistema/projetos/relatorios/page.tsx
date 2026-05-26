import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { getTasks } from '@/app/sistema/actions/tactical-tasks';
import { getMembers } from '@/app/sistema/actions/tactical-strategic';
import { RelatoriosClient } from '@/components/admin/tactical-plan/RelatoriosClient';

export const dynamic = 'force-dynamic';

export default async function RelatoriosOperacionaisPage() {
    const [tasks, members] = await Promise.all([
        getTasks(),
        getMembers(),
    ]);

    return (
        <div className="h-full min-h-[500px] flex flex-col pb-6">
            <Suspense fallback={
                <div className="flex items-center justify-center py-24">
                    <Loader2 size={28} className="animate-spin text-[#A0792E]" />
                </div>
            }>
                <RelatoriosClient
                    initialTasks={tasks || []}
                    initialMembers={members || []}
                />
            </Suspense>
        </div>
    );
}
