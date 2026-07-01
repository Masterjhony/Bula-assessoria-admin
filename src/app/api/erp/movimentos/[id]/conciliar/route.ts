import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

type Ctx = { params: Promise<{ id: string }> }

type Status = 'pendente' | 'classificado' | 'conciliado'
const STATUSES: Status[] = ['pendente', 'classificado', 'conciliado']

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))

  // Desvincular: solta o movimento do título e reabre o título.
  if (body.desvincular) {
    const sb = admin()
    const { data: mov, error: em } = await sb.from('erp_movimentos_bancarios').select('id,conta_receber_id,conta_pagar_id').eq('id', id).single()
    if (em) return fail(em.message, 404)
    if (mov.conta_receber_id) await sb.from('erp_contas_receber').update({ status: 'aberto', data_recebimento: null, valor_recebido: 0, forma_recebimento: null }).eq('id', mov.conta_receber_id)
    if (mov.conta_pagar_id) await sb.from('erp_contas_pagar').update({ status: 'aberto', data_pagamento: null, valor_pago: 0, forma_pagamento: null }).eq('id', mov.conta_pagar_id)
    const { data, error } = await sb.from('erp_movimentos_bancarios').update({ conta_receber_id: null, conta_pagar_id: null, conciliado: false, status_conciliacao: 'classificado' }).eq('id', id).select('*').single()
    if (error) return fail(error.message, 400)
    return ok({ ...data, status_conciliacao: 'classificado' })
  }

  // Aceita tanto o novo formato { status } quanto o legado { conciliado }.
  let status: Status | null = STATUSES.includes(body.status) ? body.status : null
  if (!status) {
    const conciliado = body.conciliado != null ? !!body.conciliado : true
    status = conciliado ? 'conciliado' : 'pendente'
  }
  const conciliado = status !== 'pendente'

  // Tenta gravar o status persistido + o booleano em sincronia. Se a coluna
  // status_conciliacao ainda nao existir (migration 0035 nao aplicada), faz
  // fallback gravando apenas o booleano para nao quebrar a acao.
  let res = await admin()
    .from('erp_movimentos_bancarios')
    .update({ status_conciliacao: status, conciliado })
    .eq('id', id)
    .select('*')
    .single()

  if (res.error && /status_conciliacao/.test(res.error.message)) {
    res = await admin()
      .from('erp_movimentos_bancarios')
      .update({ conciliado })
      .eq('id', id)
      .select('*')
      .single()
  }

  if (res.error) return fail(res.error.message, 400)
  return ok({ ...res.data, status_conciliacao: status })
}
