import type { Metadata } from 'next'
import Link from 'next/link'
import { MessageCircle, Instagram, ArrowRight, Calendar } from 'lucide-react'
import { WHATSAPP_CTA_URL } from '../agenda/helpers'
import { InstallButton } from '@/components/pwa/InstallButton'

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
        <div className="flex min-h-screen flex-col bg-[#12100c] text-white">
            <header className="sticky top-0 z-50 border-b border-[#d6b36a]/18 bg-[#12100c]/88 backdrop-blur-xl">
                <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:h-[88px] sm:px-8">
                    <Link href="/" className="flex items-center group" aria-label="Bula Assessoria">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo-bula-assessoria-white.png"
                            alt="Bula Assessoria"
                            className="h-14 w-auto object-contain transition-opacity group-hover:opacity-75 sm:h-[70px]"
                        />
                    </Link>
                    <nav className="flex items-center gap-1.5 text-[13px] font-black sm:gap-2 sm:text-sm">
                        <a
                            href="#metodo"
                            className="hidden rounded-md px-3 py-2 text-white/60 transition-colors hover:bg-white/7 hover:text-white lg:inline-flex"
                        >
                            Método
                        </a>
                        <a
                            href="#equipe"
                            className="hidden rounded-md px-3 py-2 text-white/60 transition-colors hover:bg-white/7 hover:text-white lg:inline-flex"
                        >
                            Equipe
                        </a>
                        <Link
                            href="/agenda"
                            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-white/72 transition-colors hover:bg-white/7 hover:text-white"
                        >
                            <Calendar className="h-4 w-4" />
                            <span className="hidden xs:inline sm:inline">Agenda de leilões</span>
                            <span className="xs:hidden sm:hidden">Agenda</span>
                        </Link>
                        <InstallButton
                            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-white/72 transition-colors hover:bg-white/7 hover:text-white sm:px-3"
                            label="Baixar app"
                            tone="dark"
                            align="right"
                            hideLabelOnMobile
                        />
                        <a
                            href={WHATSAPP_CTA_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-md border border-[#d6b36a]/40 bg-[#d6b36a] px-4 py-2.5 font-black text-[#151008] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#e7c77e] sm:px-5"
                        >
                            <MessageCircle className="h-4 w-4" />
                            <span className="hidden sm:inline">Falar no WhatsApp</span>
                            <span className="sm:hidden">WhatsApp</span>
                        </a>
                    </nav>
                </div>
            </header>

            <main className="flex-1">{children}</main>

            <footer className="bg-[#0c0a07] text-white">
                <div className="border-y border-[#d6b36a]/18 bg-[#17130d]">
                    <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#d6b36a]">
                                Compra assistida em Nelore PO
                            </p>
                            <h3 className="mt-3 max-w-2xl text-3xl font-black leading-[1.05] tracking-tight sm:text-5xl">
                                Entre no leilão com critério, teto de compra e assessor no telefone.
                            </h3>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                            <a
                                href={WHATSAPP_CTA_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group inline-flex items-center justify-center gap-2 rounded-md bg-[#d6b36a] px-6 py-4 text-sm font-black text-[#151008] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#e7c77e]"
                            >
                                <MessageCircle className="h-4 w-4" />
                                Entrar no grupo
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                            </a>
                            <Link
                                href="/agenda"
                                className="inline-flex items-center justify-center gap-2 rounded-md border border-white/16 bg-white/5 px-6 py-4 text-sm font-black text-white transition-all hover:-translate-y-0.5 hover:border-[#d6b36a]/45"
                            >
                                <Calendar className="h-4 w-4" />
                                Ver agenda de leilões
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 md:grid-cols-2 lg:grid-cols-[1.35fr_0.9fr_0.9fr_0.9fr] lg:gap-x-14">
                    <div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo-bula-assessoria-white.png"
                            alt="Bula Assessoria"
                            className="mb-5 h-16 w-auto object-contain sm:h-[76px]"
                        />
                        <p className="max-w-sm text-sm leading-relaxed text-white/62">
                            Assessoria pecuária para compra de touros e matrizes, com leitura de genética,
                            referência de mercado, apartação e negociação nos principais leilões do Brasil.
                        </p>
                        <div className="mt-7 grid max-w-sm grid-cols-3 border-y border-white/10 py-4 text-center">
                            <div>
                                <p className="text-lg font-black text-[#d6b36a]">PO</p>
                                <p className="mt-1 text-[10px] font-bold uppercase text-white/38">Nelore</p>
                            </div>
                            <div className="border-x border-white/10">
                                <p className="text-lg font-black text-[#d6b36a]">Lote</p>
                                <p className="mt-1 text-[10px] font-bold uppercase text-white/38">Curado</p>
                            </div>
                            <div>
                                <p className="text-lg font-black text-[#d6b36a]">Teto</p>
                                <p className="mt-1 text-[10px] font-bold uppercase text-white/38">Definido</p>
                            </div>
                        </div>
                    </div>
                    <div>
                        <h4 className="mb-7 text-[12px] font-black uppercase tracking-[0.18em] text-[#d6b36a]">
                            Navegação
                        </h4>
                        <ul className="space-y-6 text-[15px] text-white/62">
                            <li>
                                <a href="#metodo" className="inline-flex items-center gap-2 transition-colors hover:text-[#d6b36a]">
                                    <ArrowRight className="h-4 w-4 text-white/35" />
                                    Método Bula
                                </a>
                            </li>
                            <li>
                                <a href="#equipe" className="inline-flex items-center gap-2 transition-colors hover:text-[#d6b36a]">
                                    <ArrowRight className="h-4 w-4 text-white/35" />
                                    Equipe
                                </a>
                            </li>
                            <li>
                                <Link href="/agenda" className="inline-flex items-center gap-2 transition-colors hover:text-[#d6b36a]">
                                    <Calendar className="h-4 w-4 text-white/35" />
                                    Agenda de leilões
                                </Link>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="mb-7 text-[12px] font-black uppercase tracking-[0.18em] text-[#d6b36a]">
                            Compra
                        </h4>
                        <ul className="space-y-6 text-[15px] text-white/62">
                            <li>
                                <Link href="/agenda#proximos" className="inline-flex items-center gap-2 transition-colors hover:text-[#d6b36a]">
                                    <ArrowRight className="h-4 w-4 text-white/35" />
                                    Próximos leilões
                                </Link>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="mb-7 text-[12px] font-black uppercase tracking-[0.18em] text-[#d6b36a]">
                            Contato
                        </h4>
                        <ul className="space-y-6 text-[15px] text-white/62">
                            <li>
                                <a href={WHATSAPP_CTA_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition-colors hover:text-[#d6b36a]">
                                    <MessageCircle className="h-4 w-4 text-white/35" />
                                    WhatsApp · grupo de leilões
                                </a>
                            </li>
                            <li>
                                <a href="https://www.instagram.com/bulaassessoria/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition-colors hover:text-[#d6b36a]">
                                    <Instagram className="h-4 w-4 text-white/35" />
                                    Instagram
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="border-t border-white/10">
                    <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-5 text-xs text-white/42 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                        <span>© {new Date().getFullYear()} Bula Assessoria Pecuária. Todos os direitos reservados.</span>
                        <span className="text-white/30">Assessoria · genética · leilões · Brasil</span>
                    </div>
                </div>
            </footer>
        </div>
    )
}
