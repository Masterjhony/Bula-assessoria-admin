// ─────────────────────────────────────────────────────────────────────────
// Primitivos EDITORIAIS da landing de fêmeas — a assinatura que se repete.
//
// Por que este arquivo existe ao lado de `ui.tsx`, e não dentro dele:
//
//  1. `ui.tsx` declara `'use client'`. Todo export de um módulo cliente vira
//     referência de cliente no App Router — dá para RENDERIZAR <Hairline/> a
//     partir de um componente de servidor, mas não dá para CHAMAR a função
//     `palette()` de lá no servidor. As seções desta página são de servidor
//     (não têm estado); então os helpers que elas chamam moram aqui.
//  2. `ui.tsx` é cópia do /touros e deve continuar comparável linha a linha com
//     ele. O que é próprio desta página fica separado.
//
// A LINGUAGEM, em uma frase: filete de 1px, canto reto, caixa alta com tracking
// largo nos rótulos, Oswald nos títulos, e o dourado usado como voltagem —
// nunca como cor de fundo de bloco.
//
// ⚠️ REGRA DE CONTRASTE QUE JÁ CUSTOU UMA AUDITORIA: sobre superfície CLARA,
// texto dourado usa `light.goldText` (#6E5A2E). O `light.gold` (#A68B4B) mede
// abaixo de 3:1 sobre o pergaminho e reprova em QUALQUER tamanho — ele serve
// para preenchimento (fundo de botão), nunca para letra. `acento()` abaixo é a
// única porta por onde o dourado entra em texto, e ela já decide isso.
// ─────────────────────────────────────────────────────────────────────────
import type { CSSProperties, ReactNode } from 'react'
import { dark, light, typo, font, type Surface } from '../_lib/tokens'

export function pele(surface: Surface) {
  return surface === 'dark' ? dark : light
}

/** Dourado de TEXTO. Sobre claro, sempre o escuro — ver o aviso do cabeçalho. */
export function acento(surface: Surface) {
  return surface === 'dark' ? dark.gold : light.goldText
}

/**
 * Rótulo de seção com o filete curto à esquerda.
 *
 * O filete é a assinatura da página: 22px de 1px dourado abrindo cada bloco.
 * Sem foto, é ele que diz "começou uma seção nova" antes de a pessoa ler a
 * primeira palavra — o trabalho que uma imagem de topo faria.
 */
export function Kicker({
  children,
  surface = 'dark',
}: {
  children: ReactNode
  surface?: Surface
}) {
  const cor = acento(surface)
  return (
    <p className="flex items-center gap-3" style={{ ...typo.eyebrow, color: cor }}>
      <span aria-hidden style={{ display: 'block', width: 22, height: 1, background: cor, flex: '0 0 auto' }} />
      {children}
    </p>
  )
}

/** Título de seção (Oswald). `medida` limita a linha — texto longo em coluna larga cansa. */
export function Titulo({
  children,
  surface = 'dark',
  medida = '20ch',
  className = '',
  style,
}: {
  children: ReactNode
  surface?: Surface
  medida?: string
  className?: string
  style?: CSSProperties
}) {
  const p = pele(surface)
  return (
    <h2
      className={className}
      style={{
        ...typo.displayLg,
        fontSize: 'clamp(27px, 4.2vw, 44px)',
        lineHeight: 1.08,
        color: p.text,
        maxWidth: medida,
        marginTop: 20,
        ...style,
      }}
    >
      {children}
    </h2>
  )
}

/** Olho da seção. Nunca abaixo de 16px — corpo é para ser lido no celular. */
export function Olho({
  children,
  surface = 'dark',
  className = '',
}: {
  children: ReactNode
  surface?: Surface
  className?: string
}) {
  const p = pele(surface)
  return (
    <p
      className={className}
      style={{
        ...typo.body,
        fontSize: 'clamp(16px, 1.8vw, 18px)',
        lineHeight: 1.6,
        color: p.body,
        maxWidth: '58ch',
        marginTop: 18,
      }}
    >
      {children}
    </p>
  )
}

/** Cabeçalho completo de seção — kicker + título + olho, com o ritmo já pronto. */
export function CabecalhoSecao({
  kicker,
  titulo,
  olho,
  surface = 'dark',
  medida,
}: {
  kicker: string
  titulo: string
  olho?: string
  surface?: Surface
  medida?: string
}) {
  return (
    <header>
      <Kicker surface={surface}>{kicker}</Kicker>
      <Titulo surface={surface} medida={medida}>
        {titulo}
      </Titulo>
      {olho && <Olho surface={surface}>{olho}</Olho>}
    </header>
  )
}

/** Índice técnico (01, 02…) em mono. Rótulo, não corpo — pode viver abaixo de 15px. */
export function Indice({
  n,
  surface = 'dark',
  tamanho = 12,
}: {
  n: string
  surface?: Surface
  tamanho?: number
}) {
  return (
    <span aria-hidden style={{ ...typo.monoLabel, fontSize: tamanho, color: acento(surface), display: 'block' }}>
      {n}
    </span>
  )
}

/**
 * Número grande em Oswald dourado — a ESCALA TIPOGRÁFICA USADA COMO IMAGEM.
 *
 * Nasceu para a Jornada e passou a servir também às Categorias (06/08/2026), e
 * é a resposta desta página ao problema de "seção sem foto fica sem âncora
 * visual": o algarismo grande dá massa gráfica ao bloco sem acrescentar UMA
 * INFORMAÇÃO NOVA (o índice já estava lá, em 12px) e sem acrescentar UM TRAÇO
 * (que é o que já tinha sido removido por deixar tudo pesado).
 *
 * ⚠️ POR QUE ISTO NÃO REPETE O ERRO DOS PICTOGRAMAS (ver o topo de ./marcas.tsx):
 * o defeito medido lá foi de ALINHAMENTO — seis desenhos de larguras diferentes
 * (111, 64, 100, 100, 146, 100px) encostados à direita, variando ~13px entre
 * cartões vizinhos numa grade cujo sistema é filete de 1px. Aqui os rótulos são
 * sempre DOIS DÍGITOS, alinhados à ESQUERDA, com `tabular-nums` travando a
 * largura do algarismo. Desalinhar é geometricamente impossível.
 *
 * `tamanho` existe porque o mesmo recurso pesa diferente em cada seção: na
 * Jornada o número divide a linha com o título do passo (coluna estreita), nas
 * Categorias ele abre o cartão sozinho e pode crescer mais.
 */
export function NumeroPasso({
  n,
  surface = 'dark',
  tamanho = 'clamp(34px, 4.2vw, 46px)',
}: {
  n: string
  surface?: Surface
  tamanho?: string
}) {
  return (
    <span
      aria-hidden
      style={{
        fontFamily: font.display,
        fontWeight: 600,
        fontSize: tamanho,
        lineHeight: 1,
        letterSpacing: '-0.02em',
        // Trava a largura do algarismo. Oswald não garante figura tabular por
        // padrão, e sem isto o "01" mede menos que o "06" — a coluna do número
        // da Jornada é calculada em `clamp()` fixo, então largura variável
        // deslocaria o título ao lado de um passo para o outro.
        fontVariantNumeric: 'tabular-nums',
        color: acento(surface),
      }}
    >
      {n}
    </span>
  )
}
