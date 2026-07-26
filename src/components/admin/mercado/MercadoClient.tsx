'use client'

import { useMemo, useState } from 'react'
import {
    Radar, RefreshCw, Loader2, ExternalLink, AlertTriangle,
    CalendarDays, Target, Beef, Building2, CircleDollarSign, Check,
} from 'lucide-react'
import type { MercadoDados, MercadoEvento } from '@/app/sistema/actions/mercado'
import { ehNelorePo } from '@/lib/mercado-categorias'

/**
 * RADAR DE MERCADO.
 *
 * O produto desta tela é UM número: quantos leilões estão acontecendo que não
 * passam por nós. Todo o resto é contexto para agir sobre ele — por isso o gap
 * ganha o destaque em dourado e a lista dele vem antes de qualquer gráfico.
 *
 * Cor: o brandbook é preto/grafite/branco + Dourado #C9A84C em dose pequena.
 * Só existem DUAS séries no gráfico por leiloeira (coberto × gap), e elas são
 * distinguidas por dourado × neutro. O validador de paleta reprova esse par nas
 * checagens de "paleta categórica" (o neutro é cinza de propósito, e o dourado
 * da marca é claro demais para a banda), mas as checagens que decidem se dá
 * para LER passam com folga: ΔE 22,2 em visão normal e 20,4 em protanopia.
 * Ainda assim, nunca dependemos só da cor: legenda sempre visível + número
 * escrito dentro de cada segmento.
 */

const OURO = '#C9A84C'
const NEUTRO = '#6E7A8A'

interface Props {
    dados: MercadoDados
}

const fmtData = (iso: string | null) => {
    if (!iso) return '—'
    const [a, m, d] = iso.split('-')
    return `${d}/${m}`
}
const fmtDataHora = (iso: string | null) => {
    if (!iso) return 'nunca'
    try {
        return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    } catch { return '—' }
}

export function MercadoClient({ dados }: Props) {
    const [coletando, setColetando] = useState(false)
    const [msg, setMsg] = useState<string | null>(null)
    // Dois eixos INDEPENDENTES. Antes eram botões excludentes, e não dava para
    // ver o cruzamento que interessa — "Nelore PO que está fora" —, que é
    // justamente a lista acionável. Ela é o estado inicial.
    const [categoria, setCategoria] = useState<'po' | 'todas'>('po')
    const [situacao, setSituacao] = useState<'fora' | 'todas'>('fora')

    const eventos30 = useMemo(() => {
        const limite = new Date()
        limite.setDate(limite.getDate() + 30)
        const lim = limite.toISOString().slice(0, 10)
        return dados.eventos.filter(e => e.data && e.data <= lim)
    }, [dados.eventos])

    const lista = useMemo(() => {
        let l = eventos30
        if (categoria === 'po') l = l.filter(e => ehNelorePo(e.categoria))
        if (situacao === 'fora') l = l.filter(e => !e.noCronograma)
        return l
    }, [eventos30, categoria, situacao])

    const contagem = useMemo(() => {
        const po = eventos30.filter(e => ehNelorePo(e.categoria))
        return {
            po: po.length,
            poFora: po.filter(e => !e.noCronograma).length,
            todas: eventos30.length,
            todasFora: eventos30.filter(e => !e.noCronograma).length,
        }
    }, [eventos30])

    async function coletar() {
        setColetando(true); setMsg(null)
        try {
            const r = await fetch('/api/mercado/coletar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dias: 30 }),
            })
            const j = await r.json()
            if (!r.ok) throw new Error(j.error ?? 'falha na coleta')
            const novos = (j.fontes ?? []).reduce((s: number, f: { novos?: number }) => s + (f.novos ?? 0), 0)
            setMsg(`Coleta concluída — ${novos} evento(s) novo(s). Recarregue para ver.`)
        } catch (e) {
            setMsg(e instanceof Error ? e.message : 'erro na coleta')
        } finally {
            setColetando(false)
        }
    }

    const k = dados.kpis
    const maxLeiloeira = Math.max(1, ...dados.porLeiloeira.map(l => l.total))

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
            {/* ── Cabeçalho ─────────────────────────────────────────────── */}
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="font-display text-2xl md:text-3xl uppercase flex items-center gap-2">
                        <Radar className="h-6 w-6" style={{ color: OURO }} />
                        Radar de Mercado
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                        Agenda pública das leiloeiras confrontada com o nosso cronograma. O que não casa é
                        leilão acontecendo sem passar pela Bula.
                    </p>
                </div>
                <button
                    onClick={coletar}
                    disabled={coletando}
                    className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                >
                    {coletando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {coletando ? 'Coletando…' : 'Coletar agora'}
                </button>
            </header>

            {msg && (
                <div className="rounded-lg border bg-card px-3 py-2 text-sm">{msg}</div>
            )}

            {/* ── KPIs ──────────────────────────────────────────────────── */}
            <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Kpi
                    destaque
                    icon={Target}
                    valor={k.nelorePoGap30}
                    rotulo="Nelore PO fora do cronograma"
                    ajuda="Próximos 30 dias · o mercado que dá para disputar"
                />
                <Kpi icon={Beef} valor={k.nelorePo30} rotulo="Nelore PO no radar" ajuda="Próximos 30 dias" />
                <Kpi
                    icon={Check}
                    valor={k.nelorePoCoberturaPct == null ? '—' : `${k.nelorePoCoberturaPct}%`}
                    rotulo="Cobertura em Nelore PO"
                    ajuda="Quanto do PO já passa por nós"
                />
                <Kpi
                    icon={CalendarDays}
                    valor={k.proximos30}
                    rotulo="Agenda total"
                    ajuda={`Todas as categorias · ${k.gap30} fora`}
                />
                <Kpi icon={Building2} valor={k.leiloeirasAtivas} rotulo="Leiloeiras" ajuda="Com Nelore PO na janela" />
            </section>

            {/* ── A lista que importa ───────────────────────────────────── */}
            <section className="rounded-xl border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                    <h2 className="font-display-tight text-sm uppercase tracking-wide">
                        Leilões · próximos 30 dias
                        <span className="ml-2 font-sans normal-case tracking-normal text-xs text-muted-foreground">
                            {lista.length} listado(s)
                        </span>
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex rounded-lg border overflow-hidden text-xs">
                            {([
                                ['po', `Nelore PO (${contagem.po})`],
                                ['todas', `Todas as categorias (${contagem.todas})`],
                            ] as const).map(([id, label]) => (
                                <button
                                    key={id}
                                    onClick={() => setCategoria(id)}
                                    className={`px-3 py-1.5 ${categoria === id ? 'bg-accent font-medium' : 'hover:bg-accent/50'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className="flex rounded-lg border overflow-hidden text-xs">
                            {([
                                ['fora', `Fora do cronograma (${categoria === 'po' ? contagem.poFora : contagem.todasFora})`],
                                ['todas', 'Tudo'],
                            ] as const).map(([id, label]) => (
                                <button
                                    key={id}
                                    onClick={() => setSituacao(id)}
                                    className={`px-3 py-1.5 ${situacao === id ? 'bg-accent font-medium' : 'hover:bg-accent/50'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {lista.length === 0 ? (
                    <Vazio temFontes={dados.fontes.length > 0} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-xs uppercase text-muted-foreground border-b">
                                <tr>
                                    <th className="text-left font-medium px-4 py-2 w-16">Data</th>
                                    <th className="text-left font-medium px-2 py-2 w-14">Hora</th>
                                    <th className="text-left font-medium px-2 py-2">Leilão</th>
                                    <th className="text-left font-medium px-2 py-2 w-40">Categoria</th>
                                    <th className="text-left font-medium px-2 py-2 w-40">Praça</th>
                                    <th className="text-left font-medium px-2 py-2 w-40">Leiloeira</th>
                                    <th className="text-left font-medium px-4 py-2 w-28">Situação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lista.map(e => <LinhaEvento key={e.id} e={e} />)}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* ── Por leiloeira ─────────────────────────────────────────── */}
            {dados.porLeiloeira.length > 0 && (
                <section className="rounded-xl border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                        <h2 className="font-display-tight text-sm uppercase tracking-wide">Nelore PO por leiloeira</h2>
                        {/* Legenda SEMPRE presente: identidade nunca depende só da cor. */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                                <i className="h-2.5 w-2.5 rounded-sm" style={{ background: NEUTRO }} /> No nosso cronograma
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <i className="h-2.5 w-2.5 rounded-sm" style={{ background: OURO }} /> Fora
                            </span>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">Próximos 30 dias · só Nelore PO</p>

                    <div className="space-y-3">
                        {dados.porLeiloeira.map(l => {
                            const coberto = l.total - l.gap
                            const larguraTotal = (l.total / maxLeiloeira) * 100
                            const pctCoberto = l.total ? (coberto / l.total) * 100 : 0
                            return (
                                <div key={l.leiloeira} className="grid grid-cols-[minmax(7rem,10rem)_1fr_auto] items-center gap-3">
                                    <span className="text-xs truncate" title={l.leiloeira}>{l.leiloeira}</span>
                                    <div className="h-5">
                                        <div className="flex h-full gap-[2px]" style={{ width: `${larguraTotal}%` }}>
                                            {coberto > 0 && (
                                                <div
                                                    className="h-full rounded-l-[4px] flex items-center justify-end pr-1.5 text-[10px] font-medium text-white/90"
                                                    style={{ background: NEUTRO, width: `${pctCoberto}%` }}
                                                    title={`${coberto} no nosso cronograma`}
                                                >
                                                    {coberto > 0 && pctCoberto > 12 ? coberto : ''}
                                                </div>
                                            )}
                                            {l.gap > 0 && (
                                                <div
                                                    className="h-full flex items-center justify-end pr-1.5 text-[10px] font-semibold"
                                                    style={{
                                                        background: OURO,
                                                        color: '#1a1a19',
                                                        width: `${100 - pctCoberto}%`,
                                                        borderRadius: coberto > 0 ? '0 4px 4px 0' : '4px',
                                                    }}
                                                    title={`${l.gap} fora do cronograma`}
                                                >
                                                    {100 - pctCoberto > 12 ? l.gap : ''}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-xs tabular-nums text-muted-foreground w-24 text-right">
                                        {l.total} · {l.nelore} nelore
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </section>
            )}

            {/* ── Distribuições ─────────────────────────────────────────── */}
            <section className="grid md:grid-cols-2 gap-4">
                <Distribuicao titulo="Composição da agenda (todas)" itens={dados.porCategoria.map(c => ({ rotulo: c.categoria, valor: c.total }))} />
                <Distribuicao titulo="Nelore PO por praça (UF)" itens={dados.porUf.map(c => ({ rotulo: c.uf, valor: c.total }))} />
            </section>

            {/* ── Operação ──────────────────────────────────────────────── */}
            <section className="grid lg:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-card p-4">
                    <h2 className="font-display-tight text-sm uppercase tracking-wide mb-3">Fontes monitoradas</h2>
                    <div className="space-y-2">
                        {dados.fontes.map(f => (
                            <div key={f.id} className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">{f.leiloeira}</span>
                                        <span
                                            className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border"
                                            title={f.modo === 'http' ? 'Coleta direta — custo zero' : 'Renderiza no cliente — usa crédito do Apify'}
                                        >
                                            {f.modo === 'http' ? 'direto · grátis' : 'apify'}
                                        </span>
                                    </div>
                                    <a href={f.siteUrl} target="_blank" rel="noreferrer"
                                        className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1">
                                        {f.siteUrl.replace(/^https?:\/\//, '')}
                                        <ExternalLink className="h-3 w-3" />
                                    </a>
                                    {f.observacoes && (
                                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{f.observacoes}</p>
                                    )}
                                </div>
                                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                    {fmtDataHora(f.ultimaColetaAt)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-xl border bg-card p-4">
                    <h2 className="font-display-tight text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
                        <CircleDollarSign className="h-4 w-4" /> Apify · crédito e coletas
                    </h2>
                    {dados.apify.configurado ? (
                        <>
                            <div className="rounded-lg border px-3 py-2 mb-3">
                                <div className="flex items-baseline justify-between text-sm">
                                    <span className="text-muted-foreground">{dados.apify.conta ?? 'conta conectada'}</span>
                                    <span className="tabular-nums">
                                        US$ {dados.apify.gastoUsd.toFixed(2)}
                                        {dados.apify.limiteUsd > 0 && <span className="text-muted-foreground"> / {dados.apify.limiteUsd.toFixed(2)}</span>}
                                    </span>
                                </div>
                                {dados.apify.limiteUsd > 0 && (
                                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                                        <div
                                            className="h-full rounded-full"
                                            style={{
                                                width: `${Math.min(100, dados.apify.percentual)}%`,
                                                background: dados.apify.percentual > 80 ? OURO : NEUTRO,
                                            }}
                                        />
                                    </div>
                                )}
                                <p className="text-[11px] text-muted-foreground mt-2">
                                    Plano free. Fonte em modo <strong>direto</strong> não consome nada — só o modo apify gasta.
                                </p>
                            </div>
                            <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                {dados.coletas.length === 0 && (
                                    <p className="text-xs text-muted-foreground">Nenhuma coleta ainda.</p>
                                )}
                                {dados.coletas.map(c => (
                                    <div key={c.id} className="flex items-center justify-between gap-2 text-xs border-b pb-1.5 last:border-0">
                                        <span className="text-muted-foreground whitespace-nowrap">{fmtDataHora(c.createdAt)}</span>
                                        <span className="flex-1 truncate">
                                            {c.erro
                                                ? <span className="inline-flex items-center gap-1" style={{ color: OURO }}>
                                                    <AlertTriangle className="h-3 w-3" />{c.erro.slice(0, 60)}
                                                </span>
                                                : `${c.paginas} pág · ${c.eventosNovos} novo(s)`}
                                        </span>
                                        <span className="tabular-nums text-muted-foreground">
                                            {c.custoUsd > 0 ? `US$ ${c.custoUsd.toFixed(3)}` : 'grátis'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            APIFY_TOKEN não configurado. As fontes em modo direto seguem funcionando normalmente.
                        </p>
                    )}
                </div>
            </section>
        </div>
    )
}

/* ─── Peças ──────────────────────────────────────────────────────────────── */

function Kpi({ icon: Icon, valor, rotulo, ajuda, destaque }: {
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
    valor: number | string
    rotulo: string
    ajuda?: string
    destaque?: boolean
}) {
    return (
        <div
            className="rounded-xl border bg-card p-3"
            style={destaque ? { borderColor: OURO } : undefined}
        >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5" style={destaque ? { color: OURO } : undefined} />
                <span className="truncate">{rotulo}</span>
            </div>
            <div
                className="font-display text-3xl mt-1 tabular-nums"
                style={destaque ? { color: OURO } : undefined}
            >
                {valor}
            </div>
            {ajuda && <div className="text-[11px] text-muted-foreground">{ajuda}</div>}
        </div>
    )
}

function LinhaEvento({ e }: { e: MercadoEvento }) {
    return (
        <tr className="border-b last:border-0 hover:bg-accent/40">
            <td className="px-4 py-2 tabular-nums whitespace-nowrap">{fmtData(e.data)}</td>
            <td className="px-2 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{e.hora ?? '—'}</td>
            <td className="px-2 py-2">{e.nome}</td>
            <td className="px-2 py-2 text-muted-foreground">{e.categoria ?? '—'}</td>
            <td className="px-2 py-2 text-muted-foreground">{e.local ?? '—'}</td>
            <td className="px-2 py-2 text-muted-foreground">{e.leiloeira}</td>
            <td className="px-4 py-2">
                {e.noCronograma ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Check className="h-3 w-3" /> nosso
                    </span>
                ) : (
                    <span
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
                        style={{ background: `${OURO}22`, color: OURO }}
                    >
                        fora
                    </span>
                )}
            </td>
        </tr>
    )
}

function Distribuicao({ titulo, itens }: { titulo: string; itens: Array<{ rotulo: string; valor: number }> }) {
    const max = Math.max(1, ...itens.map(i => i.valor))
    return (
        <div className="rounded-xl border bg-card p-4">
            <h2 className="font-display-tight text-sm uppercase tracking-wide mb-3">{titulo}</h2>
            {itens.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem dados ainda.</p>
            ) : (
                <div className="space-y-1.5">
                    {itens.map(i => (
                        <div key={i.rotulo} className="grid grid-cols-[minmax(6rem,9rem)_1fr_2rem] items-center gap-2">
                            <span className="text-xs truncate" title={i.rotulo}>{i.rotulo}</span>
                            <div className="h-2.5">
                                <div
                                    className="h-full rounded-[4px]"
                                    style={{ width: `${(i.valor / max) * 100}%`, background: NEUTRO }}
                                />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground text-right">{i.valor}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function Vazio({ temFontes }: { temFontes: boolean }) {
    return (
        <div className="px-4 py-10 text-center">
            <Radar className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
                {temFontes
                    ? 'Nenhum evento coletado ainda. Clique em “Coletar agora”.'
                    : 'Nenhuma fonte cadastrada.'}
            </p>
        </div>
    )
}
