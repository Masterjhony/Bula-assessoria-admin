import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  const { origem_id, destino_id, valor, data, descricao } = body
  if (!origem_id || !destino_id) return fail('origem_id e destino_id obrigatorios')
  if (origem_id === destino_id) return fail('Origem e destino nao podem ser iguais')
  if (!(Number(valor) > 0)) return fail('valor invalido')
  const dataMov = data || new Date().toISOString().slice(0, 10)
  const sb = admin()

  const { data: saida, error: errSaida } = await sb.from('erp_movimentos_bancarios').insert({
    conta_bancaria_id: origem_id,
    data: dataMov,
    tipo: 'saida',
    descricao: descricao || 'Transferencia entre contas',
    valor: Number(valor),
    origem: 'transferencia',
  }).select('*').single()
  if (errSaida) return fail(errSaida.message, 400)

  const { data: entrada, error: errEntrada } = await sb.from('erp_movimentos_bancarios').insert({
    conta_bancaria_id: destino_id,
    data: dataMov,
    tipo: 'entrada',
    descricao: descricao || 'Transferencia entre contas',
    valor: Number(valor),
    origem: 'transferencia',
    transferencia_par_id: saida.id,
  }).select('*').single()
  if (errEntrada) {
    await sb.from('erp_movimentos_bancarios').delete().eq('id', saida.id)
    return fail(errEntrada.message, 400)
  }

  await sb.from('erp_movimentos_bancarios').update({ transferencia_par_id: entrada.id }).eq('id', saida.id)
  return ok({ saida, entrada })
}
