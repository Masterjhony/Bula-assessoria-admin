/**
 * Busca leilões do cronograma para o modal de anexo manual.
 * GET ?q=<termo>  → top 20, ordenados por data ascendente (próximos primeiro).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

function sb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

export async function GET(req: NextRequest) {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

    const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''

    const today = new Date().toISOString().slice(0, 10)
    const past = new Date(); past.setDate(past.getDate() - 30)
    const pastIso = past.toISOString().slice(0, 10)

    let query = sb()
        .from('cronograma_leiloes')
        .select('id, data, nome, catalogo_url, leiloeira, criador')
        .gte('data', pastIso)
        .order('data', { ascending: true })
        .limit(20)
    if (q.length >= 2) {
        const term = `%${q.replace(/[%_]/g, '\\$&')}%`
        query = query.or(`nome.ilike.${term},criador.ilike.${term}`)
    } else {
        query = query.gte('data', today)
    }
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ leiloes: data ?? [] })
}
