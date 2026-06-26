import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { sincronizarAnalises } from '@/lib/leilao-analise'

export const dynamic = 'force-dynamic'

// Reconsulta a VPS e atualiza status/métricas dos vínculos pendentes.
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const supabase = await createClient()
  try {
    const r = await sincronizarAnalises(supabase, { force: Boolean(body.force) })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
