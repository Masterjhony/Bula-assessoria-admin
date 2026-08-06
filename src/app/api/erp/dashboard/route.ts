import { admin, guard, ok, type NextRequest } from '@/lib/erp'
import { computeErpDashboard } from '@/lib/erp-dashboards'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sp = req.nextUrl.searchParams
  return ok(await computeErpDashboard(admin(), { from: sp.get('from'), to: sp.get('to') }))
}
