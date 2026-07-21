'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import { dark, typo, font } from '../_lib/tokens'
import { hero } from '../_lib/copy'
import { MultiLine, Eyebrow } from './ui'
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
        className="object-cover object-[50%_35%]"
      />
      {/* Véu de legibilidade — atmosfera vem da foto, não de gradiente decorativo. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(13,13,13,0.74) 0%, rgba(13,13,13,0.52) 45%, rgba(13,13,13,0.92) 100%)',
        }}
      />

      <div className="relative mx-auto grid min-h-[100svh] w-full max-w-[1180px] items-center gap-12 px-5 pb-24 pt-24 sm:px-8 lg:grid-cols-[1fr_minmax(420px,500px)] lg:gap-16 lg:pb-16 lg:pt-28">
        {/* Painel de copy + marca Bula */}
        <div className="relative">
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
            className="relative mb-9"
          >
            <Image src="/logo-bula-assessoria-white.png" alt="Bula Assessoria" width={140} height={36} className="h-9 w-auto" priority />
          </motion.div>

          <motion.div
            initial={enter(14)}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="mb-6"
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

          <motion.ul
            initial={enter(18)}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 flex max-w-[500px] flex-col"
          >
            {hero.leadBullets.map((item, i) => (
              <li
                key={item}
                className="flex items-start gap-4 py-3.5"
                style={{ borderTop: `1px solid ${dark.hairline}` }}
              >
                <span aria-hidden style={{ ...typo.monoLabel, color: dark.gold, marginTop: 3, minWidth: '2ch' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ ...typo.body, color: dark.text }}>{item}</span>
              </li>
            ))}
          </motion.ul>

          <motion.p
            initial={enter(18)}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8"
            style={{ ...typo.monoLabel, color: dark.muted }}
          >
            {hero.proof}
          </motion.p>
        </div>

        {/* Card do form multi-step */}
        <motion.div
          initial={enter(20)}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <LeadForm />
        </motion.div>
      </div>
    </section>
  )
}
