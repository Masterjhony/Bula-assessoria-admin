/**
 * AUTOFILL da habilitação — buscar na API de consultas o que dá, em vez de
 * pedir ao lead.
 *
 * Regra de negócio: quanto menos coisa a gente pede, menos o lead abandona (o
 * relatório de aprendizados apontou o pedido de dados como o maior ponto de
 * abandono do funil). Então, no momento em que o lead aceita a assessoria, a
 * gente tenta preencher sozinho o que é público/consultável:
 *
 *   telefone           → CPF, nome, e-mail, endereço   (Direct Data / EnriquecimentoLead)
 *   CPF + UF           → Inscrição Estadual             (provedor de I.E.)
 *
 * O que sobra pro lead é o que NENHUMA API sabe: o nome e a cidade da fazenda
 * de entrega, e os documentos com foto. Na conversa isso vira "só confirma pra
 * mim" em vez de um formulário.
 *
 * Roda ANTES de montar o prompt do concierge (por isso o timeout curto): o
 * checklist já chega com os itens marcados ✔ e a IA nunca chega a perguntar.
 * Se estourar o tempo, a consulta continua rodando em background e grava
 * assim mesmo — a próxima mensagem do lead já pega o dado preenchido.
 *
 * Custo: consultas são pagas. Por isso o gate é a FASE (só quem aceitou a
 * assessoria), somado aos gates que cada automação já tem (CPF vazio, 1x/30d).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { maybeEnrichLeadFromPhone } from './crm-lead-enrichment'
import { maybeRunStateRegistrationCheck } from './crm-state-registration-automation'
import { DEFAULT_JMP_MQL_RULE } from './crm-types'

/** Tempo que o concierge espera pelas consultas antes de responder ao lead. */
export const AUTOFILL_TIMEOUT_MS = 9_000

/** Dígitos verificadores do CPF. Sem isto, um celular de 11 dígitos vira "CPF". */
export function cpfValido(cpf: string): boolean {
    const d = String(cpf).replace(/\D/g, '')
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
    for (const [len, pos] of [[9, 10], [10, 11]] as const) {
        let soma = 0
        for (let i = 0; i < len; i++) soma += Number(d[i]) * (pos - i)
        let dv = (soma * 10) % 11
        if (dv === 10) dv = 0
        if (dv !== Number(d[len])) return false
    }
    return true
}

/**
 * Acha um CPF válido no texto do lead. Serve para o autofill rodar JÁ na
 * mensagem em que ele manda o CPF — sem isto a consulta só aconteceria na
 * mensagem seguinte, e a IA pediria a fazenda que já daria pra descobrir.
 */
export function extrairCpf(texto: string): string | null {
    const candidatos = String(texto ?? '').match(/\d[\d.\-\s]{9,17}\d/g) ?? []
    for (const c of candidatos) {
        const d = c.replace(/\D/g, '')
        // Uma sequência longa pode conter o CPF; testa janelas de 11 dígitos.
        for (let i = 0; i + 11 <= d.length; i++) {
            const janela = d.slice(i, i + 11)
            if (cpfValido(janela)) return janela
        }
    }
    return null
}

export interface AutofillLead {
    id: string
    status: string
    nome?: string | null
    telefone?: string | null
    celular?: string | null
    email?: string | null
    cpf?: string | null
    estado?: string | null
    quantidade_animais?: string | null
    inscricao_estadual?: string | null
    tem_inscricao_estadual?: string | null
    contact_history?: unknown
    extra_data?: Record<string, unknown> | null
}

export interface AutofillResult {
    /** Alguma consulta chegou a ser disparada. */
    ran: boolean
    /** Rótulos do que foi localizado agora (para o prompt "confirme, não peça"). */
    encontrados: string[]
    /** Estourou o timeout — as consultas seguem em background. */
    timedOut: boolean
}

/**
 * Corre a promise contra um prazo. Em timeout, NÃO cancela: a consulta segue e
 * grava no banco quando responder (o valor aparece na próxima mensagem).
 */
async function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | null> {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<null>(resolve => {
        timer = setTimeout(() => resolve(null), ms)
    })
    try {
        return await Promise.race([p, timeout])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

/**
 * Preenche o que der por consulta. Best-effort: qualquer falha é silenciosa —
 * o lead segue sendo atendido, só que a IA vai ter que perguntar.
 */
export async function runHabilitacaoAutofill(
    supabase: SupabaseClient,
    lead: AutofillLead,
    timeoutMs = AUTOFILL_TIMEOUT_MS,
): Promise<AutofillResult> {
    const encontrados: string[] = []
    const deadline = Date.now() + timeoutMs
    let ran = false
    let timedOut = false

    // 1) Telefone → CPF (+ e-mail, endereço). É o que mais tira burocracia da
    //    conversa: sem isso a IA precisa pedir CPF, e-mail e endereço.
    const semCpf = String(lead.cpf ?? '').replace(/\D/g, '').length !== 11
    if (semCpf) {
        ran = true
        const enr = await withDeadline(
            maybeEnrichLeadFromPhone(supabase, lead).catch(e => {
                console.warn('[autofill] enriquecimento falhou:', e instanceof Error ? e.message : e)
                return null
            }),
            Math.max(1_000, deadline - Date.now()),
        )
        if (enr === null) timedOut = true
        if (enr?.cpf) {
            lead = { ...lead, cpf: enr.cpf }
            encontrados.push('CPF')
        }
    }

    // 2) CPF + UF → Sintegra. Devolve a I.E. E a propriedade rural ligada a ela:
    //    nome da fazenda, município, UF, endereço. É o bloco "Dados da
    //    Propriedade" inteiro da ficha de cadastro, sem perguntar nada ao lead.
    const temCpf = String(lead.cpf ?? '').replace(/\D/g, '').length === 11
    const semIe = !String(lead.inscricao_estadual ?? '').trim()
    if (temCpf && semIe && Date.now() < deadline) {
        ran = true
        // `previous` com a MESMA etapa é deliberado: passar null faria a automação
        // entender "acabou de entrar na etapa" e consultar de novo a cada
        // mensagem. Com a etapa igual, vale o gate de 1 consulta a cada 30 dias.
        const previous = { status: lead.status }
        const ie = await withDeadline(
            maybeRunStateRegistrationCheck(supabase, lead, previous, DEFAULT_JMP_MQL_RULE).catch(e => {
                console.warn('[autofill] consulta de I.E. falhou:', e instanceof Error ? e.message : e)
                return null
            }),
            Math.max(1_000, deadline - Date.now()),
        )
        if (ie === null) timedOut = true
        if (ie?.inscricaoEstadual) {
            encontrados.push('Inscrição Estadual')
            // A automação grava a propriedade em extra_data; relemos para saber
            // se veio, e assim dizer à IA que é pra CONFIRMAR, não perguntar.
            const { data } = await supabase.from('crm_leads').select('extra_data').eq('id', lead.id).single()
            const xd = (data?.extra_data ?? {}) as Record<string, unknown>
            if (xd.fazenda_nome) encontrados.push(`fazenda "${String(xd.fazenda_nome)}"`)
            if (xd.fazenda_cidade) encontrados.push(`cidade/UF da fazenda (${String(xd.fazenda_cidade)}/${String(xd.fazenda_uf ?? '')})`)
        }
    }

    return { ran, encontrados, timedOut }
}

/**
 * Bloco de prompt do que foi localizado sozinho. A instrução é deliberada:
 * a IA CONFIRMA com naturalidade e nunca conta que "consultou uma base" —
 * a sensação pro lead é de estar sendo bem atendido, não investigado.
 */
export function autofillPromptBlock(encontrados: string[]): string {
    if (!encontrados.length) return ''
    return [
        `DADOS QUE JÁ LOCALIZAMOS SOZINHOS (${encontrados.join(', ')}):`,
        '- NÃO peça estes dados ao lead — eles já estão no checklist como ✔.',
        '- CONFIRME numa linha, com naturalidade ("é a Fazenda Santana, em Santa Maria Madalena/RJ, certo?").',
        '- NUNCA diga que consultamos base de dados, CPF ou órgão nenhum. Diga "já tenho aqui".',
        '- Como a propriedade já está confirmada, peça APENAS UMA foto do documento (CNH ou RG). Nada de selfie nem comprovante.',
    ].join('\n')
}
