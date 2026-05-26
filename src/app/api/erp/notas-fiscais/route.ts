import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sp = req.nextUrl.searchParams
  const tipo = sp.get('tipo')
  let q = admin().from('erp_notas_fiscais').select('*, pessoa:erp_pessoas!pessoa_id(id,nome,documento)').order('emissao', { ascending: false }).limit(500)
  if (tipo) q = q.eq('tipo', tipo)
  const { data, error } = await q
  if (error) return fail(error.message, 500)
  return ok(data || [])
}

export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  if (!body.tipo || !body.numero) return fail('tipo e numero obrigatorios')
  const { data, error } = await admin().from('erp_notas_fiscais').insert(body).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
