import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sp = req.nextUrl.searchParams
  const dias = Math.min(180, Math.max(7, Number(sp.get('dias') || 60)))
  const sb = admin()

  const hoje = new Date()
  const inicio = new Date(); inicio.setDate(hoje.getDate() - 30)
  const fim = new Date(); fim.setDate(hoje.getDate() + dias)
  const inicioIso = inicio.toISOString().slice(0, 10)
  const fimIso = fim.toISOString().slice(0, 10)

  const [bancos, mov, cp, cr] = await Promise.all([
    sb.from('erp_contas_bancarias').select('saldo_atual').eq('ativo', true),
    sb.from('erp_movimentos_bancarios').select('data,tipo,valor').gte('data', inicioIso).lte('data', hoje.toISOString().slice(0, 10)),
    sb.from('erp_contas_pagar').select('vencimento,valor,desconto,juros,multa,valor_pago').in('status', ['aberto', 'parcial', 'vencido']).gte('vencimento', hoje.toISOString().slice(0, 10)).lte('vencimento', fimIso),
    sb.from('erp_contas_receber').select('vencimento,valor,desconto,juros,multa,valor_recebido').in('status', ['aberto', 'parcial', 'vencido']).gte('vencimento', hoje.toISOString().slice(0, 10)).lte('vencimento', fimIso),
  ])

  const saldoAtual = (bancos.data || []).reduce((s: number, r: { saldo_atual: number }) => s + Number(r.saldo_atual || 0), 0)

  // Constroi serie por dia
  const dataMap: Record<string, { data: string; entrada_real: number; saida_real: number; entrada_prev: number; saida_prev: number; saldo: number }> = {}
  const baseDate = new Date(inicio)
  for (let i = 0; i <= dias + 30; i++) {
    const d = new Date(baseDate); d.setDate(d.getDate() + i)
    const k = d.toISOString().slice(0, 10)
    dataMap[k] = { data: k, entrada_real: 0, saida_real: 0, entrada_prev: 0, saida_prev: 0, saldo: 0 }
  }
  for (const m of (mov.data || []) as { data: string; tipo: string; valor: number }[]) {
    const k = m.data; if (!dataMap[k]) continue
    if (m.tipo === 'entrada') dataMap[k].entrada_real += Number(m.valor || 0)
    if (m.tipo === 'saida') dataMap[k].saida_real += Number(m.valor || 0)
  }
  for (const r of (cp.data || []) as { vencimento: string; valor: number; desconto: number; juros: number; multa: number; valor_pago: number }[]) {
    const k = r.vencimento; if (!dataMap[k]) continue
    const v = Number(r.valor || 0) - Number(r.desconto || 0) + Number(r.juros || 0) + Number(r.multa || 0) - Number(r.valor_pago || 0)
    dataMap[k].saida_prev += v
  }
  for (const r of (cr.data || []) as { vencimento: string; valor: number; desconto: number; juros: number; multa: number; valor_recebido: number }[]) {
    const k = r.vencimento; if (!dataMap[k]) continue
    const v = Number(r.valor || 0) - Number(r.desconto || 0) + Number(r.juros || 0) + Number(r.multa || 0) - Number(r.valor_recebido || 0)
    dataMap[k].entrada_prev += v
  }

  // Calcular saldo projetado dia a dia (a partir de hoje, soma previstos)
  const hojeIso = hoje.toISOString().slice(0, 10)
  let acumulado = saldoAtual
  const ordered = Object.values(dataMap).sort((a, b) => a.data.localeCompare(b.data))
  for (const row of ordered) {
    if (row.data > hojeIso) {
      acumulado += row.entrada_prev - row.saida_prev
    }
    row.saldo = acumulado
  }

  return ok({
    saldo_atual: saldoAtual,
    dias,
    serie: ordered,
  })
}
