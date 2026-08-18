import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

// Balanco simplificado: agrupa saldos por conta do plano usando partidas dos
// lancamentos ativos. Tambem inclui saldo de contas bancarias.
export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sp = req.nextUrl.searchParams
  const dataRef = sp.get('data') || new Date().toISOString().slice(0, 10)
  const sb = admin()

  const [partidas, plano, bancos, crAbertos, cpAbertos] = await Promise.all([
    sb.from('erp_lancamento_partidas').select('plano_conta_id,natureza,valor,lancamento:erp_lancamentos!lancamento_id(data,status)'),
    sb.from('erp_plano_contas').select('*').order('codigo'),
    sb.from('erp_contas_bancarias').select('id,nome,saldo_atual,ativo').eq('ativo', true),
    // posicao operacional: direitos e obrigacoes em aberto (independe de lancamentos manuais)
    sb.from('erp_contas_receber').select('valor,desconto,juros,multa,valor_recebido').in('status', ['aberto', 'parcial', 'vencido']),
    sb.from('erp_contas_pagar').select('valor,desconto,juros,multa,valor_pago,tags').in('status', ['aberto', 'parcial', 'vencido']),
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

  // ── balanço operacional: bancos + CR em aberto (ativo) x CP em aberto
  // (passivo). Títulos com tag 'orcamento' são fato gerador futuro — ficam
  // fora do passivo real e aparecem como linha informativa.
  type Tit = { valor: number; desconto: number; juros: number; multa: number; valor_recebido?: number; valor_pago?: number; tags?: string[] | null }
  const due = (r: Tit, k: 'valor_recebido' | 'valor_pago') =>
    Number(r.valor || 0) - Number(r.desconto || 0) + Number(r.juros || 0) + Number(r.multa || 0) - Number(r[k] || 0)
  const contasReceber = ((crAbertos.data || []) as Tit[]).reduce((s, r) => s + due(r, 'valor_recebido'), 0)
  const cpRows = (cpAbertos.data || []) as Tit[]
  const isOrc = (r: Tit) => Array.isArray(r.tags) && r.tags.includes('orcamento')
  const contasPagar = cpRows.filter((r) => !isOrc(r)).reduce((s, r) => s + due(r, 'valor_pago'), 0)
  const cpOrcamento = cpRows.filter(isOrc).reduce((s, r) => s + due(r, 'valor_pago'), 0)
  const bancosDetalhe = (bancos.data || []).map((c: { nome: string; saldo_atual: number }) => ({ nome: c.nome, valor: Number(c.saldo_atual || 0) }))

  return ok({
    data_ref: dataRef,
    linhas,
    totais: totalPorTipo,
    ativo_total: totalPorTipo.ativo,
    passivo_total: totalPorTipo.passivo,
    patrimonio_total: totalPorTipo.patrimonio,
    resultado: totalPorTipo.receita - totalPorTipo.despesa,
    saldo_bancos: saldoBancos,
    operacional: {
      bancos: saldoBancos,
      bancos_detalhe: bancosDetalhe,
      contas_a_receber: contasReceber,
      ativo: saldoBancos + contasReceber,
      contas_a_pagar: contasPagar,
      orcamento_futuro: cpOrcamento,
      passivo: contasPagar,
      patrimonio_liquido: saldoBancos + contasReceber - contasPagar,
    },
  })
}
