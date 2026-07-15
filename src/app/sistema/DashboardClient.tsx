'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Gavel, Calendar, MapPin, Filter, ChevronDown, User, X,
  Users, UserPlus, Star as StarIcon, Flame, MessageCircle, Reply, Send, ArrowUpRight,
} from 'lucide-react'
import { LeiloesAnalyticsBlock, type FechamentoAnalyticsItem } from './leiloes/LeiloesAnalyticsBlock'
import type { AtendimentoGrowth } from '@/lib/atendimento-stats'

// ─── Types ──────────────────────────────────────────────────────────────────

export type PeriodKey = 'this_month' | 'last_30d' | 'last_90d' | 'this_quarter' | 'this_year' | 'all' | 'custom'

export type AssessorOption = { nome: string; count: number }

export type ProximoLeilao = {
  nome: string
  tipo: string | null
  animais: number
  meta_bula: number
  expectativa: number
  horario: string | null
  leiloeira: string | null
  local: string | null
  status: string
  data: string
  wk: string
  day: string
  mo: string
  targetTs: number | null
  diasParaProximo: number | null
}

export type ProximoLeilaoRow = {
  id: string
  d: string; m: string; wk: string
  title: string; type: string
  status: 'ok' | 'warn' | 'pend'
  statusLabel: string
  pct: number
  animais: number
  expectativaLabel: string
}

export type FeedItem = {
  id: string
  kind: 'lead' | 'wpp' | 'fechamento' | 'task' | 'ai'
  text: string
  when: string
}

export type CrmPulse = {
  totalAtivos: number
  novosPeriodo: number
  mql: number
  altaPrioridade: number
  funnel: { label: string; value: number; color: string }[]
  entrada: number
  perdidos: number
}

export type DashboardProps = {
  today: string
  proximo: ProximoLeilao | null
  upcoming: ProximoLeilaoRow[]
  filters: {
    period: PeriodKey
    from: string
    to: string
    label: string
    assessor: string
    assessores: AssessorOption[]
  }
  fechamentoItems: FechamentoAnalyticsItem[]
  feed: FeedItem[]
  crm: CrmPulse
  atendimento: AtendimentoGrowth | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const fmtBRLCompact = (v: number) => {
  const abs = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(2).replace('.', ',')}M`
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(0)}k`
  return fmtBRL(v)
}
const fmtNum = (v: number) => v.toLocaleString('pt-BR')

function useCountdown(target: number | null) {
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    if (target == null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])
  if (target == null) return { d: 0, h: 0, m: 0, s: 0, done: true }
  const ms = Math.max(0, target - now)
  return {
    d: Math.floor(ms / 86400000),
    h: Math.floor((ms % 86400000) / 3600000),
    m: Math.floor((ms % 3600000) / 60000),
    s: Math.floor((ms % 60000) / 1000),
    done: ms === 0,
  }
}
const pad2 = (n: number) => String(n).padStart(2, '0')

// ─── Filter bar ─────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'this_month', label: 'Este mês' },
  { key: 'last_30d', label: 'Últimos 30 dias' },
  { key: 'last_90d', label: 'Últimos 90 dias' },
  { key: 'this_quarter', label: 'Trimestre atual' },
  { key: 'this_year', label: 'Este ano' },
  { key: 'all', label: 'Todo o histórico' },
]

function FilterBar({
  filters,
}: { filters: DashboardProps['filters'] }) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const [, startTransition] = useTransition()
  const [openPeriod, setOpenPeriod] = useState(false)
  const [openAssessor, setOpenAssessor] = useState(false)
  const [assessorQuery, setAssessorQuery] = useState('')

  function setParam(patch: Record<string, string | null>) {
    const sp = new URLSearchParams(search?.toString() || '')
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') sp.delete(k)
      else sp.set(k, v)
    }
    startTransition(() => {
      router.push(`${pathname}?${sp.toString()}`, { scroll: false })
    })
  }

  const currentPeriodLabel = PERIOD_OPTIONS.find(o => o.key === filters.period)?.label
    ?? (filters.period === 'custom' ? 'Personalizado' : 'Este ano')

  const assessoresFiltradas = filters.assessores.filter(a =>
    !assessorQuery || a.nome.toLowerCase().includes(assessorQuery.toLowerCase())
  )

  return (
    <div className="card relative z-30" style={{ overflow: 'visible' }}>
      <div className="card-b flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider subtle">
          <Filter size={13} /> Filtros
        </div>

        {/* Período */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setOpenPeriod(v => !v); setOpenAssessor(false) }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--s2)] hover:bg-[var(--s3)] text-sm transition-colors"
          >
            <Calendar size={13} className="subtle" />
            <span className="font-semibold">{currentPeriodLabel}</span>
            <span className="subtle text-[11px]">· {filters.label}</span>
            <ChevronDown size={13} className="subtle" />
          </button>
          {openPeriod && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpenPeriod(false)} />
              <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden">
                {PERIOD_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setParam({ period: opt.key, from: null, to: null }); setOpenPeriod(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--s2)] transition-colors ${filters.period === opt.key ? 'text-[var(--gold)] font-semibold' : ''}`}
                  >
                    {opt.label}
                  </button>
                ))}
                <div className="border-t border-[var(--border)] p-2 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider subtle px-1">Personalizado</div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      defaultValue={filters.from}
                      onBlur={(e) => { if (e.target.value) setParam({ period: 'custom', from: e.target.value }) }}
                      className="text-xs px-2 py-1 rounded border border-[var(--border)] bg-[var(--s2)] flex-1"
                    />
                    <span className="subtle text-[10px]">até</span>
                    <input
                      type="date"
                      defaultValue={filters.to}
                      onBlur={(e) => { if (e.target.value) setParam({ period: 'custom', to: e.target.value }) }}
                      className="text-xs px-2 py-1 rounded border border-[var(--border)] bg-[var(--s2)] flex-1"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Assessor */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setOpenAssessor(v => !v); setOpenPeriod(false) }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--s2)] hover:bg-[var(--s3)] text-sm transition-colors"
          >
            <User size={13} className="subtle" />
            <span className="font-semibold">{filters.assessor || 'Todos os assessores'}</span>
            <ChevronDown size={13} className="subtle" />
          </button>
          {openAssessor && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpenAssessor(false)} />
              <div className="absolute top-full left-0 mt-1 z-50 min-w-[260px] rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden">
                <div className="p-2 border-b border-[var(--border)]">
                  <input
                    type="text"
                    placeholder="Buscar assessor..."
                    value={assessorQuery}
                    onChange={(e) => setAssessorQuery(e.target.value)}
                    className="w-full text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--s2)]"
                  />
                </div>
                <div className="max-h-[280px] overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => { setParam({ assessor: null }); setOpenAssessor(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--s2)] transition-colors ${!filters.assessor ? 'text-[var(--gold)] font-semibold' : ''}`}
                  >
                    Todos os assessores
                  </button>
                  {assessoresFiltradas.map(a => (
                    <button
                      key={a.nome}
                      type="button"
                      onClick={() => { setParam({ assessor: a.nome }); setOpenAssessor(false) }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--s2)] flex justify-between transition-colors ${filters.assessor === a.nome ? 'text-[var(--gold)] font-semibold' : ''}`}
                    >
                      <span>{a.nome}</span>
                      <span className="subtle text-[11px]">{a.count}×</span>
                    </button>
                  ))}
                  {assessoresFiltradas.length === 0 && (
                    <div className="px-3 py-2 text-xs subtle">Nenhum assessor encontrado.</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Limpar */}
        {(filters.assessor || filters.period !== 'this_year') && (
          <button
            type="button"
            onClick={() => setParam({ period: null, from: null, to: null, assessor: null })}
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs subtle hover:text-[var(--text)] transition-colors"
          >
            <X size={12} /> limpar
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Hero (próximo leilão) ──────────────────────────────────────────────────

function Hero({ data }: { data: ProximoLeilao | null }) {
  const { d, h, m, s, done } = useCountdown(data?.targetTs ?? null)

  if (!data) {
    return (
      <div className="hero-banner">
        <div className="hero-greeting">Próximo leilão</div>
        <div className="hero-title">Nenhum leilão agendado.</div>
        <div className="hero-sub">Cadastre um novo evento na página Leilões.</div>
      </div>
    )
  }

  const statusBadge =
    data.status === 'confirmado' ? <span className="badge olive">Confirmado</span> :
    data.status === 'negociacao' ? <span className="badge amber">Em negociação</span> :
    <span className="badge">{data.status}</span>

  const dias = data.diasParaProximo
  const quando =
    dias === 0 ? 'hoje' :
    dias === 1 ? 'amanhã' :
    typeof dias === 'number' && dias > 0 ? `em ${dias} dia${dias === 1 ? '' : 's'}` :
    'há alguns dias'

  return (
    <div className="hero-banner">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 relative z-[1]">
        <div className="flex gap-5">
          <div
            className="shrink-0 flex flex-col items-center justify-center text-center"
            style={{
              width: 84, height: 96,
              borderRadius: 'var(--r-lg)',
              background: 'linear-gradient(180deg, var(--gold) 0%, var(--gold-dark) 100%)',
              color: '#1a1a1a',
              boxShadow: '0 6px 18px rgba(166, 139, 75, 0.18)',
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{data.wk}</div>
            <div className="text-3xl font-black leading-none my-1">{data.day}</div>
            <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{data.mo}</div>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="badge gold">
                <Gavel size={11} /> Próximo leilão
              </span>
              {statusBadge}
              <span className="badge">
                <Calendar size={11} /> {quando}
                {data.horario ? ` · ${data.horario}` : ''}
              </span>
            </div>
            <div className="hero-title">
              {data.nome}{data.tipo ? <span className="muted text-[16px] font-normal"> · {data.tipo}</span> : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[12px] muted">
              <span>{fmtNum(data.animais)} animais catalogados</span>
              {data.meta_bula > 0 && <span>· Meta {fmtBRLCompact(data.meta_bula)}</span>}
              {data.expectativa > 0 && <span>· Expectativa {fmtBRLCompact(data.expectativa)}</span>}
              {data.leiloeira && <span>· {data.leiloeira}</span>}
            </div>
            {data.local && (
              <div className="flex items-center gap-1.5 mt-2 text-[12px] subtle">
                <MapPin size={12} /> {data.local}
              </div>
            )}
          </div>
        </div>

        {data.targetTs != null && !done && (
          <div className="flex gap-2 shrink-0 self-start">
            {[
              { v: pad2(d), l: 'dias' },
              { v: pad2(h), l: 'horas' },
              { v: pad2(m), l: 'min' },
              { v: pad2(s), l: 'seg' },
            ].map(({ v, l }) => (
              <div
                key={l}
                className="text-center px-2.5 py-2"
                style={{
                  minWidth: 56,
                  borderRadius: 'var(--r)',
                  background: 'var(--s2)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="text-xl font-black tabular-nums" style={{ letterSpacing: '-0.02em' }}>{v}</div>
                <div className="text-[9px] uppercase tracking-wider subtle">{l}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Próximos leilões (lista compacta — NÃO duplica fechamento) ────────────

function UpcomingList({ rows }: { rows: ProximoLeilaoRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="card">
        <div className="card-h"><div className="card-t">Próximos leilões</div></div>
        <div className="card-b subtle text-sm">Sem leilões agendados.</div>
      </div>
    )
  }
  return (
    <div className="card card-p0">
      <div className="card-h">
        <div className="card-t">Próximos leilões</div>
        <Link href="/sistema/leiloes" className="text-[11px] subtle hover:text-[var(--gold)] transition-colors">
          ver todos →
        </Link>
      </div>
      <div className="card-b">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 60 }}>Quando</th>
              <th>Leilão</th>
              <th className="text-right" style={{ width: 100 }}>Animais</th>
              <th style={{ width: 130 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>
                  <div className="text-[15px] font-bold leading-none">{r.d}</div>
                  <div className="text-[10px] uppercase tracking-wider subtle">{r.m}</div>
                </td>
                <td>
                  <div className="font-semibold">{r.title}</div>
                  <div className="text-[11px] subtle">{r.type || '—'}</div>
                </td>
                <td className="text-right tabular-nums">{fmtNum(r.animais)}</td>
                <td>
                  {r.status === 'ok' && <span className="badge olive">{r.statusLabel}</span>}
                  {r.status === 'warn' && <span className="badge amber">{r.statusLabel}</span>}
                  {r.status === 'pend' && <span className="badge">{r.statusLabel}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Atividade recente ──────────────────────────────────────────────────────

function ActivityCard({ items, title, href }: { items: FeedItem[]; title: string; href: string }) {
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-t">{title}</div>
        {items.length > 0 && (
          <Link href={href} className="text-[11px] subtle hover:text-[var(--gold)]">ver mais →</Link>
        )}
      </div>
      <div className="card-b">
        {items.length === 0 ? (
          <div className="subtle text-sm">Sem atividade recente.</div>
        ) : (
          <ul className="space-y-2.5">
            {items.map(it => (
              <li key={it.id} className="flex justify-between gap-3 text-sm">
                <span className="line-clamp-2" dangerouslySetInnerHTML={{ __html: it.text }} />
                <span className="subtle text-[11px] shrink-0">{it.when}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Pulso da operação: CRM (funil de leads) ────────────────────────────────

const GOLD = '#A68B4B'

function PulseChip({ icon: Icon, label, value, tone }: {
  icon: React.ElementType; label: string; value: string; tone?: 'gold' | 'red'
}) {
  const color = tone === 'gold' ? GOLD : tone === 'red' ? '#ef4444' : undefined
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 dark:border-[#2A2A2A] px-3 py-2.5 min-w-0">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: color ? `${color}1A` : 'var(--s2)', color: color ?? 'var(--text2)' }}
      >
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <p className="text-base font-black leading-none tabular-nums" style={{ color: color ?? undefined }}>{value}</p>
        <p className="text-[9px] uppercase tracking-wider text-gray-400 truncate mt-1">{label}</p>
      </div>
    </div>
  )
}

function CrmPulseCard({ crm, periodLabel }: { crm: CrmPulse; periodLabel: string }) {
  const funnelMax = Math.max(1, ...crm.funnel.map(n => n.value))
  const pipelineTotal = crm.funnel.reduce((s, n) => s + n.value, 0)
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-1.5">
            <Users size={13} className="text-[#A68B4B]" /> CRM · Pipeline de leads
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">Leads ativos no CRM por etapa</p>
        </div>
        <Link
          href="/sistema/leads"
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#A68B4B] hover:opacity-80 transition-opacity"
        >
          abrir <ArrowUpRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <PulseChip icon={Users} label="Ativos" value={fmtNum(crm.totalAtivos)} />
        <PulseChip icon={UserPlus} label={`Novos · ${periodLabel}`} value={fmtNum(crm.novosPeriodo)} tone="gold" />
        <PulseChip icon={StarIcon} label="MQL" value={fmtNum(crm.mql)} tone="gold" />
        <PulseChip icon={Flame} label="Prior. alta" value={fmtNum(crm.altaPrioridade)} tone="red" />
      </div>

      {/* Distribuição do pipeline por etapa (barras + % do pipeline) */}
      <div className="space-y-2.5 mt-auto">
        {crm.funnel.map((n) => {
          const share = pipelineTotal > 0 ? Math.round((n.value / pipelineTotal) * 100) : 0
          return (
            <div key={n.label} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-[10px] font-semibold text-gray-600 dark:text-gray-300 text-right truncate">{n.label}</span>
              <div className="flex-1 h-6 rounded-lg bg-gray-50 dark:bg-[#1A1A1A] overflow-hidden relative">
                <div
                  className="h-full rounded-lg transition-all duration-700 flex items-center px-2"
                  style={{ width: `${Math.max((n.value / funnelMax) * 100, 6)}%`, background: `linear-gradient(90deg, ${n.color}cc, ${n.color})` }}
                >
                  <span className="text-[11px] font-black text-white tabular-nums drop-shadow">{fmtNum(n.value)}</span>
                </div>
              </div>
              <span className="w-9 shrink-0 text-right text-[10px] font-bold tabular-nums text-gray-400">{share}%</span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-50 dark:border-[#262626] text-[10px] text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Fila de entrada <b className="text-gray-600 dark:text-gray-300 tabular-nums">{fmtNum(crm.entrada)}</b>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" /> Perdidos <b className="text-gray-600 dark:text-gray-300 tabular-nums">{fmtNum(crm.perdidos)}</b>
        </span>
      </div>
    </div>
  )
}

// ─── Pulso da operação: Atendimento (WhatsApp) ──────────────────────────────

function DualSpark({ a, b, height = 56 }: { a: number[]; b: number[]; height?: number }) {
  const n = Math.max(a.length, b.length)
  if (n < 2) return null
  const max = Math.max(1, ...a, ...b)
  const w = 100
  const stepX = w / (n - 1)
  const toPts = (data: number[]) =>
    data.map((v, i) => `${(i * stepX).toFixed(2)},${(height - (v / max) * height).toFixed(2)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="atd-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GOLD} stopOpacity="0.28" />
          <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${toPts(a)} ${w},${height}`} fill="url(#atd-area)" />
      <polyline points={toPts(a)} fill="none" stroke={GOLD} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <polyline points={toPts(b)} fill="none" stroke="#22c55e" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function AtendimentoPulseCard({ atd }: { atd: AtendimentoGrowth }) {
  const topOrigem = atd.por_origem.filter(o => o.enviados >= 3).slice(0, 3)
  const maxOrigem = Math.max(1, ...topOrigem.map(o => o.enviados))
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-1.5">
            <MessageCircle size={13} className="text-[#A68B4B]" /> Atendimento · WhatsApp
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">Abordagem → resposta · últimos 90 dias</p>
        </div>
        <Link
          href="/sistema/whatsapp"
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#A68B4B] hover:opacity-80 transition-opacity"
        >
          abrir <ArrowUpRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl border border-gray-100 dark:border-[#2A2A2A] px-3 py-3">
          <div className="flex items-center gap-1.5 text-gray-400 mb-1.5"><Send size={12} /><span className="text-[9px] uppercase tracking-wider">Contatados</span></div>
          <p className="text-2xl font-black leading-none tabular-nums text-gray-900 dark:text-white">{fmtNum(atd.disparados)}</p>
        </div>
        <div className="rounded-xl border border-gray-100 dark:border-[#2A2A2A] px-3 py-3">
          <div className="flex items-center gap-1.5 text-gray-400 mb-1.5"><Reply size={12} /><span className="text-[9px] uppercase tracking-wider">Responderam</span></div>
          <p className="text-2xl font-black leading-none tabular-nums text-emerald-500">{fmtNum(atd.responderam)}</p>
        </div>
        <div className="rounded-xl border border-[#A68B4B]/30 bg-[#A68B4B]/5 px-3 py-3">
          <div className="flex items-center gap-1.5 text-[#A68B4B] mb-1.5"><span className="text-[9px] uppercase tracking-wider font-bold">Taxa</span></div>
          <p className="text-2xl font-black leading-none tabular-nums text-[#A68B4B]">{atd.pct}%</p>
        </div>
      </div>

      <div className="relative">
        <DualSpark a={atd.serie_contatados} b={atd.serie_responderam} />
        <div className="flex items-center gap-4 mt-1.5">
          <span className="flex items-center gap-1.5 text-[9px] text-gray-400"><span className="w-2 h-0.5 rounded" style={{ background: GOLD }} /> contatados/dia</span>
          <span className="flex items-center gap-1.5 text-[9px] text-gray-400"><span className="w-2 h-0.5 rounded bg-emerald-500" /> responderam</span>
        </div>
      </div>

      {topOrigem.length > 0 && (
        <div className="space-y-1.5 mt-4 pt-3 border-t border-gray-50 dark:border-[#262626]">
          <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1">Taxa por origem de disparo</p>
          {topOrigem.map(o => (
            <div key={o.origin} className="flex items-center gap-2.5">
              <span className="w-32 shrink-0 text-[10px] text-gray-600 dark:text-gray-300 truncate">{o.origin}</span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(o.enviados / maxOrigem) * 100}%`, background: GOLD }} />
              </div>
              <span className="w-24 shrink-0 text-right text-[9px] text-gray-400 tabular-nums">{fmtNum(o.enviados)} · {o.pct}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function DashboardClient(props: DashboardProps) {
  const f = props.filters
  const feedLeads = props.feed.filter(i => i.kind === 'lead').slice(0, 6)

  return (
    <div className="space-y-6">
      <div className="page-head">
        <h1>
          <small>Dashboard</small>
          Visão geral
          <span className="block text-[12px] font-normal subtle mt-2">{props.today}</span>
        </h1>
        <span className="badge olive"><span className="w-1.5 h-1.5 rounded-full bg-[var(--olive)]" /> Sistema ativo</span>
      </div>

      <Hero data={props.proximo} />

      <FilterBar filters={f} />

      {/* Pulso da operação: CRM + Atendimento (independentes do filtro de leilão) */}
      <div className="grid lg:grid-cols-2 gap-4 items-stretch">
        <CrmPulseCard crm={props.crm} periodLabel={f.label} />
        {props.atendimento
          ? <AtendimentoPulseCard atd={props.atendimento} />
          : (
            <div className="rounded-2xl border border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] p-5 flex items-center justify-center">
              <span className="text-xs subtle">Métricas de atendimento indisponíveis.</span>
            </div>
          )}
      </div>

      <div className="sec-label">Leilões &amp; vendas</div>
      <LeiloesAnalyticsBlock items={props.fechamentoItems} />

      <div className="g2">
        <UpcomingList rows={props.upcoming} />
        <ActivityCard items={feedLeads} title="Leads recentes" href="/sistema/leads" />
      </div>
    </div>
  )
}
