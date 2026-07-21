'use client'

import Image from 'next/image'
import { light } from '../_lib/tokens'
import { Section, Container, Reveal } from './ui'

// Prova social — tile CLARO. Logos de criatórios/fazendas que confiam na Bula,
// em tom neutro (opacidade + grayscale) para não competir com o accent dourado.
// Arquivos reais em public/criatorios/*.png.
const CRIATORIOS = [
  { src: '/criatorios/nelore-jmp.png', alt: 'Nelore JMP' },
  { src: '/criatorios/terra-brava-agropecuaria.png', alt: 'Terra Brava Agropecuária' },
  { src: '/criatorios/fazenda-camparino.png', alt: 'Fazenda Camparino' },
  { src: '/criatorios/nelore-katayama.png', alt: 'Nelore Katayama' },
  { src: '/criatorios/nelore-santa-nazare.png', alt: 'Nelore Santa Nazaré' },
  { src: '/criatorios/nelore-cachoeirao.png', alt: 'Nelore Cachoeirão' },
  { src: '/criatorios/fazenda-jacamim.png', alt: 'Fazenda Jacamim' },
  { src: '/criatorios/ls-agropecuaria.png', alt: 'LS Agropecuária' },
  { src: '/criatorios/nelore-tresmar.png', alt: 'Nelore Tresmar' },
  { src: '/criatorios/santa-nice.png', alt: 'Santa Nice' },
]

export function ProvaSocial() {
  return (
    <Section surface="light" style={{ paddingTop: 'clamp(40px, 7vw, 72px)', paddingBottom: 'clamp(40px, 7vw, 72px)' }}>
      <Container wide>
        <Reveal>
          {/* Eyebrow discreto (tracking corp, largura limitada p/ não quebrar
              feio no mobile); a linha quantificada abaixo é o statement. */}
          <p
            className="mx-auto max-w-[420px] text-center"
            style={{
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              // Compensa o espaço-fantasma do tracking à direita, que com
              // text-center empurra o centro óptico para a esquerda.
              textIndent: '0.08em',
              lineHeight: 1.3,
              color: light.faint,
            }}
          >
            Criatórios e fazendas que confiam na Bula
          </p>
          {/* [VALIDAR] números com o cliente — prova de escala quantificada
              atrai comprador sério (Paid Social). */}
          <p
            className="mx-auto mt-2.5 max-w-[640px] text-center"
            style={{
              fontSize: 'clamp(20px, 2.8vw, 28px)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.12,
              color: light.text,
            }}
          >
            +1.000 touros PO apartados ao lado de criatórios de corte e seleção.
          </p>
        </Reveal>
        <Reveal delay={0.06}>
          <div className="mt-9 grid grid-cols-2 items-center gap-x-8 gap-y-8 sm:grid-cols-3 md:grid-cols-5">
            {CRIATORIOS.map((c) => (
              <div key={c.src} className="flex items-center justify-center">
                <Image
                  src={c.src}
                  alt={c.alt}
                  width={140}
                  height={64}
                  className="h-12 w-auto object-contain sm:h-14"
                  style={{ filter: 'grayscale(1)', opacity: 0.55 }}
                />
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
