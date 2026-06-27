'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileVideo, RefreshCw, X, Play, CheckCircle2, Clock, AlertCircle,
  Loader2, ExternalLink, Sparkles, TrendingUp, Users, Tag, Eye, Mic, AlertTriangle,
} from 'lucide-react'
import type { LeilaoAnaliseRow } from '@/lib/leilao-analise'
import { parseProcedencia, type Relatorio } from '@/lib/videoextrator'

function brl(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function dataBR(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

type Estado = 'concluido' | 'processando' | 'sugestao' | 'sem_video' | 'erro'

function estadoDe(row: LeilaoAnaliseRow): Estado {
  if (row.analise?.status === 'concluido') return 'concluido'
  if (row.analise?.status === 'processando') return 'processando'
  if (row.analise?.status === 'erro') return 'erro'
  if (row.sugestao) return 'sugestao'
  return 'sem_video'
}

const BADGE: Record<Estado, { label: string; cls: string; Icon: React.ElementType }> = {
  concluido: { label: 'Analisado', cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30', Icon: CheckCircle2 },
  processando: { label: 'Processando', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30', Icon: Clock },
  sugestao: { label: 'Sugestão', cls: 'bg-sky-500/10 text-sky-500 border-sky-500/30', Icon: Sparkles },
  sem_video: { label: 'Sem vídeo', cls: 'bg-gray-500/10 text-gray-400 border-gray-500/20', Icon: AlertCircle },
  erro: { label: 'Erro', cls: 'bg-red-500/10 text-red-500 border-red-500/30', Icon: AlertCircle },
}

export default function LeiloesAnaliseClient({
  initialRows,
  vpsOnline,
  erro,
}: {
  initialRows: LeilaoAnaliseRow[]
  vpsOnline: boolean
  erro: string | null
}) {
  const router = useRouter()
  const [rows] = useState(initialRows)
  const [busy, setBusy] = useState<string | null>(null) // leilao_id em ação
  const [syncing, setSyncing] = useState(false)
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [relatorioOpen, setRelatorioOpen] = useState<{ id: string; nome: string } | null>(null)

  const resumo = useMemo(() => {
    const c = { total: rows.length, analisado: 0, processando: 0, sugestao: 0, sem: 0 }
    for (const r of rows) {
      const e = estadoDe(r)
      if (e === 'concluido') c.analisado++
      else if (e === 'processando') c.processando++
      else if (e === 'sugestao') c.sugestao++
      else c.sem++
    }
    return c
  }, [rows])

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
    return data
  }

  async function analisar(id: string) {
    const videoUrl = (urlInputs[id] || '').trim()
    if (!videoUrl) return
    setBusy(id); setMsg(null)
    try {
      await post(`/api/sistema/ia/leiloes/${id}/analisar`, { videoUrl })
      setMsg('Análise enfileirada — o processamento roda na VPS e aparece aqui ao concluir.')
      router.refresh()
    } catch (e) {
      setMsg(`Falha: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  async function confirmarSugestao(id: string, videoId: string, score: number) {
    setBusy(id); setMsg(null)
    try {
      await post(`/api/sistema/ia/leiloes/${id}/vincular`, { videoId, score })
      router.refresh()
    } catch (e) {
      setMsg(`Falha: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  async function sincronizar() {
    setSyncing(true); setMsg(null)
    try {
      const r = await post('/api/sistema/ia/leiloes/sincronizar', {})
      setMsg(`Sincronizado: ${r.atualizados} leilão(ões) atualizado(s).`)
      router.refresh()
    } catch (e) {
      setMsg(`Falha ao sincronizar: ${(e as Error).message}`)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#A68B4B] to-[#C8A96E] flex items-center justify-center shadow-lg shadow-[#A68B4B]/30">
              <FileVideo size={20} className="text-black" />
            </div>
            Análise de Leilões
          </h1>
          <p className="text-sm text-gray-500 mt-1 ml-13">
            Relatórios extraídos dos vídeos dos leilões (desde 04/2026) · videoextrator na VPS
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] px-2.5 py-1 rounded-full border ${vpsOnline ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/5' : 'text-red-500 border-red-500/30 bg-red-500/5'}`}>
            {vpsOnline ? 'VPS online' : 'VPS offline'}
          </span>
          <button
            onClick={sincronizar}
            disabled={syncing}
            className="flex items-center gap-2 px-3.5 py-2 text-sm rounded-xl border border-[#A68B4B]/40 text-[#A68B4B] hover:bg-[#A68B4B]/10 transition-all disabled:opacity-50"
          >
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            Sincronizar
          </button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <CardResumo label="Leilões" valor={resumo.total} />
        <CardResumo label="Analisados" valor={resumo.analisado} cor="text-emerald-500" />
        <CardResumo label="Processando" valor={resumo.processando} cor="text-amber-500" />
        <CardResumo label="Sugestões" valor={resumo.sugestao} cor="text-sky-500" />
        <CardResumo label="Sem vídeo" valor={resumo.sem} cor="text-gray-400" />
      </div>

      {erro && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-500">
          {erro}
        </div>
      )}
      {msg && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-[#A68B4B]/10 border border-[#A68B4B]/30 text-sm text-[#A68B4B] flex items-center justify-between">
          <span>{msg}</span>
          <button onClick={() => setMsg(null)}><X size={14} /></button>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-2xl border border-gray-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-200 dark:border-[#2A2A2A]">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Leilão</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Canal</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Resultado</th>
                <th className="px-4 py-3 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const e = estadoDe(row)
                const badge = BADGE[e]
                const id = row.leilao.id
                const isBusy = busy === id
                return (
                  <tr key={id} className="border-b border-gray-100 dark:border-[#222] hover:bg-gray-50 dark:hover:bg-[#1A1A1A] transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">{dataBR(row.leilao.data)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 max-w-[260px] truncate" title={row.leilao.nome}>
                      {row.leilao.nome}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-500 dark:text-gray-400">
                      {row.leilao.transmissao || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border ${badge.cls}`}>
                        <badge.Icon size={12} />
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {e === 'concluido' && row.analise ? (
                        <span>{row.analise.total_vendidos ?? 0}/{row.analise.total_lotes ?? 0} lotes · {brl(row.analise.volume_total)}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {e === 'concluido' && (
                          <button
                            onClick={() => setRelatorioOpen({ id, nome: row.leilao.nome })}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#A68B4B] text-black font-semibold hover:bg-[#C8A96E] transition-all"
                          >
                            <ExternalLink size={13} /> Ver relatório
                          </button>
                        )}
                        {e === 'sugestao' && row.sugestao && (
                          <button
                            onClick={() => confirmarSugestao(id, row.sugestao!.video_id, row.sugestao!.score)}
                            disabled={isBusy}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-sky-500/40 text-sky-500 hover:bg-sky-500/10 transition-all disabled:opacity-50"
                            title={row.sugestao.titulo || ''}
                          >
                            {isBusy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Confirmar sugestão
                          </button>
                        )}
                        {(e === 'sem_video' || e === 'sugestao' || e === 'erro') && (
                          <div className="flex items-center gap-1.5">
                            <input
                              value={urlInputs[id] || ''}
                              onChange={(ev) => setUrlInputs((p) => ({ ...p, [id]: ev.target.value }))}
                              placeholder="URL do YouTube"
                              className="w-[150px] lg:w-[180px] bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#A68B4B]/50"
                            />
                            <button
                              onClick={() => analisar(id)}
                              disabled={isBusy || !(urlInputs[id] || '').trim()}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-[#A68B4B]/15 text-[#A68B4B] hover:bg-[#A68B4B]/25 transition-all disabled:opacity-40"
                            >
                              {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Analisar
                            </button>
                          </div>
                        )}
                        {e === 'processando' && (
                          <span className="text-xs text-amber-500 flex items-center gap-1.5">
                            <Loader2 size={13} className="animate-spin" /> na fila da VPS
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Nenhum leilão na agenda desde 04/2026.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {relatorioOpen && (
        <RelatorioModal
          leilaoId={relatorioOpen.id}
          nome={relatorioOpen.nome}
          onClose={() => setRelatorioOpen(null)}
        />
      )}
    </div>
  )
}

function CardResumo({ label, valor, cor }: { label: string; valor: number; cor?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${cor || 'text-gray-900 dark:text-white'}`}>{valor}</p>
    </div>
  )
}

function RelatorioModal({ leilaoId, nome, onClose }: { leilaoId: string; nome: string; onClose: () => void }) {
  const [rel, setRel] = useState<Relatorio | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/sistema/ia/leiloes/${leilaoId}/relatorio`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
        return d as Relatorio
      })
      .then((d) => { if (alive) { setRel(d); setLoading(false) } })
      .catch((e) => { if (alive) { setErro(e.message); setLoading(false) } })
    return () => { alive = false }
  }, [leilaoId])

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#141414] w-full sm:max-w-4xl max-h-[92vh] sm:rounded-2xl rounded-t-2xl border border-gray-200 dark:border-[#2A2A2A] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-[#2A2A2A] shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">{nome}</h2>
            <p className="text-xs text-gray-400">Relatório pós-leilão</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1A1A1A]"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5">
          {loading && <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#A68B4B]" size={28} /></div>}
          {erro && <div className="py-10 text-center text-red-500 text-sm">{erro}</div>}
          {rel && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <Stat icon={Tag} label="Lotes" valor={`${rel.vendidos}/${rel.total_lotes}`} hint="vendidos" />
                <Stat icon={TrendingUp} label="Volume" valor={brl(rel.volume_total)} />
                <Stat icon={TrendingUp} label="Preço médio" valor={brl(rel.preco_medio)} />
                <Stat icon={TrendingUp} label="Maior lance" valor={brl(rel.preco_maximo)} />
              </div>

              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <ListaTop titulo="Top compradores" icon={Users} itens={(rel.top_compradores || []).map((c) => ({ nome: c.nome, valor: brl(c.volume) }))} />
                <ListaTop titulo="Top assessorias" icon={Users} itens={(rel.top_assessorias || []).map((c) => ({ nome: c.nome, valor: `${c.quantidade} lote(s)` }))} />
              </div>

              {(() => {
                const procs = (rel.lotes || []).map((l) => parseProcedencia(l.qa_flags))
                const nDesacordo = procs.filter((p) => p.desacordo).length
                const nVisual = procs.filter((p) => p.fonte === 'fusao').length
                return (
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Lotes ({rel.lotes?.length || 0})</h3>
                    {nVisual > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500 border border-violet-500/30">
                        <Eye size={11} /> {nVisual} com leitura da tarja
                      </span>
                    )}
                    {nDesacordo > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30">
                        <AlertTriangle size={11} /> {nDesacordo} desacordo áudio↔vídeo (revisar)
                      </span>
                    )}
                  </div>
                )
              })()}
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#2A2A2A]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-200 dark:border-[#2A2A2A]">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Descrição / Animal</th>
                      <th className="px-3 py-2 font-medium">Comprador</th>
                      <th className="px-3 py-2 font-medium text-right">Valor</th>
                      <th className="px-3 py-2 font-medium text-center">Parc.</th>
                      <th className="px-3 py-2 font-medium">Fonte</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rel.lotes || []).map((l) => {
                      const proc = parseProcedencia(l.qa_flags)
                      return (
                      <tr key={l.id} className={`border-b border-gray-100 dark:border-[#222] ${proc.desacordo ? 'bg-amber-500/5' : ''}`}>
                        <td className="px-3 py-2 text-gray-400">{l.numero_lote}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate text-gray-700 dark:text-gray-200" title={l.descricao_lote || l.nome_animal || ''}>
                          {l.nome_animal || l.descricao_lote || '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300 max-w-[150px] truncate" title={l.comprador || ''}>{l.comprador || '—'}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-800 dark:text-gray-100">{brl(l.valor_final)}</td>
                        <td className="px-3 py-2 text-center text-gray-500 dark:text-gray-400">{l.total_parcelas || '—'}</td>
                        <td className="px-3 py-2">
                          <FonteBadge proc={proc} conf={l.confianca} />
                        </td>
                        <td className="px-3 py-2">
                          <span className={l.motivo === 'VENDIDO' ? 'text-emerald-500' : 'text-gray-400'}>
                            {l.motivo === 'VENDIDO' ? 'Vendido' : 'Não vendido'}
                          </span>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, valor, hint }: { icon: React.ElementType; label: string; valor: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-[#2A2A2A] px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-400">
        <Icon size={12} /> {label}
      </div>
      <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">{valor}</p>
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  )
}

function FonteBadge({ proc, conf }: { proc: ReturnType<typeof parseProcedencia>; conf: number | null }) {
  const pct = conf != null ? Math.round(conf * 100) : null
  if (proc.desacordo) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30" title="Áudio e vídeo divergiram no valor; ficou com a leitura da tarja.">
        <AlertTriangle size={10} /> desacordo{pct != null ? ` · ${pct}%` : ''}
      </span>
    )
  }
  if (proc.fonte === 'fusao') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 border border-violet-500/30" title="Campos rígidos lidos da tarja (vídeo); comprador do áudio.">
        <Eye size={10} /> tarja{pct != null ? ` · ${pct}%` : ''}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-400 border border-gray-500/20" title="Extraído só do áudio/transcrição.">
      <Mic size={10} /> áudio{pct != null ? ` · ${pct}%` : ''}
    </span>
  )
}

function ListaTop({ titulo, icon: Icon, itens }: { titulo: string; icon: React.ElementType; itens: { nome: string; valor: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5"><Icon size={14} /> {titulo}</h3>
      <div className="space-y-1">
        {itens.length === 0 && <p className="text-xs text-gray-400">Sem dados.</p>}
        {itens.map((it, i) => (
          <div key={i} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1A1A1A]">
            <span className="truncate text-gray-700 dark:text-gray-200 max-w-[70%]" title={it.nome}>{it.nome}</span>
            <span className="text-gray-500 dark:text-gray-400 font-medium">{it.valor}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
