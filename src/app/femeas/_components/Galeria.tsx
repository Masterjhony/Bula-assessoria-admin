import Image from 'next/image'
import { dark } from '../_lib/tokens'
import { galeria } from '../_lib/copy'
import { Section, Container, Reveal } from './ui'
import { CabecalhoSecao } from './editorial'

// ─────────────────────────────────────────────────────────────────────────
// GALERIA — o mosaico do lote.
//
// Segue a gramática do ensaio do /touros (uma foto larga + as menores + uma em
// pé), porque é a linguagem da casa e porque ela resolve o problema real: foto
// de lote em tamanhos iguais lê como catálogo, e catálogo é o que esta página
// NÃO é. Tamanhos diferentes criam hierarquia, e hierarquia é o que faz três
// fotos parecerem um ensaio em vez de três arquivos.
//
// ⚠️ AS FOTOS SÃO AS QUE NÃO ESTÃO NO HERO. Cada imagem do material aparece em
// UM lugar só na página: a do hero fica no hero, estas três ficam aqui. Repetir
// a mesma foto em dois pontos é o tipo de coisa que ninguém aponta e todo mundo
// sente — a página passa a parecer que tem pouco material.
//
// ⚠️ Nenhuma legenda de venda embaixo das fotos. São imagens de um lote em
// manejo, não de um animal à venda; escrever "a matriz que vai começar o seu
// plantel" seria vender o que a imagem não entrega, e o público desta página
// nota antes de nós. O texto ao redor está em _lib/copy.ts.
//
// ── ACESSIBILIDADE ──────────────────────────────────────────────────────
// Estas fotos NÃO são decorativas: elas são o conteúdo da seção. Por isso têm
// `alt` de verdade, escrito em copy.ts, descrevendo o que está na foto — e não
// o que a gente gostaria que estivesse. É o oposto da <FaixaFoto/>, que era
// respiro visual e por isso levava `alt=""`.
//
// ── DESEMPENHO ──────────────────────────────────────────────────────────
// Sem `priority`: a seção está bem abaixo da dobra e competir com o LCP do hero
// por banda de rede é como se perde meio segundo no celular. `sizes` declarado
// por célula para o Next não servir a imagem grande no telefone.
// ─────────────────────────────────────────────────────────────────────────

const [larga, emPe, quadrada] = galeria.fotos

function Foto({
  foto,
  className,
  sizes,
}: {
  foto: { src: string; alt: string }
  className: string
  sizes: string
}) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: '#141414' }}>
      <Image src={foto.src} alt={foto.alt} fill sizes={sizes} className="object-cover" />
    </div>
  )
}

export function Galeria() {
  return (
    <Section surface="dark" id="galeria">
      <Container>
        <Reveal>
          <CabecalhoSecao
            surface="dark"
            kicker={galeria.eyebrow}
            titulo={galeria.title}
            olho={galeria.lead}
            medida="18ch"
          />
        </Reveal>

        <Reveal delay={0.06}>
          {/* Celular: pilha — larga em 16/9, depois a em pé, depois a quadrada.
              Desktop: duas colunas, com a foto em pé ocupando as duas linhas da
              direita. O `gap` de 1px com fundo de filete repete o vocabulário da
              grade de categorias: as fotos se tocam por um fio, não flutuam. */}
          {/* ⚠️ ALTURA EXPLÍCITA NO DESKTOP, e sem ela a seção some.
              No celular cada célula tem proporção própria (16/10, 4/3, 4/5) e
              isso basta. No desktop as células viram `aspect-auto` para o
              mosaico fechar, e aí ninguém mais define altura: a foto usa
              `fill`, que é posicionamento absoluto, e a grade colapsa para
              zero. O ensaio do /touros resolve do mesmo jeito.
              Falha silenciosa — não quebra o build, não avisa no console, só
              deixa um vão preto no lugar das fotos. */}
          <style>{`
            @media (min-width: 640px) {
              .femeas-galeria { height: clamp(420px, 40vw, 620px); }
            }
          `}</style>
          <div
            className="femeas-galeria mt-[clamp(28px,4vw,44px)] grid grid-cols-1 sm:grid-cols-[1.35fr_1fr] sm:grid-rows-2"
            style={{ gap: 1, background: dark.hairline, border: `1px solid ${dark.hairline}` }}
          >
            <Foto
              foto={larga}
              className="aspect-[16/10] sm:col-start-1 sm:row-start-1 sm:aspect-auto"
              sizes="(max-width: 640px) 100vw, 55vw"
            />
            <Foto
              foto={quadrada}
              className="aspect-[4/3] sm:col-start-1 sm:row-start-2 sm:aspect-auto"
              sizes="(max-width: 640px) 100vw, 55vw"
            />
            <Foto
              foto={emPe}
              className="aspect-[4/5] sm:col-start-2 sm:row-start-1 sm:row-span-2 sm:aspect-auto"
              sizes="(max-width: 640px) 100vw, 40vw"
            />
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
