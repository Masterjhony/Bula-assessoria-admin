'use client'

import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { dark, font, radius, space, typo } from '../_lib/tokens'
import { useSafeReducedMotion } from '../_lib/useSafeReducedMotion'

// ─────────────────────────────────────────────────────────────────────────
// Primitivos do CATÁLOGO.
//
// Vivem separados de `ui.tsx` porque falam outra língua: aquele arquivo é o
// vocabulário editorial de cantos retos e hairline branca, e o catálogo é
// cápsula, borda dourada e canto redondo. `Container`, `Reveal` e `MultiLine`
// não têm opinião de pele e continuam vindo de lá.
// ─────────────────────────────────────────────────────────────────────────

/** As três superfícies da página. Nenhuma seção inventa a própria cor. */
export type Superficie = 'carvao' | 'profundo' | 'claro'

const FUNDO: Record<Superficie, string> = {
  carvao: dark.surface, // #2B1F13 — seções de conteúdo
  profundo: dark.bg, // #1A130D — captura e rodapé
  claro: '#FFFFFC',
}

export function Secao({
  children,
  superficie = 'carvao',
  id,
  className = '',
  style,
}: {
  children: ReactNode
  superficie?: Superficie
  id?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <section
      id={id}
      className={`relative w-full px-5 sm:px-8 ${className}`}
      style={{
        background: FUNDO[superficie],
        paddingTop: space['2xl'],
        paddingBottom: space['2xl'],
        // Âncora de rolagem: os CTAs apontam para #cadastro e a nav é fixa.
        scrollMarginTop: 72,
        ...style,
      }}
    >
      {children}
    </section>
  )
}

/**
 * FIO ORNAMENTO — a assinatura gráfica do catálogo.
 *
 * Duas linhas champagne que fazem FADE nas duas pontas, com um losango no
 * centro. É diferente do `FioDuplo` de `ui.tsx`, que é reto, assimétrico
 * (1px + 3px + 1px) e não tem losango — aquele marca fronteira de lista e
 * segue em uso onde já estava.
 *
 * A medida veio do PDF: as linhas somem antes de tocar a margem do bloco, e
 * o losango tem cerca de metade da altura entre elas.
 */
export function FioOrnamento({ largura = 420 }: { largura?: number }) {
  const linha: CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    background: `linear-gradient(to right, transparent 0%, ${dark.gold} 22%, ${dark.gold} 78%, transparent 100%)`,
  }
  return (
    <div
      aria-hidden
      style={{ position: 'relative', height: 9, width: '100%', maxWidth: largura, margin: '0 auto' }}
    >
      <div style={{ ...linha, top: 0 }} />
      <div style={{ ...linha, bottom: 0 }} />
      <span
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 5,
          height: 5,
          background: dark.gold,
          transform: 'translate(-50%, -50%) rotate(45deg)',
        }}
      />
    </div>
  )
}

/** Eyebrow do catálogo — Cormorant em caixa alta, sobre o fio ornamento. */
export function EyebrowCatalogo({
  children,
  comFio = true,
  cor = dark.gold,
}: {
  children: ReactNode
  comFio?: boolean
  cor?: string
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ ...typo.eyebrowSerif, color: cor, margin: 0 }}>{children}</p>
      {comFio && (
        <div style={{ marginTop: space.sm }}>
          <FioOrnamento />
        </div>
      )}
    </div>
  )
}

/**
 * CÁPSULA — a moldura de "150 REPRODUTORES NELORE PO".
 *
 * Borda champagne fina e canto totalmente redondo. No catálogo ela é vazada
 * sobre a foto; aqui ganha um véu escuro por trás para o texto não competir
 * com o céu do entardecer.
 */
export function Pilula({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={className}
      style={{
        display: 'inline-block',
        border: `1px solid ${dark.hairlineStrong}`,
        borderRadius: radius.pill,
        background: 'rgba(26, 19, 13, 0.55)',
        padding: `${space.sm} clamp(20px, 4vw, 40px)`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/**
 * BOTÃO-PÍLULA.
 *
 * `preenchido` é o CTA primário (champagne sólido, texto carvão — 6,58:1 na
 * leitura inversa). O vazado é o secundário da nav.
 *
 * O alvo tem 44px de altura mínima: é a régua de toque, e o botão da nav
 * costuma ser o primeiro elemento que um polegar encontra.
 */
export function BotaoPilula({
  children,
  href,
  preenchido = false,
  compacto = false,
  onClick,
}: {
  children: ReactNode
  href: string
  preenchido?: boolean
  compacto?: boolean
  onClick?: () => void
}) {
  const reduzir = useSafeReducedMotion()
  const base: CSSProperties = {
    ...typo.button,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    padding: compacto ? '10px 20px' : '15px 34px',
    fontSize: compacto ? 13 : 15,
    borderRadius: radius.pill,
    border: `1px solid ${dark.gold}`,
    background: preenchido ? dark.gold : 'transparent',
    color: preenchido ? dark.bg : dark.gold,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  }
  return (
    <motion.a
      href={href}
      onClick={onClick}
      style={base}
      whileHover={reduzir ? undefined : { y: -1, backgroundColor: preenchido ? '#D9C89A' : dark.goldDim }}
      whileTap={reduzir ? undefined : { y: 0 }}
      transition={{ duration: 0.18 }}
    >
      {children}
    </motion.a>
  )
}

/**
 * CARD DO CATÁLOGO — a moldura arredondada que emoldura "Condição de
 * Pagamento" e "Condição de Frete" nas páginas 2 e 3.
 *
 * Fundo levemente elevado sobre o carvão, borda champagne discreta e canto
 * de 26px. É o gesto que a versão anterior desta página proibia ("cantos
 * retos, sem sombra suave") e que o catálogo exige.
 */
export function CardCatalogo({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={className}
      style={{
        borderRadius: radius.card,
        border: `1px solid ${dark.hairline}`,
        background: 'rgba(58, 45, 30, 0.38)',
        padding: `clamp(28px, 5vw, 56px) clamp(20px, 4vw, 48px)`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/**
 * TÍTULO DE SEÇÃO — Playfair 700 centralizado, do jeito que as páginas 2 e 3
 * abrem. Recebe o eyebrow por cima quando ele existe.
 */
export function TituloSecao({
  eyebrow,
  children,
  id,
}: {
  eyebrow?: string
  children: ReactNode
  id?: string
}) {
  return (
    <header style={{ textAlign: 'center', marginBottom: space.xl }}>
      {eyebrow && <EyebrowCatalogo>{eyebrow}</EyebrowCatalogo>}
      <h2
        id={id}
        style={{
          ...typo.tituloCatalogo,
          color: dark.text,
          margin: 0,
          marginTop: eyebrow ? space.md : 0,
        }}
      >
        {children}
      </h2>
    </header>
  )
}

/** Fio pontilhado — o divisor entre os itens da condição de pagamento. */
export function FioPontilhado() {
  return (
    <hr
      aria-hidden
      style={{
        border: 0,
        borderTop: `1px dotted ${dark.hairlineStrong}`,
        margin: `${space.md} 0`,
        width: '100%',
      }}
    />
  )
}

/** Fonte re-exportada para quem só precisa dela sem reabrir tokens. */
export { font as fontesCatalogo }
