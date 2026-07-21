'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import { dark } from '../_lib/tokens'
import { hero } from '../_lib/copy'
import { PillButton, MultiLine } from './ui'

// Dobra principal photography-first. A foto do touro ocupa todo o tile; a UI
// recede. Foto candidata real do projeto (/jmp/galeria-touros) — a definitiva
// do cliente entra em public/touros/ depois (ver Pendências).
const HERO_PHOTO = '/jmp/galeria-touros/IMG_0059.jpg'

export function Hero() {
  const reduce = useReducedMotion()
  const enter = (y: number) => (reduce ? false : { opacity: 0, y })
  return (
    <section
      className="relative w-full overflow-hidden"
      style={{
        background: dark.bg,
        color: dark.text,
        minHeight: '100svh',
      }}
    >
      {/* Foto de fundo — LCP, carrega eager. `object-position` mais alto no
          mobile para enquadrar o touro no formato retrato. */}
      <Image
        src={HERO_PHOTO}
        alt="Touro Nelore PO selecionado pela Bula Assessoria"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[50%_35%]"
      />
      {/* Overlay para contraste AA do texto — atmosfera vem da foto, NÃO de
          gradiente decorativo; é só um véu de legibilidade. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(13,13,13,0.55) 0%, rgba(13,13,13,0.35) 40%, rgba(13,13,13,0.88) 100%)',
        }}
      />

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-[1120px] flex-col justify-end px-5 pb-16 pt-28 sm:px-8 sm:pb-24">
        <motion.p
          initial={enter(14)}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-5 text-[12px] font-semibold uppercase sm:text-[13px]"
          style={{ letterSpacing: '0.18em', color: dark.gold }}
        >
          {hero.eyebrow}
        </motion.p>

        <motion.h1
          initial={enter(18)}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          style={{
            fontWeight: 600,
            fontSize: 'clamp(38px, 8vw, 76px)',
            lineHeight: 1.04,
            letterSpacing: '-0.03em',
            maxWidth: 15 + 'ch',
          }}
        >
          <MultiLine text={hero.title} />
        </motion.h1>

        <motion.p
          initial={enter(18)}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-[560px]"
          style={{
            fontWeight: 300,
            fontSize: 'clamp(18px, 2.4vw, 24px)',
            lineHeight: 1.4,
            color: dark.text,
          }}
        >
          {hero.lead}
        </motion.p>

        <motion.div
          initial={enter(18)}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center"
        >
          <PillButton href="#cadastro" surface="dark">
            {hero.cta}
          </PillButton>
          <span className="text-[13px]" style={{ color: dark.muted, letterSpacing: '-0.01em' }}>
            {hero.proof}
          </span>
        </motion.div>
      </div>
    </section>
  )
}
