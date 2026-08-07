/**
 * /api/openfinance/status — conexões ativas + últimas transações recebidas,
 * para a página /sistema/openfinance. Somente leitura.
 */

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status })

    const sb = supabaseAdmin()
    const [itens, transacoes] = await Promise.all([
        sb.from('openfinance_itens').select('item_id, connector, status, contas, last_sync').order('created_at'),
        sb.from('openfinance_transacoes')
            .select('id, conta, data, descricao, valor, processado')
            .order('data', { ascending: false })
            .limit(40),
    ])
    return NextResponse.json({ itens: itens.data ?? [], transacoes: transacoes.data ?? [] })
}
