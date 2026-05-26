import { NextRequest } from 'next/server'
import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { fail, ok, unauthorized } from '@/lib/respond'

type Ctx = { params: Promise<{ id: string }> }

async function update(req: NextRequest, id: string) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const { data, error } = await supabaseAdmin()
    .from('crm_deals')
    .update(body)
    .eq('id', id)
    .select('*')
    .single()
  if (error) return fail(error.message, 400)
  return ok(data)
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  return update(req, id)
}
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  return update(req, id)
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const { id } = await params
  const { error } = await supabaseAdmin()
    .from('crm_deals')
    .delete()
    .eq('id', id)
  if (error) return fail(error.message, 400)
  return ok({ ok: true })
}
