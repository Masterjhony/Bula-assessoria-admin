import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'
import { listarTitulosContas, parcelarTitulo } from '@/lib/erp-contas'
import { aplicarPrazoRecebimento, prazoDaParcela } from '@/lib/erp-prazos'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  try {
    return ok(await listarTitulosContas(admin(), 'receber', req.nextUrl.searchParams))
  } catch (error) {
    return fail((error as Error).message, 500)
  }
}

export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  let body: Record<string, unknown>
  try { body = aplicarPrazoRecebimento(await req.json()) }
  catch (error) { return fail((error as Error).message) }
  if (!body.descricao) return fail('descricao obrigatoria')
  if (body.valor == null) return fail('valor obrigatorio')

  let parcelas: ReturnType<typeof parcelarTitulo>
  try { parcelas = parcelarTitulo(body.valor, body.vencimento, body.total_parcelas ?? 1) }
  catch (error) { return fail((error as Error).message) }
  const total = parcelas.length
  const rows: Array<Record<string, unknown>> = []

  for (const { parcela: i, valor: valorParcela, vencimento } of parcelas) {
    const descricao = total > 1 ? `${body.descricao} (${i}/${total})` : body.descricao
    const prazo = prazoDaParcela(body, i, vencimento)
    rows.push({
      descricao,
      cliente_id: body.cliente_id || null,
      categoria_id: body.categoria_id || null,
      centro_custo_id: body.centro_custo_id || null,
      plano_conta_id: body.plano_conta_id || null,
      conta_bancaria_id: body.conta_bancaria_id || null,
      valor: valorParcela,
      emissao: body.emissao || new Date().toISOString().slice(0, 10),
      vencimento,
      forma_recebimento: body.forma_recebimento || '',
      numero_documento: body.numero_documento || '',
      parcela: i,
      total_parcelas: total,
      recorrencia: body.recorrencia || 'nenhuma',
      observacoes: prazo.observacoes || '',
      nota_fiscal: body.nota_fiscal || '',
      vendedor: body.vendedor || '',
      projeto: body.projeto || '',
      tags: prazo.tags || [],
      anexos: body.anexos || [],
    })
  }

  const { data, error } = await admin().from('erp_contas_receber').insert(rows).select('*')
  if (error) return fail(error.message, 400)
  return ok(data || [])
}
