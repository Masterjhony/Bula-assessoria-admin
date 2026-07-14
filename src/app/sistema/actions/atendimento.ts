'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { atendimentoGrowth, type AtendimentoMsg, type AtendimentoGrowth } from '@/lib/atendimento-stats'

/**
 * Números do atendimento (WhatsApp) para o Dashboard de Growth.
 * Usa a MESMA regra da aba Métricas (fonte única em atendimento-stats.ts):
 * grupo não conta, telefone canônico, resposta em até 72h do 1º disparo.
 *
 * @param dias janela em dias (default 90; cobre a base atual de mensagens).
 */
export async function getAtendimentoStats(dias = 90): Promise<AtendimentoGrowth> {
    const supabase = supabaseAdmin()
    const inicio = new Date(Date.now() - dias * 86400_000).toISOString()

    // PostgREST devolve no máximo 1000 linhas por chamada — sempre paginar.
    const msgs: AtendimentoMsg[] = []
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
            .from('whatsapp_messages')
            .select('phone, direction, status, origin, channel, created_at')
            .gte('created_at', inicio)
            .order('created_at')
            .range(from, from + 999)
        if (error) throw new Error(error.message)
        if (!data?.length) break
        msgs.push(...(data as AtendimentoMsg[]))
        if (data.length < 1000) break
    }

    return atendimentoGrowth(msgs, dias, Date.now())
}
