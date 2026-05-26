import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

// Balanco simplificado: agrupa saldos por conta do plano usando partidas dos
// lancamentos ativos. Tambem inclui saldo de contas bancarias.
export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sp = req.nextUrl.searchParams
  const dataRef = sp.get('data') || new Date().toISOString().slice(0, 10)
  const sb = admin()

  const [partidas, plano, bancos] = await Promise.all([
    sb.from('erp_lancamento_partidas').select('plano_conta_id,natureza,valor,lancamento:erp_lancamentos!lancamento_id(data,status)'),
    sb.from('erp_plano_contas').select('*').order('codigo'),
    sb.from('erp_contas_bancarias').select('id,nome,saldo_atual,ativo').eq('ativo', true),
  ])

  const saldos: Record<string, number> = {}
  for (const p of (partidas.data || []) as { plano_conta_id: string; natureza: string; valor: number; lancamento?: { data?: string; status?: string } }[]) {
    if (!p.lancamento || p.lancamento.status !== 'ativo') continue
    if (p.lancamento.data && p.lancamento.data > dataRef) continue
    const v = Number(p.valor || 0)
    saldos[p.plano_conta_id] = (saldos[p.plano_conta_id] || 0) + (p.natureza === 'debito' ? v : -v)
  }

  type Conta = { id: string; codigo: string; nome: string; tipo: string; parent_id: string | null; natureza: string }
  const planoData = (plano.data || []) as Conta[]
  const planoMap: Record<string, Conta> = {}
  for (const c of planoData) planoMap[c.id] = c

  // Somar saldos para contas sinteticas (sobe na arvore)
  const totalPorTipo: Record<string, number> = { ativo: 0, passivo: 0, patrimonio: 0, receita: 0, despesa: 0 }
  const linhas = planoData.map((c) => {
    const saldo = saldos[c.id] || 0
    const sinal = c.tipo === 'ativo' || c.tipo === 'despesa' ? 1 : -1
    const valor = saldo * sinal
    if (c.natureza === 'analitica') totalPorTipo[c.tipo] = (totalPorTipo[c.tipo] || 0) + valor
    return { ...c, saldo, valor }
  })

  const saldoBancos = (bancos.data || []).reduce((s: number, c: { saldo_atual: number }) => s + Number(c.saldo_atual || 0), 0)

  return ok({
    data_ref: dataRef,
    linhas,
    totais: totalPorTipo,
    ativo_total: totalPorTipo.ativo,
    passivo_total: totalPorTipo.passivo,
    patrimonio_total: totalPorTipo.patrimonio,
    resultado: totalPorTipo.receita - totalPorTipo.despesa,
    saldo_bancos: saldoBancos,
  })
}
