import Image from 'next/image'
import { dark, typo, font, radius, interFeatures, space } from '../_lib/tokens'
import { obrigado, grupo } from '../_lib/copy-conversao'
import { EVENTO } from '../_lib/evento'

// Página de OBRIGADO pós-cadastro — variante por MQL. Server component estático
// (sem framer/analytics): confirmação leve, mesma pele editorial da landing.
//
// ESTA PÁGINA É O PONTO DE CONVERSÃO. A tag do Meta não dispara no submit do
// formulário: ela dispara no gatilho Page View do GTM, nesta URL. Por isso o
// formulário navega para cá com window.location.assign (load completo) e por
// isso o <GoogleTagManager/> é montado na page.tsx de cada variante. Trocar por
// navegação SPA, ou esquecer o GTM aqui, mata a conversão sem erro visível.
//
// O GRUPO DE WHATSAPP entra aqui, e só aqui (link do cliente, confirmado em
// 28/07). Na landing ele seria rota de fuga — a pessoa entra no grupo, o lead
// não é capturado e a campanha fica sem o que otimizar.
//
// É um BOTÃO, não um redirect automático, e a diferença importa: esta URL é o
// ponto onde a tag de conversão do Meta dispara, pelo gatilho Page View do
// GTM. Um `location.replace` para o WhatsApp poderia sair antes de a tag
// rodar e derrubar a conversão sem erro visível — o mesmo mecanismo que já
// obriga o formulário a navegar para cá com load completo.
//
// Continua sendo Server Component estático: sem framer, sem analytics. O
// clique no grupo não é medido de propósito; medir custaria transformar a
// página de conversão em client component, e o que precisa ser medido nesta
// URL já é medido pelo Page View.
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

        {/* Convite ao grupo. Fica ABAIXO da confirmação porque é o segundo
            assunto da página: primeiro a pessoa entende que o cadastro deu
            certo, depois recebe o que fazer enquanto espera. */}
        <div
          style={{
            marginTop: space.xl,
            paddingTop: space.lg,
            borderTop: `1px solid ${dark.hairline}`,
          }}
        >
          <p style={{ ...typo.eyebrow, color: dark.muted, margin: 0 }}>{grupo.eyebrow}</p>

          <a
            href={EVENTO.grupoWhatsapp}
            target="_blank"
            // noopener é segurança (a aba nova não ganha window.opener);
            // noreferrer evita vazar a URL de obrigado no referrer.
            rel="noopener noreferrer"
            style={{
              ...typo.button,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              minHeight: 52,
              marginTop: space.md,
              padding: '0 30px',
              borderRadius: radius.pill,
              background: dark.gold,
              // Carvão sobre champagne — a leitura inversa do CTA da landing,
              // medida em 7,53:1.
              color: dark.bg,
              textDecoration: 'none',
            }}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
              focusable="false"
            >
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.18h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.41c0-4.54 3.7-8.24 8.25-8.24a8.2 8.2 0 0 1 5.83 2.42 8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24Zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.35-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.61 4.14 3.66.58.25 1.03.4 1.38.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" />
            </svg>
            {grupo.cta}
          </a>

          <p
            style={{
              ...typo.monoLabel,
              color: dark.muted,
              margin: `${space.sm} auto 0`,
              maxWidth: 420,
              lineHeight: 1.5,
            }}
          >
            {grupo.nota}
          </p>
        </div>
      </div>
    </main>
  )
}
