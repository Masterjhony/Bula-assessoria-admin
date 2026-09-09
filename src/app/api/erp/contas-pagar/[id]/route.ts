import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'
import { aplicarApuracao } from '@/lib/erp-apuracao'
import { prepararPrazoComissao } from '@/lib/erp-comissoes-prazo-adaptador'

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
  const sb = admin()
  const { data: atual, error: leitura } = await sb.from('erp_contas_pagar').select('*').eq('id', id).single()
  if (leitura) return fail(leitura.message, 404)
  let patch: Record<string, unknown>
  try { patch = await prepararPrazoComissao(sb, aplicarApuracao(body, atual), atual) } catch (error) { return fail((error as Error).message) }
  const { data, error } = await sb.from('erp_contas_pagar').update(patch).eq('id', id).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const sb = admin()
  const { data: titulo, error: leitura } = await sb.from('erp_contas_pagar').select('valor_pago').eq('id', id).single()
  if (leitura) return fail(leitura.message, 404)
  const { count, error: vinculo } = await sb.from('erp_movimentos_bancarios').select('id', { count: 'exact', head: true }).eq('conta_pagar_id', id)
  if (vinculo) return fail(vinculo.message, 400)
  if (Number(titulo.valor_pago) > 0 || count) return fail('Título com pagamento vinculado: revise a conciliação antes de excluir')
  const { error } = await admin().from('erp_contas_pagar').delete().eq('id', id)
  if (error) return fail(error.message, 400)
  return ok({ ok: true })
}
