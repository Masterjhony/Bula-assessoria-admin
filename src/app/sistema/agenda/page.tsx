import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { getAgendaEvents, getAgendaRelatedOptions } from '@/app/sistema/actions/agenda';
import { AgendaClient } from '@/components/admin/agenda/AgendaClient';

export const dynamic = 'force-dynamic';

export default async function AgendaPage() {
    // Load a generous window around "today" so month/week/day navigation works
    // without round-tripping for nearby dates. The query is cheap (indexed on
    // start_at) and the volume of events is small.
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString();
    const end   = new Date(now.getFullYear(), now.getMonth() + 12, 1).toISOString();

    const [events, options] = await Promise.all([
        getAgendaEvents(start, end),
        getAgendaRelatedOptions(),
    ]);

    return (
        <Suspense fallback={
            <div className="flex items-center justify-center py-24">
                <Loader2 size={28} className="animate-spin text-[#A68B4B]" />
            </div>
        }>
            <AgendaClient initialEvents={events} options={options} />
        </Suspense>
    );
}
