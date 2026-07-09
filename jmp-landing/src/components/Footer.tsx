import { MessageCircle, ArrowRight, Calendar } from 'lucide-react'
import logo from '../assets/logo-bula-assessoria.png'

function scrollToForm(e: React.MouseEvent) {
  e.preventDefault()
  document.getElementById('inscricao-form')?.scrollIntoView({ behavior: 'smooth' })
}

export function Footer() {
  return (
    <footer className="mt-0 bg-black text-white">
      {/* Top CTA strip */}
      <div className="relative overflow-hidden border-t border-white/10">
        <div className="relative mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="max-w-xl">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/50">Bula Assessoria Pecuária</p>
            <h3 className="mt-3 text-2xl font-black leading-[1.1] tracking-tight sm:text-3xl">
              Assessoria gratuita nos maiores leilões do Brasil, com frete grátis para animais PO.
            </h3>
          </div>
          <a
            href="#inscricao"
            onClick={scrollToForm}
            className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-black shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white/90"
            style={{ color: '#111111' }}
          >
            <MessageCircle className="h-4 w-4" />
            Garantir minha assessoria
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>

      {/* Main columns */}
      <div className="mx-auto grid max-w-7xl gap-10 border-t border-white/10 px-5 py-16 sm:px-8 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr] lg:gap-x-20">
        <div>
          <div className="flex items-center gap-3 mb-5">
            <img src={logo} alt="Bula Assessoria" className="h-12 w-auto object-contain" />
            <div>
              <p className="text-white font-black text-sm tracking-wide">BULA</p>
              <p className="text-white/40 text-xs font-medium tracking-wider uppercase">Assessoria Pecuária</p>
            </div>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-white/50">
            Assessoria especializada em estratégias comerciais, apartações e compra de touros e matrizes nos principais leilões do Brasil.
          </p>
          <div className="mt-7 flex items-center gap-3">
            <a
              href="#inscricao"
              onClick={scrollToForm}
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
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 text-white/70 transition-all hover:-translate-y-0.5 hover:border-white hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
            </a>
          </div>
        </div>

        <div>
          <h4 className="mb-7 text-[13px] font-black uppercase tracking-wider text-white/50">Navegação</h4>
          <ul className="space-y-6 text-[15px] text-white/50">
            <li>
              <a href="#inscricao" onClick={scrollToForm} className="inline-flex items-center gap-2 transition-colors hover:text-white">
                <Calendar className="h-4 w-4 text-white/30" />
                Solicitar Assessoria
              </a>
            </li>
            <li>
              <a href="#inscricao" onClick={scrollToForm} className="inline-flex items-center gap-2 transition-colors hover:text-white">
                <ArrowRight className="h-4 w-4 text-white/30" />
                13º Mega Evento EAO Baviera
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="mb-7 text-[13px] font-black uppercase tracking-wider text-white/50">Contato</h4>
          <ul className="space-y-6 text-[15px] text-white/50">
            <li>
              <a
                href="#inscricao"
                onClick={scrollToForm}
                className="inline-flex items-center gap-2 transition-colors hover:text-[#25D366]"
              >
                <MessageCircle className="h-4 w-4 text-white/30" />
                WhatsApp · grupo de leilões
              </a>
            </li>
            <li>
              <a
                href="https://www.instagram.com/bulaassessoria/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 transition-colors hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30" aria-hidden><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
                @bulaassessoria
              </a>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-5 text-xs text-white/30 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© {new Date().getFullYear()} Bula Assessoria Pecuária. Todos os direitos reservados.</span>
          <span className="text-white/20">Touros &amp; matrizes · Brasil</span>
        </div>
      </div>
    </footer>
  )
}
