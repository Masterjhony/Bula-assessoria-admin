import { NextRequest } from 'next/server'
import { supabaseFromCookies } from '@/lib/supabase'
import { fail, ok } from '@/lib/respond'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  if (!email || !password) return fail('Email e senha sao obrigatorios.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Email invalido.')

  const supa = supabaseFromCookies()
  const { data, error } = await supa.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    const msg = error?.message || ''
    if (/email.*not.*confirm|not.*confirmed/i.test(msg)) {
      return fail('Email ainda nao confirmado. Contate o administrador.', 401)
    }
    if (/invalid.*credentials|invalid.*login/i.test(msg)) {
      return fail('Email ou senha incorretos.', 401)
    }
    return fail(msg || 'Falha ao entrar.', 401)
  }
  return ok({ user: { id: data.user.id, email: data.user.email } })
}
