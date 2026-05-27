import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import FechamentoView from '../FechamentoView'
import { getIsFinanceAdmin } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

export default async function FechamentoPage() {
  const canSeeFinance = await getIsFinanceAdmin()
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="animate-spin text-[#A68B4B]" />
        </div>
      }
    >
      <FechamentoView canSeeFinance={canSeeFinance} />
    </Suspense>
  )
}
