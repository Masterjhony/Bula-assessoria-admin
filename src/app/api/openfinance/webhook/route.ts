/**
 * /api/openfinance/webhook — o Pluggy chama aqui quando um item (conexão
 * bancária) é criado/atualizado, ou seja: TRANSAÇÃO NOVA nas contas.
 *
 * Auth: query `?t=<OPENFINANCE_WEBHOOK_TOKEN>` (o Pluggy não assina webhooks;
 * o token na URL registrada faz o papel). Processamento no after(): sincroniza
 * o item pro STAGING (openfinance_transacoes) e avisa os admins no WhatsApp —
 * nada entra no ERP automaticamente; conciliar continua sendo decisão humana
 * (ou conversa com o agente).
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isPluggyConfigured, syncItem } from '@/lib/pluggy'
import { loadAgenteConfigCached } from '@/lib/whatsapp-agente-config'
import { sendVpsDirect } from '@/lib/whatsapp-vps'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const brl = (n: number) => 'R$ ' + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

export async function POST(req: NextRequest) {
    const token = process.env.OPENFINANCE_WEBHOOK_TOKEN || ''
    if (!token || req.nextUrl.searchParams.get('t') !== token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isPluggyConfigured()) return NextResponse.json({ error: 'nao_configurado' }, { status: 500 })

    let body: { event?: string; itemId?: string }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const itemId = (body.itemId || '').trim()
    const event = body.event || ''
    if (!itemId) return NextResponse.json({ ok: true, ignored: 'sem_item' })
    if (!/^(item\/(created|updated)|transactions\/)/.test(event)) {
        return NextResponse.json({ ok: true, ignored: event })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    after(async () => {
        try {
            const { novas } = await syncItem(supabase, itemId)
            if (!novas.length) return
            // aviso aos ADMINS via número operacional (mesmo canal do agente)
            const cfg = await loadAgenteConfigCached(supabase)
            const admins = cfg.numeros.filter(n => n.role === 'admin')
            const linhas = novas.slice(0, 8).map(t =>
                `${t.valor >= 0 ? '🟢 +' : '🔴 -'}${brl(t.valor)} — ${t.descricao.slice(0, 60)} (${t.conta}, ${t.data.split('-').reverse().join('/')})`)
            const extra = novas.length > 8 ? `\n… e mais ${novas.length - 8} transações.` : ''
            const msg = `🏦 *Movimentação bancária detectada* (${novas.length} nova${novas.length > 1 ? 's' : ''}):\n\n${linhas.join('\n')}${extra}\n\nEstão na fila de conciliação — me pergunta "transações pendentes" pra revisar.`
            for (const adm of admins) {
                await sendVpsDirect(adm.phone, msg, undefined, cfg.session).catch(() => null)
            }
        } catch (e) {
            console.warn('[openfinance] sync falhou:', e instanceof Error ? e.message : e)
        }
    })

    return NextResponse.json({ ok: true })
}
