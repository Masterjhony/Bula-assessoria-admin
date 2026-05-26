import { createClient } from '@/utils/supabase/server'

export async function getIsAuthenticated(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return !!user
  } catch {
    return false
  }
}

export type AdminCheckResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string }

/**
 * No web-bula NÃO existe coluna `profiles.role` — a tabela tem só
 * { id, nome, iniciais, created_at }. O painel /sistema é exclusivo
 * para equipe da Bula, então qualquer usuário autenticado é admin.
 * Se no futuro precisar diferenciar papéis, expanda o schema de
 * profiles e troque a lógica aqui.
 */
export async function requireAdmin(): Promise<AdminCheckResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, status: 401, error: 'Não autenticado.' }
    return { ok: true, userId: user.id }
  } catch {
    return { ok: false, status: 401, error: 'Falha ao validar sessão.' }
  }
}

// ─── Política de Dados Financeiros ────────────────────────────────────────
// Whitelist de e-mails que veem dados financeiros sensíveis (Faturamento
// Bula, Lucro Bruto, comissões pagas a outros assessores, acordos).
// Mesma decisão herdada do fórmula: assessores não veem o financeiro,
// só a diretoria.
const FINANCE_ADMIN_EMAILS = new Set([
  'formuladoboi@gmail.com',
])

export async function getIsFinanceAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return false
    return FINANCE_ADMIN_EMAILS.has(user.email.toLowerCase())
  } catch {
    return false
  }
}
