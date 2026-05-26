import { NextRequest } from 'next/server'
import { requireUser, supabaseAdmin } from './supabase'
import { fail, ok, unauthorized } from './respond'

export async function ensureAuth() {
  const user = await requireUser()
  if (!user) return null
  return user
}

export function admin() {
  return supabaseAdmin()
}

type ListOptions = {
  table: string
  select?: string
  orderBy?: { column: string; ascending?: boolean }
  filters?: Record<string, string | number | boolean | null>
  search?: { columns: string[]; term: string } | null
  limit?: number
}

export async function listEntity(opts: ListOptions) {
  let q = admin()
    .from(opts.table)
    .select(opts.select || '*')
  if (opts.filters) {
    for (const [k, v] of Object.entries(opts.filters)) {
      if (v === null || v === undefined || v === '') continue
      q = q.eq(k, v)
    }
  }
  if (opts.search && opts.search.term) {
    const pattern = `%${opts.search.term}%`
    const ors = opts.search.columns.map((c) => `${c}.ilike.${pattern}`).join(',')
    q = q.or(ors)
  }
  if (opts.orderBy) q = q.order(opts.orderBy.column, { ascending: opts.orderBy.ascending ?? true })
  if (opts.limit) q = q.limit(opts.limit)
  return q
}

export async function auditLog(entidade: string, acao: string, payload: Record<string, unknown>, user?: { id?: string; email?: string | null }) {
  try {
    await admin().from('erp_auditoria').insert({
      entidade,
      entidade_id: (payload as { id?: string }).id ?? null,
      acao,
      usuario_id: user?.id ?? null,
      usuario_email: user?.email ?? '',
      payload,
    })
  } catch {}
}

export async function guard(req: NextRequest) {
  const user = await ensureAuth()
  if (!user) return { error: unauthorized(), user: null }
  return { error: null, user }
}

export { fail, ok, unauthorized }
export type { NextRequest }
