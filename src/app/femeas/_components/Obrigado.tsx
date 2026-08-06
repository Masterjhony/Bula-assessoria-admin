import Image from 'next/image'
import { dark, typo, font, radius, interFeatures } from '../_lib/tokens'
import { obrigado, semMarcacao } from '../_lib/copy'

// ─────────────────────────────────────────────────────────────────────────────
// PÁGINA DE OBRIGADO DO FUNIL DE FÊMEAS — Fase 8, T8.1/T8.4.
//
// Server component estático (sem framer, sem analytics): a conversão já foi
// registrada no submit, e o Page View desta URL é o que dispara a tag do Meta
// no GTM. Qualquer coisa que atrase ou desvie esse load prejudica a medição.
//
// ⚠️ TRÊS COISAS QUE ESTA PÁGINA NÃO TEM, e nenhuma delas é esquecimento:
//
//   1. NÃO tem WhatsappRedirect. O /touros tem um (redireciona ao grupo em 8s,
//      touros/_components/WhatsappRedirect.tsx) e copiá-lo aqui destruiria o
//      KPI: neste funil não se passa o número do assessor — AGENDA-SE UMA
//      REUNIÃO, e quem agenda é o SDR depois do pré-diagnóstico. Tirar o lead
//      da página antes disso troca o KPI por um contato frio.
//   2. NÃO tem grupo de WhatsApp. Decidido que não.
//   3. NÃO diz "aprovado", em nenhuma das duas variantes. A triagem é MANUAL: a
//      aprovação é do SDR e ainda não aconteceu quando a pessoa chega aqui.
//      Prometer reunião como certa aqui é criar o no-show e a frustração que a
//      página inteira existe para evitar.
//
// A diferença entre `mql` e `lead` é de PRIORIDADE E TOM, não de promessa — as
// duas descrevem a reunião (fazenda, projeto, orçamento), porque é isso que
// reduz no-show depois. O que muda é a expectativa de fila.
// ─────────────────────────────────────────────────────────────────────────────
export function Obrigado({ variant }: { variant: 'mql' | 'lead' }) {
  const c = obrigado[variant]
  const comum = obrigado.comum

  return (
    <main
      className="flex w-full flex-col items-center px-5 py-20 sm:px-8 sm:py-24"
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

        <div className="text-center">
          {/* Selo de confirmação — quadrado com hairline dourado (marca). */}
          <span
            aria-hidden
            className="mx-auto flex items-center justify-center"
            style={{ width: 60, height: 60, border: `1px solid ${dark.gold}`, borderRadius: radius.none }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={dark.gold} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>

          <p className="mt-8" style={{ ...typo.eyebrow, color: dark.gold }}>{comum.eyebrow}</p>

          <h1 className="mt-4" style={{ ...typo.displayXL, fontSize: 'clamp(30px, 5.6vw, 52px)', margin: '16px auto 0' }}>
            {c.title}
          </h1>

          <p className="mx-auto mt-6 max-w-[540px]" style={{ ...typo.body, fontSize: 18, color: dark.body }}>
            {c.lead}
          </p>
        </div>

        {/* Prazo de contato — o número concreto, não "em breve".
            semMarcacao() apaga o [VALIDAR] que continua no copy.ts de propósito:
            o prazo é pendência de cliente e a marcação tem que seguir visível
            para quem lê o arquivo, sem nunca chegar à tela do lead. */}
        <div
          className="mt-10 flex flex-col items-center gap-1.5 px-5 py-5 text-center sm:flex-row sm:justify-center sm:gap-4"
          style={{ border: `1px solid ${dark.hairline}`, borderRadius: radius.xs, background: dark.surface }}
        >
          <span style={{ ...typo.monoLabel, color: dark.gold }}>{comum.prazoLabel}</span>
          <span style={{ fontFamily: font.body, fontSize: 16, color: dark.text }}>
            {semMarcacao(c.prazo)}
          </span>
        </div>

        {/* O que acontece na reunião — nas DUAS variantes. É o que reduz no-show:
            a pessoa chega sabendo do que se trata. */}
        <section className="mt-12">
          <h2
            style={{
              fontFamily: font.display,
              fontWeight: 600,
              fontSize: 'clamp(19px, 3vw, 23px)',
              letterSpacing: '-0.01em',
              color: dark.text,
            }}
          >
            {comum.reuniaoTitle}
          </h2>
          <ul className="mt-5" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {comum.reuniao.map((item, i) => (
              <li
                key={item}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '34px 1fr',
                  gap: 12,
                  padding: '14px 0',
                  borderTop: i === 0 ? 'none' : `1px solid ${dark.hairline}`,
                }}
              >
                <span aria-hidden style={{ ...typo.monoLabel, color: dark.gold }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontFamily: font.body, fontSize: 15.5, lineHeight: 1.55, color: dark.body }}>
                  {item}
                </span>
              </li>
            ))}
          </ul>

          <p
            className="mt-6"
            style={{ fontFamily: font.body, fontSize: 14.5, lineHeight: 1.55, color: dark.muted }}
          >
            {comum.ressalva}
          </p>
        </section>
      </div>
    </main>
  )
}
