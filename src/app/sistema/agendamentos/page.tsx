import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { AgendamentosClient } from '@/components/admin/agendamentos/AgendamentosClient'

export const dynamic = 'force-dynamic'

export default function AgendamentosPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center py-24">
                <Loader2 size={28} className="animate-spin text-[#A68B4B]" />
            </div>
        }>
            <AgendamentosClient />
        </Suspense>
    )
}
