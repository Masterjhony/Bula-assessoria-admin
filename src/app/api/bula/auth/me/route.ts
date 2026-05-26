import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { ok, unauthorized } from '@/lib/respond'

export async function GET() {
  const user = await requireUser()
  if (!user) return unauthorized()
  const sb = supabaseAdmin()
  const { data: profile } = await sb
    .from('profiles')
    .select('id, nome, iniciais')
    .eq('id', user.id)
    .maybeSingle()

  let nome = profile?.nome || ''
  let iniciais = profile?.iniciais || ''

  // Self-heal: se o profile nao existir (trigger falhou), cria agora
  if (!profile) {
    const fallbackNome = String(user.user_metadata?.nome || user.email?.split('@')[0] || 'Usuario')
    let fallbackIniciais = '?'
    try {
      const { data: ini } = await sb.rpc('iniciais_from_nome', { nome: fallbackNome })
      if (ini) fallbackIniciais = ini
    } catch {}
    try {
      await sb.from('profiles').upsert({ id: user.id, nome: fallbackNome, iniciais: fallbackIniciais }, { onConflict: 'id' })
    } catch {}
    nome = fallbackNome
    iniciais = fallbackIniciais
  }

  return ok({
    id: user.id,
    email: user.email,
    nome,
    iniciais,
  })
}
