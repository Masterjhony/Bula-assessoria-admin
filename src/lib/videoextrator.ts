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
  queue_status?: string | null
  queue_stage?: string | null
  queue_updated_at?: string | null
}

export interface RelatorioLoteFinanceiro {
  soma_base?: number | null
  valor_parcela?: number | null
  total_parcelas?: number | null
  quantidade?: number | null
  quantidade_animais?: number | null
  unidade_preco?: string | null
  total_confirmado?: number | null
  total_estimado?: number | null
  valor_total?: number | null
  formula?: string | null
  status?: string | null
  cobertura?: {
    calculavel?: boolean
    completa?: boolean
    percentual?: number
    pendencias?: string[]
  } | null
}

export interface BuyerEvidence {
  version?: number
  source?: 'buyer_identification' | 'llm' | 'human_review' | string
  decision?: 'confirmed_buyer' | 'pending' | 'moved_to_assessor' | 'rejected' | string
  buyer?: {
    candidate?: string
    name?: string
    status?: 'confirmado' | 'provavel' | 'pendente' | 'rejeitado' | string
    confidence?: number
    trigger?: string
    explicit_anchor?: boolean
    post_hammer?: boolean
  }
  assessor?: { name?: string; id?: string | null; confidence?: number; trigger?: string }
  evidence_text?: string
}

export interface RelatorioLote {
  id: number | string
  numero_lote: string | null
  valor_final: number | null
  valor_parcela: number | null
  total_parcelas: number | null
  valor_oferta_inicial: number | null
  comprador: string | null
  comprador_status?: 'confirmado' | 'provavel' | 'pendente' | 'rejeitado' | string | null
  buyer_evidence_json?: BuyerEvidence | null
  assessor_id?: string | null
  assessor_nome?: string | null
  assessoria: string | null
  assessoria_comprador: string | null
  nome_animal: string | null
  vendedor: string | null
  descricao_lote: string | null
  motivo: string | null // VENDIDO | NAO_VENDIDO
  peso_kg: number | null
  confianca: number | null
  qa_flags: string | null // JSON { fonte, src:{campo:[fontes]}, flags:[...] }
  valor_total_negociado?: number | null
  valor_total_estimado?: number | null
  quantidade_animais?: number | null
  unidade_preco?: string | null
  status_parcial?: string | null
  identificacao_animal?: string | null
  data_nascimento?: string | null
  percentual_ofertado?: number | null
  formula_parcelas?: string | null
  frame_artifact_id?: number | string | null
  live_last_seen_at?: string | null
  live_read_count?: number | null
  financeiro?: RelatorioLoteFinanceiro | null
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
  volume_parcelas_captado?: number | null
  volume_total_confirmado?: number | null
  volume_total_estimado?: number | null
  lotes_com_total?: number | null
  lotes_sem_total?: number | null
  cobertura_total_pct?: number | null
  live_current_lot?: RelatorioLote | null
  live_visual?: {
    status?: string | null
    checked_at?: string | null
    last_success_at?: string | null
    last_error?: string | null
    calls_last_hour?: number | null
  } | null
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
  stage?: string | null
  stage_updated_at?: string | null
  attempts?: number
  last_error?: string | null
  updated_at?: string | null
  queue_position?: number | null
  queue_ready_total?: number | null
  ready_total?: number | null
  queued_at?: string | null
  wait_seconds?: number | null
  queue_state?: string | null
  next_attempt_at?: string | null
}

export interface Atividade {
  eventos: AtividadeEvento[]
  fila: FilaItem[]
  stats: { pending?: number; processing?: number; done?: number; error?: number; total?: number }
  monitor?: MonitorOverview | null
}

/** Feed de andamento do loop autônomo + estado da fila. */
export function getAtividade(limit = 60, videoIds: string[] = []): Promise<Atividade> {
  const params = new URLSearchParams({ limit: String(limit) })
  for (const videoId of [...new Set(videoIds)].slice(0, 200)) {
    if (videoId) params.append('video_ids', videoId)
  }
  return call<Atividade>(`/api/atividade?${params.toString()}`)
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
  volume_parcelas_captado: number | null
  volume_total_confirmado: number | null
  volume_total_estimado: number | null
  lotes_com_total: number
  lotes_sem_total: number
  cobertura_total_pct: number | null
  recent_lots: RelatorioLote[]
  current_lot: RelatorioLote | null
  visual_status: string
  visual_updated_at: string | null
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
    const lotes = report?.lotes ?? []
    const recentLots = [...lotes]
      .sort((a, b) => {
        const bySeen = Date.parse(b.live_last_seen_at || '') - Date.parse(a.live_last_seen_at || '')
        if (Number.isFinite(bySeen) && bySeen !== 0) return bySeen
        return Number(b.id || 0) - Number(a.id || 0)
      })
      .slice(0, 6)
    const lotesVendidos = lotes.filter((lote) => {
      const motivo = (lote.motivo || '').toUpperCase()
      const status = (lote.status_parcial || '').toUpperCase()
      if (status === 'EM_DISPUTA' || status === 'NAO_VENDIDO') return false
      return motivo === 'VENDIDO' || status === 'VENDIDO_CONFIRMADO' || status === 'VENDIDO'
    })
    const lotesComTotalDerivado = lotesVendidos.filter((lote) => valorTotalLote(lote) != null).length
    const lotesSemTotalDerivado = Math.max(0, Number(report?.vendidos || 0) - lotesComTotalDerivado)
    const volumeEstimadoDerivado = lotesVendidos.reduce((total, lote) => total + (valorTotalLote(lote) || 0), 0)
    const volumeParcelasDerivado = lotes.reduce((total, lote) => {
      if ((lote.motivo || '').toUpperCase() === 'NAO_VENDIDO') return total
      return total + (numeroOpcional(lote.valor_parcela) ?? numeroOpcional(lote.financeiro?.soma_base) ?? numeroOpcional(lote.valor_final) ?? 0)
    }, 0)
    const lotesComTotal = numeroOpcional(report?.lotes_com_total) ?? lotesComTotalDerivado
    const lotesSemTotal = numeroOpcional(report?.lotes_sem_total) ?? lotesSemTotalDerivado
    const coberturaDerivada = report?.vendidos
      ? Math.min(100, Math.round((lotesComTotal / Number(report.vendidos)) * 100))
      : null
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
      volume_parcelas_captado: numeroOpcional(report?.volume_parcelas_captado) ?? (volumeParcelasDerivado || null),
      volume_total_confirmado: numeroOpcional(report?.volume_total_confirmado),
      volume_total_estimado: numeroOpcional(report?.volume_total_estimado) ?? (volumeEstimadoDerivado || null),
      lotes_com_total: lotesComTotal,
      lotes_sem_total: lotesSemTotal,
      cobertura_total_pct: numeroOpcional(report?.cobertura_total_pct) ?? coberturaDerivada,
      recent_lots: recentLots,
      current_lot: report?.live_current_lot ?? null,
      visual_status: report?.live_visual?.status || 'not_started',
      visual_updated_at: report?.live_visual?.last_success_at || report?.live_visual?.checked_at || null,
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

function numeroOpcional(value: unknown): number | null {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function valorTotalLote(lote: RelatorioLote): number | null {
  if ((lote.motivo || '').toUpperCase() === 'NAO_VENDIDO') return null
  const confirmado = numeroOpcional(lote.valor_total_negociado) ?? numeroOpcional(lote.financeiro?.total_confirmado)
  if (confirmado != null) return confirmado
  const estimado = numeroOpcional(lote.valor_total_estimado) ?? numeroOpcional(lote.financeiro?.total_estimado)
  if (estimado != null) return estimado
  return numeroOpcional(lote.financeiro?.valor_total)
}
