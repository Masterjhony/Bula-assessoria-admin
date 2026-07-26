/**
 * RADAR DE MERCADO — coleta da agenda pública das leiloeiras.
 *
 * Por que existe: a agenda da Bula nasce da planilha ESCALA, com sync manual, e
 * só enxerga o leilão que já é nosso. Aqui entra o que o MERCADO anuncia, para
 * produzir a informação que hoje não existe em lugar nenhum — o GAP: leilão que
 * está acontecendo e não passa por nós.
 *
 * Regra de custo (conta Apify é free, US$5/mês): fonte cujo HTML já traz o
 * conteúdo é coletada por fetch direto, custo ZERO. O Apify só é acionado para
 * site que renderiza no cliente. Ver `modo` em `mercado_fontes`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { crawlSite, isApifyConfigured } from './apify'

/* ─── Normalização de leiloeira ──────────────────────────────────────────── */

/**
 * O cronograma tem a mesma leiloeira escrita de várias formas ("PROGRAMA
 * LEILÕES", "PROGRAMA LEILOES", "PROGRAMA LEILÕEs", "E-RURAL"/"ERURAL",
 * "CENTRAL"/"CENTRAL LEILOES"). Sem unificar, qualquer contagem por leiloeira
 * mente. Esta é a fonte única do nome canônico.
 */
const CANONICO: Array<{ re: RegExp; nome: string; slug: string }> = [
    { re: /programa/i,          nome: 'Programa Leilões',  slug: 'programa-leiloes' },
    { re: /bula\s*remates?/i,   nome: 'Bula Remates',      slug: 'bula-remates' },
    { re: /e-?\s*rural/i,       nome: 'E-Rural',           slug: 'e-rural' },
    { re: /agreste/i,           nome: 'Agreste Leilões',   slug: 'agreste-leiloes' },
    { re: /central/i,           nome: 'Central Leilões',   slug: 'central-leiloes' },
    { re: /capitaliza/i,        nome: 'Capitaliza',        slug: 'capitaliza' },
    { re: /guadalupe/i,         nome: 'Guadalupe',         slug: 'guadalupe' },
    { re: /camparino/i,         nome: 'Camparino',         slug: 'camparino' },
]

export function normalizeLeiloeira(raw: string | null | undefined): { nome: string; slug: string } {
    const s = String(raw ?? '').trim()
    if (!s) return { nome: '(não informada)', slug: 'nao-informada' }
    for (const c of CANONICO) if (c.re.test(s)) return { nome: c.nome, slug: c.slug }
    const slug = s.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    return { nome: s, slug: slug || 'outra' }
}

/* ─── Chave estável do evento ────────────────────────────────────────────── */

const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Impressão digital do evento. É o que torna a coleta idempotente: rodar todo
 * dia não duplica nada. Inclui a data porque o mesmo nome se repete todo ano
 * ("3º Mega Remate"), e a leiloeira porque nomes genéricos colidem entre casas.
 */
export function fingerprintEvento(leiloeira: string, data: string | null, nome: string): string {
    return [normalizeLeiloeira(leiloeira).slug, data ?? 's-data', chave(nome).slice(0, 80)].join('|')
}

/* ─── Similaridade (mesma ideia do sync da ESCALA) ───────────────────────── */

/** Coeficiente de Dice sobre bigramas — tolera abreviação e ordem trocada. */
export function dice(a: string, b: string): number {
    const A = chave(a), B = chave(b)
    if (!A || !B) return 0
    if (A === B) return 1
    const bi = (s: string) => {
        const out = new Map<string, number>()
        for (let i = 0; i < s.length - 1; i++) {
            const g = s.slice(i, i + 2)
            out.set(g, (out.get(g) ?? 0) + 1)
        }
        return out
    }
    const ma = bi(A), mb = bi(B)
    let inter = 0
    for (const [g, n] of ma) inter += Math.min(n, mb.get(g) ?? 0)
    const total = [...ma.values()].reduce((x, y) => x + y, 0) + [...mb.values()].reduce((x, y) => x + y, 0)
    return total ? (2 * inter) / total : 0
}

/* ─── Parse: agenda diária da Programa Leilões ───────────────────────────── */

export interface EventoColetado {
    nome: string
    data: string | null          // ISO YYYY-MM-DD
    hora: string | null
    categoria: string | null
    local: string | null
    uf: string | null
    url: string | null
}

function htmlParaLinhas(html: string): string[] {
    const semScript = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    const texto = semScript
        .replace(/<[^>]+>/g, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
        .replace(/&[a-z]+;/gi, ' ')
    return texto.split('\n').map(l => l.trim()).filter(Boolean)
}

/**
 * A agenda da Programa é server-rendered. Cada leilão do dia aparece como um
 * bloco previsível ancorado na palavra "Horário":
 *
 *     quinta-feira · JUL · Horário · 20:00
 *     2° Leilão Virtual Joias do Chicão      ← nome
 *     Nelore PO                              ← categoria
 *     Londrina - PR                          ← praça
 *
 * Ancorar em "Horário" + HH:MM é mais estável do que depender de classe CSS,
 * que muda a cada reforma do site.
 */
export function parseAgendaPrograma(html: string, dataIso: string): EventoColetado[] {
    const linhas = htmlParaLinhas(html)
    const out: EventoColetado[] = []
    // O bloco do leilão vem espremido entre pedaços do calendário. Sem filtrar
    // esse ruído, "sábado" e "JUL" vazam para o campo categoria.
    const ehData = (l: string) => /^\d{2} de \w+ de \d{4}$/.test(l)
    const ehDiaSemana = (l: string) =>
        /^(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(-feira)?$/i.test(l)
    const ehMes = (l: string) =>
        /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)$/i.test(l)
    const ehRuido = (l: string) =>
        ehData(l) || ehDiaSemana(l) || ehMes(l) || /^[SDTQ]$/.test(l) || /^\d{1,2}$/.test(l)

    for (let i = 0; i < linhas.length; i++) {
        if (!/^hor[áa]rio$/i.test(linhas[i])) continue
        const hora = linhas[i + 1] && /^\d{1,2}:\d{2}$/.test(linhas[i + 1]) ? linhas[i + 1] : null
        if (!hora) continue

        // Depois da hora vêm nome, categoria e praça — pulando ruído do calendário.
        const campos: string[] = []
        for (let j = i + 2; j < linhas.length && campos.length < 3; j++) {
            const l = linhas[j]
            if (ehRuido(l)) continue
            if (/^hor[áa]rio$/i.test(l)) break
            if (/^(exibir|mais|leil[õo]es|portal|anterior|pr[óo]ximo)$/i.test(l)) break
            campos.push(l)
        }
        if (!campos.length) continue

        const nome = campos[0]
        // A praça é o campo que casa "Cidade - UF"; a categoria é o que sobra.
        const idxLocal = campos.findIndex(c => /\s-\s[A-Z]{2}$/.test(c))
        const local = idxLocal >= 0 ? campos[idxLocal] : null
        const categoria = campos.slice(1).find((c, k) => k + 1 !== idxLocal) ?? null

        out.push({
            nome,
            data: dataIso,
            hora,
            categoria: categoria && categoria !== local ? categoria : null,
            local,
            uf: local ? (local.match(/-\s*([A-Z]{2})$/)?.[1] ?? null) : null,
            url: null,
        })
    }
    return out
}

/* ─── Coleta ─────────────────────────────────────────────────────────────── */

export interface FonteRow {
    id: string
    leiloeira: string
    slug: string
    site_url: string
    agenda_url: string | null
    modo: 'http' | 'apify'
    ativo: boolean
}

export interface ResultadoColeta {
    fonte: string
    modo: string
    eventos: EventoColetado[]
    paginas: number
    custoUsd: number
    duracaoMs: number
    erro?: string
}

const ddmmaaaa = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`
const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Coleta uma fonte. `dias` limita a janela para frente — o custo (de tempo no
 * modo http, de crédito no modo apify) cresce linearmente com ela.
 */
export async function coletarFonte(fonte: FonteRow, dias = 30): Promise<ResultadoColeta> {
    const t0 = Date.now()
    const base: ResultadoColeta = { fonte: fonte.leiloeira, modo: fonte.modo, eventos: [], paginas: 0, custoUsd: 0, duracaoMs: 0 }

    try {
        if (fonte.modo === 'http' && fonte.agenda_url) {
            const hoje = new Date()
            for (let i = 0; i < dias; i++) {
                const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + i))
                const url = fonte.agenda_url.replace('{data}', ddmmaaaa(d))
                try {
                    const res = await fetch(url, {
                        headers: { 'User-Agent': 'BulaAssessoria-RadarMercado/1.0 (+https://bulaassessoria.com)' },
                        signal: AbortSignal.timeout(15_000),
                    })
                    if (!res.ok) continue
                    base.paginas++
                    base.eventos.push(...parseAgendaPrograma(await res.text(), iso(d)))
                } catch { /* dia que falhou não derruba a coleta inteira */ }
            }
        } else {
            if (!isApifyConfigured()) throw new Error('APIFY_TOKEN ausente — fonte em modo apify não pode ser coletada.')
            // Crawler genérico: por ora traz o conteúdo bruto para inspeção. O
            // parser específico de cada site entra depois que a estrutura for
            // conhecida (é barato mapear, caro adivinhar).
            const r = await crawlSite({
                startUrls: [fonte.site_url],
                maxCrawlPages: 8,                 // trava de custo no plano free
                includeUrlGlobs: ['**/agenda/**', '**/leiloes/**', '**/leilao/**'],
            })
            base.paginas = r.paginas.length
            base.custoUsd = r.custoUsd
        }
    } catch (e) {
        base.erro = e instanceof Error ? e.message : String(e)
    }

    base.duracaoMs = Date.now() - t0
    return base
}

/* ─── Persistência + casamento com o nosso cronograma ────────────────────── */

export interface ResumoPersistencia {
    novos: number
    atualizados: number
}

export async function salvarEventos(
    supabase: SupabaseClient,
    fonte: FonteRow,
    eventos: EventoColetado[],
): Promise<ResumoPersistencia> {
    if (!eventos.length) return { novos: 0, atualizados: 0 }
    const agora = new Date().toISOString()

    const linhas = eventos.map(e => ({
        fonte_id: fonte.id,
        leiloeira: normalizeLeiloeira(fonte.leiloeira).nome,
        nome: e.nome,
        data: e.data,
        hora: e.hora,
        categoria: e.categoria,
        local: e.local,
        uf: e.uf,
        url: e.url,
        fingerprint: fingerprintEvento(fonte.leiloeira, e.data, e.nome),
        visto_em: agora,
        raw: e as unknown as Record<string, unknown>,
    }))

    const fps = linhas.map(l => l.fingerprint)
    const { data: existentes } = await supabase
        .from('mercado_eventos').select('fingerprint').in('fingerprint', fps)
    const jaTinha = new Set((existentes ?? []).map(r => (r as { fingerprint: string }).fingerprint))

    // upsert por fingerprint: mantém descoberto_em do original e move visto_em.
    const { error } = await supabase
        .from('mercado_eventos')
        .upsert(linhas, { onConflict: 'fingerprint' })
    if (error) throw new Error(error.message)

    return { novos: fps.filter(f => !jaTinha.has(f)).length, atualizados: jaTinha.size }
}

/**
 * Casa os eventos coletados com `cronograma_leiloes`. O que NÃO casar é o gap —
 * leilão acontecendo no mercado sem passar por nós. Casamento por data + nome
 * (dice ≥ 0.55), que é o mesmo critério do sync da ESCALA.
 */
export async function casarComCronograma(supabase: SupabaseClient): Promise<{ casados: number; gap: number }> {
    const { data: eventos } = await supabase
        .from('mercado_eventos').select('id, nome, data, leiloeira').gte('data', new Date().toISOString().slice(0, 10))
    const { data: crono } = await supabase
        .from('cronograma_leiloes').select('id, nome, data, leiloeira')

    const lista = (crono ?? []) as Array<{ id: string; nome: string; data: string; leiloeira: string }>
    let casados = 0, gap = 0

    for (const ev of (eventos ?? []) as Array<{ id: string; nome: string; data: string; leiloeira: string }>) {
        const mesmoDia = lista.filter(c => String(c.data ?? '').slice(0, 10) === String(ev.data ?? '').slice(0, 10))
        let melhor: { id: string; score: number } | null = null
        for (const c of mesmoDia) {
            const s = dice(ev.nome, c.nome ?? '')
            if (!melhor || s > melhor.score) melhor = { id: c.id, score: s }
        }
        if (melhor && melhor.score >= 0.55) {
            casados++
            await supabase.from('mercado_eventos')
                .update({ cronograma_id: melhor.id, match_score: Math.round(melhor.score * 100) / 100 })
                .eq('id', ev.id)
        } else {
            gap++
            await supabase.from('mercado_eventos')
                .update({ cronograma_id: null, match_score: melhor ? Math.round(melhor.score * 100) / 100 : 0 })
                .eq('id', ev.id)
        }
    }
    return { casados, gap }
}
