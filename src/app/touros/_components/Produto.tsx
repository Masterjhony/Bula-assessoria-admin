'use client'

import Image from 'next/image'
import { useEffect, useRef } from 'react'
import { dark, typo, font } from '../_lib/tokens'
import { produto } from '../_lib/copy'
import { Section, Container, Reveal, Eyebrow, StatNumber } from './ui'
import { trackFunnel } from '../_lib/analytics'

// Seção de PRODUTO — o que o comprador recebe (touro/genética), não o processo.
// Estética "ficha de performance": números gigantes Oswald + rótulo mono +
// hairlines. Sem cards, sem sombra. Tile ESCURO.
const PRODUTO_PHOTO = '/jmp/galeria-touros/IMG_0037.jpg'

// [VALIDAR] números com o cliente.
const STATS = [
  { v: '+1.000', l: 'Touros PO apartados' },
  { v: '100%', l: 'Lidos pelo sumário' },
  { v: 'R$ 0', l: 'De custo pra você' },
]

export function Produto() {
  const ref = useRef<HTMLDivElement>(null)

  // Evento de meio-funil (Paid): ViewContent/view_item quando a seção entra na
  // viewport — sinal intermediário entre pageview e lead p/ a otimização.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let fired = false
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !fired) {
          fired = true
          trackFunnel('touros_produto_view', undefined, { meta: 'ViewContent', ga: 'view_item' })
          io.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Section surface="dark">
      <Container wide>
        {/* Faixa de números — a "ficha de performance" gigante. */}
        <Reveal>
          <div ref={ref} className="mb-16 grid grid-cols-1 sm:grid-cols-3">
            {STATS.map((s, i) => (
              <div
                key={s.l}
                className="py-4"
                style={{
                  borderTop: `1px solid ${dark.hairline}`,
                  borderLeft: i === 0 ? 'none' : `1px solid ${dark.hairline}`,
                  paddingLeft: i === 0 ? 0 : 'clamp(16px, 3vw, 40px)',
                }}
              >
                <StatNumber surface="dark" value={s.v} label={s.l} />
              </div>
            ))}
          </div>
        </Reveal>

        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Foto do touro — moldura hairline reta, sem sombra. */}
          <Reveal>
            <div className="relative aspect-[4/3] w-full overflow-hidden" style={{ border: `1px solid ${dark.hairline}` }}>
              <Image
                src={PRODUTO_PHOTO}
                alt="Touro Nelore PO selecionado pela Bula"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover object-[50%_40%]"
              />
            </div>
          </Reveal>

          {/* Pilares — linhas hairline com número mono, sem bolinha. */}
          <div>
            <Reveal>
              <Eyebrow surface="dark">{produto.eyebrow}</Eyebrow>
              <h2 className="mt-4 max-w-[520px]" style={{ ...typo.displayLg }}>
                {produto.title}
              </h2>
              <p className="mt-5 max-w-[480px]" style={{ ...typo.body, fontSize: 17, color: dark.body }}>
                {produto.lead}
              </p>
            </Reveal>

            <div className="mt-9 flex flex-col">
              {produto.pillars.map((p, i) => (
                <Reveal key={p.title} delay={i * 0.06}>
                  <div className="flex gap-5 py-6" style={{ borderTop: `1px solid ${dark.hairline}` }}>
                    <span aria-hidden style={{ ...typo.monoLabel, color: dark.gold, minWidth: '2ch', marginTop: 4 }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h3 style={{ fontFamily: font.display, fontWeight: 600, fontSize: 19, letterSpacing: '-0.01em' }}>{p.title}</h3>
                      <p className="mt-2" style={{ ...typo.body, fontSize: 15, color: dark.body }}>{p.text}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </Section>
  )
}
