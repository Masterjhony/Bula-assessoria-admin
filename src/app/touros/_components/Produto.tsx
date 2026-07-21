'use client'

import Image from 'next/image'
import { useEffect, useRef } from 'react'
import { dark } from '../_lib/tokens'
import { produto } from '../_lib/copy'
import { Section, Container, Reveal } from './ui'
import { trackFunnel } from '../_lib/analytics'

// Seção de PRODUTO — o que o comprador recebe (touro/genética), não o processo.
// Substitui a antiga "Como funciona". Tile ESCURO, mantém o ritmo dark→light.
// Foto ancorada em número/margem (não galeria) para atrair comprador de escala.
const PRODUTO_PHOTO = '/jmp/galeria-touros/IMG_0037.jpg'

export function Produto() {
  const ref = useRef<HTMLDivElement>(null)

  // Evento de meio-funil (Paid): ViewContent/view_item quando a seção de
  // produto entra na viewport — sinal intermediário entre pageview e lead para
  // a otimização aprender mais rápido enquanto o volume de MQL é baixo.
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
        <div ref={ref} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Foto do touro — a ÚNICA sombra do sistema. */}
          <Reveal>
            <div
              className="relative aspect-[4/3] w-full overflow-hidden rounded-[18px]"
              style={{ boxShadow: '0 30px 60px -20px rgba(0,0,0,0.55)' }}
            >
              <Image
                src={PRODUTO_PHOTO}
                alt="Touro Nelore PO selecionado pela Bula"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover object-[50%_40%]"
              />
            </div>
          </Reveal>

          {/* Pilares do produto */}
          <div>
            <Reveal>
              <p className="text-[13px] font-semibold uppercase" style={{ letterSpacing: '0.18em', color: dark.gold }}>
                {produto.eyebrow}
              </p>
              <h2
                className="mt-3 max-w-[520px]"
                style={{ fontWeight: 600, fontSize: 'clamp(28px, 4.5vw, 46px)', lineHeight: 1.1, letterSpacing: '-0.025em' }}
              >
                {produto.title}
              </h2>
              <p className="mt-4 max-w-[480px]" style={{ fontSize: 17, lineHeight: 1.5, color: dark.muted }}>
                {produto.lead}
              </p>
            </Reveal>

            <div className="mt-8 flex flex-col">
              {produto.pillars.map((p, i) => (
                <Reveal key={p.title} delay={i * 0.06}>
                  <div
                    className="flex gap-4 py-5"
                    style={{ borderTop: i === 0 ? 'none' : `1px solid ${dark.hairline}` }}
                  >
                    <span aria-hidden className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: dark.gold }} />
                    <div>
                      <h3 style={{ fontWeight: 600, fontSize: 18, letterSpacing: '-0.015em' }}>{p.title}</h3>
                      <p className="mt-1.5" style={{ fontSize: 15, lineHeight: 1.5, color: dark.muted }}>{p.text}</p>
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
