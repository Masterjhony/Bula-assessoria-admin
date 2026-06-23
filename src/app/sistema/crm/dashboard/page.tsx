import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { CRMGrowthDashboard } from '@/components/admin/crm/CRMGrowthDashboard'
import { getLeads, getArchivedLeads } from '@/app/sistema/actions/crm-leads'
import { getCRMConfig } from '@/app/sistema/actions/crm-config'

export const dynamic = 'force-dynamic'

export default async function CRMDashboardPage() {
  const [leads, archived, crmConfig] = await Promise.all([
    getLeads(),
    getArchivedLeads(),
    getCRMConfig(),
  ])

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 size={24} className="animate-spin text-[var(--gold)]" />
        </div>
      }
    >
      <CRMGrowthDashboard leads={leads || []} archived={archived || []} crmConfig={crmConfig} />
    </Suspense>
  )
}
