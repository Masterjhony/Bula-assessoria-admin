import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const url = new URL(req.url)
  const cartaoId = url.searchParams.get('cartao_id')
  let q = admin()
    .from('erp_cartao_faturas')
    .select('*, cartao:erp_cartoes!cartao_id(id,apelido,bandeira,final,cor)')
    .order('competencia', { ascending: false })
  if (cartaoId) q = q.eq('cartao_id', cartaoId)
  const { data, error } = await q
  if (error) return fail(error.message, 500)
  return ok(data || [])
}

export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  if (!body.cartao_id || !body.competencia) return fail('cartao_id e competencia obrigatorios')
  const { data, error } = await admin().from('erp_cartao_faturas').insert(body).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
