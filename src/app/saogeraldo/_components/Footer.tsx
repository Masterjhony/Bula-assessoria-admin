import Image from 'next/image'
import { dark, space } from '../_lib/tokens'
import { footer as copy } from '../_lib/copy'

// Footer — tile escuro, denso e quieto. Logo da Bula (a marca da página) e os
// links legais que o app já serve em /privacidade e /termos.
export function Footer() {
  return (
    <footer
      className="w-full px-5 sm:px-8"
      style={{
        background: dark.bg,
        color: dark.muted,
        borderTop: `1px solid ${dark.hairline}`,
        paddingBlock: space['2xl'],
      }}
    >
      <div
        className="mx-auto flex w-full max-w-[1120px] flex-col items-center text-center sm:flex-row sm:justify-between sm:text-left"
        style={{ gap: space.lg }}
      >
        <div className="flex flex-col items-center sm:items-start" style={{ gap: space.sm }}>
          <Image
            src="/logo-bula-assessoria-white.png"
            alt="Bula Assessoria"
            width={132}
            height={40}
            className="h-8 w-auto object-contain"
          />
          {/* `muted` e não `faint`: o crédito dos criatórios é texto pequeno
              (12.5px) e o faint só passa AA acima de 18px — ver tokens.ts. */}
          <span style={{ fontSize: 12.5, color: dark.muted }}>{copy.criatorios}</span>
        </div>

        {/* Os links legais são alvo de toque: `minHeight: 44` é o piso de
            acessibilidade da página, e o padding sozinho não chegava lá. */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1" style={{ fontSize: 13 }}>
          <a
            href="/privacidade"
            className="inline-flex items-center px-2"
            style={{ color: dark.muted, minHeight: 44 }}
          >
            Privacidade
          </a>
          <a
            href="/termos"
            className="inline-flex items-center px-2"
            style={{ color: dark.muted, minHeight: 44 }}
          >
            Termos
          </a>
          <span className="px-2" style={{ color: dark.muted }}>
            © {new Date().getFullYear()} Bula Assessoria
          </span>
        </div>
      </div>
    </footer>
  )
}
