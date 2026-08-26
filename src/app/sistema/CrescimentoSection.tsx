'use client'

/**
 * Operação & crescimento, dentro do dashboard principal.
 *
 * Era uma página separada (/sistema/crm/dashboard). Growth não é um lugar aonde
 * se vai — é o que a operação produziu, e por isso mora ao lado dos leilões e da
 * agenda, na mesma tela.
 *
 * Nada aqui é contado no browser: o servidor manda quatro números por dia e a
 * apuração do funil já fechada. O que este arquivo faz é desenhar.
 */
import { useMemo } from 'react'
import { Target, UserPlus, FileCheck2, BadgeCheck, Clock3, TrendingUp, TrendingDown } from 'lucide-react'
import { FunilPorCampanha, type DadosDoFunil } from '@/components/admin/crm/FunilPorCampanha'
import type { Crescimento } from '@/lib/dashboard-crescimento'

const CARD = 'rounded-2xl border border-gray-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414]'
const OURO = '#C9A84C'
const BRONZE = '#A68B4B'
const VERDE = '#4E7A45'
const VERMELHO = '#c0392b'
const int = (n: number) => n.toLocaleString('pt-BR')
const taxa = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 1000) / 10 : 0)

/** 'AAAA-MM-DD' vira '25/08'. Fatia a string: `new Date` puxaria para o UTC. */
const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

type ChaveDoDia = 'leads' | 'mql' | 'submetidos' | 'aprovados'
type Serie = { chave: ChaveDoDia; cor: string; rotulo: string }

// ── Barras por dia ──────────────────────────────────────────────────────────

function BarrasPorDia({ dias, series }: { dias: Crescimento['dias']; series: Serie[] }) {
    const teto = Math.max(1, ...dias.map(d => Math.max(...series.map(s => d[s.chave]))))
    return (
        <div>
            <div className="flex items-end gap-[3px] h-[92px]">
                {dias.map(d => (
                    <div
                        key={d.dia}
                        className="flex-1 flex items-end justify-center gap-[2px] h-full"
                        title={`${diaCurto(d.dia)} · ${series.map(s => `${s.rotulo}: ${d[s.chave]}`).join(' · ')}`}
                    >
                        {series.map(s => (
                            <div
                                key={s.chave}
                                className="flex-1 rounded-t-[2px] min-h-[2px] transition-all"
                                style={{
                                    height: `${Math.max(d[s.chave] > 0 ? 6 : 2, (d[s.chave] / teto) * 100)}%`,
                                    background: s.cor,
                                    opacity: d[s.chave] > 0 ? 0.9 : 0.12,
                                }}
                            />
                        ))}
                    </div>
                ))}
            </div>
            <div className="flex justify-between mt-1.5 text-[9px] text-gray-400 tabular-nums">
                <span>{dias.length ? diaCurto(dias[0].dia) : ''}</span>
                <span>{dias.length ? diaCurto(dias[Math.floor(dias.length / 2)].dia) : ''}</span>
                <span>{dias.length ? diaCurto(dias[dias.length - 1].dia) : ''}</span>
            </div>
        </div>
    )
}

function Legenda({ series }: { series: Serie[] }) {
    return (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {series.map(s => (
                <span key={s.chave} className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                    <i className="w-2 h-2 rounded-[2px] inline-block" style={{ background: s.cor }} />
                    {s.rotulo}
                </span>
            ))}
        </div>
    )
}

function CabecaDoCard({ icon: Icon, titulo, sub }: { icon: React.ElementType; titulo: string; sub: string }) {
    return (
        <div className="flex items-start gap-2.5 mb-3">
            <span
                className="w-8 h-8 rounded-lg grid place-items-center shrink-0"
                style={{ background: `${BRONZE}1A`, color: BRONZE }}
            >
                <Icon size={15} />
            </span>
            <div className="min-w-0">
                <p className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight">{titulo}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>
            </div>
        </div>
    )
}

// ── Funil geral do tráfego pago ─────────────────────────────────────────────

function FunilGeral({ funil }: { funil: DadosDoFunil }) {
    const etapas = useMemo(() => {
        const t = funil.totais
        const m = funil.metas
        const base = [
            { label: 'Impressões', valor: t.impressoes, cor: '#6366f1', meta: null as number | null, de: '' },
            { label: 'Cliques', valor: t.cliques, cor: '#3b82f6', meta: m.ctr, de: 'CTR' },
            { label: 'Leads', valor: t.leads, cor: '#0ea5e9', meta: null, de: 'dos cliques' },
            { label: 'Qualificados (MQL)', valor: t.mql, cor: OURO, meta: m.mqlPorLead, de: 'dos leads' },
            { label: 'Cadastros submetidos', valor: t.cadastrosSubmetidos, cor: '#a855f7', meta: m.cadastroPorMql, de: 'dos MQL' },
            { label: 'Cadastros aprovados', valor: t.cadastrosAprovados, cor: '#06b6d4', meta: m.aprovadoPorCadastro, de: 'dos submetidos' },
            { label: 'Clientes que compraram', valor: t.clientes, cor: VERDE, meta: m.clientePorAprovado, de: 'dos aprovados' },
        ]
        return base.map((e, i) => {
            const conv = i > 0 ? taxa(e.valor, base[i - 1].valor) : null
            return { ...e, conv, bateuMeta: e.meta != null && conv != null ? conv >= e.meta : null }
        })
    }, [funil])

    const teto = Math.max(1, ...etapas.map(e => e.valor))
    const t = funil.totais
    const roas = t.investido > 0 ? t.faturamento / t.investido : 0

    return (
        <div className={`${CARD} p-5`}>
            <div className="flex items-start justify-between gap-3">
                <CabecaDoCard
                    icon={Target}
                    titulo="Funil do tráfego pago"
                    sub={`Do anúncio à compra · ${funil.frescor === 'ao-vivo' ? 'leads ao vivo' : 'apuração congelada'} de ${String(funil.geradoEm).split('-').reverse().join('/')}`}
                />
                <div className="text-right shrink-0">
                    <p className="text-[9px] uppercase tracking-widest font-bold" style={{ color: BRONZE }}>ROAS</p>
                    <p className="text-[26px] font-black leading-none tabular-nums" style={{ color: OURO }}>
                        {roas ? `${roas.toFixed(1)}×` : '—'}
                    </p>
                </div>
            </div>

            <div className="space-y-1.5 mt-1">
                {etapas.map(e => (
                    <div key={e.label} className="flex items-center gap-3">
                        <span className="w-[150px] shrink-0 text-[11px] text-gray-600 dark:text-gray-300 truncate">{e.label}</span>
                        <div className="flex-1 h-[22px] rounded-md bg-gray-100 dark:bg-[#1A1A1A] overflow-hidden">
                            <div
                                className="h-full rounded-md transition-all"
                                style={{ width: `${Math.max(1.5, (e.valor / teto) * 100)}%`, background: e.cor, opacity: 0.85 }}
                            />
                        </div>
                        <span className="w-[84px] shrink-0 text-right text-[12px] font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                            {int(e.valor)}
                        </span>
                        <span
                            className="w-[118px] shrink-0 text-right text-[10px] tabular-nums"
                            style={{ color: e.bateuMeta == null ? '#9ca3af' : e.bateuMeta ? VERDE : VERMELHO }}
                        >
                            {e.conv == null ? '' : `${e.conv}% ${e.de}`}
                            {e.meta != null && <span className="text-gray-400"> · meta {e.meta}%</span>}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── Seção ───────────────────────────────────────────────────────────────────

export function CrescimentoSection({ crescimento, funil }: { crescimento: Crescimento; funil: DadosDoFunil | null }) {
    const { dias, janela, cadastros, aguardandoDecisao } = crescimento

    // Tendência: os últimos 7 dias contra os 7 anteriores.
    const tend = useMemo(() => {
        const calc = (campo: 'leads' | 'mql') => {
            const soma = (fatia: typeof dias) => fatia.reduce((s, d) => s + d[campo], 0)
            const agora = soma(dias.slice(-7))
            const antes = soma(dias.slice(-14, -7))
            return { agora, delta: antes > 0 ? Math.round(((agora - antes) / antes) * 100) : agora > 0 ? 100 : 0 }
        }
        return [
            { rotulo: 'Leads', ...calc('leads') },
            { rotulo: 'MQL', ...calc('mql') },
        ]
    }, [dias])

    const serieLeads: Serie[] = [
        { chave: 'leads', cor: '#5B6670', rotulo: 'Leads' },
        { chave: 'mql', cor: OURO, rotulo: 'MQL' },
    ]
    const serieCadastros: Serie[] = [
        { chave: 'submetidos', cor: '#a855f7', rotulo: 'Submetidos' },
        { chave: 'aprovados', cor: '#06b6d4', rotulo: 'Aprovados' },
    ]

    return (
        <div className="space-y-4">
            {funil && <FunilGeral funil={funil} />}

            <div className="grid gap-4 lg:grid-cols-2 items-stretch">
                <div className={`${CARD} p-5 flex flex-col`}>
                    <CabecaDoCard
                        icon={UserPlus}
                        titulo="Leads e MQL por dia"
                        sub={`Últimos ${janela.dias} dias · ${int(janela.leads)} leads, ${int(janela.mql)} qualificados (${taxa(janela.mql, janela.leads)}%)`}
                    />
                    <BarrasPorDia dias={dias} series={serieLeads} />
                    <Legenda series={serieLeads} />
                    <div className="grid grid-cols-2 gap-2 mt-3">
                        {tend.map(t => (
                            <div key={t.rotulo} className="rounded-lg border border-gray-200 dark:border-[#2A2A2A] px-3 py-2">
                                <p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">{t.rotulo} · 7 dias</p>
                                <p className="flex items-baseline gap-2 mt-0.5">
                                    <span className="text-[17px] font-bold tabular-nums text-gray-900 dark:text-white">{int(t.agora)}</span>
                                    <span
                                        className="flex items-center gap-0.5 text-[10px] font-semibold tabular-nums"
                                        style={{ color: t.delta >= 0 ? VERDE : VERMELHO }}
                                    >
                                        {t.delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                        {t.delta > 0 ? '+' : ''}{t.delta}%
                                    </span>
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className={`${CARD} p-5 flex flex-col`}>
                    <CabecaDoCard
                        icon={FileCheck2}
                        titulo="Cadastros submetidos e aprovados por dia"
                        sub={`Últimos ${janela.dias} dias · ${int(janela.submetidos)} submetidos, ${int(janela.aprovados)} aprovados`}
                    />
                    <BarrasPorDia dias={dias} series={serieCadastros} />
                    <Legenda series={serieCadastros} />
                    {/* A fila é o número que decide: ficha submetida sem resposta da
                        leiloeira não vira comprador habilitado nenhum. */}
                    <div
                        className="mt-auto pt-3"
                    >
                        <div
                            className="rounded-lg px-3 py-2.5 flex items-center gap-2.5"
                            style={{ background: `${BRONZE}12`, border: `1px solid ${BRONZE}33` }}
                        >
                            <Clock3 size={15} style={{ color: BRONZE }} className="shrink-0" />
                            <p className="text-[11px] text-gray-700 dark:text-gray-300">
                                <b className="tabular-nums">{int(aguardandoDecisao)}</b> ficha(s) submetida(s) e ainda sem decisão da leiloeira
                                {janela.aprovados === 0 && janela.submetidos > 0 && (
                                    <> — e <b>nenhuma aprovação voltou</b> nos últimos {janela.dias} dias.</>
                                )}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className={`${CARD} p-5`}>
                <CabecaDoCard icon={BadgeCheck} titulo="Últimos cadastros" sub="Ficha por leiloeira, pelo movimento mais recente" />
                {cadastros.length === 0 ? (
                    <p className="text-[11px] text-gray-500 py-4 text-center">Nenhum cadastro registrado.</p>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-[#1E1E1E]">
                        {cadastros.map((c, i) => (
                            <div key={`${c.nome}-${c.leiloeira}-${i}`} className="flex items-center gap-3 py-2">
                                <span className="flex-1 min-w-0 text-[12px] text-gray-900 dark:text-gray-100 truncate">{c.nome}</span>
                                <span className="text-[11px] text-gray-500 truncate max-w-[160px]">{c.leiloeira}</span>
                                <span
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                                    style={{
                                        background: c.status === 'aprovado' ? `${VERDE}1A` : c.status === 'recusado' ? `${VERMELHO}1A` : `${BRONZE}1A`,
                                        color: c.status === 'aprovado' ? VERDE : c.status === 'recusado' ? VERMELHO : BRONZE,
                                    }}
                                >
                                    {c.status}
                                </span>
                                <span className="text-[10px] text-gray-400 tabular-nums w-[62px] text-right shrink-0">
                                    {c.quando ? diaCurto(String(c.quando).slice(0, 10)) : '—'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {funil && <FunilPorCampanha dados={funil} />}
        </div>
    )
}
