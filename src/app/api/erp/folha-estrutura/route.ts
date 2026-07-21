import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'
import { getIsFinanceAdmin } from '@/lib/auth-helpers'

// Cadastro canônico de Folha & Comissões (erp_folha_estrutura).
// Leitura: qualquer usuário autenticado do ERP. Escrita: só finance-admin
// (salários e % de comissão são dados de diretoria).

const WRITABLE = ['nome', 'funcao', 'salario_fixo', 'comissao_pct', 'comissao_fixa', 'ativo', 'ordem', 'observacao'] as const

function pickWritable(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const k of WRITABLE) if (k in body) out[k] = body[k]
  return out
}

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const { data, error } = await admin().from('erp_folha_estrutura').select('*').order('ordem').order('nome')
  if (error) return fail(error.message, 500)
  return ok(data || [])
}

export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  if (!(await getIsFinanceAdmin())) return fail('Acesso restrito a diretoria.', 403)
  const body = pickWritable(await req.json().catch(() => ({})))
  if (!body.nome) return fail('nome e obrigatorio')
  const { data, error } = await admin().from('erp_folha_estrutura').insert(body).select('*').single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
