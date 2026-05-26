import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

type Ctx = { params: { id: string } }

export async function POST(req: NextRequest, ctx: Ctx) {
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  const conciliado = body.conciliado != null ? !!body.conciliado : true
  const { data, error } = await admin().from('erp_movimentos_bancarios').update({ conciliado }).eq('id', ctx.params.id).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
