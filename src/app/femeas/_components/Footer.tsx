import Image from 'next/image'
import { dark, typo } from '../_lib/tokens'
import { rodape } from '../_lib/copy'

// Rodapé — near-black, denso e quieto. Fecha a página na superfície da marca,
// depois do pergaminho do Fecho.
//
// Os alvos de toque dos links legais têm 44px de altura (INV-6): link legal é
// justamente o que a pessoa procura quando está desconfiada, e errar o toque
// três vezes numa página que acabou de pedir documento não ajuda ninguém.
export function Footer() {
  return (
    <footer
      className="w-full px-5 py-14 sm:px-8"
      style={{ background: dark.bg, color: dark.muted, borderTop: `1px solid ${dark.hairline}` }}
    >
      <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center gap-7 text-center sm:flex-row sm:justify-between sm:gap-6 sm:text-left">
        <Image
          src="/logo-bula-assessoria-white.png"
          alt={rodape.marca}
          width={132}
          height={40}
          className="h-8 w-auto object-contain"
        />
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1" style={{ fontSize: 15 }}>
          <a
            href={rodape.privacidadeHref}
            className="inline-flex items-center px-2"
            style={{ color: dark.muted, minHeight: 44 }}
          >
            {rodape.privacidade}
          </a>
          <a
            href={rodape.termosHref}
            className="inline-flex items-center px-2"
            style={{ color: dark.muted, minHeight: 44 }}
          >
            {rodape.termos}
          </a>
          {/* `dark.muted` e não `dark.faint`: o próprio token avisa que o faint
              (#6B6B6B) só passa AA em tamanho grande, e esta linha é pequena. */}
          <span
            className="px-2"
            style={{ ...typo.monoLabel, textTransform: 'none', letterSpacing: '0.04em', color: dark.muted, fontSize: 13 }}
          >
            © {new Date().getFullYear()} {rodape.marca} · {rodape.direitos}
          </span>
        </div>
      </div>
    </footer>
  )
}
