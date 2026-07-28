'use client'

import Image from 'next/image'
import { dark, space, typo } from '../_lib/tokens'
import { EVENTO } from '../_lib/evento'
import { copyCatalogo, dataMonumento, cerimonia } from '../_lib/copy-catalogo'
import { useSafeReducedMotion } from '../_lib/useSafeReducedMotion'
import { BotaoPilula, EyebrowCatalogo, Pilula } from './ui-catalogo'
import { ContagemCatalogo } from './ContagemCatalogo'

// ─────────────────────────────────────────────────────────────────────────
// HERO — reproduz a página 1 do catálogo.
//
// TRÊS PEÇAS VÊM DO PDF COMO IMAGEM, e cada uma por um motivo:
//
//  · a FOTO dos dois fundadores. Ela estava embutida no PDF como bitmap
//    único, SEM o texto por cima — o que permitiu usá-la como fundo de
//    verdade e escrever o texto em HTML. Resolução nativa: 1044×1658. É o
//    máximo que o arquivo tem.
//
//  · o LETREIRO "São Geraldo e 7P Agro". Ouro escovado com bisel e sombra
//    interna não se recria em CSS — qualquer tentativa com Playfair 900 e
//    `background-clip: text` entrega outro objeto. Ele carrega o <h1> da
//    página, então o texto vive no `alt`.
//
//  · os SELOS de avaliação (PMGZ, ANCP, Embrapa, GenePlus). São logos de
//    terceiros; redesenhá-los seria adulterá-los.
//
// O resto — eyebrow, data, cápsula, contagem, CTA — é HTML, porque é texto
// que precisa ser lido, indexado, traduzido e ampliado.
// ─────────────────────────────────────────────────────────────────────────

export function HeroCatalogo() {
  const reduzir = useSafeReducedMotion()

  return (
    <section
      id="topo"
      style={{
        position: 'relative',
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        // DOIS GRUPOS, e a razão é de contraste, não de gosto: o eyebrow e a
        // data sobem para o topo, sobre o céu escuro, e todo o resto desce
        // para a metade de baixo, onde o véu já fechou em carvão. É também a
        // composição do impresso — no catálogo os rostos ficam ENTRE os dois
        // blocos de texto, nunca atrás deles.
        justifyContent: 'space-between',
        alignItems: 'center',
        overflow: 'hidden',
        background: dark.bg,
        // O topo abre espaço para a nav fixa; a base respira antes da dobra.
        padding: `calc(72px + ${space.md}) clamp(16px, 5vw, 32px) ${space.xl}`,
        textAlign: 'center',
      }}
    >
      {/* A FOTO. `priority` porque ela é o LCP desta página. `sizes` 100vw
          porque ela é full-bleed em qualquer viewport. O enquadramento em
          18% do topo mantém os dois rostos visíveis quando o corte é
          horizontal (desktop), que é onde a foto retrato mais sofre. */}
      <Image
        src="/saogeraldo/hero-fundadores.webp"
        alt={copyCatalogo.hero.fotoAlt}
        fill
        priority
        sizes="100vw"
        style={{ objectFit: 'cover', objectPosition: 'center 18%' }}
      />

      {/* Véu. O catálogo escurece a base da foto até o carvão sólido para o
          letreiro assentar; este gradiente faz o mesmo e é o que garante o
          contraste de tudo que vem por cima. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          // A "janela" entre 14% e 30% é onde a foto respira e os dois rostos
          // aparecem. Acima e abaixo dela o véu fecha, porque é onde o texto
          // assenta. Fechar em carvão sólido já aos 76% é o que garante que o
          // letreiro, a contagem e o CTA nunca disputem com a imagem.
          background: `linear-gradient(180deg,
            rgba(26, 19, 13, 0.66) 0%,
            rgba(26, 19, 13, 0.30) 16%,
            rgba(26, 19, 13, 0.34) 30%,
            rgba(26, 19, 13, 0.88) 56%,
            ${dark.bg} 76%)`,
        }}
      />

      {/* GRUPO DE CIMA — sobre o céu. */}
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 860 }}>
        {/* Branco e não champagne, por duas razões que apontam para o mesmo
            lado: no catálogo impresso este texto é claro, não dourado; e o
            champagne tem luminância MÉDIA (L≈0,38), o que o faz perder
            contraste tanto sobre o escuro quanto sobre o claro. Medido sobre
            a foto, ele dava 2,00:1 aqui. */}
        <EyebrowCatalogo cor={dark.text}>{copyCatalogo.hero.eyebrow}</EyebrowCatalogo>

        {/* A DATA COMO MONUMENTO. Não é <h*>: o único título desta dobra é o
            <h1> do letreiro, e a data não disputa hierarquia com ele. */}
        <p
          style={{
            ...typo.dataMonumento,
            color: dark.text,
            margin: 0,
            marginTop: space.md,
          }}
        >
          {dataMonumento(EVENTO.dataExtenso)}
        </p>
        <p
          style={{
            ...typo.cerimonia,
            color: dark.text,
            margin: 0,
            marginTop: space.xs,
          }}
        >
          {cerimonia(EVENTO.diaSemana, EVENTO.hora)}
        </p>
      </div>

      {/* GRUPO DE BAIXO — sobre o carvão em que o véu já fechou. */}
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 860 }}>
        {/* O LETREIRO É O <h1>. O texto acessível vive no alt da imagem —
            um h1 vazio com imagem dentro tem o nome acessível do alt. */}
        <h1 style={{ margin: 0, lineHeight: 0 }}>
          <Image
            src="/saogeraldo/letreiro-sao-geraldo-7p.webp"
            alt={copyCatalogo.hero.letreiroAlt}
            width={949}
            height={303}
            priority
            sizes="(max-width: 640px) 90vw, 560px"
            // 560 e não 640: com o letreiro maior, a contagem e o CTA caíam
            // abaixo da dobra num desktop de 900px de altura — e o CTA é o
            // único KPI desta página.
            style={{ width: '100%', maxWidth: 560, height: 'auto', margin: '0 auto' }}
          />
        </h1>

        <Pilula style={{ marginTop: space.lg }}>
          <p
            style={{
              ...typo.legendaFrete,
              fontSize: 'clamp(15px, 2.6vw, 24px)',
              color: dark.text,
              margin: 0,
            }}
          >
            {copyCatalogo.hero.pilulaTitulo}
          </p>
          <p
            style={{
              ...typo.eyebrowSerif,
              fontSize: 'clamp(10px, 1.3vw, 12px)',
              color: dark.gold,
              margin: 0,
              marginTop: 6,
            }}
          >
            {copyCatalogo.hero.pilulaSub}
          </p>
        </Pilula>

        {/* Os selos vêm do PDF com o fundo do catálogo recortado por distância
            de cor, então assentam sobre a foto sem caixa. As dimensões abaixo
            são as do arquivo depois do corte — errá-las faria o next/image
            reservar a proporção errada e a página saltar no carregamento. */}
        <Image
          src="/saogeraldo/selos-certificacao.webp"
          alt={copyCatalogo.hero.selosAlt}
          width={608}
          height={78}
          sizes="(max-width: 640px) 70vw, 300px"
          style={{
            width: '100%',
            maxWidth: 300,
            height: 'auto',
            margin: `${space.md} auto 0`,
          }}
        />

        <div style={{ marginTop: space.lg }}>
          <ContagemCatalogo />
        </div>

        <div style={{ marginTop: space.lg }}>
          <BotaoPilula href="#cadastro" preenchido>
            {copyCatalogo.hero.cta}
          </BotaoPilula>
        </div>

        {/* A dica de rolagem some para quem pediu menos movimento: sem a
            animação ela vira só uma seta parada, que não informa nada. */}
        {!reduzir && (
          <p
            style={{
              ...typo.eyebrow,
              fontSize: 11,
              letterSpacing: '0.35em',
              color: dark.muted,
              margin: 0,
              marginTop: space.lg,
              animation: 'saogeraldo-bob 2.6s ease-in-out infinite',
            }}
          >
            ↓&nbsp;&nbsp;{copyCatalogo.hero.dica}
          </p>
        )}
      </div>

      {/* Keyframes locais. `prefers-reduced-motion` já está coberto pelo ramo
          acima, que nem renderiza o elemento — esta regra é o cinto de
          segurança para quem trocar a condição sem lembrar da animação. */}
      <style>{`
        @keyframes saogeraldo-bob {
          0%, 100% { transform: translateY(0); opacity: 0.65; }
          50%      { transform: translateY(7px); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="saogeraldo-bob"] { animation: none !important; }
        }
      `}</style>
    </section>
  )
}
