import { NextResponse } from 'next/server'
import { WHATSAPP_SERVER_URL, vpsHeaders } from '@/lib/whatsapp-vps'

export async function GET() {
  try {
    const res = await fetch(`${WHATSAPP_SERVER_URL}/status`, {
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
