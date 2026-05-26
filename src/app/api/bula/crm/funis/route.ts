import { NextRequest } from 'next/server'
import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { fail, ok, unauthorized } from '@/lib/respond'

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const slug = String(body.slug || '').trim()
  const nome = String(body.nome || '').trim()
  const icone = String(body.icone || 'tune')
  const etapas = Array.isArray(body.etapas) ? body.etapas : []
  if (!slug || !nome) return fail('slug e nome sao obrigatorios.')
  if (!etapas.length) return fail('Inclua ao menos uma etapa.')

  const { data, error } = await supabaseAdmin()
    .from('crm_funis')
    .insert({ slug, nome, icone, etapas })
    .select('*')
    .single()
  if (error) return fail(error.message, 400)
  return ok({ ...data, deals: [] })
}

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
