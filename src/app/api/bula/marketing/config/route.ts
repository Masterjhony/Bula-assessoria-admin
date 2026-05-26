import { NextRequest } from 'next/server'
import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { fail, ok, unauthorized } from '@/lib/respond'

export async function GET() {
  const user = await requireUser()
  if (!user) return unauthorized()
  const { data, error } = await supabaseAdmin()
    .from('marketing_config')
    .select('investimento')
    .eq('id', 1)
    .single()
  if (error) return ok({ investimento: 0 })
  return ok(data || { investimento: 0 })
}

export async function PUT(req: NextRequest) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const { data, error } = await supabaseAdmin()
    .from('marketing_config')
    .upsert({ id: 1, ...body })
    .select('investimento')
    .single()
  if (error) return fail(error.message, 400)
  return ok(data)
}
