import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fail, ok } from '@/lib/respond'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim()
  if (!email) return fail('Email obrigatorio.')

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const origin = req.nextUrl.origin
  const { error } = await supa.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-senha`,
  })
  if (error) return fail(error.message, 400)
  return ok({ ok: true })
}
