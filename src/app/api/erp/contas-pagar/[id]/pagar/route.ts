import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

type Ctx = { params: Promise<{ id: string }> }

/** Baixa, banco e partidas gravados na mesma transação com bloqueio de concorrência. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  const { data, error } = await admin().rpc('erp_registrar_pagamento_apurado', { p_id: id, p_dados: body })
  if (error) return fail(error.message, 400)
  return ok(data)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const { data, error } = await admin().rpc('erp_estornar_pagamento_apurado', { p_id: id })
  if (error) return fail(error.message, 400)
  return ok(data)
}
