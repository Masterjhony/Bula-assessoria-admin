import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

// Aplica um vinculo aprovado na fila: liga o movimento ao titulo e baixa o titulo.
// Body: { tipo: 'CR'|'CP', titulo_id, movimento_id }
export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const { tipo, titulo_id, movimento_id } = await req.json().catch(() => ({}))
  if (!tipo || !titulo_id || !movimento_id) return fail('tipo, titulo_id e movimento_id obrigatorios')
  const sb = admin()

  const { data: mov, error: em } = await sb.from('erp_movimentos_bancarios').select('id,data,valor,tipo,conta_receber_id,conta_pagar_id').eq('id', movimento_id).single()
  if (em) return fail(em.message, 404)
  if (mov.conta_receber_id || mov.conta_pagar_id) return fail('Movimento ja vinculado a outro titulo', 409)

  if (tipo === 'CR') {
    if (mov.tipo !== 'entrada') return fail('Movimento nao e entrada')
    const { data: t, error: et } = await sb.from('erp_contas_receber').select('id,valor').eq('id', titulo_id).single()
    if (et) return fail(et.message, 404)
    await sb.from('erp_movimentos_bancarios').update({ conta_receber_id: titulo_id, conciliado: true, status_conciliacao: 'conciliado' }).eq('id', movimento_id)
    await sb.from('erp_contas_receber').update({ status: 'recebido', data_recebimento: mov.data, valor_recebido: t.valor, forma_recebimento: 'transferencia' }).eq('id', titulo_id)
    return ok({ ok: true })
  }
  if (tipo === 'CP') {
    if (mov.tipo !== 'saida') return fail('Movimento nao e saida')
    const { data: t, error: et } = await sb.from('erp_contas_pagar').select('id,valor').eq('id', titulo_id).single()
    if (et) return fail(et.message, 404)
    await sb.from('erp_movimentos_bancarios').update({ conta_pagar_id: titulo_id, conciliado: true, status_conciliacao: 'conciliado' }).eq('id', movimento_id)
    await sb.from('erp_contas_pagar').update({ status: 'pago', data_pagamento: mov.data, valor_pago: t.valor, forma_pagamento: 'transferencia' }).eq('id', titulo_id)
    return ok({ ok: true })
  }
  return fail('tipo invalido (use CR ou CP)')
}
