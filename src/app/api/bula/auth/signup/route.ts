import { NextRequest } from 'next/server'
import { supabaseFromCookies } from '@/lib/supabase'
import { fail, ok } from '@/lib/respond'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim()
  const password = String(body.password || '')
  const name = String(body.name || '').trim()
  if (!email || !password || !name) return fail('Nome, email e senha sao obrigatorios.')
  if (password.length < 6) return fail('Senha deve ter no minimo 6 caracteres.')

  const supa = supabaseFromCookies()
  const { data, error } = await supa.auth.signUp({
    email,
    password,
    options: { data: { nome: name } },
  })
  if (error) return fail(error.message)
  return ok({ user: data.user ? { id: data.user.id, email: data.user.email } : null })
}
