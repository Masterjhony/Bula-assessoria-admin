import { Suspense } from 'react'
import { Loader2, ShieldAlert } from 'lucide-react'
import FechamentoFinanceiroView from './FechamentoFinanceiroView'
import { getIsFinanceAdmin } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

export default async function FechamentoFinanceiroPage() {
  const canSeeFinance = await getIsFinanceAdmin()

  if (!canSeeFinance) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
          <ShieldAlert size={24} className="text-red-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Acesso restrito</p>
          <p className="text-xs text-gray-400 mt-1">Só a diretoria financeira pode acessar Fechamento Leilões (ERP).</p>
        </div>
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="animate-spin text-[#A68B4B]" />
        </div>
      }
    >
      <FechamentoFinanceiroView />
    </Suspense>
  )
}
