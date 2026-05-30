import Link from 'next/link'
import { ArrowRight, BookOpen, CalendarDays, MapPin, Radio, Users } from 'lucide-react'
import { getLeiloesPublicos } from '@/lib/bula/public-leiloes'
import { AgendaGrid } from './AgendaGrid'
import {
    parseData, dataPorExtenso, isFuturo, contagemRegressiva, youtubeId,
} from './helpers'

export const revalidate = 120

export default async function AgendaPage() {
    const leiloes = await getLeiloesPublicos()
    const proximos = leiloes
        .filter((l) => isFuturo(l.data) && l.status === 'confirmado')
        .sort((a, b) => parseData(a.data).time - parseData(b.data).time)
    const destaque = proximos[0] ?? null
    const totalFuturos = proximos.length
    const totalAnimais = proximos.reduce((sum, l) => sum + (l.animais || 0), 0)
    const heroImage = '/bula/assets/img/agenda-hero-nelore.png'

    return (
        <>
            <section className="relative overflow-hidden border-b border-[#1E2519]/10">
                <div className="absolute inset-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={heroImage}
                        alt=""
                        className="h-full w-full object-cover object-[70%_50%]"
                    />
                    <div className="absolute inset-0 bg-[#F7F1E8]/86 sm:hidden" />
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(247,241,232,0.96)_0%,rgba(247,241,232,0.82)_38%,rgba(247,241,232,0.18)_66%,rgba(30,37,25,0.03)_100%)]" />
                    <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#F7F1E8] to-transparent" />
                </div>

                <div className="relative mx-auto grid min-h-[560px] max-w-7xl content-center px-5 py-16 sm:px-8 lg:min-h-[640px]">
                    <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-2 rounded-lg border border-[#A07732]/30 bg-[#FFF9EE]/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[1.5px] text-[#8E6426] shadow-sm backdrop-blur">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#355334]" />
                            Temporada {new Date().getFullYear()}
                        </div>
                        <h1 className="mt-6 max-w-2xl text-5xl font-black leading-[0.98] text-[#1E2519] sm:text-7xl lg:text-8xl">
                            Agenda de leilões
                        </h1>
                        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#1E2519]/70 sm:text-xl">
                            Datas, catálogos, transmissões e detalhes dos remates assessorados pela Bula,
                            com a informação certa para você chegar pronto no dia da martelada.
                        </p>

                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link
                                href="#proximos"
                                className="inline-flex items-center gap-2 rounded-lg bg-[#355334] px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                                style={{ color: '#fff' }}
                            >
                                Ver agenda
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                            <a
                                href="https://wa.me/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-lg border border-[#1E2519]/15 bg-white/55 px-5 py-3 text-sm font-bold text-[#1E2519] shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white"
                                style={{ color: '#1E2519' }}
                            >
                                Falar com a assessoria
                            </a>
                        </div>

                        <div className="mt-10 grid max-w-xl grid-cols-3 overflow-hidden rounded-lg border border-[#1E2519]/10 bg-white/68 shadow-sm backdrop-blur">
                            <HeroMetric value={totalFuturos} label={totalFuturos === 1 ? 'leilão à frente' : 'leilões à frente'} />
                            <HeroMetric value={totalAnimais || '—'} label="animais na agenda" />
                            <HeroMetric value="24h" label="agenda atualizada" />
                        </div>
                    </div>
                </div>
            </section>

            {destaque && (
                <section className="mx-auto max-w-7xl px-5 sm:px-8 -mt-10 relative z-10">
                    <DestaqueBanner leilao={destaque} />
                </section>
            )}

            <section id="proximos" className="mx-auto max-w-7xl px-5 sm:px-8 mt-16 sm:mt-20">
                <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#A07732]">
                            Calendário de remates
                        </span>
                        <h2 className="mt-2 text-3xl font-black tracking-tight text-[#1E2519] sm:text-4xl">
                            Próximos eventos
                        </h2>
                    </div>
                    <p className="max-w-lg text-sm leading-relaxed text-[#1E2519]/62">
                        Eventos organizados por mês, com filtros para próximos, realizados e busca por nome ou local.
                    </p>
                </div>
                <AgendaGrid leiloes={leiloes} />
            </section>
        </>
    )
}

function HeroMetric({ value, label }: { value: number | string; label: string }) {
    return (
        <div className="border-r border-[#1E2519]/10 px-4 py-4 last:border-r-0">
            <div className="text-2xl font-black leading-none text-[#355334]">{value}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.8px] text-[#1E2519]/52">{label}</div>
        </div>
    )
}

function DestaqueBanner({ leilao }: { leilao: Awaited<ReturnType<typeof getLeiloesPublicos>>[number] }) {
    const p = parseData(leilao.data)
    const countdown = contagemRegressiva(leilao.data)
    const aoVivo = !!youtubeId(leilao.transmissao)

    return (
        <Link
            href={`/agenda/${leilao.id}`}
            className="group block overflow-hidden rounded-lg border border-[#A07732]/25 bg-[#FFF9EE] shadow-[0_24px_60px_-34px_rgba(30,37,25,0.5)] transition-all hover:-translate-y-1 hover:border-[#A07732]/45 hover:shadow-[0_34px_70px_-38px_rgba(30,37,25,0.55)]"
        >
            <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
                <div className="flex flex-col justify-center p-6 sm:p-8 lg:min-h-[380px] lg:p-10">
                    <div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[1.5px] text-[#A07732]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#355334]" />
                            Próximo leilão
                            {countdown && (
                                <span className="rounded-full bg-[#355334]/10 px-2.5 py-1 text-[11px] normal-case tracking-normal text-[#355334]">
                                    {countdown}
                                </span>
                            )}
                        </div>
                        <h3 className="mt-4 text-3xl font-black leading-tight text-[#1E2519] sm:text-5xl">
                            {leilao.nome}
                        </h3>
                        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-[#1E2519]/64">
                            <span className="inline-flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-[#A07732]" />
                                {dataPorExtenso(leilao.data)}{leilao.horario ? ` · ${leilao.horario}` : ''}
                            </span>
                            {leilao.local && (
                                <span className="inline-flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-[#A07732]" />
                                    {leilao.local}
                                </span>
                            )}
                            {aoVivo && (
                                <span className="inline-flex items-center gap-2 text-[#B14236]">
                                    <Radio className="h-4 w-4" />
                                    Transmissão ao vivo
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-2 rounded-lg bg-[#D9B86F] px-5 py-3 text-sm font-black text-[#1E2519] transition-all group-hover:gap-3">
                            Ver detalhes
                            <ArrowRight className="h-4 w-4" />
                        </span>
                        {!!leilao.animais && leilao.animais > 0 && (
                            <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#1E2519]/55">
                                <Users className="h-4 w-4 text-[#A07732]" /> {leilao.animais} animais
                            </span>
                        )}
                        {leilao.catalogo_url && (
                            <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#1E2519]/55">
                                <BookOpen className="h-4 w-4 text-[#A07732]" /> Catálogo disponível
                            </span>
                        )}
                    </div>
                </div>

                <div className="relative min-h-[260px] overflow-hidden bg-[#E8DDCC] lg:min-h-[380px]">
                    {leilao.img ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={leilao.img}
                                alt={leilao.nome}
                                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-r from-[#FFF9EE]/30 via-transparent to-transparent lg:from-transparent" />
                        </>
                    ) : (
                        <div className="flex h-full min-h-[260px] w-full items-center justify-center">
                            <div className="text-center">
                                <div className="text-7xl font-black leading-none text-[#A07732]">{p.dia}</div>
                                <div className="mt-1 text-sm font-bold uppercase tracking-[3px] text-[#1E2519]/45">{p.mesAbrev}</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Link>
    )
}
