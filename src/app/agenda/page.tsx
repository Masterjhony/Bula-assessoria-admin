import Link from 'next/link'
import {
    ArrowRight, BookOpen, CalendarDays, CheckCircle2, ExternalLink, MapPin, Radio, Search,
    ShieldCheck, Truck, Users,
} from 'lucide-react'
import {
    getCriatoriosParceirosMes,
    getLeiloesPublicos,
    type CriatorioParceiroPublico,
    type LeilaoPublico,
} from '@/lib/bula/public-leiloes'
import { AgendaGrid } from './AgendaGrid'
import {
    parseData, dataPorExtenso, isFuturo, contagemRegressiva, youtubeId,
} from './helpers'

export const revalidate = 120

const HERO_VIDEO =
    'https://res.cloudinary.com/dny0ibgbn/video/upload/v1780252444/video_de_fundo_jmvezn.mp4'

export default async function AgendaPage() {
    const [leiloes, criatorios] = await Promise.all([
        getLeiloesPublicos(),
        getCriatoriosParceirosMes(),
    ])

    const proximos = leiloes
        .filter((l) => isFuturo(l.data) && l.status === 'confirmado')
        .sort((a, b) => parseData(a.data).time - parseData(b.data).time)
    const destaque = proximos[0] ?? leiloes[0] ?? null
    const totalAnimais = leiloes.reduce((sum, l) => sum + (l.animais || 0), 0)
    const agendaLabel = labelPeriodo(leiloes)

    return (
        <>
            <section className="relative min-h-[calc(100svh-96px)] overflow-hidden bg-black text-white">
                <div className="absolute inset-0">
                    <video
                        src={HERO_VIDEO}
                        className="h-full w-full object-cover"
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                    />
                    <div className="absolute inset-0 bg-black/54" />
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.98)_0%,rgba(0,0,0,0.78)_40%,rgba(0,0,0,0.30)_100%)]" />
                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black to-transparent" />
                </div>

                <div className="relative mx-auto grid min-h-[calc(100svh-96px)] max-w-7xl content-center px-5 py-14 sm:px-8 lg:py-18">
                    <div className="max-w-3xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo-bula-assessoria-white.png"
                            alt="Bula Assessoria"
                            className="h-20 w-auto sm:h-24 lg:h-28"
                        />
                        <div className="mt-8 inline-flex items-center gap-2 rounded-md border border-white/18 bg-white/9 px-3 py-1.5 text-[11px] font-bold uppercase text-white/82 backdrop-blur">
                            <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            Agenda {agendaLabel}
                        </div>
                        <h1 className="mt-5 max-w-3xl text-5xl font-black leading-[0.96] text-white sm:text-7xl lg:text-8xl">
                            Agenda Bula Assessoria
                        </h1>
                        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/74 sm:text-xl">
                            Touros e matrizes dos principais leilões do Brasil, com estratégia
                            comercial, apartações e apoio na escolha de genética de ponta.
                        </p>

                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link
                                href="#proximos"
                                className="inline-flex items-center gap-2 rounded-md border border-white/28 bg-white/10 px-5 py-3 text-sm font-black text-white shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/16"
                            >
                                Ver programação
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>

                        <div className="mt-10 grid max-w-2xl grid-cols-3 overflow-hidden rounded-md border border-white/12 bg-white/9 backdrop-blur">
                            <HeroMetric value={leiloes.length} label={leiloes.length === 1 ? 'leilão na agenda' : 'leilões na agenda'} />
                            <HeroMetric value={totalAnimais || '—'} label="animais na agenda" />
                            <HeroMetric value={proximos.length} label={proximos.length === 1 ? 'próximo evento' : 'próximos eventos'} />
                        </div>
                    </div>
                </div>
            </section>

            <OfferBand />
            <CriatoriosParceiros parceiros={criatorios} />

            {destaque && (
                <section className="mx-auto max-w-7xl px-5 sm:px-8 -mt-6 relative z-10">
                    <DestaqueBanner leilao={destaque} />
                </section>
            )}

            <section id="proximos" className="mx-auto max-w-7xl px-5 sm:px-8 mt-14 sm:mt-18">
                <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <span className="text-[11px] font-bold uppercase text-black/55">
                            Calendário de leilões
                        </span>
                        <h2 className="mt-2 text-3xl font-black tracking-tight text-black sm:text-4xl">
                            Programação {agendaLabel}
                        </h2>
                    </div>
                    <p className="max-w-lg text-sm leading-relaxed text-black/58">
                        Encontre rapidamente os leilões por categoria, criatório,
                        leiloeira, local ou condição comercial.
                    </p>
                </div>
                <AgendaGrid leiloes={leiloes} />
            </section>
        </>
    )
}

function HeroMetric({ value, label }: { value: number | string; label: string }) {
    return (
        <div className="border-r border-white/12 px-4 py-4 last:border-r-0">
            <div className="text-2xl font-black leading-none text-white">{value}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase text-white/52">{label}</div>
        </div>
    )
}

function labelPeriodo(leiloes: LeilaoPublico[]) {
    if (leiloes.length === 0) return 'atual'
    const parts = leiloes.map((l) => parseData(l.data))
    const first = parts[0]
    const last = parts[parts.length - 1]
    if (first.ano === last.ano && first.mesNum === last.mesNum) {
        return `${first.mesNome} ${first.ano}`
    }
    if (first.ano === last.ano) {
        return `${first.mesNome} e ${last.mesNome} ${first.ano}`
    }
    return `${first.mesNome} ${first.ano} a ${last.mesNome} ${last.ano}`
}

function OfferBand() {
    return (
        <section className="border-y border-white/10 bg-black text-white">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/14 bg-white/8 text-white">
                        <Truck className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold uppercase text-white/42">Condição em destaque</p>
                        <h2 className="mt-1 text-xl font-black leading-tight sm:text-2xl">
                            Compre Touros e Matrizes PO em 30X no boleto e Frete Grátis
                        </h2>
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/58">
                            Uma seleção comercial pensada para facilitar a compra e aproximar criadores
                            dos animais certos em cada oportunidade.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-bold uppercase text-white/72">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-white/6 px-3 py-2">
                        <CheckCircle2 className="h-3.5 w-3.5" /> PO
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-white/6 px-3 py-2">
                        <ShieldCheck className="h-3.5 w-3.5" /> Boleto 30X
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-white/6 px-3 py-2">
                        <Truck className="h-3.5 w-3.5" /> Frete Grátis
                    </span>
                </div>
            </div>
        </section>
    )
}

function CriatoriosParceiros({ parceiros }: { parceiros: CriatorioParceiroPublico[] }) {
    if (parceiros.length === 0) return null

    return (
        <section className="bg-black text-white">
            <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
                <div>
                    <p className="text-[11px] font-bold uppercase text-white/42">Rede de criatórios</p>
                    <h2 className="mt-3 max-w-lg text-3xl font-black leading-tight sm:text-4xl">
                        Criadores que fortalecem a agenda Bula
                    </h2>
                    <p className="mt-4 max-w-md text-sm leading-relaxed text-white/58">
                        Um acompanhamento próximo de selecionadores de todo o Brasil, unindo
                        estratégia comercial, apartação e assessoria na compra de touros e matrizes.
                    </p>
                    <div className="mt-6 inline-flex items-center gap-3 rounded-md border border-white/12 bg-white/6 px-4 py-3">
                        <span className="text-2xl font-black leading-none">{parceiros.length}</span>
                        <span className="text-xs font-bold uppercase leading-tight text-white/48">
                            parceiros<br />na agenda
                        </span>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {parceiros.map((parceiro) => (
                        <div
                            key={parceiro.slug}
                            className="group min-h-[132px] rounded-md border border-white/10 bg-white/[0.04] px-4 py-4 transition-colors hover:border-white/22 hover:bg-white/[0.07]"
                        >
                            <div className="flex h-full flex-col justify-between gap-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-white/12 bg-white/8 text-white">
                                        {parceiro.logo ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={parceiro.logo} alt={parceiro.nome} className="max-h-8 max-w-9 object-contain" />
                                        ) : (
                                            <span className="text-sm font-black">{iniciais(parceiro.nome)}</span>
                                        )}
                                    </div>
                                    <span className="h-px flex-1 bg-white/10" />
                                </div>
                                <div>
                                    <p className="text-sm font-black leading-tight text-white">{parceiro.nome}</p>
                                    {parceiro.siteUrl && (
                                        <a
                                            href={parceiro.siteUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase text-white/46 transition-colors hover:text-white"
                                        >
                                            Site oficial
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

function iniciais(nome: string): string {
    const words = nome.split(/\s+/).filter(Boolean)
    return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

function DestaqueBanner({ leilao }: { leilao: LeilaoPublico }) {
    const p = parseData(leilao.data)
    const countdown = contagemRegressiva(leilao.data)
    const aoVivo = !!youtubeId(leilao.transmissao)

    return (
        <Link
            href={`/agenda/${leilao.id}`}
            className="group block overflow-hidden rounded-md border border-black/10 bg-white text-black shadow-[0_22px_60px_-38px_rgba(0,0,0,0.55)] transition-all hover:-translate-y-1 hover:border-black/25"
        >
            <div className="grid lg:grid-cols-[0.95fr_1.05fr]">
                <div className="flex flex-col justify-center p-6 sm:p-8 lg:min-h-[360px] lg:p-10">
                    <div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase text-black/52">
                            <span className="h-1.5 w-1.5 rounded-full bg-black" />
                            Destaque do mês
                            {countdown && (
                                <span className="rounded-full bg-black px-2.5 py-1 text-[11px] normal-case text-white">
                                    {countdown}
                                </span>
                            )}
                        </div>
                        <h3 className="mt-4 text-3xl font-black leading-tight text-black sm:text-5xl">
                            {leilao.nome}
                        </h3>
                        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-black/62">
                            <span className="inline-flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-black" />
                                {dataPorExtenso(leilao.data)}{leilao.horario ? ` · ${leilao.horario}` : ''}
                            </span>
                            {leilao.criador && (
                                <span className="inline-flex items-center gap-2">
                                    <Users className="h-4 w-4 text-black" />
                                    {leilao.criador}
                                </span>
                            )}
                            {leilao.local && (
                                <span className="inline-flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-black" />
                                    {leilao.local}
                                </span>
                            )}
                            {aoVivo && (
                                <span className="inline-flex items-center gap-2 text-black">
                                    <Radio className="h-4 w-4" />
                                    Transmissão ao vivo
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-2 rounded-md bg-black px-5 py-3 text-sm font-black text-white transition-all group-hover:gap-3">
                            Ver detalhes
                            <ArrowRight className="h-4 w-4" />
                        </span>
                        {!!leilao.animais && leilao.animais > 0 && (
                            <span className="inline-flex items-center gap-2 text-sm font-semibold text-black/55">
                                <Users className="h-4 w-4 text-black" /> {leilao.animais} animais
                            </span>
                        )}
                        {leilao.catalogo_url && (
                            <span className="inline-flex items-center gap-2 text-sm font-semibold text-black/55">
                                <BookOpen className="h-4 w-4 text-black" /> Catálogo disponível
                            </span>
                        )}
                    </div>
                </div>

                <div className="relative min-h-[260px] overflow-hidden bg-neutral-100 lg:min-h-[360px]">
                    {leilao.img ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={leilao.img}
                                alt={leilao.nome}
                                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-r from-white/30 via-transparent to-transparent lg:from-transparent" />
                        </>
                    ) : (
                        <div className="flex h-full min-h-[260px] w-full items-center justify-center bg-black">
                            <div className="text-center text-white">
                                <Search className="mx-auto mb-4 h-7 w-7 text-white/44" />
                                <div className="text-7xl font-black leading-none">{p.dia}</div>
                                <div className="mt-1 text-sm font-bold uppercase text-white/45">{p.mesAbrev}</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Link>
    )
}
