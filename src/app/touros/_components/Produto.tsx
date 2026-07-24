'use client'

import Image from 'next/image'
import { useEffect, useRef } from 'react'
import { dark, typo } from '../_lib/tokens'
import { produto } from '../_lib/copy'
import { Section, Container, Reveal, Eyebrow, StatNumber, TopicCard } from './ui'
import { trackFunnel } from '../_lib/analytics'

// Seção de PRODUTO — o que o comprador recebe (touro/genética), não o processo.
// Estética "ficha de performance": números gigantes Oswald + rótulo mono +
// hairlines. Sem cards, sem sombra. Tile ESCURO.
const PRODUTO_PHOTO = '/jmp/galeria-touros/IMG_0037.jpg'

// [VALIDAR] números com o cliente.
// Rótulos que comunicam o PRODUTO (não jargão solto): escala real, seleção por
// dado (o diferencial: dado > beleza) e o porquê do custo-zero (operação séria).
const STATS = [
  { v: '+1.000', l: 'Touros PO já apartados' },
  { v: '100%', l: 'Avaliados por DEP e sumário' },
  { v: 'R$ 0', l: 'Assessoria paga pelas centrais' },
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
          <div ref={ref} className="mb-20 grid grid-cols-1 sm:grid-cols-3">
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

        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
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
              <p className="mt-6 max-w-[480px]" style={{ ...typo.body, fontSize: 17, color: dark.body }}>
                {produto.lead}
              </p>
            </Reveal>

            <div className="mt-11 flex flex-col gap-3">
              {produto.pillars.map((p, i) => (
                <TopicCard key={p.title} index={i + 1} title={p.title} text={p.text} surface="dark" delay={i * 0.06} />
              ))}
            </div>
          </div>
        </div>
      </Container>
    </Section>
  )
}
