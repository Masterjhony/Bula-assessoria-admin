import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

function addMonths(dateIso: string, n: number): string {
  const d = new Date(dateIso + 'T00:00:00')
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sp = req.nextUrl.searchParams
  const status = sp.get('status')
  const fornecedor = sp.get('fornecedor_id')
  const categoria = sp.get('categoria_id')
  const centro = sp.get('centro_custo_id')
  const leilao = sp.get('leilao')
  const from = sp.get('from')
  const to = sp.get('to')
  const search = sp.get('q') || ''
  // escapa caracteres que quebram o filtro ilike do PostgREST (vírgula/parênteses)
  const safe = (s: string) => s.replace(/[(),%]/g, ' ').trim()
  let q = admin()
    .from('erp_contas_pagar')
    .select('*, fornecedor:erp_pessoas!fornecedor_id(id,nome), categoria:erp_categorias!categoria_id(id,nome,cor), centro:erp_centros_custo!centro_custo_id(id,nome,codigo), conta:erp_contas_bancarias!conta_bancaria_id(id,nome)')
    .order('vencimento')
  if (status) q = q.eq('status', status)
  if (fornecedor) q = q.eq('fornecedor_id', fornecedor)
  if (categoria) q = q.eq('categoria_id', categoria)
  if (centro) q = q.eq('centro_custo_id', centro)
  if (from) q = q.gte('vencimento', from)
  if (to) q = q.lte('vencimento', to)
  if (leilao) {
    const l = safe(leilao)
    q = q.or(`descricao.ilike.%${l}%,numero_documento.ilike.%${l}%,observacoes.ilike.%${l}%`)
  }
  if (search) {
    const s = safe(search)
    q = q.or(`descricao.ilike.%${s}%,numero_documento.ilike.%${s}%,observacoes.ilike.%${s}%`)
  }
  const { data, error } = await q
  if (error) return fail(error.message, 500)
  await admin().rpc('erp_atualizar_vencidos')
  return ok(data || [])
}

export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  if (!body.descricao) return fail('descricao obrigatoria')
  if (body.valor == null) return fail('valor obrigatorio')

  const total = Number(body.total_parcelas || 1)
  const rows: Array<Record<string, unknown>> = []
  const baseValor = Number(body.valor)
  const valorParcela = total > 1 ? Number((baseValor / total).toFixed(2)) : baseValor

  for (let i = 1; i <= total; i++) {
    const vencimento = total > 1 ? addMonths(body.vencimento, i - 1) : body.vencimento
    const descricao = total > 1 ? `${body.descricao} (${i}/${total})` : body.descricao
    rows.push({
      descricao,
      fornecedor_id: body.fornecedor_id || null,
      categoria_id: body.categoria_id || null,
      centro_custo_id: body.centro_custo_id || null,
      plano_conta_id: body.plano_conta_id || null,
      conta_bancaria_id: body.conta_bancaria_id || null,
      valor: valorParcela,
      emissao: body.emissao || new Date().toISOString().slice(0, 10),
      vencimento,
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
