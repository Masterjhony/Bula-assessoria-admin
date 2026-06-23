import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

type Ctx = { params: Promise<{ id: string }> }

type Status = 'pendente' | 'classificado' | 'conciliado'
const STATUSES: Status[] = ['pendente', 'classificado', 'conciliado']

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))

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
