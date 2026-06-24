import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const { data, error } = await admin()
    .from('erp_cartoes')
    .select('*, conta_pagamento:erp_contas_bancarias!conta_pagamento_id(id,nome,cor)')
    .order('apelido')
  if (error) return fail(error.message, 500)
  return ok(data || [])
}

export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  if (!body.apelido) return fail('apelido obrigatorio')
  const { data, error } = await admin().from('erp_cartoes').insert(body).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
