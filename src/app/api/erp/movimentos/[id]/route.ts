import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  const { data, error } = await admin().from('erp_movimentos_bancarios').update(body).eq('id', id).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  // Se for parte de uma transferencia, remove o par tambem
  const { data: mov } = await admin().from('erp_movimentos_bancarios').select('transferencia_par_id').eq('id', id).maybeSingle()
  if (mov?.transferencia_par_id) {
    await admin().from('erp_movimentos_bancarios').delete().eq('id', mov.transferencia_par_id)
  }
  const { error } = await admin().from('erp_movimentos_bancarios').delete().eq('id', id)
  if (error) return fail(error.message, 400)
  return ok({ ok: true })
}
