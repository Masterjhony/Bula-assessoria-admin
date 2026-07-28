// ─────────────────────────────────────────────────────────────────────────
// Design tokens — landing do Leilão Touros São Geraldo e 7P.
//
// REDESENHO (28/07): a página passa a reproduzir as três primeiras páginas do
// CATÁLOGO. A linguagem anterior (Ferrari × Bula: canvas near-black, dourado
// #C8A96E, cantos retos) sai inteira e entra a do catálogo:
//
//  · Canvas CARVÃO QUENTE (#1A130D → #3A2D1E), não near-black. É couro e
//    entardecer, não asfalto.
//  · Champagne #B9A46F no lugar do dourado. Mesmo papel — acento escasso.
//  · Cantos ARREDONDADOS e pílulas. O catálogo emoldura tudo em cápsula:
//    a pílula dos 150 reprodutores, o card da condição de pagamento, o card
//    do frete. É a assinatura da peça, e ela contradiz de propósito o
//    "cantos retos" da versão anterior.
//  · Playfair Display é a voz do EVENTO e agora também a do DISPLAY grande.
//    Oswald continua sendo a voz operacional da Bula (rótulo, botão, dado).
//  · Cormorant Garamond entra só nos eyebrows, em small caps largas.
//
// O FORMATO DOS EXPORTS É INTOCÁVEL: `Formulario.tsx` (577 linhas, auditado,
// fora de escopo) e `Obrigado.tsx` consomem `dark`, `light`, `font`, `radius`,
// `typo` e `interFeatures` por nome. Trocar VALOR aqui reveste esses arquivos
// sem editá-los — que é exatamente o que este redesenho quer. Remover ou
// renomear CHAVE os quebra. Só se acrescenta.
//
// Todo par de contraste abaixo foi MEDIDO (WCAG 2.1), não estimado.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Tile CARVÃO. Três profundidades, do mais fundo ao mais elevado:
 *
 *   bg       #1A130D  carvão profundo — fundo da página e da seção de captura
 *   surface  #2B1F13  carvão — fundo dominante das seções de conteúdo
 *   surface2 #3A2D1E  carvão elevado — card sobre carvão
 *
 * Medições sobre `bg` (#1A130D) e, entre parênteses, sobre `surface` (#2B1F13):
 *   text   off-white #FFFFFC .... 18,34:1  (16,02)  AA
 *   body   creme     #F7F1E6 .... 16,34:1  (14,28)  AA
 *   muted  champagne escuro ..... 5,58:1   (4,88)   AA
 *   gold   champagne #B9A46F .... 7,53:1   (6,58)   AA
 *   faint  #8A7B66 .............. 4,47:1   (3,90)   AA-large SÓ
 *
 * Sobre `surface2` (#3A2D1E) tudo cai um degrau: champagne dá 5,47 e o
 * champagne escuro cai para 4,05 — AA-large apenas. Por isso `muted` é
 * PROIBIDO como texto pequeno dentro de card elevado; use `body` lá.
 */
export const dark = {
  bg: '#1A130D',
  surface: '#2B1F13',
  surface2: '#3A2D1E',
  text: '#FFFFFC', // display / ênfase
  body: '#F7F1E6', // creme — corpo sobre carvão
  muted: '#988D70', // secundário — AA sobre bg e surface, NÃO sobre surface2
  faint: '#8A7B66', // captions/labels GRANDES apenas (4,47 — falha AA <18px)
  gold: '#B9A46F',
  goldText: '#B9A46F',
  goldDim: 'rgba(185, 164, 111, 0.14)',
  hairline: 'rgba(185, 164, 111, 0.18)', // hairline do catálogo é DOURADA, não branca
  hairlineStrong: 'rgba(185, 164, 111, 0.38)',
} as const

/**
 * Tile CLARO. Existe para a página de obrigado e para qualquer bloco que
 * precise inverter; o catálogo em si não tem página clara.
 *
 * Medido sobre `bg` (#FFFFFC):
 *   text     ink      #201812 .... 17,46:1  AA
 *   body     ink-soft #5C4E3E ....  8,02:1  AA
 *   gold     #988D70 ............   3,29:1  AA-large SÓ
 *   goldText #6E5A2E ............   6,62:1  AA
 *
 * REGRA DURA: `--champagne` #B9A46F sobre claro mede **2,44:1** e REPROVA em
 * qualquer tamanho. Ele não aparece aqui. Rótulo pequeno dourado sobre fundo
 * claro usa `goldText`, nunca `gold`.
 */
export const light = {
  bg: '#FFFFFC',
  surface: '#FFFFFF',
  text: '#201812',
  body: '#5C4E3E',
  muted: '#5C4E3E',
  faint: '#7A6A55', // labels GRANDES apenas
  gold: '#988D70', // só ≥18px sobre claro
  goldText: '#6E5A2E', // dourado p/ LABEL PEQUENO em fundo claro — passa AA
  goldDim: 'rgba(152, 141, 112, 0.10)',
  hairline: 'rgba(32, 24, 18, 0.14)',
  hairlineStrong: 'rgba(32, 24, 18, 0.24)',
} as const

/** Feature settings do Inter (arredonda o "a", aproxima do SF Pro). */
export const interFeatures = '"ss03", "cv11"'

/**
 * Famílias.
 *
 * `display`, `body` e `mono` vêm do root layout e valem no app inteiro.
 * `serif` e `cerimonia` são carregadas por `next/font` só nesta rota.
 *
 * PAPEL DE CADA UMA, e são fechados:
 *  · serif (Playfair)  — o EVENTO. Data, título de seção, valor de condição.
 *    No redesenho ela também assume o display grande, papel que era do Oswald.
 *  · cerimonia (Cormorant) — SÓ eyebrow, em caixa alta com tracking largo.
 *  · display (Oswald) — a BULA. Rótulo, botão, sigla de UF, dado tabular.
 *    Continua sendo quem fala nos elementos operacionais, incluindo o
 *    formulário inteiro.
 *  · mono (Plex Mono) — rótulo técnico.
 */
export const font = {
  display: "'Oswald', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
  serif: "var(--font-serif), 'Playfair Display', Georgia, serif",
  cerimonia: "var(--font-cerimonia), 'Cormorant Garamond', Georgia, serif",
} as const

/**
 * FIO DUPLO — 1px + 3px de intervalo + 1px.
 *
 * O do CATÁLOGO tem duas diferenças em relação ao que a versão anterior
 * desenhava, e ambas foram lidas do PDF, não inventadas: as linhas fazem
 * FADE nas duas pontas (não terminam secas) e há um LOSANGO champagne no
 * centro. `FioDuplo` (o antigo, reto e sem losango) segue exportado para
 * quem ainda o use; o do catálogo é `FioOrnamento`.
 */
export const rule = { hair: 1, gap: 3 } as const

/**
 * Verde-musgo — a única cor que sobrevive intacta da paleta anterior, porque
 * o catálogo usa o mesmo #39553E.
 *
 * Medido sobre carvão #2B1F13: musgo sólido dá **1,94:1**. É invisível.
 * PROIBIDO como texto. Só como fio de 1px ou wash de fundo.
 */
export const ink = {
  musgo: '#39553E',
  musgoWash: 'rgba(57, 85, 62, 0.10)',
} as const

/**
 * Raios. O catálogo é uma peça de CÁPSULAS — a régua anterior (0–4px, "nada
 * de 14–18px") não se aplica mais e foi substituída.
 *
 * `none` e `xs` permanecem porque `Formulario.tsx` os consome; mantê-los faz
 * o formulário seguir com campo de canto quase reto dentro de uma página de
 * cantos redondos, que é como o catálogo trata formulário de ficha.
 */
export const radius = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 10,
  lg: 18,
  /** Card grande — a moldura de "Condição de Pagamento" e "Condição de Frete". */
  card: 26,
  /** Cápsula — pílula dos 150 reprodutores, botões, chips da legenda. */
  pill: 999,
} as const

/**
 * ESCALA DE ESPAÇAMENTO VERTICAL — inalterada, e o motivo dela também.
 *
 * O root desta aplicação é **14px**, não 16px (`globals.css:87`). Toda classe
 * de espaçamento do Tailwind é em `rem`, então tudo escrito lá chega à tela
 * 12,5% menor do que o número sugere — `mt-5` vira 17,5px, `gap-10` vira 35px.
 *
 * Os degraus abaixo são `clamp()` em PIXEL: o que está escrito é o que
 * aparece. Espaçamento entre elementos vem DAQUI. Número solto num componente
 * volta a ser dívida.
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
 * Presets de tipografia.
 *
 * Os sete primeiros são os ORIGINAIS e não mudam de família: `Formulario.tsx`
 * consome `monoLabel`, `displayLg` e `body`, e `Obrigado.tsx` consome outros.
 * Mutar a família de qualquer um deles redesenharia o formulário sem que o
 * arquivo fosse tocado.
 *
 * Os presets do CATÁLOGO vêm depois, e são aditivos.
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

  /**
   * A DATA COMO MONUMENTO (`01 DE AGOSTO`). Serifa, peso 400.
   *
   * O piso é 26px, e não os 34px que a régua de display pediria, porque no
   * celular ele não pode passar o `h1`: num anúncio pago a promessa vem antes
   * da cerimônia na ordem de leitura.
   */
  dataMonumento: {
    fontFamily: font.serif,
    fontWeight: 400,
    fontSize: 'clamp(26px, 7vw, 44px)',
    lineHeight: 1.05,
    letterSpacing: '-0.005em',
  },
  /** SMALL CAPS DE CERIMÔNIA (`SÁBADO · 12H`). Faux small caps — ver `eyebrowSerif`. */
  cerimonia: {
    fontFamily: font.serif,
    fontWeight: 400,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.18em',
    fontSize: 'clamp(11px, 1.3vw, 13px)',
    lineHeight: 1.4,
  },
  /** Título serifado de abertura sangrada. */
  aberturaSerif: {
    fontFamily: font.serif,
    fontWeight: 400,
    fontSize: 'clamp(30px, 5.4vw, 60px)',
    lineHeight: 1.12,
    letterSpacing: '-0.005em',
  },
  /** Número de ficha — Oswald. Dado tabular é operação, e operação é do condensado. */
  fichaValor: {
    fontFamily: font.display,
    fontWeight: 600,
    fontSize: 'clamp(34px, 6vw, 54px)',
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  /** Rótulo de ficha — Plex Mono. */
  fichaRotulo: {
    fontFamily: font.mono,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.14em',
    fontSize: 'clamp(10.5px, 1.2vw, 11.5px)',
    lineHeight: 1.45,
  },

  // ── Presets do CATÁLOGO (28/07). Aditivos: nenhum preset acima muda.

  /**
   * EYEBROW DO CATÁLOGO — Cormorant Garamond em caixa alta com tracking de
   * 0.35em. "TRADIÇÃO QUE GERA RESULTADOS!", "NO DIA DO LEILÃO".
   *
   * Small caps FAUX de propósito: a versão do Google não garante `smcp` no
   * subset latino, então é caixa alta + corpo menor + tracking largo.
   */
  eyebrowSerif: {
    fontFamily: font.cerimonia,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.35em',
    fontSize: 'clamp(11px, 1.4vw, 14px)',
    lineHeight: 1.4,
  },
  /**
   * TÍTULO DE SEÇÃO DO CATÁLOGO — Playfair 700. "Condição de Pagamento",
   * "Condição de Frete". No PDF eles vêm dentro do card, centralizados.
   */
  tituloCatalogo: {
    fontFamily: font.serif,
    fontWeight: 700,
    fontSize: 'clamp(28px, 5vw, 52px)',
    lineHeight: 1.1,
    letterSpacing: '0.01em',
  },
  /**
   * VALOR DE CONDIÇÃO — Playfair 700. "30 PARCELAS", "10% DE DESCONTO".
   *
   * Serifa e não Oswald, contrariando a regra da versão anterior ("a serifa
   * não toca em número nenhum"): no catálogo esses números SÃO a cerimônia da
   * página 2, não dado operacional de ficha. A regra antiga segue valendo
   * para `fichaValor`, que é outro papel.
   */
  condicaoValor: {
    fontFamily: font.serif,
    fontWeight: 700,
    // Caixa alta porque é assim que a página 2 escreve: "30 PARCELAS",
    // "10% DE DESCONTO". O transform vive no preset e não na copy para que o
    // dado em `evento.ts` continue legível em português normal.
    textTransform: 'uppercase' as const,
    fontSize: 'clamp(22px, 3.6vw, 38px)',
    lineHeight: 1.15,
    letterSpacing: '0.01em',
  },
  /** Detalhe da condição — o "(2+2+2+2+2+20 PARCELAS)" sob o valor. */
  condicaoDetalhe: {
    fontFamily: font.serif,
    fontWeight: 400,
    textTransform: 'uppercase' as const,
    fontSize: 'clamp(14px, 1.9vw, 20px)',
    lineHeight: 1.35,
    letterSpacing: '0.03em',
  },
  /**
   * LEGENDA DO MAPA — Oswald 700 em caixa alta, condensada e pesada, como no
   * catálogo ("FRETE GRÁTIS*", "NÃO É POSSÍVEL A ENTREGA").
   */
  legendaFrete: {
    fontFamily: font.display,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.02em',
    fontSize: 'clamp(19px, 3.2vw, 30px)',
    lineHeight: 0.98,
  },
  /** Subtítulo da legenda — "QUALQUER QUANTIDADE", "A PARTIR DE 2 LOTES". */
  legendaFreteSub: {
    fontFamily: font.display,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    fontSize: 'clamp(12px, 1.7vw, 16px)',
    lineHeight: 1.2,
  },
  /**
   * SIGLA DE UF dentro do mapa. Oswald 600, corpo pequeno.
   *
   * A COR não vive aqui: ela depende da faixa em que a UF caiu e está em
   * `_lib/frete.ts`, medida faixa a faixa. Ver a nota de contraste lá.
   */
  siglaUf: {
    fontFamily: font.display,
    fontWeight: 600,
    letterSpacing: '0.02em',
    fontSize: 13,
    lineHeight: 1,
  },
} as const

export type Surface = 'dark' | 'light'
export const palette = { dark, light } as const
