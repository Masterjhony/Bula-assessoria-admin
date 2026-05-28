'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  DollarSign, BarChart3, Percent, Hash, TrendingUp, ShoppingCart,
  MapPin, Briefcase, Activity, Eye, Star,
} from 'lucide-react'
import { normalizeAssessorNome } from '@/lib/assessor-normalize'

// Shape mínimo consumido pelo bloco — qualquer Fechamento completo
// (vide FechamentoView.Fechamento) atende esta interface.
export type FechamentoAnalyticsItem = {
  id: string
  nome: string
  data: string
  vgv_total: number
  lotes_ofertados: number
  lotes_vendidos: number
  animais_vendidos: number
  por_assessor: Array<{ nome: string; empresa?: string | null; vgv: number; transacoes: number; animais: number }>
  por_estado: Array<{ uf: string; vgv: number; lotes: number; animais: number }>
  compradores: Array<{ fazenda: string; cidade?: string | null; uf?: string | null; vgv: number; lotes: number; animais: number }>
}

// ── Helpers ──────────────────────────────────────────────────

const R = (v: number | null | undefined) =>
  v ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : 'R$ —'

const MES: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun',
  '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
}
function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return { dia: Number(d), mes: MES[m] ?? m, ano: y, full: `${Number(d)} ${MES[m] ?? m} ${y}` }
}
function coveragePct(vendidos: number, ofertados: number) {
  if (!ofertados) return 0
  return Math.round((vendidos / ofertados) * 100)
}
function fmtCompact(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`
  if (v >= 1_000) return `R$ ${Math.round(v / 1_000)}K`
  return `R$ ${v}`
}

// ── KPI Card ─────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, gold }: {
  icon: React.ElementType; label: string; value: string; sub?: string; gold?: boolean
}) {
  return (
    <div className={`relative rounded-2xl border px-5 py-4 overflow-hidden transition-all hover:shadow-md
      ${gold
        ? 'border-[#A68B4B]/30 bg-gradient-to-br from-[#A68B4B]/12 to-[#A68B4B]/4 hover:shadow-[#A68B4B]/10'
        : 'border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] hover:border-gray-200 dark:hover:border-[#333]'}`}>
      <div className="flex items-center gap-2 mb-2.5">
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0
          ${gold ? 'bg-[#A68B4B]/15 text-[#A68B4B]' : 'bg-gray-50 dark:bg-[#1A1A1A] text-gray-400'}`}>
          <Icon size={12} />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      </div>
      <p className={`text-2xl font-black leading-none ${gold ? 'text-[#A68B4B]' : 'text-gray-900 dark:text-white'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-1.5">{sub}</p>}
    </div>
  )
}

// ── Insights Section ─────────────────────────────────────────

function InsightsSection({ items }: { items: FechamentoAnalyticsItem[] }) {
  const data = useMemo(() => {
    if (items.length < 2) return null

    const sorted = [...items].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
    const maxVgv = Math.max(...sorted.map(f => f.vgv_total), 1)
    const maxIdx = sorted.findIndex(f => f.vgv_total === maxVgv)

    // Aggregate by Fazenda (compradores)
    const compradorMap = new Map<string, { vgv: number; lotes: number; animais: number; cidade: string; uf: string; leiloes: number }>()
    items.forEach(f => {
      (f.compradores ?? []).forEach(c => {
        if (!c.fazenda) return
        const key = c.fazenda
        const cur = compradorMap.get(key) ?? { vgv: 0, lotes: 0, animais: 0, cidade: '', uf: '', leiloes: 0 }
        cur.vgv += c.vgv
        cur.lotes += c.lotes
        cur.animais += c.animais
        cur.leiloes += 1
        if (c.cidade && !cur.cidade) cur.cidade = c.cidade
        if (c.uf && !cur.uf) cur.uf = c.uf
        compradorMap.set(key, cur)
      })
    })
    const topCompradores = [...compradorMap.entries()].sort((a, b) => b[1].vgv - a[1].vgv).slice(0, 5)
    const totalCompradoresVgv = [...compradorMap.values()].reduce((s, d) => s + d.vgv, 0)
    const maxCVgv = topCompradores.length ? topCompradores[0][1].vgv : 1

    // Geographic spread
    const estadoMap = new Map<string, { vgv: number; lotes: number; animais: number }>()
    items.forEach(f => {
      (f.por_estado ?? []).forEach(e => {
        if (!e.uf) return
        const cur = estadoMap.get(e.uf) ?? { vgv: 0, lotes: 0, animais: 0 }
        cur.vgv += e.vgv
        cur.lotes += e.lotes
        cur.animais += e.animais
        estadoMap.set(e.uf, cur)
      })
    })
    const topEstados = [...estadoMap.entries()].sort((a, b) => b[1].vgv - a[1].vgv).slice(0, 6)
    const totalEstadoVgv = [...estadoMap.values()].reduce((s, d) => s + d.vgv, 0)

    // Aggregate by Assessor
    const assessorMap = new Map<string, { nome: string; empresa: string; vgv: number; transacoes: number; animais: number; leiloes: number }>()
    items.forEach(f => {
      const seenInLeilao = new Set<string>()
      ;(f.por_assessor ?? []).forEach(a => {
        const canon = normalizeAssessorNome(a.nome)
        if (!canon) return
        const cur = assessorMap.get(canon) ?? { nome: canon, empresa: a.empresa || '', vgv: 0, transacoes: 0, animais: 0, leiloes: 0 }
        cur.vgv += a.vgv
        cur.transacoes += a.transacoes
        cur.animais += a.animais
        if (!seenInLeilao.has(canon)) {
          cur.leiloes += 1
          seenInLeilao.add(canon)
        }
        if (!cur.empresa && a.empresa) cur.empresa = a.empresa
        assessorMap.set(canon, cur)
      })
    })
    const topAssessores = [...assessorMap.values()].sort((a, b) => b.vgv - a.vgv).slice(0, 5)
    const totalAssessorVgv = [...assessorMap.values()].reduce((s, d) => s + d.vgv, 0)
    const maxAVgv = topAssessores[0]?.vgv || 1

    // Cobertura por leilão (chronological)
    const cobertura = sorted.map(f => ({
      nome: f.nome,
      data: f.data,
      pct: coveragePct(f.lotes_vendidos, f.lotes_ofertados),
      vendidos: f.lotes_vendidos,
      ofertados: f.lotes_ofertados,
    }))
    const totalOfertados = items.reduce((s, f) => s + f.lotes_ofertados, 0)
    const totalVendidos = items.reduce((s, f) => s + f.lotes_vendidos, 0)
    const coberturaMedia = totalOfertados > 0 ? Math.round((totalVendidos / totalOfertados) * 100) : 0
    const coberturaAvgSimple = cobertura.length > 0
      ? Math.round(cobertura.reduce((s, c) => s + c.pct, 0) / cobertura.length)
      : 0
    const coberturaMin = cobertura.length ? Math.min(...cobertura.map(c => c.pct)) : 0
    const coberturaMax = cobertura.length ? Math.max(...cobertura.map(c => c.pct)) : 0

    return {
      sorted, maxVgv, maxIdx,
      topCompradores, totalCompradoresVgv, maxCVgv,
      topEstados, totalEstadoVgv,
      topAssessores, totalAssessorVgv, maxAVgv,
      cobertura, coberturaMedia, coberturaAvgSimple, coberturaMin, coberturaMax,
      totalVendidos, totalOfertados,
    }
  }, [items])

  if (!data) return null
  const {
    sorted, maxVgv, maxIdx,
    topCompradores, totalCompradoresVgv, maxCVgv,
    topEstados, totalEstadoVgv,
    topAssessores, totalAssessorVgv, maxAVgv,
    cobertura, coberturaMedia, coberturaAvgSimple, coberturaMin, coberturaMax,
    totalVendidos, totalOfertados,
  } = data

  return (
    <div className="space-y-4">

      {/* Vendas por leilão — full width (VGV bars) */}
      <div className="rounded-2xl border border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] p-5">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white">Vendas por leilão</p>
            <p className="text-[10px] text-gray-400 mt-0.5">VGV por evento · cor indica cobertura</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-[#A68B4B]/10 text-[#A68B4B] font-bold">
              {sorted.length} leilões
            </span>
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
              Total {R(sorted.reduce((s, f) => s + f.vgv_total, 0))}
            </span>
          </div>
        </div>

        <div className="relative h-44 pl-14">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-7 w-12 flex flex-col justify-between text-[9px] text-gray-400 font-semibold pointer-events-none text-right pr-2">
            <span>{fmtCompact(maxVgv)}</span>
            <span>{fmtCompact(maxVgv * 0.75)}</span>
            <span>{fmtCompact(maxVgv * 0.5)}</span>
            <span>{fmtCompact(maxVgv * 0.25)}</span>
            <span className="text-gray-300 dark:text-gray-600">0</span>
          </div>
          {/* Grid lines */}
          <div className="absolute left-14 right-0 top-0 bottom-7 flex flex-col justify-between pointer-events-none">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="w-full border-t border-dashed border-gray-100 dark:border-[#2A2A2A]" />
            ))}
          </div>
          {/* Bars */}
          <div className="relative flex items-end gap-2 h-full pb-7">
            {sorted.map((f, i) => {
              const pct = coveragePct(f.lotes_vendidos, f.lotes_ofertados)
              const barH = Math.max((f.vgv_total / maxVgv) * 100, 1.5)
              const dt = fmtDate(f.data)
              const color = pct >= 60 ? '#22c55e' : pct >= 30 ? '#A68B4B' : '#ef4444'
              const isMax = i === maxIdx
              const isFirst = i === 0
              const isLast = i === sorted.length - 1
              const tooltipPos = isFirst ? 'left-0' : isLast ? 'right-0' : 'left-1/2 -translate-x-1/2'
              return (
                <div key={f.id} className="flex flex-col justify-end h-full flex-1 min-w-0 group relative">
                  {/* Tooltip */}
                  <div className={`absolute bottom-full mb-1.5 bg-gray-900 dark:bg-[#0D0D0D] border border-gray-700 text-white text-[9px] rounded-xl px-3 py-2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none z-30 shadow-2xl ${tooltipPos}`}>
                    <p className="font-bold text-[#A68B4B] text-[11px]">{R(f.vgv_total)}</p>
                    <p className="text-gray-200 mt-1 max-w-[200px] truncate font-semibold">{f.nome}</p>
                    <div className="flex items-center gap-3 mt-1 text-gray-400">
                      <span>{f.lotes_vendidos}/{f.lotes_ofertados} lotes</span>
                      <span className="font-bold" style={{ color }}>{pct}%</span>
                      <span>{f.animais_vendidos} an.</span>
                    </div>
                  </div>
                  {/* Star marker on max */}
                  {isMax && (
                    <Star
                      size={12}
                      className="absolute text-[#A68B4B] fill-[#A68B4B] z-10 left-1/2 -translate-x-1/2 drop-shadow-md"
                      style={{ bottom: `calc(${barH}% + 4px)` }}
                    />
                  )}
                  {/* Bar */}
                  <div
                    className="w-full rounded-t-lg transition-all duration-500 group-hover:brightness-125 cursor-pointer relative overflow-hidden"
                    style={{
                      height: `${barH}%`,
                      background: `linear-gradient(to top, ${color}99, ${color})`,
                      minHeight: 2,
                      boxShadow: isMax
                        ? `0 0 0 1.5px ${color}66, 0 -3px 12px ${color}44`
                        : `inset 0 -1px 0 ${color}66`,
                    }}
                  >
                    {/* Subtle shine */}
                    <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/20 to-transparent rounded-t-lg" />
                  </div>
                  {/* Date label */}
                  <span className="absolute -bottom-5 left-0 right-0 text-[9px] text-gray-400 font-semibold truncate text-center">
                    {dt.dia}/{dt.mes.slice(0, 3)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 mt-3 pt-3 border-t border-gray-50 dark:border-[#262626] flex-wrap">
          <div className="flex gap-3 flex-wrap">
            {[
              { color: '#22c55e', label: '≥ 60% cobertura' },
              { color: '#A68B4B', label: '30–59%' },
              { color: '#ef4444', label: '< 30%' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[10px] text-gray-400">{label}</span>
              </div>
            ))}
          </div>
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <Star size={10} className="text-[#A68B4B] fill-[#A68B4B]" /> melhor resultado
          </span>
        </div>
      </div>

      {/* Cobertura média — full width line chart */}
      <div className="rounded-2xl border border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] p-5">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white">Cobertura média</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Lotes vendidos / ofertados por leilão</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Mín</p>
              <p className="text-sm font-black text-gray-700 dark:text-gray-300 tabular-nums">{coberturaMin}%</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Média</p>
              <p className="text-2xl font-black text-[#A68B4B] tabular-nums leading-none">{coberturaMedia}%</p>
              <p className="text-[9px] text-gray-500 tabular-nums mt-0.5">{totalVendidos}/{totalOfertados} lotes</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Máx</p>
              <p className="text-sm font-black text-gray-700 dark:text-gray-300 tabular-nums">{coberturaMax}%</p>
            </div>
          </div>
        </div>

        {/* Line chart of cobertura over time */}
        <div className="relative h-32 pl-12">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-7 w-10 flex flex-col justify-between text-[9px] text-gray-400 font-semibold pointer-events-none text-right pr-2 tabular-nums">
            <span>100%</span>
            <span>75%</span>
            <span>50%</span>
            <span>25%</span>
            <span className="text-gray-300 dark:text-gray-600">0%</span>
          </div>
          {/* Grid lines */}
          <div className="absolute left-10 right-0 top-0 bottom-7 flex flex-col justify-between pointer-events-none">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="w-full border-t border-dashed border-gray-100 dark:border-[#2A2A2A]" />
            ))}
          </div>
          {/* Average reference line */}
          <div
            className="absolute left-10 right-0 pointer-events-none flex items-center"
            style={{ bottom: `${28 + ((coberturaAvgSimple / 100) * 100) * 0.95}%` }}
          >
            <div className="flex-1 border-t-2 border-dashed border-[#A68B4B]/40" />
            <span className="ml-1 text-[8px] font-bold tabular-nums text-[#A68B4B] bg-white dark:bg-[#141414] px-1.5 -translate-y-1/2">
              {coberturaAvgSimple}% méd
            </span>
          </div>
          {/* SVG Line */}
          <svg className="absolute left-10 right-0 top-0 bottom-7 w-[calc(100%-2.5rem)] h-[calc(100%-1.75rem)]" preserveAspectRatio="none" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="cob-grad-dashboard" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#A68B4B" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#A68B4B" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {(() => {
              const N = cobertura.length
              if (N === 0) return null
              const pts = cobertura.map((c, i) => ({
                x: N === 1 ? 50 : (i / (N - 1)) * 100,
                y: 100 - c.pct,
              }))
              let line = ''
              pts.forEach((p, i) => {
                if (i === 0) { line = `M ${p.x} ${p.y}`; return }
                const pr = pts[i - 1]
                const cx1 = pr.x + (p.x - pr.x) * 0.5
                const cx2 = p.x - (p.x - pr.x) * 0.5
                line += ` C ${cx1} ${pr.y}, ${cx2} ${p.y}, ${p.x} ${p.y}`
              })
              const area = `${line} L ${pts[N - 1].x} 100 L ${pts[0].x} 100 Z`
              return (
                <>
                  <path d={area} fill="url(#cob-grad-dashboard)" vectorEffect="non-scaling-stroke" />
                  <path d={line} fill="none" stroke="#A68B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </>
              )
            })()}
          </svg>
          {/* Markers (HTML overlay so dots stay round) */}
          <div className="absolute left-10 right-0 top-0 bottom-7 pointer-events-none">
            {cobertura.map((c, i) => {
              const N = cobertura.length
              const xPct = N === 1 ? 50 : (i / (N - 1)) * 100
              const yPct = 100 - c.pct
              const dotColor = c.pct >= 60 ? '#22c55e' : c.pct >= 30 ? '#A68B4B' : '#ef4444'
              return (
                <div key={i} className="absolute group" style={{ left: `${xPct}%`, top: `${yPct}%`, transform: 'translate(-50%, -50%)' }}>
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#1d1d1d] pointer-events-auto cursor-pointer transition-transform hover:scale-150" style={{ backgroundColor: dotColor }} />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-900 dark:bg-[#0D0D0D] border border-gray-700 text-white text-[9px] rounded-lg px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-xl">
                    <p className="font-bold text-[#A68B4B]">{c.pct}%</p>
                    <p className="text-gray-300 max-w-[160px] truncate">{c.nome}</p>
                    <p className="text-gray-500 tabular-nums">{c.vendidos}/{c.ofertados}</p>
                  </div>
                </div>
              )
            })}
          </div>
          {/* X-axis labels */}
          <div className="absolute left-10 right-0 bottom-0 h-6 flex items-start justify-between text-[9px] text-gray-400 font-semibold tabular-nums">
            {cobertura.map((c, i) => {
              const showLabel = i === 0 || i === cobertura.length - 1 || i % Math.max(Math.floor(cobertura.length / 6), 1) === 0
              if (!showLabel) return <span key={i} className="invisible">·</span>
              const dt = fmtDate(c.data)
              return <span key={i}>{dt.dia}/{dt.mes.slice(0, 3)}</span>
            })}
          </div>
        </div>
      </div>

      {/* Compradores + Estados */}
      <div className="grid lg:grid-cols-[3fr_2fr] gap-4">

        {/* Top Compradores */}
        <div className="rounded-2xl border border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white">Top Compradores</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Fazendas com maior volume · todos os leilões</p>
            </div>
            <ShoppingCart size={14} className="text-[#A68B4B]" />
          </div>

          {topCompradores.length === 0 ? (
            <p className="text-center text-gray-400 text-xs py-8">Nenhum comprador registrado</p>
          ) : (
            <div className="space-y-3">
              {topCompradores.map(([fazenda, d], i) => {
                const pctTotal = totalCompradoresVgv ? d.vgv / totalCompradoresVgv : 0
                return (
                  <div key={fazenda} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0
                          ${i === 0
                            ? 'bg-[#A68B4B] text-black shadow-md shadow-[#A68B4B]/40'
                            : i === 1
                              ? 'bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-100'
                              : i === 2
                                ? 'bg-amber-700 text-white'
                                : 'bg-gray-100 dark:bg-[#1A1A1A] text-gray-500 dark:text-gray-400'}`}>
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{fazenda}</p>
                          {(d.cidade || d.uf) && (
                            <p className="text-[9px] text-gray-400 flex items-center gap-1 truncate">
                              <MapPin size={8} />
                              {d.cidade}{d.cidade && d.uf ? ', ' : ''}{d.uf}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-xs font-black text-[#A68B4B] whitespace-nowrap flex-shrink-0">{R(d.vgv)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${(d.vgv / maxCVgv) * 100}%`,
                            background: i === 0 ? 'linear-gradient(90deg, #A68B4B, #C8A96E)' : '#A68B4B',
                            opacity: 1 - i * 0.13,
                          }}
                        />
                      </div>
                      <span className="text-[9px] text-gray-400 whitespace-nowrap flex-shrink-0 w-24 text-right tabular-nums">
                        {d.animais}an · {(pctTotal * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Distribuição Geográfica */}
        <div className="rounded-2xl border border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white">Distribuição por UF</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Estados alcançados</p>
            </div>
            <MapPin size={14} className="text-[#A68B4B]" />
          </div>

          {topEstados.length === 0 ? (
            <p className="text-center text-gray-400 text-xs py-8">Sem dados geográficos</p>
          ) : (
            <div className="space-y-2.5">
              {topEstados.map(([uf, d]) => {
                const pctTotal = totalEstadoVgv ? d.vgv / totalEstadoVgv : 0
                return (
                  <div key={uf} className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-[#A68B4B]/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-[#A68B4B] font-black text-[11px]">{uf}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
                          {d.lotes} lote{d.lotes !== 1 ? 's' : ''} · {d.animais} an.
                        </span>
                        <span className="text-xs font-black text-[#A68B4B] tabular-nums">{R(d.vgv)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pctTotal * 100}%`, background: '#A68B4B' }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Vendas por Assessor — full width ranking */}
      <div className="rounded-2xl border border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] p-5">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white">Vendas por assessor</p>
            <p className="text-[10px] text-gray-400 mt-0.5">VGV agregado por profissional · todos os leilões</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/sistema/leiloes/vendas-por-assessor"
              title="Ver relatório completo de Vendas por Assessor"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#A68B4B]/30 bg-[#A68B4B]/5 hover:bg-[#A68B4B]/15 hover:border-[#A68B4B]/60 text-[#A68B4B] transition-colors"
            >
              <Eye size={12} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Relatório</span>
            </Link>
            <Briefcase size={14} className="text-[#A68B4B]" />
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-[#A68B4B]/10 text-[#A68B4B] font-bold">
              {topAssessores.length} {topAssessores.length === 1 ? 'assessor' : 'assessores'}
            </span>
          </div>
        </div>

        {topAssessores.length === 0 ? (
          <p className="text-center text-gray-400 text-xs py-8">Nenhuma venda atribuída a assessor</p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(180px,1fr) minmax(120px,1fr) repeat(3, minmax(80px, auto))' }}>
              {/* Header */}
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Assessor</div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">VGV</div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 text-right">Trans.</div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 text-right">Animais</div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 text-right">Leilões</div>

              {/* Rows */}
              {topAssessores.map((a, i) => {
                const pctTotal = totalAssessorVgv ? a.vgv / totalAssessorVgv : 0
                const widthPct = (a.vgv / maxAVgv) * 100
                return (
                  <div key={a.nome} className="contents">
                    {/* Assessor */}
                    <div className="flex items-center gap-2.5 min-w-0 py-2.5 border-t border-gray-50 dark:border-[#262626]">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0
                        ${i === 0
                          ? 'bg-[#A68B4B] text-black shadow-md shadow-[#A68B4B]/40'
                          : i === 1
                            ? 'bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-100'
                            : i === 2
                              ? 'bg-amber-700 text-white'
                              : 'bg-gray-100 dark:bg-[#1A1A1A] text-gray-500 dark:text-gray-400'}`}>
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{a.nome}</p>
                        {a.empresa && (
                          <p className="text-[9px] text-gray-400 truncate uppercase tracking-wider">{a.empresa}</p>
                        )}
                      </div>
                    </div>
                    {/* VGV with bar */}
                    <div className="py-2.5 border-t border-gray-50 dark:border-[#262626] min-w-0 flex flex-col justify-center gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-[#A68B4B] tabular-nums whitespace-nowrap">{R(a.vgv)}</span>
                        <span className="text-[9px] text-gray-400 tabular-nums">{(pctTotal * 100).toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${widthPct}%`,
                            background: i === 0 ? 'linear-gradient(90deg, #A68B4B, #C8A96E)' : '#A68B4B',
                            opacity: 1 - i * 0.13,
                          }}
                        />
                      </div>
                    </div>
                    {/* Transações */}
                    <div className="py-2.5 border-t border-gray-50 dark:border-[#262626] flex items-center justify-end">
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-300 tabular-nums">{a.transacoes}</span>
                    </div>
                    {/* Animais */}
                    <div className="py-2.5 border-t border-gray-50 dark:border-[#262626] flex items-center justify-end">
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-300 tabular-nums">{a.animais}</span>
                    </div>
                    {/* Leilões */}
                    <div className="py-2.5 border-t border-gray-50 dark:border-[#262626] flex items-center justify-end">
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-300 tabular-nums">{a.leiloes}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer total */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-[#262626]">
              <span className="text-[10px] text-gray-500 flex items-center gap-1.5">
                <Activity size={10} className="text-[#A68B4B]" />
                Comissão e pagamento ficam restritos ao ERP
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">Total acumulado</span>
                <span className="text-sm font-black text-gray-900 dark:text-white tabular-nums">{R(totalAssessorVgv)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Block público ────────────────────────────────────────────

export function LeiloesAnalyticsBlock({ items }: { items: FechamentoAnalyticsItem[] }) {
  if (items.length === 0) return null

  const totalVgv = items.reduce((s, f) => s + (Number(f.vgv_total) || 0), 0)
  const totalAnimais = items.reduce((s, f) => s + (Number(f.animais_vendidos) || 0), 0)
  const totalLotesVendidos = items.reduce((s, f) => s + (Number(f.lotes_vendidos) || 0), 0)
  const totalLotesOfertados = items.reduce((s, f) => s + (Number(f.lotes_ofertados) || 0), 0)
  const coberturaMedia = totalLotesOfertados ? Math.round((totalLotesVendidos / totalLotesOfertados) * 100) : 0
  const ticketMedioGeral = totalAnimais ? Math.round(totalVgv / totalAnimais) : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={DollarSign} label="VGV Total" value={R(totalVgv)} gold />
        <KpiCard icon={BarChart3} label="Lotes Vendidos" value={`${totalLotesVendidos}/${totalLotesOfertados}`} />
        <KpiCard icon={Percent} label="Cobertura Média" value={`${coberturaMedia}%`} />
        <KpiCard icon={Hash} label="Animais Vendidos" value={totalAnimais.toLocaleString('pt-BR')} />
        <KpiCard icon={TrendingUp} label="Ticket Médio Geral" value={R(ticketMedioGeral)} />
        <KpiCard icon={ShoppingCart} label="Leilões Fechados" value={items.length.toString()} />
      </div>

      {items.length > 1 && <InsightsSection items={items} />}
    </div>
  )
}
