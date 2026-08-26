'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RELATÓRIOS DE CLIENTES — a base de compradores lida por vários ângulos.
//
// Um filtro só, no topo, vale para todas as abas: o recorte que você monta em
// "Visão geral" é o mesmo que sai em "Assessores", "Geografia" e no XLSX. Isso
// evita o vício clássico de relatório em planilha — cada aba com um recorte
// diferente e ninguém sabendo qual número citar na reunião.
//
// Convenções (iguais às da Carteira, de propósito):
//   • o período recorta as COMPRAS; a base de clientes segue inteira, porque
//     "quantos clientes temos" e "quanto eles compraram no ano" são perguntas
//     diferentes e as duas precisam ser respondidas na mesma tela;
//   • "habilitado" = cadastro aprovado na leiloeira;
//   • VGV aqui é o atribuído a compradores. O total dos leilões (que inclui o
//     não atribuído) mora na página Clientes, no KPI de cobertura.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from 'react'
import {
  BarChart3, Search, X, Filter, Download, Users, Gavel, MapPin, TrendingUp,
  IdCard, CalendarRange, Trophy, ExternalLink, Loader2, Contact, UserCheck,
} from 'lucide-react'
import {
  type Cliente, type ClienteRecencia, type ClienteReadiness, type PerfilConsumo,
  type FaixaTicket,
  brl, brlCompact, fmtDate, timeAgo, clienteRecencia, clienteReadiness, faixaTicket,
  RECENCIA_META, READINESS_META, FAIXA_TICKET_META, FAIXAS_TICKET, PERFIS,
  leiloeirasHabilitadas, nomesHabilitadas, SEM_ASSESSOR,
} from '@/lib/clientes'
import { CADASTRO_STATUS_META, type CadastroStatus } from '@/lib/leiloeiras'
import {
  type PeriodoKey, type ResumoCliente, type GrupoCarteira,
  PERIODOS, janelaDoPeriodo, resumoNoPeriodo, nomeAssessorExibicao,
  agrupar, serieMensal, rotuloMes, resumoProntidao,
} from '@/lib/clientes-carteira'

type Linha = { c: Cliente; r: ResumoCliente }
type Aba = 'visao' | 'assessores' | 'geografia' | 'leiloeiras' | 'cadastro' | 'evolucao'

const ABAS: { id: Aba; label: string; icon: typeof Users }[] = [
  { id: 'visao', label: 'Visão geral', icon: BarChart3 },
  { id: 'assessores', label: 'Assessores', icon: UserCheck },
  { id: 'geografia', label: 'Geografia', icon: MapPin },
  { id: 'leiloeiras', label: 'Leiloeiras', icon: Gavel },
  { id: 'cadastro', label: 'Cadastro & habilitação', icon: IdCard },
  { id: 'evolucao', label: 'Evolução', icon: CalendarRange },
]

// Região por UF — agrupa o mapa comercial do mesmo jeito que a divisão de zona.
const REGIAO_POR_UF: Record<string, string> = {
  AC: 'Norte', AM: 'Norte', AP: 'Norte', PA: 'Norte', RO: 'Norte', RR: 'Norte', TO: 'Norte',
  AL: 'Nordeste', BA: 'Nordeste', CE: 'Nordeste', MA: 'Nordeste', PB: 'Nordeste',
  PE: 'Nordeste', PI: 'Nordeste', RN: 'Nordeste', SE: 'Nordeste',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MS: 'Centro-Oeste', MT: 'Centro-Oeste',
  ES: 'Sudeste', MG: 'Sudeste', RJ: 'Sudeste', SP: 'Sudeste',
  PR: 'Sul', RS: 'Sul', SC: 'Sul',
}
const regiaoDe = (uf: string) => REGIAO_POR_UF[String(uf ?? '').toUpperCase()] ?? 'Não informado'

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

function Barra({ pct, cor }: { pct: number; cor?: string }) {
  return (
    <div style={{ height: 5, borderRadius: 999, background: 'var(--s3)', overflow: 'hidden', minWidth: 60 }}>
      <div style={{ width: `${Math.max(2, Math.min(100, pct * 100))}%`, height: '100%', borderRadius: 999, background: cor || 'linear-gradient(90deg, #A68B4B, #C8A96E)' }} />
    </div>
  )
}

/** Tabela de ranking compartilhada por Assessores / Geografia / Leiloeiras. */
function RankTable({ titulo, subtitulo, rotulo, grupos, totalClientes }: {
  titulo: string
  subtitulo?: string
  rotulo: string
  grupos: GrupoCarteira[]
  totalClientes: number
}) {
  const maxVgv = Math.max(1, ...grupos.map((g) => g.vgv))
  return (
    <div className="card card-p0">
      <div className="card-h">
        <div className="card-t flex items-center gap-2"><Trophy size={15} style={{ color: 'var(--gold)' }} />{titulo}</div>
        {subtitulo && <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>{subtitulo}</div>}
      </div>
      <div className="card-b" style={{ padding: 0, overflowX: 'auto' }}>
        {grupos.length === 0 ? (
          <div className="text-center py-10 text-[13px]" style={{ color: 'var(--text3)' }}>Nada nesse recorte.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>{rotulo}</th>
                <th style={{ textAlign: 'right' }}>Clientes</th>
                <th style={{ textAlign: 'right' }}>Compraram</th>
                <th style={{ textAlign: 'right' }}>VGV</th>
                <th style={{ width: 130 }}>Participação</th>
                <th style={{ textAlign: 'right' }}>Ticket</th>
                <th style={{ textAlign: 'right' }}>Recorrentes</th>
                <th style={{ textAlign: 'right' }}>Aptos</th>
                <th style={{ textAlign: 'right' }}>Habilitados</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g, i) => (
                <tr key={g.chave}>
                  <td style={{ color: 'var(--text4)' }}>{i + 1}</td>
                  <td>
                    <span className="text-[13px] font-semibold" style={{ color: g.chave === SEM_ASSESSOR ? 'var(--red)' : 'var(--text)' }}>{g.chave}</span>
                    {totalClientes > 0 && (
                      <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
                        {Math.round((g.clientes / totalClientes) * 100)}% da base
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{g.clientes}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{g.clientesComCompra}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="font-bold" style={{ color: g.vgv ? 'var(--text)' : 'var(--text3)' }}>{g.vgv ? brl(g.vgv) : '—'}</span>
                  </td>
                  <td>
                    <Barra pct={g.vgv / maxVgv} />
                    <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>{(g.share * 100).toFixed(1)}%</div>
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{g.ticket ? brlCompact(g.ticket) : '—'}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{g.recorrentes}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{g.aptos}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{g.habilitados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/** Distribuição simples (contagem + barra) para perfis, faixas e recência. */
function Distribuicao({ titulo, itens }: { titulo: string; itens: { label: string; n: number; tone?: string; hint?: string }[] }) {
  const total = itens.reduce((s, i) => s + i.n, 0)
  const max = Math.max(1, ...itens.map((i) => i.n))
  return (
    <div className="card">
      <div className="card-h"><div className="card-t">{titulo}</div></div>
      <div className="card-b" style={{ padding: 14 }}>
        <div className="space-y-2.5">
          {itens.map((i) => (
            <div key={i.label}>
              <div className="flex items-baseline justify-between gap-2 text-[12px] mb-1">
                <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text2)' }}>
                  {i.tone !== undefined ? <Badge tone={i.tone}>{i.label}</Badge> : i.label}
                  {i.hint && <span className="text-[10px]" style={{ color: 'var(--text4)' }}>{i.hint}</span>}
                </span>
                <span style={{ color: 'var(--text3)' }}>
                  <b style={{ color: 'var(--text)' }}>{i.n}</b> {total ? `· ${Math.round((i.n / total) * 100)}%` : ''}
                </span>
              </div>
              <Barra pct={i.n / max} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ClientesRelatoriosClient({ initialClientes }: { initialClientes: Cliente[] }) {
  const clientes = initialClientes
  const [aba, setAba] = useState<Aba>('visao')
  const [periodo, setPeriodo] = useState<PeriodoKey>('12m')
  const [busca, setBusca] = useState('')
  const [fAssessor, setFAssessor] = useState('')
  const [fUf, setFUf] = useState('')
  const [fPerfil, setFPerfil] = useState<'' | PerfilConsumo>('')
  const [fRecencia, setFRecencia] = useState<'' | ClienteRecencia>('')
  const [fReadiness, setFReadiness] = useState<'' | ClienteReadiness>('')
  const [fLeiloeira, setFLeiloeira] = useState('')
  const [fFaixa, setFFaixa] = useState<'' | FaixaTicket>('')
  const [exportando, setExportando] = useState(false)

  const { de, ate } = useMemo(() => janelaDoPeriodo(periodo), [periodo])
  const periodoLabel = PERIODOS.find((p) => p.key === periodo)?.label ?? ''

  const base: Linha[] = useMemo(
    () => clientes.map((c) => ({ c, r: resumoNoPeriodo(c, de, ate) })),
    [clientes, de, ate],
  )

  const assessores = useMemo(
    () => [...new Set(clientes.map((c) => nomeAssessorExibicao(c.assessor)))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [clientes],
  )
  const ufs = useMemo(
    () => [...new Set(clientes.map((c) => c.uf).filter((u) => u && u !== '—'))].sort(),
    [clientes],
  )
  const casas = useMemo(() => {
    const set = new Set<string>()
    for (const c of clientes) for (const l of c.leiloeiras ?? []) set.add(l.nome)
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [clientes])

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return base.filter(({ c, r }) => {
      if (q && !c.nome.toLowerCase().includes(q) && !c.responsavel.toLowerCase().includes(q)) return false
      if (fAssessor && nomeAssessorExibicao(c.assessor) !== fAssessor) return false
      if (fUf && c.uf !== fUf) return false
      if (fPerfil && c.perfil !== fPerfil) return false
      if (fRecencia && clienteRecencia(c) !== fRecencia) return false
      if (fReadiness && clienteReadiness(c) !== fReadiness) return false
      if (fLeiloeira && !nomesHabilitadas(c).includes(fLeiloeira)) return false
      if (fFaixa && faixaTicket(r.vgv, r.ativoNoPeriodo) !== fFaixa) return false
      return true
    })
  }, [base, busca, fAssessor, fUf, fPerfil, fRecencia, fReadiness, fLeiloeira, fFaixa])

  const hasFilter = !!(busca || fAssessor || fUf || fPerfil || fRecencia || fReadiness || fLeiloeira || fFaixa)
  const limpar = () => {
    setBusca(''); setFAssessor(''); setFUf(''); setFPerfil(''); setFRecencia('')
    setFReadiness(''); setFLeiloeira(''); setFFaixa('')
  }

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = linhas.length
    const vgv = linhas.reduce((s, { r }) => s + r.vgv, 0)
    const compras = linhas.reduce((s, { r }) => s + r.compras, 0)
    const animais = linhas.reduce((s, { r }) => s + r.animais, 0)
    const compraram = linhas.filter(({ r }) => r.ativoNoPeriodo).length
    const recorrentes = linhas.filter(({ c }) => c.recorrente).length
    const habilitados = linhas.filter(({ c }) => leiloeirasHabilitadas(c).length > 0).length
    // "Novo no período": a primeira compra de todos os tempos caiu na janela.
    const novos = linhas.filter(({ c, r }) => {
      const primeiraGeral = c.compras.map((x) => x.data).filter(Boolean).sort()[0]
      return !!primeiraGeral && !!r.primeiraCompra && primeiraGeral === r.primeiraCompra && r.ativoNoPeriodo
    }).length
    return {
      total, vgv, compras, animais, compraram, recorrentes, habilitados, novos,
      ticket: compras ? Math.round(vgv / compras) : 0,
      vgvPorCliente: compraram ? Math.round(vgv / compraram) : 0,
    }
  }, [linhas])

  // ── agrupamentos ────────────────────────────────────────────────────────────
  const porAssessor = useMemo(() => agrupar(linhas, (c) => [nomeAssessorExibicao(c.assessor)]), [linhas])
  const porUf = useMemo(() => agrupar(linhas, (c) => [c.uf && c.uf !== '—' ? c.uf : 'Não informado']), [linhas])
  const porRegiao = useMemo(() => agrupar(linhas, (c) => [regiaoDe(c.uf)]), [linhas])
  const porPerfil = useMemo(() => agrupar(linhas, (c) => [c.perfil]), [linhas])
  // Leiloeira: o cliente conta em CADA casa em que está habilitado (a soma das
  // linhas passa do total de clientes de propósito — é cobertura, não partição).
  const porLeiloeira = useMemo(
    () => agrupar(linhas, (c) => {
      const nomes = nomesHabilitadas(c)
      return nomes.length ? nomes : ['(sem habilitação)']
    }),
    [linhas],
  )

  const serie = useMemo(() => serieMensal(linhas, de, ate), [linhas, de, ate])
  const prontidao = useMemo(() => resumoProntidao(linhas.map(({ c }) => c)), [linhas])

  // Funil de habilitação por status (contando vínculos, não clientes).
  const funilLeiloeiras = useMemo(() => {
    const cont: Record<CadastroStatus, number> = { pendente: 0, enviado: 0, aprovado: 0, recusado: 0 }
    for (const { c } of linhas) for (const l of c.leiloeiras ?? []) cont[l.status] += 1
    return cont
  }, [linhas])

  const topClientes = useMemo(
    () => [...linhas].sort((a, b) => b.r.vgv - a.r.vgv).slice(0, 15),
    [linhas],
  )

  const distRecencia = useMemo(() => {
    const cont: Record<ClienteRecencia, number> = { ativo: 0, atencao: 0, risco: 0, inativo: 0, 'sem-compra': 0 }
    for (const { c } of linhas) cont[clienteRecencia(c)] += 1
    return (['ativo', 'atencao', 'risco', 'inativo', 'sem-compra'] as ClienteRecencia[])
      .map((k) => ({ label: RECENCIA_META[k].label, n: cont[k], tone: RECENCIA_META[k].tone, hint: RECENCIA_META[k].hint }))
  }, [linhas])

  const distFaixa = useMemo(() => {
    const cont = new Map<FaixaTicket, number>()
    for (const { r } of linhas) {
      const f = faixaTicket(r.vgv, r.ativoNoPeriodo)
      cont.set(f, (cont.get(f) ?? 0) + 1)
    }
    return FAIXAS_TICKET.map((f) => ({ label: FAIXA_TICKET_META[f].label, n: cont.get(f) ?? 0, tone: FAIXA_TICKET_META[f].tone }))
  }, [linhas])

  // ── export ──────────────────────────────────────────────────────────────────
  const exportarXLSX = useCallback(async () => {
    setExportando(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const gruposToRows = (gs: GrupoCarteira[], rotulo: string) => gs.map((g) => ({
        [rotulo]: g.chave, Clientes: g.clientes, 'Compraram no período': g.clientesComCompra,
        VGV: g.vgv, 'Participação %': Number((g.share * 100).toFixed(2)), Ticket: g.ticket,
        Arremates: g.compras, Animais: g.animais, Recorrentes: g.recorrentes,
        'Aptos p/ cadastro': g.aptos, 'Habilitados em leiloeira': g.habilitados,
        'Sem telefone': g.semTelefone, 'Sem CPF': g.semCpf,
        Ativos: g.recencia.ativo, Atenção: g.recencia.atencao, Risco: g.recencia.risco,
        Inativos: g.recencia.inativo, 'Sem compra': g.recencia['sem-compra'],
      }))

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
        'Período': periodoLabel,
        'Gerado em': new Date().toISOString().slice(0, 10),
        'Filtros': hasFilter ? [fAssessor, fUf, fPerfil, fRecencia, fReadiness, fLeiloeira, fFaixa, busca].filter(Boolean).join(' · ') : 'nenhum',
        'Clientes no recorte': kpis.total,
        'Compraram no período': kpis.compraram,
        'VGV atribuído': kpis.vgv,
        'Arremates': kpis.compras,
        'Ticket médio': kpis.ticket,
        'Recorrentes': kpis.recorrentes,
        'Novos no período': kpis.novos,
        'Habilitados em leiloeira': kpis.habilitados,
      }]), 'Resumo')

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gruposToRows(porAssessor, 'Assessor')), 'Assessores')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gruposToRows(porUf, 'UF')), 'UF')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gruposToRows(porRegiao, 'Região')), 'Regiao')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gruposToRows(porLeiloeira, 'Leiloeira')), 'Leiloeiras')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gruposToRows(porPerfil, 'Perfil')), 'Perfil')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        serie.map((p) => ({ Mês: p.mes, VGV: p.vgv, Arremates: p.compras, 'Clientes compradores': p.clientes, 'Clientes novos': p.novos })),
      ), 'Evolucao')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        linhas.map(({ c, r }) => ({
          Cliente: c.nome, Responsável: c.responsavel, Assessor: nomeAssessorExibicao(c.assessor),
          Telefone: c.telefone, Cidade: c.cidade, UF: c.uf, Região: regiaoDe(c.uf), Perfil: c.perfil,
          'VGV no período': r.vgv, 'Arremates no período': r.compras, 'Ticket no período': r.ticket,
          'Última compra': r.ultimaCompra ?? '', Recência: RECENCIA_META[clienteRecencia(c)].label,
          Prontidão: READINESS_META[clienteReadiness(c)].label,
          CPF: c.cpf ?? '', 'Inscrição Estadual': c.inscricaoEstadual ?? '',
          'Score': c.scoreCredito ?? '', Documentos: c.docsCount ?? 0,
          'Leiloeiras habilitadas': nomesHabilitadas(c).join(' | '),
        })),
      ), 'Clientes')

      XLSX.writeFile(wb, `relatorio-clientes-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } finally {
      setExportando(false)
    }
  }, [
    porAssessor, porUf, porRegiao, porLeiloeira, porPerfil, serie, linhas, kpis,
    periodoLabel, hasFilter, fAssessor, fUf, fPerfil, fRecencia, fReadiness, fLeiloeira, fFaixa, busca,
  ])

  const maxSerie = Math.max(1, ...serie.map((p) => p.vgv))

  return (
    <div>
      {/* header */}
      <div className="page-head">
        <div>
          <h1 className="flex items-center gap-2.5">
            <BarChart3 size={22} style={{ color: 'var(--gold)' }} />
            Relatórios de Clientes
          </h1>
          <p className="sub">Base de compradores consolidada · por assessor, geografia, leiloeira, cadastro e tempo</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="select" style={{ width: 190 }} value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoKey)}>
            {PERIODOS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <button className="btn primary" onClick={exportarXLSX} disabled={exportando}>
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exportando ? 'Gerando…' : 'Exportar .xlsx'}
          </button>
          <a className="btn" href="/sistema/clientes"><Contact size={14} /> Clientes</a>
          <a className="btn" href="/sistema/clientes/carteira"><UserCheck size={14} /> Carteira</a>
        </div>
      </div>

      {/* KPIs */}
      <div className="slim-row">
        <Kpi value={String(kpis.total)} label="Clientes no recorte" tag={hasFilter ? 'filtro aplicado' : 'base completa'} />
        <div className="slim-div" />
        <Kpi value={String(kpis.compraram)} label="Compraram no período" tag={kpis.total ? `${Math.round((kpis.compraram / kpis.total) * 100)}% da base` : '—'} />
        <div className="slim-div" />
        <Kpi value={brlCompact(kpis.vgv).replace('R$', '').trim()} cur="R$" label="VGV atribuído" tag={periodoLabel.toLowerCase()} />
        <div className="slim-div" />
        <Kpi value={kpis.ticket ? brlCompact(kpis.ticket).replace('R$', '').trim() : '—'} cur="R$" label="Ticket por arremate" tag={`${kpis.compras} arremates`} />
        <div className="slim-div" />
        <Kpi value={kpis.vgvPorCliente ? brlCompact(kpis.vgvPorCliente).replace('R$', '').trim() : '—'} cur="R$" label="VGV por comprador" tag="quem comprou no período" />
        <div className="slim-div" />
        <Kpi value={String(kpis.novos)} label="Compradores novos" tag="1ª compra na janela" />
        <div className="slim-div" />
        <Kpi value={String(kpis.habilitados)} label="Habilitados em leiloeira" tag={kpis.total ? `${Math.round((kpis.habilitados / kpis.total) * 100)}% da base` : '—'} />
      </div>

      {/* filtros */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-b" style={{ padding: 14 }}>
          <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }} />
              <input className="input" placeholder="Buscar cliente ou responsável…" style={{ paddingLeft: 34 }} value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <select className="select lg:w-[170px]" value={fAssessor} onChange={(e) => setFAssessor(e.target.value)}>
              <option value="">Todos os assessores</option>
              {assessores.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="select lg:w-[110px]" value={fUf} onChange={(e) => setFUf(e.target.value)}>
              <option value="">UF</option>
              {ufs.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <select className="select lg:w-[140px]" value={fPerfil} onChange={(e) => setFPerfil(e.target.value as PerfilConsumo | '')}>
              <option value="">Perfil</option>
              {PERFIS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="select lg:w-[150px]" value={fRecencia} onChange={(e) => setFRecencia(e.target.value as ClienteRecencia | '')}>
              <option value="">Recência</option>
              {(['ativo', 'atencao', 'risco', 'inativo', 'sem-compra'] as ClienteRecencia[]).map((k) => (
                <option key={k} value={k}>{RECENCIA_META[k].label}</option>
              ))}
            </select>
            <select className="select lg:w-[170px]" value={fFaixa} onChange={(e) => setFFaixa(e.target.value as FaixaTicket | '')}>
              <option value="">Faixa de compra</option>
              {FAIXAS_TICKET.map((f) => <option key={f} value={f}>{FAIXA_TICKET_META[f].label}</option>)}
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
            {hasFilter && <button className="btn ghost shrink-0" onClick={limpar}><X size={14} /> Limpar</button>}
          </div>
          <div className="flex items-center gap-1.5 mt-3 text-[11px]" style={{ color: 'var(--text3)' }}>
            <Filter size={12} />
            <span><b style={{ color: 'var(--text2)' }}>{linhas.length}</b> de {clientes.length} clientes · o recorte vale para todas as abas e para o .xlsx</span>
          </div>
        </div>
      </div>

      {/* abas */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {ABAS.map((t) => {
          const ativo = aba === t.id
          return (
            <button
              key={t.id}
              onClick={() => setAba(t.id)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12.5px] font-semibold transition-colors"
              style={{
                color: ativo ? 'var(--gold)' : 'var(--text2)',
                background: ativo ? 'var(--gold-dim)' : 'transparent',
                border: `1px solid ${ativo ? 'var(--gold-dark)' : 'var(--border2)'}`,
              }}
            >
              <t.icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ── VISÃO GERAL ── */}
      {aba === 'visao' && (
        <div className="space-y-4">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 }}>
            <Distribuicao titulo="Recência de compra" itens={distRecencia} />
            <Distribuicao titulo="Faixa de compra no período" itens={distFaixa} />
            <Distribuicao
              titulo="Perfil de consumo"
              itens={PERFIS.map((p) => ({ label: p, n: linhas.filter(({ c }) => c.perfil === p).length }))}
            />
          </div>

          <div className="card card-p0">
            <div className="card-h">
              <div className="card-t flex items-center gap-2"><Trophy size={15} style={{ color: 'var(--gold)' }} />Maiores compradores do período</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>Top 15 por VGV atribuído · {periodoLabel.toLowerCase()}</div>
            </div>
            <div className="card-b" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th>Cliente</th>
                    <th>Assessor</th>
                    <th>Cidade / UF</th>
                    <th style={{ textAlign: 'right' }}>VGV</th>
                    <th style={{ textAlign: 'right' }}>Arremates</th>
                    <th>Última compra</th>
                    <th>Habilitado em</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {topClientes.map(({ c, r }, i) => (
                    <tr key={c.id}>
                      <td style={{ color: 'var(--text4)' }}>{i + 1}</td>
                      <td>
                        <a href={clienteHref(c.nome)} className="text-[13px] font-semibold hover:underline" style={{ color: 'var(--text)' }}>{c.nome}</a>
                        <div className="text-[11px]" style={{ color: 'var(--text3)' }}>{c.responsavel}</div>
                      </td>
                      <td style={{ color: nomeAssessorExibicao(c.assessor) === SEM_ASSESSOR ? 'var(--red)' : 'var(--text2)' }}>
                        {nomeAssessorExibicao(c.assessor)}
                      </td>
                      <td style={{ color: 'var(--text2)' }}>{c.cidade} / {c.uf}</td>
                      <td style={{ textAlign: 'right' }}><b style={{ color: 'var(--text)' }}>{r.vgv ? brl(r.vgv) : '—'}</b></td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{r.compras}</td>
                      <td style={{ color: 'var(--text2)' }}>
                        {r.ultimaCompra ? <>{fmtDate(r.ultimaCompra)} <span className="text-[10px]" style={{ color: 'var(--text3)' }}>· {timeAgo(r.ultimaCompra)}</span></> : '—'}
                      </td>
                      <td>
                        {leiloeirasHabilitadas(c).length
                          ? <span title={nomesHabilitadas(c).join(' · ')}><Badge tone="olive"><Gavel size={9} />{leiloeirasHabilitadas(c).length}</Badge></span>
                          : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td><a href={clienteHref(c.nome)} style={{ color: 'var(--text4)' }}><ExternalLink size={14} /></a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── ASSESSORES ── */}
      {aba === 'assessores' && (
        <RankTable
          titulo="Carteira por assessor"
          subtitulo={`VGV e composição da base · ${periodoLabel.toLowerCase()}. Clientes sem vínculo aparecem como "${SEM_ASSESSOR}".`}
          rotulo="Assessor"
          grupos={porAssessor}
          totalClientes={linhas.length}
        />
      )}

      {/* ── GEOGRAFIA ── */}
      {aba === 'geografia' && (
        <div className="space-y-4">
          <RankTable titulo="Por região" rotulo="Região" grupos={porRegiao} totalClientes={linhas.length} />
          <RankTable titulo="Por estado" rotulo="UF" grupos={porUf} totalClientes={linhas.length} />
        </div>
      )}

      {/* ── LEILOEIRAS ── */}
      {aba === 'leiloeiras' && (
        <div className="space-y-4">
          <div className="card">
            <div className="card-h"><div className="card-t flex items-center gap-2"><Gavel size={15} style={{ color: 'var(--gold)' }} />Funil de habilitação</div></div>
            <div className="card-b" style={{ padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
                {(['pendente', 'enviado', 'aprovado', 'recusado'] as CadastroStatus[]).map((st) => (
                  <div key={st} className="text-center py-3 rounded-lg" style={{ background: 'var(--s2)', border: '1px solid var(--border)' }}>
                    <div className="text-[19px] font-extrabold" style={{ color: 'var(--text)' }}>{funilLeiloeiras[st]}</div>
                    <div className="mt-1"><Badge tone={CADASTRO_STATUS_META[st].tone}>{CADASTRO_STATUS_META[st].label}</Badge></div>
                  </div>
                ))}
                <div className="text-center py-3 rounded-lg" style={{ background: 'var(--s2)', border: '1px solid var(--border)' }}>
                  <div className="text-[19px] font-extrabold" style={{ color: 'var(--text)' }}>{prontidao.semNenhumVinculo}</div>
                  <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>clientes sem nenhum vínculo</div>
                </div>
              </div>
              <p className="text-[11px] mt-3" style={{ color: 'var(--text3)' }}>
                Cada número conta VÍNCULOS cliente × leiloeira, não clientes — o mesmo comprador pode estar aprovado numa casa
                e pendente em outra. Só <b>aprovado</b> habilita o lance.
              </p>
            </div>
          </div>
          <RankTable
            titulo="Base habilitada por leiloeira"
            subtitulo="Um cliente conta em cada casa em que está aprovado — a soma passa do total da base de propósito (é cobertura, não divisão)."
            rotulo="Leiloeira"
            grupos={porLeiloeira}
            totalClientes={linhas.length}
          />
        </div>
      )}

      {/* ── CADASTRO ── */}
      {aba === 'cadastro' && (
        <div className="space-y-4">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 }}>
            <Distribuicao
              titulo="Prontidão para cadastro"
              itens={(['apto', 'pendente', 'sem-dados'] as ClienteReadiness[]).map((k) => ({
                label: READINESS_META[k].label, n: prontidao.porReadiness[k], tone: READINESS_META[k].tone,
              }))}
            />
            <Distribuicao
              titulo="Completude dos dados"
              itens={[
                { label: 'Com CPF', n: prontidao.comCpf },
                { label: 'Com Inscrição Estadual', n: prontidao.comIe },
                { label: 'Com score de crédito', n: prontidao.comScore },
                { label: 'Com documento anexado', n: prontidao.comDocs },
              ]}
            />
            <Distribuicao
              titulo="Situação nas leiloeiras"
              itens={[
                { label: 'Habilitados', n: prontidao.habilitados, tone: 'olive' },
                { label: 'Em análise', n: prontidao.emAnalise, tone: 'amber' },
                { label: 'Sem vínculo', n: prontidao.semNenhumVinculo, tone: '' },
              ]}
            />
          </div>
          <div className="card">
            <div className="card-b" style={{ padding: 14 }}>
              <p className="text-[12px]" style={{ color: 'var(--text2)' }}>
                <b>Apto</b> = score razoável ou melhor <i>e</i> Inscrição Estadual declarada — é o critério que a submissão
                automática usa antes de mandar a ficha para a leiloeira. Cliente apto que ainda não tem vínculo em nenhuma casa
                é dinheiro parado: o cadastro sai pela aba <i>Leiloeiras</i> da ficha do cliente.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── EVOLUÇÃO ── */}
      {aba === 'evolucao' && (
        <div className="space-y-4">
          <div className="card">
            <div className="card-h">
              <div className="card-t flex items-center gap-2"><TrendingUp size={15} style={{ color: 'var(--gold)' }} />VGV arrematado por mês</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>{periodoLabel} · {serie.length} {serie.length === 1 ? 'mês' : 'meses'} com movimento</div>
            </div>
            <div className="card-b" style={{ padding: 14 }}>
              {serie.length === 0 ? (
                <div className="text-center py-8 text-[13px]" style={{ color: 'var(--text3)' }}>Sem arremates nesse recorte.</div>
              ) : (
                <div className="flex items-end gap-1" style={{ height: 160 }}>
                  {serie.map((p) => (
                    <div key={p.mes} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${rotuloMes(p.mes)}: ${brl(p.vgv)} · ${p.compras} arremates · ${p.clientes} compradores (${p.novos} novos)`}>
                      <div
                        className="w-full rounded-t-[3px]"
                        style={{ height: `${Math.max(2, (p.vgv / maxSerie) * 100)}%`, background: 'linear-gradient(180deg, #C8A96E, #A68B4B)' }}
                      />
                      <span className="text-[9px] whitespace-nowrap" style={{ color: 'var(--text3)' }}>{rotuloMes(p.mes)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card card-p0">
            <div className="card-h"><div className="card-t">Detalhe mensal</div></div>
            <div className="card-b" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th style={{ textAlign: 'right' }}>VGV</th>
                    <th style={{ textAlign: 'right' }}>Arremates</th>
                    <th style={{ textAlign: 'right' }}>Compradores</th>
                    <th style={{ textAlign: 'right' }}>Novos</th>
                    <th style={{ textAlign: 'right' }}>Recompra</th>
                  </tr>
                </thead>
                <tbody>
                  {serie.map((p) => (
                    <tr key={p.mes}>
                      <td style={{ color: 'var(--text2)' }}>{rotuloMes(p.mes)}</td>
                      <td style={{ textAlign: 'right' }}><b style={{ color: 'var(--text)' }}>{brl(p.vgv)}</b></td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{p.compras}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{p.clientes}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{p.novos}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>
                        {p.clientes ? `${Math.round(((p.clientes - p.novos) / p.clientes) * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mt-4 text-[11px] flex-wrap" style={{ color: 'var(--text3)' }}>
        <span>VGV = valor atribuído a compradores nos fechamentos. O total dos leilões (incluindo o não atribuído) está no KPI de cobertura em Clientes.</span>
      </div>
    </div>
  )
}
