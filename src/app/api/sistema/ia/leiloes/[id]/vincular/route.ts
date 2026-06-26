import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { sincronizarAnalises } from '@/lib/leilao-analise'

export const dynamic = 'force-dynamic'

// Vincula um vídeo JÁ analisado (ex.: confirmar uma sugestão) sem reprocessar.
// Body: { videoId: string, score?: number }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const videoId = String(body.videoId || '').trim()
  if (!videoId) return NextResponse.json({ error: 'videoId obrigatório.' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.from('bula_leilao_video_analise').upsert(
    {
      leilao_id: id,
      video_id: videoId,
      video_url: `https://www.youtube.com/watch?v=${videoId}`,
      match_tipo: 'manual',
      match_score: body.score ?? null,
      status: 'processando',
    },
    { onConflict: 'leilao_id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Puxa o snapshot do vídeo já processado (flip para 'concluido' se existir).
  await sincronizarAnalises(supabase, { force: true })
  return NextResponse.json({ ok: true, video_id: videoId })
}
