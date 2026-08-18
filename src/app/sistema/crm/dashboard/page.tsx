import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { CRMGrowthDashboard } from '@/components/admin/crm/CRMGrowthDashboard'
import { getLeads, getArchivedLeads } from '@/app/sistema/actions/crm-leads'
import { getCRMConfig } from '@/app/sistema/actions/crm-config'
import { carregaFunilAoVivo } from '@/lib/funil-campanhas-live'

export const dynamic = 'force-dynamic'

export default async function CRMDashboardPage() {
  // Atendimento WhatsApp saiu deste dashboard (pedido do chefe, 18/08/2026) —
  // a métrica vive em /sistema/crm/atendimento e nos Relatórios.
  const [leads, archived, crmConfig, funil] = await Promise.all([
    getLeads(),
    getArchivedLeads(),
    getCRMConfig(),
    // relê a planilha a cada carregamento; se falhar, devolve a última apuração
    // já marcada como congelada (nunca derruba a página)
    carregaFunilAoVivo(),
  ])

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 size={24} className="animate-spin text-[var(--gold)]" />
        </div>
      }
    >
      <CRMGrowthDashboard leads={leads || []} archived={archived || []} crmConfig={crmConfig} funil={funil} />
    </Suspense>
  )
}
