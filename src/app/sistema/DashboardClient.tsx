'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Gavel, Target, Trophy, Medal, BarChart3, Calendar, MapPin,
} from 'lucide-react'

// ─── Types (compatíveis com o page.tsx que injeta dados) ────────────────────

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

export type VgvPoint = { label: string; meta: number; vgv: number; prev: number }
export type FunnelStep = { label: string; n: number; pct: number }
export type FeedItem = {
  id: string
  kind: 'lead' | 'wpp' | 'fechamento' | 'task' | 'ai'
  text: string
  when: string
}
export type PerformanceData = {
  ticketMedio: number
  maiorLance: number
  lotesVendidos: number
  lotesOfertados: number
  taxaConversao: number
  animaisVendidos: number
  compradoresUnicos: number
  estadosUnicos: number
}
export type RegionItem = { uf: string; estado: string; vgv: number; lotes: number; pct: number }
export type LeilaoTopItem = { nome: string; data: string; vgv: number; lotesVendidos: number; animais: number }
export type CompradorItem = { fazenda: string; uf: string; vgv: number; lotes: number }
export type LanceItem = { lote: string; fazenda: string; uf: string; vgv: number; leilao: string }
export type CatCount = { label: string; count: number }
export type ReservaStatusItem = { status: string; label: string; count: number; valor: number }

export type DashboardProps = {
  today: string
  proximo: ProximoLeilao | null
  upcoming: ProximoLeilaoRow[]
  kpi: {
    upcomingCount: number
    confirmedCount: number
    totalMetaBula: number
    totalAnimaisUpcoming: number
    totalVgvFechado: number
    totalFechamentos: number
    activeLeads: number
    hotLeads: number
    totalLeads: number
    ticketMedio: number
    vgvSpark: number[]
    metaSpark: number[]
    leadsSpark: number[]
  }
  vgv: VgvPoint[]
  funnel: FunnelStep[]
  feed: FeedItem[]
  performance: PerformanceData
  regions: RegionItem[]
  rankings: {
    topLeiloes: LeilaoTopItem[]
    compradores: CompradorItem[]
    lances: LanceItem[]
  }
  formula: {
    produtosTotal: number
    produtosByCategory: CatCount[]
    reservasAtivas: number
    reservasNovas: number
    reservasValor: number
    reservasByStatus: ReservaStatusItem[]
  }
  aiInsight: { projection: number; metaTotal: number; pct: number; hint: string }
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

// ─── KPI row ────────────────────────────────────────────────────────────────

type Kpi = { label: string; value: string; sub?: string; icon: React.ReactNode; href?: string }

function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <div className="slim-row">
      {items.map((it, i) => (
        <>
          {it.href ? (
            <Link key={`k-${i}`} href={it.href} className="slim-kpi block hover:bg-[var(--s2)] transition-colors">
              <div className="flex items-center justify-center gap-1.5 mb-1.5 subtle">{it.icon}</div>
              <div className="slim-kpi-val">{it.value}</div>
              <div className="slim-kpi-lbl">{it.label}</div>
              {it.sub && <div className="slim-kpi-tag">{it.sub}</div>}
            </Link>
          ) : (
            <div key={`k-${i}`} className="slim-kpi">
              <div className="flex items-center justify-center gap-1.5 mb-1.5 subtle">{it.icon}</div>
              <div className="slim-kpi-val">{it.value}</div>
              <div className="slim-kpi-lbl">{it.label}</div>
              {it.sub && <div className="slim-kpi-tag">{it.sub}</div>}
            </div>
          )}
          {i < items.length - 1 && <div key={`d-${i}`} className="slim-div" />}
        </>
      ))}
    </div>
  )
}

// ─── Próximos leilões (lista compacta) ──────────────────────────────────────

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

// ─── Performance card ───────────────────────────────────────────────────────

function PerformanceCard({ p }: { p: PerformanceData }) {
  const items = [
    { l: 'Ticket médio', v: fmtBRLCompact(p.ticketMedio) },
    { l: 'Maior lance', v: fmtBRLCompact(p.maiorLance) },
    { l: 'Lotes vendidos', v: `${fmtNum(p.lotesVendidos)}/${fmtNum(p.lotesOfertados)}` },
    { l: 'Conversão', v: `${p.taxaConversao.toFixed(1)}%` },
    { l: 'Animais vendidos', v: fmtNum(p.animaisVendidos) },
    { l: 'Compradores únicos', v: fmtNum(p.compradoresUnicos) },
  ]
  return (
    <div className="card">
      <div className="card-h"><div className="card-t">Performance · fechamentos</div></div>
      <div className="card-b grid grid-cols-2 gap-x-4 gap-y-3">
        {items.map(({ l, v }) => (
          <div key={l}>
            <div className="text-[10px] uppercase tracking-wider subtle mb-0.5">{l}</div>
            <div className="text-[15px] font-bold tabular-nums">{v}</div>
          </div>
        ))}
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
                <span className="line-clamp-2">{it.text}</span>
                <span className="subtle text-[11px] shrink-0">{it.when}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Top leilões por VGV ────────────────────────────────────────────────────

function TopLeiloes({ rows }: { rows: LeilaoTopItem[] }) {
  return (
    <div className="card card-p0">
      <div className="card-h"><div className="card-t">Top leilões · VGV</div></div>
      <div className="card-b">
        {rows.length === 0 ? (
          <div className="subtle text-sm">Sem fechamentos registrados.</div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Leilão</th><th className="text-right">Lotes</th><th className="text-right">VGV</th></tr></thead>
            <tbody>
              {rows.slice(0, 6).map(r => (
                <tr key={r.nome + r.data}>
                  <td>
                    <div className="font-semibold">{r.nome}</div>
                    <div className="text-[11px] subtle">{r.data.split('-').reverse().join('/')}</div>
                  </td>
                  <td className="text-right tabular-nums">{fmtNum(r.lotesVendidos)}</td>
                  <td className="text-right font-bold tabular-nums">{fmtBRLCompact(r.vgv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function DashboardClient(props: DashboardProps) {
  const k = props.kpi
  const feedFechamento = props.feed.filter(i => i.kind === 'fechamento').slice(0, 6)
  const feedLeads = props.feed.filter(i => i.kind === 'lead').slice(0, 6)

  const kpis: Kpi[] = [
    { label: 'Próx. leilões', value: String(k.upcomingCount), sub: `${k.confirmedCount} confirmado${k.confirmedCount === 1 ? '' : 's'}`, icon: <Gavel size={12} />, href: '/sistema/leiloes' },
    { label: 'Meta confirmada', value: fmtBRLCompact(k.totalMetaBula), sub: `${fmtNum(k.totalAnimaisUpcoming)} animais`, icon: <Target size={12} />, href: '/sistema/leiloes' },
    { label: 'VGV fechado', value: fmtBRLCompact(k.totalVgvFechado), sub: `${k.totalFechamentos} fechamento${k.totalFechamentos === 1 ? '' : 's'}`, icon: <Trophy size={12} />, href: '/sistema/leiloes/fechamento' },
    { label: 'Ticket médio', value: fmtBRLCompact(k.ticketMedio), sub: 'Por lote vendido', icon: <BarChart3 size={12} />, href: '/sistema/leiloes/fechamento' },
    { label: 'Fechamentos', value: String(k.totalFechamentos), sub: `${fmtNum(props.performance.animaisVendidos)} animais`, icon: <Medal size={12} />, href: '/sistema/leiloes/fechamento' },
  ]

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

      <KpiRow items={kpis} />

      <div className="g2">
        <UpcomingList rows={props.upcoming} />
        <PerformanceCard p={props.performance} />
      </div>

      <div className="g2">
        <ActivityCard items={feedFechamento} title="Últimos fechamentos" href="/sistema/leiloes/fechamento" />
        <ActivityCard items={feedLeads} title="Leads recentes" href="/sistema/leads" />
      </div>

      <TopLeiloes rows={props.rankings.topLeiloes} />
    </div>
  )
}
