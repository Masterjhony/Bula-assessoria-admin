'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  AlertTriangle, Beef, CheckCircle2, ChevronDown,
  ExternalLink, Eye, Filter, Image as ImageIcon, Images, LayoutGrid,
  Loader2, RefreshCw, Search, ShieldCheck, Table2, Tag, UserRound,
  Warehouse, X,
} from 'lucide-react'

interface Artefato {
  id: number
  tipo: string
  timestamp_seg: number | null
  source: string | null
}

interface AnimalCatalogo {
  nome?: string | null
  rgn?: string | null
  siu?: string | null
  nascimento?: string | null
  pai?: string | null
  mae?: string | null
  reprodutivo?: string | null
}

interface Lote {
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
  has_image: boolean
  review_required: boolean
  leilao: { titulo: string; canal: string; data_evento: string; url: string }
  evidencia: { texto: string; inicio_s: number | null; fim_s: number | null; youtube_url: string }
  procedencia: { fonte: string; flags: string[] }
  catalogo?: { tipo?: string | null; vendedores?: string[]; animais?: AnimalCatalogo[] }
  artefatos: Artefato[]
}

interface ResponseData {
  items: Lote[]
  next_cursor: number | null
  total: number
  summary: { total: number; com_imagem: number; vendidos: number; revisar: number }
  facets: { leiloes: Array<{ video_id: string; titulo: string; total: number }> }
}

type ViewMode = 'cards' | 'table'
type ImageFilter = 'all' | 'with' | 'without'
type ReviewFilter = 'all' | 'review' | 'approved'

function brl(value: number | null | undefined): string {
  if (value == null) return 'Valor não confirmado'
  return value.toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  })
}

function confidence(value: number | null | undefined): number {
  return Math.round(Math.max(0, Math.min(1, Number(value || 0))) * 100)
}

function formatTime(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(Number(seconds || 0)))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

function frameUrl(lote: Lote): string | null {
  const artifact = lote.artefatos.find((item) => item.tipo === 'frame') || lote.artefatos[0]
  return artifact ? `/api/sistema/ia/leiloes/lotes/imagem/${artifact.id}` : null
}

function statusLabel(lote: Lote): { label: string; cls: string } {
  if ((lote.motivo || '').toUpperCase() === 'NAO_VENDIDO') {
    return { label: 'Não vendido', cls: 'border-gray-500/25 bg-gray-500/10 text-gray-400' }
  }
  return { label: 'Vendido', cls: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500' }
}

export default function LotesCatalogoClient() {
  const [data, setData] = useState<ResponseData | null>(null)
  const [items, setItems] = useState<Lote[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [auction, setAuction] = useState('')
  const [status, setStatus] = useState('')
  const [imageFilter, setImageFilter] = useState<ImageFilter>('all')
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all')
  const [minConfidence, setMinConfidence] = useState('')
  const [view, setView] = useState<ViewMode>('cards')
  const [selected, setSelected] = useState<Lote | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const buildQuery = useCallback((cursor?: number | null) => {
    const query = new URLSearchParams({ limit: '60' })
    if (debouncedSearch) query.set('q', debouncedSearch)
    if (auction) query.set('video_id', auction)
    if (status) query.set('motivo', status)
    if (imageFilter !== 'all') query.set('has_image', String(imageFilter === 'with'))
    if (reviewFilter !== 'all') query.set('review', String(reviewFilter === 'review'))
    if (minConfidence) query.set('min_confidence', minConfidence)
    if (cursor) query.set('cursor', String(cursor))
    return query
  }, [auction, debouncedSearch, imageFilter, minConfidence, reviewFilter, status])

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/sistema/ia/leiloes/lotes?${buildQuery()}`, {
          cache: 'no-store', signal: controller.signal,
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || `Erro ${response.status}`)
        setData(body as ResponseData)
        setItems((body as ResponseData).items)
      } catch (cause) {
        if ((cause as Error).name !== 'AbortError') setError((cause as Error).message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [buildQuery, refreshKey])

  async function loadMore() {
    if (!data?.next_cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const response = await fetch(`/api/sistema/ia/leiloes/lotes?${buildQuery(data.next_cursor)}`, {
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `Erro ${response.status}`)
      const next = body as ResponseData
      setItems((current) => [...current, ...next.items])
      setData((current) => current ? { ...next, summary: current.summary, facets: current.facets, total: current.total } : next)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }

  const summary = data?.summary || { total: 0, com_imagem: 0, vendidos: 0, revisar: 0 }
  const imageCoverage = summary.total ? Math.round((summary.com_imagem / summary.total) * 100) : 0
  const activeFilters = useMemo(() => [
    debouncedSearch, auction, status, imageFilter !== 'all',
    reviewFilter !== 'all', minConfidence,
  ].filter(Boolean).length, [auction, debouncedSearch, imageFilter, minConfidence, reviewFilter, status])

  function clearFilters() {
    setSearch(''); setAuction(''); setStatus(''); setImageFilter('all')
    setReviewFilter('all'); setMinConfidence('')
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-[#A68B4B]/20 bg-white px-5 py-6 dark:bg-[#111111] lg:px-7 lg:py-7">
        <div className="pointer-events-none absolute -right-14 -top-24 h-64 w-64 rounded-full bg-[#A68B4B]/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#A68B4B]/25 bg-[#A68B4B]/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A68B4B]">
              <Images size={12} /> Acervo visual auditável
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-3xl">Galeria inteligente de lotes</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">
              Navegue pelos lotes identificados, confira o frame do momento da venda e valide cada informação contra a evidência da transmissão e o catálogo oficial.
            </p>
          </div>
          <button
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#B89A57] px-4 py-2.5 text-xs font-semibold text-black transition hover:bg-[#C8A96E] disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar galeria
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric icon={Tag} label="Lotes catalogados" value={summary.total.toLocaleString('pt-BR')} helper="na seleção atual" />
        <Metric icon={ImageIcon} label="Cobertura visual" value={`${imageCoverage}%`} helper={`${summary.com_imagem} com frame`} tone="gold" />
        <Metric icon={CheckCircle2} label="Vendidos" value={summary.vendidos.toLocaleString('pt-BR')} helper="com fechamento detectado" tone="emerald" />
        <Metric icon={ShieldCheck} label="Pedem revisão" value={summary.revisar.toLocaleString('pt-BR')} helper="evidência ou confiança baixa" tone="amber" />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#292929] dark:bg-[#121212] lg:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar lote, animal, comprador, vendedor ou leilão"
              aria-label="Buscar lotes"
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-xs text-gray-800 outline-none transition focus:border-[#A68B4B]/60 focus:bg-white dark:border-[#303030] dark:bg-[#191919] dark:text-gray-100 dark:focus:bg-[#171717]"
            />
          </label>
          <Select value={auction} onChange={setAuction} label="Todos os leilões">
            {(data?.facets.leiloes || []).map((item) => (
              <option key={item.video_id} value={item.video_id}>{item.titulo} ({item.total})</option>
            ))}
          </Select>
          <Select value={status} onChange={setStatus} label="Todos os status">
            <option value="VENDIDO">Vendidos</option>
            <option value="NAO_VENDIDO">Não vendidos</option>
          </Select>
          <Select value={imageFilter === 'all' ? '' : imageFilter} onChange={(value) => setImageFilter((value || 'all') as ImageFilter)} label="Com ou sem imagem">
            <option value="with">Com frame</option>
            <option value="without">Sem frame</option>
          </Select>
          <Select value={reviewFilter === 'all' ? '' : reviewFilter} onChange={(value) => setReviewFilter((value || 'all') as ReviewFilter)} label="Toda a qualidade">
            <option value="review">Pede revisão</option>
            <option value="approved">Conferência simples</option>
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-[#242424]">
          <div className="flex flex-wrap items-center gap-2">
            <Filter size={14} className="text-[#A68B4B]" />
            <button onClick={() => setMinConfidence(minConfidence === '0.85' ? '' : '0.85')} className={`rounded-lg border px-2.5 py-1.5 text-[11px] transition ${minConfidence === '0.85' ? 'border-[#A68B4B]/50 bg-[#A68B4B]/10 text-[#A68B4B]' : 'border-gray-200 text-gray-500 dark:border-[#303030] dark:text-gray-400'}`}>Alta confiança</button>
            {activeFilters > 0 && <button onClick={clearFilters} className="text-[11px] font-medium text-red-400 hover:text-red-500">Limpar {activeFilters} filtro(s)</button>}
          </div>
          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-[#303030] dark:bg-[#191919]">
            <ViewButton active={view === 'cards'} onClick={() => setView('cards')} icon={LayoutGrid} label="Cards" />
            <ViewButton active={view === 'table'} onClick={() => setView('table')} icon={Table2} label="Tabela" />
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          <span className="flex items-center gap-2"><AlertTriangle size={16} /> {error}</span>
          <button onClick={() => setRefreshKey((value) => value + 1)} className="text-xs font-semibold">Tentar novamente</button>
        </div>
      )}

      {loading ? <GallerySkeleton /> : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-16 text-center dark:border-[#343434] dark:bg-[#121212]">
          <Beef size={36} className="mx-auto text-[#A68B4B]/60" />
          <h2 className="mt-3 font-semibold text-gray-900 dark:text-white">Nenhum lote neste recorte</h2>
          <p className="mt-1 text-xs text-gray-400">Ajuste os filtros ou aguarde a próxima extração da VPS.</p>
        </div>
      ) : view === 'cards' ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((lote) => <LotCard key={lote.id} lote={lote} onOpen={() => setSelected(lote)} />)}
        </div>
      ) : <LotsTable items={items} onOpen={setSelected} />}

      {data?.next_cursor && !loading && (
        <div className="flex justify-center">
          <button onClick={loadMore} disabled={loadingMore} className="inline-flex items-center gap-2 rounded-xl border border-[#A68B4B]/30 bg-[#A68B4B]/5 px-5 py-2.5 text-xs font-semibold text-[#A68B4B] transition hover:bg-[#A68B4B]/10 disabled:opacity-50">
            {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />} Carregar mais lotes
          </button>
        </div>
      )}

      {selected && <LotDetail lote={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function Metric({ icon: Icon, label, value, helper, tone = 'default' }: {
  icon: React.ElementType; label: string; value: string; helper: string; tone?: string
}) {
  const tones: Record<string, string> = {
    default: 'text-gray-900 dark:text-white', gold: 'text-[#B89A57]',
    emerald: 'text-emerald-500', amber: 'text-amber-500',
  }
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#292929] dark:bg-[#121212]">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400"><Icon size={14} className="text-[#A68B4B]" /> {label}</div>
      <div className={`mt-2 text-2xl font-bold ${tones[tone] || tones.default}`}>{value}</div>
      <p className="mt-1 text-[11px] text-gray-400">{helper}</p>
    </div>
  )
}

function Select({ value, onChange, label, children }: {
  value: string; onChange: (value: string) => void; label: string; children: React.ReactNode
}) {
  return (
    <label className="relative">
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="h-11 min-w-40 appearance-none rounded-xl border border-gray-200 bg-gray-50 pl-3 pr-9 text-xs text-gray-600 outline-none focus:border-[#A68B4B]/60 dark:border-[#303030] dark:bg-[#191919] dark:text-gray-300">
        <option value="">{label}</option>{children}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
    </label>
  )
}

function ViewButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition ${active ? 'bg-white text-[#A68B4B] shadow-sm dark:bg-[#272727]' : 'text-gray-400'}`}><Icon size={13} /> {label}</button>
}

function LotCard({ lote, onOpen }: { lote: Lote; onOpen: () => void }) {
  const image = frameUrl(lote)
  const status = statusLabel(lote)
  const conf = confidence(lote.confianca)
  const animal = lote.nome_animal || lote.catalogo?.animais?.[0]?.nome || `Lote ${lote.numero_lote || 'sem número'}`
  return (
    <article className="group overflow-hidden rounded-2xl border border-gray-200 bg-white transition hover:-translate-y-0.5 hover:border-[#A68B4B]/40 hover:shadow-lg dark:border-[#292929] dark:bg-[#121212]">
      <div className="relative aspect-video overflow-hidden bg-[#171717]">
        {image ? (
          <Image unoptimized width={640} height={360} src={image} alt={`Frame do lote ${lote.numero_lote || ''}`} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top_right,rgba(184,154,87,.20),transparent_45%)] text-center">
            <ImageIcon size={28} className="text-[#A68B4B]/55" />
            <span className="mt-2 text-[11px] text-gray-500">Frame ainda não disponível</span>
            <span className="mt-0.5 text-[9px] text-gray-600">somente timestamps confirmados geram imagem</span>
          </div>
        )}
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="rounded-lg bg-black/80 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">LOTE {lote.numero_lote || '—'}</span>
          <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold backdrop-blur ${status.cls}`}>{status.label}</span>
        </div>
        {lote.review_required && <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-black/75 px-2 py-1 text-[9px] font-semibold text-amber-400"><AlertTriangle size={10} /> Revisar</span>}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A68B4B]">{lote.leilao.titulo || lote.video_id}</p>
            <h2 className="mt-1 truncate text-base font-semibold text-gray-950 dark:text-white">{animal}</h2>
            <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-gray-400">{lote.descricao_lote || lote.catalogo?.tipo || 'Descrição pendente de confirmação.'}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold text-gray-900 dark:text-white">{brl(lote.valor_parcela || lote.valor_final)}</p>
            {lote.total_parcelas && <p className="text-[9px] text-gray-400">{lote.total_parcelas} parcelas</p>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Info icon={Warehouse} label="Vendedor" value={lote.vendedor || lote.catalogo?.vendedores?.join(', ') || 'Não confirmado'} />
          <Info icon={UserRound} label="Comprador" value={lote.comprador || 'Não informado'} />
        </div>
        <div className="mt-4 border-t border-gray-100 pt-3 dark:border-[#252525]">
          <div className="flex items-center justify-between text-[10px]"><span className="text-gray-400">Confiança da evidência</span><span className={conf >= 80 ? 'text-emerald-500' : conf >= 60 ? 'text-amber-500' : 'text-red-400'}>{conf}%</span></div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-[#272727]"><div className={`h-full rounded-full ${conf >= 80 ? 'bg-emerald-500' : conf >= 60 ? 'bg-amber-500' : 'bg-red-400'}`} style={{ width: `${conf}%` }} /></div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={onOpen} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 px-3 py-2.5 text-[11px] font-semibold text-white transition hover:bg-black dark:bg-white dark:text-black"><Eye size={13} /> Ver ficha completa</button>
          {lote.evidencia.youtube_url && <a href={lote.evidencia.youtube_url} target="_blank" rel="noreferrer" title="Abrir no momento da evidência" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-400 transition hover:border-[#A68B4B]/50 hover:text-[#A68B4B] dark:border-[#303030]"><ExternalLink size={14} /></a>}
        </div>
      </div>
    </article>
  )
}

function Info({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return <div className="min-w-0 rounded-xl bg-gray-50 px-3 py-2 dark:bg-[#191919]"><div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-gray-400"><Icon size={10} /> {label}</div><p className="mt-1 truncate text-[11px] font-medium text-gray-700 dark:text-gray-200">{value}</p></div>
}

function LotsTable({ items, onOpen }: { items: Lote[]; onOpen: (lote: Lote) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#292929] dark:bg-[#121212]">
      <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left"><thead className="border-b border-gray-200 bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400 dark:border-[#292929] dark:bg-[#171717]"><tr><th className="px-4 py-3">Imagem</th><th className="px-4 py-3">Lote / animal</th><th className="px-4 py-3">Leilão</th><th className="px-4 py-3">Comprador</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3">Confiança</th><th className="px-4 py-3" /></tr></thead>
        <tbody className="divide-y divide-gray-100 dark:divide-[#252525]">{items.map((lote) => { const image = frameUrl(lote); return <tr key={lote.id} className="text-xs text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-[#171717]"><td className="px-4 py-3">{image ? <Image unoptimized width={80} height={48} src={image} alt="" className="h-12 w-20 rounded-lg object-cover" /> : <div className="flex h-12 w-20 items-center justify-center rounded-lg bg-gray-100 dark:bg-[#202020]"><ImageIcon size={16} className="text-gray-400" /></div>}</td><td className="px-4 py-3"><p className="font-semibold text-gray-900 dark:text-white">Lote {lote.numero_lote || '—'}</p><p className="mt-0.5 max-w-52 truncate text-[11px] text-gray-400">{lote.nome_animal || lote.descricao_lote || 'Sem descrição'}</p></td><td className="px-4 py-3"><p className="max-w-52 truncate">{lote.leilao.titulo || lote.video_id}</p><p className="text-[10px] text-gray-400">{lote.leilao.canal}</p></td><td className="px-4 py-3">{lote.comprador || '—'}</td><td className="px-4 py-3 font-semibold">{brl(lote.valor_parcela || lote.valor_final)}</td><td className="px-4 py-3">{confidence(lote.confianca)}%</td><td className="px-4 py-3"><button onClick={() => onOpen(lote)} className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:text-[#A68B4B] dark:border-[#303030]"><Eye size={14} /></button></td></tr> })}</tbody></table></div>
    </div>
  )
}

function LotDetail({ lote, onClose }: { lote: Lote; onClose: () => void }) {
  const image = frameUrl(lote)
  const animals = lote.catalogo?.animais || []
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-end bg-black/65 backdrop-blur-sm sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-label={`Ficha do lote ${lote.numero_lote || ''}`} className="max-h-[96vh] w-full overflow-y-auto rounded-t-3xl border border-gray-200 bg-white shadow-2xl dark:border-[#303030] dark:bg-[#111111] sm:max-w-2xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-[#292929] dark:bg-[#111111]/95"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A68B4B]">Ficha auditável</p><h2 className="text-lg font-bold text-gray-950 dark:text-white">Lote {lote.numero_lote || 'sem número confirmado'}</h2></div><button onClick={onClose} className="rounded-xl border border-gray-200 p-2 text-gray-400 hover:text-gray-900 dark:border-[#303030] dark:hover:text-white"><X size={17} /></button></div>
        <div className="space-y-5 p-5">
          <div className="overflow-hidden rounded-2xl bg-[#181818]">{image ? <Image unoptimized width={640} height={360} src={image} alt={`Frame do lote ${lote.numero_lote || ''}`} className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center"><ImageIcon size={34} className="text-[#A68B4B]/50" /></div>}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><Detail label="Animal / oferta" value={lote.nome_animal || lote.descricao_lote || 'Não confirmado'} /><Detail label="Valor por parcela" value={brl(lote.valor_parcela || lote.valor_final)} /><Detail label="Parcelamento" value={lote.total_parcelas ? `${lote.total_parcelas} parcelas` : 'Não informado'} /><Detail label="Vendedor" value={lote.vendedor || lote.catalogo?.vendedores?.join(', ') || 'Não confirmado'} /><Detail label="Comprador" value={lote.comprador || 'Não informado'} /><Detail label="Assessoria" value={lote.assessoria_comprador || lote.assessoria || 'Não informada'} /></div>
          {animals.length > 0 && <section className="rounded-2xl border border-[#A68B4B]/20 bg-[#A68B4B]/5 p-4"><h3 className="text-xs font-semibold text-[#A68B4B]">Referência do catálogo oficial</h3><div className="mt-3 space-y-2">{animals.map((animal, index) => <div key={`${animal.rgn || animal.nome}-${index}`} className="rounded-xl bg-white/70 p-3 text-xs dark:bg-[#171717]"><p className="font-semibold text-gray-900 dark:text-white">{animal.nome || animal.rgn || animal.siu || `Animal ${index + 1}`}</p><p className="mt-1 text-[10px] leading-4 text-gray-500">{[animal.rgn && `RGN ${animal.rgn}`, animal.nascimento && `Nasc. ${animal.nascimento}`, animal.pai && `Pai ${animal.pai}`, animal.mae && `Mãe ${animal.mae}`, animal.reprodutivo].filter(Boolean).join(' • ')}</p></div>)}</div></section>}
          <section className="rounded-2xl border border-gray-200 p-4 dark:border-[#303030]"><div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold text-gray-900 dark:text-white">Evidência da transmissão</h3>{lote.evidencia.inicio_s != null && <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] text-gray-500 dark:bg-[#222]">{formatTime(lote.evidencia.inicio_s)}</span>}</div><p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">{lote.evidencia.texto || 'Nenhum trecho foi validado para este lote. O registro deve permanecer em revisão.'}</p>{lote.evidencia.youtube_url && <a href={lote.evidencia.youtube_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#A68B4B] hover:underline"><ExternalLink size={13} /> Conferir no YouTube</a>}</section>
          {lote.procedencia.flags.length > 0 && <section><h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Sinais de QA</h3><div className="mt-2 flex flex-wrap gap-2">{lote.procedencia.flags.map((flag) => <span key={flag} className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10px] text-amber-500">{flag.replaceAll('_', ' ')}</span>)}</div></section>}
        </div>
      </section>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-gray-50 p-3 dark:bg-[#191919]"><p className="text-[9px] uppercase tracking-wide text-gray-400">{label}</p><p className="mt-1 text-xs font-medium text-gray-800 dark:text-gray-100">{value}</p></div>
}

function GallerySkeleton() {
  return <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#292929] dark:bg-[#121212]"><div className="aspect-video animate-pulse bg-gray-100 dark:bg-[#1b1b1b]" /><div className="space-y-3 p-4"><div className="h-3 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-[#222]" /><div className="h-5 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-[#222]" /><div className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-[#1b1b1b]" /></div></div>)}</div>
}
