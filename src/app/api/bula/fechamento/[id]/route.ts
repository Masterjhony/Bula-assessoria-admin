import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { getIsFinanceAdmin } from '@/lib/auth-helpers'

const FINANCE_FIELDS = [
  'receita_bula',
  'sobra_bruta',
  'comissao_assessoria',
  'acordo_pct_faturamento',
  'acordo_pct_venda_cobertura',
  'acordo_descricao',
  'despesas_variaveis',
] as const;

type FechamentoRow = Record<string, unknown>;

function stripFinanceFields(row: FechamentoRow): FechamentoRow {
  const out: FechamentoRow = { ...row };
  for (const k of FINANCE_FIELDS) {
    if (k in out) out[k] = null;
  }
  // Comissão por assessor (por_assessor[].comissao) é sensível como o total.
  if (Array.isArray(out.por_assessor)) {
    out.por_assessor = (out.por_assessor as Array<Record<string, unknown>>).map((a) =>
      a && typeof a === 'object' ? { ...a, comissao: null } : a
    );
  }
  return out;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data, error }, canSeeFinance] = await Promise.all([
    supabase
      .from('bula_leilao_fechamento')
      .select('*')
      .eq('id', id)
      .single(),
    getIsFinanceAdmin(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  const row = (data as FechamentoRow | null) ?? null;
  const sanitized = canSeeFinance || !row ? row : stripFinanceFields(row);
  return NextResponse.json(sanitized)
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Apenas finance-admin pode escrever — caso contrário um assessor podia
  // enviar PUT com receita_bula:0 e sobrescrever os dados financeiros.
  if (!(await getIsFinanceAdmin())) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }
  const supabase = await createClient()
  const body = await request.json()
  const { data, error } = await supabase
    .from('bula_leilao_fechamento')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await getIsFinanceAdmin())) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('bula_leilao_fechamento')
    .delete()
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
