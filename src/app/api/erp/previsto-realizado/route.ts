import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'
import { computePrevistoRealizado } from '@/lib/erp-previsto-realizado'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  try { return ok(await computePrevistoRealizado(admin(), Number(req.nextUrl.searchParams.get('ano')) || undefined)) }
  catch (e) { return fail(e instanceof Error ? e.message : 'Erro ao montar previsto × realizado.', 500) }
}
