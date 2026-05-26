import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fail, ok } from '@/lib/respond'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const access_token = String(body.access_token || '')
  const refresh_token = String(body.refresh_token || '')
  const password = String(body.password || '')
  if (!access_token || !refresh_token || !password) {
    return fail('Tokens e nova senha sao obrigatorios.')
  }
  if (password.length < 6) return fail('Senha deve ter no minimo 6 caracteres.')

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { error: errSet } = await supa.auth.setSession({ access_token, refresh_token })
  if (errSet) return fail(errSet.message, 401)

  const { error } = await supa.auth.updateUser({ password })
  if (error) return fail(error.message, 400)
  return ok({ ok: true })
}
