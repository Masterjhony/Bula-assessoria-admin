import type { Metadata } from 'next'
import Link from 'next/link'
import { MessageCircle } from 'lucide-react'

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
                url: '/agenda-oficial-bula.jpg',
                width: 396,
                height: 600,
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
        images: ['/agenda-oficial-bula.jpg'],
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
                            href="https://wa.me/"
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

            <footer className="mt-20 border-t border-white/10 bg-black text-white">
                <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:grid-cols-[1.5fr_1fr_1fr] sm:px-8">
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
                    </div>
                    <div>
                        <h4 className="mb-4 text-[11px] font-black uppercase text-white/42">
                            Navegação
                        </h4>
                        <ul className="space-y-2.5 text-sm text-white/62">
                            <li><Link href="/agenda" className="transition-colors hover:text-white">Agenda de leilões</Link></li>
                            <li><Link href="/agenda#proximos" className="transition-colors hover:text-white">Próximos leilões</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="mb-4 text-[11px] font-black uppercase text-white/42">
                            Contato
                        </h4>
                        <ul className="space-y-2.5 text-sm text-white/62">
                            <li>
                                <a href="https://wa.me/" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">
                                    WhatsApp
                                </a>
                            </li>
                            <li>
                                <a href="https://instagram.com/" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">
                                    Instagram
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
                <div className="border-t border-white/10">
                    <div className="mx-auto max-w-7xl px-5 py-5 text-xs text-white/42 sm:px-8">
                        © {new Date().getFullYear()} Bula Assessoria Pecuária. Todos os direitos reservados.
                    </div>
                </div>
            </footer>
        </div>
    )
}
