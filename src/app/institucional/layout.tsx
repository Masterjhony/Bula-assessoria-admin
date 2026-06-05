import type { Metadata } from 'next'
import Link from 'next/link'
import { MessageCircle, Instagram, ArrowRight, Calendar } from 'lucide-react'
import { WHATSAPP_CTA_URL } from '../agenda/helpers'

export const metadata: Metadata = {
    metadataBase: new URL('https://bulaassessoria.com'),
    title: 'Bula Assessoria Pecuária | Do gado comercial ao Nelore PO',
    description:
        'A Bula assessora pecuaristas na entrada no Nelore PO: escolha de genética, estratégia de arremate e condição comercial nos principais leilões do Brasil. Você não entra sozinho.',
    openGraph: {
        title: 'Bula Assessoria Pecuária | Do gado comercial ao Nelore PO',
        description:
            'Assessoria especializada para quem quer entrar no Nelore PO com segurança: curadoria de genética, estratégia de arremate e suporte em cada lance.',
        url: 'https://bulaassessoria.com/',
        siteName: 'Bula Assessoria',
        images: [
            {
                url: '/agenda-oficial-bula-whatsapp.jpg',
                width: 1200,
                height: 1200,
                alt: 'Bula Assessoria Pecuária',
            },
        ],
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Bula Assessoria Pecuária | Do gado comercial ao Nelore PO',
        description:
            'Assessoria especializada para entrar no Nelore PO com segurança, curadoria de genética e estratégia de arremate.',
        images: ['/agenda-oficial-bula-whatsapp.jpg'],
    },
}

export default function InstitucionalLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen flex-col bg-black text-white">
            <header className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
                <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:h-24 sm:px-8">
                    <Link href="/" className="flex items-center group" aria-label="Bula Assessoria">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo-bula-assessoria-white.png"
                            alt="Bula Assessoria"
                            className="h-14 w-auto object-contain transition-opacity group-hover:opacity-75 sm:h-20"
                        />
                    </Link>
                    <nav className="flex items-center gap-1.5 text-[13px] font-bold sm:gap-2 sm:text-sm">
                        <Link
                            href="/agenda"
                            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-white/65 transition-colors hover:bg-white/8 hover:text-white"
                        >
                            <Calendar className="h-4 w-4" />
                            <span className="hidden xs:inline sm:inline">Agenda de leilões</span>
                            <span className="xs:hidden sm:hidden">Agenda</span>
                        </Link>
                        <a
                            href={WHATSAPP_CTA_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 font-black shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#1ebe5d] sm:px-5"
                            style={{ backgroundColor: '#25D366', color: '#ffffff' }}
                        >
                            <MessageCircle className="h-4 w-4" />
                            <span className="hidden sm:inline">Entrar no grupo</span>
                            <span className="sm:hidden">Grupo</span>
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
                        <h4 className="mb-7 text-[13px] font-black uppercase tracking-wider text-[#C8A96E]">
                            Navegação
                        </h4>
                        <ul className="space-y-6 text-[15px] text-white/62">
                            <li>
                                <Link href="/agenda" className="inline-flex items-center gap-2 transition-colors hover:text-[#C8A96E]">
                                    <Calendar className="h-4 w-4 text-white/35" />
                                    Agenda de leilões
                                </Link>
                            </li>
                            <li>
                                <Link href="/agenda#proximos" className="inline-flex items-center gap-2 transition-colors hover:text-[#C8A96E]">
                                    <ArrowRight className="h-4 w-4 text-white/35" />
                                    Próximos leilões
                                </Link>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="mb-7 text-[13px] font-black uppercase tracking-wider text-[#C8A96E]">
                            Contato
                        </h4>
                        <ul className="space-y-6 text-[15px] text-white/62">
                            <li>
                                <a href={WHATSAPP_CTA_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition-colors hover:text-[#25D366]">
                                    <MessageCircle className="h-4 w-4 text-white/35" />
                                    WhatsApp · grupo de leilões
                                </a>
                            </li>
                            <li>
                                <a href="https://www.instagram.com/bulaassessoria/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition-colors hover:text-[#C8A96E]">
                                    <Instagram className="h-4 w-4 text-white/35" />
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
