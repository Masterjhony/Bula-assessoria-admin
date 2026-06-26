import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { dispararAnalise, VideoextratorError } from '@/lib/videoextrator'

export const dynamic = 'force-dynamic'

// Vincula uma URL do YouTube a um leilão e dispara a análise na VPS.
// Body: { videoUrl: string }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const videoUrl = String(body.videoUrl || '').trim()
  if (!videoUrl) {
    return NextResponse.json({ error: 'Informe a URL do YouTube.' }, { status: 400 })
  }

  // Dispara na VPS (valida a URL e resolve o video_id).
  let resultado: { video_id: string; status: string; novo: boolean }
  try {
    resultado = await dispararAnalise(videoUrl)
  } catch (e) {
    const status = e instanceof VideoextratorError ? e.status : 502
    return NextResponse.json({ error: (e as Error).message }, { status })
  }

  const supabase = await createClient()
  const { error } = await supabase.from('bula_leilao_video_analise').upsert(
    {
      leilao_id: id,
      video_id: resultado.video_id,
      video_url: videoUrl,
      match_tipo: 'manual',
      status: 'processando',
      total_lotes: null,
      total_vendidos: null,
      volume_total: null,
      sincronizado_em: null,
    },
    { onConflict: 'leilao_id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, video_id: resultado.video_id, status: 'processando' })
}
