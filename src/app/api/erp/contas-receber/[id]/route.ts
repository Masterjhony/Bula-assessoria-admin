import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'
import { aplicarPrazoRecebimento } from '@/lib/erp-prazos'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const { data, error } = await admin().from('erp_contas_receber').select('*').eq('id', id).single()
  if (error) return fail(error.message, 404)
  return ok(data)
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  const sb = admin()
  const { data: atual, error: readError } = await sb.from('erp_contas_receber').select('*').eq('id', id).single()
  if (readError || !atual) return fail(readError?.message || 'Título não encontrado', 404)
  let patch: Record<string, unknown>
  try { patch = aplicarPrazoRecebimento(body, atual) }
  catch (error) { return fail((error as Error).message) }
  const { data, error } = await sb.from('erp_contas_receber').update(patch).eq('id', id).eq('updated_at', atual.updated_at).select('*').maybeSingle()
  if (error) return fail(error.message, 400)
  if (!data) return fail('O título mudou durante a edição. Recarregue antes de salvar.', 409)
  return ok(data)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  await admin().from('erp_movimentos_bancarios').delete().eq('conta_receber_id', id)
  const { error } = await admin().from('erp_contas_receber').delete().eq('id', id)
  if (error) return fail(error.message, 400)
  return ok({ ok: true })
}
