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
        <div className="min-h-screen flex flex-col" style={{ background: '#0D0D0D', color: '#F5F5F5' }}>
            {/* ── Top bar ───────────────────────────────────────── */}
            <header className="sticky top-0 z-50 border-b border-white/[0.06] backdrop-blur-xl bg-[#0D0D0D]/80">
                <div className="mx-auto max-w-6xl px-5 sm:px-8 h-16 flex items-center justify-between">
                    <Link href="/agenda" className="flex items-center gap-3 group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo-bula-remates-branco.png"
                            alt="Bula Assessoria"
                            className="h-9 w-auto transition-opacity group-hover:opacity-80"
                        />
                    </Link>
                    <nav className="flex items-center gap-1 sm:gap-2 text-[13px]">
                        <Link
                            href="/agenda"
                            className="px-3 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.04] transition-colors"
                        >
                            Agenda
                        </Link>
                        <a
                            href="https://wa.me/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3.5 py-2 rounded-lg font-semibold text-black transition-all hover:brightness-110"
                            style={{ background: 'linear-gradient(135deg, #C8A96E, #A68B4B)' }}
                        >
                            Fale com a Bula
                        </a>
                    </nav>
                </div>
            </header>

            <main className="flex-1">{children}</main>

            {/* ── Footer ────────────────────────────────────────── */}
            <footer className="border-t border-white/[0.06] mt-20">
                <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12 grid gap-8 sm:grid-cols-[1.5fr_1fr_1fr]">
                    <div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo-bula-remates-branco.png"
                            alt="Bula Assessoria"
                            className="h-10 w-auto mb-4"
                        />
                        <p className="text-sm text-white/50 max-w-xs leading-relaxed">
                            Assessoria pecuária especializada em remates e leilões de elite.
                            Do catálogo à martelada, ao lado do criador.
                        </p>
                    </div>
                    <div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-white/40 mb-4">
                            Navegação
                        </h4>
                        <ul className="space-y-2.5 text-sm text-white/60">
                            <li><Link href="/agenda" className="hover:text-[#C8A96E] transition-colors">Agenda de leilões</Link></li>
                            <li><Link href="/agenda#proximos" className="hover:text-[#C8A96E] transition-colors">Próximos remates</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-white/40 mb-4">
                            Contato
                        </h4>
                        <ul className="space-y-2.5 text-sm text-white/60">
                            <li>
                                <a href="https://wa.me/" target="_blank" rel="noopener noreferrer" className="hover:text-[#C8A96E] transition-colors">
                                    WhatsApp
                                </a>
                            </li>
                            <li>
                                <a href="https://instagram.com/" target="_blank" rel="noopener noreferrer" className="hover:text-[#C8A96E] transition-colors">
                                    Instagram
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
                <div className="border-t border-white/[0.04]">
                    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-5 text-xs text-white/30">
                        © {new Date().getFullYear()} Bula Assessoria Pecuária. Todos os direitos reservados.
                    </div>
                </div>
            </footer>
        </div>
    )
}
