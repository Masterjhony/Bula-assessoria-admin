import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  let q = admin()
    .from('erp_lancamentos')
    .select('*, partidas:erp_lancamento_partidas(*, plano_conta:erp_plano_contas!plano_conta_id(id,codigo,nome), centro:erp_centros_custo!centro_custo_id(id,codigo,nome))')
    .order('data', { ascending: false })
    .order('numero', { ascending: false })
    .limit(500)
  if (from) q = q.gte('data', from)
  if (to) q = q.lte('data', to)
  const { data, error } = await q
  if (error) return fail(error.message, 500)
  return ok(data || [])
}

export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  const partidas: Array<{ plano_conta_id: string; centro_custo_id?: string | null; natureza: string; valor: number; historico_complementar?: string }> = body.partidas || []
  if (!body.historico) return fail('historico obrigatorio')
  if (!Array.isArray(partidas) || partidas.length < 2) return fail('Lancamento exige ao menos 2 partidas')

  const tDebito = partidas.filter(p => p.natureza === 'debito').reduce((s, p) => s + Number(p.valor || 0), 0)
  const tCredito = partidas.filter(p => p.natureza === 'credito').reduce((s, p) => s + Number(p.valor || 0), 0)
  if (Math.abs(tDebito - tCredito) > 0.005) return fail('Debitos e creditos devem ser iguais')
  if (tDebito <= 0) return fail('Valor total deve ser maior que zero')

  const sb = admin()
  const { data: lanc, error } = await sb.from('erp_lancamentos').insert({
    data: body.data || new Date().toISOString().slice(0, 10),
    historico: body.historico,
    valor_total: tDebito,
    origem: 'manual',
    documento: body.documento || '',
  }).select('*').single()
  if (error) return fail(error.message, 400)

  const partRows = partidas.map((p, i) => ({
    lancamento_id: lanc.id,
    plano_conta_id: p.plano_conta_id,
    centro_custo_id: p.centro_custo_id || null,
    natureza: p.natureza,
    valor: Number(p.valor),
    historico_complementar: p.historico_complementar || '',
    ordem: i,
  }))
  const { error: errPart } = await sb.from('erp_lancamento_partidas').insert(partRows)
  if (errPart) {
    await sb.from('erp_lancamentos').delete().eq('id', lanc.id)
    return fail(errPart.message, 400)
  }
  return ok(lanc)
}
