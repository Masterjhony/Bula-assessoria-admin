// ─────────────────────────────────────────────────────────────────────────────
// Cliente server-only da API do videoextrator (Fórmula do Boi) que roda na VPS.
// O dashboard FastAPI expõe os relatórios pós-leilão; o web-bula faz proxy
// server-side com Bearer token (nunca expor a porta 8000 direto ao browser).
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = process.env.VIDEOEXTRATOR_API_URL || ''
const API_TOKEN = process.env.VIDEOEXTRATOR_API_TOKEN || ''

export interface VideoextratorLeilao {
  video_id: string
  titulo: string | null
  canal: string | null
  data_evento: string | null // ISO ou yyyy-mm-dd
  total_lotes: number | null
  total_vendidos: number | null
  total_vendido_brl: number | null
}

export interface RelatorioLote {
  id: number
  numero_lote: string | null
  valor_final: number | null
  valor_parcela: number | null
  total_parcelas: number | null
  valor_oferta_inicial: number | null
  comprador: string | null
  assessoria: string | null
  assessoria_comprador: string | null
  nome_animal: string | null
  vendedor: string | null
  descricao_lote: string | null
  motivo: string | null // VENDIDO | NAO_VENDIDO
  peso_kg: number | null
  confianca: number | null
}

export interface Relatorio {
  video_id: string
  total_lotes: number
  vendidos: number
  nao_vendidos: number
  volume_total: number
  preco_medio: number
  preco_maximo: number
  preco_minimo: number
  top_compradores: { nome: string; volume: number }[]
  top_assessorias: { nome: string; quantidade: number }[]
  timeline: { hora: string; quantidade: number }[]
  lotes: RelatorioLote[]
}

export class VideoextratorError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'VideoextratorError'
    this.status = status
  }
}

function ensureConfig() {
  if (!API_URL) {
    throw new VideoextratorError('VIDEOEXTRATOR_API_URL não configurado.', 503)
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  ensureConfig()
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    throw new VideoextratorError(`Falha ao conectar na VPS: ${(e as Error).message}`, 504)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new VideoextratorError(`VPS respondeu ${res.status}: ${body.slice(0, 200)}`, 502)
  }
  return (await res.json()) as T
}

/** Lista todos os leilões já processados pelo videoextrator (para auto-match). */
export function listarLeiloesVPS(): Promise<VideoextratorLeilao[]> {
  return call<VideoextratorLeilao[]>('/api/leiloes')
}

/** Relatório pós-leilão completo de um vídeo. */
export function getRelatorio(videoId: string): Promise<Relatorio> {
  return call<Relatorio>(`/api/relatorio/${encodeURIComponent(videoId)}`)
}

/** Enfileira uma URL do YouTube para análise. Retorna o video_id resolvido. */
export function dispararAnalise(
  url: string,
): Promise<{ video_id: string; status: string; novo: boolean }> {
  return call('/api/analisar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}
