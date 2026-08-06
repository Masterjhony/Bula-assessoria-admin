import { admin, guard, ok, type NextRequest } from '@/lib/erp'
import { computeDre } from '@/lib/erp-dashboards'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sp = req.nextUrl.searchParams
  return ok(await computeDre(admin(), {
    from: sp.get('from'),
    to: sp.get('to'),
    regime: (sp.get('regime') || 'caixa') as 'caixa' | 'competencia',
  }))
}
