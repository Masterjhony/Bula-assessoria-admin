// ─────────────────────────────────────────────────────────────────────────────
// Camada de dados da Análise de Leilões: junta a agenda (bula_leiloes) com o
// vínculo de vídeo (bula_leilao_video_analise) e as métricas do videoextrator
// (VPS). Persiste auto-matches de alta confiança; sugestões ficam transientes
// até o usuário confirmar. Server-only.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { listarLeiloesVPS, type VideoextratorLeilao } from '@/lib/videoextrator'
import { matchVideoParaLeilao } from '@/lib/leilao-video-match'

export const DATA_INICIO = '2026-04-01' // backfill retroativo desde 04/2026

export interface AgendaLeilao {
  id: string
  nome: string
  data: string
  status: string | null
  transmissao: string | null
  local: string | null
}

export interface AssertividadeBuyer {
  gold_comprador: string
  gold_vgv: number
  encontrado: boolean
  extr_comprador: string | null
  extr_valor_estimado: number
  valor_bate: boolean | null
  match_score: number
}

export interface Assertividade {
  fechamento: string
  buyer_recall_pct: number | null
  value_accuracy_pct: number | null
  value_aggregate_pct: number | null
  gold_compradores: number
  compradores_encontrados: number
  gold_vgv_total: number | null
  extr_vgv_estimado: number | null
  per_buyer: AssertividadeBuyer[]
}

export interface AnaliseVinculo {
  video_id: string | null
  video_url: string | null
  status: string
  match_tipo: string
  total_lotes: number | null
  total_vendidos: number | null
  volume_total: number | null
  sincronizado_em: string | null
  indice_assertividade: number | null
  assertividade: Assertividade | null
}

export interface LeilaoAnaliseRow {
  leilao: AgendaLeilao
  analise: AnaliseVinculo | null
  sugestao: { video_id: string; titulo: string | null; score: number } | null
}

function snapshotFromVps(v: VideoextratorLeilao) {
  return {
    total_lotes: v.total_lotes ?? null,
    total_vendidos: v.total_vendidos ?? null,
    volume_total: v.total_vendido_brl ?? null,
  }
}

function statusTerminalVps(v: VideoextratorLeilao): 'concluido' | 'erro' | null {
  if (['done', 'legacy_complete'].includes(v.queue_status || '')) return 'concluido'
  // "skipped" pode significar apenas que o pipeline não encontrou lote
  // algum. Sem relatório aproveitável, o estado correto é erro, não uma
  // espera infinita nem uma análise concluída vazia.
  if (v.queue_status === 'skipped') {
    return Number(v.total_lotes || 0) > 0 ? 'concluido' : 'erro'
  }
  return null
}

/**
 * Monta a lista de leilões da agenda (>= DATA_INICIO) com o estado da análise.
 * Faz auto-match dos sem-vínculo contra a VPS e persiste os de tier 'auto'.
 * Se a VPS estiver fora, ainda retorna a agenda + vínculos já salvos.
 */
export async function montarLeiloesAnalise(
  supabase: SupabaseClient,
): Promise<{ rows: LeilaoAnaliseRow[]; vpsOnline: boolean }> {
  const { data: leiloes, error } = await supabase
    .from('bula_leiloes')
    .select('id, nome, data, status, transmissao, local')
    .gte('data', DATA_INICIO)
    .order('data', { ascending: true })
  if (error) throw new Error(error.message)
  const agenda = (leiloes ?? []) as AgendaLeilao[]

  const { data: vincRows } = await supabase
    .from('bula_leilao_video_analise')
    .select('leilao_id, video_id, video_url, status, match_tipo, total_lotes, total_vendidos, volume_total, sincronizado_em, indice_assertividade, assertividade')
  const vinculos = new Map<string, AnaliseVinculo & { leilao_id: string }>()
  for (const v of vincRows ?? []) vinculos.set(v.leilao_id, v as AnaliseVinculo & { leilao_id: string })

  // Lista de vídeos da VPS (para auto-match e snapshot). Falha graciosa.
  let vps: VideoextratorLeilao[] = []
  let vpsOnline = false
  try {
    vps = await listarLeiloesVPS()
    vpsOnline = true
  } catch {
    vpsOnline = false
  }

  // Vídeos já vinculados a algum leilão (não sugerir de novo).
  const usados = new Set<string>()
  for (const v of vinculos.values()) if (v.video_id) usados.add(v.video_id)
  const vpsById = new Map(vps.map((v) => [v.video_id, v]))

  const novosAuto: Array<Record<string, unknown>> = []
  const reconciliadosAgora: Array<Record<string, unknown>> = []
  const rows: LeilaoAnaliseRow[] = []

  for (const leilao of agenda) {
    const vinc = vinculos.get(leilao.id) ?? null
    if (vinc) {
      // A listagem também funciona como reconciliação leve. Antes, um
      // vídeo que terminava na VPS continuava como "processando" no web-bula
      // até alguém clicar manualmente em Sincronizar.
      const hit = vinc.video_id ? vpsById.get(vinc.video_id) : undefined
      const statusTerminal = hit ? statusTerminalVps(hit) : null
      if (vinc.status !== 'concluido' && hit && statusTerminal && vinc.status !== statusTerminal) {
        const snap = snapshotFromVps(hit)
        const sincronizadoEm = new Date().toISOString()
        const analise: AnaliseVinculo = {
          ...vinc,
          status: statusTerminal,
          ...snap,
          sincronizado_em: sincronizadoEm,
        }
        reconciliadosAgora.push({
          leilao_id: leilao.id,
          video_id: vinc.video_id,
          status: statusTerminal,
          ...snap,
          sincronizado_em: sincronizadoEm,
        })
        rows.push({ leilao, analise, sugestao: null })
      } else {
        rows.push({ leilao, analise: vinc, sugestao: null })
      }
      continue
    }
    // Sem vínculo: tenta auto-match contra a VPS.
    let sugestao: LeilaoAnaliseRow['sugestao'] = null
    if (vpsOnline) {
      const candidatos = vps.filter((v) => !usados.has(v.video_id))
      const m = matchVideoParaLeilao(leilao, candidatos)
      if (m && m.tier === 'auto') {
        usados.add(m.video.video_id)
        const snap = snapshotFromVps(m.video)
        const status = statusTerminalVps(m.video) || 'processando'
        const sincronizadoEm = status !== 'processando' ? new Date().toISOString() : null
        const analise: AnaliseVinculo = {
          video_id: m.video.video_id,
          video_url: `https://www.youtube.com/watch?v=${m.video.video_id}`,
          status,
          match_tipo: 'auto',
          ...snap,
          sincronizado_em: sincronizadoEm,
          indice_assertividade: null,
          assertividade: null,
        }
        novosAuto.push({
          leilao_id: leilao.id,
          video_id: analise.video_id,
          video_url: analise.video_url,
          match_tipo: 'auto',
          match_score: m.score,
          status,
          ...snap,
          sincronizado_em: analise.sincronizado_em,
        })
        rows.push({ leilao, analise, sugestao: null })
        continue
      }
      if (m && m.tier === 'sugestao') {
        sugestao = { video_id: m.video.video_id, titulo: m.video.titulo, score: m.score }
      }
    }
    rows.push({ leilao, analise: null, sugestao })
  }

  // Persiste os auto-matches descobertos agora (idempotente por leilao_id UNIQUE).
  if (novosAuto.length > 0) {
    await supabase.from('bula_leilao_video_analise').upsert(novosAuto, { onConflict: 'leilao_id' })
  }
  if (reconciliadosAgora.length > 0) {
    await supabase
      .from('bula_leilao_video_analise')
      .upsert(reconciliadosAgora, { onConflict: 'leilao_id' })
  }

  return { rows, vpsOnline }
}

/**
 * Reconsulta a VPS e atualiza status/snapshot dos vínculos que ainda não estão
 * 'concluido' (ou todos, se force=true). Usado pelo botão "Sincronizar".
 */
export async function sincronizarAnalises(
  supabase: SupabaseClient,
  opts: { force?: boolean } = {},
): Promise<{ atualizados: number }> {
  const { data: vincRows } = await supabase
    .from('bula_leilao_video_analise')
    .select('leilao_id, video_id, status')
  let vps: VideoextratorLeilao[]
  try {
    vps = await listarLeiloesVPS()
  } catch {
    return { atualizados: 0 }
  }
  const vpsById = new Map(vps.map((v) => [v.video_id, v]))

  let atualizados = 0
  for (const v of vincRows ?? []) {
    if (!v.video_id) continue
    if (!opts.force && v.status === 'concluido') continue
    const hit = vpsById.get(v.video_id)
    if (!hit) continue
    const statusTerminal = statusTerminalVps(hit)
    if (!statusTerminal || v.status === statusTerminal) continue
    const snap = snapshotFromVps(hit)
    await supabase
      .from('bula_leilao_video_analise')
      .update({ status: statusTerminal, ...snap, sincronizado_em: new Date().toISOString() })
      .eq('leilao_id', v.leilao_id)
    atualizados++
  }
  return { atualizados }
}
