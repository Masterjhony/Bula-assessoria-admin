'use client'

/**
 * LEILÕES & VENDAS — o bloco principal do dashboard (redesenhado 18/08/2026).
 *
 * Regras de layout que este arquivo respeita (o problema anterior era espaço
 * morto e cards de alturas diferentes):
 *   · toda linha da grade tem altura definida no desktop e os cards são
 *     `h-full flex flex-col` — o conteúdo cresce (flex-1) até preencher;
 *   · lista longa nunca estica o card: rola dentro dele;
 *   · mesmo padding (p-5) e mesmo gap (gap-4) em toda a seção;
 *   · paleta do brandbook: preto/grafite com dourado #C9A84C nos destaques.
 */

import { useMemo, useState } from 'react'
import {
  DollarSign, BarChart3, Percent, Hash, TrendingUp, ShoppingCart,
  MapPin, Briefcase, Users, CalendarDays, Trophy,
} from 'lucide-react'
import { normalizeAssessorNome } from '@/lib/assessor-normalize'
import { nomeCompradorCanonico } from '@/lib/clientes'

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
  compradores: Array<{ fazenda: string; comprador?: string | null; cidade?: string | null; uf?: string | null; vgv: number; lotes: number; animais: number }>
}

// ── Tokens ───────────────────────────────────────────────────

const OURO = '#C9A84C'
const OURO_ESCURO = '#8A6D2F'
const GRAFITE = '#454B57'

const card = 'rounded-2xl border border-gray-100 dark:border-[#242424] bg-white dark:bg-[#131313] shadow-[0_1px_2px_rgba(0,0,0,.04)]'

const R = (v: number | null | undefined) =>
  v ? `R$ ${Math.round(v).toLocaleString('pt-BR')}` : 'R$ —'

const compact = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000) return `${Math.round(v / 1_000)}k`
  return String(Math.round(v))
}

const MES: Record<string, string> = {
  '01': 'jan', '02': 'fev', '03': 'mar', '04': 'abr', '05': 'mai', '06': 'jun',
  '07': 'jul', '08': 'ago', '09': 'set', '10': 'out', '11': 'nov', '12': 'dez',
}

function fmtDate(iso: string) {
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return { dia: Number(d), mes: MES[m] ?? m, ano: y, full: `${Number(d)} ${MES[m] ?? m} ${y}` }
}

function coveragePct(f: { vgv_total?: number | null; faturamento_total_leilao?: number | null }) {
  const vgv = Number(f.vgv_total ?? 0)
  const fat = Number(f.faturamento_total_leilao ?? 0)
  if (!fat || !vgv) return 0
  return Math.round((vgv / fat) * 100)
}

// ── Peças de UI ──────────────────────────────────────────────

function CardHead({ icon: Icon, title, sub, right }: {
  icon: React.ElementType; title: string; sub?: string; right?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <Icon size={13} style={{ color: OURO }} />{title}
        </p>
        {sub && <p className="text-[10.5px] text-gray-400 mt-1 leading-snug">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, destaque }: {
  icon: React.ElementType; label: string; value: string; sub?: string; destaque?: boolean
}) {
  return (
    <div
      className={`relative rounded-2xl border px-5 py-4 h-full flex flex-col justify-between overflow-hidden transition-all duration-200
        ${destaque
          ? 'border-[#C9A84C]/40 hover:border-[#C9A84C]/70'
          : 'border-gray-100 dark:border-[#242424] hover:border-gray-200 dark:hover:border-[#3a3a3a]'}
        bg-white dark:bg-[#131313]`}
      style={destaque ? { background: `linear-gradient(140deg, ${OURO}1f, ${OURO}06 55%, transparent)` } : undefined}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
          style={destaque
            ? { background: `${OURO}26`, color: OURO }
            : { background: 'rgba(127,127,127,.08)', color: '#9ca3af' }}
        >
          <Icon size={12} />
        </div>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-gray-400 truncate">{label}</span>
      </div>
      <div>
        <p
          className={`font-black leading-none tabular-nums ${destaque ? 'text-[26px]' : 'text-[22px]'} text-gray-900 dark:text-white`}
          style={destaque ? { color: OURO } : undefined}
        >
          {value}
        </p>
        {sub && <p className="text-[10px] text-gray-400 mt-2 leading-snug line-clamp-2">{sub}</p>}
      </div>
    </div>
  )
}

// ── 1. VGV por mês ───────────────────────────────────────────

function VgvMensal({ meses }: { meses: { key: string; label: string; vgv: number; leiloes: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...meses.map(m => m.vgv))
  const media = meses.length ? meses.reduce((s, m) => s + m.vgv, 0) / meses.length : 0

  return (
    <div className="flex-1 flex flex-col min-h-[240px]">
      {/* área do gráfico */}
      <div className="relative flex-1 min-h-[180px]">
        {/* linhas-guia */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="border-t border-dashed border-gray-100 dark:border-[#232323]" />
          ))}
        </div>
        {/* linha de média */}
        {media > 0 && (
          <div
            className="absolute left-0 right-0 pointer-events-none flex items-center"
            style={{ bottom: `${(media / max) * 100}%` }}
          >
            <div className="flex-1 border-t border-dashed" style={{ borderColor: `${OURO}66` }} />
            <span className="text-[8.5px] font-bold uppercase tracking-wider pl-2" style={{ color: `${OURO}cc` }}>
              média {compact(media)}
            </span>
          </div>
        )}
        {/* colunas */}
        <div className="absolute inset-0 flex items-end gap-1.5 sm:gap-2.5">
          {meses.map((m, i) => {
            const on = hover === i
            const h = Math.max((m.vgv / max) * 100, 1.5)
            return (
              <div
                key={m.key}
                className="flex-1 min-w-0 h-full flex flex-col justify-end items-center group"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <span
                  className={`text-[10px] font-black tabular-nums mb-1.5 transition-all duration-200 ${on ? 'opacity-100' : 'opacity-60'}`}
                  style={{ color: on ? OURO : undefined }}
                >
                  {compact(m.vgv)}
                </span>
                <div
                  className="w-full rounded-t-[10px] transition-all duration-300 relative overflow-hidden"
                  style={{
                    height: `${h}%`,
                    maxHeight: 'calc(100% - 22px)',
                    maxWidth: 76,
                    background: on
                      ? `linear-gradient(180deg, ${OURO} 0%, ${OURO_ESCURO} 100%)`
                      : `linear-gradient(180deg, ${GRAFITE} 0%, ${GRAFITE}44 100%)`,
                  }}
                >
                  <span
                    className="absolute inset-x-0 top-0 h-px opacity-70"
                    style={{ background: on ? '#fff6dd' : `${GRAFITE}` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {/* eixo X */}
      <div className="flex gap-1.5 sm:gap-2.5 mt-3 pt-3 border-t border-gray-100 dark:border-[#232323]">
        {meses.map((m, i) => (
          <div key={m.key} className="flex-1 min-w-0 text-center">
            <p className={`text-[10.5px] font-bold capitalize transition-colors ${hover === i ? '' : 'text-gray-600 dark:text-gray-300'}`}
              style={hover === i ? { color: OURO } : undefined}>
              {m.label}
            </p>
            <p className="text-[9px] text-gray-400 tabular-nums mt-0.5">{m.leiloes} {m.leiloes === 1 ? 'leilão' : 'leilões'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 2. Timeline de leilões (rola dentro do card) ─────────────

function Timeline({ sorted, maxVgv }: { sorted: FechamentoAnalyticsItem[]; maxVgv: number }) {
  const recentes = useMemo(() => [...sorted].reverse(), [sorted])
  return (
    <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-2 space-y-0.5
      [scrollbar-width:thin] [scrollbar-color:rgba(201,168,76,.35)_transparent]">
      {recentes.map(f => {
        const dt = fmtDate(f.data)
        const pct = coveragePct(f)
        const w = Math.max((f.vgv_total / Math.max(1, maxVgv)) * 100, 1.5)
        return (
          <div key={f.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-gray-50 dark:hover:bg-[#1b1b1b] transition-colors">
            <div className="w-10 shrink-0 text-center">
              <p className="text-[15px] font-black leading-none tabular-nums text-gray-900 dark:text-white">{dt.dia}</p>
              <p className="text-[8.5px] uppercase tracking-wider text-gray-400 mt-0.5">{dt.mes}</p>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 truncate" title={f.nome}>{f.nome}</p>
                <p className="text-[11.5px] font-black tabular-nums text-gray-900 dark:text-white shrink-0">{R(f.vgv_total)}</p>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-1 rounded-full bg-gray-100 dark:bg-[#1f1f1f] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${w}%`, background: `linear-gradient(90deg, ${GRAFITE}, ${OURO})` }} />
                </div>
                <span className="text-[9px] text-gray-400 tabular-nums shrink-0">
                  {f.lotes_vendidos}/{f.lotes_ofertados} lotes
                  {pct > 0 && <span style={{ color: `${OURO}dd` }} className="font-bold"> · {pct}%</span>}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── 3. Cobertura (área que preenche o card) ──────────────────

function CoberturaArea({ serie, media }: { serie: { nome: string; data: string; pct: number }[]; media: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(10, ...serie.map(s => s.pct))
  const W = 100, H = 100
  const x = (i: number) => (serie.length === 1 ? W / 2 : (i / (serie.length - 1)) * W)
  const y = (v: number) => H - (v / max) * (H - 8)
  const pts = serie.map((s, i) => `${x(i).toFixed(2)},${y(s.pct).toFixed(2)}`).join(' ')
  const sel = hover != null ? serie[hover] : null

  return (
    <div className="flex-1 flex flex-col min-h-[150px]">
      <div className="relative flex-1 min-h-[110px]">
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="cob-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={OURO} stopOpacity="0.42" />
              <stop offset="100%" stopColor={OURO} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <line x1="0" x2={W} y1={y(media)} y2={y(media)} stroke={OURO} strokeOpacity="0.45" strokeWidth="0.6" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
          <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#cob-fill)" />
          <polyline points={pts} fill="none" stroke={OURO} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="absolute inset-0 flex">
          {serie.map((s, i) => (
            <div key={`${s.data}-${i}`} className="flex-1 relative" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <span
                className="absolute rounded-full transition-all duration-150"
                style={{
                  left: '50%', top: `${y(s.pct)}%`,
                  width: hover === i ? 9 : 5, height: hover === i ? 9 : 5,
                  transform: 'translate(-50%,-50%)',
                  background: hover === i ? OURO : 'transparent',
                  border: `1.5px solid ${OURO}`,
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#232323] min-h-[34px]">
        {sel ? (
          <p className="text-[10.5px] text-gray-600 dark:text-gray-300 leading-snug">
            <b className="tabular-nums" style={{ color: OURO }}>{sel.pct}%</b> · {sel.nome}
            <span className="text-gray-400"> · {fmtDate(sel.data).full}</span>
          </p>
        ) : (
          <p className="text-[10px] text-gray-400 leading-snug">
            Linha pontilhada = média ponderada. Passe o mouse para ver leilão a leilão.
          </p>
        )}
      </div>
    </div>
  )
}

// ── 4. Rankings ──────────────────────────────────────────────

function RankRow({ pos, nome, detalhe, vgv, share, max, muted }: {
  pos: number; nome: string; detalhe: string; vgv: number; share: number; max: number; muted?: boolean
}) {
  const lider = pos === 1 && !muted
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black tabular-nums"
        style={lider
          ? { background: `linear-gradient(135deg, ${OURO}, ${OURO_ESCURO})`, color: '#12100b' }
          : { border: '1.5px solid rgba(127,127,127,.25)', color: '#9ca3af' }}
      >
        {pos}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`text-[11.5px] font-bold truncate ${muted ? 'text-gray-400 italic' : 'text-gray-800 dark:text-gray-100'}`} title={nome}>{nome}</p>
          <p className="text-[11.5px] font-black tabular-nums shrink-0" style={lider ? { color: OURO } : undefined}>{R(vgv)}</p>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex-1 h-1 rounded-full bg-gray-100 dark:bg-[#1f1f1f] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max((vgv / Math.max(1, max)) * 100, 2)}%`, background: lider ? `linear-gradient(90deg, ${OURO_ESCURO}, ${OURO})` : muted ? '#6b7280' : GRAFITE }}
            />
          </div>
          <span className="w-7 text-right text-[9px] font-bold text-gray-400 tabular-nums shrink-0">{share}%</span>
        </div>
        <p className="text-[9px] text-gray-400 mt-1 truncate">{detalhe}</p>
      </div>
    </div>
  )
}

// ── 5. Donut por UF ──────────────────────────────────────────

const UF_CORES = [OURO, GRAFITE, OURO_ESCURO, '#6b7280', '#cdbb8b', '#565d6b']

function UfDonut({ estados, total }: { estados: [string, { vgv: number; lotes: number; animais: number }][]; total: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const CIRC = 2 * Math.PI * 40
  const fracs = estados.map(([, d]) => d.vgv / total)
  const segs = estados.map(([uf, d], i) => ({
    uf, d, i, frac: fracs[i], offset: fracs.slice(0, i).reduce((s, f) => s + f, 0),
  }))
  const resto = Math.max(0, 1 - fracs.reduce((s, f) => s + f, 0))
  const sel = hover != null ? segs[hover] : null

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative shrink-0" style={{ width: 148, height: 148 }}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" className="text-gray-100 dark:text-[#1f1f1f]" strokeWidth="13" />
          {segs.map(s => (
            <circle
              key={s.uf}
              cx="50" cy="50" r="40" fill="none"
              stroke={UF_CORES[s.i % UF_CORES.length]}
              strokeWidth={hover === s.i ? 16 : 13}
              strokeDasharray={`${Math.max(s.frac * CIRC - 1.5, 0.5)} ${CIRC}`}
              strokeDashoffset={-s.offset * CIRC}
              className="transition-all duration-200 cursor-default"
              onMouseEnter={() => setHover(s.i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[22px] font-black leading-none tabular-nums" style={{ color: sel ? UF_CORES[sel.i % UF_CORES.length] : undefined }}>
            {sel ? `${Math.round(sel.frac * 100)}%` : estados.length}
          </p>
          <p className="text-[8.5px] uppercase tracking-[0.14em] text-gray-400 mt-1">{sel ? sel.uf : 'estados'}</p>
        </div>
      </div>

      <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1">
        {segs.map(s => (
          <div
            key={s.uf}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${hover === s.i ? 'bg-gray-50 dark:bg-[#1b1b1b]' : ''}`}
            onMouseEnter={() => setHover(s.i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: UF_CORES[s.i % UF_CORES.length] }} />
            <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 w-8 shrink-0">{s.uf}</span>
            <span className="flex-1 text-right text-[11px] font-black tabular-nums text-gray-900 dark:text-white">{R(s.d.vgv)}</span>
            <span className="w-8 text-right text-[9px] font-bold text-gray-400 tabular-nums shrink-0">{Math.round(s.frac * 100)}%</span>
          </div>
        ))}
        {resto > 0.001 && (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="w-2.5 h-2.5 rounded-[3px] shrink-0 bg-gray-200 dark:bg-[#2a2a2a]" />
            <span className="text-[11px] text-gray-400 flex-1">demais UFs</span>
            <span className="w-8 text-right text-[9px] font-bold text-gray-400 tabular-nums">{Math.round(resto * 100)}%</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Seção com os dados agregados ─────────────────────────────

function Insights({ items }: { items: FechamentoAnalyticsItem[] }) {
  const data = useMemo(() => {
    if (items.length < 2) return null
    const sorted = [...items].sort((a, b) => a.data.localeCompare(b.data))
    const maxVgv = Math.max(1, ...sorted.map(f => f.vgv_total))

    // meses (no máximo os 12 últimos, para as colunas respirarem)
    const mesMap = new Map<string, { vgv: number; leiloes: number }>()
    for (const f of sorted) {
      const k = String(f.data).slice(0, 7)
      const cur = mesMap.get(k) ?? { vgv: 0, leiloes: 0 }
      cur.vgv += f.vgv_total; cur.leiloes += 1
      mesMap.set(k, cur)
    }
    const todosMeses = [...mesMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    const cortou = Math.max(0, todosMeses.length - 12)
    const meses = todosMeses.slice(-12)
      .map(([k, v]) => ({ key: k, label: `${MES[k.slice(5, 7)] ?? k.slice(5, 7)}/${k.slice(2, 4)}`, ...v }))

    // compradores (placeholder de fazenda não vira comprador — some com o real)
    const compradorMap = new Map<string, { nome: string; cidade: string; uf: string; vgv: number; animais: number; leiloes: number }>()
    let vgvNaoIdentificado = 0
    items.forEach(f => {
      (f.compradores ?? []).forEach(c => {
        const nome = nomeCompradorCanonico(c.fazenda, c.comprador)
        if (!nome) { vgvNaoIdentificado += c.vgv || 0; return }
        const key = nome.toLowerCase()
        const cur = compradorMap.get(key) ?? { nome, cidade: c.cidade || '', uf: c.uf || '', vgv: 0, animais: 0, leiloes: 0 }
        cur.vgv += c.vgv; cur.animais += c.animais; cur.leiloes += 1
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
        cur.vgv += e.vgv; cur.lotes += e.lotes; cur.animais += e.animais
        estadoMap.set(e.uf, cur)
      })
    })
    const topEstados = [...estadoMap.entries()].sort((a, b) => b[1].vgv - a[1].vgv).slice(0, 6)
    const totalEstadoVgv = [...estadoMap.values()].reduce((s, d) => s + d.vgv, 0)

    // assessores
    const assessorMap = new Map<string, { nome: string; vgv: number; transacoes: number; animais: number; leiloes: number }>()
    items.forEach(f => {
      const visto = new Set<string>()
      ;(f.por_assessor ?? []).forEach(a => {
        const canon = normalizeAssessorNome(a.nome)
        if (!canon) return
        const cur = assessorMap.get(canon) ?? { nome: canon, vgv: 0, transacoes: 0, animais: 0, leiloes: 0 }
        cur.vgv += a.vgv; cur.transacoes += a.transacoes; cur.animais += a.animais
        if (!visto.has(canon)) { cur.leiloes += 1; visto.add(canon) }
        assessorMap.set(canon, cur)
      })
    })
    const topAssessores = [...assessorMap.values()].sort((a, b) => b.vgv - a.vgv).slice(0, 5)
    const totalAssessorVgv = [...assessorMap.values()].reduce((s, d) => s + d.vgv, 0)
    const maxAVgv = topAssessores[0]?.vgv || 1

    // cobertura
    const cobertura = sorted.filter(f => f.faturamento_total_leilao && f.vgv_total)
      .map(f => ({ nome: f.nome, data: f.data, pct: coveragePct(f) }))
    const comFat = items.filter(f => (Number(f.faturamento_total_leilao) || 0) > 0)
    const fatTotal = comFat.reduce((s, f) => s + (Number(f.faturamento_total_leilao) || 0), 0)
    const vgvComFat = comFat.reduce((s, f) => s + f.vgv_total, 0)
    const coberturaMedia = fatTotal > 0 ? Math.round((vgvComFat / fatTotal) * 100) : 0

    return {
      sorted, maxVgv, meses, cortou,
      topCompradores, totalCompradoresVgv, maxCVgv, vgvNaoIdentificado,
      topEstados, totalEstadoVgv,
      topAssessores, totalAssessorVgv, maxAVgv,
      cobertura, coberturaMedia,
    }
  }, [items])

  if (!data) return null
  const {
    sorted, maxVgv, meses, cortou,
    topCompradores, totalCompradoresVgv, maxCVgv, vgvNaoIdentificado,
    topEstados, totalEstadoVgv,
    topAssessores, totalAssessorVgv, maxAVgv,
    cobertura, coberturaMedia,
  } = data
  const totalPeriodo = sorted.reduce((s, f) => s + f.vgv_total, 0)

  return (
    <div className="space-y-4">

      {/* linha 1 — gráfico + timeline, alturas casadas */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 xl:h-[430px]">
        <div className={`${card} p-5 xl:col-span-3 flex flex-col`}>
          <CardHead
            icon={BarChart3}
            title="VGV por mês"
            sub={`cobertura Bula somada por mês${cortou ? ` · ${cortou} ${cortou === 1 ? 'mês anterior' : 'meses anteriores'} fora do gráfico` : ''}`}
            right={
              <span className="text-[10px] px-3 py-1.5 rounded-full font-black tabular-nums"
                style={{ background: `${OURO}18`, color: OURO }}>
                {R(totalPeriodo)}
              </span>
            }
          />
          <VgvMensal meses={meses} />
        </div>

        <div className={`${card} p-5 xl:col-span-2 flex flex-col min-h-[380px]`}>
          <CardHead icon={CalendarDays} title="Leilão a leilão" sub={`${sorted.length} eventos · mais recente primeiro`} />
          <Timeline sorted={sorted} maxVgv={maxVgv} />
        </div>
      </div>

      {/* linha 2 — cobertura + dois rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:h-[400px]">
        <div className={`${card} p-5 flex flex-col`}>
          <CardHead
            icon={Percent}
            title="Cobertura da pista"
            sub={`nossa fatia do faturamento · ${cobertura.length} leilões informados`}
            right={<span className="text-[26px] font-black leading-none tabular-nums" style={{ color: OURO }}>{coberturaMedia}%</span>}
          />
          {cobertura.length >= 2
            ? <CoberturaArea serie={cobertura} media={coberturaMedia} />
            : <div className="flex-1 flex items-center justify-center text-center">
                <p className="text-[10.5px] text-gray-400 max-w-[220px]">Informe o faturamento total dos leilões para acompanhar a cobertura evento a evento.</p>
              </div>}
        </div>

        <div className={`${card} p-5 flex flex-col`}>
          <CardHead icon={Briefcase} title="Top assessores" sub={`${R(totalAssessorVgv)} atribuídos no período`} />
          <div className="flex-1 min-h-0 overflow-y-auto -mr-2 pr-2 divide-y divide-gray-50 dark:divide-[#1c1c1c]">
            {topAssessores.map((a, i) => (
              <RankRow
                key={a.nome}
                pos={i + 1}
                nome={/a definir/i.test(a.nome) ? 'Sem assessor definido' : a.nome}
                muted={/a definir/i.test(a.nome)}
                detalhe={`${a.leiloes} leilões · ${a.transacoes} lotes · ${a.animais} animais`}
                vgv={a.vgv}
                share={totalAssessorVgv ? Math.round((a.vgv / totalAssessorVgv) * 100) : 0}
                max={maxAVgv}
              />
            ))}
          </div>
        </div>

        <div className={`${card} p-5 flex flex-col`}>
          <CardHead
            icon={Trophy}
            title="Top compradores"
            sub={vgvNaoIdentificado > 0
              ? `${R(totalCompradoresVgv)} identificados · ${R(vgvNaoIdentificado)} sem nome na fonte`
              : `${R(totalCompradoresVgv)} atribuídos a compradores`}
          />
          <div className="flex-1 min-h-0 overflow-y-auto -mr-2 pr-2 divide-y divide-gray-50 dark:divide-[#1c1c1c]">
            {topCompradores.map((c, i) => (
              <RankRow
                key={c.nome}
                pos={i + 1}
                nome={c.nome}
                detalhe={[[c.cidade, c.uf].filter(Boolean).join('/'), `${c.leiloes} ${c.leiloes === 1 ? 'compra' : 'compras'}`, `${c.animais} animais`].filter(Boolean).join(' · ')}
                vgv={c.vgv}
                share={totalCompradoresVgv ? Math.round((c.vgv / totalCompradoresVgv) * 100) : 0}
                max={maxCVgv}
              />
            ))}
          </div>
        </div>
      </div>

      {/* linha 3 — mapa de destino */}
      <div className={`${card} p-5`}>
        <CardHead icon={MapPin} title="Para onde a genética vai" sub="VGV por estado do comprador" />
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
  const itemsComFat = items.filter(f => (Number(f.faturamento_total_leilao) || 0) > 0)
  const vgvComFat = itemsComFat.reduce((s, f) => s + f.vgv_total, 0)
  const totalFatLeilao = itemsComFat.reduce((s, f) => s + (Number(f.faturamento_total_leilao) || 0), 0)
  const coberturaMedia = totalFatLeilao ? Math.round((vgvComFat / totalFatLeilao) * 100) : 0
  const ticketMedioGeral = totalAnimais ? Math.round(totalVgv / totalAnimais) : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 auto-rows-fr">
        <Kpi icon={DollarSign} label="VGV Total" value={R(totalVgv)} destaque sub="cobertura Bula · HastaPro FIL 2" />
        <Kpi
          icon={BarChart3}
          label="Lotes vendidos"
          value={`${totalLotesVendidos}/${totalLotesOfertados}`}
          sub={totalLotesOfertados ? `${Math.round((totalLotesVendidos / totalLotesOfertados) * 100)}% dos ofertados` : undefined}
        />
        <Kpi
          icon={Percent}
          label="Cobertura média"
          value={`${coberturaMedia}%`}
          sub={itemsComFat.length ? `fatia do faturamento · ${itemsComFat.length} leilões informados` : 'sem faturamento informado'}
        />
        <Kpi icon={Hash} label="Animais vendidos" value={totalAnimais.toLocaleString('pt-BR')} sub={`${items.length ? Math.round(totalAnimais / items.length) : 0} por leilão em média`} />
        <Kpi icon={TrendingUp} label="Ticket médio" value={R(ticketMedioGeral)} sub="VGV por animal vendido" />
        <Kpi icon={ShoppingCart} label="Leilões fechados" value={items.length.toString()} sub="no período filtrado" />
      </div>

      {items.length > 1 && <Insights items={items} />}
    </div>
  )
}
