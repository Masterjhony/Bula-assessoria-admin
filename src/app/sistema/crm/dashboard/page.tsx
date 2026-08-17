import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { CRMGrowthDashboard } from '@/components/admin/crm/CRMGrowthDashboard'
import { getLeads, getArchivedLeads } from '@/app/sistema/actions/crm-leads'
import { getCRMConfig } from '@/app/sistema/actions/crm-config'
import { getAtendimentoStats } from '@/app/sistema/actions/atendimento'
import { carregaFunilAoVivo } from '@/lib/funil-campanhas-live'

export const dynamic = 'force-dynamic'

export default async function CRMDashboardPage() {
  const [leads, archived, crmConfig, atendimento, funil] = await Promise.all([
    getLeads(),
    getArchivedLeads(),
    getCRMConfig(),
    getAtendimentoStats().catch(() => null),
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
      <CRMGrowthDashboard leads={leads || []} archived={archived || []} crmConfig={crmConfig} atendimento={atendimento} funil={funil} />
    </Suspense>
  )
}
