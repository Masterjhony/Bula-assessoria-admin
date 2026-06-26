/**
 * Mensagem automática de boas-vindas do CRM (1ª mensagem ao lead novo).
 *
 * Regra de negócio (desenho aprovado): para TODO lead novo que cai, o sistema
 * dispara automaticamente o template APROVADO da Meta pela API OFICIAL. Como é
 * a Bula iniciando o contato (lead ainda não escreveu, janela de 24h fechada),
 * o envio precisa ser por template aprovado — texto livre só depois que o lead
 * responde. Ao responder, abre a janela e o atendimento segue livre no cockpit.
 *
 * Caminho de envio: passa pelo gateway (`sendOutbound`) com `templateName` +
 * `templateParams` e canal forçado Cloud, então herda opt-out, log unificado em
 * `whatsapp_messages` (é o que faz a conversa aparecer no inbox do cockpit) e o
 * contador diário. O corpo logado é o template já renderizado (`WELCOME_TEMPLATE_BODY`),
 * pra exibição bater com o que o lead recebe. O dedup de 24h vive aqui (o gateway
 * não deduplica intents 1:1) — o mesmo número nunca recebe dois welcomes em
 * janela curta, mesmo que entre por dois pontos de criação ao mesmo tempo.
 *
 * Atenção: o conteúdo enviado é FIXO no template aprovado. Editar o texto do
 * welcome no cockpit (`site_settings.crm_whatsapp_welcome`) NÃO muda o que sai —
 * pra mudar o texto, edite o template e reaprove na Meta, depois ajuste
 * `WELCOME_TEMPLATE_NAME`/`WELCOME_TEMPLATE_BODY`. O cockpit segue controlando o
 * liga/desliga (`enabled`).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { firstName, normalizePhone, phoneVariants, renderTemplate } from './whatsapp-central'
import { sendOutbound } from './whatsapp-gateway'

export const WELCOME_KEY = 'crm_whatsapp_welcome'

/**
 * Template aprovado da Meta usado como welcome ao lead novo (envio business-
 * initiated, fora da janela de 24h). Tem 1 variável no corpo ({{1}} = 1º nome).
 */
export const WELCOME_TEMPLATE_NAME = 'bula_qualificacao_interesse_po_20260624'
export const WELCOME_TEMPLATE_LANGUAGE = 'pt_BR'

/**
 * Espelho do corpo do template aprovado — usado APENAS para exibição/log no
 * cockpit (o conteúdo realmente enviado é o template na Meta). `{nome}` é a 1ª
 * variável. Mantenha sincronizado com o texto aprovado em WELCOME_TEMPLATE_NAME.
 */
export const WELCOME_TEMPLATE_BODY = `Olá, {nome}! Tudo bem?

Aqui é o João da Bula Assessoria.

Vi que você demonstrou interesse em genética, assessoria ou oportunidades na pecuária, então queria entender melhor o seu momento para ver onde conseguimos ser mais úteis.

Hoje você já trabalha com gado P.O. ou está buscando entrar/melhorar nessa área?`

/** Janela de dedup: não reenviar welcome ao mesmo número nesse intervalo. */
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000 // 24h

export interface CrmWelcomeConfig {
    /** Liga/desliga o disparo automático. */
    enabled: boolean
    /** Corpo da mensagem. `{nome}` vira o primeiro nome do lead. */
    message: string
}

// Texto padrão (voz da Bula Assessoria). `{nome}` é interpolado com o primeiro
// nome do lead via renderTemplate.
export const DEFAULT_WELCOME_MESSAGE = `Olá, {nome}! Tudo bem?

Aqui é da Bula Assessoria. Vi que você demonstrou interesse em genética, assessoria ou oportunidades na pecuária, então queria entender melhor o seu momento para ver onde conseguimos ser mais úteis.

Hoje você já trabalha com gado P.O. ou está buscando entrar/melhorar nessa área?

Pra eu te direcionar melhor, você está mais interessado em:

1️⃣ Compra ou venda de animais
2️⃣ Gado P.O. / genética Nelore
3️⃣ Sêmen, embriões ou acasalamentos
4️⃣ Assessoria para leilões
5️⃣ Melhorar resultado do seu rebanho
6️⃣ Ainda está só avaliando possibilidades

Pode me responder com o número ou me contar rapidamente seu cenário.`

export const DEFAULT_WELCOME_CONFIG: CrmWelcomeConfig = {
    enabled: true,
    message: DEFAULT_WELCOME_MESSAGE,
}

function mergeConfig(raw: Partial<CrmWelcomeConfig> | null | undefined): CrmWelcomeConfig {
    const r = raw ?? {}
    const message = typeof r.message === 'string' && r.message.trim().length > 0
        ? r.message
        : DEFAULT_WELCOME_CONFIG.message
    return {
        enabled: r.enabled ?? DEFAULT_WELCOME_CONFIG.enabled,
        message,
    }
}

export async function loadCrmWelcome(supabase: SupabaseClient): Promise<CrmWelcomeConfig> {
    const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', WELCOME_KEY)
        .maybeSingle()
    return mergeConfig(data?.value as Partial<CrmWelcomeConfig> | undefined)
}

export async function saveCrmWelcome(
    supabase: SupabaseClient,
    config: Partial<CrmWelcomeConfig>,
): Promise<CrmWelcomeConfig> {
    const merged = mergeConfig(config)
    const { error } = await supabase
        .from('site_settings')
        .upsert(
            { key: WELCOME_KEY, value: merged, updated_at: new Date().toISOString() },
            { onConflict: 'key' },
        )
    if (error) throw new Error(`Error saving welcome config: ${error.message}`)
    return merged
}

/** Já mandamos um welcome a este número nas últimas 24h? (dedup) */
async function hasRecentWelcome(supabase: SupabaseClient, phone: string): Promise<boolean> {
    const variants = phoneVariants(phone)
    if (variants.length === 0) return false
    const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
    const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .in('phone', variants)
        .eq('direction', 'outbound')
        .eq('bot_step', 'welcome')
        .in('status', ['sent', 'queued'])
        .gte('created_at', since)
        .limit(1)
    if (error) {
        console.warn('[crm-welcome] dedup check falhou:', error.message)
        return false // na dúvida, prefere mandar a perder o welcome
    }
    return (data?.length ?? 0) > 0
}

export type WelcomeDispatchResult =
    | { attempted: false; reason: 'disabled' | 'no_phone' | 'recent_welcome' | 'empty_message' }
    | { attempted: true; status: 'sent' | 'queued' | 'failed' | 'held' | 'blocked'; reason?: string }

/**
 * Dispara a mensagem automática de boas-vindas para um lead novo, pelo número
 * conectado (Baileys). Idempotente dentro da janela de dedup (24h) e respeita
 * opt-out (via gateway). Best-effort: nunca deve derrubar a criação do lead —
 * o caller deve chamar com `.catch()` / dentro de try.
 */
export async function dispatchCrmWelcome(
    supabase: SupabaseClient,
    input: { phone?: string | null; nome?: string | null; leadId?: string | null; origin?: string },
): Promise<WelcomeDispatchResult> {
    const config = await loadCrmWelcome(supabase)
    if (!config.enabled) return { attempted: false, reason: 'disabled' }

    const phone = normalizePhone(input.phone || '')
    if (!phone) return { attempted: false, reason: 'no_phone' }

    const body = config.message?.trim()
    if (!body) return { attempted: false, reason: 'empty_message' }

    if (await hasRecentWelcome(supabase, phone)) {
        return { attempted: false, reason: 'recent_welcome' }
    }

    const nome = input.nome?.trim() || ''
    const fname = firstName(nome) || 'amigo(a)'
    // Corpo renderizado = o que o lead vê e o que logamos no cockpit. O envio
    // real é o template aprovado; `fname` preenche a variável {{1}} na Meta.
    const text = renderTemplate(WELCOME_TEMPLATE_BODY, { nome: fname, name: nome })

    const result = await sendOutbound(supabase, {
        to: { phone, leadId: input.leadId ?? null, name: nome || 'Lead' },
        text,
        templateName: WELCOME_TEMPLATE_NAME,
        templateLanguage: WELCOME_TEMPLATE_LANGUAGE,
        templateParams: [fname],
        intent: 'bot',
        channelHint: 'cloud',
        origin: input.origin ?? 'crm-welcome',
        botStep: 'welcome',
    })

    return { attempted: true, status: result.status, reason: result.reason }
}
