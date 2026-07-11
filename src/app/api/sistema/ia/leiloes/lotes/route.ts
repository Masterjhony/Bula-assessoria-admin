import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import {
  getCatalogoLotes,
  VideoextratorLotesError,
} from '@/lib/videoextrator-lotes'

export const dynamic = 'force-dynamic'

const ALLOWED = new Set([
  'q', 'video_id', 'motivo', 'min_confidence', 'has_image', 'review', 'limit', 'cursor',
])

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const incoming = new URL(request.url).searchParams
  const safe = new URLSearchParams()
  incoming.forEach((value, key) => {
    if (ALLOWED.has(key) && value.length <= 200) safe.set(key, value)
  })
  try {
    return NextResponse.json(await getCatalogoLotes(safe.toString()))
  } catch (error) {
    const status = error instanceof VideoextratorLotesError ? error.status : 502
    return NextResponse.json({ error: (error as Error).message }, { status })
  }
}
