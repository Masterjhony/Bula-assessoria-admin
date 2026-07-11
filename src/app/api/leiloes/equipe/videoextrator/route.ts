import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function authorized(request: Request): boolean {
  const expected = process.env.VIDEOEXTRATOR_API_TOKEN || ''
  const header = request.headers.get('authorization') || ''
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!expected || !provided) return false
  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(provided)
  return expectedBuffer.length === providedBuffer.length
    && timingSafeEqual(expectedBuffer, providedBuffer)
}

/** Snapshot mínimo do roster canônico para resolução de assessores na VPS. */
export async function GET(request: Request) {
  if (!process.env.VIDEOEXTRATOR_API_TOKEN) {
    return NextResponse.json({ error: 'Integração não configurada.' }, { status: 503 })
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin()
    .from('leiloes_equipe')
    .select('id,nome,apelido,empresa,ativo,updated_at')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 502 })
  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}
