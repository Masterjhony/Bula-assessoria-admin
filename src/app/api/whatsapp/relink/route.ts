/**
 * POST /api/whatsapp/relink?session=<id> — religa uma sessão Baileys parada.
 *
 * Quando o WhatsApp tira o aparelho conectado da conta (`device_removed`), a
 * sessão protegida vira `logged_out` no VPS e fica esperando um humano: ela não
 * reconecta sozinha nem pede QR, de propósito. Esta rota é o botão que faltava —
 * manda o VPS encerrar o socket velho, limpar o auth morto e subir de novo, e
 * devolve o QR fresco para a tela da Central desenhar. Admin-gated.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { relinkVpsSession } from '@/lib/whatsapp-vps'

export async function POST(req: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const session = (new URL(req.url).searchParams.get('session') || '').trim()
    if (!session) return NextResponse.json({ error: 'Informe a sessão.' }, { status: 400 })

    const result = await relinkVpsSession(session)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 502 })
    return NextResponse.json({ status: result.status, qr: result.qr, auth_limpo: result.auth_limpo })
}
