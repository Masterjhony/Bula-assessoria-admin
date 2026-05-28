'use client'

import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

// ── Finance visibility context ────────────────────────────────────────────────
// O chefe pediu (2026-05-15) para esconder dados financeiros (Faturamento Bula,
// comissões pagas, lucro bruto, acordos com criadores) dos assessores. Eles
// continuam vendo cobertura, VGV vendido, % do leilão — só não vêem o que a
// empresa fatura nem o que cada outro assessor recebe. A flag chega do server
// via getIsFinanceAdmin() (whitelist por email).
const FinanceVisibilityCtx = createContext<boolean>(false)
const useCanSeeFinance = () => useContext(FinanceVisibilityCtx)
import {
  Plus, Edit2, Trash2, X, Loader2, AlertCircle, Save,
  MapPin, Users, TrendingUp, BarChart3, DollarSign,
  ChevronRight, Calendar, Target, Hash, Star,
  ArrowUp, ArrowDown, Minus, Dna,
  LayoutGrid, Table as TableIcon,
} from 'lucide-react'
import { normalizeAssessorNome } from '@/lib/assessor-normalize'

// ── Types ──────────────────────────────────────────────────────────────────────

type Assessor = {
  posicao: number; nome: string; empresa: string
  transacoes: number; animais: number; vgv: number
  ticket_medio: number; pct_total: number
}

type Estado = {
  uf: string; estado: string; lotes: number
  animais: number; vgv: number; pct_total: number
}

type Comprador = {
  rank: number; fazenda: string; comprador: string
  cidade: string; uf: string; lotes: number; animais: number; vgv: number
}

type Lance = {
  lote: string; fazenda: string; comprador: string; uf: string
  assessor: string; empresa: string; animais: number; parcela: number; vgv: number
}

type PerfilGenetico = {
  indices: Array<{ fonte: string; media_vendida: number; media_catalogo: number; diferenca: string; classificacao: string }>
  crias_sexo: Array<{ sexo: string; quantidade: number; pct: number; observacao: string }>
  medias_catalogo?: {
    matrizes: Array<{ fonte: string; media: number; deca: number }>
    ventres: Array<{ fonte: string; media: number; deca: number }>
    crias: Array<{ fonte: string; media: number; deca: number }>
  }
}

type AnimalCatalogo = {
  rg: string | null; nome: string | null; nascimento: string | null
  meses: number | null; peso_kg: number | null
  iabcz: number | null; iqg: number | null; mgte: number | null
  pai: string | null; mae_rg: string | null; mae_nome: string | null
  avo_materno: string | null; situacao: string | null
  touro_cobertura: string | null; prev_parto: string | null
  iqg_ventre: number | null; mgte_ventre: number | null
}

type Cria = {
  nasc: string | null; meses: number | null; sexo: string | null
  peso_kg: number | null; pai: string | null
}

type LoteCatalogo = {
  lote: number; vendido: boolean; animais: AnimalCatalogo[]; cria?: Cria
  fazenda?: string; comprador?: string; uf?: string; assessor?: string; empresa?: string
}

type EmpresaDistribuicao = {
  empresa: string; transacoes: number; animais: number
  vgv: number; pct_total: number; ticket_medio: number
}

export type Fechamento = {
  id: string; nome: string; data: string; local: string
  lotes_ofertados: number; lotes_vendidos: number; animais_vendidos: number
  vgv_total: number; ticket_medio: number; maior_lance: number
  faturamento_total_leilao: number | null
  compradores_unicos: number; estados_alcancados: number
  por_assessor: Assessor[]; por_estado: Estado[]
  compradores: Comprador[]; lances: Lance[]
  perfil_genetico: PerfilGenetico | null
  lotes_catalogo?: LoteCatalogo[]
  distribuicao_empresa?: EmpresaDistribuicao[]
  comissao_assessoria: number; receita_bula: number | null; sobra_bruta: number | null
  /** % decimal sobre faturamento da leiloeira (acordo). Ex: 0.0033 = 0,33%. */
  acordo_pct_faturamento?: number | null
  /** % decimal sobre VGV de cobertura (acordo). Ex: 0.03 = 3%. */
  acordo_pct_venda_cobertura?: number | null
  /** Texto livre do acordo conforme F.xlsx. */
  acordo_descricao?: string | null
  observacoes: string; created_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const R = (v: number | null | undefined) =>
  v ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : 'R$ —'

const PCT = (v: number) => `${(v * 100).toFixed(1)}%`

// Bula Assessoria e Bula Remates são tratados como um único grupo "Bula"
// nas agregações por empresa. Os registros individuais (linhas de assessor)
// preservam o nome real.
const EMPRESA_BULA_FORMULA = 'Bula'
function normalizeEmpresaGrupo(empresa: string | null | undefined): string {
  const e = (empresa ?? '').trim()
  if (!e) return ''
  const lower = e.toLowerCase()
  if (lower.startsWith('bula') || lower.startsWith('fórmula') || lower.startsWith('formula')) {
    return EMPRESA_BULA_FORMULA
  }
  return e
}

function aggregateEmpresas(items: EmpresaDistribuicao[]): EmpresaDistribuicao[] {
  const acc = new Map<string, EmpresaDistribuicao>()
  for (const it of items) {
    const key = normalizeEmpresaGrupo(it.empresa) || it.empresa
    const cur = acc.get(key)
    if (cur) {
      cur.vgv += it.vgv
      cur.transacoes += it.transacoes
      cur.animais += it.animais
    } else {
      acc.set(key, { ...it, empresa: key })
    }
  }
  const total = Array.from(acc.values()).reduce((s, e) => s + e.vgv, 0)
  return Array.from(acc.values()).map(e => ({
    ...e,
    pct_total: total > 0 ? e.vgv / total : 0,
    ticket_medio: e.animais > 0 ? e.vgv / e.animais : 0,
  }))
}

const MES: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return { dia: Number(d), mes: MES[m] ?? m, ano: y, full: `${Number(d)} ${MES[m] ?? m} ${y}` }
}

function coveragePct(vendidos: number, ofertados: number) {
  if (!ofertados) return 0
  return Math.round((vendidos / ofertados) * 100)
}

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-[#333] bg-white dark:bg-[#0D0D0D] text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-[#A68B4B] transition-colors"

// ── Empty Form ─────────────────────────────────────────────────────────────────

function emptyForm(): Omit<Fechamento, 'id' | 'created_at'> {
  return {
    nome: '', data: '', local: '',
    lotes_ofertados: 0, lotes_vendidos: 0, animais_vendidos: 0,
    vgv_total: 0, ticket_medio: 0, maior_lance: 0,
    faturamento_total_leilao: null,
    compradores_unicos: 0, estados_alcancados: 0,
    por_assessor: [], por_estado: [], compradores: [], lances: [],
    perfil_genetico: null, comissao_assessoria: 0,
    receita_bula: null, sobra_bruta: null,
    acordo_pct_faturamento: null, acordo_pct_venda_cobertura: null, acordo_descricao: '',
    observacoes: '',
  }
}

// ── Table View ─────────────────────────────────────────────────────────────────

function FechamentoTable({ items, selectedId, onSelect }: {
  items: Fechamento[]; selectedId: string | null; onSelect: (id: string) => void
}) {
  const canSeeFinance = useCanSeeFinance()
  if (!items.length) return null
  return (
    <div className="rounded-xl border border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 dark:border-[#2A2A2A] bg-gray-50 dark:bg-[#0D0D0D]">
            {[
              { label: 'Data', cls: 'text-left' },
              { label: 'Leilão', cls: 'text-left' },
              { label: 'Local', cls: 'text-left' },
              { label: 'Lotes', cls: 'text-right whitespace-nowrap' },
              { label: 'Cob.', cls: 'text-right whitespace-nowrap' },
              { label: 'Animais', cls: 'text-right' },
              { label: 'VGV Cobertura', cls: 'text-right whitespace-nowrap' },
              { label: 'Fat. Leiloeira', cls: 'text-right whitespace-nowrap' },
              { label: 'Assessores', cls: 'text-left' },
            ].map(h => (
              <th key={h.label} className={`px-3 py-2.5 text-[9px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 ${h.cls}`}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(f => {
            const dt = fmtDate(f.data)
            const pct = coveragePct(f.lotes_vendidos, f.lotes_ofertados)
            const isSelected = selectedId === f.id
            const assessorNomes = (f.por_assessor ?? [])
              .map(a => a.nome)
              .filter(Boolean)
              .map(n => n.split(' ')[0])
            return (
              <tr
                key={f.id}
                onClick={() => onSelect(f.id)}
                className={`border-b border-gray-50 dark:border-[#232323] cursor-pointer transition-colors
                  ${isSelected
                    ? 'bg-[#A68B4B]/8'
                    : 'hover:bg-gray-50 dark:hover:bg-[#202020]'}`}
              >
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="font-bold text-[#A68B4B]">{dt.dia} {dt.mes}</span>
                  <span className="text-gray-400 ml-1">/{dt.ano.slice(-2)}</span>
                </td>
                <td className="px-3 py-2.5 max-w-[260px]">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 truncate" title={f.nome}>{f.nome}</p>
                </td>
                <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 max-w-[160px] truncate" title={f.local}>{f.local || '—'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                  {f.lotes_vendidos}/{f.lotes_ofertados}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold
                    ${pct >= 60 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : pct >= 30 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-[#1A1A1A] dark:text-gray-400'}`}>
                    {pct}%
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{f.animais_vendidos}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[#A68B4B]">{R(f.vgv_total)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                  {f.faturamento_total_leilao ? R(f.faturamento_total_leilao) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {assessorNomes.slice(0, 3).map(n => (
                      <span key={n} className="px-1.5 py-0.5 rounded bg-[#A68B4B]/10 text-[#A68B4B] text-[9px] font-bold uppercase tracking-wider">{n}</span>
                    ))}
                    {assessorNomes.length > 3 && (
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-[#1A1A1A] text-gray-500 text-[9px] font-bold">+{assessorNomes.length - 3}</span>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FechamentoCard({ f, selected, onClick }: { f: Fechamento; selected: boolean; onClick: () => void }) {
  const dt = fmtDate(f.data)
  const pct = coveragePct(f.lotes_vendidos, f.lotes_ofertados)

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl border transition-all duration-200 overflow-hidden
        ${selected
          ? 'border-[#A68B4B]/50 bg-[#A68B4B]/5 dark:bg-[#A68B4B]/8 shadow-md shadow-[#A68B4B]/10'
          : 'border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] hover:border-[#A68B4B]/30 hover:shadow-sm'
        }`}
    >
      {/* Coverage bar accent */}
      <div className="h-1 w-full bg-gray-100 dark:bg-[#1A1A1A]">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${pct}%`, background: pct >= 60 ? '#22c55e' : pct >= 30 ? '#A68B4B' : '#ef4444' }}
        />
      </div>

      <div className="p-4 flex gap-4">
        {/* Date badge */}
        <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl border flex-shrink-0 transition-colors
          ${selected ? 'border-[#A68B4B]/40 bg-[#A68B4B]/12' : 'border-[#A68B4B]/20 bg-[#A68B4B]/6'}`}>
          <span className="text-[#A68B4B] font-black text-xl leading-none">{dt.dia}</span>
          <span className="text-[#A68B4B]/70 text-[9px] font-bold uppercase tracking-wider mt-0.5">{dt.mes}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-gray-900 dark:text-white font-black text-sm uppercase leading-tight line-clamp-2">{f.nome}</p>
          {f.local && (
            <div className="flex items-center gap-1 text-[10px] text-gray-400">
              <MapPin size={9} /> <span className="truncate">{f.local}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-xs font-black text-[#A68B4B]">{R(f.vgv_total)}</span>
            <span className="text-[10px] text-gray-500">
              {f.lotes_vendidos}/{f.lotes_ofertados} lotes <span className="font-semibold">{pct}%</span>
            </span>
            <span className="text-[10px] text-gray-400">{f.animais_vendidos} animais</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {f.por_assessor.slice(0, 3).map(a => (
              <span key={a.nome} className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#A68B4B]/10 text-[#A68B4B] font-bold uppercase">
                {a.nome.split(' ')[0]}
              </span>
            ))}
          </div>
        </div>

        <ChevronRight size={15} className={`flex-shrink-0 self-center text-gray-300 dark:text-gray-700 transition-transform ${selected ? 'rotate-90 text-[#A68B4B]' : ''}`} />
      </div>
    </button>
  )
}

// ── Drawer Tabs ────────────────────────────────────────────────────────────────

type DrawerTab = 'resumo' | 'assessores' | 'compradores' | 'lances' | 'estados' | 'genetica' | 'catalogo'

function DrawerTabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-2 py-2 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors
        ${active ? 'border-b-2 border-[#A68B4B] text-[#A68B4B]' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border-b-2 border-transparent'}`}
    >
      {children}
    </button>
  )
}

// ── Catálogo Tab ───────────────────────────────────────────────────────────────

function CatalogoTab({ lots }: { lots: LoteCatalogo[] }) {
  const [filtro, setFiltro] = useState<'todos' | 'vendidos' | 'nao_vendidos'>('todos')
  const totalVendidos = lots.filter(l => l.vendido).length
  const filtered = lots.filter(l =>
    filtro === 'todos' ? true : filtro === 'vendidos' ? l.vendido : !l.vendido
  )
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {([
          { key: 'todos' as const, label: `Todos (${lots.length})` },
          { key: 'vendidos' as const, label: `Vendidos (${totalVendidos})` },
          { key: 'nao_vendidos' as const, label: `Não vendidos (${lots.length - totalVendidos})` },
        ]).map(({ key, label }) => (
          <button key={key} onClick={() => setFiltro(key)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all
              ${filtro === key ? 'bg-[#A68B4B] text-black' : 'bg-gray-100 dark:bg-[#1A1A1A] text-gray-500 dark:text-gray-400 hover:text-[#A68B4B]'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {filtered.map(lot => (
          <div key={lot.lote}
            className={`rounded-xl border p-3 ${lot.vendido
              ? 'border-[#A68B4B]/30 bg-[#A68B4B]/4 dark:bg-[#A68B4B]/6'
              : 'border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414]'}`}>
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0
                ${lot.vendido ? 'bg-[#A68B4B] text-black' : 'bg-gray-100 dark:bg-[#1A1A1A] text-gray-500 dark:text-gray-400'}`}>
                {lot.lote}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                {lot.animais.map((a, ai) => (
                  <div key={ai}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-gray-900 dark:text-white">{a.nome}</span>
                      {a.rg && <span className="text-[9px] text-gray-400 font-mono">{a.rg}</span>}
                      {a.meses && <span className="text-[9px] text-gray-400">{a.meses}m</span>}
                      {a.peso_kg && <span className="text-[9px] text-gray-400">{a.peso_kg}kg</span>}
                    </div>
                    <div className="flex gap-1.5 flex-wrap mt-0.5">
                      {a.iabcz != null && <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-[#1A1A1A] text-gray-600 dark:text-gray-400 font-semibold">iABCZ {a.iabcz}</span>}
                      {a.iqg != null && <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-[#1A1A1A] text-gray-600 dark:text-gray-400 font-semibold">IQG {a.iqg}</span>}
                      {a.mgte != null && <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-[#1A1A1A] text-gray-600 dark:text-gray-400 font-semibold">MGTe {a.mgte}</span>}
                      {a.situacao && a.situacao !== '-' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold">{a.situacao}</span>
                      )}
                    </div>
                    {a.pai && <p className="text-[9px] text-gray-400 mt-0.5 truncate">Pai: {a.pai}</p>}
                  </div>
                ))}
                {lot.cria && (
                  <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 font-bold">
                    Cria {lot.cria.sexo} · {lot.cria.peso_kg}kg · {lot.cria.meses}m
                  </span>
                )}
              </div>
              {lot.vendido && lot.fazenda && (
                <div className="flex-shrink-0 text-right">
                  <p className="text-[9px] font-bold text-[#A68B4B] truncate max-w-[90px]">{lot.fazenda}</p>
                  {lot.uf && <span className="text-[9px] px-1 py-0.5 rounded bg-[#A68B4B]/10 text-[#A68B4B] font-bold">{lot.uf}</span>}
                  {lot.assessor && <p className="text-[9px] text-gray-400 mt-0.5">{lot.assessor.split(' ')[0]}</p>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Detail Drawer ──────────────────────────────────────────────────────────────

function FechamentoDrawer({ f, onClose, onEdit, onDelete }: {
  f: Fechamento; onClose: () => void; onEdit: () => void; onDelete: () => void
}) {
  const canSeeFinance = useCanSeeFinance()
  const [tab, setTab] = useState<DrawerTab>('resumo')
  const dt = fmtDate(f.data)
  const pct = coveragePct(f.lotes_vendidos, f.lotes_ofertados)
  const maxVgv = f.por_assessor.length ? Math.max(...f.por_assessor.map(a => a.vgv)) : 1
  const maxVgvEstado = f.por_estado.length ? Math.max(...f.por_estado.map(e => e.vgv)) : 1

  const EMPRESA_COLORS: Record<string, string> = {
    [EMPRESA_BULA_FORMULA]: '#A68B4B',
    'Bula Remates': '#A68B4B',
    'Bula Assessoria': '#A68B4B',
  }

  const hasPerfil = !!f.perfil_genetico?.indices?.length

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-[#141414] rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-[#141414] border-b border-gray-100 dark:border-[#2A2A2A] px-6 py-4 flex items-start gap-4">
          <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl border border-[#A68B4B]/30 bg-[#A68B4B]/8 flex-shrink-0">
            <span className="text-[#A68B4B] font-black text-xl leading-none">{dt.dia}</span>
            <span className="text-[#A68B4B]/70 text-[10px] font-bold uppercase tracking-wider mt-0.5">{dt.mes}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-gray-900 dark:text-white text-base leading-tight uppercase">{f.nome}</h2>
            {f.local && <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><MapPin size={10} />{f.local}</p>}
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 max-w-32 bg-gray-100 dark:bg-[#1A1A1A] rounded-full h-1.5 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 60 ? '#22c55e' : '#A68B4B' }} />
              </div>
              <span className="text-[10px] font-bold text-gray-500">{f.lotes_vendidos}/{f.lotes_ofertados} lotes · {pct}%</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1A1A1A] text-gray-400 transition-colors flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Body (tabs + content share the same scroll container so the scrollbar gutter doesn't misalign the tab row) */}
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          {/* Tabs */}
          <div className="sticky top-0 z-10 bg-white dark:bg-[#141414] flex border-b border-gray-100 dark:border-[#2A2A2A] px-4 overflow-x-auto">
            <DrawerTabBtn active={tab === 'resumo'} onClick={() => setTab('resumo')}>Resumo</DrawerTabBtn>
            <DrawerTabBtn active={tab === 'assessores'} onClick={() => setTab('assessores')}>Assessores</DrawerTabBtn>
            <DrawerTabBtn active={tab === 'compradores'} onClick={() => setTab('compradores')}>Compradores</DrawerTabBtn>
            <DrawerTabBtn active={tab === 'lances'} onClick={() => setTab('lances')}>Lances</DrawerTabBtn>
            <DrawerTabBtn active={tab === 'estados'} onClick={() => setTab('estados')}>Estados</DrawerTabBtn>
            {hasPerfil && <DrawerTabBtn active={tab === 'genetica'} onClick={() => setTab('genetica')}>Genética</DrawerTabBtn>}
            {!!f.lotes_catalogo?.length && <DrawerTabBtn active={tab === 'catalogo'} onClick={() => setTab('catalogo')}>Catálogo</DrawerTabBtn>}
          </div>

          {/* Content */}
          <div className="px-6 py-5">

          {/* ── RESUMO ── */}
          {tab === 'resumo' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ...(f.faturamento_total_leilao ? [{
                    icon: DollarSign,
                    label: 'Faturamento Leiloeira (referência)',
                    value: R(f.faturamento_total_leilao),
                    sub: f.vgv_total ? `cobertura nossa: ${PCT(f.vgv_total / f.faturamento_total_leilao)} (${R(f.vgv_total)})` : 'total do leilão inteiro',
                  }] : []),
                  { icon: DollarSign, label: 'VGV Cobertura (Fórmula+Bula)', value: R(f.vgv_total) },
                  { icon: TrendingUp, label: 'Ticket Médio', value: R(f.ticket_medio) },
                  { icon: BarChart3, label: 'Lotes Vendidos', value: `${f.lotes_vendidos}/${f.lotes_ofertados}`, sub: `${pct}% de cobertura` },
                  { icon: Hash, label: 'Animais Vendidos', value: f.animais_vendidos.toString() },
                  { icon: Target, label: 'Maior Lance', value: f.maior_lance ? `R$ ${f.maior_lance.toLocaleString('pt-BR')}/parc.` : '—' },
                  { icon: Users, label: 'Compradores Únicos', value: f.compradores_unicos.toString(), sub: f.por_assessor.filter(a => a.nome).length ? `${f.por_assessor.reduce((s, a) => s + a.transacoes, 0)} transações` : undefined },
                  { icon: MapPin, label: 'Estados Alcançados', value: f.estados_alcancados.toString(), sub: f.por_estado.map(e => e.uf).join(' · ') || undefined },
                ].map(({ icon: Icon, label, value, sub }) => (
                  <div key={label} className="rounded-xl border p-3.5 border-gray-100 dark:border-[#2A2A2A] bg-gray-50 dark:bg-[#141414]">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Icon size={11} className="text-gray-400" />
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
                    </div>
                    <p className="text-lg font-black leading-tight text-gray-900 dark:text-white">{value}</p>
                    {sub && <p className="text-[9px] text-gray-400 mt-0.5">{sub}</p>}
                  </div>
                ))}
              </div>

              {/* VGV por empresa — Bula somados em um único bucket (diretiva chefe) */}
              {(() => {
                const raw: EmpresaDistribuicao[] = f.distribuicao_empresa?.length
                  ? f.distribuicao_empresa
                  : f.por_assessor.map(a => ({
                      empresa: a.empresa,
                      vgv: a.vgv,
                      transacoes: a.transacoes,
                      animais: a.animais,
                      ticket_medio: a.ticket_medio,
                      pct_total: a.pct_total,
                    }))
                return aggregateEmpresas(raw).length > 0
              })() && (() => {
                const raw: EmpresaDistribuicao[] = f.distribuicao_empresa?.length
                  ? f.distribuicao_empresa
                  : f.por_assessor.map(a => ({
                      empresa: a.empresa,
                      vgv: a.vgv,
                      transacoes: a.transacoes,
                      animais: a.animais,
                      ticket_medio: a.ticket_medio,
                      pct_total: a.pct_total,
                    }))
                const empresas = aggregateEmpresas(raw)
                const maxVgvE = Math.max(...empresas.map(e => e.vgv))
                return (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Distribuição por Empresa</p>
                    <div className="space-y-2">
                      {empresas.map(e => (
                        <div key={e.empresa} className="rounded-xl border border-gray-100 dark:border-[#2A2A2A] bg-gray-50 dark:bg-[#141414] p-3">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{e.empresa}</span>
                            <span className="text-xs font-black text-[#A68B4B]">{R(e.vgv)}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-[#1A1A1A] mb-1.5 overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${(e.vgv / maxVgvE) * 100}%`, background: EMPRESA_COLORS[e.empresa] ?? '#A68B4B' }} />
                          </div>
                          <div className="flex gap-3 text-[9px] text-gray-400">
                            <span>{PCT(e.pct_total)} do total</span>
                            {e.transacoes > 0 && <span>{e.transacoes} transações</span>}
                            {e.animais > 0 && <span>{e.animais} animais</span>}
                            {e.ticket_medio > 0 && <span>Ticket: {R(e.ticket_medio)}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {f.observacoes && (
                <div className="bg-gray-50 dark:bg-[#141414] rounded-xl p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Observações</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{f.observacoes}</p>
                </div>
              )}
            </div>
          )}

          {/* ── ASSESSORES ── */}
          {tab === 'assessores' && (() => {
            // Consolida Pedro Barnabé / Matheus Amormino sob Marcelo Carneiro
            // (diretiva 11/05/2026), preservando os nomes originais para
            // discriminação informativa.
            type Origin = { nome: string; vgv: number; animais: number; transacoes: number }
            const grouped = new Map<string, Assessor & { origens: Origin[] }>()
            for (const a of f.por_assessor) {
              const canon = normalizeAssessorNome(a.nome) || a.nome
              const cur = grouped.get(canon) ?? {
                ...a, nome: canon, vgv: 0, transacoes: 0, animais: 0,
                ticket_medio: 0, pct_total: 0, posicao: a.posicao, empresa: a.empresa,
                origens: [],
              }
              cur.vgv += a.vgv || 0
              cur.transacoes += a.transacoes || 0
              cur.animais += a.animais || 0
              cur.pct_total += a.pct_total || 0
              if (!cur.empresa && a.empresa) cur.empresa = a.empresa
              const original = (a.nome || '').trim()
              if (original && original !== canon) {
                cur.origens.push({
                  nome: original, vgv: a.vgv || 0,
                  animais: a.animais || 0, transacoes: a.transacoes || 0,
                })
              }
              grouped.set(canon, cur)
            }
            const items = Array.from(grouped.values())
              .sort((a, b) => b.vgv - a.vgv)
              .map((a, i) => ({
                ...a, posicao: i + 1,
                ticket_medio: a.animais > 0 ? a.vgv / a.animais : 0,
              }))
            if (items.length === 0) {
              return <div className="space-y-4"><p className="text-center text-gray-400 text-sm py-12">Nenhum dado de assessor registrado</p></div>
            }
            return (
              <div className="space-y-4">
                {items.map((a, i) => (
                  <div key={a.nome} className="rounded-2xl border border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0
                        ${i === 0 ? 'bg-[#A68B4B] text-black' : 'bg-gray-100 dark:bg-[#1A1A1A] text-gray-600 dark:text-gray-400'}`}>
                        {i === 0 ? <Star size={16} /> : a.posicao}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white text-sm">{a.nome}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{a.empresa}</p>
                        {a.origens.length > 0 && (
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 italic">
                            inclui {a.origens.map(o => `${o.nome} (${R(o.vgv)})`).join(' · ')}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-black text-[#A68B4B] text-base">{R(a.vgv)}</p>
                        <p className="text-[10px] text-gray-400">{PCT(a.pct_total)} do total</p>
                      </div>
                    </div>
                    {/* VGV bar */}
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-[#1A1A1A] mb-3 overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${(a.vgv / maxVgv) * 100}%`, background: EMPRESA_COLORS[a.empresa] ?? '#A68B4B' }} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Transações', value: a.transacoes },
                        { label: 'Animais', value: a.animais },
                        { label: 'Ticket Médio', value: R(a.ticket_medio) },
                      ].map(({ label, value }) => (
                        <div key={label} className="rounded-lg bg-gray-50 dark:bg-[#141414] px-3 py-2 text-center">
                          <p className="text-[9px] uppercase tracking-wide text-gray-400 mb-0.5">{label}</p>
                          <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* ── COMPRADORES ── */}
          {tab === 'compradores' && (
            <div>
              {f.compradores.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-12">Nenhum comprador registrado</p>
              ) : (
                <div className="space-y-2.5">
                  {f.compradores.map(c => (
                    <div key={c.rank} className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] p-3.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0
                        ${c.rank === 1 ? 'bg-[#A68B4B] text-black' : c.rank === 2 ? 'bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200' : c.rank === 3 ? 'bg-amber-700 text-white' : 'bg-gray-100 dark:bg-[#1A1A1A] text-gray-500'}`}>
                        {c.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{c.fazenda}</p>
                        {c.comprador !== c.fazenda && <p className="text-[10px] text-gray-400 truncate">{c.comprador}</p>}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] text-gray-400 flex items-center gap-1"><MapPin size={8} />{c.cidade}, {c.uf}</span>
                          <span className="text-[9px] text-gray-400">{c.lotes} lote{c.lotes !== 1 ? 's' : ''} · {c.animais} animal{c.animais !== 1 ? 'is' : ''}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-black text-[#A68B4B] text-sm">{R(c.vgv)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── LANCES ── */}
          {tab === 'lances' && (
            <div>
              {f.lances.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-12">Nenhum lance registrado</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-[#2A2A2A]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-[#141414] border-b border-gray-100 dark:border-[#2A2A2A]">
                        {['Lote', 'Fazenda / Comprador', 'UF', 'Assessor', 'Anim.', 'Parcela', 'VGV'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-[#262626]">
                      {f.lances.map((l, i) => (
                        <tr key={i} className="bg-white dark:bg-[#141414] hover:bg-[#A68B4B]/3 transition-colors">
                          <td className="px-3 py-2.5 font-bold text-[#A68B4B] whitespace-nowrap">{l.lote}</td>
                          <td className="px-3 py-2.5 max-w-[160px]">
                            <p className="font-semibold text-gray-900 dark:text-white truncate">{l.fazenda}</p>
                            {l.comprador !== l.fazenda && <p className="text-gray-400 truncate">{l.comprador}</p>}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-gray-100 dark:bg-[#1A1A1A] text-gray-600 dark:text-gray-400">{l.uf}</span>
                          </td>
                          <td className="px-3 py-2.5 max-w-[120px]">
                            {(() => {
                              const canon = normalizeAssessorNome(l.assessor) || l.assessor
                              const original = (l.assessor || '').trim()
                              return (
                                <>
                                  <p className="font-semibold text-gray-700 dark:text-gray-300 truncate">{canon}</p>
                                  {original && original !== canon && (
                                    <p className="text-[9px] italic text-gray-500 dark:text-gray-400 truncate">({original})</p>
                                  )}
                                </>
                              )
                            })()}
                            <p className="text-gray-400 truncate" style={{ color: EMPRESA_COLORS[l.empresa] ?? undefined }}>{l.empresa}</p>
                          </td>
                          <td className="px-3 py-2.5 text-center font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">{l.animais}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-gray-700 dark:text-gray-300">
                            {l.parcela ? `R$ ${l.parcela.toLocaleString('pt-BR')}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap font-black text-[#A68B4B]">{R(l.vgv)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 dark:bg-[#141414] border-t border-gray-100 dark:border-[#2A2A2A]">
                        <td colSpan={4} className="px-3 py-2.5 font-bold text-gray-600 dark:text-gray-400 text-[10px] uppercase tracking-wider">Total</td>
                        <td className="px-3 py-2.5 text-center font-black text-gray-900 dark:text-white">
                          {f.lances.reduce((s, l) => s + l.animais, 0)}
                        </td>
                        <td></td>
                        <td className="px-3 py-2.5 font-black text-[#A68B4B]">
                          {R(f.lances.reduce((s, l) => s + l.vgv, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── ESTADOS ── */}
          {tab === 'estados' && (
            <div className="space-y-3">
              {f.por_estado.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-12">Nenhum dado por estado</p>
              ) : f.por_estado.map(e => (
                <div key={e.uf} className="rounded-xl border border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] p-4">
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className="w-10 h-10 rounded-xl bg-[#A68B4B]/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-[#A68B4B] font-black text-xs">{e.uf}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 dark:text-white text-sm">{e.estado}</p>
                      <p className="text-[10px] text-gray-400">{e.lotes} lote{e.lotes !== 1 ? 's' : ''} · {e.animais} animal{e.animais !== 1 ? 'is' : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-[#A68B4B] text-sm">{R(e.vgv)}</p>
                      <p className="text-[10px] text-gray-400">{PCT(e.pct_total)} do total</p>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(e.vgv / maxVgvEstado) * 100}%`, background: '#A68B4B' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── PERFIL GENÉTICO ── */}
          {tab === 'genetica' && hasPerfil && (
            <div className="space-y-5">

              {/* Médias Catálogo */}
              {f.perfil_genetico!.medias_catalogo && (() => {
                const mc = f.perfil_genetico!.medias_catalogo!
                const groups = [
                  { label: 'Médias — Matrizes', data: mc.matrizes },
                  { label: 'Médias — Ventres', data: mc.ventres },
                  { label: 'Médias — Crias', data: mc.crias },
                ]
                return (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Médias Gerais do Catálogo</p>
                    <div className="space-y-3">
                      {groups.map(g => (
                        <div key={g.label} className="rounded-xl border border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] overflow-hidden">
                          <div className="px-4 py-2 bg-gray-50 dark:bg-[#141414] border-b border-gray-100 dark:border-[#2A2A2A]">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{g.label}</span>
                          </div>
                          <div className="divide-y divide-gray-50 dark:divide-[#262626]">
                            {g.data.map(item => (
                              <div key={item.fonte} className="flex items-center justify-between px-4 py-2.5">
                                <span className="text-xs text-gray-600 dark:text-gray-400">{item.fonte}</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-black text-gray-900 dark:text-white">{item.media}</span>
                                  {item.deca !== null && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold">
                                      DECA {item.deca}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Índices Genéticos — Ventres Vendidos</p>
                <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-[#2A2A2A]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-[#141414] border-b border-gray-100 dark:border-[#2A2A2A]">
                        {['Índice', 'Média Vendida', 'Média Catálogo', 'Diferença', 'Classificação'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-[#262626]">
                      {f.perfil_genetico!.indices.map(idx => {
                        const diff = parseFloat(idx.diferenca)
                        return (
                          <tr key={idx.fonte} className="bg-white dark:bg-[#141414]">
                            <td className="px-3 py-3 font-semibold text-gray-800 dark:text-gray-200">{idx.fonte}</td>
                            <td className="px-3 py-3 font-black text-[#A68B4B]">{idx.media_vendida}</td>
                            <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{idx.media_catalogo}</td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex items-center gap-1 font-bold
                                ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                {diff > 0 ? <ArrowUp size={10} /> : diff < 0 ? <ArrowDown size={10} /> : <Minus size={10} />}
                                {idx.diferenca}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
                                {idx.classificacao}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {f.perfil_genetico!.crias_sexo?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Sexo das Crias ao Pé</p>
                  <div className="space-y-3">
                    {f.perfil_genetico!.crias_sexo.map(s => (
                      <div key={s.sexo} className="rounded-xl border border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white text-sm">{s.sexo}</p>
                            <p className="text-[10px] text-gray-400">{s.observacao}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-[#A68B4B] text-lg">{s.quantidade}</p>
                            <p className="text-[10px] text-gray-400">{PCT(s.pct)}</p>
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: PCT(s.pct), background: '#A68B4B' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── CATÁLOGO ── */}
          {tab === 'catalogo' && !!f.lotes_catalogo?.length && (
            <CatalogoTab lots={f.lotes_catalogo!} />
          )}

          </div>
        </div>

        {/* Footer — só finance-admin pode editar/excluir (API também bloqueia) */}
        {canSeeFinance && (
          <div className="sticky bottom-0 bg-white dark:bg-[#141414] border-t border-gray-100 dark:border-[#2A2A2A] px-6 py-4 flex gap-3">
            <button onClick={onDelete} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 border border-red-100 dark:border-red-500/20 transition-colors">
              <Trash2 size={14} /> Excluir
            </button>
            <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#A68B4B] hover:bg-[#C8A96E] text-black text-sm font-semibold transition-colors">
              <Edit2 size={14} /> Editar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Form Modal ─────────────────────────────────────────────────────────────────

type FormData = Omit<Fechamento, 'id' | 'created_at'>

function toFormData(f: Fechamento | null): FormData {
  if (!f) return emptyForm()
  return {
    nome: f.nome, data: f.data, local: f.local,
    lotes_ofertados: f.lotes_ofertados, lotes_vendidos: f.lotes_vendidos,
    animais_vendidos: f.animais_vendidos, vgv_total: f.vgv_total,
    ticket_medio: f.ticket_medio, maior_lance: f.maior_lance,
    faturamento_total_leilao: f.faturamento_total_leilao ?? null,
    compradores_unicos: f.compradores_unicos, estados_alcancados: f.estados_alcancados,
    por_assessor: f.por_assessor ?? [], por_estado: f.por_estado ?? [],
    compradores: f.compradores ?? [], lances: f.lances ?? [],
    perfil_genetico: f.perfil_genetico ?? null,
    lotes_catalogo: f.lotes_catalogo,
    distribuicao_empresa: f.distribuicao_empresa,
    comissao_assessoria: f.comissao_assessoria,
    receita_bula: f.receita_bula ?? null,
    sobra_bruta: f.sobra_bruta ?? null,
    acordo_pct_faturamento: f.acordo_pct_faturamento ?? null,
    acordo_pct_venda_cobertura: f.acordo_pct_venda_cobertura ?? null,
    acordo_descricao: f.acordo_descricao ?? '',
    observacoes: f.observacoes,
  }
}

type FormTab = 'basico' | 'assessores' | 'compradores' | 'lances' | 'estados' | 'genetica'

function FormField({ label, required, children, className }: {
  label: string; required?: boolean; children: React.ReactNode; className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function RowCard({ title, onRemove, children }: { title: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-[#2A2A2A] bg-gray-50 dark:bg-[#141414] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 truncate">{title}</span>
        <button onClick={onRemove} className="p-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex-shrink-0" title="Remover">
          <Trash2 size={12} />
        </button>
      </div>
      {children}
    </div>
  )
}

function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#A68B4B]/10 hover:bg-[#A68B4B]/20 text-[#A68B4B] text-[10px] font-bold uppercase tracking-wide transition-colors">
      <Plus size={12} /> {label}
    </button>
  )
}

function EmptyRows({ label }: { label: string }) {
  return <p className="text-center text-gray-400 text-xs py-6 border border-dashed border-gray-200 dark:border-[#333] rounded-xl">{label}</p>
}

function FechamentoFormModal({ initial, onClose, onSaved }: {
  initial: Fechamento | null; onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!initial
  const [form, setForm] = useState<FormData>(() => toFormData(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formTab, setFormTab] = useState<FormTab>('basico')

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) => setForm(p => ({ ...p, [k]: v }))

  type RowKey = 'por_assessor' | 'por_estado' | 'compradores' | 'lances'
  const addRow = <K extends RowKey>(k: K, item: FormData[K][number]) =>
    setForm(p => ({ ...p, [k]: [...p[k], item] as FormData[K] }))
  const updateRow = <K extends RowKey>(k: K, i: number, patch: Partial<FormData[K][number]>) =>
    setForm(p => ({ ...p, [k]: p[k].map((r, j) => j === i ? { ...r, ...patch } : r) as FormData[K] }))
  const removeRow = <K extends RowKey>(k: K, i: number) =>
    setForm(p => ({ ...p, [k]: p[k].filter((_, j) => j !== i) as FormData[K] }))

  const handleSubmit = async () => {
    if (!form.nome.trim() || !form.data) { setError('Preencha nome e data'); return }
    setSaving(true); setError(null)
    try {
      const payload = {
        nome: form.nome, data: form.data, local: form.local,
        lotes_ofertados: form.lotes_ofertados, lotes_vendidos: form.lotes_vendidos,
        animais_vendidos: form.animais_vendidos, vgv_total: form.vgv_total,
        ticket_medio: form.ticket_medio, maior_lance: form.maior_lance,
        faturamento_total_leilao: form.faturamento_total_leilao,
        compradores_unicos: form.compradores_unicos, estados_alcancados: form.estados_alcancados,
        comissao_assessoria: form.comissao_assessoria,
        receita_bula: form.receita_bula, sobra_bruta: form.sobra_bruta,
        acordo_pct_faturamento: form.acordo_pct_faturamento,
        acordo_pct_venda_cobertura: form.acordo_pct_venda_cobertura,
        acordo_descricao: (form.acordo_descricao ?? '').trim() || null,
        observacoes: form.observacoes,
        por_assessor: form.por_assessor, por_estado: form.por_estado,
        compradores: form.compradores, lances: form.lances,
        perfil_genetico: form.perfil_genetico,
      }
      const url = isEdit ? `/api/bula/fechamento/${initial!.id}` : '/api/bula/fechamento'
      const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error(await res.text())
      onSaved(); onClose()
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const FORM_TABS: { key: FormTab; label: string }[] = [
    { key: 'basico', label: 'Básico' },
    { key: 'assessores', label: `Assessores (${form.por_assessor.length})` },
    { key: 'compradores', label: `Compradores (${form.compradores.length})` },
    { key: 'lances', label: `Lances (${form.lances.length})` },
    { key: 'estados', label: `Estados (${form.por_estado.length})` },
    { key: 'genetica', label: 'Genética' },
  ]

  const pg = form.perfil_genetico

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-3xl bg-white dark:bg-[#141414] rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-[#2A2A2A]">
          <h2 className="font-bold text-gray-900 dark:text-white text-lg">{isEdit ? 'Editar Fechamento' : 'Novo Fechamento'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1A1A1A] text-gray-400 transition-colors"><X size={18} /></button>
        </div>

        {/* Form tabs */}
        <div className="flex border-b border-gray-100 dark:border-[#2A2A2A] px-4 overflow-x-auto flex-shrink-0">
          {FORM_TABS.map(t => (
            <button key={t.key} onClick={() => setFormTab(t.key)}
              className={`px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors
                ${formTab === t.key ? 'border-b-2 border-[#A68B4B] text-[#A68B4B]' : 'text-gray-400 hover:text-gray-600 border-b-2 border-transparent'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {formTab === 'basico' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Nome do Leilão" required><input className={inputCls} value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Nelore MRA 50 Anos" /></FormField>
                <FormField label="Data" required><input type="date" className={inputCls} value={form.data} onChange={e => set('data', e.target.value)} /></FormField>
              </div>
              <FormField label="Local"><input className={inputCls} value={form.local} onChange={e => set('local', e.target.value)} placeholder="Ex: Fazenda Paraíso – Terenos, MS" /></FormField>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Lotes Ofertados"><input type="number" className={inputCls} value={form.lotes_ofertados || ''} onChange={e => set('lotes_ofertados', Number(e.target.value))} min={0} /></FormField>
                <FormField label="Lotes Vendidos"><input type="number" className={inputCls} value={form.lotes_vendidos || ''} onChange={e => set('lotes_vendidos', Number(e.target.value))} min={0} /></FormField>
                <FormField label="Animais Vendidos"><input type="number" className={inputCls} value={form.animais_vendidos || ''} onChange={e => set('animais_vendidos', Number(e.target.value))} min={0} /></FormField>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="VGV Cobertura (R$)"><input type="number" className={inputCls} value={form.vgv_total || ''} onChange={e => set('vgv_total', Number(e.target.value))} min={0} /></FormField>
                <FormField label="Ticket Médio (R$)"><input type="number" className={inputCls} value={form.ticket_medio || ''} onChange={e => set('ticket_medio', Number(e.target.value))} min={0} /></FormField>
                <FormField label="Maior Lance (R$/parc.)"><input type="number" className={inputCls} value={form.maior_lance || ''} onChange={e => set('maior_lance', Number(e.target.value))} min={0} /></FormField>
              </div>
              <FormField label="Faturamento Leiloeira (R$)"><input type="number" className={inputCls} value={form.faturamento_total_leilao ?? ''} onChange={e => set('faturamento_total_leilao', e.target.value === '' ? null : Number(e.target.value))} min={0} placeholder="total do leilão inteiro" /></FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Compradores Únicos"><input type="number" className={inputCls} value={form.compradores_unicos || ''} onChange={e => set('compradores_unicos', Number(e.target.value))} min={0} /></FormField>
                <FormField label="Estados Alcançados"><input type="number" className={inputCls} value={form.estados_alcancados || ''} onChange={e => set('estados_alcancados', Number(e.target.value))} min={0} /></FormField>
              </div>

              <div className="rounded-xl border border-gray-100 dark:border-[#2A2A2A] bg-gray-50 dark:bg-[#141414] p-3 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                <span className="font-bold text-gray-700 dark:text-gray-300">Acordo comercial, comissões, Faturamento Bula, Lucro Bruto:</span>{' '}
                lançar em <a href="/sistema/leiloes/fechamento-financeiro" className="text-[#A68B4B] hover:underline font-semibold">Fechamento Leilões (ERP)</a>.
              </div>
              <FormField label="Observações">
                <textarea className={`${inputCls} h-24 resize-none`} value={form.observacoes} onChange={e => set('observacoes', e.target.value)} placeholder="Notas sobre o fechamento..." />
              </FormField>
            </>
          )}

          {formTab === 'assessores' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Assessores e suas métricas no leilão.</p>
                <AddRowButton label="Adicionar assessor" onClick={() => addRow('por_assessor', {
                  posicao: form.por_assessor.length + 1, nome: '', empresa: '',
                  transacoes: 0, animais: 0, vgv: 0, ticket_medio: 0, pct_total: 0,
                })} />
              </div>
              {form.por_assessor.length === 0 && <EmptyRows label="Nenhum assessor adicionado" />}
              {form.por_assessor.map((a, i) => (
                <RowCard key={i} title={`#${a.posicao || i + 1} — ${a.nome || 'Novo assessor'}`} onRemove={() => removeRow('por_assessor', i)}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <FormField label="Posição"><input type="number" className={inputCls} value={a.posicao || ''} onChange={e => updateRow('por_assessor', i, { posicao: Number(e.target.value) })} min={1} /></FormField>
                    <FormField label="Nome" className="md:col-span-2"><input className={inputCls} value={a.nome} onChange={e => updateRow('por_assessor', i, { nome: e.target.value })} placeholder="Nome do assessor" /></FormField>
                    <FormField label="Empresa"><input className={inputCls} value={a.empresa} onChange={e => updateRow('por_assessor', i, { empresa: e.target.value })} placeholder="Ex: Bula Remates" /></FormField>
                    <FormField label="Transações"><input type="number" className={inputCls} value={a.transacoes || ''} onChange={e => updateRow('por_assessor', i, { transacoes: Number(e.target.value) })} min={0} /></FormField>
                    <FormField label="Animais"><input type="number" className={inputCls} value={a.animais || ''} onChange={e => updateRow('por_assessor', i, { animais: Number(e.target.value) })} min={0} /></FormField>
                    <FormField label="VGV (R$)"><input type="number" className={inputCls} value={a.vgv || ''} onChange={e => updateRow('por_assessor', i, { vgv: Number(e.target.value) })} min={0} /></FormField>
                    <FormField label="Ticket Médio (R$)"><input type="number" className={inputCls} value={a.ticket_medio || ''} onChange={e => updateRow('por_assessor', i, { ticket_medio: Number(e.target.value) })} min={0} /></FormField>
                    <FormField label="% Total (0–1)" className="md:col-span-4"><input type="number" step="0.01" className={inputCls} value={a.pct_total || ''} onChange={e => updateRow('por_assessor', i, { pct_total: Number(e.target.value) })} min={0} max={1} placeholder="Ex: 0.35 para 35%" /></FormField>
                  </div>
                </RowCard>
              ))}
            </div>
          )}

          {formTab === 'compradores' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Ranking dos compradores.</p>
                <AddRowButton label="Adicionar comprador" onClick={() => addRow('compradores', {
                  rank: form.compradores.length + 1, fazenda: '', comprador: '', cidade: '', uf: '',
                  lotes: 0, animais: 0, vgv: 0,
                })} />
              </div>
              {form.compradores.length === 0 && <EmptyRows label="Nenhum comprador adicionado" />}
              {form.compradores.map((c, i) => (
                <RowCard key={i} title={`#${c.rank || i + 1} — ${c.fazenda || 'Novo comprador'}`} onRemove={() => removeRow('compradores', i)}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <FormField label="Rank"><input type="number" className={inputCls} value={c.rank || ''} onChange={e => updateRow('compradores', i, { rank: Number(e.target.value) })} min={1} /></FormField>
                    <FormField label="Fazenda" className="md:col-span-3"><input className={inputCls} value={c.fazenda} onChange={e => updateRow('compradores', i, { fazenda: e.target.value })} placeholder="Ex: Fazenda Paraíso" /></FormField>
                    <FormField label="Comprador" className="md:col-span-2"><input className={inputCls} value={c.comprador} onChange={e => updateRow('compradores', i, { comprador: e.target.value })} placeholder="Nome do comprador" /></FormField>
                    <FormField label="Cidade"><input className={inputCls} value={c.cidade} onChange={e => updateRow('compradores', i, { cidade: e.target.value })} placeholder="Cidade" /></FormField>
                    <FormField label="UF"><input className={inputCls} value={c.uf} onChange={e => updateRow('compradores', i, { uf: e.target.value.toUpperCase() })} maxLength={2} placeholder="MS" /></FormField>
                    <FormField label="Lotes"><input type="number" className={inputCls} value={c.lotes || ''} onChange={e => updateRow('compradores', i, { lotes: Number(e.target.value) })} min={0} /></FormField>
                    <FormField label="Animais"><input type="number" className={inputCls} value={c.animais || ''} onChange={e => updateRow('compradores', i, { animais: Number(e.target.value) })} min={0} /></FormField>
                    <FormField label="VGV (R$)" className="md:col-span-2"><input type="number" className={inputCls} value={c.vgv || ''} onChange={e => updateRow('compradores', i, { vgv: Number(e.target.value) })} min={0} /></FormField>
                  </div>
                </RowCard>
              ))}
            </div>
          )}

          {formTab === 'lances' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Cada lance corresponde a um lote vendido.</p>
                <AddRowButton label="Adicionar lance" onClick={() => addRow('lances', {
                  lote: '', fazenda: '', comprador: '', uf: '', assessor: '', empresa: '',
                  animais: 0, parcela: 0, vgv: 0,
                })} />
              </div>
              {form.lances.length === 0 && <EmptyRows label="Nenhum lance adicionado" />}
              {form.lances.map((l, i) => (
                <RowCard key={i} title={`Lote ${l.lote || (i + 1)} — ${l.fazenda || '—'}`} onRemove={() => removeRow('lances', i)}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <FormField label="Lote"><input className={inputCls} value={l.lote} onChange={e => updateRow('lances', i, { lote: e.target.value })} placeholder="Ex: 1" /></FormField>
                    <FormField label="UF"><input className={inputCls} value={l.uf} onChange={e => updateRow('lances', i, { uf: e.target.value.toUpperCase() })} maxLength={2} placeholder="MS" /></FormField>
                    <FormField label="Animais"><input type="number" className={inputCls} value={l.animais || ''} onChange={e => updateRow('lances', i, { animais: Number(e.target.value) })} min={0} /></FormField>
                    <FormField label="Parcela (R$)"><input type="number" className={inputCls} value={l.parcela || ''} onChange={e => updateRow('lances', i, { parcela: Number(e.target.value) })} min={0} /></FormField>
                    <FormField label="Fazenda" className="md:col-span-2"><input className={inputCls} value={l.fazenda} onChange={e => updateRow('lances', i, { fazenda: e.target.value })} placeholder="Nome da fazenda" /></FormField>
                    <FormField label="Comprador" className="md:col-span-2"><input className={inputCls} value={l.comprador} onChange={e => updateRow('lances', i, { comprador: e.target.value })} placeholder="Nome do comprador" /></FormField>
                    <FormField label="Assessor" className="md:col-span-2"><input className={inputCls} value={l.assessor} onChange={e => updateRow('lances', i, { assessor: e.target.value })} placeholder="Nome do assessor" /></FormField>
                    <FormField label="Empresa"><input className={inputCls} value={l.empresa} onChange={e => updateRow('lances', i, { empresa: e.target.value })} placeholder="Ex: Bula Remates" /></FormField>
                    <FormField label="VGV (R$)"><input type="number" className={inputCls} value={l.vgv || ''} onChange={e => updateRow('lances', i, { vgv: Number(e.target.value) })} min={0} /></FormField>
                  </div>
                </RowCard>
              ))}
            </div>
          )}

          {formTab === 'estados' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Distribuição do VGV por estado.</p>
                <AddRowButton label="Adicionar estado" onClick={() => addRow('por_estado', {
                  uf: '', estado: '', lotes: 0, animais: 0, vgv: 0, pct_total: 0,
                })} />
              </div>
              {form.por_estado.length === 0 && <EmptyRows label="Nenhum estado adicionado" />}
              {form.por_estado.map((e, i) => (
                <RowCard key={i} title={`${e.uf || '—'}${e.estado ? ` — ${e.estado}` : ''}`} onRemove={() => removeRow('por_estado', i)}>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    <FormField label="UF"><input className={inputCls} value={e.uf} onChange={ev => updateRow('por_estado', i, { uf: ev.target.value.toUpperCase() })} maxLength={2} placeholder="MS" /></FormField>
                    <FormField label="Estado" className="md:col-span-3"><input className={inputCls} value={e.estado} onChange={ev => updateRow('por_estado', i, { estado: ev.target.value })} placeholder="Mato Grosso do Sul" /></FormField>
                    <FormField label="Lotes"><input type="number" className={inputCls} value={e.lotes || ''} onChange={ev => updateRow('por_estado', i, { lotes: Number(ev.target.value) })} min={0} /></FormField>
                    <FormField label="Animais"><input type="number" className={inputCls} value={e.animais || ''} onChange={ev => updateRow('por_estado', i, { animais: Number(ev.target.value) })} min={0} /></FormField>
                    <FormField label="VGV (R$)" className="md:col-span-3"><input type="number" className={inputCls} value={e.vgv || ''} onChange={ev => updateRow('por_estado', i, { vgv: Number(ev.target.value) })} min={0} /></FormField>
                    <FormField label="% Total (0–1)" className="md:col-span-3"><input type="number" step="0.01" className={inputCls} value={e.pct_total || ''} onChange={ev => updateRow('por_estado', i, { pct_total: Number(ev.target.value) })} min={0} max={1} placeholder="Ex: 0.25 para 25%" /></FormField>
                  </div>
                </RowCard>
              ))}
            </div>
          )}

          {formTab === 'genetica' && (
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={!!pg}
                  onChange={e => set('perfil_genetico', e.target.checked ? { indices: [], crias_sexo: [] } : null)} />
                Registrar perfil genético
              </label>

              {pg && (
                <>
                  {/* Índices */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Índices Genéticos ({pg.indices.length})</p>
                      <AddRowButton label="Adicionar índice" onClick={() => set('perfil_genetico', {
                        ...pg, indices: [...pg.indices, { fonte: '', media_vendida: 0, media_catalogo: 0, diferenca: '', classificacao: '' }]
                      })} />
                    </div>
                    {pg.indices.length === 0 && <EmptyRows label="Nenhum índice adicionado" />}
                    {pg.indices.map((idx, i) => (
                      <RowCard key={i} title={idx.fonte || `Índice #${i + 1}`} onRemove={() => set('perfil_genetico', { ...pg, indices: pg.indices.filter((_, j) => j !== i) })}>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                          <FormField label="Fonte"><input className={inputCls} value={idx.fonte} onChange={e => set('perfil_genetico', { ...pg, indices: pg.indices.map((x, j) => j === i ? { ...x, fonte: e.target.value } : x) })} placeholder="Ex: iABCZ" /></FormField>
                          <FormField label="Média Vendida"><input type="number" step="0.01" className={inputCls} value={idx.media_vendida || ''} onChange={e => set('perfil_genetico', { ...pg, indices: pg.indices.map((x, j) => j === i ? { ...x, media_vendida: Number(e.target.value) } : x) })} /></FormField>
                          <FormField label="Média Catálogo"><input type="number" step="0.01" className={inputCls} value={idx.media_catalogo || ''} onChange={e => set('perfil_genetico', { ...pg, indices: pg.indices.map((x, j) => j === i ? { ...x, media_catalogo: Number(e.target.value) } : x) })} /></FormField>
                          <FormField label="Diferença"><input className={inputCls} value={idx.diferenca} onChange={e => set('perfil_genetico', { ...pg, indices: pg.indices.map((x, j) => j === i ? { ...x, diferenca: e.target.value } : x) })} placeholder="Ex: +12.5%" /></FormField>
                          <FormField label="Classificação"><input className={inputCls} value={idx.classificacao} onChange={e => set('perfil_genetico', { ...pg, indices: pg.indices.map((x, j) => j === i ? { ...x, classificacao: e.target.value } : x) })} placeholder="Ex: Elite" /></FormField>
                        </div>
                      </RowCard>
                    ))}
                  </div>

                  {/* Crias por sexo */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Sexo das Crias ({pg.crias_sexo.length})</p>
                      <AddRowButton label="Adicionar" onClick={() => set('perfil_genetico', {
                        ...pg, crias_sexo: [...pg.crias_sexo, { sexo: '', quantidade: 0, pct: 0, observacao: '' }]
                      })} />
                    </div>
                    {pg.crias_sexo.length === 0 && <EmptyRows label="Nenhuma cria adicionada" />}
                    {pg.crias_sexo.map((s, i) => (
                      <RowCard key={i} title={s.sexo || `Cria #${i + 1}`} onRemove={() => set('perfil_genetico', { ...pg, crias_sexo: pg.crias_sexo.filter((_, j) => j !== i) })}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <FormField label="Sexo"><input className={inputCls} value={s.sexo} onChange={e => set('perfil_genetico', { ...pg, crias_sexo: pg.crias_sexo.map((x, j) => j === i ? { ...x, sexo: e.target.value } : x) })} placeholder="Macho / Fêmea" /></FormField>
                          <FormField label="Quantidade"><input type="number" className={inputCls} value={s.quantidade || ''} onChange={e => set('perfil_genetico', { ...pg, crias_sexo: pg.crias_sexo.map((x, j) => j === i ? { ...x, quantidade: Number(e.target.value) } : x) })} min={0} /></FormField>
                          <FormField label="% (0–1)"><input type="number" step="0.01" className={inputCls} value={s.pct || ''} onChange={e => set('perfil_genetico', { ...pg, crias_sexo: pg.crias_sexo.map((x, j) => j === i ? { ...x, pct: Number(e.target.value) } : x) })} min={0} max={1} /></FormField>
                          <FormField label="Observação"><input className={inputCls} value={s.observacao} onChange={e => set('perfil_genetico', { ...pg, crias_sexo: pg.crias_sexo.map((x, j) => j === i ? { ...x, observacao: e.target.value } : x) })} placeholder="Ex: padrão" /></FormField>
                        </div>
                      </RowCard>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle size={15} /> {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-[#2A2A2A] flex justify-end gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1A1A1A] transition-colors">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#A68B4B] hover:bg-[#C8A96E] text-black text-sm font-semibold disabled:opacity-50 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEdit ? 'Salvar alterações' : 'Criar fechamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main View ──────────────────────────────────────────────────────────────────

type SortKey = 'recent' | 'vgv' | 'cobertura'
type ViewMode = 'cards' | 'table'

export default function FechamentoView({ canSeeFinance = false }: { canSeeFinance?: boolean }) {
  return (
    <FinanceVisibilityCtx.Provider value={canSeeFinance}>
      <FechamentoViewInner />
    </FinanceVisibilityCtx.Provider>
  )
}

function FechamentoViewInner() {
  const canSeeFinance = useCanSeeFinance()
  const [items, setItems] = useState<Fechamento[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Fechamento | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [sortBy, setSortBy] = useState<SortKey>('recent')
  const [filterDataInicio, setFilterDataInicio] = useState('')
  const [filterDataFim, setFilterDataFim] = useState('')
  const [filterLeilao, setFilterLeilao] = useState('')
  const [filterAssessor, setFilterAssessor] = useState('')

  // Deep-link: o fechamento aberto vive em `?id=<uuid>` pra permitir
  // compartilhar URL exata do detalhe (/sistema/leiloes/fechamento?id=…).
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const selectedId = searchParams.get('id')
  const selected = useMemo(
    () => (selectedId ? items.find(f => f.id === selectedId) ?? null : null),
    [items, selectedId]
  )

  const setSelectedId = useCallback((id: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set('id', id)
    else params.delete('id')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname, searchParams])

  // View mode (cards default, "tabela" via ?view=tabela — convenção do projeto).
  const viewMode: ViewMode = searchParams.get('view') === 'tabela' ? 'table' : 'cards'
  const setViewMode = useCallback((v: ViewMode) => {
    const params = new URLSearchParams(searchParams.toString())
    if (v === 'table') params.set('view', 'tabela')
    else params.delete('view')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname, searchParams])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bula/fechamento')
      if (res.ok) setItems(await res.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleDelete = async () => {
    if (!selected) return
    if (!confirm(`Excluir fechamento "${selected.nome}"?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/bula/fechamento/${selected.id}`, { method: 'DELETE' })
      setSelectedId(null)
      fetchAll()
    } finally { setDeleting(false) }
  }

  const handleEdit = (f: Fechamento) => {
    setEditItem(f)
    setShowForm(true)
    setSelectedId(null)
  }

  // Listas pra preencher os selects de filtro — derivadas do conjunto completo
  const uniqueLeiloes = useMemo(
    () => Array.from(new Set(items.map(f => f.nome).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [items]
  )
  const uniqueAssessores = useMemo(() => {
    const set = new Set<string>()
    for (const f of items) for (const a of f.por_assessor ?? []) {
      const canon = normalizeAssessorNome(a.nome)
      if (canon) set.add(canon)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [items])

  const filteredItems = useMemo(() => {
    return items.filter(f => {
      if (filterDataInicio && f.data < filterDataInicio) return false
      if (filterDataFim    && f.data > filterDataFim)    return false
      if (filterLeilao     && f.nome !== filterLeilao)   return false
      if (filterAssessor) {
        const has = (f.por_assessor ?? []).some(a => normalizeAssessorNome(a.nome) === filterAssessor)
        if (!has) return false
      }
      return true
    })
  }, [items, filterDataInicio, filterDataFim, filterLeilao, filterAssessor])

  const hasActiveFilter = !!(filterDataInicio || filterDataFim || filterLeilao || filterAssessor)
  const clearFilters = () => {
    setFilterDataInicio(''); setFilterDataFim(''); setFilterLeilao(''); setFilterAssessor('')
  }

  const sortedItems = useMemo(() => {
    const arr = [...filteredItems]
    if (sortBy === 'vgv') arr.sort((a, b) => b.vgv_total - a.vgv_total)
    else if (sortBy === 'cobertura') arr.sort((a, b) =>
      coveragePct(b.lotes_vendidos, b.lotes_ofertados) - coveragePct(a.lotes_vendidos, a.lotes_ofertados))
    else arr.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    return arr
  }, [filteredItems, sortBy])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Fechamento de Leilões</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            {hasActiveFilter
              ? `${filteredItems.length} de ${items.length} ${items.length !== 1 ? 'leilões' : 'leilão'} (filtro ativo)`
              : `${items.length} ${items.length !== 1 ? 'leilões' : 'leilão'} com resultado registrado`}
          </p>
        </div>
        {canSeeFinance && (
          <button
            onClick={() => { setEditItem(null); setShowForm(true) }}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#A68B4B] hover:bg-[#C8A96E] text-black rounded-xl font-semibold text-sm transition-colors shadow-lg shadow-[#A68B4B]/20"
          >
            <Plus size={16} /> Novo Fechamento
          </button>
        )}
      </div>

      {/* Filtros — data, leilão e assessor */}
      {items.length > 0 && (
        <div className="rounded-xl border border-gray-100 dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] p-3">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Data início</label>
              <input
                type="date"
                value={filterDataInicio}
                onChange={e => setFilterDataInicio(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-[#333] bg-white dark:bg-[#141414] text-gray-800 dark:text-gray-200 focus:outline-none focus:border-[#A68B4B]"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Data fim</label>
              <input
                type="date"
                value={filterDataFim}
                onChange={e => setFilterDataFim(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-[#333] bg-white dark:bg-[#141414] text-gray-800 dark:text-gray-200 focus:outline-none focus:border-[#A68B4B]"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-[1.5]">
              <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Leilão</label>
              <select
                value={filterLeilao}
                onChange={e => setFilterLeilao(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-[#333] bg-white dark:bg-[#141414] text-gray-800 dark:text-gray-200 focus:outline-none focus:border-[#A68B4B]"
              >
                <option value="">Todos</option>
                {uniqueLeiloes.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Assessor</label>
              <select
                value={filterAssessor}
                onChange={e => setFilterAssessor(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-[#333] bg-white dark:bg-[#141414] text-gray-800 dark:text-gray-200 focus:outline-none focus:border-[#A68B4B]"
              >
                <option value="">Todos</option>
                {uniqueAssessores.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            {hasActiveFilter && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-gray-200 dark:border-[#333] text-gray-500 dark:text-gray-400 hover:text-[#A68B4B] hover:border-[#A68B4B] transition-colors"
              >
                <X size={12} /> Limpar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="animate-spin text-[#A68B4B]" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-gray-200 dark:border-[#333] flex items-center justify-center">
            <BarChart3 size={28} className="text-gray-300 dark:text-gray-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-500">Nenhum fechamento registrado</p>
            <p className="text-xs text-gray-400 mt-1">Adicione o resultado de um leilão para começar</p>
          </div>
          {canSeeFinance && (
            <button
              onClick={() => { setEditItem(null); setShowForm(true) }}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#A68B4B] hover:bg-[#C8A96E] text-black rounded-xl font-semibold text-sm transition-colors"
            >
              <Plus size={15} /> Adicionar primeiro fechamento
            </button>
          )}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-gray-200 dark:border-[#333] flex items-center justify-center">
            <AlertCircle size={28} className="text-gray-300 dark:text-gray-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-500">Nenhum fechamento corresponde aos filtros</p>
            <p className="text-xs text-gray-400 mt-1">Ajuste os critérios ou limpe os filtros pra ver tudo</p>
          </div>
          <button
            onClick={clearFilters}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-[#333] text-gray-600 dark:text-gray-300 hover:text-[#A68B4B] hover:border-[#A68B4B] rounded-lg font-semibold text-xs transition-colors"
          >
            <X size={13} /> Limpar filtros
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Todos os leilões</p>
            <div className="flex-1 min-w-4 h-px bg-gray-100 dark:bg-[#2A2A2A]" />
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-gray-50 dark:bg-[#0D0D0D] border border-gray-100 dark:border-[#2A2A2A]">
              {([
                { key: 'recent' as const, label: 'Recentes' },
                { key: 'vgv' as const, label: 'VGV' },
                { key: 'cobertura' as const, label: 'Cobertura' },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all
                    ${sortBy === key
                      ? 'bg-white dark:bg-[#1A1A1A] text-[#A68B4B] shadow-sm'
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-gray-50 dark:bg-[#0D0D0D] border border-gray-100 dark:border-[#2A2A2A]">
              <button
                onClick={() => setViewMode('cards')}
                title="Visualização em cards"
                className={`flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all
                  ${viewMode === 'cards'
                    ? 'bg-white dark:bg-[#1A1A1A] text-[#A68B4B] shadow-sm'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
              >
                <LayoutGrid size={11} /> Cards
              </button>
              <button
                onClick={() => setViewMode('table')}
                title="Visualização em tabela"
                className={`flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all
                  ${viewMode === 'table'
                    ? 'bg-white dark:bg-[#1A1A1A] text-[#A68B4B] shadow-sm'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
              >
                <TableIcon size={11} /> Tabela
              </button>
            </div>
          </div>
          {viewMode === 'cards' ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sortedItems.map(f => (
                <FechamentoCard
                  key={f.id}
                  f={f}
                  selected={selected?.id === f.id}
                  onClick={() => setSelectedId(selected?.id === f.id ? null : f.id)}
                />
              ))}
            </div>
          ) : (
            <FechamentoTable
              items={sortedItems}
              selectedId={selected?.id ?? null}
              onSelect={(id) => setSelectedId(selected?.id === id ? null : id)}
            />
          )}
        </>
      )}

      {/* Detail Drawer */}
      {selected && (
        <FechamentoDrawer
          f={selected}
          onClose={() => setSelectedId(null)}
          onEdit={() => handleEdit(selected)}
          onDelete={handleDelete}
        />
      )}

      {/* Delete overlay */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <Loader2 size={32} className="animate-spin text-white" />
        </div>
      )}

      {/* Form Modal — só finance-admin acessa */}
      {showForm && canSeeFinance && (
        <FechamentoFormModal
          initial={editItem}
          onClose={() => { setShowForm(false); setEditItem(null) }}
          onSaved={() => { fetchAll(); setSelectedId(null) }}
        />
      )}
    </div>
  )
}
