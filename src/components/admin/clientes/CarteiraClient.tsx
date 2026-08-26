'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CARTEIRA DE ASSESSORES — quem atende quem, e o que essa carteira vale.
//
// A tela responde três perguntas que hoje só se responde abrindo planilha:
//   1. Quantos clientes cada assessor tem, e quanto essa carteira arremata?
//   2. Quem está descoberto — cliente sem assessor, ou atendido fora da zona?
//   3. Dentro da carteira, quem está esfriando (recência) e quem já pode
//      comprar em cada leiloeira (habilitação).
//
// Fonte única: o mesmo `getClientes()` do módulo Clientes. O período recorta as
// COMPRAS, nunca a carteira — cliente parado continua na lista do assessor.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Users, Search, X, Filter, Download, ExternalLink, ChevronRight, Gavel,
  MapPin, AlertTriangle, UserCheck, Wand2, Check, Loader2, MessageCircle,
  TrendingUp, Contact, ShieldCheck,
} from 'lucide-react'
import {
  type Cliente, type ClienteRecencia, type ClienteReadiness,
  brl, brlCompact, fmtDate, timeAgo, waLink, clienteRecencia, clienteReadiness,
  RECENCIA_META, READINESS_META, leiloeirasHabilitadas, nomesHabilitadas, SEM_ASSESSOR,
} from '@/lib/clientes'
import {
  type PeriodoKey, type ResumoCliente, type GrupoCarteira,
  PERIODOS, janelaDoPeriodo, resumoNoPeriodo, nomeAssessorExibicao,
  zonaDoCliente, COERENCIA_META, grupoVazio, acumulaNoGrupo, fechaGrupos,
} from '@/lib/clientes-carteira'
import { ASSESSORES } from '@/lib/assessor-zona'
import { setClienteAssessor, type AssessorRoster } from '@/app/sistema/actions/clientes'
import { Pagination } from '@/components/admin/ui/Pagination'

type Linha = { c: Cliente; r: ResumoCliente }

const clienteHref = (nome: string) => `/sistema/clientes?q=${encodeURIComponent(nome)}`

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

function Kpi({ value, cur, label, tag, tagDown }: { value: string; cur?: string; label: string; tag?: string; tagDown?: boolean }) {
  return (
    <div className="slim-kpi">
      <div className="slim-kpi-val">{cur && <span className="cur">{cur} </span>}{value}</div>
      <div className="slim-kpi-lbl">{label}</div>
      {tag && <div className={`slim-kpi-tag${tagDown ? ' down' : ''}`}>{tag}</div>}
    </div>
  )
}

/** Barra proporcional usada nos cards e no ranking. */
function Barra({ pct, cor }: { pct: number; cor?: string }) {
  return (
    <div style={{ height: 5, borderRadius: 999, background: 'var(--s3)', overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(2, Math.min(100, pct * 100))}%`, height: '100%', borderRadius: 999, background: cor || 'linear-gradient(90deg, #A68B4B, #C8A96E)' }} />
    </div>
  )
}

/** Distribuição de recência da carteira em barra empilhada. */
function BarraRecencia({ recencia, total }: { recencia: Record<ClienteRecencia, number>; total: number }) {
  const ordem: ClienteRecencia[] = ['ativo', 'atencao', 'risco', 'inativo', 'sem-compra']
  const cores: Record<ClienteRecencia, string> = {
    ativo: 'var(--olive)', atencao: 'var(--amber)', risco: 'var(--red)',
    inativo: 'var(--text4)', 'sem-compra': 'var(--blue)',
  }
  if (!total) return null
  return (
    <div className="flex" style={{ height: 6, borderRadius: 999, overflow: 'hidden', background: 'var(--s3)' }}>
      {ordem.map((k) => {
        const n = recencia[k]
        if (!n) return null
        return (
          <div
            key={k}
            title={`${RECENCIA_META[k].label}: ${n} (${RECENCIA_META[k].hint})`}
            style={{ width: `${(n / total) * 100}%`, background: cores[k] }}
          />
        )
      })}
    </div>
  )
}

function LeiloeirasChips({ cliente, max = 2 }: { cliente: Cliente; max?: number }) {
  const habilitadas = leiloeirasHabilitadas(cliente)
  if (habilitadas.length === 0) return <span className="text-[11px]" style={{ color: 'var(--text3)' }}>—</span>
  const visiveis = habilitadas.slice(0, max)
  const resto = habilitadas.length - visiveis.length
  return (
    <span className="inline-flex items-center gap-1 flex-wrap" title={habilitadas.map((l) => l.nome).join(' · ')}>
      {visiveis.map((l) => <Badge key={l.id} tone="olive"><Gavel size={9} />{l.nome}</Badge>)}
      {resto > 0 && <Badge tone="">+{resto}</Badge>}
    </span>
  )
}

export function CarteiraClient({
  initialClientes, roster,
}: {
  initialClientes: Cliente[]
  roster: AssessorRoster[]
}) {
  const [clientes, setClientes] = useState<Cliente[]>(initialClientes)
  const [periodo, setPeriodo] = useState<PeriodoKey>('12m')
  const [busca, setBusca] = useState('')
  const [fUf, setFUf] = useState('')
  const [fRecencia, setFRecencia] = useState<'' | ClienteRecencia>('')
  const [fReadiness, setFReadiness] = useState<'' | ClienteReadiness>('')
  const [fLeiloeira, setFLeiloeira] = useState('')
  const [fZona, setFZona] = useState<'' | 'divergente' | 'sem-assessor'>('')
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const flash = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }, [])

  const { de, ate } = useMemo(() => janelaDoPeriodo(periodo), [periodo])

  // ── linhas base: cliente + resumo do período ────────────────────────────────
  const linhas: Linha[] = useMemo(
    () => clientes.map((c) => ({ c, r: resumoNoPeriodo(c, de, ate) })),
    [clientes, de, ate],
  )

  const ufs = useMemo(
    () => [...new Set(clientes.map((c) => c.uf).filter((u) => u && u !== '—'))].sort(),
    [clientes],
  )
  const casas = useMemo(
    () => [...new Set(clientes.flatMap(nomesHabilitadas))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [clientes],
  )

  // Nomes de assessor disponíveis para (re)atribuição: roster ativo da Escala +
  // os três da regra de zona + quem já aparece vinculado na base.
  const opcoesAssessor = useMemo(() => {
    const set = new Set<string>(ASSESSORES)
    for (const m of roster) if (m.ativo && m.nome) set.add(nomeAssessorExibicao(m.nome))
    for (const c of clientes) {
      const n = nomeAssessorExibicao(c.assessor)
      if (n !== SEM_ASSESSOR) set.add(n)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [roster, clientes])

  // ── filtros (valem tanto para os cards quanto para a tabela) ────────────────
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, '')
    return linhas.filter(({ c }) => {
      if (q) {
        const hitNome = c.nome.toLowerCase().includes(q) || c.responsavel.toLowerCase().includes(q)
        const hitTel = qDigits.length >= 3 && c.telefone.replace(/\D/g, '').includes(qDigits)
        if (!hitNome && !hitTel) return false
      }
      if (fUf && c.uf !== fUf) return false
      if (fRecencia && clienteRecencia(c) !== fRecencia) return false
      if (fReadiness && clienteReadiness(c) !== fReadiness) return false
      if (fLeiloeira && !nomesHabilitadas(c).includes(fLeiloeira)) return false
      if (fZona && zonaDoCliente(c).coerencia !== fZona) return false
      return true
    })
  }, [linhas, busca, fUf, fRecencia, fReadiness, fLeiloeira, fZona])

  const filtroAtivo = !!(busca || fUf || fRecencia || fReadiness || fLeiloeira || fZona)

  // ── carteiras: um grupo por assessor (+ o balde "Sem assessor") ─────────────
  const carteiras = useMemo(() => {
    const mapa = new Map<string, GrupoCarteira>()
    // assessores do roster entram mesmo com zero clientes — carteira vazia é
    // informação, não ausência de informação.
    for (const nome of opcoesAssessor) mapa.set(nome, grupoVazio(nome))
    for (const { c, r } of filtradas) {
      const nome = nomeAssessorExibicao(c.assessor)
      let g = mapa.get(nome)
      if (!g) { g = grupoVazio(nome); mapa.set(nome, g) }
      acumulaNoGrupo(g, c, r)
    }
    const lista = fechaGrupos([...mapa.values()])
    const semAssessor = lista.filter((g) => g.chave === SEM_ASSESSOR && g.clientes > 0)
    const comAssessor = lista
      .filter((g) => g.chave !== SEM_ASSESSOR)
      // Carteira vazia é informação relevante ("fulano não tem cliente") — mas
      // só sem filtro. Com filtro aplicado todo mundo zera e vira ruído.
      .filter((g) => g.clientes > 0 || !filtroAtivo)
      .sort((a, b) => b.vgv - a.vgv || b.clientes - a.clientes)
    return [...semAssessor, ...comAssessor]
  }, [filtradas, opcoesAssessor, filtroAtivo])

  const maxVgv = useMemo(() => Math.max(1, ...carteiras.map((g) => g.vgv)), [carteiras])
  const corDoAssessor = useCallback(
    (nome: string) => roster.find((m) => nomeAssessorExibicao(m.nome) === nome)?.cor || '#A68B4B',
    [roster],
  )

  // ── KPIs do topo ────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = filtradas.length
    const semAssessor = filtradas.filter(({ c }) => nomeAssessorExibicao(c.assessor) === SEM_ASSESSOR).length
    const divergentes = filtradas.filter(({ c }) => zonaDoCliente(c).coerencia === 'divergente').length
    const vgv = filtradas.reduce((s, { r }) => s + r.vgv, 0)
    const compras = filtradas.reduce((s, { r }) => s + r.compras, 0)
    const habilitados = filtradas.filter(({ c }) => leiloeirasHabilitadas(c).length > 0).length
    const carteirasAtivas = carteiras.filter((g) => g.chave !== SEM_ASSESSOR && g.clientes > 0).length
    return {
      total, semAssessor, divergentes, vgv, compras, habilitados, carteirasAtivas,
      ticket: compras ? Math.round(vgv / compras) : 0,
    }
  }, [filtradas, carteiras])

  const hasFilter = filtroAtivo
  const limpar = () => { setBusca(''); setFUf(''); setFRecencia(''); setFReadiness(''); setFLeiloeira(''); setFZona('') }

  // ── tabela da carteira selecionada ──────────────────────────────────────────
  const daCarteira = useMemo(() => {
    const base = selecionado
      ? filtradas.filter(({ c }) => nomeAssessorExibicao(c.assessor) === selecionado)
      : filtradas
    return [...base].sort((a, b) => b.r.vgv - a.r.vgv || a.c.nome.localeCompare(b.c.nome, 'pt-BR'))
  }, [filtradas, selecionado])

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  useEffect(() => { setPage(1) }, [selecionado, busca, fUf, fRecencia, fReadiness, fLeiloeira, fZona, periodo, pageSize])
  const paged = useMemo(() => daCarteira.slice((page - 1) * pageSize, page * pageSize), [daCarteira, page, pageSize])

  // ── (re)atribuição ──────────────────────────────────────────────────────────
  const atribuir = useCallback(async (cliente: Cliente, assessor: string) => {
    if (!cliente.matchKey) { flash('Cliente sem chave de cadastro — abra a ficha e salve antes de atribuir.'); return }
    setSalvando(cliente.id)
    const anterior = cliente.assessor
    setClientes((prev) => prev.map((c) => (c.id === cliente.id ? { ...c, assessor: assessor || undefined } : c)))
    try {
      await setClienteAssessor(cliente.matchKey, cliente.nome, assessor)
      flash(assessor ? `${cliente.nome} → ${assessor}.` : `Vínculo removido de ${cliente.nome}.`)
    } catch (e) {
      setClientes((prev) => prev.map((c) => (c.id === cliente.id ? { ...c, assessor: anterior } : c)))
      flash(e instanceof Error ? e.message : 'Falha ao salvar o assessor.')
    } finally {
      setSalvando(null)
    }
  }, [flash])

  // Clientes do recorte atual que estão sem assessor E têm sugestão de zona.
  const sugeridosPorZona = useMemo(
    () => daCarteira
      .map(({ c }) => ({ c, z: zonaDoCliente(c) }))
      .filter(({ z }) => z.coerencia === 'sem-assessor' && !!z.esperado),
    [daCarteira],
  )

  const [aplicandoZona, setAplicandoZona] = useState(false)
  const [progressoZona, setProgressoZona] = useState(0)
  const aplicarZonaEmLote = useCallback(async () => {
    const alvos = sugeridosPorZona.filter(({ c }) => c.matchKey)
    if (alvos.length === 0) return
    const ok = window.confirm(
      `Atribuir ${alvos.length} cliente(s) sem assessor pela regra de zona (UF do cadastro)?\n\n` +
      'Cada cliente vai para o assessor da própria UF. Você pode reverter na tabela, cliente a cliente.',
    )
    if (!ok) return
    setAplicandoZona(true)
    setProgressoZona(0)
    let feitos = 0
    for (const { c, z } of alvos) {
      try {
        await setClienteAssessor(c.matchKey!, c.nome, z.esperado as string)
        setClientes((prev) => prev.map((x) => (x.id === c.id ? { ...x, assessor: z.esperado as string } : x)))
        feitos += 1
      } catch { /* segue os demais; o saldo aparece no toast */ }
      setProgressoZona((n) => n + 1)
    }
    setAplicandoZona(false)
    flash(`${feitos} de ${alvos.length} cliente(s) atribuídos pela zona.`)
  }, [sugeridosPorZona, flash])

  // ── export ──────────────────────────────────────────────────────────────────
  const exportarCSV = useCallback(() => {
    const head = [
      'Assessor', 'Cliente', 'Responsável', 'Telefone', 'Cidade', 'UF', 'Zona esperada', 'Coerência',
      'VGV no período', 'Compras no período', 'Ticket no período', 'Última compra', 'Recência',
      'Prontidão', 'Leiloeiras habilitadas', 'CPF', 'Docs',
    ]
    const rows = daCarteira.map(({ c, r }) => {
      const z = zonaDoCliente(c)
      return [
        nomeAssessorExibicao(c.assessor), c.nome, c.responsavel, c.telefone, c.cidade, c.uf,
        z.esperado ?? '', COERENCIA_META[z.coerencia].label,
        String(r.vgv), String(r.compras), String(r.ticket), r.ultimaCompra ?? '',
        RECENCIA_META[clienteRecencia(c)].label, READINESS_META[clienteReadiness(c)].label,
        nomesHabilitadas(c).join(' | '), c.cpf ?? '', String(c.docsCount ?? 0),
      ]
    })
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `carteira-assessores-${selecionado ? selecionado.toLowerCase().replace(/\s+/g, '-') : 'todos'}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    flash(`Exportados ${daCarteira.length} clientes.`)
  }, [daCarteira, selecionado, flash])

  const periodoLabel = PERIODOS.find((p) => p.key === periodo)?.label ?? ''

  return (
    <div>
      {/* header */}
      <div className="page-head">
        <div>
          <h1 className="flex items-center gap-2.5">
            <UserCheck size={22} style={{ color: 'var(--gold)' }} />
            Carteira de Assessores
          </h1>
          <p className="sub">Quem atende quem · valor da carteira, cobertura por zona e habilitação nas leiloeiras</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="select" style={{ width: 190 }} value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoKey)}>
            {PERIODOS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <button className="btn" onClick={exportarCSV}><Download size={14} /> Exportar</button>
          <a className="btn" href="/sistema/clientes"><Contact size={14} /> Clientes</a>
          <a className="btn" href="/sistema/clientes/relatorios"><TrendingUp size={14} /> Relatórios</a>
        </div>
      </div>

      {/* KPIs */}
      <div className="slim-row">
        <Kpi value={String(kpis.carteirasAtivas)} label="Carteiras com clientes" tag={`${opcoesAssessor.length} assessores no cadastro`} />
        <div className="slim-div" />
        <Kpi value={String(kpis.total)} label="Clientes no recorte" tag={hasFilter ? 'filtro aplicado' : 'base completa'} />
        <div className="slim-div" />
        <Kpi value={String(kpis.semAssessor)} label="Sem assessor" tag={kpis.total ? `${Math.round((kpis.semAssessor / kpis.total) * 100)}% descoberto` : '—'} tagDown={kpis.semAssessor > 0} />
        <div className="slim-div" />
        <Kpi value={String(kpis.divergentes)} label="Fora da zona" tag="UF x assessor divergem" tagDown={kpis.divergentes > 0} />
        <div className="slim-div" />
        <Kpi value={brlCompact(kpis.vgv).replace('R$', '').trim()} cur="R$" label="VGV da carteira" tag={periodoLabel.toLowerCase()} />
        <div className="slim-div" />
        <Kpi value={kpis.ticket ? brlCompact(kpis.ticket).replace('R$', '').trim() : '—'} cur="R$" label="Ticket médio" tag={`${kpis.compras} arremates`} />
        <div className="slim-div" />
        <Kpi value={String(kpis.habilitados)} label="Habilitados em leiloeira" tag={kpis.total ? `${Math.round((kpis.habilitados / kpis.total) * 100)}% da base` : '—'} />
      </div>

      {/* filtros */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-b" style={{ padding: 14 }}>
          <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }} />
              <input
                className="input" placeholder="Buscar cliente, responsável ou telefone…"
                style={{ paddingLeft: 34 }} value={busca} onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <select className="select lg:w-[120px]" value={fUf} onChange={(e) => setFUf(e.target.value)}>
              <option value="">UF</option>
              {ufs.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <select className="select lg:w-[150px]" value={fRecencia} onChange={(e) => setFRecencia(e.target.value as ClienteRecencia | '')}>
              <option value="">Recência</option>
              {(['ativo', 'atencao', 'risco', 'inativo', 'sem-compra'] as ClienteRecencia[]).map((k) => (
                <option key={k} value={k}>{RECENCIA_META[k].label}</option>
              ))}
            </select>
            <select className="select lg:w-[140px]" value={fReadiness} onChange={(e) => setFReadiness(e.target.value as ClienteReadiness | '')}>
              <option value="">Prontidão</option>
              <option value="apto">Apto</option>
              <option value="pendente">Pendente</option>
              <option value="sem-dados">Sem dados</option>
            </select>
            <select className="select lg:w-[190px]" value={fLeiloeira} onChange={(e) => setFLeiloeira(e.target.value)}>
              <option value="">Habilitado em…</option>
              {casas.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <select className="select lg:w-[170px]" value={fZona} onChange={(e) => setFZona(e.target.value as '' | 'divergente' | 'sem-assessor')}>
              <option value="">Cobertura</option>
              <option value="sem-assessor">Sem assessor</option>
              <option value="divergente">Fora da zona</option>
            </select>
            {hasFilter && <button className="btn ghost shrink-0" onClick={limpar}><X size={14} /> Limpar</button>}
          </div>
          <div className="flex items-center gap-1.5 mt-3 text-[11px]" style={{ color: 'var(--text3)' }}>
            <Filter size={12} />
            <span><b style={{ color: 'var(--text2)' }}>{filtradas.length}</b> de {clientes.length} clientes · período: {periodoLabel.toLowerCase()}</span>
          </div>
        </div>
      </div>

      {/* cards das carteiras */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12, marginBottom: 16 }}>
        {carteiras.map((g) => {
          const ativo = selecionado === g.chave
          const orfa = g.chave === SEM_ASSESSOR
          const cor = orfa ? 'var(--red)' : corDoAssessor(g.chave)
          const vazia = g.clientes === 0
          return (
            <div
              key={g.chave}
              className="card"
              style={{
                cursor: 'pointer',
                borderColor: ativo ? 'var(--gold-dark)' : orfa && !vazia ? 'rgba(192,80,77,0.4)' : undefined,
                opacity: vazia ? 0.6 : 1,
              }}
              onClick={() => setSelecionado(ativo ? null : g.chave)}
            >
              <div className="card-b" style={{ padding: 14 }}>
                <div className="flex items-start gap-2.5">
                  <div
                    className="shrink-0 flex items-center justify-center font-bold text-[12px]"
                    style={{ width: 34, height: 34, borderRadius: 8, color: '#0D0D0D', background: cor }}
                  >
                    {orfa ? <AlertTriangle size={16} /> : g.chave.split(/\s+/).map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold truncate" style={{ color: 'var(--text)' }}>{g.chave}</div>
                    <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
                      {g.clientes} {g.clientes === 1 ? 'cliente' : 'clientes'}
                      {g.clientesComCompra > 0 && ` · ${g.clientesComCompra} com compra no período`}
                    </div>
                  </div>
                  <ChevronRight size={15} className="shrink-0" style={{ color: ativo ? 'var(--gold)' : 'var(--text4)' }} />
                </div>

                <div className="mt-3">
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="text-[15px] font-extrabold" style={{ color: g.vgv ? 'var(--text)' : 'var(--text3)' }}>
                      {g.vgv ? brlCompact(g.vgv) : '—'}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--text3)' }}>{Math.round(g.share * 100)}% do VGV</span>
                  </div>
                  <Barra pct={g.vgv / maxVgv} cor={orfa ? 'var(--red)' : undefined} />
                </div>

                <div className="grid grid-cols-3 gap-1.5 mt-3">
                  {[
                    { l: 'Ticket', v: g.ticket ? brlCompact(g.ticket) : '—' },
                    { l: 'Recorrentes', v: String(g.recorrentes) },
                    { l: 'Habilitados', v: String(g.habilitados) },
                  ].map((s) => (
                    <div key={s.l} className="text-center py-1.5 rounded-lg" style={{ background: 'var(--s2)', border: '1px solid var(--border)' }}>
                      <div className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>{s.v}</div>
                      <div className="text-[9px]" style={{ color: 'var(--text3)' }}>{s.l}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-3">
                  <BarraRecencia recencia={g.recencia} total={g.clientes} />
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] flex-wrap" style={{ color: 'var(--text3)' }}>
                    <span style={{ color: 'var(--olive)' }}>● {g.recencia.ativo} ativos</span>
                    <span style={{ color: 'var(--amber)' }}>● {g.recencia.atencao} atenção</span>
                    <span style={{ color: 'var(--red)' }}>● {g.recencia.risco} risco</span>
                    <span>● {g.recencia.inativo} inativos</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ação de cobertura */}
      {sugeridosPorZona.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(212,168,67,0.35)' }}>
          <div className="card-b flex items-center justify-between gap-3 flex-wrap" style={{ padding: 14 }}>
            <div className="flex items-start gap-2.5 min-w-0">
              <Wand2 size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--amber)' }} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                  {sugeridosPorZona.length} cliente(s) sem assessor têm UF conhecida
                </div>
                <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text3)' }}>
                  A regra de zona (Douglas = Norte + MA · Fábio = NE − MA + Sudeste · Leonardo = CO + Sul) resolve todos eles.
                </div>
              </div>
            </div>
            <button className="btn primary shrink-0" onClick={aplicarZonaEmLote} disabled={aplicandoZona}>
              {aplicandoZona ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              {aplicandoZona ? `Atribuindo… ${progressoZona}/${sugeridosPorZona.length}` : 'Atribuir pela zona'}
            </button>
          </div>
        </div>
      )}

      {/* tabela da carteira */}
      <div className="card card-p0">
        <div className="card-h flex items-center justify-between gap-2 flex-wrap">
          <div className="card-t flex items-center gap-2">
            <Users size={15} style={{ color: 'var(--gold)' }} />
            {selecionado ? `Carteira de ${selecionado}` : 'Todos os clientes do recorte'}
            <span className="text-[11px] font-normal" style={{ color: 'var(--text3)' }}>({daCarteira.length})</span>
          </div>
          {selecionado && (
            <button className="btn ghost" style={{ height: 30, fontSize: 12 }} onClick={() => setSelecionado(null)}>
              <X size={13} /> Ver todos
            </button>
          )}
        </div>
        <div className="card-b" style={{ padding: 0, overflowX: 'auto' }}>
          {daCarteira.length === 0 ? (
            <div className="text-center py-12 text-[13px]" style={{ color: 'var(--text3)' }}>
              Nenhum cliente nesse recorte.
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Cidade / UF</th>
                  <th>Cobertura</th>
                  <th style={{ textAlign: 'right' }}>VGV no período</th>
                  <th>Última compra</th>
                  <th>Recência</th>
                  <th>Prontidão</th>
                  <th>Habilitado em</th>
                  <th>Assessor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {paged.map(({ c, r }) => {
                  const z = zonaDoCliente(c)
                  const rec = clienteRecencia(c)
                  const rd = clienteReadiness(c)
                  const atual = nomeAssessorExibicao(c.assessor)
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <a
                                href={clienteHref(c.nome)}
                                className="text-[13px] font-semibold truncate hover:underline"
                                style={{ color: 'var(--text)', maxWidth: 220 }}
                                title={c.nome}
                              >
                                {c.nome}
                              </a>
                              {c.telefone && (
                                <a href={waLink(c.telefone)} target="_blank" rel="noopener noreferrer" title="WhatsApp" style={{ color: 'var(--olive)' }}>
                                  <MessageCircle size={12} />
                                </a>
                              )}
                            </div>
                            <div className="text-[11px] truncate" style={{ color: 'var(--text3)', maxWidth: 220 }}>{c.responsavel}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text2)' }}>
                        <span className="inline-flex items-center gap-1"><MapPin size={11} style={{ color: 'var(--text4)' }} />{c.cidade} / {c.uf}</span>
                      </td>
                      <td>
                        <Badge tone={COERENCIA_META[z.coerencia].tone}>{COERENCIA_META[z.coerencia].label}</Badge>
                        {z.coerencia === 'divergente' && z.esperado && (
                          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>zona: {z.esperado}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="font-bold" style={{ color: r.vgv ? 'var(--text)' : 'var(--text3)' }}>{r.vgv ? brl(r.vgv) : '—'}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{r.compras} {r.compras === 1 ? 'arremate' : 'arremates'}</div>
                      </td>
                      <td style={{ color: 'var(--text2)' }}>
                        {r.ultimaCompra ? (
                          <>
                            <div>{fmtDate(r.ultimaCompra)}</div>
                            <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{timeAgo(r.ultimaCompra)}</div>
                          </>
                        ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td><Badge tone={RECENCIA_META[rec].tone}>{RECENCIA_META[rec].label}</Badge></td>
                      <td><Badge tone={READINESS_META[rd].tone}>{READINESS_META[rd].label}</Badge></td>
                      <td><LeiloeirasChips cliente={c} /></td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <select
                            className="select"
                            style={{ height: 30, fontSize: 12, minWidth: 150 }}
                            value={atual === SEM_ASSESSOR ? '' : atual}
                            disabled={salvando === c.id || !c.matchKey}
                            onChange={(e) => atribuir(c, e.target.value)}
                          >
                            <option value="">— sem assessor —</option>
                            {opcoesAssessor.map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                          {salvando === c.id && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--gold)' }} />}
                          {z.coerencia === 'sem-assessor' && z.esperado && salvando !== c.id && (
                            <button
                              className="btn ghost"
                              style={{ height: 30, padding: '0 8px', fontSize: 11, color: 'var(--gold)' }}
                              title={`Atribuir a ${z.esperado} pela UF ${c.uf}`}
                              onClick={() => atribuir(c, z.esperado as string)}
                            >
                              <Check size={12} /> {z.esperado.split(' ')[0]}
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <a href={clienteHref(c.nome)} title="Abrir no módulo Clientes" style={{ color: 'var(--text4)' }}>
                          <ExternalLink size={14} />
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {daCarteira.length > pageSize && (
        <div style={{ marginTop: 12 }}>
          <Pagination
            page={page} pageSize={pageSize} total={daCarteira.length}
            onPage={setPage} onPageSize={setPageSize} label="clientes"
          />
        </div>
      )}

      {/* legenda */}
      <div className="flex items-center gap-3 mt-4 text-[11px] flex-wrap" style={{ color: 'var(--text3)' }}>
        <span className="inline-flex items-center gap-1"><ShieldCheck size={12} /> Habilitado = cadastro aprovado na leiloeira</span>
        <span>·</span>
        <span>Recência: ativo &lt; 6m · atenção 6–12m · risco 12–24m · inativo &gt; 24m</span>
        <span>·</span>
        <span>VGV e arremates seguem o período selecionado; a carteira, não.</span>
      </div>

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-lg text-[13px] shadow-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--gold-dark)', color: 'var(--text)' }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
