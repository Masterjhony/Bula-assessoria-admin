/**
 * Reidentifica uma detecção: baixa o PDF de novo, ABRE, relê a capa e refaz o
 * casamento com o cronograma.
 *
 * Serve para o operador que discorda do resultado, para detecção antiga que
 * nunca passou pela leitura de conteúdo, e para quando o leilão só foi
 * cadastrado no cronograma DEPOIS do catálogo chegar — caso comum, e o motivo
 * pelo qual muita coisa ficava em "sem match" para sempre.
 *
 * Body opcional: { forcar: true } reprocessa mesmo o que já está anexado.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { processarDeteccao } from '@/lib/catalog-pipeline'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const gate = await requireAdmin()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
    const { id } = await params

    const body = await req.json().catch(() => ({})) as { forcar?: boolean }

    const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
        const resultado = await processarDeteccao(client, id, { forcar: body.forcar === true })
        return NextResponse.json({ ok: true, ...resultado })
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : 'falha ao reidentificar' },
            { status: 500 },
        )
    }
}
