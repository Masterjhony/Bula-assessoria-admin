'use client'

import { Check } from 'lucide-react'
import { light } from '../_lib/tokens'
import { subHero } from '../_lib/copy'
import { Section, Container, Reveal, MultiLine } from './ui'

// Faixa de reforço logo abaixo do hero. Tile CLARO (parchment) — a troca de
// superfície escuro→claro é o divisor. Benefícios com check dourado.
export function SubHero() {
  return (
    <Section surface="light">
      <Container>
        <div className="grid gap-10 md:grid-cols-2 md:gap-16">
          <Reveal>
            <h2
              style={{
                fontWeight: 600,
                fontSize: 'clamp(28px, 4.5vw, 46px)',
                lineHeight: 1.08,
                letterSpacing: '-0.025em',
              }}
            >
              <MultiLine text={subHero.title} />
            </h2>
          </Reveal>

          <Reveal delay={0.08}>
            <ul className="flex flex-col gap-4">
              {subHero.benefits.map((b) => (
                <li key={b.text} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    style={{ background: light.goldDim }}
                    aria-hidden
                  >
                    <Check size={15} strokeWidth={2.5} color={light.gold} />
                  </span>
                  <span
                    style={{
                      fontSize: 'clamp(17px, 2vw, 19px)',
                      lineHeight: 1.4,
                      fontWeight: b.strong ? 600 : 400,
                      color: b.strong ? light.text : light.muted,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {b.text}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
