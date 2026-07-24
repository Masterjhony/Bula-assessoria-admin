// ─────────────────────────────────────────────────────────────────────────
// Design tokens — landing de touros. Linguagem EDITORIAL-CINEMATOGRÁFICA
// (Ferrari × Bula).
//
//  · Canvas near-black; DISPLAY branco; CORPO em cinza editorial (não branco).
//  · Dourado #C8A96E = voltagem ÚNICA e escassa (CTA, marca, números, 1px).
//  · Cantos retos (0–4px) + hairlines ~1px. Sem glass/blur, sem sombra suave.
//  · Oswald nos títulos/displays e nos labels em CAIXA ALTA com tracking largo.
//    Inter no corpo. IBM Plex Mono nos números/rótulos técnicos (ficha).
//  · Mobile-first via clamp(). Contraste dos cinzas de corpo passa WCAG AA.
// ─────────────────────────────────────────────────────────────────────────

/** Near-black tile. */
export const dark = {
  bg: '#0D0D0D',
  surface: '#141414', // card/painel flat sobre o near-black
  surface2: '#1A1A1A',
  text: '#F5F5F5', // display / ênfase
  // Cinza editorial QUENTE (greige) — dá ar de couro/pelagem, harmoniza com o
  // dourado. ~6.7:1 sobre #0D0D0D → AA para corpo.
  body: '#9A9488',
  muted: '#B0B0B0', // secundário forte — ~8:1
  faint: '#6B6B6B', // captions/labels GRANDES apenas (falha AA <18px)
  gold: '#C8A96E', // ~8:1 sobre #0D0D0D
  goldText: '#C8A96E',
  goldDim: 'rgba(200, 169, 110, 0.14)',
  hairline: 'rgba(255, 255, 255, 0.12)',
  hairlineStrong: 'rgba(255, 255, 255, 0.22)',
} as const

/** Parchment tile. */
export const light = {
  bg: '#F5F3EF',
  surface: '#FFFFFF',
  text: '#1A1A1A',
  body: '#4A4A4A', // corpo — ~8:1 sobre #F5F3EF
  muted: '#555555', // ~6.7:1
  faint: '#7A7A7A', // labels GRANDES apenas (falha AA <18px)
  gold: '#A68B4B', // usar só ≥18px sobre claro (2.9:1)
  goldText: '#6E5A2E', // gold p/ LABELS PEQUENOS em fundo claro — passa AA
  goldDim: 'rgba(166, 139, 75, 0.10)',
  hairline: 'rgba(0, 0, 0, 0.14)',
  hairlineStrong: 'rgba(0, 0, 0, 0.24)',
} as const

/** Feature settings do Inter (arredonda o "a", aproxima do SF Pro). */
export const interFeatures = '"ss03", "cv11"'

/** Famílias — todas já carregadas no root layout. */
export const font = {
  display: "'Oswald', 'Inter', system-ui, sans-serif", // condensada, voz Bula
  body: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
} as const

/** Raios retos — o vocabulário editorial. Nada de 14–18px. */
export const radius = { none: 0, xs: 2, sm: 4 } as const

/**
 * Presets de tipografia. Regra:
 *  · DISPLAYS (Oswald 600) → mixed-case, tracking levemente NEGATIVO.
 *  · EYEBROW / BOTÃO / LABEL / MONO → CAIXA ALTA, tracking LARGO.
 *  · STAT → número gigante Oswald (ficha técnica).
 */
export const typo = {
  eyebrow: {
    fontFamily: font.display,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.22em',
    fontSize: 'clamp(11px, 1.4vw, 13px)',
    lineHeight: 1.3,
  },
  monoLabel: {
    fontFamily: font.mono,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.14em',
    fontSize: 'clamp(11px, 1.3vw, 12px)',
    lineHeight: 1.3,
  },
  displayXL: {
    fontFamily: font.display,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    fontSize: 'clamp(38px, 6.4vw, 72px)',
    lineHeight: 1.02,
  },
  displayLg: {
    fontFamily: font.display,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    fontSize: 'clamp(28px, 4.6vw, 48px)',
    lineHeight: 1.06,
  },
  stat: {
    fontFamily: font.display,
    fontWeight: 600,
    letterSpacing: '-0.015em',
    fontSize: 'clamp(52px, 8.5vw, 104px)',
    lineHeight: 0.9,
  },
  body: {
    fontFamily: font.body,
    fontWeight: 400,
    letterSpacing: '0',
    fontSize: 'clamp(15px, 1.6vw, 17px)',
    lineHeight: 1.55,
  },
  button: {
    fontFamily: font.display,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.14em',
    fontSize: 15,
    lineHeight: 1,
  },
} as const

export type Surface = 'dark' | 'light'
export const palette = { dark, light } as const
