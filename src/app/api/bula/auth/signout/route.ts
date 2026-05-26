import { supabaseFromCookies } from '@/lib/supabase'
import { ok } from '@/lib/respond'

export async function POST() {
  const supa = supabaseFromCookies()
  await supa.auth.signOut()
  return ok({ ok: true })
}
