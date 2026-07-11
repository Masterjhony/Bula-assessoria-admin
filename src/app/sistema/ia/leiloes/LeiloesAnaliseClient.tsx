'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileVideo, RefreshCw, X, Play, CheckCircle2, Clock, AlertCircle,
  Loader2, ExternalLink, Sparkles, TrendingUp, Users, Tag, Eye, Mic, AlertTriangle,
  Activity, Search, GraduationCap, Gauge, ChevronDown, Radio, History,
  SlidersHorizontal, Youtube, CalendarDays, CircleDollarSign, Wifi, ArrowUpDown,
} from 'lucide-react'
import type { LeilaoAnaliseRow } from '@/lib/leilao-analise'
import { parseProcedencia, type Relatorio, type Atividade, type AtividadeEvento } from '@/lib/videoextrator'

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
  const monitorFeed = useMonitorFeed()

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
                        {badge.label}
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
                          <span className="text-xs text-amber-500 flex items-center gap-1.5">
                            <Loader2 size={13} className="animate-spin" /> na fila da VPS
                          </span>
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

function useMonitorFeed() {
  const [data, setData] = useState<Atividade | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => {
      fetch('/api/sistema/ia/leiloes/status')
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
  }, [])

  return { data, erro, loading: !data && !erro }
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
          {sessions.map((session) => (
            <article key={session.video_id} className="rounded-2xl border border-gray-200/80 bg-white/80 p-4 shadow-sm dark:border-[#303030] dark:bg-[#171717]/90">
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
                <LiveStat label="Lotes" value={String(session.total_lotes)} />
                <LiveStat label="Vendidos" value={String(session.vendidos)} />
                <LiveStat label="Volume parcial" value={brl(session.volume_total)} />
              </div>
              <div className="mt-3 flex items-center gap-2 text-[10px] text-emerald-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Gravador e transcritor ativos
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
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
  const processando = (data?.fila || []).filter((f) => f.status === 'processing')

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
              Analisando agora: <span className="font-medium truncate max-w-[60%]">{processando[0].title || processando[0].video_id}</span>
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
