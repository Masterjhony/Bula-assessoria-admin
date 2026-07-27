import Image from 'next/image'
import { dark, typo, font, radius, interFeatures } from '../_lib/tokens'
import { obrigado } from '../_lib/copy-conversao'

// Página de OBRIGADO pós-cadastro — variante por MQL. Server component estático
// (sem framer/analytics): confirmação leve, mesma pele editorial da landing.
//
// ESTA PÁGINA É O PONTO DE CONVERSÃO. A tag do Meta não dispara no submit do
// formulário: ela dispara no gatilho Page View do GTM, nesta URL. Por isso o
// formulário navega para cá com window.location.assign (load completo) e por
// isso o <GoogleTagManager/> é montado na page.tsx de cada variante. Trocar por
// navegação SPA, ou esquecer o GTM aqui, mata a conversão sem erro visível.
//
// Diferente da de touros, NÃO há redirect automático para grupo de WhatsApp:
// não existe grupo confirmado para este lançamento e inventar link seria pior
// que não ter. Se o cliente fornecer um, é aqui que ele entra.
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
          <Image
            src="/logo-bula-assessoria-white.png"
            alt="Bula Assessoria"
            width={200}
            height={52}
            className="h-11 w-auto"
            priority
          />
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
      </div>
    </main>
  )
}
