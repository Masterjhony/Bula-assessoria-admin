'use client'

import { dark, typo, font } from '../_lib/tokens'
import { conscientizacao as c } from '../_lib/copy'
import { Section, Container, Reveal, Eyebrow, TopicCard } from './ui'

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
          <p className="mt-6 max-w-[620px]" style={{ ...typo.body, fontSize: 'clamp(16px, 2vw, 19px)', color: dark.body }}>
            {c.lead}
          </p>
        </Reveal>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {c.points.map((p, i) => (
            <TopicCard key={p.title} index={i + 1} title={p.title} text={p.text} surface="dark" delay={i * 0.08} />
          ))}
        </div>

        {/* Compromisso — citação editorial com barra dourada reta, sem card. */}
        <Reveal delay={0.1}>
          <div className="mt-20 flex items-stretch gap-5" style={{ borderTop: `1px solid ${dark.hairline}`, paddingTop: 32 }}>
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
