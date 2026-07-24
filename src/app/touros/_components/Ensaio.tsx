'use client'

import Image from 'next/image'
import { dark, typo } from '../_lib/tokens'
import { ensaio } from '../_lib/copy'
import { Section, Container, Reveal, Eyebrow, MultiLine } from './ui'

// Ensaio no curral — fotos do Marcelo (24/07): mosaico editorial no padrão do
// brandbook (homem + animal + ambiente). Desktop replica o grid do slide:
// panorâmica em cima, duas cenas embaixo e a VERTICAL inteira à direita.
// Mobile empilha: panorâmica → dupla → vertical (o money shot fecha).
const FOTOS = {
  wide: { src: '/touros/ensaio/apartacao-galpao.webp', alt: 'Peões a cavalo apartando o gado no curral, vistos de cima' },
  bl: { src: '/touros/ensaio/apartacao-peao.webp', alt: 'Peão a cavalo conduzindo o lote entre as porteiras do curral' },
  br: { src: '/touros/ensaio/curral-lotes.webp', alt: 'Lotes de gado Nelore separados nos compartimentos do curral' },
  port: { src: '/touros/ensaio/lote-de-cima.webp', alt: 'Assessor fotografando o lote de touros dentro do curral' },
} as const

const RADIUS = 18 // mesmo raio dos TopicCards

function Foto({
  foto,
  className = '',
  sizes,
}: {
  foto: { src: string; alt: string }
  className?: string
  sizes: string
}) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ borderRadius: RADIUS }}>
      <Image src={foto.src} alt={foto.alt} fill sizes={sizes} className="object-cover" />
    </div>
  )
}

export function Ensaio() {
  return (
    // Hairline no topo: o ensaio agora emenda direto no hero (dark→dark), e a
    // linha de 1px é o divisor editorial no lugar da troca de superfície.
    <Section surface="dark" style={{ borderTop: `1px solid ${dark.hairline}` }}>
      <Container wide>
        <Reveal>
          <Eyebrow surface="dark">{ensaio.eyebrow}</Eyebrow>
          <h2 className="mt-5" style={{ ...typo.displayLg, color: dark.text }}>
            <MultiLine text={ensaio.title} />
          </h2>
          <p className="mt-5 max-w-[640px]" style={{ ...typo.body, color: dark.body }}>
            {ensaio.lead}
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          {/* Mobile: pilha (16/9 → dupla 4/3 → vertical 4/5). Desktop: grid do
              slide — 2 colunas de cenas + retrato na 3ª ocupando as 2 linhas. */}
          <div className="touros-ensaio-grid mt-10 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-[1.2fr_1.2fr_1fr] lg:grid-rows-2">
            <Foto
              foto={FOTOS.wide}
              className="col-span-2 aspect-[16/9] lg:aspect-auto lg:min-h-0"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            <Foto foto={FOTOS.bl} className="aspect-[4/3] lg:aspect-auto" sizes="(max-width: 1024px) 50vw, 25vw" />
            <Foto foto={FOTOS.br} className="aspect-[4/3] lg:aspect-auto" sizes="(max-width: 1024px) 50vw, 25vw" />
            <Foto
              foto={FOTOS.port}
              className="col-span-2 aspect-[4/5] lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:row-span-2 lg:aspect-auto"
              sizes="(max-width: 1024px) 100vw, 30vw"
            />
          </div>
          {/* No desktop o grid precisa de altura própria (células aspect-auto). */}
          <style>{`
            @media (min-width: 1024px) {
              .touros-ensaio-grid { height: clamp(420px, 38vw, 560px); }
            }
          `}</style>
        </Reveal>
      </Container>
    </Section>
  )
}
