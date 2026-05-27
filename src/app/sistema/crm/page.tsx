import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { CRMDashboardClient } from '@/components/admin/crm/CRMDashboardClient'
import { getLeads } from '@/app/sistema/actions/crm-leads'
import { getCRMConfig } from '@/app/sistema/actions/crm-config'

export const dynamic = 'force-dynamic'

export default async function CRMPage() {
  const [leads, crmConfig] = await Promise.all([
    getLeads(),
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
      <CRMDashboardClient initialLeads={leads || []} crmConfig={crmConfig} />
    </Suspense>
  )
}
