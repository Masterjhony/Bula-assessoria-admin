'use client'

import '../../dashboard.css'
import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  BarChart3, Calendar, ChevronRight, ChevronDown, Download, FileBarChart, FileText, Hash,
  Layers, Loader2, MapPin, Percent, Sparkles,
  TrendingUp, Trophy, DollarSign,
  RadioTower, Tag, Briefcase,
} from 'lucide-react'
import { generateFechamentoPDF } from '@/lib/fechamento-pdf'
import { normalizeAssessorNome } from '@/lib/assessor-normalize'

// ── Types ───────────────────────────────────────────────────────────────────

type Assessor = {
  posicao: number; nome: string; empresa: string
  transacoes: number; animais: number; vgv: number
  ticket_medio: number; pct_total: number
}
type Estado = { uf: string; estado: string; lotes: number; animais: number; vgv: number; pct_total: number }
type Comprador = { rank: number; fazenda: string; comprador: string; cidade: string; uf: string; lotes: number; animais: number; vgv: number }
type Lance = { lote: string; fazenda: string; comprador: string; uf: string; assessor: string; empresa: string; animais: number; parcela: number; vgv: number }

type Fechamento = {
  id: string; nome: string; data: string; local: string
  lotes_ofertados: number; lotes_vendidos: number; animais_vendidos: number
  vgv_total: number; ticket_medio: number; maior_lance: number
  compradores_unicos: number; estados_alcancados: number
  por_assessor: Assessor[]; por_estado: Estado[]
  compradores: Comprador[]; lances: Lance[]
  comissao_assessoria: number; receita_bula: number; sobra_bruta: number
  observacoes: string
}

type Cronograma = {
  id: string; data: string; dia_semana: string | null; hora: string | null
  nome: string; criador: string | null; presencial: string | null
  leiloeira: string | null; raca: string | null; qtd_animais: number | null
  sexo: string | null; comissao: string | null; contrato: string | null
  faturamento_previsto: number | null; faturamento_realizado: number | null
  venda_bula: number | null; comissao_receber: string | null; recebido: string | null
}

type Lead = {
  id: string; nome: string; status: string | null; prioridade: string | null
  interesse: string | null; source: string | null; medium: string | null
  campaign: string | null; origem: string | null; stage: string | null
  valor_estimado: number | null; probabilidade: number | null
  created_at: string; data_estimada_fechamento: string | null
  estado: string | null; cidade: string | null
}

type Payload = {
  fechamentos: Fechamento[]
  cronograma: Cronograma[]
  leads: Lead[]
  range: { from: string | null; to: string | null }
}

type ReportKey =
  | 'mensal' | 'comparativo' | 'comissoes' | 'assessor' | 'cobertura'
  | 'categoria' | 'ranking' | 'pdf'

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0)

const fmtBRLCompact = (v: number) => {
  const abs = Math.abs(v); const sign = v < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(2).replace('.', ',')}M`
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(0)}k`
  return fmtBRL(v)
}
const fmtNum = (v: number) => (v || 0).toLocaleString('pt-BR')
const PCT = (v: number) => `${(v * 100).toFixed(1)}%`

const MES_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function ymKey(iso: string) {
  // YYYY-MM
  return iso.slice(0, 7)
}
function ymLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return `${MES_ABBR[m - 1] ?? '—'}/${String(y).slice(2)}`
}

function normalize(s: string | null | undefined) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

const EMPRESA_BULA_FORMULA = 'Bula × Fórmula'
function normalizeEmpresaGrupo(empresa: string | null | undefined): string {
  const e = (empresa ?? '').trim()
  if (!e) return 'Não informado'
  const lower = e.toLowerCase()
  if (lower.startsWith('bula') || lower.startsWith('fórmula') || lower.startsWith('formula')) {
    return EMPRESA_BULA_FORMULA
  }
  return e
}

function csvEscape(v: unknown) {
  const s = v == null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}
function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = '﻿' + rows.map(r => r.map(csvEscape).join(';')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Mapeia fechamentos para itens do cronograma (mesma data + match por nome/criador)
function matchFechamentoToCronograma(f: Fechamento, cronos: Cronograma[]): Cronograma | null {
  const sameDate = cronos.filter(c => c.data === f.data)
  if (sameDate.length === 0) return null
  if (sameDate.length === 1) return sameDate[0]
  const fNorm = normalize(f.nome)
  const fragment = fNorm.slice(0, 6)
  return (
    sameDate.find(c => normalize(c.nome).includes(fragment))
    ?? sameDate.find(c => normalize(c.criador).includes(fragment))
    ?? sameDate[0]
  )
}

// ── Section UI ──────────────────────────────────────────────────────────────

type ReportItem = { key: ReportKey; label: string; icon: React.ElementType }
type ReportGroup = { id: string; label: string; items: ReportItem[] }

const REPORT_GROUPS: ReportGroup[] = [
  {
    id: 'fechamentos',
    label: 'Fechamentos',
    items: [
      { key: 'mensal',      label: 'Mensal',       icon: Calendar  },
      { key: 'comparativo', label: 'Comparativo',  icon: BarChart3 },
      { key: 'ranking',     label: 'Ranking',      icon: Trophy    },
      { key: 'pdf',         label: 'Por Leilão',   icon: FileText },
    ],
  },
  {
    id: 'comercial',
    label: 'Comercial',
    items: [
      { key: 'assessor',  label: 'Vendas por Assessor', icon: Briefcase  },
      { key: 'comissoes', label: 'Comissões',           icon: DollarSign },
      { key: 'cobertura', label: 'Cobertura',           icon: RadioTower },
      { key: 'categoria', label: 'Categoria',           icon: Tag        },
    ],
  },
]

// ── Page ────────────────────────────────────────────────────────────────────

const VALID_REPORTS: ReportKey[] = ['mensal', 'comparativo', 'comissoes', 'assessor', 'cobertura', 'categoria', 'ranking', 'pdf']

export default function RelatoriosPage() {
  // useSearchParams precisa estar dentro de Suspense (Next 16) para o build estático.
  return (
    <Suspense fallback={<div className="rl-loading"><Loader2 size={28} className="rl-spin" /><span>Carregando…</span></div>}>
      <RelatoriosPageInner />
    </Suspense>
  )
}

function RelatoriosPageInner() {
  const today = new Date()
  const defaultFrom = new Date(today.getFullYear(), today.getMonth() - 5, 1).toISOString().slice(0, 10)
  const defaultTo = today.toISOString().slice(0, 10)

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const initialReport: ReportKey = (() => {
    const r = searchParams.get('report')
    return (r && (VALID_REPORTS as string[]).includes(r)) ? (r as ReportKey) : 'mensal'
  })()

  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Payload | null>(null)
  const [report, setReport] = useState<ReportKey>(initialReport)

  // Sincroniza state ↔ URL: troca de aba atualiza ?report=, e link externo
  // (ex: ícone de olho do FechamentoView) navega direto para a aba certa.
  useEffect(() => {
    const r = searchParams.get('report')
    if (r && (VALID_REPORTS as string[]).includes(r) && r !== report) {
      setReport(r as ReportKey)
    }
  }, [searchParams])

  function changeReport(r: ReportKey) {
    setReport(r)
    const params = new URLSearchParams(searchParams.toString())
    if (r === 'mensal') params.delete('report')
    else params.set('report', r)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from, to }).toString()
      const res = await fetch(`/api/leiloes/relatorios?${qs}`, { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [from, to])

  useEffect(() => { fetchData() }, [fetchData])

  type PeriodPreset = 'mes' | 'mes_passado' | '3m' | '6m' | 'ano'
  const applyPreset = (preset: PeriodPreset) => {
    const today = new Date()
    const y = today.getFullYear()
    const m = today.getMonth()
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    if (preset === 'mes') {
      setFrom(fmt(new Date(y, m, 1)))
      setTo(fmt(today))
    } else if (preset === 'mes_passado') {
      setFrom(fmt(new Date(y, m - 1, 1)))
      setTo(fmt(new Date(y, m, 0)))
    } else if (preset === '3m') {
      setFrom(fmt(new Date(y, m - 2, 1)))
      setTo(fmt(today))
    } else if (preset === '6m') {
      setFrom(fmt(new Date(y, m - 5, 1)))
      setTo(fmt(today))
    } else {
      setFrom(fmt(new Date(y, 0, 1)))
      setTo(fmt(today))
    }
  }

  const activePreset: PeriodPreset | null = (() => {
    const today = new Date()
    const y = today.getFullYear()
    const m = today.getMonth()
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const todayStr = fmt(today)
    if (to !== todayStr && !(from === fmt(new Date(y, m - 1, 1)) && to === fmt(new Date(y, m, 0)))) return null
    if (from === fmt(new Date(y, m, 1)) && to === todayStr) return 'mes'
    if (from === fmt(new Date(y, m - 1, 1)) && to === fmt(new Date(y, m, 0))) return 'mes_passado'
    if (from === fmt(new Date(y, m - 2, 1)) && to === todayStr) return '3m'
    if (from === fmt(new Date(y, m - 5, 1)) && to === todayStr) return '6m'
    if (from === fmt(new Date(y, 0, 1)) && to === todayStr) return 'ano'
    return null
  })()

  return (
    <div className="dcl-root rl-root">
      {/* Page header */}
      <div className="dcl-pagehead">
        <div>
          <h1>Relatórios <span className="dcl-serif">de leilão</span></h1>
          <div className="dcl-sub">Inteligência consolidada de fechamentos, cronograma e funil comercial</div>
        </div>
        <div className="dcl-pagehead-right">
          <div className="rl-presets" role="group" aria-label="Atalhos de período">
            {([
              ['mes', 'Este mês'],
              ['mes_passado', 'Mês passado'],
              ['3m', '3 meses'],
              ['6m', '6 meses'],
              ['ano', 'Este ano'],
            ] as [PeriodPreset, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className={`rl-preset${activePreset === key ? ' rl-preset-on' : ''}`}
                aria-pressed={activePreset === key}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="rl-rangebox">
            <Calendar size={13} className="rl-rng-ico" />
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="rl-rng-input" />
            <span className="rl-rng-sep">→</span>
            <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="rl-rng-input" />
          </div>
          <Link href="/leiloes/fechamento" className="rl-link">
            <FileBarChart size={13} /> Ver fechamentos
            <ChevronRight size={12} />
          </Link>
        </div>
      </div>

      {/* Nav grouped */}
      <nav className="rl-nav" aria-label="Relatórios">
        {REPORT_GROUPS.map((group, gi) => (
          <div key={group.id} className="rl-nav-group">
            <span className="rl-nav-group-label">
              <span className="rl-nav-group-num">{String(gi + 1).padStart(2, '0')}</span>
              {group.label}
            </span>
            <div className="rl-nav-pills">
              {group.items.map(item => {
                const Icon = item.icon
                const active = report === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => changeReport(item.key)}
                    className={`rl-pill${active ? ' rl-pill-on' : ''}`}
                    aria-pressed={active}
                  >
                    <span className="rl-pill-ico"><Icon size={14} strokeWidth={1.7} /></span>
                    <span className="rl-pill-label">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Body */}
      {loading || !data ? (
        <div className="rl-loading">
          <Loader2 size={28} className="rl-spin" />
          <span>Carregando relatório…</span>
        </div>
      ) : (
        <ReportRouter report={report} data={data} from={from} to={to} />
      )}

      <style jsx global>{`
        .rl-root { min-height: 100%; padding-bottom: 40px; }

        .rl-rangebox {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 10px; border-radius: 10px;
          background: var(--dcl-bg-card); border: 1px solid var(--dcl-line);
        }
        .rl-presets {
          display: inline-flex; gap: 4px; flex-wrap: wrap;
          padding: 4px; border-radius: 10px;
          background: var(--dcl-bg-card); border: 1px solid var(--dcl-line);
        }
        .rl-preset {
          padding: 5px 9px; border-radius: 7px;
          background: transparent; border: 1px solid transparent;
          color: var(--dcl-ink-3); font-size: 11px; font-weight: 500;
          letter-spacing: -0.005em; cursor: pointer; font-family: inherit;
          white-space: nowrap;
          transition: color .15s, background .15s, border-color .15s;
        }
        .rl-preset:hover { color: var(--dcl-ink); background: var(--dcl-bg-card-2); }
        .rl-preset.rl-preset-on {
          color: var(--dcl-gold);
          background: var(--dcl-gold-bg);
          border-color: var(--dcl-gold-line);
        }
        .rl-rng-ico { color: var(--dcl-gold); }
        .rl-rng-sep { color: var(--dcl-ink-3); font-size: 12px; }
        .rl-rng-input {
          background: transparent; border: none; outline: none;
          color: var(--dcl-ink); font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12px; padding: 2px 0;
          color-scheme: dark;
        }
        :where(html:not(.dark)) .rl-rng-input { color-scheme: light; }
        .rl-link {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 12px; border-radius: 10px;
          background: var(--dcl-gold-bg); border: 1px solid var(--dcl-gold-line);
          color: var(--dcl-gold); font-size: 12px; font-weight: 500;
          letter-spacing: -0.005em; text-decoration: none;
          transition: background .15s, border-color .15s;
        }
        .rl-link:hover { background: rgba(212,168,92,0.14); border-color: rgba(212,168,92,0.45); }

        /* Grouped report nav */
        .rl-nav {
          display: flex; flex-wrap: wrap;
          gap: 14px 28px;
          margin: 20px 0 26px;
          padding: 18px 20px 16px;
          background:
            radial-gradient(1100px 220px at 0% 0%, rgba(212,168,92,0.07), transparent 55%),
            var(--dcl-bg-card);
          border: 1px solid var(--dcl-line);
          border-radius: 16px;
          position: relative;
          overflow: hidden;
        }
        .rl-nav::before {
          content: '';
          position: absolute; inset: 0;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.02), transparent 40%);
          pointer-events: none;
        }
        .rl-nav-group {
          display: flex; flex-direction: column; gap: 9px;
          min-width: 0; position: relative;
          padding-right: 24px;
        }
        .rl-nav-group + .rl-nav-group {
          padding-left: 24px;
          border-left: 1px solid var(--dcl-line-soft);
        }
        @media (max-width: 900px) {
          .rl-nav { gap: 16px; padding: 16px; }
          .rl-nav-group { padding-right: 0; }
          .rl-nav-group + .rl-nav-group {
            padding-left: 0; border-left: none;
            padding-top: 14px; border-top: 1px solid var(--dcl-line-soft);
            width: 100%;
          }
        }
        .rl-nav-group-label {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase;
          color: var(--dcl-ink-3); font-weight: 600;
          padding-left: 2px;
        }
        .rl-nav-group-num {
          font-family: var(--font-space-grotesk), system-ui, sans-serif;
          font-style: italic; font-weight: 400;
          font-size: 11px; letter-spacing: 0;
          color: var(--dcl-gold);
          opacity: 0.85;
        }
        .rl-nav-pills {
          display: flex; gap: 6px; flex-wrap: wrap;
        }
        .rl-pill {
          display: inline-flex; align-items: center; gap: 9px;
          padding: 7px 12px 7px 7px; border-radius: 999px;
          font-size: 12px; font-weight: 500; letter-spacing: -0.005em;
          color: var(--dcl-ink-2);
          background: var(--dcl-bg-card-2);
          border: 1px solid var(--dcl-line);
          cursor: pointer; font-family: inherit;
          transition: color .18s ease, background .18s ease, border-color .18s ease,
                      transform .18s ease, box-shadow .18s ease;
          white-space: nowrap;
          position: relative;
        }
        .rl-pill:hover {
          color: var(--dcl-ink);
          border-color: var(--dcl-line);
          background: var(--dcl-bg-card);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px -8px rgba(0,0,0,0.5);
        }
        .rl-pill .rl-pill-ico {
          display: inline-flex; align-items: center; justify-content: center;
          width: 24px; height: 24px;
          border-radius: 8px;
          background: rgba(255,255,255,0.04);
          color: var(--dcl-ink-3);
          transition: background .18s, color .18s;
        }
        :where(html:not(.dark)) .rl-pill .rl-pill-ico {
          background: rgba(0,0,0,0.04);
        }
        .rl-pill:hover .rl-pill-ico { color: var(--dcl-ink); }
        .rl-pill-label { line-height: 1; }

        .rl-pill.rl-pill-on {
          color: var(--dcl-gold);
          background: linear-gradient(135deg, rgba(212,168,92,0.18), rgba(212,168,92,0.05));
          border-color: var(--dcl-gold-line);
          box-shadow:
            0 0 0 1px rgba(212,168,92,0.25) inset,
            0 8px 22px -10px rgba(212,168,92,0.45);
          transform: translateY(-1px);
        }
        .rl-pill.rl-pill-on .rl-pill-ico {
          background: rgba(212,168,92,0.22);
          color: var(--dcl-gold);
          box-shadow: 0 0 0 1px rgba(212,168,92,0.18) inset;
        }
        .rl-pill.rl-pill-on::after {
          content: '';
          position: absolute; left: 16px; right: 16px; bottom: -7px;
          height: 2px; border-radius: 2px;
          background: linear-gradient(90deg, transparent, var(--dcl-gold), transparent);
          opacity: 0.55;
        }

        .rl-loading {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding: 80px 0; color: var(--dcl-ink-3);
        }
        .rl-spin { color: var(--dcl-gold); animation: rl-spin 0.9s linear infinite; }
        @keyframes rl-spin { to { transform: rotate(360deg); } }

        /* Report shell */
        .rl-section { display: grid; gap: 16px; }
        .rl-section-head {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 16px; flex-wrap: wrap;
          padding: 4px 0 10px;
        }
        .rl-section-head h2 {
          margin: 0 0 4px; font-size: 22px; font-weight: 500;
          letter-spacing: -0.018em; color: var(--dcl-ink);
        }
        .rl-section-head h2 .dcl-serif { color: var(--dcl-gold); font-weight: 400; }
        .rl-section-head .rl-sub { color: var(--dcl-ink-3); font-size: 12.5px; }

        .rl-export {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 11px; border-radius: 8px;
          background: var(--dcl-bg-card); border: 1px solid var(--dcl-line);
          color: var(--dcl-ink-2); font-size: 11.5px; font-weight: 500;
          cursor: pointer;
          transition: border-color .15s, color .15s;
          letter-spacing: -0.005em;
        }
        .rl-export:hover { border-color: var(--dcl-gold-line); color: var(--dcl-gold); }

        .rl-grid { display: grid; gap: 12px; }
        .rl-grid-3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
        .rl-grid-4 { grid-template-columns: repeat(4, minmax(0,1fr)); }
        .rl-grid-5 { grid-template-columns: repeat(5, minmax(0,1fr)); }
        @media (max-width: 1024px) { .rl-grid-3, .rl-grid-4, .rl-grid-5 { grid-template-columns: repeat(2, minmax(0,1fr)); } }
        @media (max-width: 640px) { .rl-grid-3, .rl-grid-4, .rl-grid-5 { grid-template-columns: 1fr; } }

        .rl-stat {
          background: var(--dcl-bg-card); border: 1px solid var(--dcl-line);
          border-radius: 12px; padding: 14px 16px; min-height: 96px;
        }
        .rl-stat .rl-stat-label {
          font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--dcl-ink-3); display: flex; align-items: center; gap: 6px;
        }
        .rl-stat .rl-stat-val {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 22px; font-weight: 500; letter-spacing: -0.02em;
          margin-top: 8px; color: var(--dcl-ink);
        }
        .rl-stat .rl-stat-sub {
          font-size: 11px; color: var(--dcl-ink-3); margin-top: 4px;
        }
        .rl-stat.rl-stat-gold {
          background: linear-gradient(135deg, rgba(212,168,92,0.10), rgba(212,168,92,0.02));
          border-color: var(--dcl-gold-line);
        }
        .rl-stat.rl-stat-gold .rl-stat-val { color: var(--dcl-gold); }

        /* Tables */
        .rl-table-wrap {
          background: var(--dcl-bg-card); border: 1px solid var(--dcl-line);
          border-radius: 14px; overflow: hidden;
        }
        .rl-table-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px; border-bottom: 1px solid var(--dcl-line-soft);
          gap: 12px; flex-wrap: wrap;
        }
        .rl-table-head h3 {
          margin: 0; font-size: 13.5px; font-weight: 600;
          color: var(--dcl-ink); letter-spacing: -0.005em;
        }
        .rl-table-head .rl-sub { font-size: 11px; color: var(--dcl-ink-3); margin-top: 2px; }
        .rl-table-scroll { overflow-x: auto; }
        .rl-table { width: 100%; border-collapse: collapse; }
        .rl-table thead th {
          font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
          font-weight: 600; color: var(--dcl-ink-3);
          padding: 10px 14px; text-align: left;
          background: var(--dcl-bg-card-2);
          border-bottom: 1px solid var(--dcl-line);
          white-space: nowrap;
        }
        .rl-table tbody td {
          padding: 12px 14px; font-size: 12.5px; color: var(--dcl-ink-2);
          border-top: 1px solid var(--dcl-line-soft); vertical-align: middle;
        }
        .rl-table tbody tr:hover td { background: rgba(212,168,92,0.04); }
        .rl-table .rl-num {
          font-family: var(--font-mono), ui-monospace, monospace;
          color: var(--dcl-ink); font-feature-settings: 'tnum';
        }
        .rl-table .rl-gold { color: var(--dcl-gold); font-weight: 500; }
        .rl-table .rl-dim { color: var(--dcl-ink-3); }

        /* Bars */
        .rl-bar {
          position: relative; height: 6px; border-radius: 99px;
          background: var(--dcl-bg-card-2); overflow: hidden;
          min-width: 60px;
        }
        .rl-bar > span {
          position: absolute; left: 0; top: 0; bottom: 0;
          background: linear-gradient(90deg, var(--dcl-gold-2), var(--dcl-gold));
          border-radius: 99px;
          transition: width .3s ease;
        }
        .rl-bar.rl-bar-blue > span { background: linear-gradient(90deg, #3a5d99, #6a8fd4); }
        .rl-bar.rl-bar-green > span { background: linear-gradient(90deg, #2c8d4e, #5db87a); }
        .rl-bar.rl-bar-red > span { background: linear-gradient(90deg, #b34a3d, #e26a5b); }

        /* Pill */
        .rl-tag {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 8px; border-radius: 999px;
          font-size: 10px; font-weight: 600;
          letter-spacing: 0.1em; text-transform: uppercase;
          background: var(--dcl-bg-card-2); border: 1px solid var(--dcl-line);
          color: var(--dcl-ink-2);
        }
        .rl-tag.rl-tag-gold { background: var(--dcl-gold-bg); border-color: var(--dcl-gold-line); color: var(--dcl-gold); }
        .rl-tag.rl-tag-green { background: rgba(93,184,122,0.10); border-color: rgba(93,184,122,0.30); color: #5db87a; }
        .rl-tag.rl-tag-red { background: rgba(226,106,91,0.10); border-color: rgba(226,106,91,0.30); color: #e26a5b; }
        .rl-tag.rl-tag-blue { background: rgba(106,143,212,0.10); border-color: rgba(106,143,212,0.30); color: #6a8fd4; }
        .rl-tag.rl-tag-violet { background: rgba(155,134,196,0.10); border-color: rgba(155,134,196,0.30); color: #9b86c4; }

        /* Empty */
        .rl-empty {
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          padding: 60px 16px; color: var(--dcl-ink-3);
          background: var(--dcl-bg-card); border: 1px dashed var(--dcl-line);
          border-radius: 14px; text-align: center;
        }
        .rl-empty h4 { margin: 0; color: var(--dcl-ink-2); font-size: 13.5px; font-weight: 500; }
        .rl-empty p { margin: 0; font-size: 12px; }

        /* Card */
        .rl-card {
          background: var(--dcl-bg-card); border: 1px solid var(--dcl-line);
          border-radius: 14px; padding: 16px 18px;
        }
        .rl-card-head {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 12px; margin-bottom: 14px;
        }
        .rl-card-head h3 {
          margin: 0; font-size: 13.5px; font-weight: 600;
          color: var(--dcl-ink); letter-spacing: -0.005em;
        }
        .rl-card-head .rl-sub { font-size: 11px; color: var(--dcl-ink-3); margin-top: 2px; }

        .rl-bento { display: grid; grid-template-columns: repeat(12, 1fr); gap: 14px; }
        @media (max-width: 1024px) { .rl-bento { grid-template-columns: repeat(6, 1fr); } }
        @media (max-width: 640px) { .rl-bento { grid-template-columns: 1fr; } }
        .rl-c12 { grid-column: span 12; } .rl-c8 { grid-column: span 8; }
        .rl-c7 { grid-column: span 7; } .rl-c6 { grid-column: span 6; }
        .rl-c5 { grid-column: span 5; } .rl-c4 { grid-column: span 4; }
        @media (max-width: 1024px) {
          .rl-c8, .rl-c7, .rl-c5, .rl-c4 { grid-column: span 6; }
        }
        @media (max-width: 640px) {
          .rl-c12, .rl-c8, .rl-c7, .rl-c6, .rl-c5, .rl-c4 { grid-column: span 1; }
        }

        /* Compare cards */
        .rl-compare-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(260px,1fr)); }
        .rl-cmp-card { padding: 14px 16px; border-radius: 12px; border: 1px solid var(--dcl-line); background: var(--dcl-bg-card); }
        .rl-cmp-card .rl-cmp-name { font-size: 12.5px; font-weight: 600; color: var(--dcl-ink); margin: 0; line-height: 1.3; }
        .rl-cmp-card .rl-cmp-date { font-family: var(--font-mono), ui-monospace, monospace; font-size: 10px; color: var(--dcl-ink-3); margin-top: 2px; }
        .rl-cmp-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--dcl-line-soft); }
        .rl-cmp-row:first-of-type { padding-top: 0; border-top: none; }
        .rl-cmp-row .rl-cmp-label { font-size: 10.5px; color: var(--dcl-ink-3); letter-spacing: 0.04em; }
        .rl-cmp-row .rl-cmp-value { font-family: var(--font-mono), ui-monospace, monospace; font-size: 13px; color: var(--dcl-ink); font-weight: 500; }
        .rl-cmp-row .rl-cmp-value.rl-gold { color: var(--dcl-gold); }
      `}</style>
    </div>
  )
}

// ─── Report Router ──────────────────────────────────────────────────────────

function ReportRouter({ report, data, from, to }: { report: ReportKey; data: Payload; from: string; to: string }) {
  const period = `${from} → ${to}`
  switch (report) {
    case 'mensal':      return <ReportMensal data={data} period={period} />
    case 'comparativo': return <ReportComparativo data={data} period={period} />
    case 'comissoes':   return <ReportComissoes data={data} period={period} />
    case 'assessor':    return <ReportAssessor data={data} period={period} />
    case 'cobertura':   return <ReportCobertura data={data} period={period} />
    case 'categoria':   return <ReportCategoria data={data} period={period} />
    case 'ranking':     return <ReportRanking data={data} period={period} />
    case 'pdf':         return <ReportPDFBrandbook data={data} period={period} />
  }
}

// ── PDF Brandbook (relatórios oficiais por leilão) ──────────────────────────
function ReportPDFBrandbook({ data, period }: { data: Payload; period: string }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const list = useMemo(() => {
    const q = normalize(search)
    const items = [...data.fechamentos].sort((a, b) => (b.data || '').localeCompare(a.data || ''))
    if (!q) return items
    return items.filter(f =>
      normalize(f.nome).includes(q) ||
      normalize(f.local).includes(q)
    )
  }, [data.fechamentos, search])

  const totalVgv = list.reduce((s, f) => s + (f.vgv_total || 0), 0)
  const totalLotesVendidos = list.reduce((s, f) => s + (f.lotes_vendidos || 0), 0)
  const totalLotesOfertados = list.reduce((s, f) => s + (f.lotes_ofertados || 0), 0)
  const coberturaMedia = totalLotesOfertados ? Math.round((totalLotesVendidos / totalLotesOfertados) * 100) : 0
  const totalCompradores = list.reduce((s, f) => s + (f.compradores_unicos || 0), 0)

  async function handleDownload(f: Fechamento) {
    setBusy(f.id)
    try {
      const outros = data.fechamentos.filter(x => x.id !== f.id)
      await generateFechamentoPDF(f, outros)
    } catch (e) {
      console.error('Erro ao gerar PDF:', e)
      alert('Erro ao gerar o PDF. Verifique o console.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rl-section">
      <SectionHead
        title="Relatórios"
        emphasis="por leilão"
        subtitle={`Relatório oficial de fechamento por leilão · ${period}`}
      />

      <div className="rl-grid rl-grid-4">
        <Stat label="Leilões disponíveis" value={String(list.length)} sub="no recorte" gold />
        <Stat label="VGV consolidado" value={fmtBRLCompact(totalVgv)} />
        <Stat
          label="Lotes vendidos"
          value={`${totalLotesVendidos}${totalLotesOfertados ? ` / ${totalLotesOfertados}` : ''}`}
          sub={totalLotesOfertados ? `cobertura média ${coberturaMedia}%` : 'sem oferta registrada'}
        />
        <Stat
          label="Compradores"
          value={String(totalCompradores)}
          sub={list.length ? `≈ ${Math.round(totalCompradores / list.length)} por leilão` : '—'}
        />
      </div>

      <div className="pdfb-toolbar">
        <div className="pdfb-search">
          <FileText size={14} />
          <input
            type="text"
            placeholder="Buscar por nome ou local..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="pdfb-help">
          Cada PDF inclui: capa preta+bronze, síntese, por assessor, por estado, compradores, lances detalhados.
        </div>
      </div>

      {list.length === 0 ? (
        <Empty title="Sem fechamentos no período" message="Ajuste o intervalo de datas ou a busca para visualizar relatórios." />
      ) : (
        <div className="pdfb-grid">
          {list.map(f => {
            const cobertura = f.lotes_ofertados ? Math.round((f.lotes_vendidos / f.lotes_ofertados) * 100) : 0
            const assessores = Array.isArray(f.por_assessor) ? f.por_assessor : []
            const isBusy = busy === f.id
            return (
              <div key={f.id} className="pdfb-card">
                <div className="pdfb-card-spine" />
                <div className="pdfb-card-head">
                  <span className="pdfb-date">
                    <Calendar size={11} />
                    {(() => { const [y, m, d] = f.data.slice(0, 10).split('-'); return `${d}/${m}/${y}` })()}
                  </span>
                  {f.local && <span className="pdfb-local"><MapPin size={11} /> {f.local}</span>}
                </div>
                <h4 className="pdfb-name">{f.nome}</h4>

                <div className="pdfb-kpis">
                  <div className="pdfb-kpi">
                    <div className="pdfb-kpi-v">{fmtBRLCompact(f.vgv_total)}</div>
                    <div className="pdfb-kpi-l">VGV</div>
                  </div>
                  <div className="pdfb-kpi">
                    <div className="pdfb-kpi-v">{f.lotes_vendidos}<span className="pdfb-kpi-of"> / {f.lotes_ofertados || '—'}</span></div>
                    <div className="pdfb-kpi-l">Lotes · {cobertura}%</div>
                  </div>
                  <div className="pdfb-kpi">
                    <div className="pdfb-kpi-v">{f.compradores_unicos || 0}</div>
                    <div className="pdfb-kpi-l">Compradores</div>
                  </div>
                </div>

                <div className="pdfb-card-foot">
                  <div className="pdfb-pills">
                    {assessores.slice(0, 3).map((a, i) => (
                      <span key={i} className="pdfb-pill" title={`${a.nome} · ${a.empresa}`}>
                        {(a.empresa || '').includes('Fórmula') ? 'F' : 'B'}·{(a.nome || '').split(' ')[0]}
                      </span>
                    ))}
                    {assessores.length > 3 && <span className="pdfb-pill pdfb-pill-more">+{assessores.length - 3}</span>}
                  </div>
                  <button
                    type="button"
                    className="pdfb-btn"
                    disabled={isBusy}
                    onClick={() => handleDownload(f)}
                  >
                    {isBusy ? <Loader2 size={13} className="rl-spin" /> : <Download size={13} />}
                    {isBusy ? 'Gerando…' : 'Baixar PDF'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style jsx global>{`
        .pdfb-toolbar { display:flex; align-items:center; justify-content:space-between; gap:16px; margin: 4px 0 16px; flex-wrap:wrap; }
        .pdfb-search {
          display:inline-flex; align-items:center; gap:8px;
          background: var(--dcl-bg-card); border:1px solid var(--dcl-line);
          border-radius: 10px; padding: 8px 12px; min-width: 320px;
          color: var(--dcl-gold);
        }
        .pdfb-search input {
          background: transparent; border: 0; outline: none;
          color: var(--dcl-ink); font-family: inherit; font-size: 13px;
          width: 100%;
        }
        .pdfb-help { font-size: 11px; color: var(--dcl-ink-3); max-width: 540px; line-height:1.5; }

        .pdfb-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap:14px; }

        .pdfb-card {
          position: relative; overflow: hidden;
          background: var(--dcl-bg-card); border: 1px solid var(--dcl-line);
          border-radius: 12px; padding: 18px 18px 16px;
          transition: all 0.15s;
        }
        .pdfb-card:hover { border-color: var(--dcl-gold); transform: translateY(-1px); }
        .pdfb-card-spine {
          position:absolute; top:0; left:0; bottom:0; width: 3px;
          background: linear-gradient(180deg, var(--dcl-gold) 0%, transparent 100%);
        }
        .pdfb-card-head { display:flex; align-items:center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
        .pdfb-date {
          display:inline-flex; align-items:center; gap:5px;
          background: rgba(212,168,92,0.10); color: var(--dcl-gold);
          font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
          padding: 4px 9px; border-radius: 6px;
        }
        .pdfb-local {
          display:inline-flex; align-items:center; gap:4px;
          font-size: 11px; color: var(--dcl-ink-3);
        }
        .pdfb-name { font-size: 15px; font-weight: 600; color: var(--dcl-ink); margin: 0 0 14px; line-height: 1.3; }

        .pdfb-kpis {
          display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;
          padding: 10px 0; margin-bottom: 14px;
          border-top: 1px solid var(--dcl-line); border-bottom: 1px solid var(--dcl-line);
        }
        .pdfb-kpi-v { font-size: 14px; font-weight: 600; color: var(--dcl-gold); font-feature-settings: 'tnum'; line-height: 1.2; }
        .pdfb-kpi-of { font-weight: 400; color: var(--dcl-ink-3); }
        .pdfb-kpi-l { font-size: 10px; color: var(--dcl-ink-3); text-transform: uppercase; letter-spacing: 0.04em; margin-top: 3px; }

        .pdfb-card-foot { display:flex; align-items:center; justify-content:space-between; gap: 10px; }
        .pdfb-pills { display:flex; gap: 4px; flex-wrap: wrap; }
        .pdfb-pill {
          font-size: 10px; font-weight: 500;
          padding: 3px 7px; border-radius: 10px;
          background: rgba(255,255,255,0.04); border: 1px solid var(--dcl-line);
          color: var(--dcl-ink-2);
        }
        .pdfb-pill-more { color: var(--dcl-gold); border-color: rgba(212,168,92,0.4); }
        .pdfb-btn {
          display:inline-flex; align-items:center; gap: 6px;
          background: var(--dcl-gold); color: #161616;
          border: 0; border-radius: 8px;
          padding: 8px 14px; font-size: 12px; font-weight: 600; font-family: inherit;
          cursor: pointer; transition: all 0.15s;
        }
        .pdfb-btn:hover:not(:disabled) { background: #d4b782; }
        .pdfb-btn:disabled { opacity: 0.6; cursor: wait; }
      `}</style>
    </div>
  )
}

// ── 1) Fechamento Mensal ────────────────────────────────────────────────────

function ReportMensal({ data, period }: { data: Payload; period: string }) {
  const monthly = useMemo(() => {
    const map = new Map<string, {
      ym: string; vgv: number; lotes_v: number; lotes_o: number;
      animais: number; leiloes: number; ticket: number; comissao: number; receita: number; sobra: number
    }>()
    for (const f of data.fechamentos) {
      const k = ymKey(f.data)
      const cur = map.get(k) ?? { ym: k, vgv: 0, lotes_v: 0, lotes_o: 0, animais: 0, leiloes: 0, ticket: 0, comissao: 0, receita: 0, sobra: 0 }
      cur.vgv += f.vgv_total || 0
      cur.lotes_v += f.lotes_vendidos || 0
      cur.lotes_o += f.lotes_ofertados || 0
      cur.animais += f.animais_vendidos || 0
      cur.comissao += f.comissao_assessoria || 0
      cur.receita += f.receita_bula || 0
      cur.sobra += f.sobra_bruta || 0
      cur.leiloes += 1
      map.set(k, cur)
    }
    const arr = Array.from(map.values()).sort((a, b) => a.ym.localeCompare(b.ym))
    arr.forEach(m => { m.ticket = m.animais > 0 ? m.vgv / m.animais : 0 })
    return arr
  }, [data])

  const leadsByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of data.leads) {
      const k = ymKey(l.created_at.slice(0, 10))
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return map
  }, [data])

  const totalVgv = monthly.reduce((s, m) => s + m.vgv, 0)
  const totalAnimais = monthly.reduce((s, m) => s + m.animais, 0)
  const totalLeiloes = monthly.reduce((s, m) => s + m.leiloes, 0)
  const totalReceita = monthly.reduce((s, m) => s + m.receita, 0)
  const ticketGeral = totalAnimais > 0 ? totalVgv / totalAnimais : 0

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['Mês', 'Leilões', 'VGV (R$)', 'Lotes vendidos', 'Lotes ofertados', 'Cobertura (%)', 'Animais', 'Ticket médio', 'Receita Bula', 'Comissão assessoria', 'Sobra bruta', 'Leads no mês'],
      ...monthly.map(m => [
        ymLabel(m.ym), m.leiloes, Math.round(m.vgv),
        m.lotes_v, m.lotes_o, m.lotes_o ? Math.round((m.lotes_v / m.lotes_o) * 100) : 0,
        m.animais, Math.round(m.ticket), Math.round(m.receita),
        Math.round(m.comissao), Math.round(m.sobra),
        leadsByMonth.get(m.ym) ?? 0,
      ]),
    ]
    downloadCSV('relatorio-mensal.csv', rows)
  }

  return (
    <div className="rl-section">
      <SectionHead
        title="Fechamento"
        emphasis="mensal"
        subtitle={`Performance consolidada por mês · ${period}`}
        onExport={exportCsv}
      />

      <div className="rl-grid rl-grid-5">
        <Stat label="VGV total no período" value={fmtBRLCompact(totalVgv)} sub={`${totalLeiloes} leilões fechados`} gold />
        <Stat label="Receita Bula" value={fmtBRLCompact(totalReceita)} sub={totalVgv ? `${PCT(totalReceita / totalVgv)} sobre VGV` : undefined} />
        <Stat label="Animais vendidos" value={fmtNum(totalAnimais)} />
        <Stat label="Ticket médio" value={fmtBRLCompact(ticketGeral)} sub="por animal" />
        <Stat label="Meses com leilão" value={String(monthly.length)} sub={`de ${countMonthsBetween(period)} no recorte`} />
      </div>

      {monthly.length === 0 ? (
        <Empty title="Sem fechamentos no período" message="Ajuste o intervalo de datas para visualizar dados consolidados." />
      ) : (
        <>
          <BarChartCard
            title="VGV por mês"
            sub="Volume geral de vendas mensal · valores em R$"
            items={monthly.map(m => ({ label: ymLabel(m.ym), value: m.vgv, sub: `${m.leiloes} leilão${m.leiloes !== 1 ? 'ões' : ''}` }))}
            valueFmt={fmtBRLCompact}
          />

          <div className="rl-table-wrap">
            <div className="rl-table-head">
              <div>
                <h3>Detalhamento mensal</h3>
                <div className="rl-sub">VGV, cobertura e produtividade comercial</div>
              </div>
              <span className="rl-tag rl-tag-gold">{monthly.length} meses</span>
            </div>
            <div className="rl-table-scroll">
              <table className="rl-table">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Leilões</th>
                    <th>VGV</th>
                    <th>Lotes</th>
                    <th>Cobertura</th>
                    <th>Animais</th>
                    <th>Ticket médio</th>
                    <th>Receita Bula</th>
                    <th>Leads</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map(m => {
                    const cob = m.lotes_o ? Math.round((m.lotes_v / m.lotes_o) * 100) : 0
                    return (
                      <tr key={m.ym}>
                        <td>{ymLabel(m.ym)}</td>
                        <td className="rl-num">{m.leiloes}</td>
                        <td className="rl-num rl-gold">{fmtBRL(m.vgv)}</td>
                        <td className="rl-num">{m.lotes_v}/{m.lotes_o || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="rl-bar" style={{ width: 80 }}>
                              <span style={{ width: `${Math.min(100, cob)}%` }} />
                            </div>
                            <span className="rl-num" style={{ minWidth: 36, textAlign: 'right' }}>{cob}%</span>
                          </div>
                        </td>
                        <td className="rl-num">{fmtNum(m.animais)}</td>
                        <td className="rl-num">{fmtBRL(m.ticket)}</td>
                        <td className="rl-num">{fmtBRL(m.receita)}</td>
                        <td className="rl-num rl-dim">{fmtNum(leadsByMonth.get(m.ym) ?? 0)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function countMonthsBetween(period: string) {
  const [a, b] = period.split('→').map(s => s.trim())
  if (!a || !b) return 0
  const da = new Date(a + 'T00:00:00'), dbb = new Date(b + 'T00:00:00')
  const diff = (dbb.getFullYear() - da.getFullYear()) * 12 + (dbb.getMonth() - da.getMonth())
  return Math.max(1, diff + 1)
}

// ── 2) Comparativo entre Leilões ────────────────────────────────────────────

function ReportComparativo({ data, period }: { data: Payload; period: string }) {
  void period
  const items = useMemo(() => {
    return [...data.fechamentos].sort((a, b) => a.data.localeCompare(b.data))
  }, [data])

  const topVgv = [...items].sort((a, b) => b.vgv_total - a.vgv_total).slice(0, 6)
  const topCobertura = [...items].sort((a, b) => {
    const ca = a.lotes_ofertados ? a.lotes_vendidos / a.lotes_ofertados : 0
    const cb = b.lotes_ofertados ? b.lotes_vendidos / b.lotes_ofertados : 0
    return cb - ca
  }).slice(0, 6)

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['Leilão', 'Data', 'Local', 'VGV', 'Lotes vendidos', 'Lotes ofertados', 'Cobertura (%)', 'Animais', 'Ticket médio', 'Maior lance', 'Compradores únicos', 'Estados'],
      ...items.map(f => {
        const cob = f.lotes_ofertados ? Math.round((f.lotes_vendidos / f.lotes_ofertados) * 100) : 0
        return [f.nome, f.data, f.local, Math.round(f.vgv_total), f.lotes_vendidos, f.lotes_ofertados, cob, f.animais_vendidos, Math.round(f.ticket_medio), Math.round(f.maior_lance), f.compradores_unicos, f.estados_alcancados]
      }),
    ]
    downloadCSV('relatorio-comparativo.csv', rows)
  }

  return (
    <div className="rl-section">
      <SectionHead
        title="Comparativo"
        emphasis="entre leilões"
        subtitle={`Lado a lado · ${items.length} leilão${items.length !== 1 ? 'ões' : ''} no período`}
        onExport={exportCsv}
      />

      {items.length === 0 ? (
        <Empty title="Sem fechamentos no período" message="Cadastre fechamentos ou amplie o recorte." />
      ) : (
        <>
          <div className="rl-bento">
            <div className="rl-card rl-c6">
              <div className="rl-card-head">
                <div>
                  <h3>Top 6 por VGV</h3>
                  <div className="rl-sub">Maiores volumes do recorte</div>
                </div>
                <Trophy size={14} style={{ color: 'var(--dcl-gold)' }} />
              </div>
              <RankList items={topVgv.map(f => ({
                key: f.id, primary: f.nome, secondary: f.data,
                value: fmtBRLCompact(f.vgv_total), bar: f.vgv_total,
              }))} />
            </div>
            <div className="rl-card rl-c6">
              <div className="rl-card-head">
                <div>
                  <h3>Top 6 por taxa de venda</h3>
                  <div className="rl-sub">Cobertura % (lotes vendidos / ofertados)</div>
                </div>
                <Percent size={14} style={{ color: 'var(--dcl-gold)' }} />
              </div>
              <RankList items={topCobertura.map(f => {
                const cob = f.lotes_ofertados ? f.lotes_vendidos / f.lotes_ofertados : 0
                return {
                  key: f.id, primary: f.nome, secondary: `${f.lotes_vendidos}/${f.lotes_ofertados} lotes`,
                  value: PCT(cob), bar: cob,
                }
              })} />
            </div>
          </div>

          <div className="rl-table-wrap">
            <div className="rl-table-head">
              <div>
                <h3>Tabela comparativa</h3>
                <div className="rl-sub">Indicadores principais por leilão</div>
              </div>
              <span className="rl-tag">{items.length} eventos</span>
            </div>
            <div className="rl-table-scroll">
              <table className="rl-table">
                <thead>
                  <tr>
                    <th>Leilão</th>
                    <th>Data</th>
                    <th>VGV</th>
                    <th>Lotes</th>
                    <th>Cobertura</th>
                    <th>Animais</th>
                    <th>Ticket</th>
                    <th>Maior lance</th>
                    <th>Compradores</th>
                    <th>Estados</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(f => {
                    const cob = f.lotes_ofertados ? Math.round((f.lotes_vendidos / f.lotes_ofertados) * 100) : 0
                    return (
                      <tr key={f.id}>
                        <td style={{ maxWidth: 240 }}>
                          <div style={{ color: 'var(--dcl-ink)', fontWeight: 500 }}>{f.nome}</div>
                          {f.local && <div className="rl-dim" style={{ fontSize: 10.5, marginTop: 2 }}>{f.local}</div>}
                        </td>
                        <td className="rl-num rl-dim">{f.data.split('-').reverse().join('/')}</td>
                        <td className="rl-num rl-gold">{fmtBRLCompact(f.vgv_total)}</td>
                        <td className="rl-num">{f.lotes_vendidos}/{f.lotes_ofertados || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="rl-bar" style={{ width: 60 }}>
                              <span style={{ width: `${Math.min(100, cob)}%` }} />
                            </div>
                            <span className="rl-num" style={{ minWidth: 32, textAlign: 'right' }}>{cob}%</span>
                          </div>
                        </td>
                        <td className="rl-num">{fmtNum(f.animais_vendidos)}</td>
                        <td className="rl-num">{fmtBRL(f.ticket_medio)}</td>
                        <td className="rl-num rl-dim">{f.maior_lance ? `${fmtBRL(f.maior_lance)}/parc.` : '—'}</td>
                        <td className="rl-num">{f.compradores_unicos}</td>
                        <td className="rl-num">{f.estados_alcancados}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── 3) Comissões ────────────────────────────────────────────────────────────

function ReportComissoes({ data, period }: { data: Payload; period: string }) {
  const items = useMemo(() =>
    [...data.fechamentos].sort((a, b) => a.data.localeCompare(b.data)), [data])

  const totalReceita = items.reduce((s, f) => s + (f.receita_bula || 0), 0)
  const totalComissao = items.reduce((s, f) => s + (f.comissao_assessoria || 0), 0)
  const totalSobra = items.reduce((s, f) => s + (f.sobra_bruta || 0), 0)
  const totalVgv = items.reduce((s, f) => s + f.vgv_total, 0)

  // Cronograma com previsão de comissão (texto livre, mas mostra contratos pendentes)
  const cronoComCom = data.cronograma.filter(c => (c.faturamento_realizado || c.venda_bula))

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['Leilão', 'Data', 'VGV', 'Receita Bula', '% sobre VGV', 'Comissão assessoria', 'Sobra bruta'],
      ...items.map(f => [
        f.nome, f.data, Math.round(f.vgv_total),
        Math.round(f.receita_bula || 0),
        f.vgv_total ? Math.round(((f.receita_bula || 0) / f.vgv_total) * 10000) / 100 : 0,
        Math.round(f.comissao_assessoria || 0),
        Math.round(f.sobra_bruta || 0),
      ]),
    ]
    downloadCSV('relatorio-comissoes.csv', rows)
  }

  return (
    <div className="rl-section">
      <SectionHead
        title="Relatório de"
        emphasis="comissões"
        subtitle={`Receita Bula × Fórmula sobre VGV · ${period}`}
        onExport={exportCsv}
      />

      <div className="rl-grid rl-grid-4">
        <Stat label="VGV total" value={fmtBRLCompact(totalVgv)} sub={`${items.length} leilões`} />
        <Stat label="Receita Bula" value={fmtBRLCompact(totalReceita)} sub={totalVgv ? `${PCT(totalReceita / totalVgv)} sobre VGV` : undefined} gold />
        <Stat label="Comissão de assessoria" value={fmtBRLCompact(totalComissao)} sub="paga aos assessores" />
        <Stat label="Sobra bruta" value={fmtBRLCompact(totalSobra)} sub="receita líquida estimada" />
      </div>

      {items.length === 0 ? (
        <Empty title="Sem fechamentos no período" message="Cadastre o resultado de leilões para calcular comissões." />
      ) : (
        <>
          <div className="rl-table-wrap">
            <div className="rl-table-head">
              <div>
                <h3>Comissões por leilão</h3>
                <div className="rl-sub">Receita Bula, comissão repassada e sobra bruta</div>
              </div>
              <Link href="/leiloes/fechamento" className="rl-link" style={{ fontSize: 11, padding: '5px 10px' }}>
                Editar fechamentos
              </Link>
            </div>
            <div className="rl-table-scroll">
              <table className="rl-table">
                <thead>
                  <tr>
                    <th>Leilão</th>
                    <th>Data</th>
                    <th>VGV</th>
                    <th>Receita Bula</th>
                    <th>% s/VGV</th>
                    <th>Comissão assessoria</th>
                    <th>Sobra bruta</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(f => {
                    const pct = f.vgv_total ? (f.receita_bula || 0) / f.vgv_total : 0
                    return (
                      <tr key={f.id}>
                        <td style={{ maxWidth: 260 }}>
                          <div style={{ color: 'var(--dcl-ink)', fontWeight: 500 }}>{f.nome}</div>
                        </td>
                        <td className="rl-num rl-dim">{f.data.split('-').reverse().join('/')}</td>
                        <td className="rl-num">{fmtBRLCompact(f.vgv_total)}</td>
                        <td className="rl-num rl-gold">{f.receita_bula ? fmtBRL(f.receita_bula) : '—'}</td>
                        <td className="rl-num rl-dim">{f.receita_bula ? PCT(pct) : '—'}</td>
                        <td className="rl-num">{f.comissao_assessoria ? fmtBRL(f.comissao_assessoria) : '—'}</td>
                        <td className="rl-num">{f.sobra_bruta ? fmtBRL(f.sobra_bruta) : '—'}</td>
                      </tr>
                    )
                  })}
                  <tr>
                    <td colSpan={2} style={{ fontWeight: 600, color: 'var(--dcl-ink)' }}>Total</td>
                    <td className="rl-num" style={{ fontWeight: 600 }}>{fmtBRL(totalVgv)}</td>
                    <td className="rl-num rl-gold" style={{ fontWeight: 600 }}>{fmtBRL(totalReceita)}</td>
                    <td className="rl-num" style={{ fontWeight: 600 }}>{totalVgv ? PCT(totalReceita / totalVgv) : '—'}</td>
                    <td className="rl-num" style={{ fontWeight: 600 }}>{fmtBRL(totalComissao)}</td>
                    <td className="rl-num" style={{ fontWeight: 600 }}>{fmtBRL(totalSobra)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {cronoComCom.length > 0 && (
            <div className="rl-table-wrap">
              <div className="rl-table-head">
                <div>
                  <h3>Cronograma · acordos comerciais</h3>
                  <div className="rl-sub">Acordos de comissão registrados em leilões agendados</div>
                </div>
                <span className="rl-tag">{cronoComCom.length} acordos</span>
              </div>
              <div className="rl-table-scroll">
                <table className="rl-table">
                  <thead>
                    <tr>
                      <th>Leilão</th>
                      <th>Data</th>
                      <th>Leiloeira</th>
                      <th>Comissão acordada</th>
                      <th>Faturamento realizado</th>
                      <th>Venda Bula</th>
                      <th>A receber</th>
                      <th>Recebido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cronoComCom.slice(0, 30).map(c => (
                      <tr key={c.id}>
                        <td style={{ maxWidth: 220 }}>
                          <div style={{ color: 'var(--dcl-ink)', fontWeight: 500 }}>{c.nome}</div>
                          {c.criador && <div className="rl-dim" style={{ fontSize: 10.5, marginTop: 2 }}>{c.criador}</div>}
                        </td>
                        <td className="rl-num rl-dim">{c.data.split('-').reverse().join('/')}</td>
                        <td>{c.leiloeira || '—'}</td>
                        <td className="rl-dim" style={{ fontSize: 11.5 }}>{c.comissao || '—'}</td>
                        <td className="rl-num">{c.faturamento_realizado ? fmtBRL(c.faturamento_realizado) : '—'}</td>
                        <td className="rl-num rl-gold">{c.venda_bula ? fmtBRL(c.venda_bula) : '—'}</td>
                        <td className="rl-dim" style={{ fontSize: 11.5 }}>{c.comissao_receber || '—'}</td>
                        <td>
                          <span className={`rl-tag ${c.recebido === 'SIM' ? 'rl-tag-green' : 'rl-tag'}`}>
                            {c.recebido || 'NÃO'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── 4) Por Assessor ─────────────────────────────────────────────────────────

type AssessorPerLeilao = {
  fechamentoId: string; nome: string; data: string;
  transacoes: number; animais: number; vgv: number;
}

function ReportAssessor({ data, period }: { data: Payload; period: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedAssessor, setSelectedAssessor] = useState<string>('')

  const { assessores, breakdownPorAssessor } = useMemo(() => {
    const map = new Map<string, {
      nome: string; empresa: string; transacoes: number;
      animais: number; vgv: number; leiloes: Set<string>;
    }>()
    const breakdown = new Map<string, AssessorPerLeilao[]>()

    for (const f of data.fechamentos) {
      // Mescla entradas centralizadas (Pedro Barnabé / Matheus Amormino →
      // Marcelo Carneiro) dentro do mesmo fechamento antes de agregar.
      const perLeilao = new Map<string, { nome: string; empresa: string; transacoes: number; animais: number; vgv: number }>()
      for (const a of f.por_assessor ?? []) {
        const canon = normalizeAssessorNome(a.nome)
        if (!canon) continue
        const cur = perLeilao.get(canon) ?? { nome: canon, empresa: a.empresa || '', transacoes: 0, animais: 0, vgv: 0 }
        cur.transacoes += a.transacoes || 0
        cur.animais += a.animais || 0
        cur.vgv += a.vgv || 0
        if (!cur.empresa && a.empresa) cur.empresa = a.empresa
        perLeilao.set(canon, cur)
      }
      for (const [key, leilaoAgg] of perLeilao) {
        const cur = map.get(key) ?? { nome: leilaoAgg.nome, empresa: leilaoAgg.empresa, transacoes: 0, animais: 0, vgv: 0, leiloes: new Set() }
        cur.transacoes += leilaoAgg.transacoes
        cur.animais += leilaoAgg.animais
        cur.vgv += leilaoAgg.vgv
        cur.leiloes.add(f.id)
        if (!cur.empresa && leilaoAgg.empresa) cur.empresa = leilaoAgg.empresa
        map.set(key, cur)

        const list = breakdown.get(key) ?? []
        list.push({
          fechamentoId: f.id, nome: f.nome, data: f.data,
          transacoes: leilaoAgg.transacoes, animais: leilaoAgg.animais, vgv: leilaoAgg.vgv,
        })
        breakdown.set(key, list)
      }
    }

    // Ordena breakdown de cada assessor por VGV desc
    for (const [k, list] of breakdown) {
      list.sort((a, b) => b.vgv - a.vgv)
      breakdown.set(k, list)
    }

    const arr = Array.from(map.values()).sort((a, b) => b.vgv - a.vgv)
    const total = arr.reduce((s, a) => s + a.vgv, 0)
    return {
      assessores: arr.map((a, i) => ({
        ...a,
        pos: i + 1,
        pct: total > 0 ? a.vgv / total : 0,
        ticket: a.animais > 0 ? a.vgv / a.animais : 0,
        leiloesCount: a.leiloes.size,
      })),
      breakdownPorAssessor: breakdown,
    }
  }, [data])

  const totalVgv = assessores.reduce((s, a) => s + a.vgv, 0)
  const maxVgv = assessores[0]?.vgv ?? 1

  // Quando o filtro deixar de bater com a lista atual (mudou o período e o
  // assessor selecionado não tem mais vendas), limpa pra não ficar vazio.
  useEffect(() => {
    if (selectedAssessor && !assessores.some(a => a.nome === selectedAssessor)) {
      setSelectedAssessor('')
    }
  }, [assessores, selectedAssessor])

  // Quando um assessor é selecionado, auto-expande pra já mostrar o detalhe.
  useEffect(() => {
    if (selectedAssessor) setExpanded(new Set([selectedAssessor]))
  }, [selectedAssessor])

  const filteredAssessor = selectedAssessor
    ? assessores.find(a => a.nome === selectedAssessor) ?? null
    : null
  const visibleAssessores = filteredAssessor ? [filteredAssessor] : assessores

  function toggleExpand(nome: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(nome)) next.delete(nome)
      else next.add(nome)
      return next
    })
  }

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['Posição', 'Assessor', 'Empresa', 'Leilões', 'Transações', 'Animais', 'VGV (R$)', 'Ticket médio', '% do total'],
      ...visibleAssessores.map(a => [a.pos, a.nome, a.empresa, a.leiloesCount, a.transacoes, a.animais, Math.round(a.vgv), Math.round(a.ticket), (a.pct * 100).toFixed(2)]),
    ]
    downloadCSV(filteredAssessor ? `vendas-${normalize(filteredAssessor.nome)}.csv` : 'vendas-por-assessor.csv', rows)
  }

  // Export detalhado: 1 linha por assessor × leilão (para conferência de bônus)
  const exportCsvDetalhado = () => {
    const rows: (string | number)[][] = [
      ['Assessor', 'Empresa', 'Leilão', 'Data', 'Transações', 'Animais', 'VGV (R$)'],
    ]
    for (const a of visibleAssessores) {
      const list = breakdownPorAssessor.get(a.nome) ?? []
      for (const l of list) {
        rows.push([a.nome, a.empresa, l.nome, l.data, l.transacoes, l.animais, Math.round(l.vgv)])
      }
    }
    downloadCSV(filteredAssessor ? `vendas-${normalize(filteredAssessor.nome)}-detalhado.csv` : 'vendas-por-assessor-detalhado.csv', rows)
  }

  return (
    <div className="rl-section">
      <SectionHead
        title="Vendas"
        emphasis="por assessor"
        subtitle={`Base para pagamento de bônus · ${period}`}
        onExport={exportCsv}
      />

      {filteredAssessor ? (
        <div className="rl-grid rl-grid-4">
          <Stat
            label="Assessor"
            value={filteredAssessor.nome}
            sub={`Posição ${filteredAssessor.pos} de ${assessores.length} · ${normalizeEmpresaGrupo(filteredAssessor.empresa)}`}
            gold
          />
          <Stat label="VGV no período" value={fmtBRLCompact(filteredAssessor.vgv)} sub={`${PCT(filteredAssessor.pct)} do total`} />
          <Stat label="Leilões" value={String(filteredAssessor.leiloesCount)} sub={`${fmtNum(filteredAssessor.transacoes)} transações`} />
          <Stat label="Animais" value={fmtNum(filteredAssessor.animais)} sub={`Ticket médio ${fmtBRL(filteredAssessor.ticket)}`} />
        </div>
      ) : (
        <div className="rl-grid rl-grid-4">
          <Stat label="Assessores ativos" value={String(assessores.length)} sub={assessores[0] ? `Líder: ${assessores[0].nome.split(' ')[0]}` : undefined} gold />
          <Stat label="VGV vinculado" value={fmtBRLCompact(totalVgv)} />
          <Stat label="Animais negociados" value={fmtNum(assessores.reduce((s, a) => s + a.animais, 0))} />
          <Stat label="Transações" value={fmtNum(assessores.reduce((s, a) => s + a.transacoes, 0))} />
        </div>
      )}

      {assessores.length === 0 ? (
        <Empty title="Nenhum assessor com vendas no período" message="Cadastre fechamentos com a aba Assessores preenchida." />
      ) : (
        <div className="rl-table-wrap">
          <div className="rl-table-head">
            <div>
              <h3>{filteredAssessor ? `Leilões de ${filteredAssessor.nome}` : 'Ranking · clique em um assessor para ver os leilões'}</h3>
              <div className="rl-sub">Comissão e pagamento ficam restritos ao ERP</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="rl-assessor-filter">
                <span className="rl-assessor-filter-label">Assessor</span>
                <select
                  value={selectedAssessor}
                  onChange={e => setSelectedAssessor(e.target.value)}
                  className="rl-assessor-filter-select"
                >
                  <option value="">Todos ({assessores.length})</option>
                  {assessores.map(a => (
                    <option key={a.nome} value={a.nome}>{a.nome}</option>
                  ))}
                </select>
              </label>
              {filteredAssessor && (
                <button type="button" onClick={() => setSelectedAssessor('')} className="rl-export" title="Limpar filtro">
                  Limpar
                </button>
              )}
              <button type="button" onClick={exportCsvDetalhado} className="rl-export" title="CSV detalhado: 1 linha por assessor × leilão">
                <Download size={12} /> Detalhado (CSV)
              </button>
              <span className="rl-tag rl-tag-gold">
                {filteredAssessor ? '1 selecionado' : `${assessores.length} assessores`}
              </span>
            </div>
          </div>
          <div className="rl-table-scroll">
            <table className="rl-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }} aria-label="expandir"></th>
                  <th style={{ width: 50 }}>#</th>
                  <th>Assessor</th>
                  <th>Empresa</th>
                  <th>Leilões</th>
                  <th>Transações</th>
                  <th>Animais</th>
                  <th>Ticket médio</th>
                  <th>VGV</th>
                  <th>Participação</th>
                </tr>
              </thead>
              <tbody>
                {visibleAssessores.map(a => {
                  const isOpen = expanded.has(a.nome)
                  const breakdown = breakdownPorAssessor.get(a.nome) ?? []
                  return (
                    <Fragment key={a.nome}>
                      <tr onClick={() => toggleExpand(a.nome)} style={{ cursor: 'pointer' }} className={isOpen ? 'rl-row-open' : undefined}>
                        <td style={{ textAlign: 'center' }}>
                          <ChevronDown
                            size={14}
                            style={{
                              color: 'var(--dcl-ink-3)',
                              transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                              transition: 'transform .15s',
                            }}
                          />
                        </td>
                        <td>
                          <span style={{
                            fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif', fontStyle: 'italic',
                            fontSize: 18, color: a.pos <= 3 ? 'var(--dcl-gold)' : 'var(--dcl-ink-4)',
                          }}>{a.pos}</span>
                        </td>
                        <td>
                          <div style={{ color: 'var(--dcl-ink)', fontWeight: 500 }}>{a.nome}</div>
                        </td>
                        <td>
                          <span className={`rl-tag ${normalizeEmpresaGrupo(a.empresa) === EMPRESA_BULA_FORMULA ? 'rl-tag-gold' : ''}`}>
                            {normalizeEmpresaGrupo(a.empresa)}
                          </span>
                        </td>
                        <td className="rl-num">{a.leiloesCount}</td>
                        <td className="rl-num">{a.transacoes}</td>
                        <td className="rl-num">{fmtNum(a.animais)}</td>
                        <td className="rl-num rl-dim">{fmtBRL(a.ticket)}</td>
                        <td className="rl-num rl-gold" style={{ fontWeight: 500 }}>{fmtBRL(a.vgv)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="rl-bar" style={{ width: 80 }}>
                              <span style={{ width: `${(a.vgv / maxVgv) * 100}%` }} />
                            </div>
                            <span className="rl-num" style={{ minWidth: 44, textAlign: 'right' }}>{PCT(a.pct)}</span>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="rl-row-detail">
                          <td colSpan={10} style={{ padding: 0 }}>
                            <div className="rl-detail-inner">
                              <div className="rl-detail-head">
                                <span>Leilões em que <strong>{a.nome}</strong> participou</span>
                                <span className="rl-num">{breakdown.length} {breakdown.length === 1 ? 'leilão' : 'leilões'}</span>
                              </div>
                              <table className="rl-detail-table">
                                <thead>
                                  <tr>
                                    <th>Leilão</th>
                                    <th>Data</th>
                                    <th style={{ textAlign: 'right' }}>Transações</th>
                                    <th style={{ textAlign: 'right' }}>Animais</th>
                                    <th style={{ textAlign: 'right' }}>VGV</th>
                                    <th style={{ textAlign: 'right' }}>% do total do assessor</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {breakdown.map(l => (
                                    <tr key={l.fechamentoId}>
                                      <td>{l.nome}</td>
                                      <td className="rl-dim" style={{ fontFamily: 'var(--font-mono), ui-monospace, monospace', fontSize: 11 }}>{l.data}</td>
                                      <td className="rl-num">{l.transacoes}</td>
                                      <td className="rl-num">{fmtNum(l.animais)}</td>
                                      <td className="rl-num rl-gold">{fmtBRL(l.vgv)}</td>
                                      <td className="rl-num rl-dim">{a.vgv > 0 ? PCT(l.vgv / a.vgv) : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style jsx>{`
        .rl-assessor-filter {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 4px 10px; border-radius: 8px;
          background: var(--dcl-bg-card-2); border: 1px solid var(--dcl-line);
        }
        .rl-assessor-filter-label {
          font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--dcl-ink-3); font-weight: 600;
        }
        .rl-assessor-filter-select {
          background: transparent; border: none; outline: none;
          color: var(--dcl-ink); font-size: 12px; font-weight: 500;
          font-family: inherit; cursor: pointer;
          padding: 4px 2px; max-width: 200px;
        }
        :global(.rl-assessor-filter-select option) {
          background: var(--dcl-bg-card); color: var(--dcl-ink);
        }
        .rl-row-open td { background: rgba(212,168,92,0.05); }
        .rl-row-detail td { background: var(--dcl-bg-card-2); }
        .rl-detail-inner { padding: 14px 18px 18px; }
        .rl-detail-head {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 11px; color: var(--dcl-ink-3); margin-bottom: 10px;
          letter-spacing: 0.04em; text-transform: uppercase;
        }
        .rl-detail-head strong { color: var(--dcl-gold); font-weight: 500; }
        .rl-detail-table {
          width: 100%; border-collapse: collapse;
          font-size: 12.5px;
        }
        .rl-detail-table th {
          font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--dcl-ink-3); font-weight: 600;
          padding: 6px 10px; text-align: left;
          border-bottom: 1px solid var(--dcl-line);
        }
        .rl-detail-table td {
          padding: 8px 10px; border-bottom: 1px solid var(--dcl-line-soft);
          color: var(--dcl-ink-2);
        }
        .rl-detail-table tr:last-child td { border-bottom: none; }
      `}</style>
    </div>
  )
}

// ── 5) Cobertura de Leilões ─────────────────────────────────────────────────

function ReportCobertura({ data, period }: { data: Payload; period: string }) {
  const status = useMemo(() => {
    const total = data.cronograma.length
    let comFechamento = 0
    const semDados: Cronograma[] = []
    const linkados: { c: Cronograma; f: Fechamento }[] = []

    const usados = new Set<string>()
    for (const f of data.fechamentos) {
      const m = matchFechamentoToCronograma(f, data.cronograma)
      if (m && !usados.has(m.id)) {
        usados.add(m.id)
        linkados.push({ c: m, f })
        comFechamento++
      }
    }
    for (const c of data.cronograma) {
      if (!usados.has(c.id)) semDados.push(c)
    }
    return { total, comFechamento, semDados, linkados }
  }, [data])

  const passados = status.semDados.filter(c => {
    const today = new Date().toISOString().slice(0, 10)
    return c.data < today
  })
  const futuros = status.semDados.filter(c => {
    const today = new Date().toISOString().slice(0, 10)
    return c.data >= today
  })

  const pct = status.total ? (status.comFechamento / status.total) : 0

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['Tipo', 'Leilão', 'Data', 'Leiloeira', 'Status'],
      ...status.linkados.map(({ c, f }) => ['Coberto', c.nome, c.data, c.leiloeira ?? '', `Fechamento: ${f.nome}`]),
      ...passados.map(c => ['Pendente — passado', c.nome, c.data, c.leiloeira ?? '', 'Fechamento ausente']),
      ...futuros.map(c => ['Agendado', c.nome, c.data, c.leiloeira ?? '', 'Aguardando data']),
    ]
    downloadCSV('relatorio-cobertura.csv', rows)
  }

  return (
    <div className="rl-section">
      <SectionHead
        title="Cobertura"
        emphasis="de leilões"
        subtitle={`Cronograma vs Fechamentos · ${period}`}
        onExport={exportCsv}
      />

      <div className="rl-grid rl-grid-4">
        <Stat label="Cobertura geral" value={`${Math.round(pct * 100)}%`} sub={`${status.comFechamento} de ${status.total}`} gold />
        <Stat label="Com fechamento" value={String(status.comFechamento)} />
        <Stat label="Pendente · passado" value={String(passados.length)} sub="leilão sem registro" />
        <Stat label="Agendado · futuro" value={String(futuros.length)} sub="aguardando ocorrer" />
      </div>

      <div className="rl-bento">
        <div className="rl-card rl-c8">
          <div className="rl-card-head">
            <div>
              <h3>Pendências · leilões já realizados sem fechamento</h3>
              <div className="rl-sub">Inteligência: capture esses dados para fechar a base</div>
            </div>
            <span className={`rl-tag ${passados.length > 0 ? 'rl-tag-red' : 'rl-tag-green'}`}>
              {passados.length} pendentes
            </span>
          </div>
          {passados.length === 0 ? (
            <p style={{ color: 'var(--dcl-ink-3)', fontSize: 12.5, margin: 0 }}>Tudo em dia. Todos os leilões passados têm fechamento registrado.</p>
          ) : (
            <div className="rl-table-scroll">
              <table className="rl-table">
                <thead>
                  <tr><th>Data</th><th>Leilão</th><th>Criador</th><th>Leiloeira</th><th>Modalidade</th></tr>
                </thead>
                <tbody>
                  {passados.slice(0, 20).map(c => (
                    <tr key={c.id}>
                      <td className="rl-num rl-dim">{c.data.split('-').reverse().join('/')}</td>
                      <td><div style={{ color: 'var(--dcl-ink)', fontWeight: 500 }}>{c.nome}</div></td>
                      <td className="rl-dim">{c.criador || '—'}</td>
                      <td>{c.leiloeira || '—'}</td>
                      <td>{c.presencial ? <span className="rl-tag">{c.presencial}</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="rl-card rl-c4">
          <div className="rl-card-head">
            <div>
              <h3>Próximos eventos</h3>
              <div className="rl-sub">Cronograma à frente</div>
            </div>
            <Calendar size={14} style={{ color: 'var(--dcl-gold)' }} />
          </div>
          {futuros.length === 0 ? (
            <p style={{ color: 'var(--dcl-ink-3)', fontSize: 12.5, margin: 0 }}>Sem leilões futuros no recorte.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {futuros.slice(0, 8).map(c => (
                <div key={c.id} style={{
                  display: 'grid', gridTemplateColumns: '40px 1fr', gap: 12, alignItems: 'center',
                  padding: '8px 0', borderTop: '1px solid var(--dcl-line-soft)',
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif', fontStyle: 'italic', fontSize: 22, color: 'var(--dcl-ink)', lineHeight: 1 }}>
                      {Number(c.data.split('-')[2])}
                    </div>
                    <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--dcl-ink-3)' }}>
                      {MES_ABBR[Number(c.data.split('-')[1]) - 1]}
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--dcl-ink)', fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.nome}
                    </div>
                    <div style={{ color: 'var(--dcl-ink-3)', fontSize: 11, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {c.hora && <span>{c.hora}</span>}
                      {c.leiloeira && <span>· {c.leiloeira}</span>}
                      {c.qtd_animais && <span>· {c.qtd_animais} animais</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 6) Por Categoria ────────────────────────────────────────────────────────

function ReportCategoria({ data, period }: { data: Payload; period: string }) {
  // Por SEXO no cronograma + fechamentos vinculados
  const buckets = useMemo(() => {
    const map = new Map<string, { categoria: string; agendados: number; realizados: number; vgv: number; animais: number }>()
    for (const c of data.cronograma) {
      const key = (c.sexo?.trim() || c.raca?.trim() || 'Sem categoria').toUpperCase()
      const cur = map.get(key) ?? { categoria: key, agendados: 0, realizados: 0, vgv: 0, animais: 0 }
      cur.agendados++
      if (c.qtd_animais) cur.animais += c.qtd_animais
      if (c.faturamento_realizado) cur.vgv += c.faturamento_realizado
      map.set(key, cur)
    }
    // Acrescenta VGV de fechamentos detalhados em cima (best effort) por matching
    for (const f of data.fechamentos) {
      const m = matchFechamentoToCronograma(f, data.cronograma)
      if (m) {
        const key = (m.sexo?.trim() || m.raca?.trim() || 'Sem categoria').toUpperCase()
        const cur = map.get(key)
        if (cur) {
          cur.realizados++
          if (cur.vgv === 0) cur.vgv = f.vgv_total
        }
      }
    }
    const arr = Array.from(map.values()).sort((a, b) => b.vgv - a.vgv || b.agendados - a.agendados)
    const totalVgv = arr.reduce((s, b) => s + b.vgv, 0) || 1
    return arr.map(b => ({ ...b, pct: b.vgv / totalVgv }))
  }, [data])

  // Por LEILOEIRA (visão complementar)
  const porLeiloeira = useMemo(() => {
    const map = new Map<string, { leiloeira: string; agendados: number; vgv: number; animais: number }>()
    for (const c of data.cronograma) {
      const key = c.leiloeira?.trim() || 'Sem leiloeira'
      const cur = map.get(key) ?? { leiloeira: key, agendados: 0, vgv: 0, animais: 0 }
      cur.agendados++
      if (c.qtd_animais) cur.animais += c.qtd_animais
      if (c.faturamento_realizado) cur.vgv += c.faturamento_realizado
      map.set(key, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.vgv - a.vgv || b.agendados - a.agendados).slice(0, 8)
  }, [data])

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['Categoria', 'Agendados', 'Realizados', 'Animais', 'VGV (R$)', '% sobre VGV'],
      ...buckets.map(b => [b.categoria, b.agendados, b.realizados, b.animais, Math.round(b.vgv), (b.pct * 100).toFixed(2)]),
    ]
    downloadCSV('relatorio-por-categoria.csv', rows)
  }

  const maxVgv = Math.max(1, ...buckets.map(b => b.vgv))

  return (
    <div className="rl-section">
      <SectionHead
        title="Relatório por"
        emphasis="categoria"
        subtitle={`Onde está o dinheiro · ${period}`}
        onExport={exportCsv}
      />

      {buckets.length === 0 ? (
        <Empty title="Sem categorias no período" message="Adicione cronogramas com sexo/raça preenchidos." />
      ) : (
        <div className="rl-bento">
          <div className="rl-card rl-c8">
            <div className="rl-card-head">
              <div>
                <h3>Distribuição por categoria</h3>
                <div className="rl-sub">Touros, fêmeas, embriões, sêmen e demais segmentações do cronograma</div>
              </div>
              <Layers size={14} style={{ color: 'var(--dcl-gold)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {buckets.map(b => (
                <div key={b.categoria} style={{
                  display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: 14,
                  alignItems: 'center', padding: '10px 0',
                  borderTop: '1px solid var(--dcl-line-soft)',
                }}>
                  <div>
                    <div style={{ color: 'var(--dcl-ink)', fontSize: 12.5, fontWeight: 500 }}>{b.categoria}</div>
                    <div style={{ color: 'var(--dcl-ink-3)', fontSize: 10.5, marginTop: 2 }}>
                      {b.agendados} agendados · {b.realizados} fechados · {fmtNum(b.animais)} animais
                    </div>
                  </div>
                  <div className="rl-bar" style={{ height: 8 }}>
                    <span style={{ width: `${(b.vgv / maxVgv) * 100}%` }} />
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="rl-num" style={{ color: 'var(--dcl-gold)', fontWeight: 500 }}>{fmtBRLCompact(b.vgv)}</div>
                    <div style={{ color: 'var(--dcl-ink-3)', fontSize: 10.5 }}>{PCT(b.pct)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rl-card rl-c4">
            <div className="rl-card-head">
              <div>
                <h3>Top leiloeiras</h3>
                <div className="rl-sub">Por VGV no cronograma</div>
              </div>
              <Trophy size={14} style={{ color: 'var(--dcl-gold)' }} />
            </div>
            <RankList items={porLeiloeira.map(l => ({
              key: l.leiloeira, primary: l.leiloeira,
              secondary: `${l.agendados} leilões · ${fmtNum(l.animais)} animais`,
              value: l.vgv > 0 ? fmtBRLCompact(l.vgv) : '—',
              bar: l.vgv,
            }))} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── 7) Ranking de Leilões ───────────────────────────────────────────────────

function ReportRanking({ data, period }: { data: Payload; period: string }) {
  const items = data.fechamentos
  const topVgv = [...items].sort((a, b) => b.vgv_total - a.vgv_total).slice(0, 10)
  const topTicket = [...items].sort((a, b) => b.ticket_medio - a.ticket_medio).slice(0, 10)
  const topLance = [...items].sort((a, b) => b.maior_lance - a.maior_lance).slice(0, 10)
  const topCobertura = [...items].sort((a, b) => {
    const ca = a.lotes_ofertados ? a.lotes_vendidos / a.lotes_ofertados : 0
    const cb = b.lotes_ofertados ? b.lotes_vendidos / b.lotes_ofertados : 0
    return cb - ca
  }).slice(0, 10)

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['Categoria', 'Posição', 'Leilão', 'Data', 'Valor'],
      ...topVgv.map((f, i) => ['VGV', i + 1, f.nome, f.data, Math.round(f.vgv_total)]),
      ...topTicket.map((f, i) => ['Ticket médio', i + 1, f.nome, f.data, Math.round(f.ticket_medio)]),
      ...topLance.map((f, i) => ['Maior lance', i + 1, f.nome, f.data, Math.round(f.maior_lance)]),
      ...topCobertura.map((f, i) => {
        const pct = f.lotes_ofertados ? (f.lotes_vendidos / f.lotes_ofertados) * 100 : 0
        return ['Cobertura', i + 1, f.nome, f.data, pct.toFixed(2)]
      }),
    ]
    downloadCSV('ranking-leiloes.csv', rows)
  }

  return (
    <div className="rl-section">
      <SectionHead
        title="Ranking"
        emphasis="de leilões"
        subtitle={`Os melhores eventos por resultado · ${period}`}
        onExport={exportCsv}
      />
      {items.length === 0 ? (
        <Empty title="Sem fechamentos no período" message="Cadastre o resultado de leilões para gerar o ranking." />
      ) : (
        <div className="rl-bento">
          <div className="rl-card rl-c6">
            <div className="rl-card-head">
              <div><h3>Top 10 · VGV</h3><div className="rl-sub">Maior volume geral de vendas</div></div>
              <Trophy size={14} style={{ color: 'var(--dcl-gold)' }} />
            </div>
            <RankList items={topVgv.map(f => ({
              key: f.id, primary: f.nome, secondary: f.data,
              value: fmtBRLCompact(f.vgv_total), bar: f.vgv_total,
            }))} />
          </div>
          <div className="rl-card rl-c6">
            <div className="rl-card-head">
              <div><h3>Top 10 · Ticket médio</h3><div className="rl-sub">Maior valor por animal</div></div>
              <TrendingUp size={14} style={{ color: 'var(--dcl-gold)' }} />
            </div>
            <RankList items={topTicket.map(f => ({
              key: f.id, primary: f.nome, secondary: f.data,
              value: fmtBRLCompact(f.ticket_medio), bar: f.ticket_medio,
            }))} />
          </div>
          <div className="rl-card rl-c6">
            <div className="rl-card-head">
              <div><h3>Top 10 · Maior lance</h3><div className="rl-sub">Por parcela registrada</div></div>
              <Sparkles size={14} style={{ color: 'var(--dcl-gold)' }} />
            </div>
            <RankList items={topLance.map(f => ({
              key: f.id, primary: f.nome, secondary: f.data,
              value: f.maior_lance ? fmtBRL(f.maior_lance) : '—', bar: f.maior_lance,
            }))} />
          </div>
          <div className="rl-card rl-c6">
            <div className="rl-card-head">
              <div><h3>Top 10 · Cobertura</h3><div className="rl-sub">Maior taxa de venda</div></div>
              <Percent size={14} style={{ color: 'var(--dcl-gold)' }} />
            </div>
            <RankList items={topCobertura.map(f => {
              const cob = f.lotes_ofertados ? f.lotes_vendidos / f.lotes_ofertados : 0
              return {
                key: f.id, primary: f.nome,
                secondary: `${f.lotes_vendidos}/${f.lotes_ofertados} lotes`,
                value: PCT(cob), bar: cob,
              }
            })} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Reusable components ────────────────────────────────────────────────────

function SectionHead({ title, emphasis, subtitle, onExport }: {
  title: string; emphasis: string; subtitle: string; onExport?: () => void
}) {
  return (
    <div className="rl-section-head">
      <div>
        <h2>{title} <span className="dcl-serif">{emphasis}</span></h2>
        <div className="rl-sub">{subtitle}</div>
      </div>
      {onExport && (
        <button onClick={onExport} className="rl-export">
          <Download size={12} /> Exportar CSV
        </button>
      )}
    </div>
  )
}

function Stat({ label, value, sub, gold }: { label: string; value: string; sub?: string; gold?: boolean }) {
  return (
    <div className={`rl-stat${gold ? ' rl-stat-gold' : ''}`}>
      <div className="rl-stat-label">{label}</div>
      <div className="rl-stat-val">{value}</div>
      {sub && <div className="rl-stat-sub">{sub}</div>}
    </div>
  )
}

function Empty({ title, message }: { title: string; message?: string }) {
  return (
    <div className="rl-empty">
      <Hash size={20} style={{ color: 'var(--dcl-ink-4)' }} />
      <h4>{title}</h4>
      {message && <p>{message}</p>}
    </div>
  )
}

function RankList({ items }: { items: { key: string; primary: string; secondary?: string; value: string; bar?: number }[] }) {
  if (items.length === 0) return <p style={{ color: 'var(--dcl-ink-3)', fontSize: 12.5, margin: 0 }}>Sem dados.</p>
  const max = Math.max(1, ...items.map(i => i.bar ?? 0))
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((it, i) => (
        <div key={it.key} style={{
          display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 12,
          alignItems: 'center', padding: '10px 0',
          borderTop: i === 0 ? 'none' : '1px solid var(--dcl-line-soft)',
        }}>
          <span style={{
            fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif', fontStyle: 'italic',
            fontSize: 18, color: i < 3 ? 'var(--dcl-gold)' : 'var(--dcl-ink-4)', lineHeight: 1,
          }}>{i + 1}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--dcl-ink)', fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.primary}</div>
            {it.secondary && <div style={{ color: 'var(--dcl-ink-3)', fontSize: 10.5, marginTop: 2 }}>{it.secondary}</div>}
            {it.bar != null && (
              <div className="rl-bar" style={{ marginTop: 6, height: 4 }}>
                <span style={{ width: `${(it.bar / max) * 100}%` }} />
              </div>
            )}
          </div>
          <div className="rl-num" style={{ color: 'var(--dcl-ink)', fontWeight: 500, textAlign: 'right' }}>{it.value}</div>
        </div>
      ))}
    </div>
  )
}

function BarChartCard({ title, sub, items, valueFmt }: {
  title: string; sub: string;
  items: { label: string; value: number; sub?: string }[];
  valueFmt: (v: number) => string
}) {
  const max = Math.max(1, ...items.map(i => i.value))
  return (
    <div className="rl-card">
      <div className="rl-card-head">
        <div><h3>{title}</h3><div className="rl-sub">{sub}</div></div>
        <BarChart3 size={14} style={{ color: 'var(--dcl-gold)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0,1fr))`, gap: 8, alignItems: 'end', height: 200, padding: '8px 0 4px' }}>
        {items.map(it => {
          const h = max > 0 ? Math.max(8, (it.value / max) * 168) : 0
          return (
            <div key={it.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, justifyContent: 'flex-end', minWidth: 0 }}>
              <div className="rl-num" style={{ fontSize: 11, color: 'var(--dcl-ink-2)' }}>{valueFmt(it.value)}</div>
              <div style={{
                width: '70%', height: h,
                background: 'linear-gradient(180deg, var(--dcl-gold), var(--dcl-gold-2))',
                borderRadius: 4,
                boxShadow: '0 0 0 1px rgba(212,168,92,0.25), 0 0 18px rgba(212,168,92,0.15)',
              }} />
              <div style={{ fontSize: 10, color: 'var(--dcl-ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{it.label}</div>
              {it.sub && <div style={{ fontSize: 9.5, color: 'var(--dcl-ink-4)' }}>{it.sub}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
