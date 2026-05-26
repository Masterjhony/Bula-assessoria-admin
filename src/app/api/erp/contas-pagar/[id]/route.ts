import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const { data, error } = await admin().from('erp_contas_pagar').select('*').eq('id', id).single()
  if (error) return fail(error.message, 404)
  return ok(data)
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  const { data, error } = await admin().from('erp_contas_pagar').update(body).eq('id', id).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  // remove movimentos vinculados primeiro (caso ja foi pago)
  await admin().from('erp_movimentos_bancarios').delete().eq('conta_pagar_id', id)
  const { error } = await admin().from('erp_contas_pagar').delete().eq('id', id)
  if (error) return fail(error.message, 400)
  return ok({ ok: true })
}
