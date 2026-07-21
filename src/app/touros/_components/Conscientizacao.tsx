'use client'

import { dark, typo, font } from '../_lib/tokens'
import { conscientizacao as c } from '../_lib/copy'
import { Section, Container, Reveal, Eyebrow } from './ui'

// Seção CRÍTICA (anti-lead-frio) — tile ESCURO. Cria compromisso e expectativa
// ANTES do cadastro: o lead entende que receberá contato humano pelo WhatsApp e
// que precisa responder. 100% copy/design/UX — SEM automação/disparo.
// Registro editorial: números gigantes + hairlines, sem cards/ícones-bolha.
export function Conscientizacao() {
  return (
    <Section surface="dark">
      <Container>
        <Reveal>
          <Eyebrow surface="dark">{c.eyebrow}</Eyebrow>
          <h2 className="mt-4 max-w-[640px]" style={{ ...typo.displayLg }}>
            {c.title}
          </h2>
          <p className="mt-5 max-w-[620px]" style={{ ...typo.body, fontSize: 'clamp(16px, 2vw, 19px)', color: dark.body }}>
            {c.lead}
          </p>
        </Reveal>

        <div className="mt-14 grid gap-y-10 md:grid-cols-3 md:gap-x-10 md:gap-y-0">
          {c.points.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.08}>
              <div className="flex h-full flex-col pt-6" style={{ borderTop: `1px solid ${dark.hairlineStrong}` }}>
                <span aria-hidden style={{ ...typo.stat, fontSize: 'clamp(34px, 5vw, 52px)', color: dark.gold, lineHeight: 1 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-5" style={{ fontFamily: font.display, fontWeight: 600, fontSize: 19, letterSpacing: '-0.01em' }}>
                  {p.title}
                </h3>
                <p className="mt-2.5" style={{ ...typo.body, fontSize: 15, color: dark.body }}>{p.text}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Compromisso — citação editorial com barra dourada reta, sem card. */}
        <Reveal delay={0.1}>
          <div className="mt-16 flex items-stretch gap-5" style={{ borderTop: `1px solid ${dark.hairline}`, paddingTop: 28 }}>
            <span aria-hidden style={{ width: 3, flexShrink: 0, background: dark.gold }} />
            <p
              style={{
                fontFamily: font.display,
                fontSize: 'clamp(18px, 2.4vw, 26px)',
                fontWeight: 500,
                letterSpacing: '-0.01em',
                lineHeight: 1.3,
                color: dark.text,
              }}
            >
              {c.commitment}
            </p>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
