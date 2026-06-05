import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { getIsFinanceAdmin } from '@/lib/auth-helpers'

// Campos sensíveis que só finance-admin pode ver. Em 2026-05-15 o chefe pediu
// que os assessores não vejam o Faturamento Bula nem comissões pagas. Esses
// campos são removidos do payload retornado quando o usuário logado não está
// na whitelist FINANCE_ADMIN_EMAILS.
const FINANCE_FIELDS = [
  'receita_bula',
  'sobra_bruta',
  'comissao_assessoria',
  'acordo_pct_faturamento',
  'acordo_pct_venda_cobertura',
  'acordo_descricao',
] as const;

type FechamentoRow = Record<string, unknown>;

function stripFinanceFields(row: FechamentoRow): FechamentoRow {
  const out: FechamentoRow = { ...row };
  for (const k of FINANCE_FIELDS) {
    if (k in out) out[k] = null;
  }
  // A comissão paga a cada assessor (por_assessor[].comissao) é tão sensível
  // quanto o total: assessores não podem ver. Zera só esse campo, mantendo o
  // resto da métrica de vendas (VGV, transações) que eles podem ver.
  if (Array.isArray(out.por_assessor)) {
    out.por_assessor = (out.por_assessor as Array<Record<string, unknown>>).map((a) =>
      a && typeof a === 'object' ? { ...a, comissao: null } : a
    );
  }
  return out;
}

export async function GET() {
  const supabase = await createClient()
  const [{ data, error }, canSeeFinance] = await Promise.all([
    supabase
      .from('bula_leilao_fechamento')
      .select('*')
      .order('data', { ascending: false }),
    getIsFinanceAdmin(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (data ?? []) as FechamentoRow[];
  const sanitized = canSeeFinance ? rows : rows.map(stripFinanceFields);
  return NextResponse.json(sanitized)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  // Só finance-admin pode criar fechamento (envolve campos financeiros).
  if (!(await getIsFinanceAdmin())) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }
  const body = await request.json()
  const { data, error } = await supabase
    .from('bula_leilao_fechamento')
    .insert([{ ...body, updated_at: new Date().toISOString() }])
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
