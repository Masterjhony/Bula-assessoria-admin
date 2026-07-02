import Link from 'next/link'
import { ArrowRight, CheckCircle2, MessageCircle, ShieldCheck, Truck } from 'lucide-react'
import {
    getCriatoriosParceirosMes,
    getLeiloesPublicos,
    type CriatorioParceiroPublico,
    type LeilaoPublico,
} from '@/lib/bula/public-leiloes'
import { AgendaGrid } from './AgendaGrid'
import {
    parseData, hojeTime, dataPorExtenso, isFuturo, contagemRegressiva, localExibivel, youtubeId, WHATSAPP_CTA_URL,
} from './helpers'
import { CriatorioLogoTile } from './CriatorioLogoTile'

export const revalidate = 120

const HERO_VIDEO =
    'https://res.cloudinary.com/dny0ibgbn/video/upload/v1780252444/video_de_fundo_jmvezn.mp4'

export default async function AgendaPage() {
    const [leiloes, criatorios] = await Promise.all([
        getLeiloesPublicos(),
        getCriatoriosParceirosMes(),
    ])

    // Mesma lógica de sempre — não altera quais leilões aparecem nem a ordem.
    const proximos = leiloes
        .filter((l) => isFuturo(l.data) && l.status === 'confirmado')
        .sort((a, b) => parseData(a.data).time - parseData(b.data).time)
    const destaque = proximos[0] ?? leiloes[0] ?? null
    // Criatórios distintos na agenda — métrica confiável (a soma de "animais" fica
    // vazia na maioria dos leilões, então não vira estatística de topo).
    const criatoriosNaAgenda = new Set(
        leiloes.map((l) => (l.criador || '').trim().toUpperCase()).filter(Boolean),
    ).size
    // Dias até o próximo leilão confirmado.
    const proximoDias = proximos[0]
        ? Math.max(0, Math.round((parseData(proximos[0].data).time - hojeTime()) / 86_400_000))
        : null
    const agendaLabel = labelPeriodo(leiloes)

    // Dados derivados do leilão em destaque (herói editorial).
    const destaqueMeta = destaque
        ? [
              dataPorExtenso(destaque.data),
              destaque.horario || null,
              destaque.modelo || localExibivel(destaque.local) || null,
              destaque.criador || null,
          ].filter(Boolean) as string[]
        : []
    const destaqueAoVivo = destaque ? !!youtubeId(destaque.transmissao) : false
    const destaqueCountdown = destaque ? contagemRegressiva(destaque.data) : null

    return (
        <>
            <section className="relative min-h-[calc(100svh-96px)] overflow-hidden bg-[#0A0A0A] text-white">
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
                    <div className="absolute inset-0 bg-black/62" />
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.97)_0%,rgba(0,0,0,0.74)_44%,rgba(0,0,0,0.24)_100%)]" />
                    {/* Grão sutil — "textura do campo" do brandbook. */}
                    <div className="absolute inset-0 opacity-60 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.028)_0px,rgba(255,255,255,0.028)_1px,transparent_1px,transparent_7px)]" />
                    <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0A0A0A] to-transparent" />
                </div>

                {/* Selo circular editorial — dourado cirúrgico. */}
                {destaque && (
                    <div className="pointer-events-none absolute right-10 top-1/2 hidden -translate-y-1/2 lg:flex">
                        <div className="flex h-40 w-40 flex-col items-center justify-center rounded-full border border-[#C9A84C]/45 text-center">
                            <span className="text-[10px] font-black uppercase tracking-[0.28em] text-[#C9A84C]">Destaque</span>
                            <span className="mt-1.5 text-[9px] font-semibold uppercase leading-relaxed tracking-[0.2em] text-white/55">
                                Próximo<br />leilão
                            </span>
                        </div>
                    </div>
                )}

                <div className="relative mx-auto grid min-h-[calc(100svh-96px)] max-w-7xl content-center px-5 py-16 sm:px-8 lg:py-20">
                    <div className="max-w-4xl">
                        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A84C]">
                            <span className="h-px w-10 bg-[#C9A84C]" />
                            {destaque ? 'Próximo leilão · Em destaque' : `Agenda ${agendaLabel}`}
                            {destaqueCountdown && (
                                <span className="rounded-full border border-[#C9A84C]/35 bg-[#C9A84C]/12 px-2.5 py-1 text-[10px] tracking-normal text-[#E8DBB8]">
                                    {destaqueCountdown}
                                </span>
                            )}
                        </div>

                        {destaque ? (
                            <>
                                <h1 className="font-display mt-5 text-6xl uppercase leading-[0.88] tracking-tight text-white sm:text-8xl lg:text-[7.5rem]">
                                    {destaque.nome}
                                </h1>
                                <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-white/85 sm:text-[15px]">
                                    {destaqueMeta.map((part, i) => (
                                        <span key={part} className="inline-flex items-center gap-4">
                                            {i > 0 && <span className="text-[#C9A84C]">·</span>}
                                            <span className={i === 0 ? 'text-white' : ''}>{part}</span>
                                        </span>
                                    ))}
                                    {destaqueAoVivo && (
                                        <span className="inline-flex items-center gap-1.5 rounded-md border border-[#C9A84C]/40 bg-[#C9A84C]/12 px-2.5 py-1 text-[11px] font-bold uppercase text-[#E8DBB8]">
                                            <span className="h-1.5 w-1.5 rounded-full bg-[#C9A84C]" />
                                            Ao vivo
                                        </span>
                                    )}
                                </div>
                                <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/70">
                                    Curadoria de genética, avaliação de lote e apoio no arremate —
                                    a assessoria do boiadeiro(a).
                                </p>
                                <div className="mt-8 flex flex-wrap gap-3">
                                    <a
                                        href={WHATSAPP_CTA_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-black shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white/90"
                                        style={{ color: '#0A0A0A' }}
                                    >
                                        <MessageCircle className="h-4 w-4" />
                                        Falar no WhatsApp
                                    </a>
                                    <Link
                                        href={`/agenda/${destaque.id}`}
                                        className="inline-flex items-center gap-2 rounded-md border border-white/28 bg-white/5 px-5 py-3 text-sm font-black text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:border-[#C9A84C]/60 hover:bg-white/10"
                                    >
                                        Ver detalhes
                                        <ArrowRight className="h-4 w-4" />
                                    </Link>
                                </div>
                            </>
                        ) : (
                            <>
                                <h1 className="font-display mt-5 text-6xl uppercase leading-[0.9] tracking-tight text-white sm:text-8xl lg:text-[7.5rem]">
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
                            </>
                        )}

                        <div className="mt-12 grid max-w-2xl grid-cols-3 overflow-hidden rounded-md border border-white/12 bg-white/[0.06] backdrop-blur">
                            <HeroMetric value={leiloes.length} label={leiloes.length === 1 ? 'leilão na agenda' : 'leilões na agenda'} />
                            <HeroMetric value={criatoriosNaAgenda || '—'} label={criatoriosNaAgenda === 1 ? 'criatório' : 'criatórios'} />
                            <HeroMetric
                                value={proximoDias === null ? '—' : proximoDias === 0 ? 'Hoje' : proximoDias}
                                label={proximoDias === null || proximoDias === 0 ? 'próximo leilão' : proximoDias === 1 ? 'dia p/ o próximo' : 'dias p/ o próximo'}
                            />
                        </div>
                    </div>
                </div>
            </section>

            <OfferBand />
            <CriatoriosParceiros parceiros={criatorios} />

            <section id="proximos" className="mx-auto max-w-7xl px-5 sm:px-8 mt-16 sm:mt-20">
                <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <span className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A84C]">
                            <span className="h-px w-10 bg-[#C9A84C]" />
                            Calendário de leilões
                        </span>
                        <h2 className="font-display mt-3 text-4xl uppercase tracking-tight text-white sm:text-5xl">
                            Programação {agendaLabel}
                        </h2>
                    </div>
                    <p className="max-w-lg text-sm leading-relaxed text-white/55">
                        Busque rapidamente por nome, criatório, leiloeira,
                        local ou condição comercial.
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
            <div className="font-display text-3xl leading-none text-white">{value}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-white/52">{label}</div>
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
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#C9A84C]">Condição em destaque</p>
                        <h2 className="font-display mt-1 text-2xl uppercase leading-[0.98] sm:text-3xl">
                            Quer comprar touros e matrizes?
                        </h2>
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/58">
                            Receba ofertas exclusivas no grupo de WhatsApp da Bula, com seleção
                            de oportunidades PO, condições comerciais e suporte dos assessores.
                        </p>
                    </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex flex-wrap gap-2 text-xs font-bold uppercase text-white/72">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-white/6 px-3 py-2">
                            <CheckCircle2 className="h-3.5 w-3.5" /> PO
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-white/6 px-3 py-2">
                            <ShieldCheck className="h-3.5 w-3.5" /> 30X
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-white/6 px-3 py-2">
                            <Truck className="h-3.5 w-3.5" /> Frete
                        </span>
                    </div>
                    <a
                        href={WHATSAPP_CTA_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-white px-5 py-3 text-sm font-black text-black shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white/88 sm:w-auto"
                        style={{ color: '#050505' }}
                    >
                        <MessageCircle className="h-4 w-4 shrink-0" />
                        Grupo de WhatsApp
                        <ArrowRight className="h-4 w-4 shrink-0" />
                    </a>
                </div>
            </div>
        </section>
    )
}

function CriatoriosParceiros({ parceiros }: { parceiros: CriatorioParceiroPublico[] }) {
    const parceirosComLogo = parceiros.filter((parceiro) => parceiro.logo)
    if (parceirosComLogo.length === 0) return null
    const faixa = [...parceirosComLogo, ...parceirosComLogo]

    return (
        <section className="overflow-hidden bg-black py-14 text-white">
            <div className="mx-auto max-w-7xl px-5 sm:px-8">
                <div className="max-w-2xl">
                    <p className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A84C]">
                        <span className="h-px w-10 bg-[#C9A84C]" />
                        Marcas parceiras
                    </p>
                    <h2 className="font-display mt-3 text-3xl uppercase leading-[0.98] sm:text-4xl">
                        Criatórios presentes na agenda Bula
                    </h2>
                    <p className="mt-4 text-sm leading-relaxed text-white/58">
                        Uma faixa viva com as marcas que compõem a programação atual,
                        reunindo selecionadores de referência em touros e matrizes.
                    </p>
                </div>

                <div className="relative mt-9 border-y border-white/10 py-5">
                    <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-black to-transparent" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-black to-transparent" />
                    <div className="bula-logo-marquee flex w-max gap-4">
                        {faixa.map((parceiro, index) => parceiro.logo ? (
                            <a
                                key={`${parceiro.slug}-${index}`}
                                href={parceiro.siteUrl ?? undefined}
                                target={parceiro.siteUrl ? '_blank' : undefined}
                                rel={parceiro.siteUrl ? 'noopener noreferrer' : undefined}
                                className="flex h-24 w-52 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white px-5 transition-transform hover:-translate-y-0.5"
                                aria-label={parceiro.siteUrl ? `Abrir referência de ${parceiro.nome}` : parceiro.nome}
                            >
                                <CriatorioLogoTile parceiro={parceiro} />
                            </a>
                        ) : null)}
                    </div>
                </div>
            </div>
        </section>
    )
}
