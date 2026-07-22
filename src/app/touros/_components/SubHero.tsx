'use client'

import { light, typo } from '../_lib/tokens'
import { subHero } from '../_lib/copy'
import { Section, Container, Reveal, MultiLine, TopicCard } from './ui'

// Faixa de reforço logo abaixo do hero. Tile CLARO (parchment) — a troca de
// superfície escuro→claro é o divisor. Benefícios em linhas numeradas (mono),
// registro editorial, sem check-bolha dourado.
export function SubHero() {
  return (
    <Section surface="light">
      <Container>
        <div className="grid gap-12 md:grid-cols-2 md:gap-20">
          <Reveal>
            <h2 style={{ ...typo.displayLg, color: light.text }}>
              <MultiLine text={subHero.title} />
            </h2>
          </Reveal>

          <div className="flex flex-col gap-3">
            {subHero.benefits.map((b, i) => (
              <TopicCard key={b.text} index={i + 1} text={b.text} strong={b.strong} surface="light" delay={i * 0.05} />
            ))}
          </div>
        </div>
      </Container>
    </Section>
  )
}
