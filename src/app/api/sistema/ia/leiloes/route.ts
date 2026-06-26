import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { montarLeiloesAnalise } from '@/lib/leilao-analise'

export const dynamic = 'force-dynamic'

// Lista os leilões da agenda (>= 04/2026) com o estado da análise de vídeo.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = await createClient()
  try {
    const { rows, vpsOnline } = await montarLeiloesAnalise(supabase)
    return NextResponse.json({ rows, vpsOnline })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
