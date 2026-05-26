import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const { data, error } = await admin().from('erp_empresas').select('*').order('razao_social')
  if (error) return fail(error.message, 500)
  return ok(data || [])
}

export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  if (!body.razao_social) return fail('Razao social obrigatoria')
  const { data, error } = await admin().from('erp_empresas').insert(body).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
