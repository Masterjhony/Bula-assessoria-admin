import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const { data, error } = await admin()
    .from('erp_lancamentos')
    .select('*, partidas:erp_lancamento_partidas(*, plano_conta:erp_plano_contas!plano_conta_id(id,codigo,nome), centro:erp_centros_custo!centro_custo_id(id,codigo,nome))')
    .eq('id', id)
    .single()
  if (error) return fail(error.message, 404)
  return ok(data)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const { data, error } = await admin().from('erp_lancamentos').update({ status: 'estornado' }).eq('id', id).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
