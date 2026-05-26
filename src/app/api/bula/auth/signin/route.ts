import { NextRequest } from 'next/server'
import { supabaseFromCookies } from '@/lib/supabase'
import { fail, ok } from '@/lib/respond'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim()
  const password = String(body.password || '')
  if (!email || !password) return fail('Email e senha sao obrigatorios.')

  const supa = supabaseFromCookies()
  const { data, error } = await supa.auth.signInWithPassword({ email, password })
  if (error || !data.user) return fail(error?.message || 'Email ou senha incorretos.', 401)
  return ok({ user: { id: data.user.id, email: data.user.email } })
}
