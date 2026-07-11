import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import {
  getLoteArtifact,
  VideoextratorLotesError,
} from '@/lib/videoextrator-lotes'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const id = Number((await params).id)
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Imagem inválida.' }, { status: 400 })
  }
  try {
    const artifact = await getLoteArtifact(id)
    return new Response(artifact.body, {
      headers: {
        'Content-Type': artifact.contentType,
        'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
      },
    })
  } catch (error) {
    const status = error instanceof VideoextratorLotesError ? error.status : 502
    return NextResponse.json({ error: (error as Error).message }, { status })
  }
}
