import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase'
import AdminJmpAnalytics from '../AdminJmpAnalytics'

export const dynamic = 'force-dynamic'

export default async function AdminJmpAnalyticsPage() {
  const user = await requireUser().catch(() => null)
  if (!user) redirect('/')
  return <AdminJmpAnalytics />
}
