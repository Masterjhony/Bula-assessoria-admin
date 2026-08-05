import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

// Aplica um vinculo aprovado: liga o movimento ao titulo e da BAIXA no titulo
// (previsto -> realizado). A baixa e proporcional ao valor do movimento:
// se o movimento cobre o saldo do titulo, quita; se cobre parte, vira 'parcial'
// acumulando com o que ja tinha sido pago/recebido. Tambem preenche a conta
// bancaria da baixa e a contraparte do movimento a partir do titulo.
// Body: { tipo: 'CR'|'CP', titulo_id, movimento_id }
export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const { tipo, titulo_id, movimento_id } = await req.json().catch(() => ({}))
  if (!tipo || !titulo_id || !movimento_id) return fail('tipo, titulo_id e movimento_id obrigatorios')
  const sb = admin()

  const { data: mov, error: em } = await sb.from('erp_movimentos_bancarios')
    .select('id,data,valor,tipo,conta_receber_id,conta_pagar_id,pessoa_id,conta_bancaria_id').eq('id', movimento_id).single()
  if (em) return fail(em.message, 404)
  if (mov.conta_receber_id || mov.conta_pagar_id) return fail('Movimento ja vinculado a outro titulo', 409)

  const liquidoDe = (t: { valor: number; desconto: number | null; juros: number | null; multa: number | null }) =>
    Number(t.valor || 0) - Number(t.desconto || 0) + Number(t.juros || 0) + Number(t.multa || 0)

  if (tipo === 'CR') {
    if (mov.tipo !== 'entrada') return fail('Movimento nao e entrada')
    const { data: t, error: et } = await sb.from('erp_contas_receber')
      .select('id,valor,desconto,juros,multa,valor_recebido,cliente_id,status').eq('id', titulo_id).single()
    if (et) return fail(et.message, 404)
    if (['recebido', 'cancelado'].includes(t.status)) return fail(`Titulo ja esta '${t.status}'`, 409)
    const liquido = liquidoDe(t)
    const novoRecebido = Math.round((Number(t.valor_recebido || 0) + Number(mov.valor || 0)) * 100) / 100
    const quitado = novoRecebido >= liquido - 0.009
    await sb.from('erp_movimentos_bancarios').update({
      conta_receber_id: titulo_id, conciliado: true, status_conciliacao: 'conciliado',
      pessoa_id: mov.pessoa_id || t.cliente_id || null,
    }).eq('id', movimento_id)
    await sb.from('erp_contas_receber').update({
      status: quitado ? 'recebido' : 'parcial', data_recebimento: mov.data,
      valor_recebido: Math.min(novoRecebido, liquido), forma_recebimento: 'transferencia',
      conta_bancaria_id: mov.conta_bancaria_id,
    }).eq('id', titulo_id)
    return ok({ ok: true, quitado, valor_recebido: Math.min(novoRecebido, liquido), liquido })
  }
  if (tipo === 'CP') {
    if (mov.tipo !== 'saida') return fail('Movimento nao e saida')
    const { data: t, error: et } = await sb.from('erp_contas_pagar')
      .select('id,valor,desconto,juros,multa,valor_pago,fornecedor_id,status').eq('id', titulo_id).single()
    if (et) return fail(et.message, 404)
    if (['pago', 'cancelado'].includes(t.status)) return fail(`Titulo ja esta '${t.status}'`, 409)
    const liquido = liquidoDe(t)
    const novoPago = Math.round((Number(t.valor_pago || 0) + Number(mov.valor || 0)) * 100) / 100
    const quitado = novoPago >= liquido - 0.009
    await sb.from('erp_movimentos_bancarios').update({
      conta_pagar_id: titulo_id, conciliado: true, status_conciliacao: 'conciliado',
      pessoa_id: mov.pessoa_id || t.fornecedor_id || null,
    }).eq('id', movimento_id)
    await sb.from('erp_contas_pagar').update({
      status: quitado ? 'pago' : 'parcial', data_pagamento: mov.data,
      valor_pago: Math.min(novoPago, liquido), forma_pagamento: 'transferencia',
      conta_bancaria_id: mov.conta_bancaria_id,
    }).eq('id', titulo_id)
    return ok({ ok: true, quitado, valor_pago: Math.min(novoPago, liquido), liquido })
  }
  return fail('tipo invalido (use CR ou CP)')
}
