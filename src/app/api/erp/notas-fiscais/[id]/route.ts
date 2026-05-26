import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  const { data, error } = await admin().from('erp_notas_fiscais').update(body).eq('id', id).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const { error } = await admin().from('erp_notas_fiscais').delete().eq('id', id)
  if (error) return fail(error.message, 400)
  return ok({ ok: true })
}
