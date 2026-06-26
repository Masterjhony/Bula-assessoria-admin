import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { getRelatorio, VideoextratorError } from '@/lib/videoextrator'

export const dynamic = 'force-dynamic'

// Relatório pós-leilão de um leilão da agenda (resolve o video_id via vínculo).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const supabase = await createClient()
  const { data: vinc } = await supabase
    .from('bula_leilao_video_analise')
    .select('video_id')
    .eq('leilao_id', id)
    .maybeSingle()

  if (!vinc?.video_id) {
    return NextResponse.json({ error: 'Leilão sem vídeo vinculado.' }, { status: 404 })
  }

  try {
    const relatorio = await getRelatorio(vinc.video_id)
    return NextResponse.json(relatorio)
  } catch (e) {
    const status = e instanceof VideoextratorError ? e.status : 502
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
