import { NextResponse } from 'next/server'

const WHATSAPP_SERVER_URL = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001'

export async function GET() {
  try {
    const res = await fetch(`${WHATSAPP_SERVER_URL}/status`, {
      cache: 'no-store',
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
