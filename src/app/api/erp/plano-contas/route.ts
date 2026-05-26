import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const { data, error } = await admin().from('erp_plano_contas').select('*').order('codigo')
  if (error) return fail(error.message, 500)
  return ok(data || [])
}

export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  if (!body.codigo || !body.nome || !body.tipo) return fail('codigo, nome e tipo sao obrigatorios')
  const { data, error } = await admin().from('erp_plano_contas').insert(body).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
