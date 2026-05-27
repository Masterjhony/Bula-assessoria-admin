'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Edit2, Trash2, X, Loader2, Save, Mail, Phone, AlertCircle,
  Users, Building2, Hash, ChevronDown, ChevronUp, Power,
} from 'lucide-react'

type EquipeMembro = {
  id: string
  nome: string
  apelido: string
  iniciais: string
  cor: string
  empresa: string
  telefone: string
  email: string
  foto_url: string
  ativo: boolean
  ordem: number
  observacao: string
  created_at?: string
  updated_at?: string
}

type FormState = Omit<EquipeMembro, 'id' | 'created_at' | 'updated_at'>

const EMPTY_FORM: FormState = {
  nome: '', apelido: '', iniciais: '', cor: '#A68B4B', empresa: '',
  telefone: '', email: '', foto_url: '', ativo: true, ordem: 999, observacao: '',
}

const COR_PRESETS = ['#4A8FBF', '#C8A96E', '#6B8F5C', '#A68B4B', '#A864AE', '#D4707A', '#9B59B6', '#D4A843']
const EMPRESA_PRESETS = ['Bula Assessoria', 'Bula Remates']

function autoIniciais(nome: string): string {
  return nome.trim().split(/\s+/).map(p => p[0] ?? '').join('').slice(0, 2).toUpperCase()
}

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-[#333] bg-white dark:bg-[#0D0D0D] text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-[#A68B4B] transition-colors"
const labelCls = "block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1"

export default function EquipePage() {
  const [items, setItems] = useState<EquipeMembro[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<EquipeMembro | null>(null)
  const [creating, setCreating] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/leiloes/equipe', { cache: 'no-store' })
      if (!r.ok) throw new Error(await r.text())
      setItems(await r.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar equipe')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const visible = showInactive ? items : items.filter(i => i.ativo)
  const ativos = items.filter(i => i.ativo).length

  return (
    <div className="dcl-root">
      <div className="dcl-pagehead">
        <div>
          <h1>Equipe <span className="dcl-serif">de leilões</span></h1>
          <div className="dcl-sub">
            Roster de assessores que atuam nos leilões. Substitui as variantes de string em fechamentos
            e alimenta o checklist operacional.
          </div>
        </div>
        <div className="dcl-pagehead-right">
          <button
            onClick={() => setShowInactive(s => !s)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-[#333] hover:bg-gray-50 dark:hover:bg-[#222222]"
          >
            <Power size={13} /> {showInactive ? 'Esconder inativos' : `Mostrar inativos (${items.length - ativos})`}
          </button>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-[#A68B4B] hover:bg-[#8E6A28]"
          >
            <Plus size={13} /> Novo assessor
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard icon={Users} label="Assessores ativos" value={ativos.toString()} />
        <StatCard icon={Hash} label="Total cadastrado" value={items.length.toString()} />
        <StatCard icon={Building2} label="Bula Assessoria" value={items.filter(i => i.ativo && i.empresa === 'Bula Assessoria').length.toString()} />
        <StatCard icon={Building2} label="Bula Remates" value={items.filter(i => i.ativo && i.empresa === 'Bula Remates').length.toString()} />
      </div>

      {/* Errors */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-[#A68B4B]" />
        </div>
      ) : visible.length === 0 ? (
        <div className="py-20 text-center text-sm text-gray-500 dark:text-gray-400">
          Nenhum assessor cadastrado. Clique em <span className="font-semibold text-[#A68B4B]">“Novo assessor”</span> para começar.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map(m => (
            <MembroCard
              key={m.id}
              membro={m}
              onEdit={() => setEditing(m)}
            />
          ))}
        </div>
      )}

      {creating && (
        <FormModal
          title="Novo assessor"
          initial={EMPTY_FORM}
          onClose={() => setCreating(false)}
          onSubmit={async (form) => {
            const r = await fetch('/api/leiloes/equipe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(form),
            })
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao salvar')
            setCreating(false)
            await refresh()
          }}
        />
      )}

      {editing && (
        <FormModal
          title={`Editar ${editing.nome}`}
          initial={editing}
          allowDelete
          onClose={() => setEditing(null)}
          onSubmit={async (form) => {
            const r = await fetch(`/api/leiloes/equipe/${editing.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(form),
            })
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao salvar')
            setEditing(null)
            await refresh()
          }}
          onDelete={async () => {
            if (!confirm(`Excluir ${editing.nome}? Esta ação não pode ser desfeita.`)) return
            const r = await fetch(`/api/leiloes/equipe/${editing.id}`, { method: 'DELETE' })
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao excluir')
            setEditing(null)
            await refresh()
          }}
        />
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string }) {
  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A]">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
        <Icon size={12} /> {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-gray-800 dark:text-gray-100">{value}</div>
    </div>
  )
}

function MembroCard({ membro, onEdit }: { membro: EquipeMembro; onEdit: () => void }) {
  return (
    <div
      className={`p-4 rounded-2xl bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] hover:border-[#A68B4B]/50 transition-colors cursor-pointer ${membro.ativo ? '' : 'opacity-60'}`}
      onClick={onEdit}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
          style={{ background: membro.cor }}
        >
          {membro.iniciais || autoIniciais(membro.nome)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate">{membro.nome}</h3>
            {!membro.ativo && (
              <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-500/15 text-gray-500 dark:text-gray-400">
                Inativo
              </span>
            )}
          </div>
          {membro.apelido && (
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{membro.apelido}</div>
          )}
          {membro.empresa && (
            <div className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#A68B4B]/10 text-[#A68B4B]">
              <Building2 size={10} /> {membro.empresa}
            </div>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1A1A1A]"
          aria-label="Editar"
        >
          <Edit2 size={14} />
        </button>
      </div>

      {(membro.telefone || membro.email) && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#262626] flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {membro.telefone && (
            <div className="flex items-center gap-1.5"><Phone size={11} /> {membro.telefone}</div>
          )}
          {membro.email && (
            <div className="flex items-center gap-1.5 truncate"><Mail size={11} /> {membro.email}</div>
          )}
        </div>
      )}
    </div>
  )
}

function FormModal({
  title, initial, onSubmit, onClose, onDelete, allowDelete = false,
}: {
  title: string
  initial: FormState
  onSubmit: (form: FormState) => Promise<void>
  onClose: () => void
  onDelete?: () => Promise<void>
  allowDelete?: boolean
}) {
  const [form, setForm] = useState<FormState>(initial)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [advanced, setAdvanced] = useState(false)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setErr(null)
    try {
      const finalForm = { ...form, iniciais: form.iniciais.trim() || autoIniciais(form.nome) }
      await onSubmit(finalForm)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] shadow-2xl"
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-[#2A2A2A]">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1A1A1A]">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {err && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
              <AlertCircle size={14} /> {err}
            </div>
          )}

          <div>
            <label className={labelCls}>Nome *</label>
            <input
              required value={form.nome}
              onChange={e => set('nome', e.target.value)}
              className={inputCls} placeholder="Ex: Douglas Bispo"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Apelido</label>
              <input
                value={form.apelido}
                onChange={e => set('apelido', e.target.value)}
                className={inputCls} placeholder="Felipe Andrade"
              />
            </div>
            <div>
              <label className={labelCls}>Iniciais</label>
              <input
                value={form.iniciais}
                onChange={e => set('iniciais', e.target.value.toUpperCase().slice(0, 3))}
                className={inputCls} placeholder={autoIniciais(form.nome) || 'XX'}
                maxLength={3}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Empresa</label>
            <input
              list="empresas-presets"
              value={form.empresa}
              onChange={e => set('empresa', e.target.value)}
              className={inputCls} placeholder="Bula Assessoria, Bula Remates…"
            />
            <datalist id="empresas-presets">
              {EMPRESA_PRESETS.map(e => <option key={e} value={e} />)}
            </datalist>
          </div>

          <div>
            <label className={labelCls}>Cor do avatar</label>
            <div className="flex items-center gap-2">
              <input
                type="color" value={form.cor}
                onChange={e => set('cor', e.target.value)}
                className="w-10 h-10 rounded-lg border border-gray-200 dark:border-[#333] cursor-pointer"
              />
              <input
                value={form.cor}
                onChange={e => set('cor', e.target.value)}
                className={inputCls} placeholder="#A68B4B"
              />
            </div>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {COR_PRESETS.map(c => (
                <button
                  key={c} type="button"
                  onClick={() => set('cor', c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${form.cor === c ? 'border-gray-800 dark:border-white scale-110' : 'border-transparent'}`}
                  style={{ background: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAdvanced(a => !a)}
            className="text-xs font-semibold text-gray-500 dark:text-gray-400 inline-flex items-center gap-1 hover:text-[#A68B4B]"
          >
            {advanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Campos avançados
          </button>

          {advanced && (
            <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-[#262626]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Telefone</label>
                  <input
                    value={form.telefone}
                    onChange={e => set('telefone', e.target.value)}
                    className={inputCls} placeholder="(11) 99999-9999"
                  />
                </div>
                <div>
                  <label className={labelCls}>Ordem</label>
                  <input
                    type="number" value={form.ordem || ''}
                    onChange={e => set('ordem', Number(e.target.value) || 0)}
                    className={inputCls} placeholder="999"
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input
                  type="email" value={form.email}
                  onChange={e => set('email', e.target.value)}
                  className={inputCls} placeholder="email@dominio.com"
                />
              </div>
              <div>
                <label className={labelCls}>Foto (URL)</label>
                <input
                  value={form.foto_url}
                  onChange={e => set('foto_url', e.target.value)}
                  className={inputCls} placeholder="https://..."
                />
              </div>
              <div>
                <label className={labelCls}>Observação</label>
                <textarea
                  value={form.observacao}
                  onChange={e => set('observacao', e.target.value)}
                  className={inputCls} rows={2}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox" checked={form.ativo}
                  onChange={e => set('ativo', e.target.checked)}
                  className="w-4 h-4"
                />
                Ativo
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 p-5 border-t border-gray-200 dark:border-[#2A2A2A]">
          {allowDelete && onDelete ? (
            <button
              type="button"
              onClick={async () => {
                setSaving(true); setErr(null)
                try { await onDelete() }
                catch (e) { setErr(e instanceof Error ? e.message : 'Erro') }
                finally { setSaving(false) }
              }}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
            >
              <Trash2 size={13} /> Excluir
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button
              type="button" onClick={onClose}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-[#333] hover:bg-gray-50 dark:hover:bg-[#222222]"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={saving || !form.nome.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-[#A68B4B] hover:bg-[#8E6A28] disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Salvar
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
