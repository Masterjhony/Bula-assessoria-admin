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
  // A ÚNICA família que NÃO vem do root layout: carrega por `next/font` dentro
  // de `saogeraldo/layout.tsx`, que publica a var `--font-serif`. Fora desta
  // rota a var não existe e o fallback Georgia assume — de propósito.
  //
  // PAPEL, e ele é fechado: a serifa é a voz do EVENTO (a data, a abertura do
  // rebanho, o crédito dos criatórios). O Oswald continua sendo a voz da BULA
  // (títulos, CTA, rótulos, NÚMERO de ficha). Dado tabular é operação, e
  // operação é do condensado — a serifa não toca em número nenhum.
  serif: "var(--font-serif), 'Playfair Display', Georgia, serif",
} as const

/**
 * FIO DUPLO — 1px + 3px de intervalo + 1px = 5px de altura total.
 *
 * O "~2pt" do repertório de catálogo resolve em 2,67px a 96dpi; 3px é o inteiro
 * mais próximo e não borra em tela de 1x.
 *
 * A regra que decide onde ele entra, para ninguém inventar a sua: **fio duplo
 * marca fronteira de CERIMÔNIA; hairline de 1px continua marcando fronteira de
 * LISTA.** Grade da Oferta e lista do Fecho seguem em hairline simples.
 */
export const rule = { hair: 1, gap: 3 } as const

/**
 * Verde-musgo — importado do sistema do catálogo, com restrição dura.
 *
 * Medido sobre #39553E sólido:
 *   corpo greige #9A9488 .... 2,74:1  REPROVA AA
 *   dourado     #C8A96E .... 3,68:1  só AA-large
 *   branco      #F5F5F5 .... 7,57:1  AA
 *
 * Por isso: `musgo` só como FIO de 1px, `musgoWash` só como FUNDO de bloco de
 * ficha. A 10% sobre #0D0D0D o fundo efetivo é ~#111412 e o corpo greige
 * mantém 6,15:1 — continua AA, e o bloco ganha a temperatura que sinaliza
 * "aqui é dado técnico".
 *
 * PROIBIDO: #39553E sólido como background de qualquer coisa com texto em cima.
 */
export const ink = {
  musgo: '#39553E',
  musgoWash: 'rgba(57, 85, 62, 0.10)',
} as const

/** Raios retos — o vocabulário editorial. Nada de 14–18px. */
export const radius = { none: 0, xs: 2, sm: 4 } as const

/**
 * ESCALA DE ESPAÇAMENTO VERTICAL.
 *
 * Por que existe, e por que em PIXEL e não em utilitário do Tailwind:
 * o root desta aplicação é **14px**, não 16px. Toda classe de espaçamento do
 * Tailwind é em `rem`, então tudo que se escreve aqui chega à tela 12,5% menor
 * do que o número sugere — `mt-5` vira 17,5px, `py-3.5` vira 12,25px, `gap-10`
 * vira 35px. Foi essa diferença silenciosa entre o valor escrito e o valor
 * renderizado que deixou a página sufocada: o ritmo foi pensado na escala
 * nominal e entregue numa escala encolhida.
 *
 * Os degraus abaixo são medidos na tela, não no papel. Como são `clamp()` em
 * px, o que está escrito é o que aparece — e o mobile cresce menos que o
 * desktop, que é onde sobra largura para respirar.
 *
 * Regra de uso: espaçamento entre elementos vem DAQUI. Número solto num
 * componente volta a ser dívida.
 */
export const space = {
  /** Pares que são uma coisa só (número e sua unidade). */
  xs: 'clamp(8px, 1vw, 10px)',
  /** Rótulo → aquilo que ele nomeia. */
  sm: 'clamp(12px, 1.5vw, 16px)',
  /** Título → corpo, parágrafo → parágrafo. O degrau mais usado. */
  md: 'clamp(20px, 2.4vw, 28px)',
  /** Bloco → bloco dentro do mesmo assunto. */
  lg: 'clamp(30px, 3.8vw, 42px)',
  /** Assunto → assunto dentro da seção. */
  xl: 'clamp(42px, 5.4vw, 64px)',
  /** Cabeçalho da seção → conteúdo da seção. */
  '2xl': 'clamp(56px, 7.5vw, 88px)',
} as const

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
    // 1.06 é entrelinha de display de UMA linha. Este preset carrega títulos de
    // DUAS linhas (o do Fecho, o da Oferta), e a 1.06 as linhas se encostavam.
    // 1.14 abre o suficiente para separá-las sem soltar o bloco.
    lineHeight: 1.14,
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
    // 1.65: a queixa nº1 do cliente foi "falta espaço ENTRE O TEXTO", e num
    // parágrafo isso é entrelinha antes de ser margem. A 1.55 estava no piso da
    // faixa legível (1.5–1.75); 1.65 é o meio dela — a mudança aparece em todo
    // parágrafo da página de uma vez, que é onde o efeito é mais sentido.
    lineHeight: 1.65,
  },
  button: {
    fontFamily: font.display,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.14em',
    fontSize: 15,
    lineHeight: 1,
  },

  // ── Presets do REDESIGN (aditivos). Nenhum preset acima muda: `Formulario.tsx`
  //    está fora de escopo, vive DENTRO da primeira dobra e consome `monoLabel`,
  //    `displayLg` e `body`. Mutar qualquer um deles redesenharia o formulário
  //    sem que o arquivo fosse tocado — a forma mais silenciosa de perder o KPI.

  /**
   * A DATA COMO MONUMENTO (`01 AGOSTO`). Serifa, peso 400.
   *
   * O piso é 26px, e não os 34px que a régua de display pediria, porque no
   * celular ele não pode passar o `h1` (30px): num anúncio pago a promessa vem
   * antes da cerimônia na ordem de leitura. No desktop o teto abre para 44px,
   * que é onde a cerimônia fica cara e fica boa.
   */
  dataMonumento: {
    fontFamily: font.serif,
    fontWeight: 400,
    fontSize: 'clamp(26px, 7vw, 44px)',
    lineHeight: 1.05,
    letterSpacing: '-0.005em',
  },
  /**
   * SMALL CAPS DE CERIMÔNIA (`SÁBADO · 12H`, crédito dos criatórios).
   *
   * Small caps FAUX de propósito: a versão do Google não garante `smcp` no
   * subset, então é caixa alta + corpo menor + tracking largo — o mesmo
   * mecanismo que o `Eyebrow` já usa com Oswald a 0.22em.
   */
  cerimonia: {
    fontFamily: font.serif,
    fontWeight: 400,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.18em',
    fontSize: 'clamp(11px, 1.3vw, 13px)',
    lineHeight: 1.4,
  },
  /** Título da abertura sangrada da Pista. Serifa, sobre vinheta, nunca sobre corpo. */
  aberturaSerif: {
    fontFamily: font.serif,
    fontWeight: 400,
    fontSize: 'clamp(30px, 5.4vw, 60px)',
    lineHeight: 1.12,
    letterSpacing: '-0.005em',
  },
  /**
   * NÚMERO da ficha do rebanho — OSWALD, não serifa, e isso é regra, não gosto:
   * dado tabular é operação, e operação é do condensado. A serifa fala pelo
   * evento; o número fala pela leitura do catálogo, que é trabalho da Bula.
   */
  fichaValor: {
    fontFamily: font.display,
    fontWeight: 600,
    fontSize: 'clamp(34px, 6vw, 54px)',
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  /** Rótulo da ficha — Plex Mono, o mesmo registro técnico do resto da página. */
  fichaRotulo: {
    fontFamily: font.mono,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.14em',
    fontSize: 'clamp(10.5px, 1.2vw, 11.5px)',
    lineHeight: 1.45,
  },
} as const

export type Surface = 'dark' | 'light'
export const palette = { dark, light } as const
