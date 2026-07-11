'use client'

import { useState, useMemo, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  FileVideo, RefreshCw, X, Play, CheckCircle2, Clock, AlertCircle,
  Loader2, ExternalLink, Sparkles, TrendingUp, Users, Tag, Eye, Mic, AlertTriangle,
  Activity, Search, GraduationCap, Gauge, ChevronDown, Radio, History,
  SlidersHorizontal, Youtube, CalendarDays, CircleDollarSign, Wifi, ArrowUpDown,
} from 'lucide-react'
import type { LeilaoAnaliseRow } from '@/lib/leilao-analise'
import {
  parseProcedencia,
  type Relatorio,
  type RelatorioLote,
  type Atividade,
  type AtividadeEvento,
  type FilaItem,
  type MonitorLiveSession,
} from '@/lib/videoextrator'

function brl(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function dataBR(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

type Estado = 'concluido' | 'processando' | 'sugestao' | 'sem_video' | 'erro'
type FiltroEstado = 'todos' | Estado

function estadoDe(row: LeilaoAnaliseRow): Estado {
  if (row.analise?.status === 'concluido') return 'concluido'
  if (row.analise?.status === 'processando') return 'processando'
  if (row.analise?.status === 'erro') return 'erro'
  if (row.sugestao) return 'sugestao'
  return 'sem_video'
}

const BADGE: Record<Estado, { label: string; cls: string; Icon: React.ElementType }> = {
  concluido: { label: 'Analisado', cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30', Icon: CheckCircle2 },
  processando: { label: 'Processando', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30', Icon: Clock },
  sugestao: { label: 'Sugestão', cls: 'bg-sky-500/10 text-sky-500 border-sky-500/30', Icon: Sparkles },
  sem_video: { label: 'Sem vídeo', cls: 'bg-gray-500/10 text-gray-400 border-gray-500/20', Icon: AlertCircle },
  erro: { label: 'Erro', cls: 'bg-red-500/10 text-red-500 border-red-500/30', Icon: AlertCircle },
}

const FILTROS: Array<{ value: FiltroEstado; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'concluido', label: 'Analisados' },
  { value: 'processando', label: 'Em processamento' },
  { value: 'sugestao', label: 'Sugestões' },
  { value: 'sem_video', label: 'Sem vídeo' },
  { value: 'erro', label: 'Com erro' },
]

const ETAPAS_FILA: Record<string, { label: string; ativa: boolean }> = {
  discovered: { label: 'Descoberto', ativa: false },
  queued: { label: 'Aguardando na fila', ativa: false },
  acquiring: { label: 'Preparando vídeo', ativa: true },
  transcribing: { label: 'Transcrevendo', ativa: true },
  extracting: { label: 'Identificando lotes', ativa: true },
  gallery: { label: 'Gerando galeria', ativa: true },
  validating: { label: 'Validando evidências', ativa: true },
  persisting: { label: 'Salvando resultados', ativa: true },
  retry_wait: { label: 'Nova tentativa agendada', ativa: false },
  infra_wait: { label: 'Aguardando infraestrutura', ativa: false },
  waiting: { label: 'Aguardando disponibilidade', ativa: false },
  complete: { label: 'Concluído', ativa: false },
  skipped: { label: 'Ignorado', ativa: false },
}

function etapaFila(item?: FilaItem): { label: string; ativa: boolean } {
  if (item?.stage && ETAPAS_FILA[item.stage]) return ETAPAS_FILA[item.stage]
  if (item?.status === 'processing') return { label: 'Processando agora', ativa: true }
  if (item?.status === 'error') return { label: 'Falha no processamento', ativa: false }
  return { label: 'Aguardando na fila', ativa: false }
}

export default function LeiloesAnaliseClient({
  initialRows,
  vpsOnline,
  erro,
}: {
  initialRows: LeilaoAnaliseRow[]
  vpsOnline: boolean
  erro: string | null
}) {
  const router = useRouter()
  const rows = initialRows
  const [busy, setBusy] = useState<string | null>(null) // leilao_id em ação
  const [syncing, setSyncing] = useState(false)
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [relatorioOpen, setRelatorioOpen] = useState<{ id: string; nome: string; analise: typeof rows[number]['analise'] } | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroEstado>('todos')
  const [ordemRecente, setOrdemRecente] = useState(true)

  const resumo = useMemo(() => {
    const c = { total: rows.length, analisado: 0, processando: 0, sugestao: 0, sem: 0, erro: 0, volume: 0, lotes: 0, vendidos: 0 }
    for (const r of rows) {
      const e = estadoDe(r)
      if (e === 'concluido') {
        c.analisado++
        c.volume += Number(r.analise?.volume_total || 0)
        c.lotes += Number(r.analise?.total_lotes || 0)
        c.vendidos += Number(r.analise?.total_vendidos || 0)
      }
      else if (e === 'processando') c.processando++
      else if (e === 'sugestao') c.sugestao++
      else if (e === 'erro') c.erro++
      else c.sem++
    }
    return c
  }, [rows])

  const rowsFiltradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    return rows
      .filter((row) => filtro === 'todos' || estadoDe(row) === filtro)
      .filter((row) => {
        if (!termo) return true
        return [row.leilao.nome, row.leilao.transmissao, row.leilao.local]
          .some((value) => (value || '').toLocaleLowerCase('pt-BR').includes(termo))
      })
      .sort((a, b) => {
        const delta = Date.parse(b.leilao.data) - Date.parse(a.leilao.data)
        return ordemRecente ? delta : -delta
      })
  }, [rows, busca, filtro, ordemRecente])

  const visibleVideoIds = useMemo(
    () => [...new Set(rowsFiltradas.map((row) => row.analise?.video_id).filter((videoId): videoId is string => Boolean(videoId)))],
    [rowsFiltradas],
  )
  const monitorFeed = useMonitorFeed(visibleVideoIds)
  const filaPorVideo = useMemo(
    () => new Map((monitorFeed.data?.fila || []).map((item) => [item.video_id, item])),
    [monitorFeed.data?.fila],
  )

  const cobertura = resumo.total ? Math.round((resumo.analisado / resumo.total) * 100) : 0

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
    return data
  }

  async function analisar(id: string) {
    const videoUrl = (urlInputs[id] || '').trim()
    if (!videoUrl) return
    setBusy(id); setMsg(null)
    try {
      await post(`/api/sistema/ia/leiloes/${id}/analisar`, { videoUrl })
      setMsg('Análise enfileirada — o processamento roda na VPS e aparece aqui ao concluir.')
      router.refresh()
    } catch (e) {
      setMsg(`Falha: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  async function confirmarSugestao(id: string, videoId: string, score: number) {
    setBusy(id); setMsg(null)
    try {
      await post(`/api/sistema/ia/leiloes/${id}/vincular`, { videoId, score })
      router.refresh()
    } catch (e) {
      setMsg(`Falha: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  async function sincronizar() {
    setSyncing(true); setMsg(null)
    try {
      const r = await post('/api/sistema/ia/leiloes/sincronizar', {})
      setMsg(`Sincronizado: ${r.atualizados} leilão(ões) atualizado(s).`)
      router.refresh()
    } catch (e) {
      setMsg(`Falha ao sincronizar: ${(e as Error).message}`)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-[#A68B4B]/20 bg-white dark:bg-[#111111] px-5 py-6 lg:px-7 lg:py-7">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[#A68B4B]/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#A68B4B]/25 bg-[#A68B4B]/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A68B4B]">
              <FileVideo size={12} /> Inteligência de leilões
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-3xl">Decisões melhores a partir de cada transmissão</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">
              Consulte o histórico já transcrito, acompanhe a captura ao vivo e compare a leitura da IA com os fechamentos da Bula.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${vpsOnline ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-500' : 'border-red-500/25 bg-red-500/5 text-red-500'}`}>
              <Wifi size={14} /> {vpsOnline ? 'VPS conectada' : 'VPS indisponível'}
            </span>
            <button
              onClick={sincronizar}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-xl bg-[#B89A57] px-4 py-2 text-xs font-semibold text-black shadow-sm transition hover:bg-[#C8A96E] disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              Atualizar dados
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard icon={CalendarDays} label="Base acompanhada" value={String(resumo.total)} helper="desde abril de 2026" />
        <MetricCard icon={Gauge} label="Cobertura analisada" value={`${cobertura}%`} helper={`${resumo.analisado} relatórios concluídos`} tone="emerald" />
        <MetricCard icon={CircleDollarSign} label="Volume identificado" value={brl(resumo.volume)} helper="nos relatórios concluídos" tone="gold" />
        <MetricCard icon={Tag} label="Lotes capturados" value={resumo.lotes.toLocaleString('pt-BR')} helper={`${resumo.vendidos} marcados como vendidos`} tone="sky" />
      </div>

      <LiveAuctionsPanel data={monitorFeed.data} erro={monitorFeed.erro} loading={monitorFeed.loading} />

      {erro && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-500">
          {erro}
        </div>
      )}
      {msg && (
        <div className="flex items-center justify-between rounded-xl border border-[#A68B4B]/30 bg-[#A68B4B]/10 px-4 py-3 text-sm text-[#A68B4B]">
          <span>{msg}</span>
          <button onClick={() => setMsg(null)}><X size={14} /></button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#292929] dark:bg-[#121212]">
        <div className="border-b border-gray-200 px-4 py-4 dark:border-[#292929] lg:px-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <History size={17} className="text-[#A68B4B]" />
                <h2 className="font-semibold text-gray-900 dark:text-white">Histórico de leilões</h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-[#202020] dark:text-gray-400">{rowsFiltradas.length}</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">Priorize os eventos concluídos para trabalhar com transcrição e relatório completos.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative block">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Buscar leilão, canal ou local"
                  aria-label="Buscar leilões"
                  className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-xs text-gray-800 outline-none transition focus:border-[#A68B4B]/60 focus:bg-white dark:border-[#303030] dark:bg-[#191919] dark:text-gray-100 dark:focus:bg-[#171717] sm:w-72"
                />
              </label>
              <button
                onClick={() => setOrdemRecente((value) => !value)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 text-xs text-gray-500 transition hover:border-[#A68B4B]/40 hover:text-[#A68B4B] dark:border-[#303030] dark:text-gray-400"
              >
                <ArrowUpDown size={14} /> {ordemRecente ? 'Mais recentes' : 'Mais antigos'}
              </button>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
            <SlidersHorizontal size={14} className="mr-1 shrink-0 text-gray-400" />
            {FILTROS.map((item) => (
              <button
                key={item.value}
                onClick={() => setFiltro(item.value)}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition ${filtro === item.value ? 'border-[#A68B4B]/40 bg-[#A68B4B]/10 text-[#A68B4B]' : 'border-transparent bg-gray-100 text-gray-500 hover:text-gray-800 dark:bg-[#1D1D1D] dark:text-gray-400 dark:hover:text-gray-200'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:border-[#292929]">
                <th className="w-28 px-5 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Evento</th>
                <th className="w-40 px-4 py-3 font-medium">Status</th>
                <th className="w-40 px-4 py-3 font-medium">Leitura</th>
                <th className="w-44 px-4 py-3 font-medium">Volume</th>
                <th className="w-[330px] px-5 py-3 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {rowsFiltradas.map((row) => {
                const e = estadoDe(row)
                const badge = BADGE[e]
                const id = row.leilao.id
                const isBusy = busy === id
                const itemFila = row.analise?.video_id ? filaPorVideo.get(row.analise.video_id) : undefined
                const etapa = etapaFila(itemFila)
                return (
                  <tr key={id} className="border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50/70 dark:border-[#232323] dark:hover:bg-[#181818]">
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-medium text-gray-500 dark:text-gray-400">{dataBR(row.leilao.data)}</td>
                    <td className="px-4 py-4">
                      <p className="max-w-[360px] truncate font-semibold text-gray-900 dark:text-gray-100" title={row.leilao.nome}>{row.leilao.nome}</p>
                      <p className="mt-1 max-w-[360px] truncate text-[11px] text-gray-400">
                        {[row.leilao.transmissao, row.leilao.local].filter(Boolean).join(' · ') || 'Canal e local não informados'}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border ${badge.cls}`}>
                        <badge.Icon size={12} />
                        {e === 'processando' ? etapa.label : badge.label}
                      </span>
                      {e === 'sugestao' && row.sugestao && <p className="mt-1 text-[10px] text-gray-400">match {Math.round(row.sugestao.score * 100)}%</p>}
                    </td>
                    <td className="px-4 py-4 text-xs text-gray-500 dark:text-gray-400">
                      {e === 'concluido' && row.analise ? (
                        <div>
                          <p className="font-medium text-gray-700 dark:text-gray-200">{row.analise.total_vendidos ?? 0} vendidos</p>
                          <p className="mt-0.5 text-[10px] text-gray-400">de {row.analise.total_lotes ?? 0} lotes detectados</p>
                          {row.analise.indice_assertividade != null && (
                            <span className={`mt-1 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] ${assertCls(row.analise.indice_assertividade)}`} title="Assertividade vs fechamento da Bula">
                              {Math.round(row.analise.indice_assertividade)}%
                            </span>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-gray-800 dark:text-gray-100">{e === 'concluido' ? brl(row.analise?.volume_total) : '—'}</p>
                      {row.analise?.sincronizado_em && <p className="mt-1 text-[10px] text-gray-400">atualizado {tempoRel(row.analise.sincronizado_em)}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        {row.analise?.video_url && (
                          <a href={row.analise.video_url} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-200 p-2 text-gray-400 transition hover:border-red-500/30 hover:text-red-500 dark:border-[#303030]" title="Abrir vídeo no YouTube">
                            <Youtube size={14} />
                          </a>
                        )}
                        {e === 'concluido' && (
                          <button
                            onClick={() => setRelatorioOpen({ id, nome: row.leilao.nome, analise: row.analise })}
                            className="flex items-center gap-1.5 rounded-lg bg-[#A68B4B] px-3 py-2 text-xs font-semibold text-black transition hover:bg-[#C8A96E]"
                          >
                            <ExternalLink size={13} /> Abrir relatório
                          </button>
                        )}
                        {e === 'sugestao' && row.sugestao && (
                          <button
                            onClick={() => confirmarSugestao(id, row.sugestao!.video_id, row.sugestao!.score)}
                            disabled={isBusy}
                            className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 px-3 py-2 text-xs text-sky-500 transition hover:bg-sky-500/10 disabled:opacity-50"
                            title={row.sugestao.titulo || ''}
                          >
                            {isBusy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Confirmar sugestão
                          </button>
                        )}
                        {(e === 'sem_video' || e === 'sugestao' || e === 'erro') && (
                          <div className="flex items-center gap-1.5">
                            <input
                              value={urlInputs[id] || ''}
                              onChange={(ev) => setUrlInputs((p) => ({ ...p, [id]: ev.target.value }))}
                              placeholder="URL do YouTube"
                              className="w-[150px] rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs outline-none focus:border-[#A68B4B]/50 dark:border-[#333] dark:bg-[#1A1A1A] lg:w-[180px]"
                            />
                            <button
                              onClick={() => analisar(id)}
                              disabled={isBusy || !(urlInputs[id] || '').trim()}
                              className="flex items-center gap-1 rounded-lg bg-[#A68B4B]/15 px-2.5 py-2 text-xs text-[#A68B4B] transition hover:bg-[#A68B4B]/25 disabled:opacity-40"
                            >
                              {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Analisar
                            </button>
                          </div>
                        )}
                        {e === 'processando' && (
                          <QueueProgress item={itemFila} etapa={etapa} />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {rowsFiltradas.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-14 text-center text-gray-400">Nenhum leilão encontrado com estes filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AtividadePanel data={monitorFeed.data} erro={monitorFeed.erro} loading={monitorFeed.loading} />

      {relatorioOpen && (
        <RelatorioModal
          leilaoId={relatorioOpen.id}
          nome={relatorioOpen.nome}
          analise={relatorioOpen.analise}
          onClose={() => setRelatorioOpen(null)}
        />
      )}
    </div>
  )
}

function useMonitorFeed(videoIds: string[]) {
  const [data, setData] = useState<Atividade | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const statusUrl = useMemo(() => {
    const params = new URLSearchParams()
    for (const videoId of videoIds) params.append('video_ids', videoId)
    const query = params.toString()
    return `/api/sistema/ia/leiloes/status${query ? `?${query}` : ''}`
  }, [videoIds])

  useEffect(() => {
    let alive = true
    const load = () => {
      fetch(statusUrl)
        .then(async (response) => {
          const payload = await response.json()
          if (!response.ok) throw new Error(payload.error || `Erro ${response.status}`)
          return payload as Atividade
        })
        .then((payload) => {
          if (alive) {
            setData(payload)
            setErro(null)
          }
        })
        .catch((error) => { if (alive) setErro(error.message) })
    }
    load()
    const id = setInterval(load, 15_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [statusUrl])

  return { data, erro, loading: !data && !erro }
}

function QueueProgress({ item, etapa }: { item?: FilaItem; etapa: ReturnType<typeof etapaFila> }) {
  const queueState = (item?.queue_state || '').toLowerCase()
  const readyTotal = item?.queue_ready_total ?? item?.ready_total
  const wait = filaWaitLabel(item)
  const nextAttempt = item?.next_attempt_at ? tempoAte(item.next_attempt_at) : null
  const attempts = Number(item?.attempts || 0)
  const isRetry = Boolean(
    nextAttempt
    && (queueState === 'blocked' || ['retry_wait', 'infra_wait', 'waiting'].includes(item?.stage || '')),
  )
  const details: string[] = []

  if (item?.queue_position != null) {
    details.push(`posição ${item.queue_position}${readyTotal != null ? ` de ${readyTotal}` : ''}`)
  } else if (queueState === 'ready') {
    details.push('pronto para processar')
  }
  if (wait && !['processing', 'done', 'skipped'].includes(queueState)) details.push(`esperando há ${wait}`)
  if (etapa.ativa && item?.stage_updated_at) details.push(`etapa atualizada ${tempoRel(item.stage_updated_at)}`)
  if (etapa.ativa && attempts > 0) details.push(`tentativa ${attempts}`)

  if (!item) {
    details.push('consultando posição na VPS')
  } else if (queueState === 'done') {
    details.push('aguardando sincronização da página')
  }

  return (
    <div className="flex max-w-[285px] flex-col items-end gap-0.5 text-right">
      <span className="flex items-center gap-1.5 text-xs text-amber-500">
        {etapa.ativa ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
        {etapa.label}
      </span>
      {details.length > 0 && (
        <span className="max-w-full truncate text-[10px] text-gray-400" title={details.join(' · ')}>
          {details.join(' · ')}
        </span>
      )}
      {isRetry && (
        <span className="max-w-full truncate text-[10px] text-amber-500/80" title={item?.next_attempt_at || undefined}>
          Nova tentativa {nextAttempt}{attempts > 0 ? ` · ${attempts} tentativa(s) realizada(s)` : ''}
        </span>
      )}
    </div>
  )
}

function filaWaitLabel(item?: FilaItem): string | null {
  if (item?.wait_seconds != null) {
    const supplied = Number(item.wait_seconds)
    if (Number.isFinite(supplied) && supplied >= 0) return duracaoCurta(supplied)
  }
  if (!item?.queued_at) return null
  const queuedAt = Date.parse(item.queued_at)
  if (Number.isNaN(queuedAt)) return null
  return duracaoCurta(Math.max(0, (Date.now() - queuedAt) / 1000))
}

function duracaoCurta(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  if (total < 60) return 'menos de 1 min'
  if (total < 3600) return `${Math.floor(total / 60)} min`
  if (total < 86400) {
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    return minutes ? `${hours}h ${minutes}min` : `${hours}h`
  }
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  return hours ? `${days}d ${hours}h` : `${days}d`
}

function tempoAte(iso: string): string | null {
  const target = Date.parse(iso)
  if (Number.isNaN(target)) return null
  const seconds = Math.floor((target - Date.now()) / 1000)
  if (seconds <= 0) return 'liberada agora'
  return `em ${duracaoCurta(seconds)}`
}

function duracaoRel(seconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return `${minutes} min`
  return `${hours}h ${String(minutes).padStart(2, '0')}min`
}

function LiveAuctionsPanel({ data, erro, loading }: { data: Atividade | null; erro: string | null; loading: boolean }) {
  const monitor = data?.monitor
  const sessions = monitor?.sessions || []

  return (
    <section className={`overflow-hidden rounded-2xl border ${sessions.length ? 'border-red-500/20 bg-gradient-to-br from-red-500/[0.06] via-white to-[#A68B4B]/[0.06] dark:via-[#121212]' : 'border-gray-200 bg-white dark:border-[#292929] dark:bg-[#121212]'}`}>
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-5">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${sessions.length ? 'bg-red-500/10 text-red-500' : 'bg-gray-100 text-gray-400 dark:bg-[#202020]'}`}>
            <Radio size={18} className={sessions.length ? 'animate-pulse' : ''} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900 dark:text-white">Monitoramento ao vivo</h2>
              {sessions.length > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white">Ao vivo</span>}
            </div>
            <p className="mt-0.5 text-xs text-gray-400">
              {sessions.length ? `${sessions.length} transmissão(ões) capturada(s) agora` : 'Nenhuma transmissão sendo capturada neste momento'}
            </p>
          </div>
        </div>
        <div className="text-[10px] text-gray-400">
          {monitor?.checked_at ? `VPS atualizada ${tempoRel(monitor.checked_at)}` : 'Atualização automática a cada 15s'}
        </div>
      </div>

      {loading && <div className="mx-4 mb-4 h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-[#1B1B1B]" />}
      {erro && !data && <div className="mx-4 mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-500">Não foi possível consultar o monitor: {erro}</div>}
      {sessions.length > 0 && (
        <div className="grid gap-3 border-t border-red-500/10 p-4 lg:grid-cols-2 lg:p-5">
          {sessions.map((session) => <LiveAuctionCard key={session.video_id} session={session} />)}
        </div>
      )}
    </section>
  )
}

function LiveAuctionCard({ session }: { session: MonitorLiveSession }) {
  const currentId = session.current_lot?.id
  const partialLots = [
    ...(session.current_lot ? [session.current_lot] : []),
    ...(session.recent_lots || []).filter((lote) => lote.id !== currentId),
  ].slice(0, 6)
  const totalCompleto = session.vendidos > 0 && session.lotes_sem_total === 0 && session.volume_total_confirmado != null
  const totalExibido = totalCompleto
    ? session.volume_total_confirmado
    : session.volume_total_estimado ?? session.volume_total_confirmado ?? (session.volume_total || null)
  const totalLabel = totalCompleto
    ? 'Total confirmado'
    : session.volume_total_estimado != null ? 'Total estimado' : 'Volume captado'
  const cobertura = session.cobertura_total_pct != null
    ? `${Math.round(session.cobertura_total_pct)}% de cobertura financeira`
    : `${session.lotes_com_total}/${session.vendidos || 0} vendidos com total`

  return (
    <article className="rounded-2xl border border-gray-200/80 bg-white/80 p-4 shadow-sm dark:border-[#303030] dark:bg-[#171717]/90">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white" title={session.title}>{session.title}</p>
          <p className="mt-1 text-[11px] text-gray-400">Monitorando há {duracaoRel(session.age_seconds)}</p>
        </div>
        {session.url && (
          <a href={session.url} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-red-500 transition hover:bg-red-500/10" title="Assistir no YouTube">
            <Youtube size={15} />
          </a>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <LiveStat label="Lotes identificados" value={String(session.total_lotes)} />
        <LiveStat label="Vendidos confirmados" value={String(session.vendidos)} />
        <LiveStat label={totalLabel} value={brl(totalExibido)} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-gray-400">
        <span>{cobertura}</span>
        <span>{session.lotes_com_total} com total{session.lotes_sem_total ? ` · ${session.lotes_sem_total} pendente(s)` : ''}</span>
        {session.volume_parcelas_captado != null && (
          <span>Parcelas-base captadas: {brl(session.volume_parcelas_captado)}</span>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200/80 bg-gray-50/60 dark:border-[#2B2B2B] dark:bg-[#131313]">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200/80 px-3 py-2 dark:border-[#292929]">
          <div>
            <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">Parcial capturado</p>
            <p className="text-[9px] text-gray-400">Dados provisórios, atualizados a cada 15 segundos</p>
          </div>
          <span className="shrink-0 rounded-full border border-red-500/20 bg-red-500/5 px-2 py-1 text-[8px] font-semibold uppercase tracking-wider text-red-500">Ao vivo</span>
        </div>
        {partialLots.length > 0 ? (
          <div className="max-h-[34rem] divide-y divide-gray-200/70 overflow-y-auto dark:divide-[#272727]">
            {partialLots.map((lote) => (
              <LiveLotRow key={`${lote.id}-${lote.numero_lote || ''}`} lote={lote} current={lote.id === currentId} />
            ))}
          </div>
        ) : (
          <div className="px-3 py-4 text-center text-[10px] text-gray-400">
            Os primeiros lotes aparecerão aqui assim que forem identificados.
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 text-[10px] text-emerald-500">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {session.visual_status === 'running'
          ? 'Gravador, transcritor e leitura visual ativos'
          : 'Gravador e transcritor ativos · leitura visual iniciando'}
      </div>
    </article>
  )
}

function LiveLotRow({ lote, current }: { lote: RelatorioLote; current: boolean }) {
  const status = liveLotStatus(lote, current)
  const identificacao = lote.identificacao_animal || lote.nome_animal || lote.descricao_lote || 'Identificação em processamento'
  const descricao = lote.descricao_lote && lote.descricao_lote !== identificacao ? lote.descricao_lote : null
  const total = liveLotTotal(lote)
  const confidence = confidencePct(lote.confianca)
  const imageUrl = lote.frame_artifact_id
    ? `/api/sistema/ia/leiloes/lotes/imagem/${lote.frame_artifact_id}`
    : null

  return (
    <div className={`flex items-start gap-3 px-3 py-3 ${current ? 'bg-red-500/[0.035]' : ''}`}>
      <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 dark:bg-[#202020]">
        {imageUrl ? (
          <Image unoptimized src={imageUrl} width={160} height={112} alt={`Imagem parcial do lote ${lote.numero_lote || ''}`} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Lote {lote.numero_lote || '—'}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-gray-800 dark:text-gray-100" title={identificacao}>
              <span className="mr-1.5 text-[#A68B4B]">Lote {lote.numero_lote || '—'}</span>
              {identificacao}
            </p>
            {descricao && <p className="mt-0.5 truncate text-[9px] text-gray-400" title={descricao}>{descricao}</p>}
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-semibold ${status.cls}`}>{status.label}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <LiveLotField label="Comprador" value={lote.comprador || (lote.motivo === 'VENDIDO' ? 'Pendente' : status.label)} />
          <LiveLotField label="Condição" value={liveLotFormula(lote)} />
          <LiveLotField label="Total" value={brl(total)} strong />
          <LiveLotField label="Confiança" value={confidence != null ? `${confidence}%` : 'Em análise'} tone={confidence != null && confidence < 70 ? 'warning' : undefined} />
        </div>
      </div>
    </div>
  )
}

function LiveLotField({ label, value, strong = false, tone }: { label: string; value: string; strong?: boolean; tone?: 'warning' }) {
  return (
    <div className="min-w-0">
      <p className="text-[8px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-0.5 truncate text-[10px] ${strong ? 'font-semibold text-gray-800 dark:text-gray-100' : tone === 'warning' ? 'font-medium text-amber-500' : 'text-gray-600 dark:text-gray-300'}`} title={value}>{value}</p>
    </div>
  )
}

function confidencePct(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null
  const normalized = Number(value) <= 1 ? Number(value) * 100 : Number(value)
  return Math.max(0, Math.min(100, Math.round(normalized)))
}

function liveLotNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function liveLotTotal(lote: RelatorioLote): number | null {
  if ((lote.motivo || '').toUpperCase() === 'NAO_VENDIDO') return null
  return liveLotNumber(lote.valor_total_negociado)
    ?? liveLotNumber(lote.financeiro?.total_confirmado)
    ?? liveLotNumber(lote.valor_total_estimado)
    ?? liveLotNumber(lote.financeiro?.total_estimado)
    ?? liveLotNumber(lote.financeiro?.valor_total)
}

function liveLotFormula(lote: RelatorioLote): string {
  const parcela = liveLotNumber(lote.valor_parcela) ?? liveLotNumber(lote.financeiro?.valor_parcela)
  const parcelas = liveLotNumber(lote.total_parcelas) ?? liveLotNumber(lote.financeiro?.total_parcelas)
  const unidade = (lote.unidade_preco || lote.financeiro?.unidade_preco || '').toUpperCase()
  if (unidade === 'TOTAL_LOTE') {
    const total = liveLotTotal(lote)
    return total != null ? `${brl(total)} total do lote` : 'Total em conferência'
  }
  if (parcela == null) return lote.financeiro?.formula || 'Em processamento'
  const parts = [brl(parcela)]
  if (parcelas != null) parts.push(`× ${parcelas} parc.`)
  const quantidade = liveLotNumber(lote.quantidade_animais)
    ?? liveLotNumber(lote.financeiro?.quantidade_animais)
    ?? liveLotNumber(lote.financeiro?.quantidade)
  if (unidade === 'POR_ANIMAL' && quantidade != null) parts.push(`× ${quantidade} animais`)
  return parts.join(' ')
}

function liveLotStatus(lote: RelatorioLote, current: boolean): { label: string; cls: string } {
  const raw = (lote.status_parcial || lote.motivo || '').toLocaleUpperCase('pt-BR')
  if (raw.includes('DISPUTA') || (current && !raw.includes('VENDIDO'))) {
    return { label: 'Em disputa', cls: 'border-red-500/25 bg-red-500/10 text-red-500' }
  }
  const confidence = confidencePct(lote.confianca)
  const financialStatus = (lote.financeiro?.status || '').toLocaleUpperCase('pt-BR')
  if (raw.includes('REVIS') || raw.includes('A_CONFIRMAR') || financialStatus === 'INCOMPLETO' || financialStatus === 'INVALIDO' || (confidence != null && confidence < 70)) {
    return { label: 'Revisar', cls: 'border-amber-500/25 bg-amber-500/10 text-amber-500' }
  }
  if (raw.includes('NAO_VENDIDO') || raw.includes('NÃO VENDIDO')) {
    return { label: 'Não vendido', cls: 'border-gray-500/25 bg-gray-500/10 text-gray-400' }
  }
  if (raw.includes('VENDIDO') || lote.comprador) {
    return { label: 'Vendido', cls: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500' }
  }
  return { label: 'Parcial', cls: 'border-sky-500/25 bg-sky-500/10 text-sky-500' }
}

function LiveStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-[#1F1F1F]">
      <p className="text-[9px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold text-gray-800 dark:text-gray-100" title={value}>{value}</p>
    </div>
  )
}

function tempoRel(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return `${Math.floor(s / 60)}min atrás`
  if (s < 86400) return `${Math.floor(s / 3600)}h atrás`
  return `${Math.floor(s / 86400)}d atrás`
}

const EVENTO_META: Record<string, { Icon: React.ElementType; cls: string }> = {
  descoberta: { Icon: Search, cls: 'text-sky-500' },
  analise: { Icon: CheckCircle2, cls: 'text-emerald-500' },
  indice: { Icon: Gauge, cls: 'text-[#A68B4B]' },
  feedback: { Icon: GraduationCap, cls: 'text-violet-500' },
  sem_match: { Icon: AlertCircle, cls: 'text-gray-400' },
  erro: { Icon: AlertTriangle, cls: 'text-red-500' },
  sync: { Icon: RefreshCw, cls: 'text-gray-400' },
}

function AtividadePanel({ data, erro, loading }: { data: Atividade | null; erro: string | null; loading: boolean }) {
  const [open, setOpen] = useState(false)

  const s = data?.stats || {}
  const processando = (data?.fila || []).filter((f) => etapaFila(f).ativa)
  const etapaAtual = etapaFila(processando[0])

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2A2A2A] dark:bg-[#141414]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-[#1A1A1A] transition-colors"
      >
        <Activity size={16} className="text-[#A68B4B]" />
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Atividade do sistema</span>
        <span className="text-[10px] text-gray-400">diagnóstico da fila e eventos técnicos</span>
        <div className="ml-auto flex items-center gap-2">
          <ChipFila label="na fila" valor={s.pending} cor="text-amber-500" />
          <ChipFila label="processando" valor={processando.length} cor="text-sky-500" />
          <ChipFila label="prontos" valor={s.done} cor="text-emerald-500" />
          <ChipFila label="erros" valor={s.error} cor="text-red-400" />
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-200 dark:border-[#2A2A2A] p-4">
          {erro && <p className="text-xs text-red-500 mb-2">VPS: {erro}</p>}
          {processando.length > 0 && (
            <div className="mb-3 flex items-center gap-2 text-xs text-sky-500">
              <Loader2 size={13} className="animate-spin" />
              {etapaAtual.label}: <span className="font-medium truncate max-w-[60%]">{processando[0].title || processando[0].video_id}</span>
            </div>
          )}
          {loading && <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-[#A68B4B]" size={20} /></div>}
          {data && (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {(data.eventos || []).length === 0 && (
                <p className="text-xs text-gray-400 py-4 text-center">Sem eventos ainda. O sistema roda a cada poucos minutos.</p>
              )}
              {(data.eventos || []).map((e: AtividadeEvento, i) => {
                const meta = EVENTO_META[e.tipo] || EVENTO_META.sync
                return (
                  <div key={i} className="flex items-start gap-2 text-xs px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1A1A1A]">
                    <meta.Icon size={13} className={`${meta.cls} mt-0.5 shrink-0`} />
                    <span className="text-gray-700 dark:text-gray-300 flex-1">{e.msg}</span>
                    <span className="text-gray-400 dark:text-gray-600 whitespace-nowrap">{tempoRel(e.ts)}</span>
                  </div>
                )
              })}
            </div>
          )}
          {/* erros recentes da fila */}
          {(data?.fila || []).some((f) => f.status === 'error') && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#222]">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Erros recentes na fila</p>
              {(data?.fila || []).filter((f) => f.status === 'error').slice(0, 4).map((f) => (
                <div key={f.video_id} className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 px-2 py-1">
                  <span className="truncate max-w-[55%]" title={f.title || ''}>{f.title || f.video_id}</span>
                  <span className="text-red-400 truncate max-w-[40%]" title={f.last_error || ''}>{(f.last_error || '').slice(0, 40) || 'erro'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ChipFila({ label, valor, cor }: { label: string; valor?: number; cor: string }) {
  if (valor == null) return null
  return (
    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-gray-400">
      <span className={`font-bold ${cor}`}>{valor}</span> {label}
    </span>
  )
}

function MetricCard({ icon: Icon, label, value, helper, tone = 'default' }: { icon: React.ElementType; label: string; value: string; helper: string; tone?: 'default' | 'gold' | 'emerald' | 'sky' }) {
  const tones = {
    default: 'bg-gray-100 text-gray-500 dark:bg-[#202020] dark:text-gray-400',
    gold: 'bg-[#A68B4B]/10 text-[#A68B4B]',
    emerald: 'bg-emerald-500/10 text-emerald-500',
    sky: 'bg-sky-500/10 text-sky-500',
  }
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#292929] dark:bg-[#121212]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}><Icon size={15} /></span>
      </div>
      <p className="mt-2 truncate text-xl font-bold text-gray-900 dark:text-white sm:text-2xl" title={value}>{value}</p>
      <p className="mt-1 text-[10px] text-gray-400">{helper}</p>
    </div>
  )
}

function RelatorioModal({ leilaoId, nome, analise, onClose }: { leilaoId: string; nome: string; analise: LeilaoAnaliseRow['analise']; onClose: () => void }) {
  const [rel, setRel] = useState<Relatorio | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/sistema/ia/leiloes/${leilaoId}/relatorio`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
        return d as Relatorio
      })
      .then((d) => { if (alive) { setRel(d); setLoading(false) } })
      .catch((e) => { if (alive) { setErro(e.message); setLoading(false) } })
    return () => { alive = false }
  }, [leilaoId])

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#141414] w-full sm:max-w-4xl max-h-[92vh] sm:rounded-2xl rounded-t-2xl border border-gray-200 dark:border-[#2A2A2A] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-[#2A2A2A] shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">{nome}</h2>
            <p className="text-xs text-gray-400">Relatório pós-leilão</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1A1A1A]"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5">
          {loading && <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#A68B4B]" size={28} /></div>}
          {erro && <div className="py-10 text-center text-red-500 text-sm">{erro}</div>}
          {rel && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <Stat icon={Tag} label="Lotes" valor={`${rel.vendidos}/${rel.total_lotes}`} hint="vendidos" />
                <Stat icon={TrendingUp} label="Volume" valor={brl(rel.volume_total)} />
                <Stat icon={TrendingUp} label="Preço médio" valor={brl(rel.preco_medio)} />
                <Stat icon={TrendingUp} label="Maior lance" valor={brl(rel.preco_maximo)} />
              </div>

              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <ListaTop titulo="Top compradores" icon={Users} itens={(rel.top_compradores || []).map((c) => ({ nome: c.nome, valor: brl(c.volume) }))} />
                <ListaTop titulo="Top assessorias" icon={Users} itens={(rel.top_assessorias || []).map((c) => ({ nome: c.nome, valor: `${c.quantidade} lote(s)` }))} />
              </div>

              {analise?.assertividade && analise.indice_assertividade != null && (
                <AssertividadeBlock indice={analise.indice_assertividade} a={analise.assertividade} />
              )}

              {(() => {
                const procs = (rel.lotes || []).map((l) => parseProcedencia(l.qa_flags))
                const nDesacordo = procs.filter((p) => p.desacordo).length
                const nVisual = procs.filter((p) => p.fonte === 'fusao').length
                return (
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Lotes ({rel.lotes?.length || 0})</h3>
                    {nVisual > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500 border border-violet-500/30">
                        <Eye size={11} /> {nVisual} com leitura da tarja
                      </span>
                    )}
                    {nDesacordo > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30">
                        <AlertTriangle size={11} /> {nDesacordo} desacordo áudio↔vídeo (revisar)
                      </span>
                    )}
                  </div>
                )
              })()}
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#2A2A2A]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-200 dark:border-[#2A2A2A]">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Descrição / Animal</th>
                      <th className="px-3 py-2 font-medium">Comprador</th>
                      <th className="px-3 py-2 font-medium text-right">Valor</th>
                      <th className="px-3 py-2 font-medium text-center">Parc.</th>
                      <th className="px-3 py-2 font-medium">Fonte</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rel.lotes || []).map((l) => {
                      const proc = parseProcedencia(l.qa_flags)
                      return (
                      <tr key={l.id} className={`border-b border-gray-100 dark:border-[#222] ${proc.desacordo ? 'bg-amber-500/5' : ''}`}>
                        <td className="px-3 py-2 text-gray-400">{l.numero_lote}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate text-gray-700 dark:text-gray-200" title={l.descricao_lote || l.nome_animal || ''}>
                          {l.nome_animal || l.descricao_lote || '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300 max-w-[150px] truncate" title={l.comprador || ''}>{l.comprador || '—'}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-800 dark:text-gray-100">{brl(l.valor_final)}</td>
                        <td className="px-3 py-2 text-center text-gray-500 dark:text-gray-400">{l.total_parcelas || '—'}</td>
                        <td className="px-3 py-2">
                          <FonteBadge proc={proc} conf={l.confianca} />
                        </td>
                        <td className="px-3 py-2">
                          <span className={l.motivo === 'VENDIDO' ? 'text-emerald-500' : 'text-gray-400'}>
                            {l.motivo === 'VENDIDO' ? 'Vendido' : 'Não vendido'}
                          </span>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, valor, hint }: { icon: React.ElementType; label: string; valor: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-[#2A2A2A] px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-400">
        <Icon size={12} /> {label}
      </div>
      <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">{valor}</p>
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  )
}

function assertCls(indice: number): string {
  if (indice >= 80) return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
  if (indice >= 50) return 'bg-amber-500/10 text-amber-500 border-amber-500/30'
  return 'bg-red-500/10 text-red-500 border-red-500/30'
}

function AssertividadeBlock({ indice, a }: { indice: number; a: NonNullable<LeilaoAnaliseRow['analise']>['assertividade'] }) {
  if (!a) return null
  const erros = (a.per_buyer || []).filter((b) => !b.encontrado || b.valor_bate === false)
  return (
    <div className="mb-6 rounded-xl border border-gray-200 dark:border-[#2A2A2A] p-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Assertividade vs fechamento da Bula</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${assertCls(indice)}`}>{Math.round(indice)}%</span>
        <span className="text-[11px] text-gray-400">
          compradores {a.compradores_encontrados}/{a.gold_compradores}
          {a.buyer_recall_pct != null && ` · recall ${Math.round(a.buyer_recall_pct)}%`}
          {a.value_accuracy_pct != null && ` · valor ${Math.round(a.value_accuracy_pct)}%`}
        </span>
      </div>
      {erros.length === 0 ? (
        <p className="text-xs text-emerald-500">Todos os compradores do fechamento foram encontrados. ✓</p>
      ) : (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Onde errou ({erros.length})</p>
          <div className="space-y-1">
            {erros.slice(0, 12).map((b, i) => (
              <div key={i} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-[#1A1A1A]">
                <span className="truncate text-gray-700 dark:text-gray-200 max-w-[55%]" title={b.gold_comprador}>{b.gold_comprador}</span>
                <span className={b.encontrado ? 'text-amber-500' : 'text-red-500'}>
                  {b.encontrado ? `valor diverge (extr ~${brl(b.extr_valor_estimado)} vs ${brl(b.gold_vgv)})` : 'não encontrado'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FonteBadge({ proc, conf }: { proc: ReturnType<typeof parseProcedencia>; conf: number | null }) {
  const pct = conf != null ? Math.round(conf * 100) : null
  if (proc.desacordo) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30" title="Áudio e vídeo divergiram no valor; ficou com a leitura da tarja.">
        <AlertTriangle size={10} /> desacordo{pct != null ? ` · ${pct}%` : ''}
      </span>
    )
  }
  if (proc.fonte === 'fusao') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 border border-violet-500/30" title="Campos rígidos lidos da tarja (vídeo); comprador do áudio.">
        <Eye size={10} /> tarja{pct != null ? ` · ${pct}%` : ''}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-400 border border-gray-500/20" title="Extraído só do áudio/transcrição.">
      <Mic size={10} /> áudio{pct != null ? ` · ${pct}%` : ''}
    </span>
  )
}

function ListaTop({ titulo, icon: Icon, itens }: { titulo: string; icon: React.ElementType; itens: { nome: string; valor: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5"><Icon size={14} /> {titulo}</h3>
      <div className="space-y-1">
        {itens.length === 0 && <p className="text-xs text-gray-400">Sem dados.</p>}
        {itens.map((it, i) => (
          <div key={i} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1A1A1A]">
            <span className="truncate text-gray-700 dark:text-gray-200 max-w-[70%]" title={it.nome}>{it.nome}</span>
            <span className="text-gray-500 dark:text-gray-400 font-medium">{it.valor}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
