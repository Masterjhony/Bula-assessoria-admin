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

        <div className="mt-12 grid gap-4 md:grid-cols-3 md:gap-5">
          {c.points.map((p, i) => {
            const Icon = ICONS[i] ?? MessageCircle
            return (
              <Reveal key={p.title} delay={i * 0.08}>
                <div
                  className="flex h-full flex-col rounded-[18px] p-6"
                  style={{ background: dark.surface, border: `1px solid ${dark.hairline}` }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-full"
                      style={{ background: dark.goldDim }}
                      aria-hidden
                    >
                      <Icon size={20} color={dark.gold} strokeWidth={1.75} />
                    </span>
                    <span aria-hidden style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: dark.gold }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="mt-5" style={{ fontWeight: 600, fontSize: 19, letterSpacing: '-0.015em' }}>
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

        {/* Compromisso como "acordo" contido — barra dourada dentro de uma
            superfície, em vez de uma hairline solta atravessando o container. */}
        <Reveal delay={0.1}>
          <div
            className="mt-6 flex items-stretch gap-4 rounded-[18px] p-6 sm:p-7"
            style={{ background: dark.surface, border: `1px solid ${dark.hairline}` }}
          >
            <span aria-hidden className="w-1 shrink-0 rounded-full" style={{ background: dark.gold }} />
            <p
              style={{
                fontSize: 'clamp(17px, 2.2vw, 22px)',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                lineHeight: 1.35,
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
