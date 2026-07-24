import Image from 'next/image'
import { light } from '../_lib/tokens'

// Footer — tile CLARO, denso e quieto (à la Apple). Logo Bula + legais.
export function Footer() {
  return (
    <footer
      className="w-full px-5 py-14 sm:px-8"
      style={{ background: light.bg, color: light.muted, borderTop: `1px solid ${light.hairline}` }}
    >
      <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <Image
          src="/logo-bula-assessoria-dark.png"
          alt="Bula Assessoria"
          width={132}
          height={40}
          className="h-8 w-auto object-contain"
        />
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1" style={{ fontSize: 13 }}>
          <a href="/privacidade" className="inline-flex items-center px-2 py-2.5" style={{ color: light.muted }}>Privacidade</a>
          <a href="/termos" className="inline-flex items-center px-2 py-2.5" style={{ color: light.muted }}>Termos</a>
          <span className="px-2" style={{ color: light.faint }}>
            © {new Date().getFullYear()} Bula Assessoria
          </span>
        </div>
      </div>
    </footer>
  )
}
