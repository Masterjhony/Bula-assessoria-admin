/**
 * Custo REAL do WhatsApp, lido do faturamento da própria Meta.
 *
 * Até 11/08/2026 a Central estimava o gasto multiplicando "conversas iniciadas
 * pela empresa" por uma tarifa média chutada de US$ 0,07. Errava nos dois lados:
 * a Meta não cobra por conversa e sim POR MENSAGEM, com preço que varia 9x entre
 * categorias (marketing US$ 0,0625 · utilidade US$ 0,0068), e não cobra nada
 * pela resposta dentro da janela de 24h — que no nosso caso foram 1.500
 * mensagens grátis num período de 3.363 enviadas.
 *
 * O endpoint `pricing_analytics` da WABA devolve volume e custo já faturados,
 * por dia e por categoria. É a única fonte que não depende do nosso código.
 *
 * Limites da API (verificados): janela de consulta de no máximo 1 ano.
 */

export interface MetaBillingCategoria {
    categoria: string
    volume: number
    custo_usd: number
}

export interface MetaBilling {
    /** Mensagens cobradas (marketing + utilidade). */
    volume_cobrado: number
    /** Mensagens de serviço — resposta dentro da janela de 24h, sem custo. */
    volume_gratis: number
    custo_usd: number
    por_categoria: MetaBillingCategoria[]
    /** Falso quando a Meta não respondeu — o caller deve degradar, não mentir. */
    ok: boolean
    erro?: string
}

const VAZIO: MetaBilling = { volume_cobrado: 0, volume_gratis: 0, custo_usd: 0, por_categoria: [], ok: false }

/** Categorias sem custo — a Meta as devolve com cost 0. */
const GRATIS = new Set(['SERVICE'])

/**
 * Faturamento da WABA no intervalo. Nunca lança: em erro devolve `ok: false`
 * para a tela mostrar "indisponível" em vez de um número inventado.
 */
export async function getMetaBilling(inicio: Date, fim: Date): Promise<MetaBilling> {
    const token = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN
    const waba = process.env.WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID
    const graph = (process.env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v25.0').replace(/^v?/, 'v')
    if (!token || !waba) return { ...VAZIO, erro: 'cloud_nao_configurado' }

    const start = Math.floor(inicio.getTime() / 1000)
    const end = Math.floor(fim.getTime() / 1000)
    const fields = `pricing_analytics.start(${start}).end(${end}).granularity(DAILY)`
        + `.metric_types(['COST','VOLUME']).dimensions(['PRICING_CATEGORY'])`

    try {
        const res = await fetch(
            `https://graph.facebook.com/${graph}/${waba}?fields=${encodeURIComponent(fields)}`,
            { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) },
        )
        const json = await res.json() as {
            error?: { message?: string }
            pricing_analytics?: { data?: { data_points?: { pricing_category?: string; volume?: number; cost?: number }[] }[] }
        }
        if (json.error) return { ...VAZIO, erro: json.error.message ?? 'erro_meta' }

        const pontos = json.pricing_analytics?.data?.flatMap(d => d.data_points ?? []) ?? []
        const mapa = new Map<string, MetaBillingCategoria>()
        for (const p of pontos) {
            const c = p.pricing_category ?? 'DESCONHECIDA'
            const x = mapa.get(c) ?? { categoria: c, volume: 0, custo_usd: 0 }
            x.volume += p.volume ?? 0
            x.custo_usd += p.cost ?? 0
            mapa.set(c, x)
        }
        const por_categoria = [...mapa.values()]
            .map(x => ({ ...x, custo_usd: Number(x.custo_usd.toFixed(4)) }))
            .sort((a, b) => b.custo_usd - a.custo_usd)

        return {
            volume_cobrado: por_categoria.filter(x => !GRATIS.has(x.categoria)).reduce((a, x) => a + x.volume, 0),
            volume_gratis: por_categoria.filter(x => GRATIS.has(x.categoria)).reduce((a, x) => a + x.volume, 0),
            custo_usd: Number(por_categoria.reduce((a, x) => a + x.custo_usd, 0).toFixed(4)),
            por_categoria,
            ok: true,
        }
    } catch (e) {
        return { ...VAZIO, erro: e instanceof Error ? e.message : 'falha_rede' }
    }
}
