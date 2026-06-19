'use client'

import { useMemo, useState, useCallback, useEffect } from 'react'
import {
  Users, UserPlus, Upload, Download, Search, MessageCircle, Phone, Mail,
  MapPin, Tag, X, Star, Flame, Snowflake, MinusCircle, ShoppingCart,
  History, Heart, FileText, CalendarClock, ChevronRight, Repeat, TrendingUp,
  Plus, Filter, ListChecks, ExternalLink, Check, Pencil,
  ShieldCheck, RefreshCw, FileBadge, Gavel, CalendarCheck, Trash2, Send, AlertTriangle, IdCard,
  LayoutGrid, Table as TableIcon, List,
} from 'lucide-react'
import {
  type Cliente, type ClienteStatus, type Interesse, type PerfilConsumo,
  type InteracaoHist, type PreferenciaCategoria, type ScoreFaixa,
  type ClienteDocumento, type ClienteReadiness, clienteMetrics, brl, brlCompact,
  fmtDate, timeAgo, waLink, INTERESSES, PERFIS, PREFERENCIA_CATEGORIAS,
  scoreToFaixa, SCORE_FAIXA_META, fmtCpf, isClienteCadastroApto,
  clienteReadiness, READINESS_META,
} from '@/lib/clientes'
import {
  createCliente, registrarInteracao, updateClienteCampos,
  consultarScoreCliente, updateClienteCadastro,
  listClienteDocumentos, uploadClienteDocumento, getClienteDocumentoUrl, deleteClienteDocumento,
  getAgendaMatchesForCliente, submitClienteLeiloeiras,
  type NovoClienteInput, type ClientesVgvSummary,
} from '@/app/sistema/actions/clientes'
import { getLeiloeiras, getClienteLeiloeiraStatus, setClienteLeiloeiraStatus } from '@/app/sistema/actions/leiloeiras'
import {
  type Leiloeira, type ClienteLeiloeiraStatus, type CadastroStatus, CADASTRO_STATUS_META,
} from '@/lib/leiloeiras'

type CamposPatch = { observacoes?: string; preferenciasCategorias?: PreferenciaCategoria[]; tags?: string[] }

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
type DrawerTab = 'cadastro' | 'compras' | 'interacoes' | 'preferencias' | 'documentos' | 'leiloeiras' | 'recomendados' | 'observacoes'

type AgendaMatch = Awaited<ReturnType<typeof getAgendaMatchesForCliente>>[number]

// Formata bytes em unidade legível (B / KB / MB).
function fmtBytes(n: number): string {
  if (!n || n < 1024) return `${n || 0} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const DOC_TIPOS: { value: string; label: string }[] = [
  { value: 'cpf', label: 'CPF' },
  { value: 'comprovante', label: 'Comprovante' },
  { value: 'ie', label: 'Inscrição Estadual' },
  { value: 'contrato', label: 'Contrato' },
  { value: 'outro', label: 'Outro' },
]

function DetailDrawer({
  cliente, onClose, onRegistrarInteracao, onSaveCampos, onApplyCadastro, flash,
}: {
  cliente: Cliente
  onClose: () => void
  onRegistrarInteracao: (c: Cliente) => void
  onSaveCampos: (c: Cliente, patch: CamposPatch) => Promise<void>
  onApplyCadastro: (clienteId: string, patch: Partial<Cliente>) => void
  flash: (msg: string) => void
}) {
  const [tab, setTab] = useState<DrawerTab>('cadastro')
  const m = clienteMetrics(cliente)
  const sm = STATUS_META[cliente.status]
  const matchKey = cliente.matchKey || ''
  const hasMatchKey = !!matchKey

  // estado de edição (notas + preferências + tags), ressincronizado ao trocar de cliente
  const [obs, setObs] = useState(cliente.observacoes ?? '')
  const [prefs, setPrefs] = useState<PreferenciaCategoria[]>(cliente.preferenciasCategorias ?? [])
  const [tagList, setTagList] = useState<string[]>(cliente.tags)
  const [tagInput, setTagInput] = useState('')
  const [savingObs, setSavingObs] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [savingTags, setSavingTags] = useState(false)
  useEffect(() => {
    setObs(cliente.observacoes ?? '')
    setPrefs(cliente.preferenciasCategorias ?? [])
    setTagList(cliente.tags)
    setTagInput('')
  }, [cliente.id, cliente.observacoes, cliente.preferenciasCategorias, cliente.tags])

  // ── cadastro (CPF / I.E. / momento) + score ──
  const [editCadastro, setEditCadastro] = useState(false)
  const [consultando, setConsultando] = useState(false)

  // ── documentos (carregados sob demanda) ──
  const [docs, setDocs] = useState<ClienteDocumento[]>(cliente.documentos ?? [])
  const [docsLoading, setDocsLoading] = useState(false)
  const [docsLoaded, setDocsLoaded] = useState(false)
  useEffect(() => {
    if (tab !== 'documentos' || docsLoaded || !hasMatchKey) return
    setDocsLoading(true)
    listClienteDocumentos(matchKey)
      .then((d) => { setDocs(d); setDocsLoaded(true) })
      .catch(() => flash('Falha ao carregar documentos.'))
      .finally(() => setDocsLoading(false))
  }, [tab, docsLoaded, hasMatchKey, matchKey, flash])
  useEffect(() => { setDocs(cliente.documentos ?? []); setDocsLoaded(false) }, [cliente.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── leiloeiras (carregadas sob demanda) ──
  const [leiloeiras, setLeiloeiras] = useState<Leiloeira[]>([])
  const [leilStatus, setLeilStatus] = useState<ClienteLeiloeiraStatus[]>([])
  const [leilLoading, setLeilLoading] = useState(false)
  const [leilLoaded, setLeilLoaded] = useState(false)
  const [enviandoLeil, setEnviandoLeil] = useState(false)
  useEffect(() => { setLeilLoaded(false); setLeilStatus([]) }, [cliente.id])
  useEffect(() => {
    if (tab !== 'leiloeiras' || leilLoaded || !hasMatchKey) return
    setLeilLoading(true)
    Promise.all([getLeiloeiras(), getClienteLeiloeiraStatus(matchKey)])
      .then(([ls, st]) => { setLeiloeiras(ls); setLeilStatus(st); setLeilLoaded(true) })
      .catch(() => flash('Falha ao carregar leiloeiras.'))
      .finally(() => setLeilLoading(false))
  }, [tab, leilLoaded, hasMatchKey, matchKey, flash])

  // ── leilões recomendados (carregados sob demanda) ──
  const [matches, setMatches] = useState<AgendaMatch[]>([])
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [matchesLoaded, setMatchesLoaded] = useState(false)
  useEffect(() => { setMatchesLoaded(false); setMatches([]) }, [cliente.id])
  useEffect(() => {
    if (tab !== 'recomendados' || matchesLoaded) return
    setMatchesLoading(true)
    getAgendaMatchesForCliente(cliente)
      .then((r) => { setMatches(r); setMatchesLoaded(true) })
      .catch(() => flash('Falha ao carregar leilões da agenda.'))
      .finally(() => setMatchesLoading(false))
  }, [tab, matchesLoaded, cliente, flash])

  // Consulta de score/protestos (botão na aba Dados).
  const consultarScore = async () => {
    if (!cliente.cpf || !hasMatchKey || consultando) return
    setConsultando(true)
    try {
      const r = await consultarScoreCliente(matchKey, cliente.nome, cliente.cpf)
      if (r.pending) {
        flash(r.message || 'Consulta de score pendente.')
      } else {
        onApplyCadastro(cliente.id, {
          scoreCredito: r.score ?? undefined,
          scoreFaixa: r.faixa,
          protestos: r.protestos,
        })
        flash('Score atualizado.')
      }
    } catch {
      flash('Falha ao consultar score.')
    } finally {
      setConsultando(false)
    }
  }

  // Upload de documento.
  const onUploadDoc = async (file: File, tipo: string) => {
    if (!hasMatchKey) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('matchKey', matchKey)
    fd.append('nome', file.name)
    fd.append('tipo', tipo)
    try {
      const doc = await uploadClienteDocumento(fd)
      setDocs((prev) => [doc, ...prev])
      flash('Documento enviado.')
    } catch {
      flash('Falha ao enviar documento.')
    }
  }

  const abrirDoc = async (path: string) => {
    try {
      const url = await getClienteDocumentoUrl(path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      flash('Falha ao gerar link do documento.')
    }
  }

  const excluirDoc = async (doc: ClienteDocumento) => {
    if (!window.confirm(`Excluir o documento "${doc.nomeArquivo}"?`)) return
    try {
      await deleteClienteDocumento(doc.id, doc.path)
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
      flash('Documento excluído.')
    } catch {
      flash('Falha ao excluir documento.')
    }
  }

  // Marca/desmarca cadastro aprovado em uma leiloeira.
  const toggleLeilAprovado = async (leiloeiraId: string, aprovar: boolean) => {
    if (!hasMatchKey) return
    const next: CadastroStatus = aprovar ? 'aprovado' : 'pendente'
    setLeilStatus((prev) => {
      const others = prev.filter((s) => s.leiloeiraId !== leiloeiraId)
      return [...others, { leiloeiraId, status: next }]
    })
    try {
      await setClienteLeiloeiraStatus(matchKey, leiloeiraId, next)
    } catch {
      flash('Falha ao atualizar status na leiloeira.')
    }
  }

  const enviarCadastro = async (leiloeiraIds?: string[]) => {
    if (!hasMatchKey || enviandoLeil) return
    setEnviandoLeil(true)
    try {
      const r = await submitClienteLeiloeiras(matchKey, leiloeiraIds)
      const skippedMsg = r.skipped.length ? ` · Ignorados: ${r.skipped.map((s) => `${s.leiloeira} (${s.reason})`).join(', ')}` : ''
      flash(`Enviados: ${r.sent}${skippedMsg}`)
      // recarrega status p/ refletir 'enviado'
      try { setLeilStatus(await getClienteLeiloeiraStatus(matchKey)) } catch { /* mantém otimista */ }
    } catch {
      flash('Falha ao enviar cadastro às leiloeiras.')
    } finally {
      setEnviandoLeil(false)
    }
  }

  const scoreFaixa: ScoreFaixa = cliente.scoreFaixa || scoreToFaixa(cliente.scoreCredito)
  const numProtestos = cliente.protestos?.length ?? 0
  const cadastroApto = isClienteCadastroApto({
    scoreFaixa,
    scoreCredito: cliente.scoreCredito,
    temIE: cliente.temInscricaoEstadual,
  })

  const obsDirty = obs.trim() !== (cliente.observacoes ?? '').trim()
  const prefsDirty = JSON.stringify(prefs) !== JSON.stringify(cliente.preferenciasCategorias ?? [])
  const tagsDirty = JSON.stringify(tagList) !== JSON.stringify(cliente.tags)

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tagList.includes(t)) setTagList([...tagList, t])
    setTagInput('')
  }

  const salvarObs = async () => {
    setSavingObs(true)
    try { await onSaveCampos(cliente, { observacoes: obs.trim() }) } finally { setSavingObs(false) }
  }
  const salvarPrefs = async () => {
    setSavingPrefs(true)
    try { await onSaveCampos(cliente, { preferenciasCategorias: prefs }) } finally { setSavingPrefs(false) }
  }
  const salvarTags = async () => {
    setSavingTags(true)
    try { await onSaveCampos(cliente, { tags: tagList }) } finally { setSavingTags(false) }
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
    { id: 'documentos', label: 'Documentos', icon: FileBadge },
    { id: 'leiloeiras', label: 'Leiloeiras', icon: Gavel },
    { id: 'recomendados', label: 'Leilões', icon: CalendarCheck },
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

              {/* ── cadastro p/ leiloeiras ── */}
              <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <FieldLabel icon={IdCard}>Cadastro para leiloeiras</FieldLabel>
                  <button className="btn ghost" style={{ height: 28, padding: '0 10px', fontSize: 12 }} onClick={() => setEditCadastro(true)}>
                    <Pencil size={13} /> Editar cadastro
                  </button>
                </div>
                <div className="space-y-3">
                  <InfoRow icon={IdCard} label="CPF" value={cliente.cpf ? fmtCpf(cliente.cpf) : '—'} />
                  <div className="flex items-start gap-3">
                    <FileBadge size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--gold)' }} />
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text3)', letterSpacing: '0.06em' }}>Inscrição Estadual</div>
                      <div className="text-[13px] mt-0.5 break-words flex items-center gap-2" style={{ color: 'var(--text)' }}>
                        {cliente.inscricaoEstadual || '—'}
                        {cliente.temInscricaoEstadual === 'Sim' && <Badge tone="olive"><Check size={10} />Tem I.E.</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <ShieldCheck size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--gold)' }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text3)', letterSpacing: '0.06em' }}>Score de crédito</div>
                      <div className="text-[13px] mt-1 flex items-center gap-2 flex-wrap">
                        {scoreFaixa
                          ? <><Badge tone={SCORE_FAIXA_META[scoreFaixa].tone}>{SCORE_FAIXA_META[scoreFaixa].label}</Badge>
                            {cliente.scoreCredito != null && <span className="font-bold" style={{ color: 'var(--text)' }}>{cliente.scoreCredito}</span>}</>
                          : <span style={{ color: 'var(--text3)' }}>Não consultado</span>}
                        <button
                          className="btn ghost"
                          style={{ height: 26, padding: '0 9px', fontSize: 11, opacity: cliente.cpf && hasMatchKey && !consultando ? 1 : 0.5 }}
                          onClick={consultarScore}
                          disabled={!cliente.cpf || !hasMatchKey || consultando}
                          title={cliente.cpf ? 'Consultar score de crédito' : 'Informe um CPF para consultar'}
                        >
                          <RefreshCw size={12} /> {consultando ? 'Consultando…' : 'Consultar score'}
                        </button>
                      </div>
                      {cadastroApto && <div className="text-[11px] mt-1.5 inline-flex items-center gap-1" style={{ color: 'var(--olive)' }}><ShieldCheck size={12} />Apto para cadastro</div>}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--gold)' }} />
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text3)', letterSpacing: '0.06em' }}>Protestos</div>
                      <div className="text-[13px] mt-0.5 font-semibold" style={{ color: numProtestos ? 'var(--red)' : 'var(--olive)' }}>
                        {numProtestos ? `${numProtestos} ${numProtestos === 1 ? 'protesto' : 'protestos'}` : 'Sem protestos'}
                      </div>
                    </div>
                  </div>
                  <InfoRow icon={TrendingUp} label="Momento na pecuária" value={cliente.momentoPecuaria || '—'} />
                </div>
              </div>

              <div>
                <FieldLabel icon={Heart}>Categorias de interesse</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {cliente.interesses.map((i) => <Badge key={i} tone="gold">{i}</Badge>)}
                </div>
              </div>
              <div>
                <FieldLabel icon={ListChecks}>Preferências de compra</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {(cliente.preferenciasCategorias?.length ?? 0) > 0
                    ? cliente.preferenciasCategorias!.map((p) => <Badge key={p} tone="olive">{p}</Badge>)
                    : <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Nenhuma — registre na aba “Preferências”.</span>}
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

          {tab === 'documentos' && (
            <div className="space-y-4">
              {!hasMatchKey && (
                <div className="text-[12px] px-3 py-2.5 rounded-lg" style={{ background: 'var(--gold-dim)', border: '1px solid rgba(200,169,110,0.25)', color: 'var(--text2)' }}>
                  Cliente sem chave de cadastro — salve-o via “Novo cliente” para anexar documentos.
                </div>
              )}
              {hasMatchKey && <DocUploader onUpload={onUploadDoc} />}
              {docsLoading && <p className="text-[12px]" style={{ color: 'var(--text3)' }}>Carregando documentos…</p>}
              {!docsLoading && docs.length === 0 && <EmptyState icon={FileBadge} text="Nenhum documento anexado." />}
              <div className="space-y-2">
                {docs.map((d) => {
                  const tipoMeta = DOC_TIPOS.find((t) => t.value === d.tipo)
                  return (
                    <div key={d.id} className="card" style={{ borderRadius: 10 }}>
                      <div className="card-b flex items-center gap-3" style={{ padding: 12 }}>
                        <FileBadge size={18} className="shrink-0" style={{ color: 'var(--gold)' }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{d.nomeArquivo}</div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge tone="blue">{tipoMeta?.label ?? d.tipo}</Badge>
                            <span className="text-[11px]" style={{ color: 'var(--text3)' }}>{fmtBytes(d.tamanhoBytes)}</span>
                            <span className="text-[11px]" style={{ color: 'var(--text3)' }}>· {fmtDate(d.createdAt.slice(0, 10))}</span>
                          </div>
                        </div>
                        <button className="btn ghost shrink-0" style={{ height: 30, padding: '0 10px', fontSize: 12 }} onClick={() => abrirDoc(d.path)}>
                          <ExternalLink size={13} /> Abrir
                        </button>
                        <button className="btn ghost shrink-0" style={{ width: 30, padding: 0, color: 'var(--red)' }} onClick={() => excluirDoc(d)} aria-label="Excluir documento">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {tab === 'leiloeiras' && (
            <div className="space-y-4">
              {!hasMatchKey && (
                <div className="text-[12px] px-3 py-2.5 rounded-lg" style={{ background: 'var(--gold-dim)', border: '1px solid rgba(200,169,110,0.25)', color: 'var(--text2)' }}>
                  Cliente sem chave de cadastro — salve-o via “Novo cliente” para gerir leiloeiras.
                </div>
              )}
              {hasMatchKey && (
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel icon={Gavel}>Cadastro nas leiloeiras</FieldLabel>
                  <button
                    className="btn primary"
                    style={{ height: 30, padding: '0 12px', fontSize: 12, opacity: enviandoLeil ? 0.5 : 1 }}
                    onClick={() => enviarCadastro()}
                    disabled={enviandoLeil}
                    title="Enviar cadastro a todas as leiloeiras elegíveis"
                  >
                    <Send size={13} /> {enviandoLeil ? 'Enviando…' : 'Enviar a todas'}
                  </button>
                </div>
              )}
              {leilLoading && <p className="text-[12px]" style={{ color: 'var(--text3)' }}>Carregando leiloeiras…</p>}
              {hasMatchKey && !leilLoading && leiloeiras.length === 0 && <EmptyState icon={Gavel} text="Nenhuma leiloeira cadastrada." />}
              <div className="space-y-2">
                {leiloeiras.map((l) => {
                  const st = leilStatus.find((s) => s.leiloeiraId === l.id)?.status ?? 'pendente'
                  const meta = CADASTRO_STATUS_META[st]
                  const aprovado = st === 'aprovado'
                  return (
                    <div key={l.id} className="card" style={{ borderRadius: 10 }}>
                      <div className="card-b" style={{ padding: 12 }}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{l.nome}</div>
                            <div className="mt-1"><Badge tone={meta.tone}>{meta.label}</Badge></div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <label className="flex items-center gap-1.5 text-[12px] cursor-pointer" style={{ color: 'var(--text2)' }}>
                              <input type="checkbox" checked={aprovado} onChange={(e) => toggleLeilAprovado(l.id, e.target.checked)} />
                              Aprovado
                            </label>
                            <button
                              className="btn ghost"
                              style={{ height: 28, padding: '0 10px', fontSize: 11, opacity: enviandoLeil ? 0.5 : 1 }}
                              onClick={() => enviarCadastro([l.id])}
                              disabled={enviandoLeil}
                            >
                              <Send size={12} /> Enviar
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {tab === 'recomendados' && (
            <div className="space-y-3">
              {matchesLoading && <p className="text-[12px]" style={{ color: 'var(--text3)' }}>Buscando leilões na agenda…</p>}
              {!matchesLoading && matches.length === 0 && <EmptyState icon={CalendarCheck} text="Nenhum leilão compatível na agenda." />}
              {matches.map((mt) => (
                <div key={mt.leilao.id} className="card" style={{ borderRadius: 10 }}>
                  <div className="card-b" style={{ padding: 14 }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{mt.leilao.nome}</div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]" style={{ color: 'var(--text3)' }}>
                          <span className="inline-flex items-center gap-1"><CalendarClock size={12} />{fmtDate(mt.leilao.data)}</span>
                          {mt.leilao.horario && <span>· {mt.leilao.horario}</span>}
                          {mt.leilao.leiloeira && <span>· {mt.leilao.leiloeira}</span>}
                          {mt.leilao.local && <span>· {mt.leilao.local}</span>}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {mt.motivos.map((mo) => <Badge key={mo} tone="olive">{mo}</Badge>)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[14px] font-extrabold" style={{ color: 'var(--gold)' }}>{mt.score}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>aderência</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
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
                <div className="flex flex-wrap gap-1.5 mb-2 min-h-[26px]">
                  {tagList.length === 0 && <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Sem tags</span>}
                  {tagList.map((t) => (
                    <span key={t} className="badge" style={{ paddingRight: 4 }}>
                      {t}
                      <button onClick={() => setTagList(tagList.filter((x) => x !== t))} className="ml-0.5 inline-flex items-center hover:opacity-70" aria-label={`Remover ${t}`}>
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className="input"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                    placeholder="Nova tag e Enter…"
                  />
                  <button className="btn shrink-0" onClick={addTag} disabled={!tagInput.trim()} style={{ opacity: tagInput.trim() ? 1 : 0.5 }}>
                    <Plus size={14} /> Add
                  </button>
                </div>
                <div className="flex justify-end mt-2">
                  <button className="btn primary" onClick={salvarTags} disabled={!tagsDirty || savingTags} style={{ opacity: tagsDirty && !savingTags ? 1 : 0.5 }}>
                    <Check size={14} /> {savingTags ? 'Salvando…' : 'Salvar tags'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {editCadastro && (
        <EditCadastroModal
          cliente={cliente}
          hasMatchKey={hasMatchKey}
          onClose={() => setEditCadastro(false)}
          onApplyCadastro={onApplyCadastro}
          flash={flash}
        />
      )}
    </div>
  )
}

// ── uploader de documento (input file + tipo) ──
function DocUploader({ onUpload }: { onUpload: (file: File, tipo: string) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null)
  const [tipo, setTipo] = useState('outro')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!file || busy) return
    setBusy(true)
    try { await onUpload(file, tipo); setFile(null) } finally { setBusy(false) }
  }

  return (
    <div className="card" style={{ borderRadius: 10 }}>
      <div className="card-b space-y-2.5" style={{ padding: 12 }}>
        <FieldLabel icon={Upload}>Anexar documento</FieldLabel>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="file"
            className="input flex-1"
            style={{ paddingTop: 6 }}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <select className="select sm:w-[160px]" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {DOC_TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button className="btn primary shrink-0" onClick={submit} disabled={!file || busy} style={{ opacity: file && !busy ? 1 : 0.5 }}>
            <Upload size={14} /> {busy ? 'Enviando…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── modal: editar cadastro p/ leiloeiras (CPF / I.E. / momento) ──
function EditCadastroModal({
  cliente, hasMatchKey, onClose, onApplyCadastro, flash,
}: {
  cliente: Cliente
  hasMatchKey: boolean
  onClose: () => void
  onApplyCadastro: (clienteId: string, patch: Partial<Cliente>) => void
  flash: (msg: string) => void
}) {
  const [cpf, setCpf] = useState(cliente.cpf ?? '')
  const [ie, setIe] = useState(cliente.inscricaoEstadual ?? '')
  const [temIe, setTemIe] = useState(cliente.temInscricaoEstadual === 'Sim' ? 'Sim' : (cliente.temInscricaoEstadual === 'Não' ? 'Não' : ''))
  const [momento, setMomento] = useState(cliente.momentoPecuaria ?? '')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const submit = async () => {
    if (saving) return
    setSaving(true)
    setErro(null)
    const patch: Partial<Cliente> = {
      cpf: cpf.trim(),
      inscricaoEstadual: ie.trim(),
      temInscricaoEstadual: temIe,
      momentoPecuaria: momento.trim(),
    }
    onApplyCadastro(cliente.id, patch)
    try {
      await updateClienteCadastro({
        matchKey: cliente.matchKey || '',
        nome: cliente.nome,
        cpf: cpf.trim(),
        inscricaoEstadual: ie.trim(),
        temInscricaoEstadual: temIe,
        momentoPecuaria: momento.trim(),
      })
      flash('Cadastro atualizado.')
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar o cadastro.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Editar cadastro" onClose={onClose}
      footer={<>
        {erro && <span className="text-[12px] mr-auto self-center" style={{ color: 'var(--red)' }}>{erro}</span>}
        <button className="btn ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn primary" onClick={submit} disabled={saving} style={{ opacity: saving ? 0.5 : 1 }}>
          <Check size={14} /> {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </>}
    >
      {!hasMatchKey && (
        <p className="text-[12px] mb-3 px-3 py-2 rounded-lg" style={{ background: 'var(--gold-dim)', border: '1px solid rgba(200,169,110,0.25)', color: 'var(--text2)' }}>
          Cliente sem chave de cadastro — as alterações não serão persistidas.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="CPF"><input className="input" value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" /></Field>
        <Field label="Tem Inscrição Estadual?">
          <select className="select" value={temIe} onChange={(e) => setTemIe(e.target.value)}>
            <option value="">—</option>
            <option value="Sim">Sim</option>
            <option value="Não">Não</option>
          </select>
        </Field>
        <Field label="Inscrição Estadual" full><input className="input" value={ie} onChange={(e) => setIe(e.target.value)} placeholder="Número da I.E." /></Field>
        <Field label="Momento na pecuária" full><input className="input" value={momento} onChange={(e) => setMomento(e.target.value)} placeholder="Ex.: recria, engorda, cria…" /></Field>
      </div>
    </Modal>
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

// ── selo de score (faixa) reutilizável ───────────────────────────────────────
function ScoreSelo({ cliente }: { cliente: Cliente }) {
  if (cliente.scoreCredito == null) return <span style={{ color: 'var(--text3)' }}>Score —</span>
  const faixa = cliente.scoreFaixa || scoreToFaixa(cliente.scoreCredito)
  if (!faixa) return <span className="font-semibold" style={{ color: 'var(--text)' }}>Score {cliente.scoreCredito}</span>
  return <Badge tone={SCORE_FAIXA_META[faixa].tone}>Score {cliente.scoreCredito} · {SCORE_FAIXA_META[faixa].label}</Badge>
}

// Indicador ✓/✗ enxuto.
function Ok({ ok }: { ok: boolean }) {
  return ok
    ? <Check size={11} style={{ color: 'var(--olive)', display: 'inline' }} />
    : <X size={11} style={{ color: 'var(--text3)', display: 'inline' }} />
}

const hasIE = (c: Cliente) => c.temInscricaoEstadual === 'Sim' || !!c.inscricaoEstadual

// Cabeçalho de tabela clicável p/ ordenar.
function SortTh({
  label, col, sort, onSort, align,
}: {
  label: string
  col: 'nome' | 'total' | 'score' | 'interacao'
  sort: { key: string; dir: 'asc' | 'desc' }
  onSort: (k: 'nome' | 'total' | 'score' | 'interacao') => void
  align?: 'right'
}) {
  const active = sort.key === col
  return (
    <th style={{ textAlign: align, cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort(col)}>
      <span className="inline-flex items-center gap-1" style={{ color: active ? 'var(--gold)' : undefined }}>
        {label}{active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
      </span>
    </th>
  )
}

// ── componente principal ──────────────────────────────────────────────────────
export function ClientesClient({ initialClientes, vgvSummary }: { initialClientes: Cliente[]; vgvSummary?: ClientesVgvSummary }) {
  const [clientes, setClientes] = useState<Cliente[]>(initialClientes)
  const [selected, setSelected] = useState<Cliente | null>(null)
  const [busca, setBusca] = useState('')
  const [fCidade, setFCidade] = useState('')
  const [fStatus, setFStatus] = useState<'' | ClienteStatus>('')
  const [fPerfil, setFPerfil] = useState<'' | PerfilConsumo>('')
  const [fInteresse, setFInteresse] = useState<'' | Interesse>('')
  const [fPreferencia, setFPreferencia] = useState<'' | PreferenciaCategoria>('')
  const [fReadiness, setFReadiness] = useState<'' | ClienteReadiness>('')

  // Modo de exibição (cards / tabela / lista) — default cards, persistido em localStorage.
  const [viewMode, setViewMode] = useState<'cards' | 'tabela' | 'lista'>('cards')
  useEffect(() => {
    const v = localStorage.getItem('clientes:viewMode')
    if (v === 'cards' || v === 'tabela' || v === 'lista') setViewMode(v)
  }, [])
  const setView = (mode: 'cards' | 'tabela' | 'lista') => {
    setViewMode(mode)
    try { localStorage.setItem('clientes:viewMode', mode) } catch { /* ignora storage indisponível */ }
  }

  // Ordenação compartilhada pelos três modos (cabeçalhos da tabela controlam).
  const [sort, setSort] = useState<{ key: 'nome' | 'total' | 'score' | 'interacao'; dir: 'asc' | 'desc' }>({ key: 'total', dir: 'desc' })
  const toggleSort = (key: 'nome' | 'total' | 'score' | 'interacao') =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'nome' ? 'asc' : 'desc' }))

  // Deep-link da busca global: /sistema/clientes?q=<nome> pré-filtra a lista.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q')
    if (q) setBusca(q)
  }, [])

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
        if (fPreferencia && !(c.preferenciasCategorias ?? []).includes(fPreferencia)) return false
        if (fReadiness && clienteReadiness(c) !== fReadiness) return false
        return true
      })
  }, [enriched, busca, fCidade, fStatus, fPerfil, fInteresse, fPreferencia, fReadiness])

  // Lista ordenada usada por todos os modos de exibição.
  const displayed = useMemo(() => {
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'nome': return sign * a.c.nome.localeCompare(b.c.nome, 'pt-BR')
        case 'score': return sign * ((a.c.scoreCredito ?? -1) - (b.c.scoreCredito ?? -1))
        case 'interacao': return sign * (a.m.ultimaInteracao ?? '').localeCompare(b.m.ultimaInteracao ?? '')
        case 'total':
        default: return sign * (a.m.totalComprado - b.m.totalComprado)
      }
    })
  }, [filtered, sort])

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = enriched.length
    const ativos = enriched.filter(({ c }) => c.status === 'ativo' || c.status === 'quente').length
    const recorrentes = enriched.filter(({ c }) => c.recorrente).length
    const volume = enriched.reduce((s, { m }) => s + m.totalComprado, 0)
    const numCompras = enriched.reduce((s, { m }) => s + m.numCompras, 0)
    const ticket = numCompras ? Math.round(volume / numCompras) : 0
    const ultimaCompra = enriched.map(({ m }) => m.ultimaCompra).filter(Boolean).sort().at(-1) as string | undefined
    const aptos = enriched.filter(({ c }) => clienteReadiness(c) === 'apto').length
    return { total, ativos, recorrentes, volume, ticket, ultimaCompra, aptos }
  }, [enriched])

  const hasFilter = busca || fCidade || fStatus || fPerfil || fInteresse || fPreferencia || fReadiness
  const clearFilters = () => { setBusca(''); setFCidade(''); setFStatus(''); setFPerfil(''); setFInteresse(''); setFPreferencia(''); setFReadiness('') }

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
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
    })
    setClientes((prev) => prev.map((c) => (c.id === cliente.id ? apply(c) : c)))
    setSelected((prev) => (prev && prev.id === cliente.id ? apply(prev) : prev))
    try {
      await updateClienteCampos({
        matchKey: cliente.matchKey || '',
        nome: cliente.nome,
        observacoes: patch.observacoes,
        preferenciasCategorias: patch.preferenciasCategorias,
        tags: patch.tags,
      })
      flash('Alterações salvas.')
    } catch {
      flash('Falha ao salvar no servidor.')
    }
  }

  // Atualização otimista de campos de cadastro (CPF/I.E./score/protestos/momento)
  // disparada pelo drawer; a persistência fica a cargo de quem chama (modal/score).
  const applyCadastro = useCallback((clienteId: string, patch: Partial<Cliente>) => {
    setClientes((prev) => prev.map((c) => (c.id === clienteId ? { ...c, ...patch } : c)))
    setSelected((prev) => (prev && prev.id === clienteId ? { ...prev, ...patch } : prev))
  }, [])

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
          <div className="flex items-center" style={{ border: '1px solid var(--border2)', borderRadius: 8, padding: 2, gap: 2 }}>
            {([
              { mode: 'cards', icon: LayoutGrid, label: 'Cards' },
              { mode: 'tabela', icon: TableIcon, label: 'Tabela' },
              { mode: 'lista', icon: List, label: 'Lista' },
            ] as const).map(({ mode, icon: Icon, label }) => {
              const active = viewMode === mode
              return (
                <button
                  key={mode}
                  className="btn ghost"
                  onClick={() => setView(mode)}
                  title={label}
                  aria-label={label}
                  aria-pressed={active}
                  style={{
                    height: 30, padding: '0 10px', fontSize: 12, borderRadius: 6,
                    color: active ? 'var(--gold)' : 'var(--text3)',
                    border: `1px solid ${active ? 'var(--gold-dark)' : 'transparent'}`,
                    background: active ? 'var(--gold-dim)' : 'transparent',
                  }}
                >
                  <Icon size={14} /> {label}
                </button>
              )
            })}
          </div>
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
        <Kpi value={String(kpis.aptos)} label="Aptos para cadastro" tag={`${kpis.total ? Math.round((kpis.aptos / kpis.total) * 100) : 0}% da base`} />
        <div className="slim-div" />
        <Kpi value={kpis.ticket ? brlCompact(kpis.ticket).replace('R$', '').trim() : '—'} cur="R$" label="Ticket médio" />
        <div className="slim-div" />
        <Kpi
          value={brlCompact(vgvSummary ? vgvSummary.vgvTotalLeiloes : kpis.volume).replace('R$', '').trim()}
          cur="R$"
          label="VGV Total (leilões)"
          tag={vgvSummary ? `${Math.round(vgvSummary.cobertura * 100)}% atribuído a compradores` : 'arremates'}
        />
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
            <select className="select lg:w-[150px]" value={fPreferencia} onChange={(e) => setFPreferencia(e.target.value as PreferenciaCategoria | '')}>
              <option value="">Preferência</option>
              {PREFERENCIA_CATEGORIAS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="select lg:w-[140px]" value={fReadiness} onChange={(e) => setFReadiness(e.target.value as ClienteReadiness | '')}>
              <option value="">Prontidão</option>
              <option value="apto">Apto</option>
              <option value="pendente">Pendente</option>
              <option value="sem-dados">Sem dados</option>
            </select>
            {hasFilter && (
              <button className="btn ghost shrink-0" onClick={clearFilters} title="Limpar filtros">
                <X size={14} /> Limpar
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-3 text-[11px]" style={{ color: 'var(--text3)' }}>
            <Filter size={12} />
            <span><b style={{ color: 'var(--text2)' }}>{displayed.length}</b> de {clientes.length} clientes</span>
          </div>
        </div>
      </div>

      {/* ── modos de exibição ── */}
      {displayed.length === 0 ? (
        <div className="card card-p0">
          <div className="card-b" style={{ padding: 0 }}>
            <EmptyState icon={Users} text={hasFilter ? 'Nenhum cliente encontrado com esses filtros.' : 'Nenhum comprador encontrado nos fechamentos ainda.'} />
          </div>
        </div>
      ) : viewMode === 'cards' ? (
        /* ── CARDS ── */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
          {displayed.map(({ c, m }) => {
            const r = clienteReadiness(c)
            const sm = STATUS_META[c.status]
            return (
              <div key={c.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setSelected(c)}>
                <div className="card-b" style={{ padding: 14 }}>
                  {/* header */}
                  <div className="flex items-start gap-2.5">
                    <div
                      className="shrink-0 flex items-center justify-center font-bold text-[12px]"
                      style={{ width: 36, height: 36, borderRadius: 8, color: 'var(--bg)', background: 'linear-gradient(135deg, #C8A96E 0%, #A68B4B 100%)' }}
                    >
                      {c.nome.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                        <span className="truncate">{c.nome}</span>
                        {c.recorrente && <Repeat size={12} style={{ color: 'var(--gold)' }} aria-label="Recorrente" />}
                        {c.crmLeadId && (
                          <a href={crmLeadHref(c.crmLeadId)} onClick={(e) => e.stopPropagation()} title="Ver lead no CRM" className="inline-flex items-center" style={{ color: 'var(--olive)' }}>
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <Badge tone={PERFIL_BADGE[c.perfil]}>{c.perfil}</Badge>
                        <Badge tone={sm.badge}><sm.icon size={10} />{sm.label}</Badge>
                      </div>
                    </div>
                  </div>

                  <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />

                  {/* score + prontidão */}
                  <div className="flex items-center justify-between gap-2 flex-wrap text-[12px]">
                    <ScoreSelo cliente={c} />
                    <Badge tone={READINESS_META[r].tone}>{READINESS_META[r].label}</Badge>
                  </div>

                  {/* CPF / I.E. / Docs */}
                  <div className="flex items-center gap-2 mt-2 text-[11px]" style={{ color: 'var(--text3)' }}>
                    <span className="inline-flex items-center gap-1">CPF <Ok ok={!!c.cpf} /></span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">I.E. <Ok ok={hasIE(c)} /></span>
                    <span>·</span>
                    <span>Docs {c.docsCount ?? 0}</span>
                  </div>

                  <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />

                  {/* total + leiloeiras */}
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span>
                      <b style={{ color: 'var(--text)' }}>{brlCompact(m.totalComprado)}</b>
                      <span style={{ color: 'var(--text3)' }}> · {m.numCompras} {m.numCompras === 1 ? 'compra' : 'compras'}</span>
                    </span>
                    <span style={{ color: 'var(--text3)' }}>Leiloeiras: {c.leiloeirasAprovadas ?? 0}</span>
                  </div>

                  {/* ações */}
                  <div className="flex items-center gap-2 mt-3">
                    {c.telefone && (
                      <a
                        href={waLink(c.telefone)} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="btn ghost flex-1"
                        style={{ height: 30, fontSize: 12, color: 'var(--olive)' }}
                      >
                        <MessageCircle size={13} /> WhatsApp
                      </a>
                    )}
                    <button className="btn flex-1" onClick={(e) => { e.stopPropagation(); setSelected(c) }} style={{ height: 30, fontSize: 12 }}>
                      Abrir <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : viewMode === 'tabela' ? (
        /* ── TABELA ── */
        <div className="card card-p0">
          <div className="card-b" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <SortTh label="Cliente" col="nome" sort={sort} onSort={toggleSort} />
                  <th>Telefone / WhatsApp</th>
                  <th>Cidade / UF</th>
                  <th>Perfil</th>
                  <SortTh label="Score" col="score" sort={sort} onSort={toggleSort} />
                  <th>Cadastro</th>
                  <th style={{ textAlign: 'right' }}>Leiloeiras</th>
                  <SortTh label="Total comprado" col="total" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label="Última interação" col="interacao" sort={sort} onSort={toggleSort} />
                  <th>Status</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(({ c, m }) => {
                  const sm = STATUS_META[c.status]
                  const r = clienteReadiness(c)
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
                      <td><ScoreSelo cliente={c} /></td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <Badge tone={READINESS_META[r].tone}>{READINESS_META[r].label}</Badge>
                          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--text3)' }}>I.E. <Ok ok={hasIE(c)} /></span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{c.leiloeirasAprovadas ?? 0}</td>
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
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── LISTA ── */
        <div className="card card-p0">
          <div className="card-b" style={{ padding: 0 }}>
            {displayed.map(({ c, m }, idx) => {
              const r = clienteReadiness(c)
              const faixa = c.scoreFaixa || scoreToFaixa(c.scoreCredito)
              return (
                <div
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ cursor: 'pointer', borderTop: idx === 0 ? 'none' : '1px solid var(--border)' }}
                >
                  <div
                    className="shrink-0 flex items-center justify-center font-bold text-[12px]"
                    style={{ width: 34, height: 34, borderRadius: 8, color: 'var(--bg)', background: 'linear-gradient(135deg, #C8A96E 0%, #A68B4B 100%)' }}
                  >
                    {c.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold truncate" style={{ color: 'var(--text)' }}>{c.nome}</span>
                      {c.recorrente && <Repeat size={12} style={{ color: 'var(--gold)' }} aria-label="Recorrente" />}
                      {c.crmLeadId && (
                        <a href={crmLeadHref(c.crmLeadId)} onClick={(e) => e.stopPropagation()} title="Ver lead no CRM" className="inline-flex items-center" style={{ color: 'var(--olive)' }}>
                          <ExternalLink size={12} />
                        </a>
                      )}
                      <Badge tone={PERFIL_BADGE[c.perfil]}>{c.perfil}</Badge>
                      <Badge tone={READINESS_META[r].tone}>{READINESS_META[r].label}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] flex-wrap" style={{ color: 'var(--text3)' }}>
                      <span>{faixa ? `Score ${SCORE_FAIXA_META[faixa].label}` : 'Score —'}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">I.E. <Ok ok={hasIE(c)} /></span>
                      <span>·</span>
                      <span>Docs {c.docsCount ?? 0}</span>
                      <span>·</span>
                      <span>Leiloeiras {c.leiloeirasAprovadas ?? 0}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-[13px]" style={{ color: m.totalComprado ? 'var(--text)' : 'var(--text3)' }}>{m.totalComprado ? brlCompact(m.totalComprado) : '—'}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{m.numCompras} {m.numCompras === 1 ? 'compra' : 'compras'}</div>
                  </div>
                  <ChevronRight size={15} className="shrink-0" style={{ color: 'var(--text4)' }} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* drawer */}
      {selected && (
        <DetailDrawer
          cliente={selected}
          onClose={() => setSelected(null)}
          onRegistrarInteracao={(c) => setInteracaoTarget(c)}
          onSaveCampos={saveCampos}
          onApplyCadastro={applyCadastro}
          flash={flash}
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
  const [cpf, setCpf] = useState('')
  const [ie, setIe] = useState('')
  const [momento, setMomento] = useState('')
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
        cpf: cpf.trim() || undefined,
        inscricaoEstadual: ie.trim() || undefined,
        temInscricaoEstadual: ie.trim() ? 'Sim' : undefined,
        momentoPecuaria: momento.trim() || undefined,
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
        <Field label="CPF"><input className="input" value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" /></Field>
        <Field label="Inscrição Estadual"><input className="input" value={ie} onChange={(e) => setIe(e.target.value)} placeholder="Número da I.E." /></Field>
        <Field label="Momento na pecuária" full><input className="input" value={momento} onChange={(e) => setMomento(e.target.value)} placeholder="Ex.: recria, engorda, cria…" /></Field>
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
