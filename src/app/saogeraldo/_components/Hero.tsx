import Image from 'next/image'
import { dark, font, typo, space } from '../_lib/tokens'
import { hero as copy } from '../_lib/copy'
import { EVENTO } from '../_lib/evento'
import { Contagem } from './Contagem'
import { LeadForm } from './Formulario'

// Primeira dobra — FAIXA DE FOTO + copy do lançamento + contagem + FORM.
//
// O formulário mora AQUI, dentro do hero (#cadastro), como na landing perpétua:
// o único KPI da página é cadastro qualificado, então o campo de captura não
// pode depender de scroll. Uma segunda instância do form em outra seção
// duplicaria os eventos de funil — por isso #cadastro existe uma vez só, e os
// CTAs da página apontam todos para cá.
//
// ─── POR QUE A FOTO SAIU DO FUNDO E VIROU UMA FAIXA (27/07) ──────────────
//
// Até aqui a foto era `fill` atrás da seção inteira, coberta por um véu de
// 0.82→0.95. Ou seja: sobrevivia entre 5% e 18% da luminosidade dela. A foto
// existia e ninguém via — o cliente pediu "uma foto de gado no Hero" tendo uma
// foto de gado no Hero.
//
// O véu não era capricho. O ponto mais claro da imagem é a pelagem do lote, e
// era exatamente em cima dela que caíam o lead (#9A9488) e a contagem. Para o
// corpo passar em 4.5:1 sobre pelagem clara é preciso ~0.92 de preto por cima —
// a conta não fecha por opacidade, e mexer nela só escolhe qual dos dois se
// perde: a foto ou a legibilidade.
//
// A saída é de COMPOSIÇÃO, não de opacidade: parar de pedir que o mesmo pixel
// sirva de imagem E de papel. A foto ganhou território próprio e o texto ganhou
// o dele. NENHUM texto assenta sobre foto nesta seção — todo o corpo caiu no
// #0D0D0D sólido, onde o greige volta a dar 6,45:1 (antes ia a 4,58:1 no pior
// pixel, a um fio de reprovar). O único escurecimento que sobrou é a sombra no
// alto da faixa do celular, e serve só para a logo.
//
// O território da foto muda com a largura, porque a restrição muda:
//  · até lg — a tela é curta e a largura é toda dela: a foto é uma FAIXA
//    full-bleed no topo, com a logo por cima.
//  · lg+ — sobra largura e falta motivo: a foto é um BLOCO dentro da coluna de
//    copy, ao lado do formulário. Ali ela não empurra o form (as colunas são
//    irmãs) e ainda fecha o buraco que o lead encurtado abriu no pé da coluna.
//
// A conta de dobra do celular fecha porque a faixa quase não é espaço novo: a
// logo mora DENTRO dela (o ar acima da logo já estava lá e não desenhava nada),
// o lead perdeu duas linhas de repetição e o botão dourado do mobile saiu — ele
// rolava 26px até um formulário que já estava visível na mesma dobra, e a barra
// fixa (StickyCta) cobre a intenção assim que #cadastro sai da tela.
// Resultado medido: #cadastro subiu de 597px para 590px a 390×844 e de 594px
// para 582px a 375×667.
//
// A foto é de AMBIÊNCIA (apartação no curral), não de lote. O catálogo não tem
// foto de animal e o cliente pediu para não usar placeholder — ver BRIEF §4.
// Um arquivo só nos dois breakpoints: o hero anterior declarava DUAS fotos
// `fill` com `priority` e escondia uma no CSS — o download acontecia igual, e
// custava ~62 KB no caminho do LCP.
const FOTO = '/touros/ensaio/apartacao-peao.webp'

// Altura da faixa do celular. Deitada de propósito (~2,2:1): é um recorte
// cinematográfico, não um banner. O mínimo (152px) é o piso em que o lote
// ainda lê como rebanho e não como textura.
const FAIXA = 'h-[clamp(152px,44vw,208px)]'

// Altura da foto dentro da coluna de copy, no desktop. Calibrada para a coluna
// terminar junto do card do formulário: com o lead duas linhas mais curto, a
// coluna de texto sozinha acabava ~210px antes do card, e a sobra virava um
// buraco preto do lado esquerdo da dobra. A foto ocupa exatamente essa sobra —
// o "espaço pra foto" e o desequilíbrio das colunas eram o mesmo problema.
const FOTO_DESKTOP = 'h-[clamp(186px,13vw,224px)]'

// Sombra da logo — o ÚNICO escurecimento da faixa. Fica só no terço de cima,
// onde a logo pousa; os ~60% de baixo da foto ficam intocados, que é o pedaço
// que o cliente diz estar faltando. Logo é logotipo: WCAG 1.4.3 não exige
// contraste dele, mas branco sobre céu de fim de tarde precisava de ajuda.
const SOMBRA_LOGO =
  'linear-gradient(180deg, rgba(13,13,13,0.80) 0%, rgba(13,13,13,0.34) 58%, rgba(13,13,13,0) 100%)'

export function Hero() {
  return (
    <section
      id="topo"
      className="relative w-full overflow-hidden"
      style={{ background: dark.bg, color: dark.text }}
    >
      {/* ── FAIXA DE FOTO (até lg) / linha da logo (lg+) ────────────────
          No celular a foto é uma FAIXA full-bleed no topo, com a logo por
          cima. A logo mora aqui dentro de propósito: sem isso a faixa
          custaria dobra em vez de reaproveitar o ar que já existia acima da
          marca — era ar que não desenhava nada.
          No desktop esta faixa some e a foto vai para dentro da coluna de
          copy (ver abaixo): lá sobra largura, e uma foto ao lado do
          formulário equilibra as duas colunas em vez de empurrar o form. */}
      {/* O recuo do topo (até lg) posiciona a logo DENTRO da faixa e não custa
          dobra: a altura da faixa é fixa (`FAIXA`), então mexer neste padding
          move a logo sem mover nada abaixo dela.
          A 16px a logo encostava na borda de cima — sobrava metade da altura
          dela acima e 121px de foto abaixo, e a marca lia como se estivesse
          escorregando para fora do quadro. A ~28px ela pousa sobre a faixa, com
          um respiro da própria altura, e o pedaço limpo de foto continua
          inteiro embaixo. */}
      <div
        className={`relative flex w-full justify-center pt-[clamp(28px,5vw,44px)] lg:h-auto lg:pt-[clamp(44px,4.6vw,72px)] ${FAIXA}`}
      >
        <Image
          src={FOTO}
          alt={copy.fotoAlt}
          fill
          priority
          // No desktop este nó está escondido, mas um <img> display:none
          // baixa assim mesmo. O `1px` faz o srcset escolher a menor variante
          // (~1 KB) em vez de uma foto de 1600px que ninguém vai ver.
          sizes="(min-width: 1024px) 1px, 100vw"
          className="object-cover object-center lg:hidden"
        />
        <div aria-hidden className="absolute inset-x-0 top-0 h-[62%] lg:hidden" style={{ background: SOMBRA_LOGO }} />
        {/* Hairline de fechamento: dá borda à faixa para ela ler como uma foto
            POSTA ali, e não como um fundo que alguém cortou no meio. É o mesmo
            vocabulário de 1px do resto da página. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px lg:hidden"
          style={{ background: dark.hairlineStrong }}
        />

        {/* A marca da página é a BULA, não o criatório. Os vendedores aparecem
            como origem dos lotes, no texto. No celular ela é DELIBERADAMENTE
            menor: a marca já está no domínio, e cada pixel gasto aqui é pixel
            tirado da foto. */}
        <Image
          src="/logo-bula-assessoria-white.png"
          alt="Bula Assessoria"
          width={400}
          height={104}
          priority
          className="relative h-10 w-auto self-start sm:h-14 lg:h-[84px]"
        />
      </div>

      {/* ── SUPERFÍCIE DE LEITURA ──────────────────────────────────────
          Daqui para baixo é #0D0D0D sólido: sem foto por baixo, o contraste
          do corpo deixa de ser negociação com a pelagem do lote e volta a ser
          o que os tokens prometem (~6,7:1 no greige, ~9,7:1 no muted). */}
      <div
        className="relative mx-auto w-full max-w-[1120px] px-5 sm:px-8"
        style={{
          paddingTop: 'clamp(24px, 3.4vw, 40px)',
          paddingBottom: 'clamp(56px, 8vw, 96px)',
        }}
      >
        {/* ── A ESCADA DE FOLGAS DO HERO ──────────────────────────────────
            Vários valores aqui VIAJAM entre dois degraus da escala `space` em
            vez de fixar um. Isso é deliberado e é próprio desta seção: no
            celular ela tem orçamento de dobra (o formulário precisa caber),
            no desktop não tem restrição nenhuma. Um degrau fixo teria que
            escolher um dos dois lados.
            O que NÃO pode variar é a ordem dos degraus. Medida no celular:
              par rótulo+título   12px   (o eyebrow nomeia o h1: são um bloco)
              título → corpo      20px   (texto)
              faixa → superfície  24px   (fronteira, mas tem hairline ajudando)
              corpo → contagem    30px   (bloco novo — o maior salto da coluna)
            No desktop a mesma ordem, esticada: 28 / 28 / 40 / 64.
            Antes desta passada os quatro mediam 20/20/26/21 no celular: cinco
            relações diferentes com o mesmo respiro, que é como a página inteira
            lia como "sufocante" na primeira rodada. */}
        <div
          className="grid lg:grid-cols-2 lg:gap-x-16"
          style={{ rowGap: 'clamp(24px, 5.4vw, 64px)' }}
        >
          {/* Coluna de copy */}
          <div className="flex flex-col">
            <div>
              {/* `block`: como item de flex o eyebrow já era bloco. Dentro
                  deste div ele voltaria a ser inline e a linha herdaria o
                  strut do pai (1.65), gastando ~6px de dobra sem desenhar
                  nada. A caixa do próprio texto é a entrelinha dele: 1.3. */}
              <span className="block" style={{ ...typo.eyebrow, color: dark.gold }}>
                {copy.eyebrow}
              </span>

              {/* Viaja de space.sm (celular) a space.md (desktop): o eyebrow é
                  o RÓTULO deste título, e rótulo cola no que nomeia — a própria
                  escala diz isso no degrau `sm`. Estava em space.md fixo, o que
                  dava ao par a mesma folga que separa título de corpo, e o
                  celular pagava 8px de dobra por uma hierarquia achatada. */}
              <h1
                style={{
                  marginTop: 'clamp(12px, 2.4vw, 28px)',
                  fontFamily: font.display,
                  fontWeight: 600,
                  fontSize: 'clamp(30px, 5.6vw, 52px)',
                  lineHeight: 1.06,
                  letterSpacing: '-0.015em',
                  color: dark.text,
                }}
              >
                {copy.title}
              </h1>

              {/* lineHeight sai de typo.body (1.65) — a linha fixa em 1.55 que
                  estava aqui era justamente o "texto grudado" que o cliente viu. */}
              <p
                className="max-w-[560px]"
                style={{ ...typo.body, fontSize: 17, color: dark.body, marginTop: space.md }}
              >
                {copy.lead}
              </p>
            </div>

            {/* ── O ESPAÇO DA FOTO NO DESKTOP ──────────────────────────
                Aqui a foto não é fundo de nada: é um bloco com moldura de
                1px, do lado do formulário, na largura inteira da coluna.
                Nenhum texto assenta em cima dela, então ela aparece com a
                luz que tem — que era o pedido. */}
            {/* Folga = space.lg direto. Estava num clamp próprio de
                28→42px que só divergia da escala no mínimo — e o mínimo aqui é
                inalcançável, porque este bloco é `hidden lg:block` e nunca
                renderiza abaixo de 1024px. Era divergência sem efeito. */}
            <div
              className={`relative hidden w-full overflow-hidden lg:block ${FOTO_DESKTOP}`}
              style={{ border: `1px solid ${dark.hairline}`, marginTop: space.lg }}
            >
              <Image
                src={FOTO}
                alt={copy.fotoAlt}
                fill
                priority
                // Espelha o truque do nó da faixa, ao contrário: no celular
                // este está escondido e pede a menor variante possível.
                sizes="(min-width: 1024px) 560px, 1px"
                className="object-cover object-center"
              />
            </div>

            {/* A contagem é um bloco inteiro, não um parágrafo: ganha folga de
                ASSUNTO. Mínimo em 30px (space.lg) porque a 21px ela media o
                mesmo que a distância entre título e corpo — era literalmente a
                queixa nº2 do cliente ("espremida contra o que vem antes e
                depois") voltando pela porta do celular. O máximo do desktop
                (64px, space.xl) não muda. */}
            <div style={{ marginTop: 'clamp(30px, 5.4vw, 64px)' }}>
              <Contagem />
            </div>
          </div>

          {/* Card do formulário — âncora única de conversão da página.
              No celular ele agora é o PRIMEIRO elemento clicável depois da
              contagem: o botão dourado que ficava aqui em cima rolava 26px
              para um formulário que já estava visível na mesma dobra. */}
          <div id="cadastro" className="scroll-mt-6">
            <LeadForm />
            <p
              className="text-center"
              style={{
                ...typo.monoLabel,
                fontSize: 10.5,
                letterSpacing: '0.1em',
                color: dark.muted,
                marginTop: space.sm,
              }}
            >
              {copy.reforco}
            </p>
          </div>
        </div>

        {/* Faixa de origem dos lotes — crédito aos criatórios sem disputar a
            marca da página, que é da Bula.
            Cor: `muted`, não `faint`. O próprio tokens.ts avisa que o faint
            (#6B6B6B) só serve acima de 18px — a 12px ele dá 3.5:1 e reprova AA. */}
        <p
          className="text-center"
          style={{ ...typo.monoLabel, color: dark.muted, fontSize: 12, marginTop: space['2xl'] }}
        >
          LOTES DE {EVENTO.vendedores.join(' · ').toUpperCase()}
        </p>
      </div>
    </section>
  )
}
