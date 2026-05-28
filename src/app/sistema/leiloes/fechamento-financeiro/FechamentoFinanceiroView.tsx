'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, ArrowRight, BadgeDollarSign, Calculator, ChevronRight,
  Loader2, Save, X,
} from 'lucide-react'
import { resolverAcordo, calcularReceitaBulaEsperada, formatarAcordoCurto } from '@/lib/leilao-acordos'

// ── Tipo ─────────────────────────────────────────────────────
// Mesmos campos que `bula_leilao_fechamento` expõe pra finance-admin.
// Aqui só listamos o subset que esta tela usa.
type FechamentoFinanceiro = {
  id: string
  nome: string
  data: string
  vgv_total: number
  faturamento_total_leilao: number | null
  receita_bula: number | null
  sobra_bruta: number | null
  comissao_assessoria: number | null
  acordo_pct_faturamento: number | null
  acordo_pct_venda_cobertura: number | null
  acordo_descricao: string | null
}

const R = (v: number | null | undefined) =>
  v == null ? 'R$ —' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`

const MES: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun',
  '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
}
function fmtDate(iso: string) {
  const [y, m, d] = (iso || '').split('-')
  return { dia: Number(d) || 0, mes: MES[m] ?? m ?? '', ano: y ?? '' }
}

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-[#333] bg-white dark:bg-[#0D0D0D] text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-[#A68B4B] transition-colors"

// ── View principal ───────────────────────────────────────────

export default function FechamentoFinanceiroView() {
  const [items, setItems] = useState<FechamentoFinanceiro[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bula/fechamento', { cache: 'no-store' })
      if (res.ok) setItems(await res.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const editing = useMemo(
    () => items.find(f => f.id === editingId) ?? null,
    [items, editingId]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
            Fechamento Leilões <span className="text-[#A68B4B]">(ERP)</span>
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Acordo comercial, comissões, Faturamento Bula e Lucro Bruto. Dados restritos à diretoria.
          </p>
        </div>
        <a
          href="/sistema/leiloes/fechamento"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-[#A68B4B] transition-colors"
        >
          Ver painel comercial <ArrowRight size={12} />
        </a>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="animate-spin text-[#A68B4B]" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl border border-gray-200 dark:border-[#333] flex items-center justify-center">
            <BadgeDollarSign size={24} className="text-gray-300 dark:text-gray-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-500">Nenhum fechamento registrado</p>
            <p className="text-xs text-gray-400 mt-1">Crie um fechamento na página comercial para lançar os dados financeiros aqui.</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-[#2A2A2A]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#141414] border-b border-gray-100 dark:border-[#2A2A2A]">
                {[
                  { l: 'Data',                   c: 'text-left whitespace-nowrap' },
                  { l: 'Leilão',                 c: 'text-left' },
                  { l: 'VGV Cobertura',          c: 'text-right whitespace-nowrap' },
                  { l: 'Fat. Leiloeira',         c: 'text-right whitespace-nowrap' },
                  { l: 'Acordo',                 c: 'text-left whitespace-nowrap' },
                  { l: 'Receita Esperada',       c: 'text-right whitespace-nowrap' },
                  { l: 'Fat. Bula (nosso)',      c: 'text-right whitespace-nowrap' },
                  { l: 'Lucro Bruto',            c: 'text-right whitespace-nowrap' },
                  { l: '',                       c: 'w-8' },
                ].map(h => (
                  <th key={h.l} className={`px-3 py-2.5 font-bold uppercase tracking-widest text-[9px] text-gray-500 dark:text-gray-400 ${h.c}`}>{h.l}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-[#262626]">
              {items.map(f => {
                const dt = fmtDate(f.data)
                const acordo = resolverAcordo(f)
                const esperado = calcularReceitaBulaEsperada(acordo, f.faturamento_total_leilao, f.vgv_total)
                const diff = esperado != null && f.receita_bula != null ? f.receita_bula - esperado : null
                const diverge = diff != null && Math.abs(diff) >= 1
                return (
                  <tr
                    key={f.id}
                    onClick={() => setEditingId(f.id)}
                    className="group bg-white dark:bg-[#141414] hover:bg-[#A68B4B]/3 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-bold text-[#A68B4B]">{dt.dia} {dt.mes}</span>
                      <span className="text-gray-400 ml-1">/{dt.ano.slice(-2)}</span>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-gray-900 dark:text-gray-100 max-w-[280px]">
                      <span className="line-clamp-1" title={f.nome}>{f.nome}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[#A68B4B]">{R(f.vgv_total)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {f.faturamento_total_leilao != null ? R(f.faturamento_total_leilao) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5 max-w-[200px]">
                      {acordo ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#A68B4B]/10 text-[#A68B4B] text-[10px] font-bold tracking-wide">
                          {formatarAcordoCurto(acordo)}
                        </span>
                      ) : <span className="text-gray-300 dark:text-gray-600 text-[10px]">sem acordo</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {esperado != null ? R(esperado) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {f.receita_bula != null ? (
                        <span className={diverge ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-gray-800 dark:text-gray-200 font-semibold'}>
                          {R(f.receita_bula)}{diverge && <span className="ml-1 text-[10px]" title={`Diverge ${R(Math.abs(diff!))} do acordo`}>⚠</span>}
                        </span>
                      ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {f.sobra_bruta != null ? (
                        <span className={(f.sobra_bruta < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400') + ' font-semibold'}>
                          {R(f.sobra_bruta)}
                        </span>
                      ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <ChevronRight size={14} className="text-gray-300 dark:text-gray-700 group-hover:text-[#A68B4B] transition-colors" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditDrawer
          f={editing}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); fetchAll() }}
        />
      )}
    </div>
  )
}

// ── Drawer de edição ─────────────────────────────────────────

function EditDrawer({ f, onClose, onSaved }: {
  f: FechamentoFinanceiro
  onClose: () => void
  onSaved: () => void
}) {
  const [receita, setReceita] = useState<number | null>(f.receita_bula)
  const [sobra, setSobra] = useState<number | null>(f.sobra_bruta)
  const [comissao, setComissao] = useState<number | null>(f.comissao_assessoria)
  const [pctFat, setPctFat] = useState<number | null>(f.acordo_pct_faturamento)
  const [pctCob, setPctCob] = useState<number | null>(f.acordo_pct_venda_cobertura)
  const [descricao, setDescricao] = useState<string>(f.acordo_descricao ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const esperado = useMemo(() => {
    const a = (pctFat ?? 0) * (f.faturamento_total_leilao ?? 0)
    const b = (pctCob ?? 0) * (f.vgv_total ?? 0)
    return a + b
  }, [pctFat, pctCob, f.faturamento_total_leilao, f.vgv_total])

  const diff = receita != null && esperado > 0 ? receita - esperado : null
  const ok = diff == null ? true : Math.abs(diff) < 1

  const dt = fmtDate(f.data)

  const submit = async () => {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/bula/fechamento/${f.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receita_bula: receita,
          sobra_bruta: sobra,
          comissao_assessoria: comissao ?? 0,
          acordo_pct_faturamento: pctFat,
          acordo_pct_venda_cobertura: pctCob,
          acordo_descricao: (descricao ?? '').trim() || null,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-[#141414] rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 dark:border-[#2A2A2A]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#A68B4B]">{dt.dia} {dt.mes} / {dt.ano.slice(-2)}</p>
            <h2 className="font-bold text-gray-900 dark:text-white text-lg leading-tight mt-1">{f.nome}</h2>
            <p className="text-[10px] text-gray-400 mt-1.5">
              Referência: VGV Cobertura {R(f.vgv_total)} · Fat. Leiloeira {R(f.faturamento_total_leilao)}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1A1A1A] text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Acordo comercial */}
          <div className="rounded-xl border border-[#A68B4B]/25 bg-[#A68B4B]/5 p-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#A68B4B]">Acordo comercial com o promotor</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
              Cada leilão pode ter acordo diferente. Preencha um ou os dois percentuais conforme combinado e descreva o acordo livremente.
            </p>
            <FormField label="Descrição do acordo (texto livre)">
              <input
                className={inputCls}
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                placeholder='Ex: "1% do faturamento total + 3% da venda da cobertura"'
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="% sobre Faturamento Leiloeira">
                <input
                  type="number" step="0.001" min={0}
                  className={inputCls}
                  value={pctFat != null ? (pctFat * 100) : ''}
                  onChange={e => setPctFat(e.target.value === '' ? null : Number(e.target.value) / 100)}
                  placeholder="Ex: 0.33 → 0,33%"
                />
              </FormField>
              <FormField label="% sobre VGV Cobertura (venda)">
                <input
                  type="number" step="0.001" min={0}
                  className={inputCls}
                  value={pctCob != null ? (pctCob * 100) : ''}
                  onChange={e => setPctCob(e.target.value === '' ? null : Number(e.target.value) / 100)}
                  placeholder="Ex: 3 → 3%"
                />
              </FormField>
            </div>
            {esperado > 0 && (
              <div className={`text-[11px] px-3 py-2 rounded-lg border flex items-center gap-2 ${ok ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400' : 'border-amber-500/40 bg-amber-500/8 text-amber-700 dark:text-amber-400'}`}>
                <Calculator size={13} />
                <span className="font-bold">Receita esperada pelo acordo:</span>
                <span className="font-mono">{R(esperado)}</span>
                {!ok && receita != null && diff != null && (
                  <span className="ml-auto font-bold">⚠ diverge em {R(Math.abs(diff))}</span>
                )}
              </div>
            )}
          </div>

          {/* Receita / Lucro / Comissão */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FormField label="Faturamento Bula — nosso (R$)">
              <input
                type="number" min={0} className={inputCls}
                value={receita ?? ''}
                onChange={e => setReceita(e.target.value === '' ? null : Number(e.target.value))}
                placeholder="receita a receber"
              />
            </FormField>
            <FormField label="Lucro Bruto (R$)">
              <input
                type="number" className={inputCls}
                value={sobra ?? ''}
                onChange={e => setSobra(e.target.value === '' ? null : Number(e.target.value))}
                placeholder="receita − comissões"
              />
            </FormField>
            <FormField label="Comissão Assessoria (R$)">
              <input
                type="number" min={0} className={inputCls}
                value={comissao ?? ''}
                onChange={e => setComissao(e.target.value === '' ? null : Number(e.target.value))}
                placeholder="total pago"
              />
            </FormField>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle size={15} /> {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-[#2A2A2A] flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1A1A1A] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#A68B4B] hover:bg-[#C8A96E] text-black text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
