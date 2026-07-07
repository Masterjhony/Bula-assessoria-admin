/**
 * Faixas de preço dos leilões — derivadas dos FECHAMENTOS reais (o que a Bula
 * efetivamente vendeu). Alimenta o Concierge de IA: quando o lead pergunta
 * "quanto custa / qual a faixa de preço", a IA responde com números reais, por
 * categoria (touros, matrizes, bezerras) em vez de desviar.
 *
 * Preço considerado = valor do lote ÷ nº de animais do lote (preço POR CABEÇA),
 * ignorando linhas sem animal (ex.: "cobertura adicional" da performance). A
 * faixa "típica" é o intervalo interquartil (p25–p75), que descarta os extremos
 * sem escondê-los (min/max continuam disponíveis).
 *
 * O cálculo varre todos os fechamentos e fica em cache de módulo (TTL 30 min) —
 * barato o bastante para rodar a cada inbound sem pesar no pipeline do WhatsApp.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type FaixaKey = 'touros' | 'matrizes' | 'bezerras' | 'geral'

export interface FaixaCategoria {
    key: FaixaKey
    label: string
    count: number
    min: number
    p25: number
    mediana: number
    p75: number
    max: number
}

export interface FaixasPreco {
    categorias: FaixaCategoria[]
    totalCabecas: number
    atualizadoEm: string // ISO
}

interface LanceRow {
    vgv?: number | string | null
    animais?: number | string | null
}

const CACHE_TTL_MS = 30 * 60 * 1000
let cache: { at: number; value: FaixasPreco } | null = null

const LABELS: Record<FaixaKey, string> = {
    touros: 'Touros/reprodutores',
    matrizes: 'Matrizes/fêmeas',
    bezerras: 'Bezerras/bezerros',
    geral: 'Geral (todos os lotes)',
}

/** Categoriza um leilão pelo nome do fechamento (melhor sinal disponível). */
function categoria(nome: string): Exclude<FaixaKey, 'geral'> | null {
    if (/bezerr/i.test(nome)) return 'bezerras'
    if (/touro|reprodutor|\bmacho/i.test(nome)) return 'touros'
    if (/matriz|f[êe]mea|ventre|doadora|novilha|prenhe|\bvaca/i.test(nome)) return 'matrizes'
    return null
}

function percentil(sorted: number[], q: number): number {
    if (sorted.length === 0) return 0
    const i = Math.floor((sorted.length - 1) * q)
    return sorted[i]
}

function statsFrom(prices: number[]): Omit<FaixaCategoria, 'key' | 'label'> {
    const s = [...prices].sort((a, b) => a - b)
    return {
        count: s.length,
        min: s[0] ?? 0,
        p25: percentil(s, 0.25),
        mediana: percentil(s, 0.5),
        p75: percentil(s, 0.75),
        max: s[s.length - 1] ?? 0,
    }
}

/**
 * Calcula as faixas de preço por categoria a partir dos fechamentos. Best-effort:
 * em erro devolve o último cache (ou null). Passe `force:true` para recalcular.
 */
export async function computeFaixasPreco(
    supabase: SupabaseClient,
    opts?: { force?: boolean },
): Promise<FaixasPreco | null> {
    if (!opts?.force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value

    const { data, error } = await supabase
        .from('bula_leilao_fechamento')
        .select('nome, lances')
    if (error || !data) return cache?.value ?? null

    const byCat: Record<Exclude<FaixaKey, 'geral'>, number[]> = { touros: [], matrizes: [], bezerras: [] }
    const geral: number[] = []

    for (const f of data as Array<{ nome: string; lances: LanceRow[] | null }>) {
        const cat = categoria(f.nome || '')
        for (const l of f.lances ?? []) {
            const a = Number(l.animais) || 0
            const v = Number(l.vgv) || 0
            if (a > 0 && v > 0) {
                const perHead = v / a
                geral.push(perHead)
                if (cat) byCat[cat].push(perHead)
            }
        }
    }

    const categorias: FaixaCategoria[] = []
    for (const key of ['touros', 'matrizes', 'bezerras'] as const) {
        if (byCat[key].length > 0) {
            categorias.push({ key, label: LABELS[key], ...statsFrom(byCat[key]) })
        }
    }
    if (geral.length > 0) {
        categorias.push({ key: 'geral', label: LABELS.geral, ...statsFrom(geral) })
    }

    const value: FaixasPreco = {
        categorias,
        totalCabecas: geral.length,
        atualizadoEm: new Date().toISOString(),
    }
    cache = { at: Date.now(), value }
    return value
}

/** "R$ 24 mil" — arredonda para o milhar mais próximo (leitura de WhatsApp). */
function milOf(n: number): string {
    const mil = Math.max(0, Math.round(n / 1000))
    return `R$ ${mil.toLocaleString('pt-BR')} mil`
}

/**
 * Bloco de texto injetado no prompt do concierge. Traz a faixa por categoria +
 * a instrução de COMO usar (responder a faixa da categoria do interesse, deixar
 * claro que é média e que o valor final sai no lance, nunca prometer juro/aprovação).
 */
export function faixasPromptBlock(f: FaixasPreco): string {
    if (!f.categorias.length) return ''
    const linhas = f.categorias.map(c => {
        const hedge = c.count < 5 ? ' (poucos negócios — trate como referência aproximada)' : ''
        return `- ${c.label}: de ~${milOf(c.min)} a ~${milOf(c.max)}, mais comum entre ${milOf(c.p25)} e ${milOf(c.p75)} (média ~${milOf(c.mediana)}).${hedge}`
    })
    return `FAIXAS DE PREÇO — referência interna (preço médio por cabeça nos nossos leilões):
${linhas.join('\n')}

COMO USAR AS FAIXAS: se o lead perguntar preço ("quanto custa", "qual a faixa", "valor médio", "tá caro?"), RESPONDA em 1–2 linhas curtas SÓ com a faixa aproximada da CATEGORIA que ele busca (touros, matrizes ou bezerras; use "Geral" se não souber ainda). Deixe explícito que é uma MÉDIA e que o valor final de cada animal sai no LANCE do leilão.
NUNCA mostre detalhe de fechamento: nada de nome de leilão, comprador, data, nem o preço de um animal/lote específico — só a faixa. NUNCA prometa preço fixo, taxa de juros, desconto ou aprovação (o parcelamento, ex.: 30x, e a condição saem na hora do leilão). Depois de responder, volte ao próximo passo do checklist.`
}
