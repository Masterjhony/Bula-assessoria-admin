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
        url: 'https://bulaassessoria.com/leiloes',
        siteName: 'Bula Assessoria',
        images: [
            {
                url: '/agenda-oficial-bula-whatsapp-v2.jpg',
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
        images: ['/agenda-oficial-bula-whatsapp-v2.jpg'],
    },
}

export default function AgendaLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="agenda-page-bg relative flex min-h-screen flex-col text-white">
            {/* Header transparente, flutuando sobre o hero (igual ao Claude Design) —
                sem barra/borda. Some ao rolar, é intencional. */}
            <header className="absolute inset-x-0 top-0 z-30">
                <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:h-24 sm:px-8">
                    <Link href="/leiloes" className="flex items-center group" aria-label="Bula Assessoria">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo-bula-assessoria-white.png"
                            alt="Bula Assessoria"
                            className="h-14 w-auto object-contain transition-opacity group-hover:opacity-75 sm:h-20"
                        />
                    </Link>
                    <nav className="flex items-center gap-[clamp(14px,2.4vw,34px)]">
                        <Link href="/leiloes#agenda" className="agenda-nav-link hidden sm:inline" style={{ fontFamily: "'Inter',sans-serif", fontSize: '11px', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>
                            Agenda
                        </Link>
                        <Link href="/leiloes#sobre" className="agenda-nav-link hidden sm:inline" style={{ fontFamily: "'Inter',sans-serif", fontSize: '11px', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>
                            Sobre
                        </Link>
                        <Link href="/leiloes#contato" className="agenda-nav-link hidden sm:inline" style={{ fontFamily: "'Inter',sans-serif", fontSize: '11px', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>
                            Contato
                        </Link>
                        <Link href="/habilitacao" className="agenda-nav-link hidden sm:inline" style={{ fontFamily: "'Inter',sans-serif", fontSize: '11px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A84C' }}>
                            Habilite-se
                        </Link>
                        <a
                            href={WHATSAPP_CTA_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="agenda-nav-cta inline-flex shrink-0 items-center gap-2 whitespace-nowrap"
                            style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: '12px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '11px 20px' }}
                        >
                            <MessageCircle className="h-4 w-4 shrink-0" />
                            WhatsApp
                        </a>
                    </nav>
                </div>
            </header>

            <main className="flex-1">{children}</main>

            <footer className="mt-0 bg-[#0A0A0A] text-white">

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
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 text-white/70 transition-all hover:-translate-y-0.5 hover:border-[#C9A84C] hover:text-[#C9A84C]"
                            >
                                <MessageCircle className="h-[18px] w-[18px]" />
                            </a>
                            <a
                                href="https://www.instagram.com/bulaassessoria/"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Instagram da Bula"
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 text-white/70 transition-all hover:-translate-y-0.5 hover:border-[#C9A84C] hover:text-[#C9A84C]"
                            >
                                <Instagram className="h-[18px] w-[18px]" />
                            </a>
                        </div>
                    </div>
                    <div>
                        <h4 className="mb-7 text-[13px] font-black uppercase tracking-wider text-[#C9A84C]">
                            Navegação
                        </h4>
                        <ul className="space-y-6 text-[15px] text-white/62">
                            <li>
                                <Link href="/leiloes" className="inline-flex items-center gap-2 transition-colors hover:text-[#C9A84C]">
                                    <Calendar className="h-4 w-4 text-white/35" />
                                    Agenda de leilões
                                </Link>
                            </li>
                            <li>
                                <Link href="/leiloes#agenda" className="inline-flex items-center gap-2 transition-colors hover:text-[#C9A84C]">
                                    <ArrowRight className="h-4 w-4 text-white/35" />
                                    Próximos leilões
                                </Link>
                            </li>
                            <li>
                                <Link href="/habilitacao" className="inline-flex items-center gap-2 transition-colors hover:text-[#C9A84C]">
                                    <ArrowRight className="h-4 w-4 text-white/35" />
                                    Habilite-se para comprar
                                </Link>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="mb-7 text-[13px] font-black uppercase tracking-wider text-[#C9A84C]">
                            Contato
                        </h4>
                        <ul className="space-y-6 text-[15px] text-white/62">
                            <li>
                                <a href={WHATSAPP_CTA_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition-colors hover:text-[#C9A84C]">
                                    <MessageCircle className="h-4 w-4 text-white/35" />
                                    WhatsApp · grupo de leilões
                                </a>
                            </li>
                            <li>
                                <a href="https://www.instagram.com/bulaassessoria/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition-colors hover:text-[#C9A84C]">
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
