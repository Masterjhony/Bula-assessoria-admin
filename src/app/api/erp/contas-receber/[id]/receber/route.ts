import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

type Ctx = { params: { id: string } }

export async function POST(req: NextRequest, ctx: Ctx) {
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  const id = ctx.params.id
  const sb = admin()

  const { data: titulo, error: errFetch } = await sb.from('erp_contas_receber').select('*').eq('id', id).single()
  if (errFetch || !titulo) return fail('Titulo nao encontrado', 404)

  const valorRecebimento = Number(body.valor ?? (Number(titulo.valor) - Number(titulo.desconto || 0) + Number(titulo.juros || 0) + Number(titulo.multa || 0) - Number(titulo.valor_recebido || 0)))
  const dataRecebimento = body.data_recebimento || new Date().toISOString().slice(0, 10)
  const contaBancariaId = body.conta_bancaria_id || titulo.conta_bancaria_id
  if (!contaBancariaId) return fail('conta_bancaria_id obrigatorio')
  if (!(valorRecebimento > 0)) return fail('valor de recebimento invalido')

  const novoRec = Number(titulo.valor_recebido || 0) + valorRecebimento
  const valorTotal = Number(titulo.valor) - Number(titulo.desconto || 0) + Number(titulo.juros || 0) + Number(titulo.multa || 0)
  const status = novoRec >= valorTotal - 0.005 ? 'recebido' : 'parcial'

  const upd: Record<string, unknown> = {
    valor_recebido: novoRec,
    status,
    juros: body.juros != null ? Number(body.juros) : titulo.juros,
    multa: body.multa != null ? Number(body.multa) : titulo.multa,
    desconto: body.desconto != null ? Number(body.desconto) : titulo.desconto,
    conta_bancaria_id: contaBancariaId,
    forma_recebimento: body.forma_recebimento || titulo.forma_recebimento,
  }
  if (status === 'recebido') upd.data_recebimento = dataRecebimento

  const { error: errUpd } = await sb.from('erp_contas_receber').update(upd).eq('id', id)
  if (errUpd) return fail(errUpd.message, 400)

  const { data: mov, error: errMov } = await sb.from('erp_movimentos_bancarios').insert({
    conta_bancaria_id: contaBancariaId,
    data: dataRecebimento,
    tipo: 'entrada',
    descricao: `Receb: ${titulo.descricao}`,
    valor: valorRecebimento,
    categoria_id: titulo.categoria_id,
    centro_custo_id: titulo.centro_custo_id,
    plano_conta_id: titulo.plano_conta_id,
    pessoa_id: titulo.cliente_id,
    conta_receber_id: id,
    origem: 'recebimento',
    documento: titulo.numero_documento || '',
    observacoes: body.observacoes || '',
  }).select('*').single()
  if (errMov) return fail(errMov.message, 400)

  try {
    const { data: contaBanco } = await sb.from('erp_plano_contas').select('id,codigo').eq('codigo', '1.1.02').maybeSingle()
    const { data: contaClientes } = await sb.from('erp_plano_contas').select('id,codigo').eq('codigo', '1.1.04').maybeSingle()
    const planoDebito = contaBanco?.id
    const planoCredito = titulo.plano_conta_id || contaClientes?.id

    if (planoDebito && planoCredito) {
      const { data: lanc } = await sb.from('erp_lancamentos').insert({
        data: dataRecebimento,
        historico: `Recebimento ${titulo.descricao}`,
        valor_total: valorRecebimento,
        origem: 'recebimento',
        documento: titulo.numero_documento || '',
        conta_receber_id: id,
        movimento_id: mov?.id,
      }).select('*').single()
      if (lanc) {
        await sb.from('erp_lancamento_partidas').insert([
          { lancamento_id: lanc.id, plano_conta_id: planoDebito, centro_custo_id: titulo.centro_custo_id, natureza: 'debito', valor: valorRecebimento, ordem: 1 },
          { lancamento_id: lanc.id, plano_conta_id: planoCredito, centro_custo_id: null, natureza: 'credito', valor: valorRecebimento, ordem: 2 },
        ])
      }
    }
  } catch {}

  if (status === 'recebido' && titulo.recorrencia && titulo.recorrencia !== 'nenhuma') {
    const map: Record<string, number> = { semanal: 7, mensal: 30, bimestral: 60, trimestral: 90, semestral: 180, anual: 365 }
    const days = map[titulo.recorrencia] || 0
    if (days > 0) {
      const d = new Date(titulo.vencimento + 'T00:00:00')
      d.setDate(d.getDate() + days)
      const proxima = d.toISOString().slice(0, 10)
      await sb.from('erp_contas_receber').insert({
        descricao: titulo.descricao,
        cliente_id: titulo.cliente_id,
        categoria_id: titulo.categoria_id,
        centro_custo_id: titulo.centro_custo_id,
        plano_conta_id: titulo.plano_conta_id,
        conta_bancaria_id: titulo.conta_bancaria_id,
        valor: titulo.valor,
        emissao: new Date().toISOString().slice(0, 10),
        vencimento: proxima,
        forma_recebimento: titulo.forma_recebimento,
        numero_documento: titulo.numero_documento,
        recorrencia: titulo.recorrencia,
        observacoes: titulo.observacoes,
      })
    }
  }

  const { data: final } = await sb.from('erp_contas_receber').select('*').eq('id', id).single()
  return ok({ titulo: final, movimento: mov })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const g = await guard(req); if (g.error) return g.error
  const id = ctx.params.id
  const sb = admin()
  await sb.from('erp_movimentos_bancarios').delete().eq('conta_receber_id', id)
  await sb.from('erp_lancamentos').update({ status: 'estornado' }).eq('conta_receber_id', id)
  const { data, error } = await sb.from('erp_contas_receber').update({ valor_recebido: 0, status: 'aberto', data_recebimento: null }).eq('id', id).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
