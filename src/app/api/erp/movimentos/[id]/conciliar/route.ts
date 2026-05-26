import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  const conciliado = body.conciliado != null ? !!body.conciliado : true
  const { data, error } = await admin().from('erp_movimentos_bancarios').update({ conciliado }).eq('id', id).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
