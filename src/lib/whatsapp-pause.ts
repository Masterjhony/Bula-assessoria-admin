/**
 * Central WhatsApp — estado de pausa.
 *
 * Quando `paused = true`, a Central permanece conectada ao WhatsApp (o VPS
 * segue logado e recebendo eventos), mas NADA automatizado sai. A trava vale em
 * três camadas, de propósito:
 *
 *   1. `sendOutbound` (whatsapp-gateway) recusa todo envio automático — bot,
 *      resposta do concierge, campanha, broadcast. É o backstop: pega inclusive
 *      código futuro que ninguém lembrou de pausar.
 *   2. Os crons que MEXEM EM ESTADO quando o envio falha (follow-up agendado,
 *      catchup, campanhas) saem cedo, antes de tentar. Sem isso a pausa queimaria
 *      as 3 tentativas do follow-up e apagaria o agendamento do lead.
 *   3. O inbound não roda automação nenhuma — só registra a mensagem e chama a
 *      equipe no grupo interno, para um humano assumir.
 *
 * O que NÃO é travado: mensagem com humano no comando (envio manual do cockpit,
 * recado ao assessor, plano operacional aprovado) e os avisos internos da
 * equipe (resumo diário, aviso de grupo) — pausar o robô não é ficar cego.
 *
 * Storage: site_settings (key='whatsapp_central_paused').
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const PAUSE_KEY = 'whatsapp_central_paused'

export type PauseState = {
    paused: boolean
    paused_at: string | null
    paused_by: string | null
    /** Texto livre do motivo, quando a pausa foi ligada com uma justificativa. */
    reason?: string | null
}

export async function readPauseState(supabase?: SupabaseClient): Promise<PauseState> {
    const sb = supabase ?? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data } = await sb
        .from('site_settings')
        .select('value')
        .eq('key', PAUSE_KEY)
        .maybeSingle()
    const v = data?.value as Partial<PauseState> | undefined
    return {
        paused: !!v?.paused,
        paused_at: v?.paused_at ?? null,
        paused_by: v?.paused_by ?? null,
        reason: v?.reason ?? null,
    }
}

/**
 * Atalho para os pontos que só precisam do sim/não. Falha fechada: se a leitura
 * der erro, `readPauseState` devolve `paused:false` (o sistema volta a operar) —
 * a pausa é uma decisão do dono registrada no banco, não um fail-safe de rede.
 */
export async function isCentralPaused(supabase?: SupabaseClient): Promise<boolean> {
    return (await readPauseState(supabase)).paused
}
