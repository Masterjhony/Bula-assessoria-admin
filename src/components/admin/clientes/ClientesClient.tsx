'use client'

import { useMemo, useState, useCallback, useEffect } from 'react'
import {
  Users, UserPlus, Upload, Download, Search, MessageCircle, Phone, Mail,
  MapPin, Tag, X, Star, Flame, Snowflake, MinusCircle, ShoppingCart,
  History, Heart, FileText, CalendarClock, ChevronRight, Repeat, TrendingUp,
  Plus, Filter, ListChecks, ExternalLink, Check, Pencil,
} from 'lucide-react'
import {
  type Cliente, type ClienteStatus, type Interesse, type PerfilConsumo,
  type InteracaoHist, type PreferenciaCategoria, clienteMetrics, brl, brlCompact,
  fmtDate, timeAgo, waLink, INTERESSES, PERFIS, PREFERENCIA_CATEGORIAS,
} from '@/lib/clientes'
import { createCliente, registrarInteracao, updateClienteCampos, type NovoClienteInput } from '@/app/sistema/actions/clientes'

type CamposPatch = { observacoes?: string; preferenciasCategorias?: PreferenciaCategoria[] }

const crmLeadHref = (id: string) => `/sistema/crm?lead=${encodeURIComponent(id)}`

// ── tabelas de estilo ────────────────────────────────────────────────────────
const STATUS_META: Record<ClienteStatus, { label: string; badge: string; dot: string; icon: typeof Star }> = {
  ativo: { label: 'Ativo', badge: 'olive', dot: 'var(--olive)', icon: Star },
  quente: { label: 'Quente', badge: 'red', dot: 'var(--red)', icon: Flame },
  frio: { label: 'Frio', badge: 'blue', dot: 'var(--blue)', icon: Snowflake },
  inativo: { label: 'Inativo', badge: '', dot: 'var(--text3)', icon: MinusCircle },
}

const PERFIL_BADGE: Record<PerfilConsumo, string> = {
  Premium: 'gold', Recorrente: 'olive', Ocasional: 'blue', Novo: 'amber',
}

const INTERACAO_BADGE: Record<InteracaoHist['tipo'], string> = {
  WhatsApp: 'olive', Ligação: 'blue', 'E-mail': 'amber', Visita: 'gold', Reunião: 'red',
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

// ── KPIs ─────────────────────────────────────────────────────────────────────
function Kpi({ value, cur, label, tag, tagDown }: { value: string; cur?: string; label: string; tag?: string; tagDown?: boolean }) {
  return (
    <div className="slim-kpi">
      <div className="slim-kpi-val">
        {cur && <span className="cur">{cur} </span>}{value}
      </div>
      <div className="slim-kpi-lbl">{label}</div>
      {tag && <div className={`slim-kpi-tag${tagDown ? ' down' : ''}`}>{tag}</div>}
    </div>
  )
}

// ── drawer de detalhe ──────────────────────────────────────────────────────────
type DrawerTab = 'cadastro' | 'compras' | 'interacoes' | 'preferencias' | 'observacoes'

function DetailDrawer({
  cliente, onClose, onRegistrarInteracao, onSaveCampos,
}: {
  cliente: Cliente
  onClose: () => void
  onRegistrarInteracao: (c: Cliente) => void
  onSaveCampos: (c: Cliente, patch: CamposPatch) => Promise<void>
}) {
  const [tab, setTab] = useState<DrawerTab>('cadastro')
  const m = clienteMetrics(cliente)
  const sm = STATUS_META[cliente.status]

  // estado de edição (notas + preferências), ressincronizado ao trocar de cliente
  const [obs, setObs] = useState(cliente.observacoes ?? '')
  const [prefs, setPrefs] = useState<PreferenciaCategoria[]>(cliente.preferenciasCategorias ?? [])
  const [savingObs, setSavingObs] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  useEffect(() => {
    setObs(cliente.observacoes ?? '')
    setPrefs(cliente.preferenciasCategorias ?? [])
  }, [cliente.id, cliente.observacoes, cliente.preferenciasCategorias])

  const obsDirty = obs.trim() !== (cliente.observacoes ?? '').trim()
  const prefsDirty = JSON.stringify(prefs) !== JSON.stringify(cliente.preferenciasCategorias ?? [])

  const salvarObs = async () => {
    setSavingObs(true)
    try { await onSaveCampos(cliente, { observacoes: obs.trim() }) } finally { setSavingObs(false) }
  }
  const salvarPrefs = async () => {
    setSavingPrefs(true)
    try { await onSaveCampos(cliente, { preferenciasCategorias: prefs }) } finally { setSavingPrefs(false) }
  }

  // Esc fecha o card.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const tabs: { id: DrawerTab; label: string; icon: typeof Users }[] = [
    { id: 'cadastro', label: 'Dados', icon: Users },
    { id: 'compras', label: `Compras (${m.numCompras})`, icon: ShoppingCart },
    { id: 'interacoes', label: `Interações (${cliente.interacoes.length})`, icon: History },
    { id: 'preferencias', label: 'Preferências', icon: Heart },
    { id: 'observacoes', label: 'Notas', icon: FileText },
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-[fadeIn_.15s_ease]" onClick={onClose} />
      <aside
        className="relative w-full max-w-[620px] max-h-[90vh] flex flex-col shadow-2xl shadow-black/40 animate-[popIn_.18s_ease] overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 14 }}
      >
        {/* header */}
        <div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className="shrink-0 flex items-center justify-center font-bold text-[15px]"
                style={{
                  width: 46, height: 46, borderRadius: 10, color: 'var(--bg)',
                  background: 'linear-gradient(135deg, #C8A96E 0%, #A68B4B 100%)',
                }}
              >
                {cliente.nome.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="text-[17px] font-bold leading-tight truncate" style={{ color: 'var(--text)' }}>{cliente.nome}</h2>
                <p className="text-[12px] mt-0.5 truncate" style={{ color: 'var(--text2)' }}>{cliente.responsavel}</p>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <Badge tone={sm.badge}><sm.icon size={10} />{sm.label}</Badge>
                  <Badge tone={PERFIL_BADGE[cliente.perfil]}>{cliente.perfil}</Badge>
                  {cliente.recorrente && <Badge tone=""><Repeat size={10} />Recorrente</Badge>}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="btn ghost shrink-0" style={{ width: 36, padding: 0 }} aria-label="Fechar">
              <X size={16} />
            </button>
          </div>

          {/* quick stats */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { l: 'Total comprado', v: brlCompact(m.totalComprado) },
              { l: 'Compras', v: String(m.numCompras) },
              { l: 'Ticket médio', v: m.ticketMedio ? brlCompact(m.ticketMedio) : '—' },
            ].map((s) => (
              <div key={s.l} className="text-center py-2.5 rounded-lg" style={{ background: 'var(--s2)', border: '1px solid var(--border)' }}>
                <div className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>{s.v}</div>
                <div className="text-[9px] mt-0.5" style={{ color: 'var(--text3)' }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* quick actions */}
          <div className="flex gap-2 mt-3">
            {cliente.telefone ? (
              <a href={waLink(cliente.telefone)} target="_blank" rel="noopener noreferrer" className="btn primary flex-1">
                <MessageCircle size={14} /> WhatsApp
              </a>
            ) : null}
            <button onClick={() => onRegistrarInteracao(cliente)} className="btn flex-1">
              <Plus size={14} /> Registrar interação
            </button>
          </div>
          {cliente.crmLeadId && (
            <a href={crmLeadHref(cliente.crmLeadId)} className="btn ghost w-full mt-2" style={{ color: 'var(--gold)' }}>
              <ExternalLink size={14} /> Ver lead no CRM
            </a>
          )}
        </div>

        {/* tabs */}
        <div className="flex gap-1 px-4 pt-3 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
          {tabs.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold whitespace-nowrap transition-colors"
                style={{
                  color: active ? 'var(--gold)' : 'var(--text3)',
                  borderBottom: `2px solid ${active ? 'var(--gold)' : 'transparent'}`,
                }}
              >
                <t.icon size={13} /> {t.label}
              </button>
            )
          })}
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'cadastro' && (
            <div className="space-y-4">
              <InfoRow icon={Phone} label="Telefone / WhatsApp" value={cliente.telefone || '— (sem telefone no CRM)'} />
              {cliente.email && <InfoRow icon={Mail} label="E-mail" value={cliente.email} />}
              <InfoRow icon={MapPin} label="Cidade / UF" value={`${cliente.cidade} — ${cliente.uf}`} />
              <InfoRow icon={Users} label="Responsável" value={cliente.responsavel} />
              <InfoRow icon={TrendingUp} label="Perfil de consumo" value={cliente.perfil} />
              <div>
                <FieldLabel icon={Heart}>Categorias de interesse</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {cliente.interesses.map((i) => <Badge key={i} tone="gold">{i}</Badge>)}
                </div>
              </div>
              <div>
                <FieldLabel icon={Tag}>Tags</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {cliente.tags.length ? cliente.tags.map((t) => <Badge key={t} tone="">{t}</Badge>) : <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Sem tags</span>}
                </div>
              </div>
              {cliente.proximoFollowup && (
                <div className="flex items-center gap-2 mt-1 px-3 py-2.5 rounded-lg" style={{ background: 'var(--gold-dim)', border: '1px solid rgba(200,169,110,0.25)' }}>
                  <CalendarClock size={15} style={{ color: 'var(--gold)' }} />
                  <span className="text-[12px]" style={{ color: 'var(--text2)' }}>
                    Próximo follow-up: <b style={{ color: 'var(--gold)' }}>{fmtDate(cliente.proximoFollowup)}</b> ({timeAgo(cliente.proximoFollowup) === 'hoje' ? 'hoje' : fmtDate(cliente.proximoFollowup)})
                  </span>
                </div>
              )}
            </div>
          )}

          {tab === 'compras' && (
            <div className="space-y-3">
              {cliente.compras.length === 0 && <EmptyState icon={ShoppingCart} text="Nenhuma compra registrada ainda." />}
              {[...cliente.compras].sort((a, b) => b.data.localeCompare(a.data)).map((c) => (
                <div key={c.id} className="card" style={{ borderRadius: 10 }}>
                  <div className="card-b" style={{ padding: 14 }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{c.descricao}</div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <Badge tone="gold">{c.categoria}</Badge>
                          {c.cabecas ? <span className="text-[11px]" style={{ color: 'var(--text3)' }}>{c.cabecas} cab.</span> : null}
                          {c.leilao && <span className="text-[11px]" style={{ color: 'var(--text3)' }}>· {c.leilao}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[14px] font-extrabold" style={{ color: 'var(--olive)' }}>{brl(c.valor)}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>{fmtDate(c.data)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'interacoes' && (
            <div className="relative pl-1">
              {cliente.interacoes.length === 0 && <EmptyState icon={History} text="Nenhuma interação registrada." />}
              {[...cliente.interacoes].sort((a, b) => b.data.localeCompare(a.data)).map((it, idx, arr) => (
                <div key={it.id} className="flex gap-3 pb-4 relative">
                  {idx < arr.length - 1 && <span className="absolute left-[5px] top-4 bottom-0 w-px" style={{ background: 'var(--border2)' }} />}
                  <span className="mt-1 shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: 'var(--gold)', boxShadow: '0 0 0 3px var(--gold-dim)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={INTERACAO_BADGE[it.tipo]}>{it.tipo}</Badge>
                      <span className="text-[11px]" style={{ color: 'var(--text3)' }}>{fmtDate(it.data)} · {timeAgo(it.data)}</span>
                    </div>
                    <p className="text-[13px] mt-1.5" style={{ color: 'var(--text2)' }}>{it.nota}</p>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>por {it.responsavel}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'preferencias' && (
            <div className="space-y-4">
              <div>
                <FieldLabel icon={Heart}>Preferências de compra</FieldLabel>
                <p className="text-[11px] mb-2" style={{ color: 'var(--text3)' }}>Selecione as categorias que este cliente costuma comprar.</p>
                <select
                  className="select"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value as PreferenciaCategoria
                    if (v && !prefs.includes(v)) setPrefs([...prefs, v])
                    e.currentTarget.value = ''
                  }}
                >
                  <option value="">+ Adicionar preferência…</option>
                  {PREFERENCIA_CATEGORIAS.filter((c) => !prefs.includes(c)).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-1.5 mt-3 min-h-[26px]">
                  {prefs.length === 0 && <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Nenhuma preferência registrada.</span>}
                  {prefs.map((c) => (
                    <span key={c} className="badge gold" style={{ paddingRight: 4 }}>
                      {c}
                      <button onClick={() => setPrefs(prefs.filter((x) => x !== c))} className="ml-0.5 inline-flex items-center hover:opacity-70" aria-label={`Remover ${c}`}>
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex justify-end mt-3">
                  <button className="btn primary" onClick={salvarPrefs} disabled={!prefsDirty || savingPrefs} style={{ opacity: prefsDirty && !savingPrefs ? 1 : 0.5 }}>
                    <Check size={14} /> {savingPrefs ? 'Salvando…' : 'Salvar preferências'}
                  </button>
                </div>
              </div>
              <div>
                <FieldLabel icon={ListChecks}>Categorias de interesse (do histórico)</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {cliente.interesses.map((i) => <Badge key={i} tone="gold">{i}</Badge>)}
                </div>
              </div>
            </div>
          )}

          {tab === 'observacoes' && (
            <div className="space-y-4">
              <div>
                <FieldLabel icon={Pencil}>Observações comerciais</FieldLabel>
                <textarea
                  className="textarea"
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Escreva anotações comerciais sobre o cliente…"
                  style={{ minHeight: 120 }}
                />
                <div className="flex justify-end mt-2">
                  <button className="btn primary" onClick={salvarObs} disabled={!obsDirty || savingObs} style={{ opacity: obsDirty && !savingObs ? 1 : 0.5 }}>
                    <Check size={14} /> {savingObs ? 'Salvando…' : 'Salvar notas'}
                  </button>
                </div>
              </div>
              <div>
                <FieldLabel icon={Tag}>Tags</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {cliente.tags.length ? cliente.tags.map((t) => <Badge key={t} tone="">{t}</Badge>) : <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Sem tags</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--gold)' }} />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text3)', letterSpacing: '0.06em' }}>{label}</div>
        <div className="text-[13px] mt-0.5 break-words" style={{ color: 'var(--text)' }}>{value}</div>
      </div>
    </div>
  )
}

function FieldLabel({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon size={13} style={{ color: 'var(--gold)' }} />
      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text3)', letterSpacing: '0.06em' }}>{children}</span>
    </div>
  )
}

function EmptyState({ icon: Icon, text }: { icon: typeof Users; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon size={28} style={{ color: 'var(--text4)' }} />
      <p className="text-[12px] mt-3" style={{ color: 'var(--text3)' }}>{text}</p>
    </div>
  )
}

// ── modal genérico ─────────────────────────────────────────────────────────────
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

// ── componente principal ──────────────────────────────────────────────────────
export function ClientesClient({ initialClientes }: { initialClientes: Cliente[] }) {
  const [clientes, setClientes] = useState<Cliente[]>(initialClientes)
  const [selected, setSelected] = useState<Cliente | null>(null)
  const [busca, setBusca] = useState('')
  const [fCidade, setFCidade] = useState('')
  const [fStatus, setFStatus] = useState<'' | ClienteStatus>('')
  const [fPerfil, setFPerfil] = useState<'' | PerfilConsumo>('')
  const [fInteresse, setFInteresse] = useState<'' | Interesse>('')

  const [showNovo, setShowNovo] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [interacaoTarget, setInteracaoTarget] = useState<Cliente | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const flash = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2600)
  }, [])

  const cidades = useMemo(
    () => [...new Set(clientes.map((c) => `${c.cidade}/${c.uf}`))].sort(),
    [clientes],
  )

  // métricas por cliente (memo) para ordenação e filtro.
  const enriched = useMemo(
    () => clientes.map((c) => ({ c, m: clienteMetrics(c) })),
    [clientes],
  )

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, '')
    return enriched
      .filter(({ c }) => {
        if (q) {
          const hitNome = c.nome.toLowerCase().includes(q) || c.responsavel.toLowerCase().includes(q)
          const hitTel = qDigits.length >= 3 && c.telefone.replace(/\D/g, '').includes(qDigits)
          if (!hitNome && !hitTel) return false
        }
        if (fCidade && `${c.cidade}/${c.uf}` !== fCidade) return false
        if (fStatus && c.status !== fStatus) return false
        if (fPerfil && c.perfil !== fPerfil) return false
        if (fInteresse && !c.interesses.includes(fInteresse)) return false
        return true
      })
      .sort((a, b) => b.m.totalComprado - a.m.totalComprado)
  }, [enriched, busca, fCidade, fStatus, fPerfil, fInteresse])

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = enriched.length
    const ativos = enriched.filter(({ c }) => c.status === 'ativo' || c.status === 'quente').length
    const recorrentes = enriched.filter(({ c }) => c.recorrente).length
    const volume = enriched.reduce((s, { m }) => s + m.totalComprado, 0)
    const numCompras = enriched.reduce((s, { m }) => s + m.numCompras, 0)
    const ticket = numCompras ? Math.round(volume / numCompras) : 0
    const ultimaCompra = enriched.map(({ m }) => m.ultimaCompra).filter(Boolean).sort().at(-1) as string | undefined
    return { total, ativos, recorrentes, volume, ticket, ultimaCompra }
  }, [enriched])

  const hasFilter = busca || fCidade || fStatus || fPerfil || fInteresse
  const clearFilters = () => { setBusca(''); setFCidade(''); setFStatus(''); setFPerfil(''); setFInteresse('') }

  // ── ações ─────────────────────────────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    const head = ['Nome', 'Responsável', 'Telefone', 'Email', 'Cidade', 'UF', 'Perfil', 'Status', 'Recorrente', 'Interesses', 'Total Comprado', 'Compras', 'Ticket Médio', 'Última Compra', 'Última Interação']
    const rows = filtered.map(({ c, m }) => [
      c.nome, c.responsavel, c.telefone, c.email ?? '', c.cidade, c.uf, c.perfil,
      c.status, c.recorrente ? 'Sim' : 'Não', c.interesses.join(' | '),
      String(m.totalComprado), String(m.numCompras), String(m.ticketMedio),
      m.ultimaCompra ?? '', m.ultimaInteracao ?? '',
    ])
    const csv = [head, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clientes-bula-${filtered.length}.csv`
    a.click()
    URL.revokeObjectURL(url)
    flash(`Exportados ${filtered.length} clientes para CSV.`)
  }, [filtered, flash])

  // Cadastro manual: persiste em `clientes` (upsert por nome normalizado) e
  // funde no estado por matchKey (pode sobrepor um comprador derivado).
  const addCliente = async (input: NovoClienteInput) => {
    const saved = await createCliente(input)
    setClientes((prev) => {
      const idx = prev.findIndex((c) => c.matchKey && c.matchKey === saved.matchKey)
      if (idx === -1) return [saved, ...prev]
      const next = [...prev]
      // preserva compras/interações já derivadas; aplica os campos manuais salvos
      next[idx] = { ...prev[idx], ...saved, compras: prev[idx].compras, interacoes: prev[idx].interacoes }
      return next
    })
    setShowNovo(false)
    flash(`Cliente "${saved.nome}" salvo.`)
  }

  const addInteracao = (clienteId: string, it: InteracaoHist) => {
    setClientes((prev) => prev.map((c) => (c.id === clienteId ? { ...c, interacoes: [it, ...c.interacoes] } : c)))
    setSelected((prev) => (prev && prev.id === clienteId ? { ...prev, interacoes: [it, ...prev.interacoes] } : prev))
    setInteracaoTarget(null)

    const cli = clientes.find((c) => c.id === clienteId)
    if (!cli?.matchKey) { flash('Interação registrada.'); return }

    registrarInteracao({
      matchKey: cli.matchKey,
      clienteRowId: cli.clienteRowId,
      crmLeadId: cli.crmLeadId,
      tipo: it.tipo, responsavel: it.responsavel, nota: it.nota,
    })
      .then(() => flash(cli.crmLeadId ? 'Interação registrada e sincronizada no CRM.' : 'Interação registrada.'))
      .catch(() => flash('Interação registrada localmente (falha ao salvar no servidor).'))
  }

  // Edição de campos (notas / preferências) com update otimista + persistência.
  const saveCampos = async (cliente: Cliente, patch: CamposPatch) => {
    const apply = (c: Cliente): Cliente => ({
      ...c,
      ...(patch.observacoes !== undefined ? { observacoes: patch.observacoes } : {}),
      ...(patch.preferenciasCategorias !== undefined ? { preferenciasCategorias: patch.preferenciasCategorias } : {}),
    })
    setClientes((prev) => prev.map((c) => (c.id === cliente.id ? apply(c) : c)))
    setSelected((prev) => (prev && prev.id === cliente.id ? apply(prev) : prev))
    try {
      await updateClienteCampos({
        matchKey: cliente.matchKey || '',
        nome: cliente.nome,
        observacoes: patch.observacoes,
        preferenciasCategorias: patch.preferenciasCategorias,
      })
      flash('Alterações salvas.')
    } catch {
      flash('Falha ao salvar no servidor.')
    }
  }

  // mantém o drawer sincronizado quando a lista muda.
  useEffect(() => {
    if (selected) {
      const fresh = clientes.find((c) => c.id === selected.id)
      if (fresh && fresh !== selected) setSelected(fresh)
    }
  }, [clientes]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      {/* page header */}
      <div className="page-head">
        <div>
          <h1 className="flex items-center gap-2.5">
            <Users size={22} style={{ color: 'var(--gold)' }} />
            Clientes
          </h1>
          <p className="sub">Central de compradores · agregados dos fechamentos e vinculados ao CRM</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn" onClick={() => setShowImport(true)}><Upload size={14} /> Importar</button>
          <button className="btn" onClick={exportCSV}><Download size={14} /> Exportar</button>
          <button className="btn primary" onClick={() => setShowNovo(true)}><UserPlus size={14} /> Novo cliente</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="slim-row">
        <Kpi value={String(kpis.total)} label="Total de clientes" tag="na carteira" />
        <div className="slim-div" />
        <Kpi value={String(kpis.ativos)} label="Clientes ativos" tag={`${kpis.total ? Math.round((kpis.ativos / kpis.total) * 100) : 0}% da base`} />
        <div className="slim-div" />
        <Kpi value={String(kpis.recorrentes)} label="Compradores recorrentes" tag="recompram" />
        <div className="slim-div" />
        <Kpi value={kpis.ticket ? brlCompact(kpis.ticket).replace('R$', '').trim() : '—'} cur="R$" label="Ticket médio" />
        <div className="slim-div" />
        <Kpi value={brlCompact(kpis.volume).replace('R$', '').trim()} cur="R$" label="Volume total comprado" />
        <div className="slim-div" />
        <Kpi value={kpis.ultimaCompra ? fmtDate(kpis.ultimaCompra) : '—'} label="Última compra" tag={timeAgo(kpis.ultimaCompra)} />
      </div>

      {/* filtros */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-b" style={{ padding: 14 }}>
          <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }} />
              <input
                className="input" placeholder="Buscar por nome, responsável ou telefone…"
                style={{ paddingLeft: 34 }}
                value={busca} onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <select className="select lg:w-[170px]" value={fCidade} onChange={(e) => setFCidade(e.target.value)}>
              <option value="">Todas as cidades</option>
              {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="select lg:w-[140px]" value={fStatus} onChange={(e) => setFStatus(e.target.value as ClienteStatus | '')}>
              <option value="">Status</option>
              {(['ativo', 'quente', 'frio', 'inativo'] as ClienteStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
            <select className="select lg:w-[150px]" value={fPerfil} onChange={(e) => setFPerfil(e.target.value as PerfilConsumo | '')}>
              <option value="">Perfil</option>
              {PERFIS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="select lg:w-[140px]" value={fInteresse} onChange={(e) => setFInteresse(e.target.value as Interesse | '')}>
              <option value="">Interesse</option>
              {INTERESSES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
            {hasFilter && (
              <button className="btn ghost shrink-0" onClick={clearFilters} title="Limpar filtros">
                <X size={14} /> Limpar
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-3 text-[11px]" style={{ color: 'var(--text3)' }}>
            <Filter size={12} />
            <span><b style={{ color: 'var(--text2)' }}>{filtered.length}</b> de {clientes.length} clientes</span>
          </div>
        </div>
      </div>

      {/* tabela */}
      <div className="card card-p0">
        <div className="card-b" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Telefone / WhatsApp</th>
                <th>Cidade / UF</th>
                <th>Perfil</th>
                <th>Interesses</th>
                <th style={{ textAlign: 'right' }}>Total comprado</th>
                <th>Última interação</th>
                <th>Status</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ c, m }) => {
                const sm = STATUS_META[c.status]
                return (
                  <tr key={c.id} onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div
                          className="shrink-0 flex items-center justify-center font-bold text-[12px]"
                          style={{ width: 34, height: 34, borderRadius: 8, color: 'var(--bg)', background: 'linear-gradient(135deg, #C8A96E 0%, #A68B4B 100%)' }}
                        >
                          {c.nome.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                            <span className="truncate max-w-[180px]">{c.nome}</span>
                            {c.recorrente && <Repeat size={12} style={{ color: 'var(--gold)' }} aria-label="Recorrente" />}
                            {c.crmLeadId && (
                              <a
                                href={crmLeadHref(c.crmLeadId)}
                                onClick={(e) => e.stopPropagation()}
                                title="Ver lead no CRM"
                                className="inline-flex items-center"
                                style={{ color: 'var(--olive)' }}
                              >
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                          <div className="text-[11px] truncate max-w-[180px]" style={{ color: 'var(--text3)' }}>{c.responsavel}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {c.telefone ? (
                        <a
                          href={waLink(c.telefone)} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 hover:underline"
                          style={{ color: 'var(--text2)' }}
                        >
                          <MessageCircle size={13} style={{ color: 'var(--olive)' }} />
                          {c.telefone}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text3)' }}>—</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text2)' }}>{c.cidade} / {c.uf}</td>
                    <td><Badge tone={PERFIL_BADGE[c.perfil]}>{c.perfil}</Badge></td>
                    <td>
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {c.interesses.slice(0, 2).map((i) => <Badge key={i} tone="gold">{i}</Badge>)}
                        {c.interesses.length > 2 && <Badge tone="">+{c.interesses.length - 2}</Badge>}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="font-bold" style={{ color: m.totalComprado ? 'var(--text)' : 'var(--text3)' }}>{m.totalComprado ? brl(m.totalComprado) : '—'}</div>
                      <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{m.numCompras} {m.numCompras === 1 ? 'compra' : 'compras'}</div>
                    </td>
                    <td>
                      <span style={{ color: 'var(--text2)' }}>{timeAgo(m.ultimaInteracao)}</span>
                    </td>
                    <td><Badge tone={sm.badge}><sm.icon size={10} />{sm.label}</Badge></td>
                    <td><ChevronRight size={15} style={{ color: 'var(--text4)' }} /></td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <EmptyState icon={Users} text={hasFilter ? 'Nenhum cliente encontrado com esses filtros.' : 'Nenhum comprador encontrado nos fechamentos ainda.'} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* drawer */}
      {selected && (
        <DetailDrawer
          cliente={selected}
          onClose={() => setSelected(null)}
          onRegistrarInteracao={(c) => setInteracaoTarget(c)}
          onSaveCampos={saveCampos}
        />
      )}

      {/* modais */}
      {showNovo && <NovoClienteModal onClose={() => setShowNovo(false)} onCreate={addCliente} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onConfirm={(n) => { setShowImport(false); flash(`${n} registros lidos. Importação em lote ainda não persiste — use "Novo cliente" por enquanto.`) }} />}
      {interacaoTarget && (
        <RegistrarInteracaoModal
          cliente={interacaoTarget}
          onClose={() => setInteracaoTarget(null)}
          onSave={addInteracao}
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
        @keyframes slideIn { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes popIn { from { transform: scale(.97); opacity: 0 } to { transform: scale(1); opacity: 1 } }
      `}</style>
    </div>
  )
}

// ── modal: novo cliente ─────────────────────────────────────────────────────────
function NovoClienteModal({ onClose, onCreate }: { onClose: () => void; onCreate: (input: NovoClienteInput) => Promise<void> }) {
  const [nome, setNome] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [perfil, setPerfil] = useState<PerfilConsumo>('Novo')
  const [status, setStatus] = useState<ClienteStatus>('quente')
  const [interesses, setInteresses] = useState<Interesse[]>([])
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const toggleInteresse = (i: Interesse) =>
    setInteresses((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))

  const valid = nome.trim() && telefone.trim()

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    setErro(null)
    try {
      await onCreate({
        nome: nome.trim(),
        responsavel: responsavel.trim(),
        telefone: telefone.trim(),
        email: email.trim(),
        cidade: cidade.trim(),
        uf: uf.trim().toUpperCase(),
        perfil, status, interesses,
        observacoes: obs.trim(),
      })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar o cliente.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Novo cliente" wide onClose={onClose}
      footer={<>
        {erro && <span className="text-[12px] mr-auto self-center" style={{ color: 'var(--red)' }}>{erro}</span>}
        <button className="btn ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn primary" onClick={submit} disabled={!valid || saving} style={{ opacity: valid && !saving ? 1 : 0.5 }}>
          <UserPlus size={14} /> {saving ? 'Salvando…' : 'Cadastrar'}
        </button>
      </>}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nome / Fazenda *" full><input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Fazenda Santa Luzia" /></Field>
        <Field label="Responsável"><input className="input" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Nome do contato" /></Field>
        <Field label="Telefone / WhatsApp *"><input className="input" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 90000-0000" /></Field>
        <Field label="E-mail"><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@dominio.com" /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Cidade"><input className="input" value={cidade} onChange={(e) => setCidade(e.target.value)} /></Field>
          <Field label="UF"><input className="input" value={uf} maxLength={2} onChange={(e) => setUf(e.target.value)} /></Field>
          <Field label="Perfil">
            <select className="select" value={perfil} onChange={(e) => setPerfil(e.target.value as PerfilConsumo)}>
              {PERFIS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Status">
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as ClienteStatus)}>
            {(['ativo', 'quente', 'frio', 'inativo'] as ClienteStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </Field>
        <Field label="Categorias de interesse" full>
          <div className="flex flex-wrap gap-1.5">
            {INTERESSES.map((i) => {
              const on = interesses.includes(i)
              return (
                <button
                  key={i} type="button" onClick={() => toggleInteresse(i)}
                  className="px-3 py-1.5 text-[12px] font-semibold rounded-full transition-colors"
                  style={{
                    border: `1px solid ${on ? 'var(--gold-dark)' : 'var(--border2)'}`,
                    background: on ? 'var(--gold-dim)' : 'transparent',
                    color: on ? 'var(--gold)' : 'var(--text3)',
                  }}
                >
                  {i}
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="Observações comerciais" full>
          <textarea className="textarea" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Anotações sobre o cliente…" />
        </Field>
      </div>
    </Modal>
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

// ── modal: registrar interação ──────────────────────────────────────────────────
function RegistrarInteracaoModal({ cliente, onClose, onSave }: { cliente: Cliente; onClose: () => void; onSave: (id: string, it: InteracaoHist) => void }) {
  const [tipo, setTipo] = useState<InteracaoHist['tipo']>('WhatsApp')
  const [responsavel, setResponsavel] = useState('Felipe')
  const [nota, setNota] = useState('')

  const submit = () => {
    if (!nota.trim()) return
    onSave(cliente.id, {
      id: `it-${cliente.id}-${cliente.interacoes.length + 1}`,
      data: new Date().toISOString().slice(0, 10),
      tipo, responsavel: responsavel.trim() || 'Equipe', nota: nota.trim(),
    })
  }

  return (
    <Modal
      title={`Registrar interação · ${cliente.nome}`} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={submit} disabled={!nota.trim()} style={{ opacity: nota.trim() ? 1 : 0.5 }}>
          <Plus size={14} /> Salvar
        </button>
      </>}
    >
      <div className="space-y-3">
        <Field label="Tipo de contato">
          <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value as InteracaoHist['tipo'])}>
            {(['WhatsApp', 'Ligação', 'E-mail', 'Visita', 'Reunião'] as InteracaoHist['tipo'][]).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Responsável">
          <input className="input" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
        </Field>
        <Field label="Anotação *">
          <textarea className="textarea" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="O que foi conversado?" autoFocus />
        </Field>
      </div>
    </Modal>
  )
}

// ── modal: importar ─────────────────────────────────────────────────────────────
function ImportModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (n: number) => void }) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [count, setCount] = useState(0)

  return (
    <Modal
      title="Importar clientes" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={() => onConfirm(count || 0)} disabled={!fileName} style={{ opacity: fileName ? 1 : 0.5 }}>
          <Upload size={14} /> Importar
        </button>
      </>}
    >
      <p className="text-[13px] mb-3" style={{ color: 'var(--text2)' }}>
        Selecione um arquivo <b>.csv</b> ou <b>.xlsx</b> com a lista de compradores. As colunas reconhecidas são: nome, responsável, telefone, e-mail, cidade, UF, perfil e interesses.
      </p>
      <label
        className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl cursor-pointer transition-colors"
        style={{ border: '1.5px dashed var(--border2)', background: 'var(--s2)' }}
      >
        <Upload size={26} style={{ color: 'var(--gold)' }} />
        <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{fileName || 'Clique para selecionar o arquivo'}</span>
        <span className="text-[11px]" style={{ color: 'var(--text3)' }}>CSV ou XLSX até 5 MB</span>
        <input
          type="file" accept=".csv,.xlsx" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) { setFileName(f.name); setCount(Math.max(1, Math.round(f.size / 120))) }
          }}
        />
      </label>
      {fileName && (
        <p className="text-[12px] mt-3" style={{ color: 'var(--olive)' }}>
          Arquivo pronto · ~{count} registros detectados (estimativa do mock).
        </p>
      )}
    </Modal>
  )
}
