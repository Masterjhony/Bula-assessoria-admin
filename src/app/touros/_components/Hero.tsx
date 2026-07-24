'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { dark, typo, font } from '../_lib/tokens'
import { hero } from '../_lib/copy'
import { useSafeReducedMotion } from '../_lib/useSafeReducedMotion'
import { MultiLine, Eyebrow } from './ui'
import { LeadForm } from './Formulario'

// Foto por viewport: retrato (touro encarando a câmera) no mobile — preenche o
// slot vertical sem corte estranho; paisagem (curral ao entardecer) no desktop.
const HERO_PHOTO_MOBILE = '/jmp/galeria-touros/IMG_0037.jpg'
const HERO_PHOTO_DESKTOP = '/jmp/galeria-touros/IMG_0003.jpg'

export function Hero() {
  const reduce = useSafeReducedMotion()
  const enter = (y: number) => (reduce ? false : { opacity: 0, y })
  return (
    <section
      id="cadastro"
      className="relative w-full overflow-hidden"
      style={{ background: dark.bg, color: dark.text, minHeight: '100svh', colorScheme: 'dark' }}
    >
      {/* Anel de foco visível (WCAG 2.4.7) — cantos retos combinam c/ inputs. */}
      <style>{`
        #cadastro input:focus-visible,
        #cadastro select:focus-visible,
        #cadastro button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px #0D0D0D, 0 0 0 4px rgba(200,169,110,0.85);
        }
        #cadastro ::placeholder { color: #8A8A8A; opacity: 1; }
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
          sólido: o texto lê como se estivesse SOBRE superfície escura, não sobre a
          foto crua. Some antes do form → a foto respira atrás do card de vidro. */}
      <div
        aria-hidden
        className="absolute inset-0 hidden lg:block"
        style={{
          background:
            'linear-gradient(90deg, rgba(13,13,13,0.80) 0%, rgba(13,13,13,0.42) 44%, rgba(13,13,13,0) 72%)',
        }}
      />

      {/* Mobile: flex-col (logo → título → form). Desktop: grid 2 colunas com a
          logo CENTRALIZADA numa linha própria acima (col-span-2), copy à esq. e
          form à dir. */}
      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-[1180px] flex-col gap-9 px-5 pb-16 pt-10 sm:px-8 lg:grid lg:grid-cols-[1fr_minmax(420px,500px)] lg:items-center lg:gap-x-20 lg:gap-y-12 lg:pb-20 lg:pt-14">
        {/* Marca — centralizada e maior (pedido do cliente 24/07). */}
        <motion.div
          initial={enter(14)}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="order-1 flex justify-center lg:order-none lg:col-span-2"
        >
          <Image src="/logo-bula-assessoria-white.png" alt="Bula Assessoria" width={400} height={104} className="h-20 w-auto sm:h-24 lg:h-28" priority />
        </motion.div>

        <div className="contents lg:relative lg:block lg:self-center lg:pr-6">
          {/* Bloco eyebrow + título (mobile: order-2) */}
          <div className="relative order-2 lg:order-none">
            {/* Número de livery — profundidade editorial, não bolha 3D. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -left-2 -top-24 hidden select-none lg:block"
              style={{
                fontFamily: font.display,
                fontSize: 300,
                fontWeight: 700,
                lineHeight: 1,
                color: dark.gold,
                opacity: 0.05,
                letterSpacing: '-0.04em',
              }}
            >
              B
            </span>

            <motion.div
              initial={enter(14)}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="mb-5 sm:mb-6"
            >
              <Eyebrow surface="dark">{hero.eyebrow}</Eyebrow>
            </motion.div>

            {/* Headline longa (promessa em R$) → tamanho um degrau abaixo do
                displayXL e largura maior, senão viram 7 linhas no mobile. */}
            <motion.h1
              initial={enter(18)}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              style={{
                ...typo.displayXL,
                fontSize: 'clamp(28px, 4.6vw, 52px)',
                lineHeight: 1.12,
                maxWidth: '24ch',
              }}
            >
              <MultiLine text={hero.title} />
            </motion.h1>
          </div>
        </div>

        {/* Card do form multi-step (mobile: order-3 — logo após o título) */}
        <motion.div
          initial={enter(20)}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="order-3 lg:order-none lg:self-center"
        >
          <LeadForm />
        </motion.div>
      </div>
    </section>
  )
}
