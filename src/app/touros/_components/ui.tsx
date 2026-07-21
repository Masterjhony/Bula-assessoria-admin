'use client'

import { motion } from 'framer-motion'
import type { ReactNode, CSSProperties } from 'react'
import { dark, light, type Surface } from '../_lib/tokens'

// ── Primitivos de UI da landing (Apple × Bula) ─────────────────────────────
// Cada Section declara sua própria SUPERFÍCIE (dark ↔ light). A troca de cor
// entre tiles adjacentes é o divisor — sem bordas nem gradientes decorativos.

export function palette(surface: Surface) {
  return surface === 'dark' ? dark : light
}

/** Tile edge-to-edge. `surface` define bg/texto; a alternância cria o ritmo. */
export function Section({
  surface,
  id,
  children,
  className = '',
  style,
}: {
  surface: Surface
  id?: string
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const p = palette(surface)
  return (
    <section
      id={id}
      className={`w-full px-5 sm:px-8 ${className}`}
      style={{
        background: p.bg,
        color: p.text,
        // Section rhythm: 56px mobile → 112px desktop (Apple ~80px, folgado).
        paddingTop: 'clamp(56px, 10vw, 112px)',
        paddingBottom: 'clamp(56px, 10vw, 112px)',
        ...style,
      }}
    >
      {children}
    </section>
  )
}

/** Container central. `wide` para grids; padrão ~980px para texto (Apple). */
export function Container({
  children,
  wide = false,
  className = '',
}: {
  children: ReactNode
  wide?: boolean
  className?: string
}) {
  return (
    <div
      className={`mx-auto w-full ${className}`}
      style={{ maxWidth: wide ? 1200 : 980 }}
    >
      {children}
    </div>
  )
}

/** CTA em pílula — o ÚNICO elemento com o accent dourado preenchido. */
export function PillButton({
  children,
  href,
  onClick,
  type = 'button',
  surface = 'dark',
  disabled = false,
  full = false,
}: {
  children: ReactNode
  href?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  surface?: Surface
  disabled?: boolean
  full?: boolean
}) {
  const p = palette(surface)
  const style: CSSProperties = {
    background: disabled ? 'rgba(150,150,150,0.35)' : p.gold,
    color: '#0D0D0D',
    borderRadius: 9999,
    padding: '15px 30px',
    fontWeight: 600,
    fontSize: 17,
    letterSpacing: '-0.01em',
    minHeight: 52,
    width: full ? '100%' : undefined,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  }
  const motionProps = {
    whileTap: disabled ? undefined : { scale: 0.97 },
    transition: { duration: 0.15 },
  }
  if (href) {
    return (
      <motion.a href={href} style={style} {...motionProps}>
        {children}
      </motion.a>
    )
  }
  return (
    <motion.button type={type} onClick={onClick} disabled={disabled} style={style} {...motionProps}>
      {children}
    </motion.button>
  )
}

/** Reveal sutil (fade + subida) ao entrar na viewport — o "respiro" Apple. */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Preserva quebras de linha (\n) como <br/>. */
export function MultiLine({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  )
}
