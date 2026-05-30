import Link from 'next/link'
import { ArrowRight, CalendarDays, MapPin, Radio } from 'lucide-react'
import { getLeiloesPublicos } from '@/lib/bula/public-leiloes'
import { AgendaGrid } from './AgendaGrid'
import {
    parseData, dataPorExtenso, isFuturo, contagemRegressiva, youtubeId,
} from './helpers'

export const revalidate = 120 // ISR: agenda atualiza a cada 2 min

export default async function AgendaPage() {
    const leiloes = await getLeiloesPublicos()

    // Próximo leilão confirmado no futuro = destaque do topo.
    const proximos = leiloes
        .filter((l) => isFuturo(l.data) && l.status === 'confirmado')
        .sort((a, b) => parseData(a.data).time - parseData(b.data).time)
    const destaque = proximos[0] ?? null
    const totalFuturos = proximos.length

    return (
        <>
            {/* ── HERO ──────────────────────────────────────────── */}
            <section className="relative overflow-hidden border-b border-white/[0.06]">
                <div
                    className="pointer-events-none absolute -top-40 right-0 h-[420px] w-[420px] rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(200,169,110,0.16) 0%, transparent 70%)' }}
                />
                <div
                    className="pointer-events-none absolute -bottom-40 -left-20 h-[360px] w-[360px] rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(107,143,92,0.10) 0%, transparent 70%)' }}
                />
                <div className="relative mx-auto max-w-6xl px-5 sm:px-8 pt-16 pb-12 sm:pt-24 sm:pb-16">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#C8A96E]/30 bg-[#C8A96E]/[0.08] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[1.5px] text-[#C8A96E]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#C8A96E] animate-pulse" />
                        Temporada {new Date().getFullYear()}
                    </div>
                    <h1 className="mt-6 max-w-3xl text-4xl sm:text-6xl font-extrabold leading-[1.05] tracking-tight">
                        Agenda de{' '}
                        <span style={{ background: 'linear-gradient(120deg, #C8A96E, #E6D2A8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            Leilões
                        </span>
                    </h1>
                    <p className="mt-5 max-w-xl text-base sm:text-lg text-white/55 leading-relaxed">
                        Acompanhe os remates assessorados pela Bula. Datas, catálogos,
                        transmissões ao vivo e tudo que você precisa para chegar pronto na martelada.
                    </p>
                    {totalFuturos > 0 && (
                        <p className="mt-6 text-sm text-white/40">
                            <span className="font-semibold text-[#C8A96E]">{totalFuturos}</span>{' '}
                            {totalFuturos === 1 ? 'leilão confirmado' : 'leilões confirmados'} à frente
                        </p>
                    )}
                </div>
            </section>

            {/* ── DESTAQUE: próximo leilão ──────────────────────── */}
            {destaque && (
                <section className="mx-auto max-w-6xl px-5 sm:px-8 mt-10 sm:mt-14">
                    <DestaqueBanner leilao={destaque} />
                </section>
            )}

            {/* ── GRID com filtros ──────────────────────────────── */}
            <section id="proximos" className="mx-auto max-w-6xl px-5 sm:px-8 mt-14 sm:mt-20">
                <AgendaGrid leiloes={leiloes} />
            </section>
        </>
    )
}

function DestaqueBanner({ leilao }: { leilao: Awaited<ReturnType<typeof getLeiloesPublicos>>[number] }) {
    const p = parseData(leilao.data)
    const countdown = contagemRegressiva(leilao.data)
    const aoVivo = !!youtubeId(leilao.transmissao)

    return (
        <Link
            href={`/agenda/${leilao.id}`}
            className="group relative block overflow-hidden rounded-2xl border border-[#C8A96E]/25 bg-[#141414] transition-all hover:border-[#C8A96E]/50"
        >
            <div className="grid sm:grid-cols-[1.1fr_1fr]">
                {/* Texto */}
                <div className="relative z-10 p-7 sm:p-10 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-[#C8A96E]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#C8A96E]" />
                            Próximo leilão
                            {countdown && (
                                <span className="ml-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-white/70 normal-case tracking-normal">
                                    {countdown}
                                </span>
                            )}
                        </div>
                        <h2 className="mt-4 text-2xl sm:text-4xl font-extrabold leading-tight tracking-tight">
                            {leilao.nome}
                        </h2>
                        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2.5 text-sm text-white/60">
                            <span className="inline-flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-[#C8A96E]" />
                                {dataPorExtenso(leilao.data)}{leilao.horario ? ` · ${leilao.horario}` : ''}
                            </span>
                            {leilao.local && (
                                <span className="inline-flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-[#C8A96E]" />
                                    {leilao.local}
                                </span>
                            )}
                            {aoVivo && (
                                <span className="inline-flex items-center gap-2 text-[#C0504D]">
                                    <Radio className="h-4 w-4" />
                                    Transmissão ao vivo
                                </span>
                            )}
                        </div>
                    </div>
                    <span className="mt-8 inline-flex w-fit items-center gap-2 rounded-xl bg-[#C8A96E] px-5 py-3 text-sm font-bold text-black transition-all group-hover:gap-3 group-hover:brightness-110">
                        Ver detalhes
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                </div>

                {/* Imagem / data card */}
                <div className="relative min-h-[220px] sm:min-h-full overflow-hidden">
                    {leilao.img ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={leilao.img}
                                alt={leilao.nome}
                                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/40 to-transparent sm:bg-gradient-to-l sm:from-transparent sm:via-[#141414]/30 sm:to-[#141414]" />
                        </>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1A1A1A] to-[#0D0D0D]">
                            <div className="text-center">
                                <div className="text-6xl font-extrabold leading-none text-[#C8A96E]">{p.dia}</div>
                                <div className="mt-1 text-sm font-semibold uppercase tracking-[3px] text-white/40">{p.mesAbrev}</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Link>
    )
}
