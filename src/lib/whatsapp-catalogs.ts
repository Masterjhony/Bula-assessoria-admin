/**
 * Catálogos WhatsApp — helpers compartilhados.
 *
 * O produtor é o servidor Baileys da sessão de coleta (`joao-automation`):
 * quando um PDF cai num grupo listado em `whatsapp_catalog_groups`, ele sobe o
 * arquivo pro Supabase Storage e chama o webhook daqui. A partir daí o
 * pipeline ABRE o arquivo (`catalog-identify.ts`), lê o que está impresso na
 * capa e é essa evidência — não o nome do arquivo — que decide de qual leilão
 * do cronograma ele é.
 *
 * Não confundir com a Central WhatsApp — são sessões independentes, com auth
 * folder separado, número distinto e responsabilidades diferentes.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const CATALOGS_PAUSE_KEY = 'whatsapp_catalogs_paused'

/**
 * Resolve a URL de download do catálogo a partir do `r2_key` guardado na
 * detecção. Como o R2 está desabilitado nesta conta, o produtor (servidor
 * Baileys) sobe o PDF direto pro Supabase Storage e guarda a URL pública `http`
 * aqui — nesse caso usamos a URL como está. Só cai no presign do R2 quando o
 * valor é uma chave R2 legada (não-URL).
 */
export async function resolveCatalogDownloadUrl(
    key: string,
    opts?: { expiresInSeconds?: number; downloadAs?: string }
): Promise<string> {
    if (/^https?:\/\//i.test(key)) return key
    const { getR2DownloadUrl } = await import('./r2')
    return getR2DownloadUrl(key, {
        expiresInSeconds: opts?.expiresInSeconds ?? 7 * 24 * 3600,
        downloadAs: opts?.downloadAs,
    })
}

export type CatalogsPauseState = {
    paused: boolean
    paused_at: string | null
    paused_by: string | null
}

export async function readCatalogsPauseState(supabase?: SupabaseClient): Promise<CatalogsPauseState> {
    const sb = supabase ?? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data } = await sb
        .from('site_settings')
        .select('value')
        .eq('key', CATALOGS_PAUSE_KEY)
        .single()
    const v = data?.value as Partial<CatalogsPauseState> | undefined
    return {
        paused: !!v?.paused,
        paused_at: v?.paused_at ?? null,
        paused_by: v?.paused_by ?? null,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Similaridade de nomes.
//
// O PDF normalmente vem com nome tipo "CATALOGO MEGA EAO 2026.pdf" ou
// "Catalogo - Touros EAO - 03MAI.pdf". O cronograma tem nomes como
// "TOUROS EAO" / "LEILÃO MEGA GENÉTICA NAVIRAÍ". Normalizamos os dois
// (lowercase, sem acentos, sem ruído) e fazemos token-set similarity:
// quantos tokens significativos do nome do leilão aparecem no outro texto.
// ────────────────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
    'leilao', 'leilão', 'catalogo', 'catálogo', 'cat', 'pdf', 'doc',
    'final', 'oficial', 'rev', 'v1', 'v2', 'v3', 'novo', 'nova',
    'de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'as', 'os',
    'em', 'no', 'na', 'para', 'pra', 'por',
    'dia', 'mes', 'mês', 'ano', 'hora',
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
    '2024', '2025', '2026', '2027', '2028',
    '1o', '2o', '3o', '4o', '5o', '6o', '7o', '8o',
    '1a', '2a', '3a', '4a', '5a',
    // Palavras que TODO leilão de gado usa — não distinguem um evento do
    // outro e, pior, inflam falso-positivo entre leilões diferentes do mesmo
    // criatório. "expogenetica" entra aqui porque é o nome da FEIRA: sete
    // leilões de agosto/2026 o carregam no título e quase nenhum catálogo o
    // repete na capa.
    'nelore', 'fazenda', 'faz', 'agropecuaria', 'agro', 'haras', 'sitio',
    'virtual', 'digital', 'presencial', 'expogenetica',
    'convidados', 'amigos', 'especial', 'especiais',
])

export function normalizeForMatch(input: string): string {
    return input
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
        // Quebra palavras grudadas ANTES de baixar a caixa — nomes de arquivo do
        // WhatsApp vêm assim (ex.: "LeilãoNaviraíMatrizes2026" → "Leilao Navirai
        // Matrizes 2026"). Sem isso o match fuzzy fica cego (score baixo).
        .replace(/([a-z])([A-Z])/g, '$1 $2')             // camelCase
        .replace(/([A-Za-z])(\d)/g, '$1 $2')             // letra → dígito
        .replace(/(\d)([A-Za-z])/g, '$1 $2')             // dígito → letra
        .toLowerCase()
        .replace(/\.[a-z0-9]{2,5}$/, '')                  // remove extensão
        .replace(/[^a-z0-9]+/g, ' ')                      // só letras/dígitos
        .trim()
}

export function tokenize(input: string): string[] {
    return normalizeForMatch(input)
        .split(/\s+/)
        .filter(t => t.length >= 2 && !STOPWORDS.has(t))
}

/**
 * Score de similaridade 0..100. Combina:
 *   - fração de tokens do leilão que aparecem no texto-alvo (recall)
 *   - bônus por tokens longos compartilhados (>= 5 letras)
 *   - bônus se o alvo contém substring contígua do nome
 */
export function similarityScore(auctionName: string, fileName: string): number {
    const auctionTokens = tokenize(auctionName)
    const fileTokens = tokenize(fileName)
    if (auctionTokens.length === 0 || fileTokens.length === 0) return 0

    const fileSet = new Set(fileTokens)
    let hits = 0
    let longHits = 0
    for (const t of auctionTokens) {
        if (fileSet.has(t)) {
            hits++
            if (t.length >= 5) longHits++
        }
    }
    const recall = hits / auctionTokens.length
    const longRatio = longHits / auctionTokens.length

    const normA = normalizeForMatch(auctionName)
    const normF = normalizeForMatch(fileName)
    const contiguous = normA.length >= 6 && normF.includes(normA) ? 0.25 : 0

    // O recall MANDA; tokens longos só refinam. A fórmula anterior somava
    // recall*0,7 + bônus*0,3, o que travava em 70% um nome curto batido por
    // inteiro — "ELO DE PROVA" casava 100% e ficava abaixo do corte.
    const score = Math.min(1, recall * (0.85 + 0.15 * longRatio) + contiguous)
    return Math.round(score * 100)
}

// ────────────────────────────────────────────────────────────────────────────
// Casamento com o cronograma.
//
// O nome do arquivo continua valendo, mas deixou de ser a única prova: quando
// o PDF foi aberto (ver `catalog-identify.ts`), quem manda é o que está
// IMPRESSO no documento — a data do evento acima de tudo, depois o nome do
// leilão, o criatório e a leiloeira. É isso que separa um "top 57%" de um
// "21/08 confere, criatório Colonial confere".
// ────────────────────────────────────────────────────────────────────────────

export type CronogramaRow = {
    id: string
    data: string
    nome: string
    criador?: string | null
    leiloeira?: string | null
    catalogo_url: string | null
}

export type MatchCandidate = {
    cronograma_id: string
    nome: string
    data: string
    criador: string | null
    score: number
    has_catalog: boolean
    /** Frases curtas explicando o score — a UI mostra pro operador. */
    motivos: string[]
    /** O documento traz uma data que não é a deste leilão. */
    conflito_data: boolean
    /** A data impressa no documento é exatamente a deste leilão. */
    data_confere: boolean
    /**
     * O documento tem vínculo de IDENTIDADE com este leilão — nome do evento ou
     * criatório. Data sozinha não basta: no dia 29/08 há leilão da Bula e há
     * leilão de terceiro circulando no mesmo grupo, e os dois têm a mesma data
     * impressa. Sem identidade não existe anexo automático.
     */
    identidade: boolean
}

/** Pesos do score. Somam 100 no caso perfeito. */
const PESO_DATA_EXATA = 50
const PESO_DATA_VIZINHA = 30      // ±1 dia: leilão de dois dias, virada de noite
const PESO_DATA_PROXIMA = 10      // ±3 dias
const PESO_NOME = 30
const PESO_CRIADOR = 15
const PESO_LEILOEIRA = 5
const PENALIDADE_CONFLITO_DATA = 40

function diffDias(a: string, b: string): number {
    const t1 = Date.parse(`${a}T12:00:00Z`)
    const t2 = Date.parse(`${b}T12:00:00Z`)
    if (Number.isNaN(t1) || Number.isNaN(t2)) return Number.POSITIVE_INFINITY
    return Math.abs(t1 - t2) / 86_400_000
}

function ddmm(iso: string): string {
    const [, m, d] = iso.split('-')
    return `${d}/${m}`
}

/** Evidência que o matcher consome (subset de EvidenciaDocumento). */
export type EvidenciaMatch = {
    tipo?: string
    evento_nome?: string | null
    datas_capa?: string[] | null
    data_origem?: 'conteudo' | 'nome' | null
    leiloeira?: string | null
    criadores?: string[] | null
    local?: string | null
}

/**
 * Reconstrói a evidência a partir das colunas `doc_*` de uma detecção já
 * analisada — deixa a UI reordenar candidatos sem reabrir o PDF.
 */
export function evidenciaDaDeteccao(row: Record<string, unknown>): EvidenciaMatch | null {
    if (!row.analyzed_at) return null
    // `doc_datas` tem todas as datas lidas da capa; `doc_data` é só a melhor
    // aposta. Reconstruir só com ela faria a UI reordenar candidatos com menos
    // informação do que o pipeline teve.
    const datas: string[] = Array.isArray(row.doc_datas)
        ? (row.doc_datas as unknown[]).filter((d): d is string => typeof d === 'string')
        : []
    if (typeof row.doc_data === 'string' && !datas.includes(row.doc_data)) datas.push(row.doc_data)
    return {
        tipo: (row.doc_tipo as string) ?? undefined,
        evento_nome: (row.doc_evento as string) ?? null,
        datas_capa: datas,
        data_origem: row.doc_fonte === 'nome' ? 'nome' : 'conteudo',
        leiloeira: (row.doc_leiloeira as string) ?? null,
        criadores: (row.doc_criadores as string[]) ?? [],
        local: (row.doc_local as string) ?? null,
    }
}

/** Pontua um leilão do cronograma contra o arquivo + a evidência lida do PDF. */
export function scoreCandidate(
    row: CronogramaRow,
    fileName: string,
    ev?: EvidenciaMatch | null,
): { score: number; motivos: string[]; conflito_data: boolean; data_confere: boolean; identidade: boolean } {
    const motivos: string[] = []
    let score = 0
    let identidade = false

    // ── Nome: o melhor entre o que está impresso no PDF e o nome do arquivo.
    const conteudo = [
        ev?.evento_nome,
        ...(ev?.criadores ?? []),
        ev?.leiloeira,
        ev?.local,
    ].filter(Boolean).join(' ')

    const simConteudo = conteudo ? similarityScore(row.nome, conteudo) / 100 : 0
    const simArquivo = similarityScore(row.nome, fileName) / 100
    const simNome = Math.max(simConteudo, simArquivo)
    score += PESO_NOME * simNome
    if (simNome >= 0.6) identidade = true
    if (simConteudo >= 0.6 && simConteudo >= simArquivo) {
        motivos.push(`nome do evento no documento bate (${Math.round(simConteudo * 100)}%)`)
    } else if (simArquivo >= 0.6) {
        motivos.push(`nome do arquivo bate (${Math.round(simArquivo * 100)}%)`)
    }

    // ── Criatório: o catálogo lista as fazendas ofertantes.
    if (row.criador && conteudo) {
        const simCriador = similarityScore(row.criador, conteudo) / 100
        // Barra mais baixa que a do nome: `criador` no cronograma é uma sigla
        // ("RG, SINO E BEEM") e o catálogo escreve por extenso.
        if (simCriador >= 0.55) {
            score += PESO_CRIADOR
            identidade = true
            motivos.push(`criatório ${row.criador}`)
        }
    }

    // ── Leiloeira.
    if (row.leiloeira && ev?.leiloeira && similarityScore(row.leiloeira, ev.leiloeira) >= 60) {
        score += PESO_LEILOEIRA
        motivos.push(`leiloeira ${ev.leiloeira}`)
    }

    // ── Data: o sinal decisivo.
    const datas = (ev?.datas_capa ?? []).filter(Boolean)
    let conflito = false
    let confere = false
    if (datas.length > 0) {
        const menorDiff = Math.min(...datas.map(d => diffDias(d, row.data)))
        if (menorDiff === 0) {
            score += PESO_DATA_EXATA
            confere = true
            motivos.push(
                ev?.data_origem === 'nome'
                    ? `data ${ddmm(row.data)} no nome do arquivo`
                    : `data ${ddmm(row.data)} impressa no documento`,
            )
        } else if (menorDiff <= 1) {
            score += PESO_DATA_VIZINHA
            motivos.push('data do documento é 1 dia antes/depois')
        } else if (menorDiff <= 3) {
            score += PESO_DATA_PROXIMA
        } else if (ev?.data_origem === 'conteudo') {
            // O documento diz outra data. Não elimina de vez (a leitura pode ter
            // pego uma data de visitação), mas derruba pro fim da fila.
            conflito = true
            score -= PENALIDADE_CONFLITO_DATA
            motivos.push(`documento traz ${datas.map(ddmm).join(', ')}, não ${ddmm(row.data)}`)
        }
    }

    return {
        score: Math.max(0, Math.min(100, Math.round(score))),
        motivos,
        conflito_data: conflito,
        data_confere: confere,
        identidade,
    }
}

/**
 * Janela de busca no cronograma, ancorada na data em que o arquivo chegou
 * (não em "hoje") — assim o reprocessamento de detecções antigas encontra os
 * mesmos leilões que encontraria na época.
 */
export function dateWindow(referencia = new Date()) {
    const past = new Date(referencia); past.setDate(past.getDate() - 45)
    const future = new Date(referencia); future.setDate(future.getDate() + 180)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    return { from: fmt(past), to: fmt(future) }
}

export async function findMatches(
    supabase: SupabaseClient,
    fileName: string,
    opts?: {
        limit?: number
        ignoreDateWindow?: boolean
        evidencia?: EvidenciaMatch | null
        referencia?: Date
    },
): Promise<MatchCandidate[]> {
    const { from, to } = dateWindow(opts?.referencia)
    let q = supabase
        .from('cronograma_leiloes')
        .select('id, data, nome, criador, leiloeira, catalogo_url')
    if (!opts?.ignoreDateWindow) {
        q = q.gte('data', from).lte('data', to)
    }
    const { data, error } = await q
    if (error || !data) return []

    const limit = opts?.limit ?? 5
    return (data as CronogramaRow[])
        .map(row => {
            const s = scoreCandidate(row, fileName, opts?.evidencia)
            return {
                cronograma_id: row.id,
                nome: row.nome,
                data: row.data,
                criador: row.criador ?? null,
                score: s.score,
                has_catalog: !!row.catalogo_url,
                motivos: s.motivos,
                conflito_data: s.conflito_data,
                data_confere: s.data_confere,
                identidade: s.identidade,
            }
        })
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
}

/**
 * Política de anexo automático.
 *
 * A régua não é mais "score alto o suficiente": é PROVA. O documento precisa
 * ser de leilão (catálogo ou ordem de entrada), o candidato precisa estar bem
 * à frente do segundo, e a identidade precisa estar confirmada — pela data
 * impressa no documento, ou por um nome que bate quase integralmente.
 */
export const AUTO_ATTACH_THRESHOLD = 75
export const AUTO_ATTACH_MIN_GAP = 15
export const AUTO_ATTACH_MIN_NOME = 0.8

export type AutoAttachDecision =
    | { decision: 'attach'; cronograma_id: string; score: number; motivos: string[] }
    | { decision: 'review'; reason: string }
    | { decision: 'not_catalog'; reason: string }
    | { decision: 'no_match' }

export function decideAutoAttach(
    candidates: MatchCandidate[],
    ev?: EvidenciaMatch | null,
): AutoAttachDecision {
    if (ev?.tipo && !['catalogo', 'ordem_entrada'].includes(ev.tipo)) {
        return { decision: 'not_catalog', reason: `documento é ${ev.tipo}, não catálogo de leilão` }
    }
    if (candidates.length === 0) return { decision: 'no_match' }

    const best = candidates[0]
    // Nenhum candidato tem vínculo de identidade: o que casou foi só a data.
    // Isso é catálogo de leilão de terceiro circulando no grupo — não é "quase
    // um match", é match nenhum.
    if (!candidates.some(c => c.identidade)) {
        return { decision: 'no_match' }
    }
    if (best.conflito_data) {
        return { decision: 'review', reason: best.motivos.find(m => m.includes('não ')) ?? 'conflito de data' }
    }
    if (best.score < AUTO_ATTACH_THRESHOLD) {
        return { decision: 'review', reason: `evidência insuficiente (${best.score}%)` }
    }
    const second = candidates[1]
    if (second && (best.score - second.score) < AUTO_ATTACH_MIN_GAP) {
        return {
            decision: 'review',
            reason: `dois leilões igualmente prováveis: ${best.nome} (${best.score}%) e ${second.nome} (${second.score}%)`,
        }
    }
    if (!best.identidade) {
        return { decision: 'review', reason: 'a data confere, mas nada no documento aponta este leilão' }
    }
    if (!best.data_confere) {
        const simNome = ev?.evento_nome ? similarityScore(best.nome, ev.evento_nome) / 100 : 0
        if (simNome < AUTO_ATTACH_MIN_NOME) {
            return { decision: 'review', reason: 'sem data impressa que confirme o leilão' }
        }
    }
    return { decision: 'attach', cronograma_id: best.cronograma_id, score: best.score, motivos: best.motivos }
}
