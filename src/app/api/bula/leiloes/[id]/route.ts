import { NextRequest } from 'next/server'
import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { fail, ok, unauthorized } from '@/lib/respond'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_: NextRequest, { params }: Ctx) {
  const { id } = await params
  const user = await requireUser()
  if (!user) return unauthorized()
  const { data, error } = await supabaseAdmin()
    .from('leiloes')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return fail(error.message, 404)
  return ok(data)
}

async function update(req: NextRequest, id: string) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const { data, error } = await supabaseAdmin()
    .from('leiloes')
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
  const { id } = await params
  const user = await requireUser()
  if (!user) return unauthorized()
  const { error } = await supabaseAdmin().from('leiloes').delete().eq('id', id)
  if (error) return fail(error.message, 400)
  return ok({ ok: true })
}
