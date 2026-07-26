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

/* ─── Parse: Leiloboi (listagem por mês + médias na página de detalhe) ───── */

const MES_NUM: Record<string, number> = {
    jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
    jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
}

/**
 * Cada leilão do Leiloboi é um `<a href="/leiloes/…-<id>">` embrulhando uma
 * `<table class="leilao">` com dia+mês, foto do folder, `<h5>` do nome, o selo
 * Corte/Elite, o horário e a praça. O ano NÃO aparece no card — vem do mês que
 * a gente pediu na URL, por isso `ano` é parâmetro e não adivinhação.
 */
export function parseResultadosLeiloboi(html: string, ano: number): EventoColetado[] {
    const blocos = [...html.matchAll(/<a href="(\/leiloes\/[^"]+)">([\s\S]{0,3000}?)<\/a>/g)]
    const out: EventoColetado[] = []

    for (const [, href, corpo] of blocos) {
        const d = /data-leilao">\s*<strong>(\d{1,2})<\/strong>\s*([a-zç]{3})/i.exec(corpo)
        const h5 = /<h5>\s*([\s\S]*?)\s*<\/h5>/.exec(corpo)
        if (!d || !h5) continue

        const dia = Number(d[1])
        const mes = MES_NUM[d[2].toLowerCase()]
        if (!mes) continue

        const nome = decodeEntidades(h5[1]).replace(/\s+/g, ' ').trim()
        if (!nome) continue

        const selo = /\b(Elite|Corte)\b/i.exec(corpo)?.[1] ?? null
        const hora = /(\d{1,2}:\d{2})/.exec(corpo)?.[1] ?? null
        const local = [...corpo.matchAll(/>\s*([^<>]{8,140}\/[A-Z]{2})\s*</g)]
            .map(m => decodeEntidades(m[1]).trim())
            .find(Boolean) ?? null

        out.push({
            nome,
            data: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
            hora,
            // O selo do Leiloboi é o tipo do leilão: "Elite" é onde mora o PO.
            categoria: selo ? (/elite/i.test(selo) ? 'Nelore PO' : 'Gado de Corte') : null,
            local,
            uf: local ? (local.match(/\/([A-Z]{2})\s*$/)?.[1] ?? null) : null,
            url: `https://leiloboi.com${href}`,
        })
    }
    return out
}

export interface MediaColetada {
    sexo: string | null
    descricao: string | null
    idade: string | null
    peso: string | null
    valor: number | null
    kgVivo: string | null
}

/**
 * Tabela "Médias do leilão" da página de detalhe. É o único dado de PREÇO
 * praticado que entra no sistema — o assessor hoje argumenta de memória.
 * Formato: Sexo | Descrição | Idade | Peso | Valor | Kg/Vivo, com o valor em
 * "R$ 2.650,18" (ponto de milhar e vírgula decimal).
 */
export function parseMediasLeiloboi(html: string): MediaColetada[] {
    const i = html.search(/M[ée]dias?\s+do\s+leil[ãa]o/i)
    if (i < 0) return []
    const trecho = html.slice(i, i + 20_000)
    const linhas = [...trecho.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    const out: MediaColetada[] = []

    for (const [, linha] of linhas) {
        const celulas = [...linha.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
            .map(c => decodeEntidades(c[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
        if (celulas.length < 3) continue
        if (/^sexo$/i.test(celulas[0])) continue             // cabeçalho
        if (!/^[MF]$/i.test(celulas[0])) continue            // só linha de dado

        const bruto = celulas.find(c => /R\$/.test(c)) ?? ''
        const valor = bruto
            ? Number(bruto.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
            : null

        out.push({
            sexo: celulas[0].toUpperCase(),
            descricao: celulas[1] || null,
            idade: celulas[2] || null,
            peso: celulas[3] && !/R\$/.test(celulas[3]) ? celulas[3] : null,
            valor: Number.isFinite(valor as number) ? (valor as number) : null,
            kgVivo: celulas.length > 5 ? celulas[5] || null : null,
        })
    }
    return out
}

/** Entidades numéricas e nomeadas que os sites de leiloeira usam à vontade. */
function decodeEntidades(s: string): string {
    return s
        .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&(?:ordm|deg);/g, 'º')
}

/* ─── Coleta ─────────────────────────────────────────────────────────────── */

export interface FonteRow {
    id: string
    leiloeira: string
    slug: string
    site_url: string
    agenda_url: string | null
    modo: 'http' | 'apify'
    /** COMO ler o site. `modo` diz como buscar; os dois são independentes. */
    parser?: string | null
    ativo: boolean
}

export interface ResultadoColeta {
    fonte: string
    modo: string
    eventos: EventoColetado[]
    /** Médias por URL de evento — só o Leiloboi publica isso hoje. */
    medias: Map<string, MediaColetada[]>
    paginas: number
    custoUsd: number
    duracaoMs: number
    erro?: string
}

const UA = 'BulaAssessoria-RadarMercado/1.0 (+https://bulaassessoria.com)'

async function buscarHtml(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) })
        if (!res.ok) return null
        return await res.text()
    } catch {
        return null
    }
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
    const base: ResultadoColeta = {
        fonte: fonte.leiloeira, modo: fonte.modo, eventos: [], medias: new Map(),
        paginas: 0, custoUsd: 0, duracaoMs: 0,
    }
    const parser = fonte.parser ?? 'generico'

    try {
        if (fonte.modo === 'http' && fonte.agenda_url && parser === 'programa') {
            // Programa: uma página POR DIA.
            const hoje = new Date()
            for (let i = 0; i < dias; i++) {
                const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + i))
                const html = await buscarHtml(fonte.agenda_url.replace('{data}', ddmmaaaa(d)))
                if (!html) continue
                base.paginas++
                base.eventos.push(...parseAgendaPrograma(html, iso(d)))
            }
        } else if (fonte.modo === 'http' && fonte.agenda_url && parser === 'leiloboi') {
            // Leiloboi: uma página POR MÊS + detalhe de cada leilão (médias).
            // Varre o mês corrente e os seguintes que a janela alcançar, mais o
            // mês ANTERIOR — é lá que ficam as médias já publicadas, que é o
            // dado que só esta fonte tem.
            const hoje = new Date()
            const meses = new Set<string>()
            for (let k = -1; k <= Math.ceil(dias / 30); k++) {
                const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + k, 1))
                meses.add(`${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`)
            }
            for (const mesano of meses) {
                const html = await buscarHtml(fonte.agenda_url.replace('{mesano}', mesano))
                if (!html) continue
                base.paginas++
                const ano = Number(mesano.split('-')[1])
                const evs = parseResultadosLeiloboi(html, ano)
                base.eventos.push(...evs)

                // Médias só existem em leilão JÁ REALIZADO — não gasta request
                // em evento futuro, que ainda não tem tabela nenhuma.
                const hojeIso = iso(new Date())
                for (const ev of evs) {
                    if (!ev.url || !ev.data || ev.data > hojeIso) continue
                    const det = await buscarHtml(ev.url)
                    if (!det) continue
                    base.paginas++
                    const m = parseMediasLeiloboi(det)
                    if (m.length) base.medias.set(ev.url, m)
                }
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
 * Grava as médias, ligando cada tabela ao evento correspondente pela URL.
 * Idempotente por fingerprint (evento + sexo + descrição + idade).
 */
export async function salvarMedias(
    supabase: SupabaseClient,
    fonte: FonteRow,
    eventos: EventoColetado[],
    medias: Map<string, MediaColetada[]>,
): Promise<number> {
    if (medias.size === 0) return 0
    const leiloeira = normalizeLeiloeira(fonte.leiloeira).nome
    const porUrl = new Map(eventos.filter(e => e.url).map(e => [e.url as string, e]))

    // Resolve o id do evento já gravado, para amarrar a média nele.
    const fps = [...medias.keys()]
        .map(url => porUrl.get(url))
        .filter((e): e is EventoColetado => !!e)
        .map(e => fingerprintEvento(fonte.leiloeira, e.data, e.nome))
    const { data: evRows } = await supabase
        .from('mercado_eventos').select('id, fingerprint').in('fingerprint', fps)
    const idPorFp = new Map((evRows ?? []).map(r => {
        const x = r as { id: string; fingerprint: string }
        return [x.fingerprint, x.id]
    }))

    const linhas: Array<Record<string, unknown>> = []
    for (const [url, lista] of medias) {
        const ev = porUrl.get(url)
        if (!ev) continue
        const fp = fingerprintEvento(fonte.leiloeira, ev.data, ev.nome)
        for (const m of lista) {
            linhas.push({
                evento_id: idPorFp.get(fp) ?? null,
                leiloeira,
                evento_nome: ev.nome,
                data: ev.data,
                sexo: m.sexo,
                descricao: m.descricao,
                idade: m.idade,
                peso: m.peso,
                valor: m.valor,
                kg_vivo: m.kgVivo,
                fingerprint: `${fp}|${m.sexo ?? ''}|${chave(m.descricao ?? '')}|${chave(m.idade ?? '')}`,
            })
        }
    }
    if (!linhas.length) return 0

    const { error } = await supabase.from('mercado_medias').upsert(linhas, { onConflict: 'fingerprint' })
    if (error) throw new Error(error.message)
    return linhas.length
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
