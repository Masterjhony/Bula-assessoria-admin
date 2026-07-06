import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sb = admin()
  await sb.rpc('erp_atualizar_vencidos')

  const hoje = new Date().toISOString().slice(0, 10)
  const inicio = new Date(); inicio.setDate(1)
  const fim = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0)
  const inicioIso = inicio.toISOString().slice(0, 10)
  const fimIso = fim.toISOString().slice(0, 10)

  const inicio30 = new Date(); inicio30.setDate(inicio30.getDate() - 30)
  const inicio30Iso = inicio30.toISOString().slice(0, 10)

  const [cpAbertos, crAbertos, vencidosCp, vencidosCr, contasBancarias, mesPagar, mesReceber, mov30, ultimosLanc, recPagas30, recRec30] = await Promise.all([
    sb.from('erp_contas_pagar').select('valor,desconto,juros,multa,valor_pago,vencimento,status').in('status', ['aberto', 'parcial', 'vencido']),
    sb.from('erp_contas_receber').select('valor,desconto,juros,multa,valor_recebido,vencimento,status').in('status', ['aberto', 'parcial', 'vencido']),
    sb.from('erp_contas_pagar').select('valor,desconto,juros,multa,valor_pago').eq('status', 'vencido'),
    sb.from('erp_contas_receber').select('valor,desconto,juros,multa,valor_recebido').eq('status', 'vencido'),
    sb.from('erp_contas_bancarias').select('id,nome,saldo_atual,cor,tipo,ativo').eq('ativo', true).order('nome'),
    sb.from('erp_contas_pagar').select('valor,desconto,juros,multa,valor_pago,status').gte('vencimento', inicioIso).lte('vencimento', fimIso),
    sb.from('erp_contas_receber').select('valor,desconto,juros,multa,valor_recebido,status').gte('vencimento', inicioIso).lte('vencimento', fimIso),
    sb.from('erp_movimentos_bancarios').select('data,tipo,valor,categoria_id').gte('data', inicio30Iso).lte('data', hoje),
    sb.from('erp_lancamentos').select('*, partidas:erp_lancamento_partidas(*)').order('data', { ascending: false }).limit(5),
    sb.from('erp_contas_pagar').select('valor_pago').gte('data_pagamento', inicio30Iso).eq('status', 'pago'),
    sb.from('erp_contas_receber').select('valor_recebido').gte('data_recebimento', inicio30Iso).eq('status', 'recebido'),
  ])

  // transferencias entre contas proprias nao sao entrada/saida de caixa
  const { data: catsTransf } = await sb.from('erp_categorias').select('id').ilike('nome', 'Transferencias Internas%')
  const transfIds = new Set((catsTransf || []).map((c: { id: string }) => c.id))
  const mov30Fluxo = ((mov30.data || []) as { data: string; tipo: string; valor: number; categoria_id: string | null }[])
    .filter((m) => !(m.categoria_id && transfIds.has(m.categoria_id)))

  const sumDue = (rows: { valor: number; desconto: number; juros: number; multa: number; valor_pago?: number; valor_recebido?: number }[] | null | undefined, key: 'valor_pago' | 'valor_recebido') => {
    if (!rows) return 0
    return rows.reduce((s, r) => s + (Number(r.valor || 0) - Number(r.desconto || 0) + Number(r.juros || 0) + Number(r.multa || 0) - Number(r[key] || 0)), 0)
  }

  const saldoTotalBancos = (contasBancarias.data || []).reduce((s: number, c: { saldo_atual: number }) => s + Number(c.saldo_atual || 0), 0)
  const aPagar = sumDue(cpAbertos.data, 'valor_pago')
  const aReceber = sumDue(crAbertos.data, 'valor_recebido')
  const vencidosPagar = sumDue(vencidosCp.data, 'valor_pago')
  const vencidosReceber = sumDue(vencidosCr.data, 'valor_recebido')
  const previsaoMesSaida = sumDue(mesPagar.data, 'valor_pago')
  const previsaoMesEntrada = sumDue(mesReceber.data, 'valor_recebido')

  const realizado30Entradas = mov30Fluxo.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + Number(m.valor || 0), 0)
  const realizado30Saidas = mov30Fluxo.filter((m) => m.tipo === 'saida').reduce((s, m) => s + Number(m.valor || 0), 0)

  // Serie diaria 30 dias (movimentos)
  const serie: Record<string, { data: string; entrada: number; saida: number }> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const k = d.toISOString().slice(0, 10)
    serie[k] = { data: k, entrada: 0, saida: 0 }
  }
  for (const m of mov30Fluxo) {
    const k = m.data
    if (!serie[k]) continue
    if (m.tipo === 'entrada') serie[k].entrada += Number(m.valor || 0)
    if (m.tipo === 'saida') serie[k].saida += Number(m.valor || 0)
  }

  return ok({
    saldo_total_bancos: saldoTotalBancos,
    a_pagar: aPagar,
    a_receber: aReceber,
    vencidos_pagar: vencidosPagar,
    vencidos_receber: vencidosReceber,
    previsao_mes_entrada: previsaoMesEntrada,
    previsao_mes_saida: previsaoMesSaida,
    resultado_mes: previsaoMesEntrada - previsaoMesSaida,
    realizado_30_entradas: realizado30Entradas,
    realizado_30_saidas: realizado30Saidas,
    serie_30d: Object.values(serie),
    bancos: contasBancarias.data || [],
    ultimos_lancamentos: ultimosLanc.data || [],
    paid_30d: (recPagas30.data || []).reduce((s: number, r: { valor_pago: number }) => s + Number(r.valor_pago || 0), 0),
    received_30d: (recRec30.data || []).reduce((s: number, r: { valor_recebido: number }) => s + Number(r.valor_recebido || 0), 0),
  })
}
