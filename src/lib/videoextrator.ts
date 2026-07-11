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
  qa_flags: string | null // JSON { fonte, src:{campo:[fontes]}, flags:[...] }
}

export interface LoteProcedencia {
  fonte: string | null // 'fusao' | 'audio'
  desacordo: boolean // cross_modal_disagreement em algum campo
  fontesPorCampo: Record<string, string[]>
  flags: string[]
}

/** Decodifica qa_flags (procedência por campo + flags). Tolerante a formato. */
export function parseProcedencia(qaFlags: string | null | undefined): LoteProcedencia {
  const out: LoteProcedencia = { fonte: null, desacordo: false, fontesPorCampo: {}, flags: [] }
  if (!qaFlags) return out
  try {
    const j = JSON.parse(qaFlags)
    out.fonte = j.fonte ?? null
    out.fontesPorCampo = j.src ?? {}
    out.flags = Array.isArray(j.flags) ? j.flags : []
    out.desacordo = out.flags.some((f) => f.startsWith('cross_modal_disagreement'))
  } catch {
    // qa_flags antigo (string livre) — ignora.
  }
  return out
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

export interface AtividadeEvento {
  ts: string
  tipo: string // descoberta | sem_match | analise | erro | indice | feedback | sync | info
  msg: string
  [k: string]: unknown
}

export interface FilaItem {
  video_id: string
  title: string | null
  channel_key: string | null
  status: string // pending | processing | done | error | skipped
  last_error?: string | null
  updated_at?: string | null
}

export interface Atividade {
  eventos: AtividadeEvento[]
  fila: FilaItem[]
  stats: { pending?: number; processing?: number; done?: number; error?: number; total?: number }
  monitor?: MonitorOverview | null
}

/** Feed de andamento do loop autônomo + estado da fila. */
export function getAtividade(limit = 60): Promise<Atividade> {
  return call<Atividade>(`/api/atividade?limit=${limit}`)
}

export interface MonitorLiveSession {
  video_id: string
  title: string
  url: string
  status: string
  started_at: string
  age_seconds: number
  queued_after_live: boolean
  last_error: string
  total_lotes: number
  vendidos: number
  volume_total: number
}

export interface MonitorOverview {
  status: string
  live_status: string
  checked_at: string | null
  poll_interval: number | null
  sessions: MonitorLiveSession[]
}

interface HealthLiveSession {
  video_id?: string
  title?: string
  url?: string
  status?: string
  started_at?: string
  age_seconds?: number
  queued_after_live?: boolean
  last_error?: string
}

interface HealthSnapshot {
  status?: string
  checked_at?: string
  checks?: {
    live_orchestrator?: {
      status?: string
      checked_at?: string
      poll_interval?: number
      summary?: { active_sessions?: HealthLiveSession[] }
    }
  }
}

/** Estado operacional do monitor ao vivo, enriquecido com o relatório parcial. */
export async function getMonitorOverview(): Promise<MonitorOverview> {
  const health = await call<HealthSnapshot>('/api/health')
  const live = health.checks?.live_orchestrator
  const rawSessions = live?.summary?.active_sessions ?? []
  const sessions = await Promise.all(rawSessions.map(async (session): Promise<MonitorLiveSession> => {
    let report: Relatorio | null = null
    if (session.video_id) {
      try {
        report = await getRelatorio(session.video_id)
      } catch {
        // A sessão pode ter acabado de iniciar e ainda não possuir lotes.
      }
    }
    return {
      video_id: session.video_id || '',
      title: session.title || session.video_id || 'Leilão ao vivo',
      url: session.url || (session.video_id ? `https://www.youtube.com/watch?v=${session.video_id}` : ''),
      status: session.status || 'running',
      started_at: session.started_at || '',
      age_seconds: Number(session.age_seconds || 0),
      queued_after_live: Boolean(session.queued_after_live),
      last_error: session.last_error || '',
      total_lotes: Number(report?.total_lotes || 0),
      vendidos: Number(report?.vendidos || 0),
      volume_total: Number(report?.volume_total || 0),
    }
  }))
  return {
    status: health.status || 'unknown',
    live_status: live?.status || 'not_configured',
    checked_at: live?.checked_at || health.checked_at || null,
    poll_interval: live?.poll_interval ?? null,
    sessions,
  }
}
