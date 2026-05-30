import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
    title: 'Agenda de Leilões — Bula Assessoria',
    description:
        'Acompanhe a agenda de remates e leilões assessorados pela Bula Assessoria Pecuária: datas, catálogos, transmissões ao vivo e detalhes de cada evento.',
    openGraph: {
        title: 'Agenda de Leilões — Bula Assessoria',
        description:
            'Datas, catálogos e transmissões dos leilões assessorados pela Bula Assessoria Pecuária.',
        type: 'website',
    },
}

export default function AgendaLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex flex-col" style={{ background: '#F7F1E8', color: '#1E2519' }}>
            <header className="sticky top-0 z-50 border-b border-[#1E2519]/10 bg-[#F7F1E8]/88 backdrop-blur-xl">
                <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
                    <Link href="/agenda" className="flex items-center group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo-bula-assessoria-dark.png"
                            alt="Bula Assessoria"
                            className="h-14 w-auto object-contain transition-opacity group-hover:opacity-80 sm:h-16"
                        />
                    </Link>
                    <nav className="flex items-center gap-2 text-[13px] font-semibold sm:text-sm">
                        <Link
                            href="/agenda"
                            className="rounded-lg px-3 py-2 text-[#1E2519]/70 transition-colors hover:bg-[#1E2519]/5 hover:text-[#1E2519]"
                        >
                            Agenda
                        </Link>
                        <a
                            href="https://wa.me/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg px-4 py-2.5 font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                            style={{ background: '#355334', color: '#fff' }}
                        >
                            Fale com a Bula
                        </a>
                    </nav>
                </div>
            </header>

            <main className="flex-1">{children}</main>

            <footer className="mt-20 border-t border-[#1E2519]/10 bg-[#EFE5D7]">
                <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:grid-cols-[1.5fr_1fr_1fr] sm:px-8">
                    <div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo-bula-assessoria-dark.png"
                            alt="Bula Assessoria"
                            className="mb-4 h-16 w-auto object-contain"
                        />
                        <p className="max-w-xs text-sm leading-relaxed text-[#1E2519]/62">
                            Assessoria pecuária especializada em remates e leilões de elite.
                            Do catálogo à martelada, ao lado do criador.
                        </p>
                    </div>
                    <div>
                        <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[1.5px] text-[#A07732]">
                            Navegação
                        </h4>
                        <ul className="space-y-2.5 text-sm text-[#1E2519]/62">
                            <li><Link href="/agenda" className="transition-colors hover:text-[#355334]">Agenda de leilões</Link></li>
                            <li><Link href="/agenda#proximos" className="transition-colors hover:text-[#355334]">Próximos remates</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[1.5px] text-[#A07732]">
                            Contato
                        </h4>
                        <ul className="space-y-2.5 text-sm text-[#1E2519]/62">
                            <li>
                                <a href="https://wa.me/" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#355334]">
                                    WhatsApp
                                </a>
                            </li>
                            <li>
                                <a href="https://instagram.com/" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#355334]">
                                    Instagram
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
                <div className="border-t border-[#1E2519]/10">
                    <div className="mx-auto max-w-7xl px-5 py-5 text-xs text-[#1E2519]/45 sm:px-8">
                        © {new Date().getFullYear()} Bula Assessoria Pecuária. Todos os direitos reservados.
                    </div>
                </div>
            </footer>
        </div>
    )
}
