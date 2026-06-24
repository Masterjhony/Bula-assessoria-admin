import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

// Lista lancamentos de cartao. Filtros: ?fatura_id= | ?cartao_id= | ?categoria_id=
export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const url = new URL(req.url)
  let q = admin()
    .from('erp_cartao_lancamentos')
    .select('*, categoria:erp_categorias!categoria_id(id,nome,cor)')
    .order('data_compra')
  const fatura = url.searchParams.get('fatura_id')
  const cartao = url.searchParams.get('cartao_id')
  const categoria = url.searchParams.get('categoria_id')
  if (fatura) q = q.eq('fatura_id', fatura)
  if (cartao) q = q.eq('cartao_id', cartao)
  if (categoria) q = q.eq('categoria_id', categoria)
  const { data, error } = await q
  if (error) return fail(error.message, 500)
  return ok(data || [])
}

export async function PATCH(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  if (!body.id) return fail('id obrigatorio')
  const { id, ...patch } = body
  const { data, error } = await admin().from('erp_cartao_lancamentos').update(patch).eq('id', id).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
