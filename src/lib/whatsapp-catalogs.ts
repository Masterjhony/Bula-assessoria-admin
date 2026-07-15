/**
 * Catálogos WhatsApp — helpers compartilhados.
 *
 * Esta automação roda numa SEGUNDA sessão Baileys no VPS (container separado
 * `formula_boi_whatsapp_catalogs` na porta 3002, número próprio). Ela monitora
 * grupos configurados em `whatsapp_catalog_groups` e, sempre que um PDF chega,
 * tenta casar com `cronograma_leiloes` pelo nome do arquivo. Quando há match
 * confiante e o leilão está sem `catalogo_url`, anexa automaticamente.
 *
 * Não confundir com a Central WhatsApp (porta 3001) — são processos
 * independentes, com auth folder separado, número distinto e responsabilidades
 * diferentes.
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
// Fuzzy matching de nome de arquivo vs nome do leilão.
//
// A ideia: o PDF normalmente vem com nome tipo "CATALOGO MEGA EAO 2026.pdf"
// ou "Catalogo - Touros EAO - 03MAI.pdf". O cronograma tem nomes como
// "TOUROS EAO" / "LEILÃO MEGA GENÉTICA NAVIRAÍ". Normalizamos os dois
// (lowercase, sem acentos, sem ruído) e fazemos token-set similarity:
// quantos tokens significativos do nome do leilão aparecem no nome do arquivo.
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
])

export function normalizeForMatch(input: string): string {
    return input
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos (combining marks)
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
 *   - fração de tokens do leilão que aparecem no arquivo (recall)
 *   - bônus por tokens longos compartilhados (>= 5 letras)
 *   - bônus se o arquivo contém substring contígua do nome
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
    const longBonus = longHits / Math.max(1, auctionTokens.length)

    const normA = normalizeForMatch(auctionName)
    const normF = normalizeForMatch(fileName)
    const contiguous = normA.length >= 6 && normF.includes(normA) ? 0.25 : 0

    const score = Math.min(1, recall * 0.7 + longBonus * 0.3 + contiguous)
    return Math.round(score * 100)
}

export type CronogramaRow = {
    id: string
    data: string
    nome: string
    catalogo_url: string | null
}

export type MatchCandidate = {
    cronograma_id: string
    nome: string
    data: string
    score: number
    has_catalog: boolean
}

/**
 * Janela de data: o catálogo normalmente chega de 1 a 60 dias antes do leilão.
 * Para evitar falso-positivo com leilões antigos, restringimos a busca a uma
 * janela [hoje - 7d, hoje + 90d].
 */
export function dateWindow(now = new Date()) {
    const past = new Date(now); past.setDate(past.getDate() - 7)
    const future = new Date(now); future.setDate(future.getDate() + 90)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    return { from: fmt(past), to: fmt(future) }
}

export async function findMatches(
    supabase: SupabaseClient,
    fileName: string,
    opts?: { limit?: number; ignoreDateWindow?: boolean }
): Promise<MatchCandidate[]> {
    const { from, to } = dateWindow()
    let q = supabase
        .from('cronograma_leiloes')
        .select('id, data, nome, catalogo_url')
    if (!opts?.ignoreDateWindow) {
        q = q.gte('data', from).lte('data', to)
    }
    const { data, error } = await q
    if (error || !data) return []

    const limit = opts?.limit ?? 5
    const scored: MatchCandidate[] = (data as CronogramaRow[])
        .map(row => ({
            cronograma_id: row.id,
            nome: row.nome,
            data: row.data,
            score: similarityScore(row.nome, fileName),
            has_catalog: !!row.catalogo_url,
        }))
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
    return scored
}

/**
 * Política de auto-anexo:
 *   - melhor candidato com score >= AUTO_ATTACH_THRESHOLD (default 70)
 *   - segundo candidato com gap >= MIN_GAP (default 20) — senão é ambíguo
 *   - leilão alvo ainda sem catalogo_url (não sobrescrever)
 */
export const AUTO_ATTACH_THRESHOLD = 70
export const AUTO_ATTACH_MIN_GAP = 20

export type AutoAttachDecision =
    | { decision: 'attach'; cronograma_id: string; score: number }
    | { decision: 'ambiguous'; reason: string }
    | { decision: 'has_catalog'; cronograma_id: string }
    | { decision: 'no_match' }

export function decideAutoAttach(candidates: MatchCandidate[]): AutoAttachDecision {
    if (candidates.length === 0) return { decision: 'no_match' }
    const best = candidates[0]
    if (best.score < AUTO_ATTACH_THRESHOLD) {
        return { decision: 'ambiguous', reason: `score ${best.score} < ${AUTO_ATTACH_THRESHOLD}` }
    }
    const second = candidates[1]
    if (second && (best.score - second.score) < AUTO_ATTACH_MIN_GAP) {
        return { decision: 'ambiguous', reason: `gap insuficiente (${best.score} vs ${second.score})` }
    }
    if (best.has_catalog) {
        return { decision: 'has_catalog', cronograma_id: best.cronograma_id }
    }
    return { decision: 'attach', cronograma_id: best.cronograma_id, score: best.score }
}
