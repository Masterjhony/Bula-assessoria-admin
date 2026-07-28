/**
 * O NÚMERO OPERACIONAL — o "funcionário" do sistema.
 *
 * Três números, três papéis, sem sobreposição:
 *
 *   API oficial (Cloud)   → falar com o CLIENTE. Só ela. O gateway recusa
 *                           atendimento no Baileys por construção.
 *   Baileys operacional   → falar com a CASA: avisar a equipe, mandar o contato
 *                           e o resumo pro assessor da zona, submeter a ficha
 *                           nos grupos das leiloeiras e registrar a decisão.
 *   Baileys automation    → captura de conteúdo em grupo (catálogos, lances,
 *                           GIF de lotes). Não fala com pessoa.
 *
 * Este módulo é a fonte única de "qual sessão é a operacional". Antes dele, cada
 * chamada de `sendVpsGroup` omitia a sessão e caía na default do VPS — e quando
 * essa default caiu (o número do João ficou aguardando QR), TODO o braço interno
 * parou junto, calado: nenhuma ficha submetida desde 12/07, nenhum aviso de
 * aprovação chegando. Um ponto único evita que isso se repita e dá um lugar só
 * pra trocar o número.
 *
 * NÃO existe substituto automático. Se o número operacional não estiver
 * conectado, o envio falha com motivo explícito — não sai por outro número.
 * Cada número tem um papel e um dono na cabeça de quem recebe: ficha de cadastro
 * chegando no grupo da leiloeira por um número que não é o da Bula operacional,
 * ou recado de cliente aprovado saindo do número que só captura catálogo, é pior
 * do que não chegar. Fallback existe como opção (`fallback: true` na config),
 * mas nasce DESLIGADO e é decisão consciente de quem liga.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchVpsSessions } from './whatsapp-vps'
import { sendOutbound } from './whatsapp-gateway'
import { assessorCanonico, type Assessor } from './assessor-zona'
import { normalizePhone } from './whatsapp-central'

export const OPERACIONAL_SETTINGS_KEY = 'whatsapp_operacional'

/** Sessão/inbox padrão do braço operacional (= whatsapp_inboxes.id no VPS). */
export const SESSAO_OPERACIONAL_PADRAO = 'operacional'

interface OperacionalConfig {
    session: string
    /**
     * Deixar o trabalho interno sair por OUTRO número quando a sessão
     * operacional estiver fora do ar. Padrão `false`: número trocado confunde
     * quem recebe e mistura papéis que devem ficar separados.
     */
    fallback: boolean
}

async function loadConfig(supabase: SupabaseClient): Promise<OperacionalConfig> {
    const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', OPERACIONAL_SETTINGS_KEY)
        .maybeSingle()
    const v = (data?.value ?? {}) as Partial<OperacionalConfig>
    return {
        session: String(v.session || SESSAO_OPERACIONAL_PADRAO),
        fallback: v.fallback === true,
    }
}

/**
 * Cache curto do estado das sessões. O fluxo de aprovação dispara vários envios
 * em sequência (grupo da leiloeira + anexos + aviso interno + assessor); sem
 * cache, cada um bateria no VPS só pra perguntar quem está conectado.
 */
let cache: { at: number; sessions: Array<{ id: string; status: string }> } | null = null
const CACHE_MS = 30_000

/**
 * `null` = não deu pra perguntar (VPS inacessível). `[]` = perguntou e não há
 * sessão nenhuma. São diagnósticos MUITO diferentes e colapsá-los num array
 * vazio faz o log dizer "a sessão não existe" quando o problema é que o
 * servidor está fora do ar — mandando quem for investigar pro lado errado.
 */
async function sessoesConectadas(): Promise<Array<{ id: string; status: string }> | null> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.sessions
    try {
        const { sessions } = await fetchVpsSessions()
        cache = { at: Date.now(), sessions: sessions.map(s => ({ id: s.id, status: s.status })) }
        return cache.sessions
    } catch {
        return null
    }
}

export interface SessaoResolvida {
    /** Id da sessão a usar no VPS. */
    session: string
    /** true quando caiu no fallback (a operacional não estava conectada). */
    fallback: boolean
    /** Explicação curta para log. */
    detalhe: string
}

/**
 * Qual sessão Baileys usar para trabalho interno, agora.
 *
 * Nunca devolve null: omitir a sessão significa "default do VPS", que é
 * justamente o comportamento implícito que quebrou. Melhor ser explícito e
 * errado de forma visível do que implícito e silencioso.
 */
export async function resolverSessaoOperacional(supabase: SupabaseClient): Promise<SessaoResolvida> {
    const cfg = await loadConfig(supabase)
    const sessions = await sessoesConectadas()

    if (sessions === null) {
        return { session: cfg.session, fallback: false, detalhe: 'VPS inacessível — não deu pra checar as sessões' }
    }

    const alvo = sessions.find(s => s.id === cfg.session)
    if (alvo?.status === 'connected') {
        return { session: cfg.session, fallback: false, detalhe: `sessão operacional ${cfg.session}` }
    }
    if (!cfg.fallback || sessions.length === 0) {
        return {
            session: cfg.session,
            fallback: false,
            detalhe: alvo ? `${cfg.session} em '${alvo.status}'` : `${cfg.session} não existe no VPS`,
        }
    }

    const substituta = sessions.find(s => s.status === 'connected')
    if (!substituta) {
        return { session: cfg.session, fallback: false, detalhe: 'nenhuma sessão Baileys conectada' }
    }
    console.warn(`[operacional] ${cfg.session} indisponível (${alvo?.status ?? 'ausente'}) — usando ${substituta.id}`)
    return {
        session: substituta.id,
        fallback: true,
        detalhe: `fallback para ${substituta.id} (${cfg.session} ${alvo?.status ?? 'ausente'})`,
    }
}

/** Atalho: só o id da sessão, para passar direto ao `sendVpsGroup`. */
export async function sessaoOperacional(supabase: SupabaseClient): Promise<string> {
    return (await resolverSessaoOperacional(supabase)).session
}

// ── Aviso 1:1 ao assessor ───────────────────────────────────────────────────

interface ResponsavelConfig {
    id?: string
    name?: string
    whatsapp?: string
    active?: boolean
}

/**
 * Telefone do assessor, do cadastro de responsáveis do CRM
 * (site_settings.crm_config.responsaveis). Casa pelo nome CANÔNICO — os
 * apelidos do dia a dia ("Leozinho", "Fábio Mena") passam por
 * `assessorCanonico` antes.
 */
export async function telefoneDoAssessor(
    supabase: SupabaseClient,
    nome: string | null | undefined,
): Promise<{ phone: string | null; nome: Assessor | null }> {
    const canonico = assessorCanonico(nome)
    if (!canonico) return { phone: null, nome: null }

    const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'crm_config')
        .maybeSingle()
    const responsaveis = ((data?.value ?? {}) as { responsaveis?: ResponsavelConfig[] }).responsaveis ?? []

    const achado = responsaveis.find(r =>
        r.active !== false && assessorCanonico(r.name) === canonico)
    return { phone: achado?.whatsapp ? normalizePhone(achado.whatsapp) : null, nome: canonico }
}

export interface AvisoAssessorResult {
    sent: boolean
    assessor: Assessor | null
    reason?: string
}

/**
 * Manda o recado direto no WhatsApp do assessor — não no grupo.
 *
 * O grupo dos assessores continua recebendo (é o log compartilhado), mas cliente
 * aprovado é responsabilidade de UMA pessoa: no grupo, "alguém avisa" costuma
 * virar "ninguém avisou". Vai pelo número operacional, intent 'assessor' (o
 * gateway trata como interno/transacional: sem guard rail de marketing, sem
 * horário comercial).
 */
export async function avisarAssessor(
    supabase: SupabaseClient,
    input: { assessor: string | null | undefined; texto: string; leadId?: string | null },
): Promise<AvisoAssessorResult> {
    const { phone, nome } = await telefoneDoAssessor(supabase, input.assessor)
    if (!nome) return { sent: false, assessor: null, reason: 'assessor_nao_identificado' }
    if (!phone) return { sent: false, assessor: nome, reason: 'assessor_sem_whatsapp' }

    const sessao = await resolverSessaoOperacional(supabase)
    const r = await sendOutbound(supabase, {
        to: { phone, leadId: input.leadId ?? null, name: nome },
        text: input.texto,
        intent: 'assessor',
        channelHint: 'baileys',
        inboxId: sessao.session,
        origin: 'operacional-assessor',
        botStep: 'assessor-handoff',
        skipGuardrails: true,
    })

    const sent = r.status === 'sent' || r.status === 'queued'
    return { sent, assessor: nome, reason: sent ? undefined : (r.reason ?? 'falha_no_envio') }
}
