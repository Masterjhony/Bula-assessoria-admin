import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

type Ctx = { params: Promise<{ id: string }> }

// Registra pagamento: cria movimento bancario, gera lancamento contabil em
// partidas dobradas (debita Fornecedores / credita Banco), atualiza status.
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  const sb = admin()

  const { data: titulo, error: errFetch } = await sb.from('erp_contas_pagar').select('*').eq('id', id).single()
  if (errFetch || !titulo) return fail('Titulo nao encontrado', 404)

  const valorPagamento = Number(body.valor ?? (Number(titulo.valor) - Number(titulo.desconto || 0) + Number(titulo.juros || 0) + Number(titulo.multa || 0) - Number(titulo.valor_pago || 0)))
  const dataPagamento = body.data_pagamento || new Date().toISOString().slice(0, 10)
  const contaBancariaId = body.conta_bancaria_id || titulo.conta_bancaria_id
  if (!contaBancariaId) return fail('conta_bancaria_id obrigatorio')
  if (!(valorPagamento > 0)) return fail('valor de pagamento invalido')

  // Atualiza titulo
  const novoPago = Number(titulo.valor_pago || 0) + valorPagamento
  const valorTotal = Number(titulo.valor) - Number(titulo.desconto || 0) + Number(titulo.juros || 0) + Number(titulo.multa || 0)
  const status = novoPago >= valorTotal - 0.005 ? 'pago' : 'parcial'

  const updateTitulo: Record<string, unknown> = {
    valor_pago: novoPago,
    status,
    juros: body.juros != null ? Number(body.juros) : titulo.juros,
    multa: body.multa != null ? Number(body.multa) : titulo.multa,
    desconto: body.desconto != null ? Number(body.desconto) : titulo.desconto,
    conta_bancaria_id: contaBancariaId,
    forma_pagamento: body.forma_pagamento || titulo.forma_pagamento,
  }
  if (status === 'pago') updateTitulo.data_pagamento = dataPagamento

  const { error: errUpd } = await sb.from('erp_contas_pagar').update(updateTitulo).eq('id', id)
  if (errUpd) return fail(errUpd.message, 400)

  // Cria movimento bancario (saida)
  const { data: mov, error: errMov } = await sb.from('erp_movimentos_bancarios').insert({
    conta_bancaria_id: contaBancariaId,
    data: dataPagamento,
    tipo: 'saida',
    descricao: `Pagto: ${titulo.descricao}`,
    valor: valorPagamento,
    categoria_id: titulo.categoria_id,
    centro_custo_id: titulo.centro_custo_id,
    plano_conta_id: titulo.plano_conta_id,
    pessoa_id: titulo.fornecedor_id,
    conta_pagar_id: id,
    origem: 'pagamento',
    documento: titulo.numero_documento || '',
    observacoes: body.observacoes || '',
  }).select('*').single()
  if (errMov) return fail(errMov.message, 400)

  // Lancamento contabil em partidas dobradas
  try {
    const { data: conta } = await sb.from('erp_contas_bancarias').select('*').eq('id', contaBancariaId).single()
    const { data: contaBanco } = await sb.from('erp_plano_contas').select('id,codigo').eq('codigo', '1.1.02').maybeSingle()
    const { data: contaFornec } = await sb.from('erp_plano_contas').select('id,codigo').eq('codigo', '2.1.01').maybeSingle()
    const planoDebito = titulo.plano_conta_id || contaFornec?.id
    const planoCredito = contaBanco?.id

    if (planoDebito && planoCredito) {
      const { data: lanc } = await sb.from('erp_lancamentos').insert({
        data: dataPagamento,
        historico: `Pagamento ${titulo.descricao}`,
        valor_total: valorPagamento,
        origem: 'pagamento',
        documento: titulo.numero_documento || '',
        conta_pagar_id: id,
        movimento_id: mov?.id,
      }).select('*').single()
      if (lanc) {
        await sb.from('erp_lancamento_partidas').insert([
          { lancamento_id: lanc.id, plano_conta_id: planoDebito, centro_custo_id: titulo.centro_custo_id, natureza: 'debito', valor: valorPagamento, ordem: 1 },
          { lancamento_id: lanc.id, plano_conta_id: planoCredito, centro_custo_id: null, natureza: 'credito', valor: valorPagamento, ordem: 2, historico_complementar: `Banco ${conta?.nome || ''}` },
        ])
      }
    }
  } catch {}

  // Cria recorrencia, se aplicavel e ultimo pagamento
  if (status === 'pago' && titulo.recorrencia && titulo.recorrencia !== 'nenhuma') {
    const map: Record<string, number> = { semanal: 7, mensal: 30, bimestral: 60, trimestral: 90, semestral: 180, anual: 365 }
    const days = map[titulo.recorrencia] || 0
    if (days > 0) {
      const d = new Date(titulo.vencimento + 'T00:00:00')
      d.setDate(d.getDate() + days)
      const proxima = d.toISOString().slice(0, 10)
      await sb.from('erp_contas_pagar').insert({
        descricao: titulo.descricao,
        fornecedor_id: titulo.fornecedor_id,
        categoria_id: titulo.categoria_id,
        centro_custo_id: titulo.centro_custo_id,
        plano_conta_id: titulo.plano_conta_id,
        conta_bancaria_id: titulo.conta_bancaria_id,
        valor: titulo.valor,
        emissao: new Date().toISOString().slice(0, 10),
        vencimento: proxima,
        forma_pagamento: titulo.forma_pagamento,
        numero_documento: titulo.numero_documento,
        recorrencia: titulo.recorrencia,
        observacoes: titulo.observacoes,
      })
    }
  }

  const { data: final } = await sb.from('erp_contas_pagar').select('*').eq('id', id).single()
  return ok({ titulo: final, movimento: mov })
}

// Estorno do pagamento
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const g = await guard(req); if (g.error) return g.error
  const sb = admin()
  await sb.from('erp_movimentos_bancarios').delete().eq('conta_pagar_id', id)
  await sb.from('erp_lancamentos').update({ status: 'estornado' }).eq('conta_pagar_id', id)
  const { data, error } = await sb.from('erp_contas_pagar').update({ valor_pago: 0, status: 'aberto', data_pagamento: null }).eq('id', id).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
