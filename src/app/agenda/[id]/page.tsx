import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
    ArrowLeft, CalendarDays, Clock, MapPin, Users, Tv, Gavel, Truck,
    Tag, BookOpen, Download, Radio, ExternalLink, Share2,
} from 'lucide-react'
import { getLeilaoPublico, getLeiloesPublicos, type LeilaoPublico } from '@/lib/bula/public-leiloes'
import {
    dataPorExtenso, parseData, statusPublico, youtubeId, isFuturo, contagemRegressiva,
} from '../helpers'

export const revalidate = 120

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const l = await getLeilaoPublico(id)
    if (!l) return { title: 'Leilão não encontrado — Bula Assessoria' }
    return {
        title: `${l.nome} — Bula Assessoria`,
        description: `${l.nome} · ${dataPorExtenso(l.data)}${l.local ? ` · ${l.local}` : ''}. Catálogo, transmissão e detalhes do remate.`,
        openGraph: {
            title: l.nome,
            description: `${dataPorExtenso(l.data)}${l.local ? ` · ${l.local}` : ''}`,
            images: l.img ? [l.img] : undefined,
        },
    }
}

export default async function LeilaoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const leilao = await getLeilaoPublico(id)
    if (!leilao) notFound()

    const p = parseData(leilao.data)
    const badge = statusPublico(leilao)
    const ytId = youtubeId(leilao.transmissao)
    const countdown = contagemRegressiva(leilao.data)

    // Outros leilões (próximos), excluindo o atual.
    const todos = await getLeiloesPublicos()
    const outros = todos
        .filter((l) => l.id !== leilao.id && isFuturo(l.data))
        .sort((a, b) => parseData(a.data).time - parseData(b.data).time)
        .slice(0, 3)

    const infos = [
        { icon: CalendarDays, label: 'Data', value: dataPorExtenso(leilao.data) },
        leilao.horario ? { icon: Clock, label: 'Horário', value: leilao.horario } : null,
        leilao.local ? { icon: MapPin, label: 'Local', value: leilao.local } : null,
        leilao.modelo ? { icon: Tv, label: 'Modelo', value: leilao.modelo } : null,
        leilao.leiloeira ? { icon: Gavel, label: 'Leiloeira', value: leilao.leiloeira } : null,
        leilao.animais && leilao.animais > 0 ? { icon: Users, label: 'Animais', value: String(leilao.animais) } : null,
        leilao.condicao ? { icon: Tag, label: 'Condição', value: leilao.condicao } : null,
        leilao.frete_gratis ? { icon: Truck, label: 'Frete grátis', value: leilao.frete_gratis } : null,
    ].filter(Boolean) as { icon: typeof CalendarDays; label: string; value: string }[]

    return (
        <article className="mx-auto max-w-5xl px-5 py-10 text-[#1E2519] sm:px-8 sm:py-14">
            {/* Voltar */}
            <Link
                href="/agenda"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#1E2519]/55 transition-colors hover:text-[#355334]"
            >
                <ArrowLeft className="h-4 w-4" /> Voltar à agenda
            </Link>

            {/* ── HERO ──────────────────────────────────────────── */}
            <header className="mt-6 overflow-hidden rounded-lg border border-[#1E2519]/10 bg-[#FFF9EE] shadow-sm">
                <div className="relative aspect-[21/9] w-full overflow-hidden bg-[#E8DDCC]">
                    {leilao.img ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={leilao.img} alt={leilao.nome} className="h-full w-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#FFF9EE] via-[#FFF9EE]/18 to-transparent" />
                        </>
                    ) : (
                        <div className="flex h-full w-full items-center justify-center">
                            <div className="text-center">
                                <div className="text-7xl font-black leading-none text-[#A07732]">{p.dia}</div>
                                <div className="mt-2 text-base font-bold uppercase tracking-[4px] text-[#1E2519]/45">{p.mesAbrev}</div>
                            </div>
                        </div>
                    )}

                    <div className="absolute left-5 top-5 flex flex-wrap gap-2 sm:left-7 sm:top-7">
                        <span
                            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur-md"
                            style={{ color: badge.fg, background: badge.bg }}
                        >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: badge.dot }} />
                            {badge.label}
                        </span>
                        {countdown && (
                            <span className="rounded-full bg-[#D9B86F] px-3 py-1.5 text-xs font-bold text-[#1E2519]">{countdown}</span>
                        )}
                        {ytId && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C0504D]/90 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
                                <Radio className="h-3.5 w-3.5" /> Ao vivo
                            </span>
                        )}
                    </div>
                </div>

                <div className="p-6 sm:p-9">
                    {leilao.tipo && (
                        <span className="text-xs font-bold uppercase tracking-[1.5px] text-[#A07732]">{leilao.tipo}</span>
                    )}
                    <h1 className="mt-2 text-3xl sm:text-5xl font-extrabold leading-tight tracking-tight">{leilao.nome}</h1>
                    <p className="mt-3 text-base font-medium text-[#1E2519]/58">
                        {dataPorExtenso(leilao.data)}{leilao.horario ? ` · ${leilao.horario}` : ''}
                    </p>
                </div>
            </header>

            <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
                {/* ── Coluna principal ──────────────────────────── */}
                <div className="space-y-8">
                    {/* Transmissão */}
                    {ytId ? (
                        <section>
                            <SectionLabel icon={Radio}>Transmissão ao vivo</SectionLabel>
                            <div className="overflow-hidden rounded-lg border border-[#1E2519]/10 bg-black shadow-sm">
                                <div className="relative aspect-video">
                                    <iframe
                                        className="absolute inset-0 h-full w-full"
                                        src={`https://www.youtube.com/embed/${ytId}`}
                                        title={leilao.nome}
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                        allowFullScreen
                                    />
                                </div>
                            </div>
                        </section>
                    ) : leilao.transmissao ? (
                        <section>
                            <SectionLabel icon={Radio}>Transmissão</SectionLabel>
                            <a
                                href={leilao.transmissao}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-lg border border-[#1E2519]/10 bg-[#FFF9EE] px-5 py-3.5 text-sm font-bold text-[#1E2519] shadow-sm transition-colors hover:border-[#A07732]/40"
                            >
                                <ExternalLink className="h-4 w-4 text-[#A07732]" />
                                Assistir transmissão
                            </a>
                        </section>
                    ) : null}

                    {/* Informações */}
                    <section>
                        <SectionLabel icon={Tag}>Informações do remate</SectionLabel>
                        <div className="grid gap-px overflow-hidden rounded-lg border border-[#1E2519]/10 bg-[#1E2519]/10 shadow-sm sm:grid-cols-2">
                            {infos.map((info) => (
                                <div key={info.label} className="bg-[#FFF9EE] p-5">
                                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[1px] text-[#1E2519]/45">
                                        <info.icon className="h-3.5 w-3.5 text-[#A07732]" />
                                        {info.label}
                                    </div>
                                    <div className="mt-1.5 text-[15px] font-bold text-[#1E2519]">{info.value}</div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                {/* ── Sidebar ───────────────────────────────────── */}
                <aside className="space-y-6">
                    {/* Catálogo */}
                    {leilao.catalogo_url && (
                        <div className="rounded-lg border border-[#A07732]/25 bg-[#FFF9EE] p-6 shadow-sm">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#D9B86F]/20">
                                    <BookOpen className="h-5 w-5 text-[#A07732]" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-[#1E2519]">Catálogo do leilão</h3>
                                    <p className="text-xs font-medium text-[#1E2519]/48">Confira os lotes</p>
                                </div>
                            </div>
                            <div className="mt-4 flex flex-col gap-2">
                                <a
                                    href={leilao.catalogo_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#D9B86F] px-4 py-2.5 text-sm font-black text-[#1E2519] transition-all hover:brightness-105"
                                >
                                    <ExternalLink className="h-4 w-4" /> Abrir catálogo
                                </a>
                                <a
                                    href={leilao.catalogo_url}
                                    download
                                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#1E2519]/10 px-4 py-2.5 text-sm font-bold text-[#1E2519] transition-colors hover:bg-[#1E2519]/5"
                                >
                                    <Download className="h-4 w-4" /> Baixar PDF
                                </a>
                            </div>
                        </div>
                    )}

                    {/* Assessores */}
                    {leilao.assessores.length > 0 && (
                        <div className="rounded-lg border border-[#1E2519]/10 bg-[#FFF9EE] p-6 shadow-sm">
                            <h3 className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#A07732]">
                                Assessoria responsável
                            </h3>
                            <ul className="mt-4 space-y-3">
                                {leilao.assessores.map((a) => (
                                    <li key={a.id} className="flex items-center gap-3">
                                        <span
                                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                                            style={{ background: a.cor || '#A68B4B' }}
                                        >
                                            {a.iniciais}
                                        </span>
                                        <span className="text-sm font-bold text-[#1E2519]">{a.nome}</span>
                                    </li>
                                ))}
                            </ul>
                            <a
                                href="https://wa.me/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#1E2519]/10 px-4 py-2.5 text-sm font-bold text-[#1E2519] transition-colors hover:bg-[#1E2519]/5"
                            >
                                <Share2 className="h-4 w-4 text-[#A07732]" /> Falar com a assessoria
                            </a>
                        </div>
                    )}
                </aside>
            </div>

            {/* ── Outros leilões ────────────────────────────────── */}
            {outros.length > 0 && (
                <section className="mt-16">
                    <SectionLabel icon={CalendarDays}>Próximos leilões</SectionLabel>
                    <div className="grid gap-5 sm:grid-cols-3">
                        {outros.map((o) => (
                            <OutroCard key={o.id} leilao={o} />
                        ))}
                    </div>
                </section>
            )}
        </article>
    )
}

function SectionLabel({ icon: Icon, children }: { icon: typeof CalendarDays; children: React.ReactNode }) {
    return (
        <h2 className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[1.5px] text-[#A07732]">
            <Icon className="h-4 w-4 text-[#A07732]" />
            {children}
        </h2>
    )
}

function OutroCard({ leilao }: { leilao: LeilaoPublico }) {
    const p = parseData(leilao.data)
    return (
        <Link
            href={`/agenda/${leilao.id}`}
            className="group flex items-center gap-4 rounded-lg border border-[#1E2519]/10 bg-[#FFF9EE] p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#A07732]/40"
        >
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-[#EFE5D7]">
                <span className="text-xl font-black leading-none text-[#A07732]">{p.dia}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#1E2519]/45">{p.mesAbrev}</span>
            </div>
            <div className="min-w-0">
                <h3 className="truncate text-sm font-black text-[#1E2519] transition-colors group-hover:text-[#355334]">{leilao.nome}</h3>
                {leilao.local && <p className="mt-0.5 truncate text-xs font-medium text-[#1E2519]/48">{leilao.local}</p>}
            </div>
        </Link>
    )
}
