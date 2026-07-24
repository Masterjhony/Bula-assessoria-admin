'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { dark, typo, font } from '../_lib/tokens'
import { hero } from '../_lib/copy'
import { useSafeReducedMotion } from '../_lib/useSafeReducedMotion'
import { MultiLine, Eyebrow, Hairline } from './ui'

// Foto por viewport: retrato (touro encarando a câmera) no mobile — preenche o
// slot vertical sem corte estranho; paisagem (curral ao entardecer) no desktop.
const HERO_PHOTO_MOBILE = '/jmp/galeria-touros/IMG_0037.jpg'
const HERO_PHOTO_DESKTOP = '/jmp/galeria-touros/IMG_0003.jpg'

// Hero CINEMATOGRÁFICO (revisão do cliente 24/07): o formulário desceu para o
// fim da página (#cadastro), então a 1ª dobra vira promessa + prova + CTA:
//   marca → eyebrow → manchete (retorno em R$) → olho → CTA → ficha técnica.
// A foto respira inteira (não divide mais espaço com o card do form) e a ficha
// no rodapé do tile ancora a composição — sem deixar a dobra "vazia".
export function Hero() {
  const reduce = useSafeReducedMotion()
  const enter = (y: number) => (reduce ? false : { opacity: 0, y })
  return (
    <section
      id="topo"
      className="relative w-full overflow-hidden"
      style={{ background: dark.bg, color: dark.text, minHeight: '100svh', colorScheme: 'dark' }}
    >
      {/* Anel de foco visível (WCAG 2.4.7) — cantos retos combinam c/ o CTA. */}
      <style>{`
        #topo a:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px #0D0D0D, 0 0 0 4px rgba(200,169,110,0.85);
        }
      `}</style>

      {/* Foto de fundo cinematográfica — LCP. */}
      <Image
        src={HERO_PHOTO_MOBILE}
        alt="Touro Nelore PO selecionado pela Bula Assessoria"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[50%_28%] lg:hidden"
      />
      <Image
        src={HERO_PHOTO_DESKTOP}
        alt=""
        aria-hidden
        fill
        priority
        sizes="100vw"
        className="hidden object-cover object-[50%_62%] lg:block"
      />
      {/* Véu base (mobile-first) — funda a foto o suficiente p/ o texto ler bem,
          mas leve o bastante p/ o boi aparecer. Atmosfera vem da foto. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(13,13,13,0.72) 0%, rgba(13,13,13,0.50) 44%, rgba(13,13,13,0.93) 100%)',
        }}
      />
      {/* Scrim direcional (desktop) — aprofunda o lado da copy num "painel" quase
          sólido: o texto lê como se estivesse SOBRE superfície escura, não sobre
          a foto crua. Do lado direito quase some — a foto respira. */}
      <div
        aria-hidden
        className="absolute inset-0 hidden lg:block"
        style={{
          background:
            'linear-gradient(90deg, rgba(13,13,13,0.82) 0%, rgba(13,13,13,0.46) 46%, rgba(13,13,13,0.10) 78%, rgba(13,13,13,0.10) 100%)',
        }}
      />

      {/* Coluna única: logo no topo, bloco de copy centrado verticalmente e a
          ficha técnica ancorada no rodapé do tile. */}
      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-[1180px] flex-col px-5 pb-12 pt-10 sm:px-8 lg:pb-16 lg:pt-14">
        {/* Marca — centralizada e maior (pedido do cliente 24/07). */}
        <motion.div
          initial={enter(14)}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex justify-center"
        >
          <Image src="/logo-bula-assessoria-white.png" alt="Bula Assessoria" width={400} height={104} className="h-20 w-auto sm:h-24 lg:h-28" priority />
        </motion.div>

        {/* Bloco central — promessa + olho + CTA. */}
        <div className="relative flex flex-1 items-center py-9 lg:py-10">
          {/* Número de livery — profundidade editorial, não bolha 3D. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -left-2 top-1/2 hidden -translate-y-1/2 select-none lg:block"
            style={{
              fontFamily: font.display,
              fontSize: 340,
              fontWeight: 700,
              lineHeight: 1,
              color: dark.gold,
              opacity: 0.05,
              letterSpacing: '-0.04em',
            }}
          >
            B
          </span>

          <div className="relative w-full max-w-[760px]">
            <motion.div
              initial={enter(14)}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="mb-5 sm:mb-6"
            >
              <Eyebrow surface="dark">{hero.eyebrow}</Eyebrow>
            </motion.div>

            {/* Headline longa (promessa em R$) — com o form fora da dobra ela
                ganha largura e um degrau de tamanho. */}
            <motion.h1
              initial={enter(18)}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              style={{
                ...typo.displayXL,
                fontSize: 'clamp(30px, 4.9vw, 56px)',
                lineHeight: 1.06,
                maxWidth: '18ch',
              }}
            >
              <MultiLine text={hero.title} />
            </motion.h1>

            <motion.p
              initial={enter(16)}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 max-w-[560px]"
              style={{ ...typo.body, fontSize: 'clamp(16px, 1.8vw, 19px)', color: dark.muted }}
            >
              {hero.lead}
            </motion.p>

            <motion.div
              initial={enter(16)}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="mt-9"
            >
              {/* Âncora (não PillButton) — o CTA do hero é sempre navegação para
                  o formulário no fim da página. */}
              <a
                href="#cadastro"
                className="inline-flex w-full items-center justify-center sm:w-auto"
                style={{
                  ...typo.button,
                  background: dark.gold,
                  color: '#0D0D0D',
                  borderRadius: 0,
                  minHeight: 56,
                  padding: '0 34px',
                  gap: 10,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {hero.cta}
              </a>
              <p className="mt-4" style={{ ...typo.monoLabel, fontSize: 11, letterSpacing: '0.1em', color: dark.muted }}>
                {hero.ctaNote}
              </p>
            </motion.div>
          </div>
        </div>

        {/* Ficha técnica — prova quantificada ancorada no rodapé da dobra. */}
        <motion.div
          initial={enter(18)}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <Hairline surface="dark" />
          <div className="grid grid-cols-3 gap-4 pt-5 sm:gap-8 sm:pt-6">
            {hero.stats.map((s) => (
              <div key={s.label}>
                <div
                  style={{
                    fontFamily: font.display,
                    fontWeight: 600,
                    letterSpacing: '-0.015em',
                    fontSize: 'clamp(24px, 3.4vw, 40px)',
                    lineHeight: 1,
                    color: dark.text,
                  }}
                >
                  {s.value}
                </div>
                <div className="mt-2" style={{ ...typo.monoLabel, fontSize: 'clamp(9.5px, 1.1vw, 11.5px)', color: dark.gold }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
