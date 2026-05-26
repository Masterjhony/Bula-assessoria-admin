import { NextRequest } from 'next/server'
import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { fail, ok, unauthorized } from '@/lib/respond'

export async function GET() {
  const user = await requireUser()
  if (!user) return unauthorized()
  const { data, error } = await supabaseAdmin()
    .from('leiloes')
    .select('*')
    .order('data', { ascending: true })
  if (error) return fail(error.message, 500)
  return ok(data || [])
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const { data, error } = await supabaseAdmin()
    .from('leiloes')
    .insert(body)
    .select('*')
    .single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
