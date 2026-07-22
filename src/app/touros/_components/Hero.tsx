'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import { dark, typo, font } from '../_lib/tokens'
import { hero } from '../_lib/copy'
import { MultiLine, Eyebrow, TopicCard } from './ui'
import { LeadForm } from './Formulario'

const HERO_PHOTO = '/jmp/galeria-touros/IMG_0059.jpg'

export function Hero() {
  const reduce = useReducedMotion()
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
        src={HERO_PHOTO}
        alt="Touro Nelore PO selecionado pela Bula Assessoria"
        fill
        priority
        sizes="100vw"
        // Mobile: corte fechado no touro que encara a câmera (cupim + chifres, ~64%/44%)
        // → mesmo no slot estreito lê nítido como boi. Desktop: enquadra a cena inteira.
        className="object-cover object-[64%_44%] lg:object-[50%_35%]"
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

      {/* Mobile: flex-col com REORDER (título → form → tópicos) p/ o form cair
          no 1º fold. Desktop: grid 2 colunas (copy à esq., form à dir.).
          O wrapper de copy usa display:contents no mobile → título e tópicos
          viram filhos diretos do flex e reordenam ao redor do form. */}
      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-[1180px] flex-col gap-9 px-5 pb-16 pt-16 sm:px-8 lg:grid lg:grid-cols-[1fr_minmax(420px,500px)] lg:items-center lg:gap-20 lg:pb-20 lg:pt-32">
        <div className="contents lg:relative lg:block lg:self-center lg:pr-6">
          {/* Bloco marca + eyebrow + título (mobile: order-1) */}
          <div className="relative order-1 lg:order-none">
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
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="relative mb-8 sm:mb-10"
            >
              <Image src="/logo-bula-assessoria-white.png" alt="Bula Assessoria" width={200} height={52} className="h-12 w-auto sm:h-14" priority />
            </motion.div>

            <motion.div
              initial={enter(14)}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="mb-5 sm:mb-6"
            >
              <Eyebrow surface="dark">{hero.eyebrow}</Eyebrow>
            </motion.div>

            <motion.h1
              initial={enter(18)}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              style={{ ...typo.displayXL, maxWidth: '15ch' }}
            >
              <MultiLine text={hero.title} />
            </motion.h1>
          </div>

          {/* Tópicos — cards Apple-like (mobile: order-3, abaixo do form) */}
          <div className="order-3 flex max-w-[520px] flex-col gap-3 lg:order-none lg:mt-12">
            {hero.leadBullets.map((item, i) => (
              <TopicCard key={item} index={i + 1} text={item} surface="dark" delay={i * 0.06} />
            ))}
          </div>
        </div>

        {/* Card do form multi-step (mobile: order-2 — logo após o título) */}
        <motion.div
          initial={enter(20)}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="order-2 lg:order-none lg:self-center"
        >
          <LeadForm />
        </motion.div>
      </div>
    </section>
  )
}
