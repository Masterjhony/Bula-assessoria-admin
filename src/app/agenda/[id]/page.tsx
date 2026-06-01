import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
    ArrowLeft, BookOpen, CalendarDays, Clock, Download, ExternalLink, Gavel,
    MapPin, MessageCircle, Radio, Share2, Tag, Truck, Tv, Users,
} from 'lucide-react'
import { getLeilaoPublico, getLeiloesPublicos, type LeilaoPublico } from '@/lib/bula/public-leiloes'
import {
    contagemRegressiva, dataPorExtenso, parseData, statusPublico, youtubeId, WHATSAPP_CTA_URL,
} from '../helpers'

export const revalidate = 120

type InfoItem = {
    icon: typeof CalendarDays
    label: string
    value: string
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const leilao = await getLeilaoPublico(id)
    if (!leilao) return { title: 'Leilão não encontrado | Bula Assessoria' }

    const description = [
        dataPorExtenso(leilao.data),
        leilao.criador,
        leilao.local,
        leilao.modelo,
        leilao.leiloeira,
    ].filter(Boolean).join(' | ')

    return {
        title: `${leilao.nome} | Bula Assessoria`,
        description: `${description}. Catálogo, transmissão e detalhes do leilão.`,
        openGraph: {
            title: leilao.nome,
            description,
            images: leilao.img ? [leilao.img] : undefined,
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
    const todos = await getLeiloesPublicos()
    const outros = todos
        .filter((item) => item.id !== leilao.id)
        .sort((a, b) => parseData(a.data).time - parseData(b.data).time)
        .slice(0, 3)

    const infos = [
        { icon: CalendarDays, label: 'Data', value: dataPorExtenso(leilao.data) },
        leilao.horario ? { icon: Clock, label: 'Horário', value: leilao.horario } : null,
        leilao.criador ? { icon: Users, label: 'Criatório', value: leilao.criador } : null,
        leilao.local ? { icon: MapPin, label: 'Local', value: leilao.local } : null,
        leilao.modelo ? { icon: Tv, label: 'Modelo', value: leilao.modelo } : null,
        leilao.leiloeira ? { icon: Gavel, label: 'Leiloeira', value: leilao.leiloeira } : null,
        leilao.animais && leilao.animais > 0 ? { icon: Users, label: 'Animais', value: String(leilao.animais) } : null,
        leilao.condicao ? { icon: Tag, label: 'Condição', value: leilao.condicao } : null,
        leilao.frete_gratis ? { icon: Truck, label: 'Frete grátis', value: leilao.frete_gratis } : null,
    ].filter(Boolean) as InfoItem[]

    return (
        <article className="bg-white text-black">
            <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
                <Link
                    href="/agenda"
                    className="inline-flex items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-bold text-black/64 transition-colors hover:border-black/25 hover:text-black"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar à agenda
                </Link>

                <header className="mt-6 overflow-hidden rounded-md border border-black/10 bg-white shadow-sm">
                    <div className="bg-black px-3 py-4 sm:px-5 sm:py-6">
                        <div className="mx-auto flex max-w-4xl items-center justify-center">
                            {leilao.img ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={leilao.img}
                                    alt={leilao.nome}
                                    className="max-h-[calc(100svh-220px)] max-w-full rounded-sm object-contain sm:max-h-[calc(100svh-190px)]"
                                />
                            ) : (
                                <div className="py-16 text-center text-white">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src="/logo-bula-assessoria-white.png" alt="" className="mx-auto mb-8 h-12 w-auto opacity-80" />
                                    <div className="text-8xl font-black leading-none">{p.dia}</div>
                                    <div className="mt-2 text-sm font-black uppercase text-white/45">{p.mesAbrev}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-6 sm:p-8 lg:p-10">
                        <div className="flex flex-wrap gap-2">
                            <span
                                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-black shadow-sm"
                                style={{ color: badge.fg, background: badge.bg, borderColor: badge.dot === '#16a34a' ? 'rgba(22,101,52,0.18)' : 'rgba(0,0,0,0.08)' }}
                            >
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: badge.dot }} />
                                {badge.label}
                            </span>
                            {countdown && (
                                <span className="rounded-md bg-black px-3 py-1.5 text-xs font-black text-white shadow-sm">
                                    {countdown}
                                </span>
                            )}
                            {ytId && (
                                <span className="inline-flex items-center gap-1.5 rounded-md bg-black px-3 py-1.5 text-xs font-black text-white shadow-sm">
                                    <Radio className="h-3.5 w-3.5" />
                                    Ao vivo
                                </span>
                            )}
                            {leilao.tipo && (
                                <span className="rounded-md border border-black/10 bg-black/[0.04] px-3 py-1.5 text-xs font-black uppercase text-black/62">
                                    {leilao.tipo}
                                </span>
                            )}
                        </div>

                        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                            <div>
                                <h1 className="max-w-4xl text-4xl font-black leading-[0.96] tracking-tight text-black sm:text-6xl">
                                    {leilao.nome}
                                </h1>
                                <p className="mt-4 text-base font-semibold leading-relaxed text-black/62">
                                    {dataPorExtenso(leilao.data)}
                                    {leilao.horario ? ` às ${leilao.horario}` : ''}
                                    {leilao.local ? ` | ${leilao.local}` : ''}
                                </p>

                                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-black/62">
                                    {leilao.criador && (
                                        <span className="inline-flex items-center gap-2">
                                            <Users className="h-4 w-4 text-black" />
                                            {leilao.criador}
                                        </span>
                                    )}
                                    {!!leilao.animais && leilao.animais > 0 && (
                                        <span className="inline-flex items-center gap-2">
                                            <Users className="h-4 w-4 text-black" />
                                            {leilao.animais} animais na oferta
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 lg:justify-end">
                                {leilao.img && (
                                    <a
                                        href={leilao.img}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-2 rounded-md border border-black/10 px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-black/5"
                                    >
                                        <BookOpen className="h-4 w-4" />
                                        Abrir capa completa
                                    </a>
                                )}
                                <a
                                    href={WHATSAPP_CTA_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-2 rounded-md bg-black px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-neutral-800"
                                >
                                    <MessageCircle className="h-4 w-4" />
                                    Fale com um assessor
                                </a>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_360px]">
                    <main className="space-y-8">
                        {ytId ? (
                            <section>
                                <SectionLabel icon={Radio}>Transmissão ao vivo</SectionLabel>
                                <div className="overflow-hidden rounded-md border border-black/10 bg-black shadow-sm">
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
                                    className="inline-flex items-center gap-2 rounded-md border border-black bg-black px-5 py-3 text-sm font-black text-white transition-colors hover:bg-neutral-800"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                    Assistir transmissão
                                </a>
                            </section>
                        ) : null}

                        <section>
                            <SectionLabel icon={Tag}>Informações do leilão</SectionLabel>
                            <div className="grid gap-px overflow-hidden rounded-md border border-black/10 bg-black/10 shadow-sm sm:grid-cols-2">
                                {infos.map((info) => (
                                    <div key={info.label} className="bg-white p-5">
                                        <div className="flex items-center gap-2 text-[11px] font-black uppercase text-black/45">
                                            <info.icon className="h-3.5 w-3.5 text-black" />
                                            {info.label}
                                        </div>
                                        <div className="mt-2 text-[15px] font-black text-black">{info.value}</div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-md border border-black bg-black p-6 text-white shadow-sm sm:p-8">
                            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <span className="text-[11px] font-black uppercase text-white/48">
                                        Condição em destaque
                                    </span>
                                    <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                                        Quer comprar touros e matrizes?
                                    </h2>
                                    <p className="mt-2 max-w-xl text-sm font-semibold leading-relaxed text-white/58">
                                        Receba ofertas exclusivas no grupo de WhatsApp e fale com a equipe da Bula
                                        para encontrar a melhor oportunidade no leilão.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                    <div className="flex flex-wrap gap-2">
                                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">PO</span>
                                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">30X</span>
                                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">Frete</span>
                                    </div>
                                    <a
                                        href={WHATSAPP_CTA_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-black text-black transition-colors hover:bg-white/88"
                                        style={{ color: '#050505' }}
                                    >
                                        <MessageCircle className="h-4 w-4" />
                                        Grupo de WhatsApp
                                    </a>
                                </div>
                            </div>
                        </section>
                    </main>

                    <aside className="space-y-6">
                        {leilao.catalogo_url && (
                            <div className="rounded-md border border-black/10 bg-white p-6 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-md bg-black text-white">
                                        <BookOpen className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-black text-black">Catálogo do leilão</h2>
                                        <p className="text-xs font-semibold text-black/48">Confira os lotes disponíveis</p>
                                    </div>
                                </div>
                                <div className="mt-5 flex flex-col gap-2">
                                    <a
                                        href={leilao.catalogo_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-2 rounded-md bg-black px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-neutral-800"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                        Abrir catálogo
                                    </a>
                                    <a
                                        href={leilao.catalogo_url}
                                        download
                                        className="inline-flex items-center justify-center gap-2 rounded-md border border-black/10 px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-black/5"
                                    >
                                        <Download className="h-4 w-4" />
                                        Baixar PDF
                                    </a>
                                </div>
                            </div>
                        )}

                        <div className="rounded-md border border-black/10 bg-white p-6 shadow-sm">
                            <span className="text-[11px] font-black uppercase text-black/45">Status</span>
                            <div className="mt-3 flex items-center justify-between gap-4">
                                <div>
                                    <p style={{ color: badge.fg }} className="text-xl font-black">{badge.label}</p>
                                    <p className="text-sm font-semibold text-black/50">{p.diaSemana}</p>
                                </div>
                                <div
                                    className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md border"
                                    style={{ background: badge.bg, borderColor: badge.dot === '#16a34a' ? 'rgba(22,101,52,0.18)' : 'rgba(0,0,0,0.08)', color: badge.fg }}
                                >
                                    <span className="text-xl font-black leading-none">{p.dia}</span>
                                    <span className="text-[10px] font-black uppercase opacity-65">{p.mesAbrev}</span>
                                </div>
                            </div>
                        </div>

                        {leilao.assessores.length > 0 && (
                            <div className="rounded-md border border-black/10 bg-white p-6 shadow-sm">
                                <span className="text-[11px] font-black uppercase text-black/45">
                                    Assessoria responsável
                                </span>
                                <ul className="mt-4 space-y-3">
                                    {leilao.assessores.map((assessor) => (
                                        <li key={assessor.id} className="flex items-center gap-3">
                                            <span
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black text-white"
                                                style={{ background: assessor.cor || '#000' }}
                                            >
                                                {assessor.iniciais}
                                            </span>
                                            <span className="text-sm font-black text-black">{assessor.nome}</span>
                                        </li>
                                    ))}
                                </ul>
                                <a
                                    href={WHATSAPP_CTA_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border border-black/10 px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-black/5"
                                >
                                    <Share2 className="h-4 w-4" />
                                    Falar com a assessoria
                                </a>
                            </div>
                        )}
                    </aside>
                </div>

                {outros.length > 0 && (
                    <section className="mt-16">
                        <SectionLabel icon={CalendarDays}>Outros leilões da agenda</SectionLabel>
                        <div className="grid gap-5 sm:grid-cols-3">
                            {outros.map((item) => (
                                <OutroCard key={item.id} leilao={item} />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </article>
    )
}

function SectionLabel({ icon: Icon, children }: { icon: typeof CalendarDays; children: React.ReactNode }) {
    return (
        <h2 className="mb-4 flex items-center gap-2 text-[11px] font-black uppercase text-black/45">
            <Icon className="h-4 w-4 text-black" />
            {children}
        </h2>
    )
}

function OutroCard({ leilao }: { leilao: LeilaoPublico }) {
    const p = parseData(leilao.data)

    return (
        <Link
            href={`/agenda/${leilao.id}`}
            className="group flex items-center gap-4 rounded-md border border-black/10 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-black/25"
        >
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md bg-black text-white">
                <span className="text-xl font-black leading-none">{p.dia}</span>
                <span className="text-[10px] font-black uppercase text-white/48">{p.mesAbrev}</span>
            </div>
            <div className="min-w-0">
                <h3 className="truncate text-sm font-black text-black transition-colors group-hover:text-black/70">
                    {leilao.nome}
                </h3>
                {leilao.local && <p className="mt-0.5 truncate text-xs font-semibold text-black/48">{leilao.local}</p>}
            </div>
        </Link>
    )
}
