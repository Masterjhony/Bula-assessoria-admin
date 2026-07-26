'use server'

import { createClient } from '@supabase/supabase-js'
import { getApifyAccount, getApifyUso, isApifyConfigured } from '@/lib/apify'
import { normalizeLeiloeira } from '@/lib/mercado-leiloes'
import { ehNelorePo } from '@/lib/mercado-categorias'

// ─────────────────────────────────────────────────────────────────────────────
// Leitura do RADAR DE MERCADO para a tela /sistema/mercado.
//
// A pergunta que esta tela responde e que nenhuma outra responde hoje: o que o
// mercado está leiloando que NÃO passa por nós. O cronograma da Bula só enxerga
// o leilão que já é nosso, então "quanto do mercado a gente cobre" nunca foi
// mensurável.
// ─────────────────────────────────────────────────────────────────────────────

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export interface MercadoEvento {
    id: string
    leiloeira: string
    nome: string
    data: string | null
    hora: string | null
    categoria: string | null
    local: string | null
    uf: string | null
    noCronograma: boolean
    matchScore: number | null
    descobertoEm: string
}

export interface MercadoFonte {
    id: string
    leiloeira: string
    slug: string
    siteUrl: string
    modo: string
    ativo: boolean
    ultimaColetaAt: string | null
    observacoes: string | null
}

export interface MercadoColeta {
    id: string
    modo: string
    status: string
    paginas: number
    eventosNovos: number
    custoUsd: number
    duracaoMs: number | null
    erro: string | null
    createdAt: string
}

export interface MercadoKpis {
    totalEventos: number
    proximos30: number
    gap30: number
    coberturaPct: number | null
    /** Nelore PO na janela — é o mercado que a Bula de fato disputa. */
    nelorePo30: number
    /** Nelore PO que NÃO está no nosso cronograma: o gap endereçável. */
    nelorePoGap30: number
    /** Cobertura só em Nelore PO (a métrica honesta para a operação). */
    nelorePoCoberturaPct: number | null
    leiloeirasAtivas: number
}

export interface MercadoMedia {
    sexo: string
    idade: string
    valor: number
    data: string
    evento: string
    /** Variação % contra a ocorrência anterior da MESMA categoria. */
    variacaoPct: number | null
}

export interface MercadoCriador {
    posicao: number | null
    nome: string
    pontos: number | null
    situacao: 'cliente' | 'lead' | 'relacionado' | 'ausente'
    relacionados: Array<{ nome: string; token: string }>
}

export interface MercadoDados {
    kpis: MercadoKpis
    eventos: MercadoEvento[]
    porLeiloeira: Array<{ leiloeira: string; total: number; gap: number; nelore: number }>
    porCategoria: Array<{ categoria: string; total: number }>
    porUf: Array<{ uf: string; total: number }>
    fontes: MercadoFonte[]
    coletas: MercadoColeta[]
    medias: MercadoMedia[]
    mediasAtualizadasEm: string | null
    criadores: MercadoCriador[]
    criadoresCalendario: string | null
    apify: {
        configurado: boolean
        conta: string | null
        gastoUsd: number
        limiteUsd: number
        percentual: number
    }
}

const hojeIso = () => new Date().toISOString().slice(0, 10)
function maisDias(n: number): string {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
}

// A classificação vive em `@/lib/mercado-categorias` (módulo puro): arquivo
// 'use server' só exporta função async, e reexportar daqui quebraria o build.

export async function getMercado(): Promise<MercadoDados> {
    const supabase = svc()
    const hoje = hojeIso()
    const em30 = maisDias(30)

    const [evRes, fontesRes, coletasRes, mediasRes, criadoresRes] = await Promise.all([
        supabase.from('mercado_eventos')
            .select('id, leiloeira, nome, data, hora, categoria, local, uf, cronograma_id, match_score, descoberto_em')
            .gte('data', hoje)
            .order('data', { ascending: true })
            .limit(500),
        supabase.from('mercado_fontes')
            .select('id, leiloeira, slug, site_url, modo, ativo, ultima_coleta_at, observacoes')
            .order('leiloeira'),
        supabase.from('mercado_coletas')
            .select('id, modo, status, paginas, eventos_novos, custo_usd, duracao_ms, erro, created_at')
            .order('created_at', { ascending: false })
            .limit(12),
        supabase.from('mercado_medias')
            .select('sexo, idade, valor, data, evento_nome')
            .not('valor', 'is', null)
            .order('data', { ascending: false })
            .limit(400),
        supabase.from('mercado_criadores')
            .select('posicao, nome, pontos, situacao, relacionados, calendario_nome')
            .order('posicao', { ascending: true })
            .limit(200),
    ])

    const eventos: MercadoEvento[] = (evRes.data ?? []).map(e => {
        const r = e as Record<string, unknown>
        return {
            id: String(r.id),
            leiloeira: normalizeLeiloeira(String(r.leiloeira ?? '')).nome,
            nome: String(r.nome ?? ''),
            data: r.data ? String(r.data).slice(0, 10) : null,
            hora: r.hora ? String(r.hora) : null,
            categoria: r.categoria ? String(r.categoria) : null,
            local: r.local ? String(r.local) : null,
            uf: r.uf ? String(r.uf) : null,
            noCronograma: !!r.cronograma_id,
            matchScore: r.match_score == null ? null : Number(r.match_score),
            descobertoEm: String(r.descoberto_em ?? ''),
        }
    })

    const janela = eventos.filter(e => e.data && e.data <= em30)
    const gap30 = janela.filter(e => !e.noCronograma).length
    const nelorePo = janela.filter(e => ehNelorePo(e.categoria))
    const nelorePoGap = nelorePo.filter(e => !e.noCronograma).length

    const agrupa = <T extends string>(chaves: Array<T | null>) => {
        const m = new Map<string, number>()
        for (const k of chaves) {
            const key = (k ?? '').trim() || '(não informado)'
            m.set(key, (m.get(key) ?? 0) + 1)
        }
        return [...m.entries()].map(([k, n]) => [k, n] as const).sort((a, b) => b[1] - a[1])
    }

    // O ranking por leiloeira olha SÓ Nelore PO: é onde a Bula disputa. Contar
    // máquina e cavalo aqui infla a barra de quem não é concorrente nosso.
    const porLeiloeiraMap = new Map<string, { total: number; gap: number; nelore: number }>()
    for (const e of nelorePo) {
        const cur = porLeiloeiraMap.get(e.leiloeira) ?? { total: 0, gap: 0, nelore: 0 }
        cur.total++
        if (!e.noCronograma) cur.gap++
        cur.nelore++
        porLeiloeiraMap.set(e.leiloeira, cur)
    }

    // ── Médias: última cotação de cada categoria + variação contra a anterior ──
    // Agrupa por (sexo, idade) porque é assim que o pecuarista compara preço:
    // "fêmea de 12 a 18" é uma linha de mercado, não um leilão específico.
    const porCategoria = new Map<string, Array<{ valor: number; data: string; evento: string }>>()
    for (const r of (mediasRes.data ?? [])) {
        const x = r as Record<string, unknown>
        const sexo = String(x.sexo ?? '').toUpperCase()
        const idade = String(x.idade ?? '').trim()
        const valor = Number(x.valor)
        if (!sexo || !idade || !Number.isFinite(valor)) continue
        const k = `${sexo}|${idade}`
        if (!porCategoria.has(k)) porCategoria.set(k, [])
        porCategoria.get(k)!.push({ valor, data: String(x.data ?? ''), evento: String(x.evento_nome ?? '') })
    }
    const medias: MercadoMedia[] = [...porCategoria.entries()].map(([k, lista]) => {
        const [sexo, idade] = k.split('|')
        // Já vem ordenado por data desc do banco; [0] é a cotação mais recente.
        const atual = lista[0]
        const anterior = lista.find(l => l.data !== atual.data)
        return {
            sexo, idade,
            valor: atual.valor,
            data: atual.data,
            evento: atual.evento,
            variacaoPct: anterior && anterior.valor > 0
                ? Math.round(((atual.valor - anterior.valor) / anterior.valor) * 1000) / 10
                : null,
        }
    }).sort((a, b) => a.sexo === b.sexo ? a.valor - b.valor : a.sexo.localeCompare(b.sexo))

    let apify = { configurado: isApifyConfigured(), conta: null as string | null, gastoUsd: 0, limiteUsd: 0, percentual: 0 }
    if (apify.configurado) {
        const [conta, uso] = await Promise.all([
            getApifyAccount().catch(() => null),
            getApifyUso(),
        ])
        apify = { configurado: true, conta: conta?.nome ?? conta?.username ?? null, ...uso }
    }

    return {
        kpis: {
            totalEventos: eventos.length,
            proximos30: janela.length,
            gap30,
            coberturaPct: janela.length ? Math.round(((janela.length - gap30) / janela.length) * 100) : null,
            nelorePo30: nelorePo.length,
            nelorePoGap30: nelorePoGap,
            nelorePoCoberturaPct: nelorePo.length
                ? Math.round(((nelorePo.length - nelorePoGap) / nelorePo.length) * 100)
                : null,
            leiloeirasAtivas: porLeiloeiraMap.size,
        },
        eventos,
        porLeiloeira: [...porLeiloeiraMap.entries()]
            .map(([leiloeira, v]) => ({ leiloeira, ...v }))
            .sort((a, b) => b.total - a.total),
        // Categoria olha a agenda INTEIRA de propósito: restrita a Nelore PO
        // viraria uma barra só. Serve de contexto — mostra o tamanho da fatia
        // que de fato disputamos dentro do que a leiloeira toca.
        porCategoria: agrupa(janela.map(e => e.categoria)).slice(0, 12)
            .map(([categoria, total]) => ({ categoria, total })),
        // Praça só em Nelore PO: é onde o assessor precisa estar.
        porUf: agrupa(nelorePo.map(e => e.uf)).slice(0, 12)
            .map(([uf, total]) => ({ uf, total })),
        fontes: (fontesRes.data ?? []).map(f => {
            const r = f as Record<string, unknown>
            return {
                id: String(r.id), leiloeira: String(r.leiloeira), slug: String(r.slug),
                siteUrl: String(r.site_url), modo: String(r.modo), ativo: !!r.ativo,
                ultimaColetaAt: r.ultima_coleta_at ? String(r.ultima_coleta_at) : null,
                observacoes: r.observacoes ? String(r.observacoes) : null,
            }
        }),
        coletas: (coletasRes.data ?? []).map(c => {
            const r = c as Record<string, unknown>
            return {
                id: String(r.id), modo: String(r.modo), status: String(r.status),
                paginas: Number(r.paginas ?? 0), eventosNovos: Number(r.eventos_novos ?? 0),
                custoUsd: Number(r.custo_usd ?? 0),
                duracaoMs: r.duracao_ms == null ? null : Number(r.duracao_ms),
                erro: r.erro ? String(r.erro) : null,
                createdAt: String(r.created_at ?? ''),
            }
        }),
        criadores: (criadoresRes.data ?? []).map(r => {
            const x = r as Record<string, unknown>
            return {
                posicao: x.posicao == null ? null : Number(x.posicao),
                nome: String(x.nome ?? ''),
                pontos: x.pontos == null ? null : Number(x.pontos),
                situacao: String(x.situacao ?? 'ausente') as MercadoCriador['situacao'],
                relacionados: Array.isArray(x.relacionados)
                    ? (x.relacionados as Array<Record<string, unknown>>)
                        .map(v => ({ nome: String(v.nome ?? ''), token: String(v.token ?? '') }))
                    : [],
            }
        }),
        criadoresCalendario: (criadoresRes.data ?? [])[0]
            ? String(((criadoresRes.data ?? [])[0] as Record<string, unknown>).calendario_nome ?? '')
            : null,
        medias,
        mediasAtualizadasEm: medias.length
            ? medias.reduce((max, m) => (m.data > max ? m.data : max), medias[0].data)
            : null,
        apify,
    }
}
