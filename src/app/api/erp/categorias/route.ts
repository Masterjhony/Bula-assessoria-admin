import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const tipo = req.nextUrl.searchParams.get('tipo')
  let q = admin().from('erp_categorias').select('*').order('nome')
  if (tipo) q = q.eq('tipo', tipo)
  const { data, error } = await q
  if (error) return fail(error.message, 500)
  return ok(data || [])
}

export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  if (!body.nome || !body.tipo) return fail('nome e tipo sao obrigatorios')
  const { data, error } = await admin().from('erp_categorias').insert(body).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
