'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode, CSSProperties } from 'react'
import { dark, light, typo, radius, type Surface } from '../_lib/tokens'

// ── Primitivos editoriais (Ferrari × Bula) ─────────────────────────────────
// Cada Section declara sua SUPERFÍCIE (dark ↔ light). A troca de cor entre
// tiles adjacentes é o divisor. Estética flat: hairlines, cantos retos, sem
// glass e sem sombra suave. Dourado é voltagem única e escassa.

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
        // Ritmo generoso, editorial: 64px mobile → 128px desktop.
        paddingTop: 'clamp(64px, 11vw, 128px)',
        paddingBottom: 'clamp(64px, 11vw, 128px)',
        ...style,
      }}
    >
      {children}
    </section>
  )
}

/** Container central. `wide` para grids; padrão ~980px para texto. */
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
    <div className={`mx-auto w-full ${className}`} style={{ maxWidth: wide ? 1200 : 980 }}>
      {children}
    </div>
  )
}

/** Eyebrow / kicker — CAIXA ALTA, tracking largo, dourado escasso. */
export function Eyebrow({
  children,
  surface = 'dark',
  color,
  className = '',
  style,
}: {
  children: ReactNode
  surface?: Surface
  color?: string
  className?: string
  style?: CSSProperties
}) {
  const c = color ?? (surface === 'light' ? light.goldText : dark.gold)
  return (
    <p className={className} style={{ ...typo.eyebrow, color: c, ...style }}>
      {children}
    </p>
  )
}

/** Hairline 1px — o divisor editorial. */
export function Hairline({
  surface = 'dark',
  strong = false,
  className = '',
  style,
}: {
  surface?: Surface
  strong?: boolean
  className?: string
  style?: CSSProperties
}) {
  const p = palette(surface)
  return (
    <div
      aria-hidden
      className={className}
      style={{ height: 1, width: '100%', background: strong ? p.hairlineStrong : p.hairline, ...style }}
    />
  )
}

/** Número de ficha técnica — display gigante Oswald + rótulo mono. */
export function StatNumber({
  value,
  label,
  surface = 'dark',
  align = 'left',
}: {
  value: ReactNode
  label: ReactNode
  surface?: Surface
  align?: 'left' | 'center'
}) {
  const p = palette(surface)
  const labelColor = surface === 'light' ? light.goldText : dark.gold
  return (
    <div style={{ textAlign: align }}>
      <div style={{ ...typo.stat, color: p.text }}>{value}</div>
      <div style={{ ...typo.monoLabel, color: labelColor, marginTop: 10 }}>{label}</div>
    </div>
  )
}

/**
 * CTA editorial — retangular (radius 0), Oswald CAIXA ALTA, tracking largo.
 * `variant='solid'` = ouro preenchido (o único preenchimento dourado).
 * `variant='outline'` = transparente com hairline (Ferrari outline CTA).
 */
export function PillButton({
  children,
  href,
  onClick,
  type = 'button',
  surface = 'dark',
  disabled = false,
  full = false,
  variant = 'solid',
}: {
  children: ReactNode
  href?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  surface?: Surface
  disabled?: boolean
  full?: boolean
  variant?: 'solid' | 'outline'
}) {
  const p = palette(surface)
  const solid: CSSProperties = {
    background: disabled ? 'rgba(150,150,150,0.30)' : p.gold,
    color: '#0D0D0D',
    border: '1px solid transparent',
  }
  const outline: CSSProperties = {
    background: 'transparent',
    color: p.text,
    border: `1px solid ${p.hairlineStrong}`,
  }
  const style: CSSProperties = {
    ...typo.button,
    ...(variant === 'outline' ? outline : solid),
    borderRadius: radius.none, // 0px — canto reto é o botão da marca
    padding: '0 30px',
    minHeight: 54,
    width: full ? '100%' : undefined,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    WebkitTapHighlightColor: 'transparent',
  }
  const motionProps = {
    whileTap: disabled ? undefined : { scale: 0.98 },
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

/** Reveal sutil (fade + subida) ao entrar na viewport. */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
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
