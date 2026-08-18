'use client'

/**
 * LEILÕES & VENDAS — bloco de analytics do dashboard (reformado 18/08/2026).
 *
 * Visual novo, dados os mesmos (fechamentos alinhados ao HastaPro FIL 2):
 *   1. KPIs com subtítulo explicando cada número;
 *   2. VGV por mês — colunas SVG (a leitura executiva);
 *   3. Timeline de leilões — cada evento em linha, com barra de VGV e chip de
 *      cobertura (substitui a floresta de barras verticais);
 *   4. Cobertura da pista — área SVG com linha de média;
 *   5. Rankings — assessores e compradores com posição em medalha + donut por UF.
 */

import { useMemo, useState } from 'react'
import {
  DollarSign, BarChart3, Percent, Hash, TrendingUp, ShoppingCart,
  MapPin, Briefcase, Users, CalendarDays,
} from 'lucide-react'
import { normalizeAssessorNome } from '@/lib/assessor-normalize'

// Shape mínimo consumido pelo bloco — qualquer Fechamento completo
// (vide FechamentoView.Fechamento) atende esta interface.
export type FechamentoAnalyticsItem = {
  id: string
  nome: string
  data: string
  vgv_total: number
  faturamento_total_leilao: number | null
  lotes_ofertados: number
  lotes_vendidos: number
  animais_vendidos: number
  por_assessor: Array<{ nome: string; empresa?: string | null; vgv: number; transacoes: number; animais: number }>
  por_estado: Array<{ uf: string; vgv: number; lotes: number; animais: number }>
  compradores: Array<{ fazenda: string; cidade?: string | null; uf?: string | null; vgv: number; lotes: number; animais: number }>
}

// ── Helpers ──────────────────────────────────────────────────

const OURO = '#C9A84C'
const GRAFITE = '#3d4451'

const R = (v: number | null | undefined) =>
  v ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : 'R$ —'

const compact = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000) return `${Math.round(v / 1_000)}k`
  return String(Math.round(v))
}

const MES: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun',
  '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
}

function fmtDate(iso: string) {
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return { dia: Number(d), mes: MES[m] ?? m, ano: y, curto: `${Number(d)}/${m}`, full: `${Number(d)} ${MES[m] ?? m} ${y}` }
}

// Cobertura = % do faturamento total do leilão que a Bula cobriu.
function coveragePct(f: { vgv_total?: number | null; faturamento_total_leilao?: number | null }) {
  const vgv = Number(f.vgv_total ?? 0)
  const fat = Number(f.faturamento_total_leilao ?? 0)
  if (!fat || !vgv) return 0
  return Math.round((vgv / fat) * 100)
}

const card = 'rounded-2xl border border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414]'

function SecTitle({ icon: Icon, title, sub, right }: {
  icon: React.ElementType; title: string; sub?: string; right?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-1.5">
          <Icon size={13} style={{ color: OURO }} /> {title}
        </p>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, sub, gold }: {
  icon: React.ElementType; label: string; value: string; sub?: string; gold?: boolean
}) {
  return (
    <div className={`relative rounded-2xl border px-5 py-4 overflow-hidden transition-all hover:shadow-md
      ${gold
        ? 'border-[#C9A84C]/40 bg-gradient-to-br from-[#C9A84C]/14 to-[#C9A84C]/4 hover:shadow-[#C9A84C]/10'
        : 'border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] hover:border-gray-200 dark:hover:border-[#333]'}`}>
      <div className="flex items-center gap-2 mb-2.5">
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0
          ${gold ? 'bg-[#C9A84C]/15 text-[#C9A84C]' : 'bg-gray-50 dark:bg-[#1A1A1A] text-gray-400'}`}>
          <Icon size={12} />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      </div>
      <p className={`text-2xl font-black leading-none ${gold ? 'text-[#C9A84C]' : 'text-gray-900 dark:text-white'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-1.5">{sub}</p>}
    </div>
  )
}

// ── 1. VGV por mês (colunas SVG) ─────────────────────────────

function MonthlyVgvChart({ meses }: { meses: { key: string; label: string; vgv: number; leiloes: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  if (!meses.length) return null
  const H = 190
  const PAD_TOP = 30
  const max = Math.max(1, ...meses.map(m => m.vgv))
  return (
    <div>
      <div className="flex items-end gap-2 sm:gap-3" style={{ height: H }}>
        {meses.map((m, i) => {
          const h = Math.max(((m.vgv / max) * (H - PAD_TOP)), 3)
          const on = hover === i
          return (
            <div
              key={m.key}
              className="flex-1 min-w-0 flex flex-col items-center justify-end h-full cursor-default"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <span className={`text-[10px] font-black tabular-nums mb-1 transition-colors ${on ? 'text-[#C9A84C]' : 'text-gray-500 dark:text-gray-400'}`}>
                {compact(m.vgv)}
              </span>
              <div
                className="w-full rounded-t-xl transition-all duration-300"
                style={{
                  height: h,
                  maxWidth: 72,
                  background: on
                    ? `linear-gradient(180deg, ${OURO}, ${OURO}99)`
                    : `linear-gradient(180deg, ${GRAFITE}, ${GRAFITE}55)`,
                  boxShadow: on ? `0 0 0 1px ${OURO}55` : undefined,
                }}
                title={`${m.label}: ${R(m.vgv)} em ${m.leiloes} leilão(ões)`}
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-2 sm:gap-3 mt-2 border-t border-gray-100 dark:border-[#262626] pt-2">
        {meses.map((m, i) => (
          <div key={m.key} className="flex-1 min-w-0 text-center">
            <p className={`text-[10px] font-bold ${hover === i ? 'text-[#C9A84C]' : 'text-gray-600 dark:text-gray-300'}`}>{m.label}</p>
            <p className="text-[9px] text-gray-400 tabular-nums">{m.leiloes} leilão{m.leiloes === 1 ? '' : 'es'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 2. Timeline de leilões ───────────────────────────────────

function LeilaoTimeline({ sorted, maxVgv }: { sorted: FechamentoAnalyticsItem[]; maxVgv: number }) {
  const [verTodos, setVerTodos] = useState(false)
  const recentes = useMemo(() => [...sorted].reverse(), [sorted]) // mais novo primeiro
  const lista = verTodos ? recentes : recentes.slice(0, 10)
  return (
    <div>
      <div className="space-y-1.5">
        {lista.map(f => {
          const dt = fmtDate(f.data)
          const pct = coveragePct(f)
          const w = Math.max((f.vgv_total / Math.max(1, maxVgv)) * 100, 1.2)
          return (
            <div key={f.id} className="group flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-[#1A1A1A] transition-colors">
              <div className="w-11 shrink-0 text-center rounded-lg border border-gray-100 dark:border-[#2A2A2A] py-1">
                <p className="text-[13px] font-black leading-none text-gray-900 dark:text-white tabular-nums">{dt.dia}</p>
                <p className="text-[8px] uppercase tracking-wider text-gray-400">{dt.mes}</p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 truncate" title={f.nome}>{f.nome}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    {pct > 0 && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-[#C9A84C]/40 text-[#C9A84C]" title="Fatia do faturamento total do leilão coberta pela Bula">
                        {pct}% cob.
                      </span>
                    )}
                    <span className="text-[11px] font-black tabular-nums text-gray-900 dark:text-white">{R(f.vgv_total)}</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-[#1E1E1E] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${w}%`, background: `linear-gradient(90deg, ${GRAFITE}, ${OURO})` }}
                  />
                </div>
                <p className="text-[9px] text-gray-400 mt-0.5 tabular-nums">
                  {f.lotes_vendidos}/{f.lotes_ofertados} lotes · {f.animais_vendidos} animais
                </p>
              </div>
            </div>
          )
        })}
      </div>
      {recentes.length > 10 && (
        <button
          type="button"
          onClick={() => setVerTodos(v => !v)}
          className="mt-3 w-full text-center text-[10px] font-bold uppercase tracking-wider text-[#C9A84C] hover:opacity-80 transition-opacity"
        >
          {verTodos ? 'Mostrar só os 10 últimos' : `Ver todos os ${recentes.length} leilões`}
        </button>
      )}
    </div>
  )
}

// ── 3. Cobertura da pista (área SVG) ─────────────────────────

function CoberturaArea({ serie, media }: { serie: { nome: string; data: string; pct: number }[]; media: number }) {
  const [hover, setHover] = useState<number | null>(null)
  if (serie.length < 2) return null
  const H = 120
  const W = 100
  const max = Math.max(10, ...serie.map(s => s.pct))
  const x = (i: number) => (i / (serie.length - 1)) * W
  const y = (v: number) => H - (v / max) * (H - 14)
  const pts = serie.map((s, i) => `${x(i).toFixed(2)},${y(s.pct).toFixed(2)}`).join(' ')
  const sel = hover != null ? serie[hover] : null
  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: H }}>
          <defs>
            <linearGradient id="cob-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={OURO} stopOpacity="0.35" />
              <stop offset="100%" stopColor={OURO} stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" x2={W} y1={y(media)} y2={y(media)} stroke={GRAFITE} strokeOpacity="0.5" strokeWidth="0.7" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
          <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#cob-area)" />
          <polyline points={pts} fill="none" stroke={OURO} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* hit-areas + marcadores redondos em HTML (o SVG está esticado) */}
        <div className="absolute inset-0 flex">
          {serie.map((s, i) => (
            <div key={`${s.data}-${i}`} className="flex-1 relative" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <span
                className="absolute w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 transition-transform"
                style={{
                  left: '50%',
                  top: `${(y(s.pct) / H) * 100}%`,
                  background: hover === i ? OURO : 'var(--s1, #fff)',
                  border: `1.5px solid ${OURO}`,
                  transform: hover === i ? 'translate(-50%,-50%) scale(1.35)' : 'translate(-50%,-50%)',
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 min-h-[30px]">
        {sel ? (
          <p className="text-[10px] text-gray-600 dark:text-gray-300">
            <b className="text-[#C9A84C] tabular-nums">{sel.pct}%</b> · {sel.nome} · {fmtDate(sel.data).full}
          </p>
        ) : (
          <p className="text-[10px] text-gray-400">Linha pontilhada = média ponderada ({media}%). Passe o mouse para ver cada leilão.</p>
        )}
      </div>
    </div>
  )
}

// ── 4. Rankings ──────────────────────────────────────────────

function Medal({ pos }: { pos: number }) {
  const top = pos === 1
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black tabular-nums"
      style={top
        ? { background: `linear-gradient(135deg, ${OURO}, #A6852F)`, color: '#141414' }
        : { background: 'transparent', border: '1.5px solid var(--border, #E5E5E5)', color: 'var(--text3, #9ca3af)' }}
    >
      {pos}
    </div>
  )
}

function RankRow({ pos, nome, detalhe, vgv, share, max }: {
  pos: number; nome: string; detalhe: string; vgv: number; share: number; max: number
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Medal pos={pos} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11.5px] font-bold text-gray-800 dark:text-gray-100 truncate" title={nome}>{nome}</p>
          <p className="text-[11.5px] font-black tabular-nums shrink-0" style={{ color: pos === 1 ? OURO : undefined }}>{R(vgv)}</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1 rounded-full bg-gray-100 dark:bg-[#1E1E1E] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max((vgv / Math.max(1, max)) * 100, 2)}%`, background: pos === 1 ? OURO : GRAFITE }} />
          </div>
          <span className="text-[9px] text-gray-400 tabular-nums w-8 text-right">{share}%</span>
        </div>
        <p className="text-[9px] text-gray-400 mt-0.5">{detalhe}</p>
      </div>
    </div>
  )
}

// donut por UF
const UF_CORES = [OURO, GRAFITE, '#8a6d2f', '#6b7280', '#b8b0a0', '#4b5563', '#d6c28a', '#9ca3af']

function UfDonut({ estados, total }: { estados: [string, { vgv: number; lotes: number; animais: number }][]; total: number }) {
  const [hover, setHover] = useState<number | null>(null)
  if (!estados.length || total <= 0) return null
  const CIRC = 2 * Math.PI * 40
  const fracs = estados.map(([, d]) => d.vgv / total)
  const segs = estados.map(([uf, d], i) => ({
    uf, d, i, frac: fracs[i],
    offset: fracs.slice(0, i).reduce((s, f) => s + f, 0),
  }))
  const resto = Math.max(0, 1 - fracs.reduce((s, f) => s + f, 0))
  const sel = hover != null ? segs[hover] : null
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: 130, height: 130 }}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="var(--s2, #f3f4f6)" strokeWidth="12" />
          {segs.map(s => (
            <circle
              key={s.uf}
              cx="50" cy="50" r="40" fill="none"
              stroke={UF_CORES[s.i % UF_CORES.length]}
              strokeWidth={hover === s.i ? 15 : 12}
              strokeDasharray={`${Math.max(s.frac * CIRC - 1.5, 0.5)} ${CIRC}`}
              strokeDashoffset={-s.offset * CIRC}
              strokeLinecap="butt"
              className="transition-all cursor-default"
              onMouseEnter={() => setHover(s.i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-lg font-black leading-none" style={{ color: sel ? UF_CORES[sel.i % UF_CORES.length] : undefined }}>
            {sel ? `${Math.round(sel.frac * 100)}%` : estados.length + (resto > 0.001 ? '+' : '')}
          </p>
          <p className="text-[8px] uppercase tracking-wider text-gray-400">{sel ? sel.uf : 'estados'}</p>
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        {segs.map(s => (
          <div
            key={s.uf}
            className={`flex items-center gap-2 rounded-md px-1.5 py-0.5 transition-colors ${hover === s.i ? 'bg-gray-50 dark:bg-[#1A1A1A]' : ''}`}
            onMouseEnter={() => setHover(s.i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="w-2.5 h-2.5 rounded-[4px] shrink-0" style={{ background: UF_CORES[s.i % UF_CORES.length] }} />
            <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 w-7">{s.uf}</span>
            <span className="flex-1 text-right text-[10.5px] font-black tabular-nums text-gray-900 dark:text-white">{R(s.d.vgv)}</span>
            <span className="w-9 text-right text-[9px] text-gray-400 tabular-nums">{Math.round(s.frac * 100)}%</span>
          </div>
        ))}
        {resto > 0.001 && (
          <p className="text-[9px] text-gray-400 pl-6">demais UFs: {Math.round(resto * 100)}%</p>
        )}
      </div>
    </div>
  )
}

// ── Seção interna (dados agregados) ──────────────────────────

function InsightsSection({ items }: { items: FechamentoAnalyticsItem[] }) {
  const data = useMemo(() => {
    if (items.length < 2) return null
    const sorted = [...items].sort((a, b) => a.data.localeCompare(b.data))
    const maxVgv = Math.max(1, ...sorted.map(f => f.vgv_total))

    // VGV por mês
    const mesMap = new Map<string, { vgv: number; leiloes: number }>()
    for (const f of sorted) {
      const k = String(f.data).slice(0, 7)
      const cur = mesMap.get(k) ?? { vgv: 0, leiloes: 0 }
      cur.vgv += f.vgv_total
      cur.leiloes += 1
      mesMap.set(k, cur)
    }
    const meses = [...mesMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ key: k, label: `${MES[k.slice(5, 7)] ?? k.slice(5, 7)}/${k.slice(2, 4)}`, ...v }))

    // Compradores
    const compradorMap = new Map<string, { nome: string; cidade: string; uf: string; vgv: number; animais: number; leiloes: number }>()
    items.forEach(f => {
      (f.compradores ?? []).forEach(c => {
        const nome = (c.fazenda || '').trim()
        if (!nome) return
        const key = nome.toLowerCase()
        const cur = compradorMap.get(key) ?? { nome, cidade: c.cidade || '', uf: c.uf || '', vgv: 0, animais: 0, leiloes: 0 }
        cur.vgv += c.vgv
        cur.animais += c.animais
        cur.leiloes += 1
        if (c.cidade && !cur.cidade) cur.cidade = c.cidade
        if (c.uf && !cur.uf) cur.uf = c.uf
        compradorMap.set(key, cur)
      })
    })
    const topCompradores = [...compradorMap.values()].sort((a, b) => b.vgv - a.vgv).slice(0, 5)
    const totalCompradoresVgv = [...compradorMap.values()].reduce((s, d) => s + d.vgv, 0)
    const maxCVgv = topCompradores[0]?.vgv || 1

    // UFs
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

    // Assessores (nomes canônicos)
    const assessorMap = new Map<string, { nome: string; vgv: number; transacoes: number; animais: number; leiloes: number }>()
    items.forEach(f => {
      const seenInLeilao = new Set<string>()
      ;(f.por_assessor ?? []).forEach(a => {
        const canon = normalizeAssessorNome(a.nome)
        if (!canon) return
        const cur = assessorMap.get(canon) ?? { nome: canon, vgv: 0, transacoes: 0, animais: 0, leiloes: 0 }
        cur.vgv += a.vgv
        cur.transacoes += a.transacoes
        cur.animais += a.animais
        if (!seenInLeilao.has(canon)) { cur.leiloes += 1; seenInLeilao.add(canon) }
        assessorMap.set(canon, cur)
      })
    })
    const topAssessores = [...assessorMap.values()].sort((a, b) => b.vgv - a.vgv).slice(0, 5)
    const totalAssessorVgv = [...assessorMap.values()].reduce((s, d) => s + d.vgv, 0)
    const maxAVgv = topAssessores[0]?.vgv || 1

    // Cobertura por leilão (mesmo subconjunto no numerador e denominador)
    const cobertura = sorted
      .filter(f => f.faturamento_total_leilao && f.vgv_total)
      .map(f => ({ nome: f.nome, data: f.data, pct: coveragePct(f) }))
    const comFat = items.filter(f => (Number(f.faturamento_total_leilao) || 0) > 0)
    const totalFatLeilao = comFat.reduce((s, f) => s + (Number(f.faturamento_total_leilao) || 0), 0)
    const vgvComFat = comFat.reduce((s, f) => s + f.vgv_total, 0)
    const coberturaMedia = totalFatLeilao > 0 ? Math.round((vgvComFat / totalFatLeilao) * 100) : 0

    return {
      sorted, maxVgv, meses,
      topCompradores, totalCompradoresVgv, maxCVgv,
      topEstados, totalEstadoVgv,
      topAssessores, totalAssessorVgv, maxAVgv,
      cobertura, coberturaMedia,
    }
  }, [items])

  if (!data) return null
  const {
    sorted, maxVgv, meses,
    topCompradores, totalCompradoresVgv, maxCVgv,
    topEstados, totalEstadoVgv,
    topAssessores, totalAssessorVgv, maxAVgv,
    cobertura, coberturaMedia,
  } = data

  return (
    <div className="space-y-4">

      {/* VGV por mês + timeline */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-stretch">
        <div className={`${card} p-5 xl:col-span-3`}>
          <SecTitle
            icon={BarChart3}
            title="VGV por mês"
            sub="cobertura Bula somada por mês do leilão"
            right={
              <span className="text-[10px] px-2.5 py-1 rounded-full font-bold" style={{ background: `${OURO}1A`, color: OURO }}>
                Total {R(sorted.reduce((s, f) => s + f.vgv_total, 0))}
              </span>
            }
          />
          <MonthlyVgvChart meses={meses} />
        </div>

        <div className={`${card} p-5 xl:col-span-2`}>
          <SecTitle icon={CalendarDays} title="Leilão a leilão" sub="mais recente primeiro · barra proporcional ao maior VGV" />
          <LeilaoTimeline sorted={sorted} maxVgv={maxVgv} />
        </div>
      </div>

      {/* Cobertura + rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div className={`${card} p-5`}>
          <SecTitle
            icon={Percent}
            title="Cobertura da pista"
            sub={`nossa fatia do faturamento total, leilão a leilão · ${cobertura.length} com faturamento informado`}
            right={<span className="text-2xl font-black tabular-nums" style={{ color: OURO }}>{coberturaMedia}%</span>}
          />
          {cobertura.length >= 2
            ? <CoberturaArea serie={cobertura} media={coberturaMedia} />
            : <p className="text-[10px] text-gray-400">Informe o faturamento total dos leilões para acompanhar a cobertura.</p>}
        </div>

        <div className={`${card} p-5`}>
          <SecTitle icon={Briefcase} title="Top assessores" sub={`${R(totalAssessorVgv)} atribuídos no período`} />
          <div className="divide-y divide-gray-50 dark:divide-[#1E1E1E]">
            {topAssessores.map((a, i) => (
              <RankRow
                key={a.nome}
                pos={i + 1}
                nome={a.nome}
                detalhe={`${a.leiloes} leilões · ${a.transacoes} lotes · ${a.animais} animais`}
                vgv={a.vgv}
                share={totalAssessorVgv ? Math.round((a.vgv / totalAssessorVgv) * 100) : 0}
                max={maxAVgv}
              />
            ))}
          </div>
        </div>

        <div className={`${card} p-5`}>
          <SecTitle icon={Users} title="Top compradores" sub={`${R(totalCompradoresVgv)} atribuídos a compradores`} />
          <div className="divide-y divide-gray-50 dark:divide-[#1E1E1E]">
            {topCompradores.map((c, i) => (
              <RankRow
                key={c.nome}
                pos={i + 1}
                nome={c.nome}
                detalhe={[c.cidade, c.uf].filter(Boolean).join('/') || `${c.leiloes} leilões · ${c.animais} animais`}
                vgv={c.vgv}
                share={totalCompradoresVgv ? Math.round((c.vgv / totalCompradoresVgv) * 100) : 0}
                max={maxCVgv}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Distribuição por UF */}
      <div className={`${card} p-5`}>
        <SecTitle icon={MapPin} title="Distribuição por UF" sub="para onde a genética está indo — VGV por estado do comprador" />
        <UfDonut estados={topEstados} total={totalEstadoVgv} />
      </div>
    </div>
  )
}

// ── Bloco público ────────────────────────────────────────────

export function LeiloesAnalyticsBlock({ items }: { items: FechamentoAnalyticsItem[] }) {
  if (items.length === 0) return null

  const totalVgv = items.reduce((s, f) => s + (Number(f.vgv_total) || 0), 0)
  const totalAnimais = items.reduce((s, f) => s + (Number(f.animais_vendidos) || 0), 0)
  const totalLotesVendidos = items.reduce((s, f) => s + (Number(f.lotes_vendidos) || 0), 0)
  const totalLotesOfertados = items.reduce((s, f) => s + (Number(f.lotes_ofertados) || 0), 0)
  // Cobertura média ponderada: soma do VGV nosso / soma do faturamento total dos leilões
  // (apenas leilões com faturamento_total_leilao informado entram na conta).
  const itemsComFat = items.filter(f => (Number(f.faturamento_total_leilao) || 0) > 0)
  const vgvComFat = itemsComFat.reduce((s, f) => s + f.vgv_total, 0)
  const totalFatLeilao = itemsComFat.reduce((s, f) => s + (Number(f.faturamento_total_leilao) || 0), 0)
  const coberturaMedia = totalFatLeilao ? Math.round((vgvComFat / totalFatLeilao) * 100) : 0
  const ticketMedioGeral = totalAnimais ? Math.round(totalVgv / totalAnimais) : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={DollarSign} label="VGV Total" value={R(totalVgv)} gold sub="cobertura Bula (HastaPro FIL 2)" />
        <KpiCard
          icon={BarChart3}
          label="Lotes Vendidos"
          value={`${totalLotesVendidos}/${totalLotesOfertados}`}
          sub={totalLotesOfertados ? `${Math.round((totalLotesVendidos / totalLotesOfertados) * 100)}% dos lotes ofertados` : undefined}
        />
        <KpiCard
          icon={Percent}
          label="Cobertura Média"
          value={`${coberturaMedia}%`}
          sub={itemsComFat.length ? `nossa fatia do faturamento total · ${itemsComFat.length} leilões com faturamento informado` : 'nenhum leilão com faturamento informado'}
        />
        <KpiCard icon={Hash} label="Animais Vendidos" value={totalAnimais.toLocaleString('pt-BR')} />
        <KpiCard icon={TrendingUp} label="Ticket Médio Geral" value={R(ticketMedioGeral)} sub="VGV por animal vendido" />
        <KpiCard icon={ShoppingCart} label="Leilões Fechados" value={items.length.toString()} />
      </div>

      {items.length > 1 && <InsightsSection items={items} />}
    </div>
  )
}
