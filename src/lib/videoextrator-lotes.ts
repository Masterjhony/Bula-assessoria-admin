import 'server-only'

const API_URL = process.env.VIDEOEXTRATOR_API_URL || ''
const API_TOKEN = process.env.VIDEOEXTRATOR_API_TOKEN || ''

export interface LoteArtefato {
  id: number
  tipo: 'frame' | 'tarja' | string
  image_url: string
  mime_type: string
  timestamp_seg: number | null
  width: number | null
  height: number | null
  source: string | null
}
export interface CatalogoAnimal {
  nome?: string | null
  rgn?: string | null
  siu?: string | null
  nascimento?: string | null
  pai?: string | null
  mae?: string | null
  avo_materno?: string | null
  reprodutivo?: string | null
}

export interface CatalogoLote {
  id: number
  video_id: string
  numero_lote: string | null
  motivo: string | null
  valor_final: number | null
  valor_parcela: number | null
  total_parcelas: number | null
  comprador: string | null
  assessoria: string | null
  assessoria_comprador: string | null
  nome_animal: string | null
  vendedor: string | null
  descricao_lote: string | null
  peso_kg: number | null
  confianca: number | null
  qa_flags: string | null
  has_image: boolean
  review_required: boolean
  leilao: { titulo: string; canal: string; data_evento: string; url: string }
  evidencia: {
    texto: string
    inicio_s: number | null
    fim_s: number | null
    youtube_url: string
  }
  procedencia: { fonte: string; flags: string[] }
  catalogo?: {
    tipo?: string | null
    vendedores?: string[]
    animais?: CatalogoAnimal[]
  }
  artefatos: LoteArtefato[]
}

export interface CatalogoLotesResponse {
  items: CatalogoLote[]
  next_cursor: number | null
  total: number
  summary: { total: number; com_imagem: number; vendidos: number; revisar: number }
  facets: { leiloes: Array<{ video_id: string; titulo: string; total: number }> }
}

export class VideoextratorLotesError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'VideoextratorLotesError'
    this.status = status
  }
}

function ensureConfig() {
  if (!API_URL) throw new VideoextratorLotesError('VIDEOEXTRATOR_API_URL não configurado.', 503)
}

function headers(): HeadersInit {
  return API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}
}

export async function getCatalogoLotes(query: string): Promise<CatalogoLotesResponse> {
  ensureConfig()
  let response: Response
  try {
    response = await fetch(`${API_URL}/api/catalogo-lotes${query ? `?${query}` : ''}`, {
      headers: headers(), cache: 'no-store', signal: AbortSignal.timeout(25_000),
    })
  } catch (error) {
    throw new VideoextratorLotesError(`Falha ao conectar na VPS: ${(error as Error).message}`, 504)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new VideoextratorLotesError(`VPS respondeu ${response.status}: ${body.slice(0, 200)}`)
  }
  return response.json() as Promise<CatalogoLotesResponse>
}

export async function getLoteArtifact(id: number | string): Promise<{
  body: ArrayBuffer
  contentType: string
}> {
  ensureConfig()
  const value = String(id)
  const liveMatch = /^live-(\d+)$/.exec(value)
  const path = liveMatch
    ? `/api/live-lote-artefatos/${liveMatch[1]}`
    : `/api/lote-artefatos/${encodeURIComponent(value)}`
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: headers(), cache: 'force-cache', signal: AbortSignal.timeout(25_000),
    })
  } catch (error) {
    throw new VideoextratorLotesError(`Falha ao carregar imagem: ${(error as Error).message}`, 504)
  }
  if (!response.ok) {
    throw new VideoextratorLotesError(`Imagem indisponível (${response.status}).`, response.status)
  }
  return {
    body: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') || 'image/webp',
  }
}
