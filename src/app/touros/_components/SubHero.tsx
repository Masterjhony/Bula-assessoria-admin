'use client'

import { light, typo } from '../_lib/tokens'
import { subHero } from '../_lib/copy'
import { Section, Container, Reveal, MultiLine } from './ui'

// Faixa de reforço logo abaixo do hero. Tile CLARO (parchment) — a troca de
// superfície escuro→claro é o divisor. Benefícios em linhas numeradas (mono),
// registro editorial, sem check-bolha dourado.
export function SubHero() {
  return (
    <Section surface="light">
      <Container>
        <div className="grid gap-10 md:grid-cols-2 md:gap-16">
          <Reveal>
            <h2 style={{ ...typo.displayLg, color: light.text }}>
              <MultiLine text={subHero.title} />
            </h2>
          </Reveal>

          <Reveal delay={0.08}>
            <ul className="flex flex-col">
              {subHero.benefits.map((b, i) => (
                <li key={b.text} className="flex items-start gap-4 py-4" style={{ borderTop: `1px solid ${light.hairline}` }}>
                  <span aria-hidden style={{ ...typo.monoLabel, color: light.goldText, minWidth: '2ch', marginTop: 4 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    style={{
                      ...typo.body,
                      fontSize: 'clamp(16px, 1.9vw, 18px)',
                      fontWeight: b.strong ? 600 : 400,
                      color: b.strong ? light.text : light.body,
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
