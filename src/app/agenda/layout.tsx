import type { Metadata } from 'next'
import Link from 'next/link'
import { MessageCircle, Instagram, ArrowRight, Calendar } from 'lucide-react'
import { WHATSAPP_CTA_URL } from './helpers'

export const metadata: Metadata = {
    metadataBase: new URL('https://bulaassessoria.com'),
    title: 'Agenda de Leilões | Bula Assessoria',
    description:
        'Agenda dos principais leilões assessorados pela Bula Assessoria Pecuária, com touros, matrizes, catálogos, transmissões e informações comerciais.',
    openGraph: {
        title: 'Agenda de Leilões | Bula Assessoria',
        description:
            'Touros e matrizes dos principais leilões do Brasil, com curadoria e assessoria comercial da Bula.',
        url: 'https://bulaassessoria.com/agenda',
        siteName: 'Bula Assessoria',
        images: [
            {
                url: '/agenda-oficial-bula-whatsapp.jpg',
                width: 1200,
                height: 1200,
                alt: 'Agenda Oficial Bula Assessoria Pecuária',
            },
        ],
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Agenda de Leilões | Bula Assessoria',
        description:
            'Touros e matrizes dos principais leilões do Brasil, com curadoria e assessoria comercial da Bula.',
        images: ['/agenda-oficial-bula-whatsapp.jpg'],
    },
}

export default function AgendaLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen flex-col bg-white text-black">
            <header className="sticky top-0 z-50 border-b border-black/10 bg-white/92 backdrop-blur-xl">
                <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:h-24 sm:px-8">
                    <Link href="/agenda" className="flex items-center group" aria-label="Bula Assessoria">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo-bula-assessoria-dark.png"
                            alt="Bula Assessoria"
                            className="h-14 w-auto object-contain transition-opacity group-hover:opacity-75 sm:h-20"
                        />
                    </Link>
                    <nav className="flex items-center gap-2 text-[13px] font-bold sm:text-sm">
                        <Link
                            href="/agenda"
                            className="rounded-md px-3 py-2 text-black/62 transition-colors hover:bg-black/5 hover:text-black"
                        >
                            Agenda
                        </Link>
                        <a
                            href={WHATSAPP_CTA_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-md border border-black px-4 py-2.5 font-black shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:px-5"
                            style={{ backgroundColor: '#000', color: '#fff' }}
                        >
                            <MessageCircle className="h-4 w-4" />
                            Fale com a Bula
                        </a>
                    </nav>
                </div>
            </header>

            <main className="flex-1">{children}</main>

            <footer className="mt-20 bg-black text-white">
                {/* Faixa de CTA — acento dourado da marca */}
                <div className="relative overflow-hidden border-t border-[#A68B4B]/25">
                    <div
                        aria-hidden
                        className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-[#A68B4B]/10 blur-3xl"
                    />
                    <div className="relative mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
                        <div className="max-w-xl">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#C8A96E]">
                                Bula Assessoria Pecuária
                            </p>
                            <h3 className="mt-3 text-2xl font-black leading-[1.1] tracking-tight sm:text-3xl">
                                Touros e matrizes dos melhores leilões, com quem entende do negócio.
                            </h3>
                        </div>
                        <a
                            href={WHATSAPP_CTA_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-6 py-3.5 text-sm font-black shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#1ebe5d]"
                            style={{ color: '#ffffff' }}
                        >
                            <MessageCircle className="h-4 w-4" />
                            Entrar no grupo
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </a>
                    </div>
                </div>

                {/* Corpo */}
                <div className="mx-auto grid max-w-7xl gap-10 border-t border-white/10 px-5 py-16 sm:px-8 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr] lg:gap-x-20">
                    <div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo-bula-assessoria-white.png"
                            alt="Bula Assessoria"
                            className="mb-5 h-16 w-auto object-contain sm:h-20"
                        />
                        <p className="max-w-sm text-sm leading-relaxed text-white/62">
                            Assessoria pecuária especializada em estratégias comerciais,
                            apartações e compra de touros e matrizes nos principais leilões do Brasil.
                        </p>
                        <div className="mt-7 flex items-center gap-3">
                            <a
                                href={WHATSAPP_CTA_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="WhatsApp da Bula"
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 text-white/70 transition-all hover:-translate-y-0.5 hover:border-[#25D366] hover:text-[#25D366]"
                            >
                                <MessageCircle className="h-[18px] w-[18px]" />
                            </a>
                            <a
                                href="https://www.instagram.com/bulaassessoria/"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Instagram da Bula"
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 text-white/70 transition-all hover:-translate-y-0.5 hover:border-[#C8A96E] hover:text-[#C8A96E]"
                            >
                                <Instagram className="h-[18px] w-[18px]" />
                            </a>
                        </div>
                    </div>
                    <div>
                        <h4 className="mb-6 text-[11px] font-black uppercase tracking-wider text-[#C8A96E]">
                            Navegação
                        </h4>
                        <ul className="space-y-5 text-sm text-white/62">
                            <li>
                                <Link href="/agenda" className="inline-flex items-center gap-2 transition-colors hover:text-[#C8A96E]">
                                    <Calendar className="h-3.5 w-3.5 text-white/35" />
                                    Agenda de leilões
                                </Link>
                            </li>
                            <li>
                                <Link href="/agenda#proximos" className="inline-flex items-center gap-2 transition-colors hover:text-[#C8A96E]">
                                    <ArrowRight className="h-3.5 w-3.5 text-white/35" />
                                    Próximos leilões
                                </Link>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="mb-6 text-[11px] font-black uppercase tracking-wider text-[#C8A96E]">
                            Contato
                        </h4>
                        <ul className="space-y-5 text-sm text-white/62">
                            <li>
                                <a href={WHATSAPP_CTA_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition-colors hover:text-[#25D366]">
                                    <MessageCircle className="h-3.5 w-3.5 text-white/35" />
                                    WhatsApp · grupo de leilões
                                </a>
                            </li>
                            <li>
                                <a href="https://www.instagram.com/bulaassessoria/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition-colors hover:text-[#C8A96E]">
                                    <Instagram className="h-3.5 w-3.5 text-white/35" />
                                    Instagram
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Base */}
                <div className="border-t border-white/10">
                    <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-5 text-xs text-white/42 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                        <span>© {new Date().getFullYear()} Bula Assessoria Pecuária. Todos os direitos reservados.</span>
                        <span className="text-white/30">Touros &amp; matrizes · Brasil</span>
                    </div>
                </div>
            </footer>
        </div>
    )
}
