import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { ok, unauthorized } from '@/lib/respond'

export async function GET() {
  const user = await requireUser()
  if (!user) return unauthorized()

  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .select('id, nome, iniciais')
    .order('nome', { ascending: true })
  if (error) return ok([])
  return ok(data || [])
}
