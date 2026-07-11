import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { getAtividade, getMonitorOverview, VideoextratorError } from '@/lib/videoextrator'

export const dynamic = 'force-dynamic'

// Andamento do loop autônomo (eventos + fila) — proxy da VPS.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const [data, monitor] = await Promise.all([
      getAtividade(60),
      getMonitorOverview().catch(() => null),
    ])
    return NextResponse.json({ ...data, monitor })
  } catch (e) {
    const status = e instanceof VideoextratorError ? e.status : 502
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
