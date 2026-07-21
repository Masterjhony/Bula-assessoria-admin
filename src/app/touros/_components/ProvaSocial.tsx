'use client'

import Image from 'next/image'
import { light, typo } from '../_lib/tokens'
import { Section, Container, Reveal, Eyebrow } from './ui'

// Prova social — tile CLARO. Logos de criatórios/fazendas que confiam na Bula,
// em tom neutro (opacidade + grayscale) para não competir com o accent dourado.
// Arquivos reais em public/criatorios/*.png.
//
// `scale` = multiplicador da altura-base por logo. Altura FIXA não dá peso
// visual uniforme: os PNGs têm proporções e padding embutido muito diferentes
// (emblemas quadrados ~1:1 parecem minúsculos; wordmarks largos ~5:1 parecem
// gigantes). O scale equaliza a MASSA visual — emblemas sobem, wordmarks descem.
const CRIATORIOS = [
  { src: '/criatorios/nelore-jmp.png', alt: 'Nelore JMP', scale: 0.82 },
  { src: '/criatorios/terra-brava-agropecuaria.png', alt: 'Terra Brava Agropecuária', scale: 0.95 },
  { src: '/criatorios/fazenda-camparino.png', alt: 'Fazenda Camparino', scale: 1.14 },
  { src: '/criatorios/nelore-katayama.png', alt: 'Nelore Katayama', scale: 1.15 },
  { src: '/criatorios/nelore-santa-nazare.png', alt: 'Nelore Santa Nazaré', scale: 1.0 },
  { src: '/criatorios/nelore-cachoeirao.png', alt: 'Nelore Cachoeirão', scale: 0.8 },
  { src: '/criatorios/fazenda-jacamim.png', alt: 'Fazenda Jacamim', scale: 1.12 },
  { src: '/criatorios/ls-agropecuaria.png', alt: 'LS Agropecuária', scale: 1.05 },
  { src: '/criatorios/nelore-tresmar.png', alt: 'Nelore Tresmar', scale: 1.18, opacity: 0.72 },
  { src: '/criatorios/santa-nice.png', alt: 'Santa Nice', scale: 1.0 },
]

export function ProvaSocial() {
  return (
    <Section surface="light" style={{ paddingTop: 'clamp(40px, 7vw, 72px)', paddingBottom: 'clamp(40px, 7vw, 72px)' }}>
      <Container wide>
        <Reveal>
          {/* Eyebrow editorial (caixa alta, tracking largo); textIndent
              recentra opticamente o espaço-fantasma do tracking. */}
          <Eyebrow surface="light" className="mx-auto max-w-[440px] text-center" style={{ textIndent: '0.22em' }}>
            Criatórios e fazendas que confiam na Bula
          </Eyebrow>
          {/* [VALIDAR] números com o cliente — prova de escala quantificada. */}
          <p
            className="mx-auto mt-4 max-w-[680px] text-center"
            style={{ ...typo.displayLg, fontSize: 'clamp(22px, 3vw, 34px)', color: light.text }}
          >
            +1.000 touros PO apartados ao lado de criatórios de corte e seleção.
          </p>
        </Reveal>
        <Reveal delay={0.06}>
          {/* Grade 2→5 colunas (sem o 3 do meio, que deixaria 1 logo órfão em
              10 itens). Cada célula é uma "plate" de altura fixa (2× a altura-base)
              → respiro vertical uniforme; o logo é limitado por altura E largura. */}
          <div
            className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-5 md:gap-x-10"
            style={{ ['--logo-h' as string]: 'clamp(30px, 4.5vw, 42px)' }}
          >
            {CRIATORIOS.map((c) => (
              <div
                key={c.src}
                className="flex items-center justify-center"
                style={{ height: 'calc(var(--logo-h) * 2)' }}
              >
                <Image
                  src={c.src}
                  alt={c.alt}
                  width={220}
                  height={88}
                  className="w-auto object-contain"
                  style={{
                    height: `calc(var(--logo-h) * ${c.scale})`,
                    maxWidth: '100%',
                    filter: 'grayscale(1)',
                    opacity: c.opacity ?? 0.55,
                  }}
                />
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
