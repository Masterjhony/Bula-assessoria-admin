/**
 * Central WhatsApp — estado de pausa.
 *
 * Quando `paused = true`, a Central permanece conectada ao WhatsApp (o VPS
 * segue logado e recebendo eventos), mas o Next.js bloqueia disparos
 * automatizados: o /api/whatsapp/inbound responde `silent` para toda mensagem
 * recebida e o /api/whatsapp/render-welcome cancela o welcome de novos leads.
 *
 * Storage: site_settings (key='whatsapp_central_paused').
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const PAUSE_KEY = 'whatsapp_central_paused'

export type PauseState = {
    paused: boolean
    paused_at: string | null
    paused_by: string | null
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
        .single()
    const v = data?.value as Partial<PauseState> | undefined
    return {
        paused: !!v?.paused,
        paused_at: v?.paused_at ?? null,
        paused_by: v?.paused_by ?? null,
    }
}
