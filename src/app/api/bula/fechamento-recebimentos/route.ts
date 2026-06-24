import { NextResponse } from 'next/server'
import { admin } from '@/lib/erp'
import { getIsFinanceAdmin } from '@/lib/auth-helpers'

// Status de recebimento por fechamento de leilao (view bula_leilao_recebimento),
// + detalhe dos titulos (contas a receber) vinculados via fechamento_id.
// Financeiro: restrito a finance-admin.
export async function GET() {
  if (!(await getIsFinanceAdmin())) {
    return NextResponse.json([], { status: 200 })
  }
  const sb = admin()
  const [{ data: resumo, error: e1 }, { data: titulos, error: e2 }] = await Promise.all([
    sb.from('bula_leilao_recebimento').select('*'),
    sb
      .from('erp_contas_receber')
      .select('id,fechamento_id,descricao,valor,valor_recebido,status,data_recebimento,vencimento,numero_documento')
      .not('fechamento_id', 'is', null),
  ])
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  // movimentos bancarios vinculados aos titulos (para mostrar conta/data do extrato)
  const ids = (titulos || []).map((t) => t.id)
  const movByCr: Record<string, { data: string; conta: string }> = {}
  if (ids.length) {
    const { data: movs } = await sb
      .from('erp_movimentos_bancarios')
      .select('conta_receber_id,data,conta:erp_contas_bancarias!conta_bancaria_id(nome)')
      .in('conta_receber_id', ids)
    for (const m of movs || []) {
      const cnt = m.conta as unknown as { nome?: string } | null
      if (m.conta_receber_id) movByCr[m.conta_receber_id as string] = { data: m.data as string, conta: cnt?.nome || '' }
    }
  }

  const titulosByFech: Record<string, unknown[]> = {}
  for (const t of titulos || []) {
    const fid = t.fechamento_id as string
    ;(titulosByFech[fid] ||= []).push({ ...t, extrato: movByCr[t.id as string] || null })
  }

  const out = (resumo || []).map((r) => ({
    ...r,
    titulos_detalhe: titulosByFech[r.fechamento_id as string] || [],
  }))
  return NextResponse.json(out)
}
