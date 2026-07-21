'use client'

import { dark } from '../_lib/tokens'
import { processo } from '../_lib/copy'
import { Section, Container, Reveal } from './ui'

// "Como funciona" — tile ESCURO. Passo a passo em cards sobre --surface. O
// passo 02 já planta a expectativa do contato por WhatsApp (1ª camada de
// conscientização; a seção Conscientizacao aprofunda).
export function Processo() {
  return (
    <Section surface="dark">
      <Container wide>
        <Reveal>
          <p
            className="text-[13px] font-semibold uppercase"
            style={{ letterSpacing: '0.18em', color: dark.gold }}
          >
            {processo.title}
          </p>
          <h2
            className="mt-3 max-w-[620px]"
            style={{
              fontWeight: 600,
              fontSize: 'clamp(28px, 4.5vw, 46px)',
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
            }}
          >
            {processo.lead}
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {processo.steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.06}>
              <div
                className="flex h-full flex-col rounded-[14px] p-6"
                style={{ background: dark.surface, border: `1px solid ${dark.hairline}` }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 34,
                    letterSpacing: '-0.03em',
                    color: dark.gold,
                  }}
                >
                  {s.n}
                </span>
                <h3
                  className="mt-4"
                  style={{ fontWeight: 600, fontSize: 19, letterSpacing: '-0.015em' }}
                >
                  {s.title}
                </h3>
                <p
                  className="mt-2"
                  style={{ fontSize: 15, lineHeight: 1.5, color: dark.muted }}
                >
                  {s.text}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  )
}
