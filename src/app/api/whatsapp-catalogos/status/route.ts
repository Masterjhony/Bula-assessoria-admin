/**
 * Proxy do status da SEGUNDA sessão Baileys (catálogos).
 * Retorna { status: 'connected' | 'qr' | 'connecting' | 'disconnected', qr?: dataUrl }
 */

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

export async function GET() {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

    // Lê env a cada request — `const` no topo do módulo fica preso ao primeiro
    // cold-start do lambda e ignora envs adicionadas depois.
    const VPS_URL = process.env.WHATSAPP_CATALOGS_SERVER_URL || 'http://localhost:3002'

    try {
        const r = await fetch(`${VPS_URL}/status`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(5000),
        })
        if (!r.ok) {
            return NextResponse.json({ status: 'disconnected', qr: null, error: `vps ${r.status}` })
        }
        const data = await r.json()
        return NextResponse.json(data)
    } catch (e) {
        return NextResponse.json({
            status: 'disconnected',
            qr: null,
            error: e instanceof Error ? e.message : 'fetch failed',
        })
    }
}
