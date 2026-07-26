/**
 * Cliente Apify — usado APENAS onde a coleta direta não resolve.
 *
 * A conta é plano free (US$ 5/mês de crédito, conferido em 25/07/2026). Isso é
 * uma restrição de projeto, não um detalhe: todo run aqui deve ser pequeno,
 * limitado por `maxCrawlPages`, e ter o custo registrado em `mercado_coletas`.
 * Site cujo HTML já traz o conteúdo NÃO passa por aqui — vai por fetch normal,
 * de graça (ver `mercado-leiloes.ts`, modo 'http').
 *
 * Sem APIFY_TOKEN o módulo vira no-op explícito: `isApifyConfigured()` devolve
 * false e as chamadas lançam com mensagem clara, em vez de falhar em runtime
 * com 401 no meio de um cron.
 */

const API = 'https://api.apify.com/v2'

/** Ator de crawl genérico: devolve o texto limpo (markdown) de cada página. */
export const ACTOR_WEBSITE_CONTENT_CRAWLER = 'apify~website-content-crawler'

export function isApifyConfigured(): boolean {
    return !!process.env.APIFY_TOKEN
}

function token(): string {
    const t = process.env.APIFY_TOKEN
    if (!t) throw new Error('APIFY_TOKEN ausente — configure no .env.local para usar a coleta via Apify.')
    return t
}

async function apiFetch<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
    const { timeoutMs = 30_000, ...rest } = init ?? {}
    const res = await fetch(`${API}${path}`, {
        ...rest,
        headers: {
            Authorization: `Bearer ${token()}`,
            'Content-Type': 'application/json',
            ...(rest.headers ?? {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Apify ${res.status}: ${body.slice(0, 300)}`)
    }
    return (await res.json()) as T
}

export interface ApifyAccount {
    username: string
    nome: string
    email: string
    plano: string
}

export async function getApifyAccount(): Promise<ApifyAccount> {
    const r = await apiFetch<{ data: Record<string, unknown> }>('/users/me')
    const d = r.data
    return {
        username: String(d.username ?? ''),
        nome: String((d.profile as Record<string, unknown> | undefined)?.name ?? ''),
        email: String(d.email ?? ''),
        plano: String(d.plan ?? (d.subscription as Record<string, unknown> | undefined)?.planId ?? 'FREE'),
    }
}

export interface ApifyUso {
    /** Crédito consumido no ciclo atual (USD). */
    gastoUsd: number
    /** Teto do plano no ciclo (USD). */
    limiteUsd: number
    /** Percentual consumido (0–100), já arredondado. */
    percentual: number
}

/**
 * Consumo do ciclo corrente. O painel usa isso para não deixar ninguém disparar
 * coleta sem enxergar quanto crédito sobrou — no plano free o teto chega rápido.
 * Nunca lança: se a rota de billing mudar, devolve zeros e a UI mostra "—".
 */
export async function getApifyUso(): Promise<ApifyUso> {
    try {
        const r = await apiFetch<{ data: Record<string, unknown> }>('/users/me/limits')
        const d = r.data ?? {}
        const atual = d.current as Record<string, unknown> | undefined
        const limites = d.limits as Record<string, unknown> | undefined
        const gasto = Number(atual?.monthlyUsageUsd ?? 0)
        const limite = Number(limites?.maxMonthlyUsageUsd ?? 0)
        return {
            gastoUsd: Number.isFinite(gasto) ? gasto : 0,
            limiteUsd: Number.isFinite(limite) ? limite : 0,
            percentual: limite > 0 ? Math.round((gasto / limite) * 100) : 0,
        }
    } catch {
        return { gastoUsd: 0, limiteUsd: 0, percentual: 0 }
    }
}

export interface CrawlResultado {
    runId: string | null
    custoUsd: number
    duracaoMs: number
    paginas: Array<{ url: string; titulo: string; texto: string }>
}

/**
 * Roda o crawler de conteúdo e devolve as páginas em texto limpo.
 *
 * Usa o endpoint síncrono (`run-sync-get-dataset-items`): para 5–20 páginas ele
 * responde em segundos e evita ter que fazer polling de run. `maxCrawlPages` é
 * OBRIGATÓRIO no chamador — é a única trava real de custo.
 */
export async function crawlSite(opts: {
    startUrls: string[]
    maxCrawlPages: number
    /** Só segue links que casem com estes globs (ex.: ['**\/agenda/**']). */
    includeUrlGlobs?: string[]
    timeoutMs?: number
}): Promise<CrawlResultado> {
    const t0 = Date.now()
    const input = {
        startUrls: opts.startUrls.map(url => ({ url })),
        maxCrawlPages: Math.max(1, Math.min(opts.maxCrawlPages, 50)),   // teto duro de segurança
        maxCrawlDepth: 2,
        crawlerType: 'playwright:adaptive',   // usa headless só quando o HTML não basta
        saveMarkdown: true,
        saveHtml: false,
        proxyConfiguration: { useApifyProxy: true },
        ...(opts.includeUrlGlobs?.length
            ? { includeUrlGlobs: opts.includeUrlGlobs.map(glob => ({ glob })) }
            : {}),
    }

    const items = await apiFetch<Array<Record<string, unknown>>>(
        `/acts/${ACTOR_WEBSITE_CONTENT_CRAWLER}/run-sync-get-dataset-items`,
        { method: 'POST', body: JSON.stringify(input), timeoutMs: opts.timeoutMs ?? 180_000 },
    )

    return {
        runId: null,   // o endpoint síncrono não devolve o run; custo vem do /limits
        custoUsd: 0,
        duracaoMs: Date.now() - t0,
        paginas: (items ?? []).map(it => ({
            url: String(it.url ?? ''),
            titulo: String(it.metadata && (it.metadata as Record<string, unknown>).title
                ? (it.metadata as Record<string, unknown>).title : (it.title ?? '')),
            texto: String(it.markdown ?? it.text ?? ''),
        })).filter(p => p.url),
    }
}
