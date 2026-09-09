import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'
import { computeFluxoDetalhe } from '@/lib/erp-fluxo-detalhe'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sp = req.nextUrl.searchParams
  const categoria = (sp.get('categoria') || '').trim()
  const de = (sp.get('de') || '').trim(), ate = (sp.get('ate') || '').trim()
  if (!categoria || !de || !ate) return fail('categoria, de e ate sao obrigatorios')
  try { return ok(await computeFluxoDetalhe(admin(), {categoria,de,ate,incluirOrcamento:sp.get('orcamento')!=='0'})) }
  catch (e) { return fail(e instanceof Error ? e.message : 'Erro ao conferir detalhe do fluxo.', 500) }
}
