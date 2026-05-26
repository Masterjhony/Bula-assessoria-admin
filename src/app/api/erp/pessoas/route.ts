import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const tipo = req.nextUrl.searchParams.get('tipo') // cliente | fornecedor | ambos
  const search = req.nextUrl.searchParams.get('q') || ''
  let q = admin().from('erp_pessoas').select('*').order('nome')
  if (tipo === 'cliente') q = q.eq('is_cliente', true)
  if (tipo === 'fornecedor') q = q.eq('is_fornecedor', true)
  if (search) q = q.or(`nome.ilike.%${search}%,documento.ilike.%${search}%,email.ilike.%${search}%`)
  const { data, error } = await q
  if (error) return fail(error.message, 500)
  return ok(data || [])
}

export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  if (!body.nome) return fail('nome obrigatorio')
  const { data, error } = await admin().from('erp_pessoas').insert(body).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
