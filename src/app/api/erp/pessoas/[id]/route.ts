import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, ctx: Ctx) {
  const g = await guard(req); if (g.error) return g.error
  const { data, error } = await admin().from('erp_pessoas').select('*').eq('id', ctx.params.id).single()
  if (error) return fail(error.message, 404)
  return ok(data)
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  const { data, error } = await admin().from('erp_pessoas').update(body).eq('id', ctx.params.id).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const g = await guard(req); if (g.error) return g.error
  const { error } = await admin().from('erp_pessoas').delete().eq('id', ctx.params.id)
  if (error) return fail(error.message, 400)
  return ok({ ok: true })
}
