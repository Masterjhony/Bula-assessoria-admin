/**
 * Agenda de próximos leilões — bloco de contexto para o Concierge de IA.
 *
 * Quando o lead pergunta "quando é o próximo leilão?", "quais leilões vêm aí?"
 * ou "quero comprar touro, tem algum evento?", a IA responde com os eventos
 * REAIS da agenda (bula_leiloes, status confirmado) em vez de desviar ou
 * inventar. É o mesmo padrão do bloco de faixas de preço (leilao-faixas-preco):
 * consulta barata + cache de módulo, injetada no system prompt a cada inbound.
 *
 * Fronteira de dados: só campos públicos da agenda (os mesmos da página
 * /agenda) — nome, data, horário, modelo, leiloeira, condição, frete. Nada de
 * financeiro interno.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface LeilaoAgendaItem {
    nome: string
    data: string // YYYY-MM-DD
    horario: string | null
    modelo: string | null
    leiloeira: string | null
    condicao: string | null
    frete_gratis: string | null
    transmissao: string | null
}

const CACHE_TTL_MS = 15 * 60 * 1000
let cache: { at: number; value: LeilaoAgendaItem[] } | null = null

function todaySaoPaulo(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date())
}

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** "2026-07-12" → "12/07 (domingo)". */
function dataCurta(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number)
    if (!y || !m || !d) return iso
    const dow = DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} (${dow})`
}

/**
 * Próximos leilões confirmados (hoje em diante), ordenados por data. Best-effort:
 * em erro devolve o último cache (ou lista vazia).
 */
export async function computeProximosLeiloes(
    supabase: SupabaseClient,
    opts?: { force?: boolean; limit?: number },
): Promise<LeilaoAgendaItem[]> {
    if (!opts?.force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value

    const { data, error } = await supabase
        .from('bula_leiloes')
        .select('nome, data, horario, modelo, leiloeira, condicao, frete_gratis, transmissao')
        .eq('status', 'confirmado')
        .gte('data', todaySaoPaulo())
        .order('data', { ascending: true })
        .order('horario', { ascending: true })
        .limit(opts?.limit ?? 6)
    if (error || !data) return cache?.value ?? []

    const value = (data as LeilaoAgendaItem[]).filter(l => (l.nome || '').trim())
    cache = { at: Date.now(), value }
    return value
}

/**
 * Bloco de texto injetado no prompt do concierge: a lista dos próximos leilões
 * + a instrução de COMO usar (responder com 1–3 eventos relevantes ao interesse,
 * nunca inventar evento fora da lista, apontar a agenda pública).
 */
export function agendaPromptBlock(leiloes: LeilaoAgendaItem[]): string {
    const header = 'PRÓXIMOS LEILÕES (agenda oficial — os únicos eventos que você pode citar):'
    const comoUsar = `COMO USAR A AGENDA: se o lead perguntar por próximos leilões/datas ("quando é o próximo?", "tem leilão de matriz?"), cite 1 a 3 eventos da lista acima que combinem com o interesse dele (nome + data + hora + condição, em linhas curtas) e convide: se ele se habilitar agora, chega no leilão pronto pra dar lance. NUNCA invente leilão, data ou condição fora da lista. A agenda completa é pública: bulaassessoria.com/agenda. Depois volte ao próximo passo do checklist.`

    if (!leiloes.length) {
        return `${header}
- (nenhum leilão confirmado na agenda neste momento)

COMO USAR A AGENDA: se o lead perguntar por próximos leilões, diga que a agenda de eventos está sendo atualizada (bulaassessoria.com/agenda) e que, com a habilitação pronta, ele é avisado assim que abrir leilão da categoria que busca. NUNCA invente leilão ou data. Depois volte ao checklist.`
    }

    const linhas = leiloes.map(l => {
        const partes = [
            `${dataCurta(l.data)}${l.horario ? ` às ${l.horario}` : ''}`,
            l.nome.trim(),
            l.modelo ? l.modelo.toLowerCase() : null,
            l.leiloeira ? `leiloeira ${l.leiloeira}` : null,
            l.condicao || null,
            l.frete_gratis ? `frete grátis: ${l.frete_gratis}` : null,
        ].filter(Boolean)
        return `- ${partes.join(' — ')}`
    })
    return `${header}
${linhas.join('\n')}

${comoUsar}`
}
