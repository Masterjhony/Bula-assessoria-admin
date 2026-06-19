'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Gavel, UserPlus, Mail, Phone, Pencil, Trash2, X, Plus, Check,
  ShieldCheck, FileText, ListChecks,
} from 'lucide-react'
import { type Leiloeira, DEFAULT_REQUISITOS } from '@/lib/leiloeiras'
import { saveLeiloeira, deleteLeiloeira, type LeiloeiraInput } from '@/app/sistema/actions/leiloeiras'

// ── badge ────────────────────────────────────────────────────────────────────
function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

// ── resumo de requisitos ───────────────────────────────────────────────────────
function requisitosResumo(l: Leiloeira): string {
  const parts: string[] = []
  parts.push(l.requisitos.requireIe ? 'Exige I.E.' : 'Sem I.E.')
  if (l.requisitos.scoreMin > 0) parts.push(`score min ${l.requisitos.scoreMin}`)
  const n = l.requisitos.documentos.length
  parts.push(`${n} ${n === 1 ? 'doc' : 'docs'}`)
  return parts.join(' · ')
}

// ── modal genérico (réplica do padrão de ClientesClient) ─────────────────────────
function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-[fadeIn_.15s_ease]" onClick={onClose} />
      <div
        className="relative w-full flex flex-col max-h-[90vh] shadow-2xl shadow-black/40 animate-[popIn_.18s_ease]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 14, maxWidth: wide ? 640 : 480 }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>{title}</h3>
          <button onClick={onClose} className="btn ghost" style={{ width: 34, padding: 0 }} aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>{footer}</div>}
      </div>
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  )
}

// ── componente principal ──────────────────────────────────────────────────────
export function CadastroLeiloeirasClient({ initial }: { initial: Leiloeira[] }) {
  const [leiloeiras, setLeiloeiras] = useState<Leiloeira[]>(initial)
  const [editing, setEditing] = useState<Leiloeira | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const flash = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2600)
  }, [])

  const openNova = () => { setEditing(null); setShowForm(true) }
  const openEdit = (l: Leiloeira) => { setEditing(l); setShowForm(true) }

  // salva (create/update) com merge no estado local.
  const handleSave = async (input: LeiloeiraInput): Promise<void> => {
    const saved = await saveLeiloeira(input)
    setLeiloeiras((prev) => {
      const idx = prev.findIndex((l) => l.id === saved.id)
      if (idx === -1) return [...prev, saved].sort((a, b) => a.nome.localeCompare(b.nome))
      const next = [...prev]
      next[idx] = saved
      return next
    })
    setShowForm(false)
    setEditing(null)
    flash(`Leiloeira "${saved.nome}" salva.`)
  }

  // exclui após confirmação, com remoção otimista.
  const handleDelete = async (l: Leiloeira) => {
    if (!window.confirm(`Excluir a leiloeira "${l.nome}"? Esta ação não pode ser desfeita.`)) return
    const prev = leiloeiras
    setLeiloeiras((cur) => cur.filter((x) => x.id !== l.id))
    try {
      await deleteLeiloeira(l.id)
      flash(`Leiloeira "${l.nome}" excluída.`)
    } catch (e) {
      setLeiloeiras(prev)
      flash(e instanceof Error ? e.message : 'Falha ao excluir a leiloeira.')
    }
  }

  return (
    <div>
      {/* page header */}
      <div className="page-head">
        <div>
          <h1 className="flex items-center gap-2.5">
            <Gavel size={22} style={{ color: 'var(--gold)' }} />
            Cadastro Leiloeiras
          </h1>
          <p className="sub">Leiloeiras parceiras onde os clientes aprovados são cadastrados</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn primary" onClick={openNova}><UserPlus size={14} /> Nova leiloeira</button>
        </div>
      </div>

      {/* lista */}
      {leiloeiras.length === 0 ? (
        <div className="card">
          <div className="card-b" style={{ padding: 14 }}>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Gavel size={28} style={{ color: 'var(--text4)' }} />
              <p className="text-[12px] mt-3" style={{ color: 'var(--text3)' }}>Nenhuma leiloeira cadastrada ainda.</p>
              <button className="btn primary mt-4" onClick={openNova}><UserPlus size={14} /> Nova leiloeira</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {leiloeiras.map((l) => (
            <div key={l.id} className="card" style={{ borderRadius: 12 }}>
              <div className="card-b" style={{ padding: 16 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="shrink-0 flex items-center justify-center"
                      style={{ width: 42, height: 42, borderRadius: 10, color: 'var(--bg)', background: 'linear-gradient(135deg, #C8A96E 0%, #A68B4B 100%)' }}
                    >
                      <Gavel size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[15px] font-bold leading-tight truncate" style={{ color: 'var(--text)' }}>{l.nome}</h3>
                        <Badge tone={l.ativo ? 'olive' : ''}>{l.ativo ? 'Ativo' : 'Inativo'}</Badge>
                      </div>
                      {l.emailCadastro && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-[12px] min-w-0" style={{ color: 'var(--text2)' }}>
                          <Mail size={12} style={{ color: 'var(--gold)' }} />
                          <span className="truncate">{l.emailCadastro}</span>
                        </div>
                      )}
                      {l.contato && (
                        <div className="flex items-center gap-1.5 mt-1 text-[12px]" style={{ color: 'var(--text2)' }}>
                          <Phone size={12} style={{ color: 'var(--gold)' }} />
                          <span className="truncate">{l.contato}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button className="btn ghost" onClick={() => openEdit(l)} aria-label="Editar" title="Editar"><Pencil size={14} /></button>
                    <button className="btn ghost" onClick={() => handleDelete(l)} aria-label="Excluir" title="Excluir" style={{ color: 'var(--red)' }}><Trash2 size={14} /></button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 mt-3 text-[11px]" style={{ color: 'var(--text3)' }}>
                  <ShieldCheck size={12} style={{ color: 'var(--gold)' }} />
                  <span>{requisitosResumo(l)}</span>
                </div>

                {l.requisitos.documentos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {l.requisitos.documentos.map((d) => <Badge key={d} tone="blue">{d}</Badge>)}
                  </div>
                )}

                {l.observacoes && (
                  <p className="text-[12px] mt-3 pt-3" style={{ color: 'var(--text2)', borderTop: '1px solid var(--border)' }}>{l.observacoes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* form modal */}
      {showForm && (
        <LeiloeiraFormModal
          leiloeira={editing}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSave={handleSave}
        />
      )}

      {/* toast */}
      {toast && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-lg text-[13px] font-medium shadow-2xl shadow-black/40 animate-[popIn_.18s_ease]"
          style={{ background: 'var(--surface)', border: '1px solid var(--gold-dark)', color: 'var(--text)' }}
        >
          <span className="inline-flex items-center gap-2"><ListChecks size={15} style={{ color: 'var(--gold)' }} />{toast}</span>
        </div>
      )}

      {/* keyframes locais */}
      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn { from { transform: scale(.97); opacity: 0 } to { transform: scale(1); opacity: 1 } }
      `}</style>
    </div>
  )
}

// ── modal: criar / editar leiloeira ──────────────────────────────────────────────
function LeiloeiraFormModal({ leiloeira, onClose, onSave }: {
  leiloeira: Leiloeira | null
  onClose: () => void
  onSave: (input: LeiloeiraInput) => Promise<void>
}) {
  const [nome, setNome] = useState(leiloeira?.nome ?? '')
  const [emailCadastro, setEmailCadastro] = useState(leiloeira?.emailCadastro ?? '')
  const [contato, setContato] = useState(leiloeira?.contato ?? '')
  const [requireIe, setRequireIe] = useState(leiloeira?.requisitos.requireIe ?? DEFAULT_REQUISITOS.requireIe)
  const [scoreMin, setScoreMin] = useState<number>(leiloeira?.requisitos.scoreMin ?? DEFAULT_REQUISITOS.scoreMin)
  const [documentos, setDocumentos] = useState<string[]>(leiloeira?.requisitos.documentos ?? [...DEFAULT_REQUISITOS.documentos])
  const [docInput, setDocInput] = useState('')
  const [observacoes, setObservacoes] = useState(leiloeira?.observacoes ?? '')
  const [ativo, setAtivo] = useState(leiloeira?.ativo ?? true)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const addDoc = () => {
    const d = docInput.trim()
    if (d && !documentos.includes(d)) setDocumentos([...documentos, d])
    setDocInput('')
  }

  const valid = nome.trim().length > 0

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    setErro(null)
    try {
      await onSave({
        id: leiloeira?.id,
        nome: nome.trim(),
        emailCadastro: emailCadastro.trim(),
        contato: contato.trim(),
        requisitos: { requireIe, scoreMin: Number(scoreMin) || 0, documentos },
        observacoes: observacoes.trim(),
        ativo,
      })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar a leiloeira.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={leiloeira ? `Editar · ${leiloeira.nome}` : 'Nova leiloeira'} wide onClose={onClose}
      footer={<>
        {erro && <span className="text-[12px] mr-auto self-center" style={{ color: 'var(--red)' }}>{erro}</span>}
        <button className="btn ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn primary" onClick={submit} disabled={!valid || saving} style={{ opacity: valid && !saving ? 1 : 0.5 }}>
          <Check size={14} /> {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </>}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nome *" full><input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Leilões Nelore MEAB" /></Field>
        <Field label="E-mail de cadastro"><input className="input" type="email" value={emailCadastro} onChange={(e) => setEmailCadastro(e.target.value)} placeholder="cadastro@leiloeira.com" /></Field>
        <Field label="Contato"><input className="input" value={contato} onChange={(e) => setContato(e.target.value)} placeholder="(00) 90000-0000" /></Field>

        <Field label="Requisitos" full>
          <div className="flex flex-col gap-3 rounded-lg p-3" style={{ background: 'var(--s2)', border: '1px solid var(--border)' }}>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={requireIe} onChange={(e) => setRequireIe(e.target.checked)} />
              <span className="text-[13px]" style={{ color: 'var(--text)' }}>Exige Inscrição Estadual</span>
            </label>
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} style={{ color: 'var(--gold)' }} />
              <span className="text-[13px]" style={{ color: 'var(--text2)' }}>Score mínimo</span>
              <input
                className="input"
                type="number"
                min={0}
                value={scoreMin}
                onChange={(e) => setScoreMin(e.target.value === '' ? 0 : Number(e.target.value))}
                style={{ maxWidth: 120 }}
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <FileText size={13} style={{ color: 'var(--gold)' }} />
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text3)', letterSpacing: '0.06em' }}>Documentos exigidos</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2 min-h-[26px]">
                {documentos.length === 0 && <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Nenhum documento.</span>}
                {documentos.map((d) => (
                  <span key={d} className="badge blue" style={{ paddingRight: 4 }}>
                    {d}
                    <button onClick={() => setDocumentos(documentos.filter((x) => x !== d))} className="ml-0.5 inline-flex items-center hover:opacity-70" aria-label={`Remover ${d}`} type="button">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="input"
                  value={docInput}
                  onChange={(e) => setDocInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDoc() } }}
                  placeholder="Novo documento e Enter…"
                />
                <button className="btn shrink-0" onClick={addDoc} disabled={!docInput.trim()} type="button" style={{ opacity: docInput.trim() ? 1 : 0.5 }}>
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
          </div>
        </Field>

        <Field label="Observações" full>
          <textarea className="textarea" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Notas sobre a leiloeira…" />
        </Field>

        <Field label="Situação" full>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            <span className="text-[13px]" style={{ color: 'var(--text)' }}>Ativo</span>
          </label>
        </Field>
      </div>
    </Modal>
  )
}
