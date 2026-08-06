/**
 * PORTEIRA DOS GRUPOS — o que o sistema tem o direito de guardar.
 *
 * O número do Baileys é um WhatsApp de pessoa: ele está em grupo de família, de
 * bairro, de OLX, de futebol. O VPS encaminha TODA mensagem de grupo pro Next, e
 * até aqui o `/api/whatsapp/group-inbound` gravava tudo em `whatsapp_messages`
 * antes de perguntar se aquilo interessava. Resultado: conversa particular do
 * dono indo parar no banco da empresa e no painel da Central — e, de quebra, o
 * contador de "inbound 24h" virando ficção (692 mensagens, quase nenhuma de
 * cliente).
 *
 * A regra passa a ser a inversa: guarda-se o que tem consumidor declarado.
 *
 *   • grupos de cadastro das leiloeiras  (leiloeiras.whatsapp_group_id)
 *   • grupo de lances do pregão          (site_settings.whatsapp_lances_groups)
 *   • grupos internos do CRM             (crm_concierge.notify/assessores)
 *   • fontes da Central Operacional      (operational_sources, já curada)
 *
 * Qualquer outro grupo é ignorado ANTES de virar linha no banco. Não é filtro de
 * exibição: é não coletar. Filtro de tela deixaria o dado gravado, e o problema
 * dele não é ver — é estar lá.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Cache curto: a porteira roda em toda mensagem de grupo. */
let cache: { at: number; jids: Set<string> } | null = null
const CACHE_MS = 60_000

function limpo(v: unknown): string {
    return String(v ?? '').trim()
}

/**
 * JIDs de todos os grupos com consumidor no sistema. Falha aberta NÃO é opção
 * aqui: se as consultas quebrarem, devolvemos o conjunto vazio e nada é gravado
 * — perder log de grupo é menos grave que gravar conversa particular.
 */
export async function gruposRelevantes(supabase: SupabaseClient): Promise<Set<string>> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.jids

    const jids = new Set<string>()

    const [leiloeiras, settings, sources] = await Promise.all([
        supabase.from('leiloeiras').select('whatsapp_group_id').not('whatsapp_group_id', 'is', null),
        supabase.from('site_settings').select('key, value').in('key', ['whatsapp_lances_groups', 'crm_concierge', 'whatsapp_agente']),
        supabase.from('operational_sources').select('whatsapp_jid').eq('source_kind', 'group').eq('active', true),
    ])

    for (const l of (leiloeiras.data ?? []) as Array<{ whatsapp_group_id: string | null }>) {
        const v = limpo(l.whatsapp_group_id)
        if (v) jids.add(v)
    }

    for (const s of (settings.data ?? []) as Array<{ key: string; value: unknown }>) {
        const value = (s.value ?? {}) as Record<string, unknown>
        if (s.key === 'whatsapp_lances_groups') {
            const arr = Array.isArray(value.jids) ? value.jids : []
            for (const j of arr) {
                const v = limpo(j)
                if (v) jids.add(v)
            }
        }
        if (s.key === 'crm_concierge') {
            for (const campo of ['notifyGroupId', 'assessoresGroupId']) {
                const v = limpo(value[campo])
                if (v) jids.add(v)
            }
        }
        if (s.key === 'whatsapp_agente') {
            const v = limpo(value.groupJid)
            if (v) jids.add(v)
            const arr = Array.isArray(value.groupJids) ? value.groupJids : []
            for (const j of arr) {
                const g = limpo(j)
                if (g) jids.add(g)
            }
        }
    }

    for (const s of (sources.data ?? []) as Array<{ whatsapp_jid: string | null }>) {
        const v = limpo(s.whatsapp_jid)
        if (v) jids.add(v)
    }

    cache = { at: Date.now(), jids }
    return jids
}

/** Este grupo tem consumidor no sistema? */
export async function grupoRelevante(supabase: SupabaseClient, jid: string): Promise<boolean> {
    if (!jid) return false
    return (await gruposRelevantes(supabase)).has(jid.trim())
}

/** Zera o cache — usar depois de cadastrar leiloeira/fonte nova. */
export function invalidarCacheGrupos(): void {
    cache = null
}
