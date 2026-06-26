// ─────────────────────────────────────────────────────────────────────────────
// Auto-match leilão da agenda (bula_leiloes) ↔ vídeo analisado (videoextrator).
// A agenda não tem URL do YouTube; o videoextrator é indexado por video_id e
// guarda título + data do evento. Pareamos por proximidade de data + sobreposição
// de tokens do nome. Função pura — a fonte passa as duas listas já carregadas.
// ─────────────────────────────────────────────────────────────────────────────

import type { VideoextratorLeilao } from '@/lib/videoextrator'

export interface AgendaLeilaoLite {
  id: string
  nome: string
  data: string // ISO yyyy-mm-dd
}

export type MatchTier = 'auto' | 'sugestao'

export interface VideoMatch {
  video: VideoextratorLeilao
  score: number
  dias: number // diferença de dias entre datas
  tier: MatchTier
}

// stopwords que não ajudam a discriminar um leilão de outro (fillers + nomes de
// feiras/eventos que muitos leilões compartilham, ex. expozebu).
const STOP = new Set([
  'leilao', 'leiloes', 'virtual', 'etapa', 'nelore', 'po', 'edicao', 'especial',
  'de', 'do', 'da', 'dos', 'das', 'e', 'o', 'a', 'os', 'as', 'no', 'na',
  'remate', 'remates', 'gado', 'rural', 'live', 'dia', 'fb', 'agro',
  'expozebu', 'expoinel', 'convidados', 'genetica', 'selecao', 'open', 'prime',
])

// tokens de CATEGORIA (sexo/produto): casam vários leilões diferentes, então
// sozinhos não bastam para parear — exigimos pelo menos 1 token-nome em comum.
const CATEGORIA = new Set([
  'touros', 'touro', 'femeas', 'femea', 'matrizes', 'matriz', 'bezerras',
  'bezerros', 'novilhas', 'doadoras', 'embrioes', 'machos', 'reprodutores',
  'aspiracoes', 'prenhes', 'collection',
])

function norm(s: string | undefined | null): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Tokens significativos: sem acento, sem stopwords, sem ordinais (1o, 2o, 37...). */
export function tokenize(s: string | undefined | null): Set<string> {
  return new Set(
    norm(s)
      .replace(/\d+[º°ª]?/g, ' ') // remove números/ordinais
      .split(/[^a-z]+/)
      .filter((t) => t.length >= 3 && !STOP.has(t)),
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

function diffDays(a: string, b: string): number {
  const da = Date.parse(a.slice(0, 10))
  const db = Date.parse(b.slice(0, 10))
  if (Number.isNaN(da) || Number.isNaN(db)) return 999
  return Math.abs(Math.round((da - db) / 86_400_000))
}

const MAX_DIAS = 3 // janela de tolerância de data
const SCORE_SUGESTAO = 0.4 // mínimo para sugerir (usuário confirma na UI)
const SCORE_AUTO = 0.6 // a partir daqui vincula sozinho

/** Tokens em comum que NÃO são de categoria — os que realmente discriminam. */
function tokensNome(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = []
  for (const t of a) if (b.has(t) && !CATEGORIA.has(t)) out.push(t)
  return out
}

/**
 * Melhor vídeo para um leilão da agenda, ou null se nada passar do limiar.
 * Exige pelo menos 1 token-nome em comum (categoria sozinha não casa).
 * Retorna tier 'auto' (alta confiança) ou 'sugestao' (precisa confirmar).
 */
export function matchVideoParaLeilao(
  leilao: AgendaLeilaoLite,
  videos: VideoextratorLeilao[],
): VideoMatch | null {
  const tl = tokenize(leilao.nome)
  if (tl.size === 0) return null

  let best: { video: VideoextratorLeilao; score: number; dias: number } | null = null
  for (const v of videos) {
    if (!v.data_evento) continue
    const dias = diffDays(leilao.data, v.data_evento)
    if (dias > MAX_DIAS) continue
    const tv = tokenize(v.titulo)
    if (tokensNome(tl, tv).length === 0) continue // sem nome em comum → ignora
    const sim = jaccard(tl, tv)
    const score = sim + (MAX_DIAS - dias) * 0.05 // bônus por data próxima
    if (!best || score > best.score) best = { video: v, score, dias }
  }
  if (!best || best.score < SCORE_SUGESTAO) return null
  return { ...best, tier: best.score >= SCORE_AUTO ? 'auto' : 'sugestao' }
}
