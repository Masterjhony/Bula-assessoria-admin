import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { ok, unauthorized } from '@/lib/respond'

export async function GET() {
  const user = await requireUser()
  if (!user) return unauthorized()
  const { data: profile } = await supabaseAdmin()
    .from('profiles')
    .select('id, nome, iniciais')
    .eq('id', user.id)
    .single()
  return ok({
    id: user.id,
    email: user.email,
    nome: profile?.nome || user.email?.split('@')[0] || '',
    iniciais: profile?.iniciais || '?',
  })
}
