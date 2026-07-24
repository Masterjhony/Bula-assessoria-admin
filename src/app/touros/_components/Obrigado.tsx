import Image from 'next/image'
import { dark, typo, font, radius, interFeatures } from '../_lib/tokens'
import { obrigado } from '../_lib/copy'
import { WhatsappRedirect } from './WhatsappRedirect'

// Página de OBRIGADO pós-cadastro — variante por MQL. Server component estático
// (sem framer/analytics): confirmação leve, mesma pele editorial da landing.
// A conversão já dispara no submit do form; aqui é só UX + URL própria p/ metas.
export function Obrigado({ variant }: { variant: 'mql' | 'lead' }) {
  const c = obrigado[variant]
  return (
    <main
      className="flex w-full flex-col items-center justify-center px-5 py-24 text-center sm:px-8"
      style={{
        background: dark.bg,
        color: dark.text,
        minHeight: '100svh',
        colorScheme: 'dark',
        fontFamily: font.body,
        fontFeatureSettings: interFeatures,
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <div className="w-full max-w-[620px]">
        <div className="mb-12 flex justify-center">
          <Image src="/logo-bula-assessoria-white.png" alt="Bula Assessoria" width={200} height={52} className="h-11 w-auto" priority />
        </div>

        {/* Selo de confirmação — quadrado com hairline dourado (linguagem da marca). */}
        <span
          aria-hidden
          className="mx-auto flex items-center justify-center"
          style={{ width: 60, height: 60, border: `1px solid ${dark.gold}`, borderRadius: radius.none }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={dark.gold} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>

        <p className="mt-8" style={{ ...typo.eyebrow, color: dark.gold }}>{c.eyebrow}</p>

        <h1 className="mt-4" style={{ ...typo.displayXL, fontSize: 'clamp(32px, 6vw, 56px)', margin: '16px auto 0' }}>
          {c.title}
        </h1>

        <p className="mx-auto mt-6 max-w-[540px]" style={{ ...typo.body, fontSize: 18, color: dark.body }}>
          {c.lead}
        </p>

        <p className="mx-auto mt-8 max-w-[480px]" style={{ ...typo.monoLabel, color: dark.muted, lineHeight: 1.5 }}>
          {c.note}
        </p>

        {/* Contagem de 8s + botão para o grupo de WhatsApp (entrar na hora). */}
        <WhatsappRedirect seconds={8} />
      </div>
    </main>
  )
}
