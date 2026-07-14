import { NextRequest, NextResponse } from 'next/server'
import { WHATSAPP_SERVER_URL, vpsHeaders } from '@/lib/whatsapp-vps'

export async function GET(req: NextRequest) {
  // Multi-inbox: ?session=<id> consulta o status de uma sessão Baileys específica.
  // Sem o param, o VPS responde pela sessão default (compat).
  const session = (new URL(req.url).searchParams.get('session') || '').trim()
  const url = session
    ? `${WHATSAPP_SERVER_URL}/status?session=${encodeURIComponent(session)}`
    : `${WHATSAPP_SERVER_URL}/status`
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: vpsHeaders(),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      throw new Error(`WhatsApp server responded with ${res.status}`)
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('API /whatsapp/status error:', error)
    return NextResponse.json(
      { status: 'disconnected', qr: null, error: error.message },
      { status: 200 }
    )
  }
}
