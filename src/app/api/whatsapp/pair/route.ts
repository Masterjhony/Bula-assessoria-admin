/**
 * POST /api/whatsapp/pair — conecta o Baileys por número de telefone
 * (alternativa ao QR). Recebe { phone }, pede um código de pareamento ao VPS
 * e devolve o código de 8 caracteres para o usuário digitar no WhatsApp
 * (Aparelhos conectados → Conectar com número de telefone). Admin-gated.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { pairVpsPhone } from '@/lib/whatsapp-vps'

export async function POST(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body: { phone?: unknown }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }

    const phone = String(body.phone || '').trim()
    if (!phone) return NextResponse.json({ error: 'Informe o número (com DDD).' }, { status: 400 })

    const result = await pairVpsPhone(phone)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 502 })
    if (result.pairing_code) return NextResponse.json({ pairing_code: result.pairing_code })
    return NextResponse.json({ pending: true, message: 'Código sendo gerado, aguarde alguns segundos e tente de novo.' }, { status: 202 })
}
