import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
    ArrowLeft, ArrowRight, BookOpen, CalendarDays, Clock, Download, ExternalLink, Gavel,
    MapPin, MessageCircle, Radio, Share2, Tag, Truck, Tv, Users,
} from 'lucide-react'
import { getLeilaoPublico } from '@/lib/bula/public-leiloes'
import {
    contagemRegressiva, dataPorExtenso, localExibivel, parseData, statusPublico, youtubeId, WHATSAPP_CTA_URL,
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
        localExibivel(leilao.local),
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
    const transmissaoUrl = leilao.transmissao?.trim() || null
    const local = localExibivel(leilao.local)

    const infos = [
        { icon: CalendarDays, label: 'Data', value: dataPorExtenso(leilao.data) },
        leilao.horario ? { icon: Clock, label: 'Horário', value: leilao.horario } : null,
        leilao.criador ? { icon: Users, label: 'Criatório', value: leilao.criador } : null,
        local ? { icon: MapPin, label: 'Local', value: local } : null,
        leilao.modelo ? { icon: Tv, label: 'Modelo', value: leilao.modelo } : null,
        leilao.leiloeira ? { icon: Gavel, label: 'Leiloeira', value: leilao.leiloeira } : null,
        leilao.animais && leilao.animais > 0 ? { icon: Users, label: 'Animais', value: String(leilao.animais) } : null,
        leilao.condicao ? { icon: Tag, label: 'Condição', value: leilao.condicao } : null,
        leilao.frete_gratis ? { icon: Truck, label: 'Frete grátis', value: leilao.frete_gratis } : null,
    ].filter(Boolean) as InfoItem[]

    return (
        <article className="bg-[#0A0A0A] text-white">
            <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
                <Link
                    href="/agenda"
                    className="inline-flex items-center gap-2 rounded-md border border-white/12 bg-[#141414] px-3 py-2 text-sm font-bold text-white/64 transition-colors hover:border-[#C9A84C]/40 hover:text-white"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar à agenda
                </Link>

                <header className="mt-6 grid overflow-hidden rounded-md border border-white/10 bg-[#141414] shadow-[0_28px_70px_-42px_rgba(0,0,0,0.9)] lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
                    <div className="min-h-[320px] bg-black sm:min-h-[440px] lg:min-h-[620px]">
                        <div className="relative flex h-full min-h-[320px] items-center justify-center overflow-hidden sm:min-h-[440px] lg:min-h-[620px]">
                            {leilao.img ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={leilao.img}
                                    alt={leilao.nome}
                                    className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.025]"
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center bg-black py-16 text-center text-white">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src="/logo-bula-assessoria-white.png" alt="" className="mx-auto mb-8 h-12 w-auto opacity-80" />
                                    <div className="font-display text-8xl leading-none text-[#C9A84C]">{p.dia}</div>
                                    <div className="mt-2 text-sm font-black uppercase text-white/45">{p.mesAbrev}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col justify-between gap-8 p-6 sm:p-8 lg:justify-center lg:p-10">
                        <div className="flex flex-wrap gap-2">
                            <span
                                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-black shadow-sm"
                                style={{ color: badge.fg, background: badge.bg, borderColor: badge.dot === '#C9A84C' ? 'rgba(201,168,76,0.28)' : 'rgba(255,255,255,0.12)' }}
                            >
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: badge.dot }} />
                                {badge.label}
                            </span>
                            {countdown && (
                                <span className="rounded-md border border-[#C9A84C]/35 bg-[#C9A84C]/12 px-3 py-1.5 text-xs font-black text-[#E8DBB8] shadow-sm">
                                    {countdown}
                                </span>
                            )}
                            {transmissaoUrl && (
                                <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-black text-[#0A0A0A] shadow-sm">
                                    <Radio className="h-3.5 w-3.5" />
                                    Ao vivo
                                </span>
                            )}
                            {leilao.tipo && (
                                <span className="rounded-md border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-black uppercase text-white/62">
                                    {leilao.tipo}
                                </span>
                            )}
                        </div>

                        <div className="flex flex-col gap-6">
                            <div>
                                <h1 className="font-display max-w-4xl text-5xl uppercase leading-[0.9] tracking-tight text-white sm:text-6xl">
                                    {leilao.nome}
                                </h1>
                                <p className="mt-4 text-base font-semibold leading-relaxed text-white/62">
                                    {dataPorExtenso(leilao.data)}
                                    {leilao.horario ? ` às ${leilao.horario}` : ''}
                                    {local ? ` | ${local}` : ''}
                                </p>

                                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-white/62">
                                    {leilao.criador && (
                                        <span className="inline-flex items-center gap-2">
                                            <Users className="h-4 w-4 text-[#C9A84C]" />
                                            {leilao.criador}
                                        </span>
                                    )}
                                    {!!leilao.animais && leilao.animais > 0 && (
                                        <span className="inline-flex items-center gap-2">
                                            <Users className="h-4 w-4 text-white/50" />
                                            {leilao.animais} animais na oferta
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {transmissaoUrl && (
                                    <a
                                        href={transmissaoUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-2 rounded-md bg-[#C9A84C] px-4 py-2.5 text-sm font-black text-[#0A0A0A] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#d8ba63]"
                                    >
                                        <Radio className="h-4 w-4" />
                                        Assistir ao vivo
                                    </a>
                                )}
                                {leilao.img && (
                                    <a
                                        href={leilao.img}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-2 rounded-md border border-[#C9A84C]/40 px-4 py-2.5 text-sm font-bold text-[#C9A84C] transition-colors hover:bg-[#C9A84C]/10"
                                    >
                                        <BookOpen className="h-4 w-4" />
                                        Abrir capa completa
                                    </a>
                                )}
                                <a
                                    href={WHATSAPP_CTA_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-black shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white/90"
                                    style={{ color: '#0A0A0A' }}
                                >
                                    <MessageCircle className="h-4 w-4" />
                                    Entrar no grupo
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
                                <div className="overflow-hidden rounded-md border border-white/10 bg-black shadow-sm">
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
                        ) : null}

                        <section>
                            <SectionLabel icon={Tag}>Informações do leilão</SectionLabel>
                            <div className="grid gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 sm:grid-cols-2">
                                {infos.map((info) => (
                                    <div key={info.label} className="bg-[#141414] p-5">
                                        <div className="flex items-center gap-2 text-[11px] font-black uppercase text-white/45">
                                            <info.icon className="h-3.5 w-3.5 text-[#C9A84C]" />
                                            {info.label}
                                        </div>
                                        <div className="mt-2 text-[15px] font-black text-white">{info.value}</div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </main>

                    <aside className="space-y-6">
                        {leilao.catalogo_url && (
                            <div className="rounded-md border border-white/10 bg-[#141414] p-6 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#C9A84C] text-[#0A0A0A]">
                                        <BookOpen className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-black text-white">Catálogo do leilão</h2>
                                        <p className="text-xs font-semibold text-white/48">Confira os lotes disponíveis</p>
                                    </div>
                                </div>
                                <div className="mt-5 flex flex-col gap-2">
                                    <a
                                        href={leilao.catalogo_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-2 rounded-md bg-[#C9A84C] px-4 py-2.5 text-sm font-black text-[#0A0A0A] transition-all hover:bg-[#d8ba63]"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                        Abrir catálogo
                                    </a>
                                    <a
                                        href={leilao.catalogo_url}
                                        download
                                        className="inline-flex items-center justify-center gap-2 rounded-md border border-[#C9A84C]/40 px-4 py-2.5 text-sm font-bold text-[#C9A84C] transition-colors hover:bg-[#C9A84C]/10"
                                    >
                                        <Download className="h-4 w-4" />
                                        Baixar PDF
                                    </a>
                                </div>
                            </div>
                        )}

                        <div className="rounded-md border border-white/10 bg-[#141414] p-6 shadow-sm">
                            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[#C9A84C]">Status</span>
                            <div className="mt-3 flex items-center justify-between gap-4">
                                <div>
                                    <p style={{ color: badge.fg }} className="text-xl font-black">{badge.label}</p>
                                    <p className="text-sm font-semibold text-white/50">{p.diaSemana}</p>
                                </div>
                                <div
                                    className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md border"
                                    style={{ background: badge.bg, borderColor: badge.dot === '#C9A84C' ? 'rgba(201,168,76,0.28)' : 'rgba(255,255,255,0.12)', color: badge.fg }}
                                >
                                    <span className="text-xl font-black leading-none">{p.dia}</span>
                                    <span className="text-[10px] font-black uppercase opacity-65">{p.mesAbrev}</span>
                                </div>
                            </div>
                        </div>

                        {leilao.assessores.length > 0 && (
                            <div className="rounded-md border border-white/10 bg-[#141414] p-6 shadow-sm">
                                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[#C9A84C]">
                                    Assessoria responsável
                                </span>
                                <ul className="mt-4 space-y-3">
                                    {leilao.assessores.map((assessor) => (
                                        <li key={assessor.id} className="flex items-center gap-3">
                                            <span
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black text-white ring-1 ring-white/10"
                                                style={{ background: assessor.cor || '#2A2A2A' }}
                                            >
                                                {assessor.iniciais}
                                            </span>
                                            <span className="text-sm font-black text-white">{assessor.nome}</span>
                                        </li>
                                    ))}
                                </ul>
                                <a
                                    href={WHATSAPP_CTA_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-black shadow-sm transition-colors hover:bg-white/90"
                                    style={{ color: '#0A0A0A' }}
                                >
                                    <Share2 className="h-4 w-4" />
                                    Falar com a assessoria
                                </a>
                            </div>
                        )}
                    </aside>
                </div>

                {/* CTA do grupo de WhatsApp — largura total abaixo do grid (brandbook: sóbrio, dourado cirúrgico) */}
                <section className="relative mt-8 overflow-hidden rounded-2xl border border-[#C9A84C]/25 bg-[#141414] p-6 text-white shadow-sm sm:p-8 lg:p-10">
                    <div
                        aria-hidden
                        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#C9A84C]/[0.08] blur-3xl sm:-right-10"
                    />
                    <div
                        aria-hidden
                        className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-white/[0.03] blur-3xl"
                    />
                    <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
                        <div className="min-w-0">
                            <span className="inline-flex items-center gap-2 rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-[#E8DBB8]">
                                <MessageCircle className="h-3.5 w-3.5" />
                                Grupo de WhatsApp
                            </span>
                            <h2 className="font-display mt-4 text-3xl uppercase leading-[0.98] tracking-tight sm:text-4xl">
                                Entre no grupo da Bula
                            </h2>
                            <p className="mt-3 max-w-xl text-sm font-semibold leading-relaxed text-white/60 sm:text-[15px]">
                                Receba alertas de leilões, catálogos e condições comerciais direto no WhatsApp.
                            </p>
                        </div>
                        <a
                            href={WHATSAPP_CTA_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-black shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 active:translate-y-0 lg:w-auto"
                            style={{ color: '#0A0A0A' }}
                        >
                            <MessageCircle className="h-4 w-4" />
                            Entrar no grupo
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </a>
                    </div>
                </section>
            </div>
        </article>
    )
}

function SectionLabel({ icon: Icon, children }: { icon: typeof CalendarDays; children: React.ReactNode }) {
    return (
        <h2 className="mb-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#C9A84C]">
            <Icon className="h-4 w-4 text-[#C9A84C]" />
            {children}
        </h2>
    )
}
