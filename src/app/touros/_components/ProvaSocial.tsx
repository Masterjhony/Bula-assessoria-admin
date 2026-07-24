'use client'

import Image from 'next/image'
import { dark, typo } from '../_lib/tokens'
import { Section, Container, Reveal, Eyebrow } from './ui'

// Prova social — tile ESCURO (pedido do cliente 24/07): fundo preto, logos em
// vetor branco e uma FAIXA em movimento contínuo (marquee) no lugar da grade —
// os PNGs coloridos sobre fundo claro liam ilegíveis.
//
// `scale` = multiplicador da altura-base por logo. Altura FIXA não dá peso
// visual uniforme: os PNGs têm proporções e padding embutido muito diferentes
// (emblemas quadrados ~1:1 parecem minúsculos; wordmarks largos ~5:1 parecem
// gigantes). O scale equaliza a MASSA visual — emblemas sobem, wordmarks descem.
//
// `detail: true` = emblema com desenho interno (Camparino, Jacamim): o branco
// chapado viraria um bloco sem leitura, então inverte preservando o detalhe.
const CRIATORIOS: { src: string; alt: string; scale: number; detail?: boolean }[] = [
  { src: '/criatorios/nelore-jmp.png', alt: 'Nelore JMP', scale: 0.82 },
  { src: '/criatorios/terra-brava-agropecuaria.png', alt: 'Terra Brava Agropecuária', scale: 0.95 },
  { src: '/criatorios/fazenda-camparino.png', alt: 'Fazenda Camparino', scale: 1.14, detail: true },
  { src: '/criatorios/nelore-katayama.png', alt: 'Nelore Katayama', scale: 1.15 },
  { src: '/criatorios/nelore-santa-nazare.png', alt: 'Nelore Santa Nazaré', scale: 1.0 },
  { src: '/criatorios/nelore-cachoeirao.png', alt: 'Nelore Cachoeirão', scale: 0.8 },
  { src: '/criatorios/fazenda-jacamim.png', alt: 'Fazenda Jacamim', scale: 1.12, detail: true },
  { src: '/criatorios/ls-agropecuaria.png', alt: 'LS Agropecuária', scale: 1.05 },
  { src: '/criatorios/nelore-tresmar.png', alt: 'Nelore Tresmar', scale: 1.18 },
  { src: '/criatorios/santa-nice.png', alt: 'Santa Nice', scale: 1.0 },
]

export function ProvaSocial() {
  return (
    <Section surface="dark" style={{ paddingTop: 'clamp(56px, 8vw, 96px)', paddingBottom: 'clamp(56px, 8vw, 96px)' }}>
      <Container wide>
        <Reveal>
          {/* Eyebrow editorial (caixa alta, tracking largo); textIndent
              recentra opticamente o espaço-fantasma do tracking. */}
          <Eyebrow surface="dark" className="mx-auto max-w-[440px] text-center" style={{ textIndent: '0.22em' }}>
            Criatórios e fazendas que confiam na Bula
          </Eyebrow>
          {/* [VALIDAR] números com o cliente — prova de escala quantificada. */}
          <p
            className="mx-auto mt-4 max-w-[680px] text-center"
            style={{ ...typo.displayLg, fontSize: 'clamp(22px, 3vw, 34px)', color: dark.text }}
          >
            +1.000 touros PO apartados ao lado de criatórios de corte e seleção.
          </p>
        </Reveal>
      </Container>

      {/* Faixa full-bleed: a lista de logos duplicada roda em loop contínuo;
          -50% de translateX = exatamente uma cópia → emenda invisível. */}
      <Reveal delay={0.06}>
        <div
          className="relative mt-10 -mx-5 overflow-hidden sm:-mx-8"
          style={{ ['--logo-h' as string]: 'clamp(34px, 4.5vw, 46px)' }}
        >
          <style>{`
            @keyframes touros-marquee {
              from { transform: translateX(0); }
              to { transform: translateX(-50%); }
            }
            /* Reduced motion: sem marquee — vira grade centralizada com wrap
               (a faixa estática cortada leria como bug). Esconde a cópia. */
            @media (prefers-reduced-motion: reduce) {
              .touros-marquee { animation: none !important; width: 100%; }
              .touros-marquee > div { flex-wrap: wrap; justify-content: center; width: 100%; row-gap: 18px; }
              .touros-marquee > div[aria-hidden="true"] { display: none; }
            }
          `}</style>
          <div
            className="touros-marquee flex w-max items-center"
            style={{ animation: 'touros-marquee 38s linear infinite' }}
          >
            {[0, 1].map((dup) => (
              <div key={dup} aria-hidden={dup === 1} className="flex items-center">
                {CRIATORIOS.map((c) => (
                  <div
                    key={c.src}
                    className="flex items-center justify-center"
                    style={{ height: 'calc(var(--logo-h) * 1.6)', paddingInline: 'clamp(22px, 3.2vw, 44px)' }}
                  >
                    <Image
                      src={c.src}
                      alt={dup === 0 ? c.alt : ''}
                      width={220}
                      height={88}
                      className="w-auto max-w-none object-contain"
                      style={{
                        height: `calc(var(--logo-h) * ${c.scale})`,
                        // Vetor branco: silhueta chapada por padrão; emblemas
                        // com desenho interno invertem preservando o detalhe.
                        filter: c.detail
                          ? 'grayscale(1) invert(1) brightness(1.9)'
                          : 'brightness(0) invert(1)',
                        opacity: 0.92,
                      }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
          {/* Fade nas bordas — a faixa "nasce" e "morre" no preto. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-28"
            style={{ background: `linear-gradient(90deg, ${dark.bg} 0%, rgba(13,13,13,0) 100%)` }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-28"
            style={{ background: `linear-gradient(270deg, ${dark.bg} 0%, rgba(13,13,13,0) 100%)` }}
          />
        </div>
      </Reveal>
    </Section>
  )
}
