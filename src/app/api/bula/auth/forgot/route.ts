import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fail, ok } from '@/lib/respond'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  if (!email) return fail('Email obrigatorio.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Email invalido.')

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  // Em producao behind proxy, prefere x-forwarded-* quando disponivel
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const forwardedProto = req.headers.get('x-forwarded-proto') || (req.nextUrl.protocol.replace(':', ''))
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : req.nextUrl.origin

  const { error } = await supa.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-senha`,
  })
  if (error) {
    const msg = error.message || ''
    // Rate limit do Supabase: tratamos como sucesso silencioso para nao vazar
    // info de existencia de email; o usuario simplesmente espera e tenta de novo.
    if (/rate limit/i.test(msg)) {
      return ok({ ok: true, rate_limited: true })
    }
    return fail(msg, 400)
  }
  return ok({ ok: true })
}
