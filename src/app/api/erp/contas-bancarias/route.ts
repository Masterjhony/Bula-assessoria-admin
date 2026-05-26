import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const { data, error } = await admin().from('erp_contas_bancarias').select('*').order('nome')
  if (error) return fail(error.message, 500)
  return ok(data || [])
}

export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  if (!body.nome) return fail('nome obrigatorio')
  if (body.saldo_inicial != null && body.saldo_atual == null) {
    body.saldo_atual = body.saldo_inicial
  }
  const { data, error } = await admin().from('erp_contas_bancarias').insert(body).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
