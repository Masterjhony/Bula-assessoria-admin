import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

// Deriva o status de conciliacao em 3 estados. Usa a coluna persistida quando
// existe (migration 0035); senao, infere do estado atual para que a tela
// funcione mesmo antes da migration ser aplicada.
function deriveStatusConciliacao(row: {
  status_conciliacao?: string | null
  conta_pagar_id?: string | null
  conta_receber_id?: string | null
  conciliado?: boolean | null
}): 'pendente' | 'classificado' | 'conciliado' {
  if (row.status_conciliacao) return row.status_conciliacao as 'pendente' | 'classificado' | 'conciliado'
  if (row.conta_pagar_id || row.conta_receber_id) return 'conciliado'
  return row.conciliado ? 'classificado' : 'pendente'
}

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sp = req.nextUrl.searchParams
  const conta = sp.get('conta_bancaria_id')
  const from = sp.get('from')
  const to = sp.get('to')
  const tipo = sp.get('tipo')
  const conciliado = sp.get('conciliado')
  const status = sp.get('status') // pendente | classificado | conciliado
  let q = admin()
    .from('erp_movimentos_bancarios')
    .select('*, conta:erp_contas_bancarias!conta_bancaria_id(id,nome,cor), categoria:erp_categorias!categoria_id(id,nome,cor), pessoa:erp_pessoas!pessoa_id(id,nome,documento,tipo)')
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)
  if (conta) q = q.eq('conta_bancaria_id', conta)
  if (from) q = q.gte('data', from)
  if (to) q = q.lte('data', to)
  if (tipo) q = q.eq('tipo', tipo)
  if (conciliado === 'true') q = q.eq('conciliado', true)
  if (conciliado === 'false') q = q.eq('conciliado', false)
  const { data, error } = await q
  if (error) return fail(error.message, 500)
  // Normaliza o status (deriva quando a coluna ainda nao existe) e filtra em JS
  // para nao quebrar caso a migration 0035 ainda nao tenha sido aplicada.
  let rows = (data || []).map((r) => ({ ...r, status_conciliacao: deriveStatusConciliacao(r) }))
  if (status) rows = rows.filter((r) => r.status_conciliacao === status)
  return ok(rows)
}

export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  if (!body.conta_bancaria_id || !body.tipo || body.valor == null) return fail('conta_bancaria_id, tipo e valor obrigatorios')
  const payload = {
    conta_bancaria_id: body.conta_bancaria_id,
    data: body.data || new Date().toISOString().slice(0, 10),
    tipo: body.tipo,
    descricao: body.descricao || (body.tipo === 'entrada' ? 'Entrada' : 'Saida'),
    valor: Number(body.valor),
    categoria_id: body.categoria_id || null,
    centro_custo_id: body.centro_custo_id || null,
    plano_conta_id: body.plano_conta_id || null,
    pessoa_id: body.pessoa_id || null,
    origem: 'manual',
    documento: body.documento || '',
    observacoes: body.observacoes || '',
  }
  const { data, error } = await admin().from('erp_movimentos_bancarios').insert(payload).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
