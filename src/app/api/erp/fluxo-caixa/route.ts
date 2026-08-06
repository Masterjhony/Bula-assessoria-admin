import { admin, guard, ok, type NextRequest } from '@/lib/erp'
import { computeFluxoCaixa } from '@/lib/erp-dashboards'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sp = req.nextUrl.searchParams
  return ok(await computeFluxoCaixa(admin(), {
    dias: Number(sp.get('dias') || 60),
    passado: Number(sp.get('passado') ?? 30),
    gran: sp.get('gran'),
    incluirOrcamento: sp.get('orcamento') !== '0',
  }))
}
