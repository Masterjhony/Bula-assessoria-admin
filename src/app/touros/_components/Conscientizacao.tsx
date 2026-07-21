'use client'

import { MessageCircle, UserRound, Clock } from 'lucide-react'
import { dark } from '../_lib/tokens'
import { conscientizacao as c } from '../_lib/copy'
import { Section, Container, Reveal } from './ui'

// Seção CRÍTICA (anti-lead-frio) — tile ESCURO. Cria compromisso e expectativa
// ANTES do cadastro: o lead entende que receberá contato humano pelo WhatsApp e
// que precisa responder. 100% copy/design/UX — SEM automação/disparo.
const ICONS = [MessageCircle, UserRound, Clock]

export function Conscientizacao() {
  return (
    <Section surface="dark">
      <Container>
        <Reveal>
          <p
            className="text-[13px] font-semibold uppercase"
            style={{ letterSpacing: '0.18em', color: dark.gold }}
          >
            {c.eyebrow}
          </p>
          <h2
            className="mt-3 max-w-[640px]"
            style={{
              fontWeight: 600,
              fontSize: 'clamp(28px, 4.5vw, 46px)',
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
            }}
          >
            {c.title}
          </h2>
          <p
            className="mt-5 max-w-[620px]"
            style={{
              fontSize: 'clamp(17px, 2.2vw, 21px)',
              lineHeight: 1.45,
              fontWeight: 300,
              color: dark.muted,
            }}
          >
            {c.lead}
          </p>
        </Reveal>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {c.points.map((p, i) => {
            const Icon = ICONS[i] ?? MessageCircle
            return (
              <Reveal key={p.title} delay={i * 0.08}>
                <div className="flex flex-col">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-full"
                    style={{ background: dark.goldDim }}
                    aria-hidden
                  >
                    <Icon size={20} color={dark.gold} strokeWidth={1.75} />
                  </span>
                  <h3
                    className="mt-5"
                    style={{ fontWeight: 600, fontSize: 19, letterSpacing: '-0.015em' }}
                  >
                    {p.title}
                  </h3>
                  <p className="mt-2" style={{ fontSize: 15, lineHeight: 1.55, color: dark.muted }}>
                    {p.text}
                  </p>
                </div>
              </Reveal>
            )
          })}
        </div>

        <Reveal delay={0.1}>
          <p
            className="mt-14 border-t pt-8 text-center"
            style={{
              borderColor: dark.hairline,
              fontSize: 'clamp(18px, 2.4vw, 24px)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: dark.text,
            }}
          >
            {c.commitment}
          </p>
        </Reveal>
      </Container>
    </Section>
  )
}
