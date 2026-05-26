import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { fail, ok, unauthorized } from '@/lib/respond'

export async function GET() {
  const user = await requireUser()
  if (!user) return unauthorized()
  const admin = supabaseAdmin()

  const { data: funis, error: ef } = await admin
    .from('crm_funis')
    .select('id, slug, nome, icone, etapas')
    .order('created_at', { ascending: true })
  if (ef) return fail(ef.message, 500)

  const { data: deals, error: ed } = await admin
    .from('crm_deals')
    .select('*')
  if (ed) return fail(ed.message, 500)

  const byFunil = new Map<string, any[]>()
  ;(deals || []).forEach((d) => {
    const list = byFunil.get(d.funil_id) || []
    list.push(d)
    byFunil.set(d.funil_id, list)
  })

  const result = (funis || []).map((f) => ({
    ...f,
    deals: byFunil.get(f.id) || [],
  }))
  return ok(result)
}
