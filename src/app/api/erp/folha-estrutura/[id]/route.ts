import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'
import { getIsFinanceAdmin } from '@/lib/auth-helpers'

type Ctx = { params: Promise<{ id: string }> }

const WRITABLE = ['nome', 'funcao', 'salario_fixo', 'comissao_pct', 'comissao_fixa', 'ativo', 'ordem', 'observacao', 'apelidos', 'empresa', 'fornecedor_id', 'pagamento_nome', 'zona'] as const

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  if (!(await getIsFinanceAdmin())) return fail('Acesso restrito a diretoria.', 403)
  const raw = await req.json().catch(() => ({}))
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of WRITABLE) if (k in raw) body[k] = raw[k]
  const { data, error } = await admin().from('erp_folha_estrutura').update(body).eq('id', id).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  if (!(await getIsFinanceAdmin())) return fail('Acesso restrito a diretoria.', 403)
  const { error } = await admin().from('erp_folha_estrutura').delete().eq('id', id)
  if (error) return fail(error.message, 400)
  return ok({ ok: true })
}
