// ─────────────────────────────────────────────────────────────────────────
// Design tokens da landing de touros — Apple × Bula.
//
// Filosofia (traduzida do design-md da Apple + brandbook Bula):
//  · Photography-first: a foto do touro domina; a UI recede.
//  · Tiles edge-to-edge que ALTERNAM claro (parchment) ↔ escuro (near-black).
//    A troca de superfície É o divisor — sem bordas/gradientes decorativos.
//  · UM único accent interativo: o dourado da Bula. NUNCA um 2º accent.
//  · Tipografia Inter com tracking negativo nos displays (o "Apple tight").
//    Escada de peso 300 / 400 / 600 / 700 — sem 500.
//  · UMA única sombra em todo o sistema: sob a foto do touro em destaque.
//  · Mobile-first: escalas nascem no mobile via clamp() e sobem.
// ─────────────────────────────────────────────────────────────────────────

/** Paleta escura (near-black tile) — near-black da Bula. */
export const dark = {
  bg: '#0D0D0D',
  surface: '#141414',
  surface2: '#1A1A1A',
  text: '#F5F5F5',
  muted: '#B0B0B0',
  faint: '#666666',
  gold: '#C8A96E',
  goldDim: 'rgba(200, 169, 110, 0.14)',
  hairline: 'rgba(255, 255, 255, 0.10)',
} as const

/** Paleta clara (parchment tile) — o off-white da Bula, primo do #f5f5f7 Apple. */
export const light = {
  bg: '#F5F3EF',
  surface: '#FFFFFF',
  text: '#1A1A1A',
  muted: '#555555',
  faint: '#8A8A8A',
  gold: '#A68B4B',
  goldDim: 'rgba(166, 139, 75, 0.10)',
  hairline: 'rgba(0, 0, 0, 0.08)',
} as const

/** Feature settings do Inter que aproximam o "a" arredondado do SF Pro. */
export const interFeatures = '"ss03", "cv11"'

export type Surface = 'dark' | 'light'
export const palette = { dark, light } as const
