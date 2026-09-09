import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'
import { listarTitulosContas, parcelarTitulo } from '@/lib/erp-contas'
import { aplicarApuracao } from '@/lib/erp-apuracao'
import { prepararPrazoComissao } from '@/lib/erp-comissoes-prazo-adaptador'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  try {
    return ok(await listarTitulosContas(admin(), 'pagar', req.nextUrl.searchParams))
  } catch (error) {
    return fail((error as Error).message, 500)
  }
}

export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  let body: Record<string, unknown>
  try { body = await prepararPrazoComissao(admin(), aplicarApuracao(await req.json().catch(() => ({})))) }
  catch (error) { return fail((error as Error).message) }
  if (!body.descricao) return fail('descricao obrigatoria')
  if (body.valor == null) return fail('valor obrigatorio')

  let parcelas: ReturnType<typeof parcelarTitulo>
  try { parcelas = parcelarTitulo(body.valor, body.vencimento, body.total_parcelas ?? 1, true) }
  catch (error) { return fail((error as Error).message) }
  const total = parcelas.length
  const rows: Array<Record<string, unknown>> = []

  for (const { parcela: i, valor: valorParcela, vencimento } of parcelas) {
    const descricao = total > 1 ? `${body.descricao} (${i}/${total})` : body.descricao
    rows.push({
      descricao,
      fornecedor_id: body.fornecedor_id || null,
      categoria_id: body.categoria_id || null,
      centro_custo_id: body.centro_custo_id || null,
      fechamento_id: body.fechamento_id || null,
      plano_conta_id: body.plano_conta_id || null,
      conta_bancaria_id: body.conta_bancaria_id || null,
      valor: valorParcela,
      emissao: body.emissao || new Date().toISOString().slice(0, 10),
      vencimento,
      apuracao: body.apuracao || {},
      forma_pagamento: body.forma_pagamento || '',
      numero_documento: body.numero_documento || '',
      parcela: i,
      total_parcelas: total,
      recorrencia: body.recorrencia || 'nenhuma',
      observacoes: body.observacoes || '',
      nota_fiscal: body.nota_fiscal || '',
      vendedor: body.vendedor || '',
      projeto: body.projeto || '',
      tags: body.tags || [],
      anexos: body.anexos || [],
    })
  }

  const { data, error } = await admin().from('erp_contas_pagar').insert(rows).select('*')
  if (error) return fail(error.message, 400)
  return ok(data || [])
}
