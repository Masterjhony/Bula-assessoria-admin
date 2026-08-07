/**
 * /api/openfinance/connect-token — token de sessão pro widget Pluggy Connect
 * (página /sistema/openfinance). O frontend nunca vê o client secret; o token
 * expira sozinho e só serve pra abrir o fluxo de consentimento.
 * Auth: sessão logada do sistema (mesmo padrão das rotas /sistema).
 */

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { createConnectToken, isPluggyConfigured } from '@/lib/pluggy'

export const dynamic = 'force-dynamic'

export async function POST() {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status })
    if (!isPluggyConfigured()) return NextResponse.json({ error: 'pluggy_nao_configurado' }, { status: 500 })
    try {
        const accessToken = await createConnectToken()
        return NextResponse.json({ accessToken })
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 502 })
    }
}
