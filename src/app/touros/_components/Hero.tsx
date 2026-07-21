'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import { dark } from '../_lib/tokens'
import { hero } from '../_lib/copy'
import { MultiLine } from './ui'
import { LeadForm } from './Formulario'

// Dobra principal photography-first COM o formulário multi-step (captura na 1ª
// dobra, tráfego pago). Split no desktop (copy+marca | form), empilhado no
// mobile. A foto do touro é a atmosfera; o card do form é o "produto" em
// destaque. Foto candidata real do projeto — a definitiva entra em public/touros.
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
      {/* Anel de foco visível (WCAG 2.4.7) para os controles do form no hero. */}
      <style>{`
        #cadastro input:focus-visible,
        #cadastro select:focus-visible,
        #cadastro button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px rgba(200, 169, 110, 0.45);
        }
      `}</style>

      {/* Foto de fundo — LCP, carrega eager. */}
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
            'linear-gradient(180deg, rgba(13,13,13,0.72) 0%, rgba(13,13,13,0.55) 45%, rgba(13,13,13,0.9) 100%)',
        }}
      />

      <div className="relative mx-auto grid min-h-[100svh] w-full max-w-[1180px] items-center gap-12 px-5 pb-24 pt-24 sm:px-8 lg:grid-cols-[1fr_minmax(420px,500px)] lg:gap-16 lg:pb-16 lg:pt-28">
        {/* Painel de copy + marca Bula */}
        <div className="relative">
          {/* Monograma dourado como watermark — profundidade sutil, não-3D. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -left-3 -top-20 hidden select-none lg:block"
            style={{ fontSize: 340, fontWeight: 700, lineHeight: 1, color: dark.gold, opacity: 0.06, letterSpacing: '-0.05em' }}
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

          <motion.p
            initial={enter(14)}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="mb-6 text-[12px] font-semibold uppercase sm:text-[13px]"
            style={{ letterSpacing: '0.18em', color: dark.gold }}
          >
            {hero.eyebrow}
          </motion.p>

          <motion.h1
            initial={enter(18)}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            style={{
              fontWeight: 600,
              fontSize: 'clamp(34px, 6vw, 60px)',
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              maxWidth: '15ch',
            }}
          >
            <MultiLine text={hero.title} />
          </motion.h1>

          <motion.p
            initial={enter(18)}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="mt-7 max-w-[520px]"
            style={{ fontWeight: 300, fontSize: 'clamp(17px, 2vw, 21px)', lineHeight: 1.5, color: dark.text }}
          >
            {hero.lead}
          </motion.p>

          <motion.p
            initial={enter(18)}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 text-[13px]"
            style={{ color: dark.muted, letterSpacing: '-0.01em' }}
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
