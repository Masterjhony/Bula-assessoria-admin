import Image from 'next/image'
import { dark } from '../_lib/tokens'
import { galeria } from '../_lib/copy'
import { Section, Container, Reveal } from './ui'
import { CabecalhoSecao } from './editorial'

// ─────────────────────────────────────────────────────────────────────────
// GALERIA — o díptico do lote, edge-to-edge.
//
// Segue a gramática do ensaio do /touros (tamanhos diferentes criando
// hierarquia), porque foto de lote em tamanhos iguais lê como catálogo, e
// catálogo é o que esta página NÃO é.
//
// ⚠️ AS FOTOS SÃO AS QUE NÃO ESTÃO NO HERO NEM NA JORNADA. Cada imagem do
// material aparece em UM lugar só na página. Repetir a mesma foto em dois
// pontos é o tipo de coisa que ninguém aponta e todo mundo sente — a página
// passa a parecer que tem pouco material.
//
// ⚠️ Nenhuma legenda de venda embaixo das fotos. São imagens de um lote em
// manejo, não de um animal à venda; escrever "a matriz que vai começar o seu
// plantel" seria vender o que a imagem não entrega, e o público desta página
// nota antes de nós. O texto ao redor está em _lib/copy.ts.
//
// ── AS DUAS MUDANÇAS DE 06/08 (terceira rodada de "está pouco visual") ─────
//
// 1. AS FOTOS SAÍRAM DO CONTAINER. Antes: <Container> de 980px DENTRO do
//    padding da seção. Num iPhone de 390 a foto media 350 e sobravam duas
//    tiras de near-black nas laterais; em 1440 media 980 numa tela de 1440.
//    Agora é `-mx-5 sm:-mx-8` (mesmo recurso da faixa de logos da ProvaSocial):
//    +11% de área por foto no celular, +47% em 1440 — sem trocar arquivo e sem
//    crescer altura. Foi o item mais barato da rodada inteira.
//
// 2. A TERCEIRA FOTO DESCEU PARA A JORNADA. Não é corte: as três estavam todas
//    aqui, e depois desta seção corriam ~4.700px de texto em quatro seções
//    seguidas com 0% de imagem. Duas fotos edge-to-edge cobrem quase a mesma
//    área que as três dentro do container, em ~140px a menos de altura — e a
//    terceira passou a quebrar o trecho que estava sem nada. Ver copy.ts, onde
//    a escolha de QUAL foto desce está registrada (foi por resolução do
//    arquivo, não por gosto).
//
// ── A SEÇÃO TERMINA NA FOTO (`paddingBottom: 0`) ──────────────────────────
// O divisor editorial desta página é a troca de fundo entre blocos vizinhos.
// Com a foto encostando no pergaminho do filtro, a própria borda da imagem é o
// divisor — e some uma faixa de 80–144px de near-black que não estava fazendo
// trabalho nenhum entre a última foto e a seção seguinte.
//
// ── ACESSIBILIDADE ──────────────────────────────────────────────────────
// Estas fotos NÃO são decorativas: elas são o conteúdo da seção. Por isso têm
// `alt` de verdade, escrito em copy.ts, descrevendo o que está na foto — e não
// o que a gente gostaria que estivesse.
//
// ── DESEMPENHO ──────────────────────────────────────────────────────────
// Sem `priority`: a seção está abaixo da dobra e competir com o LCP do hero por
// banda de rede é como se perde meio segundo no celular. `sizes` declarado por
// célula para o Next não servir a imagem grande no telefone.
// ─────────────────────────────────────────────────────────────────────────

const [deCima, aoEntardecer] = galeria.fotos

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
    // Fundo de espera MAIS ESCURO que a seção (que agora é #141414): se a foto
    // demorar, a célula ainda tem que se distinguir do bloco atrás dela.
    <div className={`relative overflow-hidden ${className}`} style={{ background: dark.bg }}>
      <Image src={foto.src} alt={foto.alt} fill sizes={sizes} className="object-cover" />
    </div>
  )
}

export function Galeria() {
  return (
    // ⚠️ FUNDO UM TOM ACIMA (#141414), e não é preferência: desde 06/08 esta
    // seção vem LOGO DEPOIS do hero, que também é escuro. O divisor editorial
    // desta página é a TROCA DE FUNDO entre blocos vizinhos — e dois blocos
    // #0D0D0D colados viram uma faixa de ~200px de preto contínuo entre o
    // último campo do formulário e o título daqui, sem nada marcando que uma
    // seção terminou. O recurso é o mesmo que a Assessoria já usa.
    // Se a galeria voltar para o fim da página, este override sai junto.
    <Section surface="dark" id="galeria" style={{ background: dark.surface, paddingBottom: 0 }}>
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
      </Container>

      {/* ⚠️ FORA DO <Container>, e é isso que faz o full-bleed funcionar. O
          `-mx-5 sm:-mx-8` cancela o padding da <Section>; dentro do Container
          ele pararia na borda dos 980px e o efeito sumiria justamente no
          desktop, onde ele vale mais (+47% de área). Precedente: a faixa de
          logos da <ProvaSocial/>.

          Sem <Reveal/> de propósito: a faixa encosta no pergaminho do filtro e
          É o divisor entre as duas seções. Um fade com 16px de subida num
          encontro de superfícies lê como a página se ajeitando depois de
          carregada. */}
      {/* ⚠️ ALTURA EXPLÍCITA NO DESKTOP, e sem ela a seção some.
          No celular cada célula tem proporção própria (4/3 e 4/5) e isso basta.
          No desktop as células viram `aspect-auto` para o mosaico fechar, e aí
          ninguém mais define altura: a foto usa `fill`, que é posicionamento
          absoluto, e a grade colapsa para zero. O ensaio do /touros resolve do
          mesmo jeito. Falha silenciosa — não quebra o build, não avisa no
          console, só deixa um vão preto no lugar das fotos.
          ⚠️ Nada de crase dentro do bloco abaixo: ele é template literal, e
          uma crase de comentário fecha a string no meio do CSS. */}
      <style>{`
        @media (min-width: 640px) {
          .femeas-galeria { height: clamp(420px, 40vw, 620px); }
        }
      `}</style>
      <div
        className="femeas-galeria -mx-5 mt-[clamp(28px,4vw,44px)] grid grid-cols-1 sm:-mx-8 sm:grid-cols-[1.4fr_1fr]"
        // Só o filete de CIMA. Com a faixa correndo de borda a borda, uma borda
        // lateral seria um fio grudado na moldura da tela, e a de baixo seria
        // uma linha entre a foto e o pergaminho da seção seguinte — onde a
        // troca de superfície já divide sozinha.
        style={{ gap: 1, background: dark.hairline, borderTop: `1px solid ${dark.hairline}` }}
      >
        {/* Celular: pilha (larga em cima, em pé embaixo).
            Desktop: duas colunas lado a lado, a larga com mais peso.
            Os recortes são conservadores de propósito — nenhuma das duas passa
            de ~840px de largura em 1440, e os arquivos têm 900px: servem sem
            ampliação. */}
        <Foto
          foto={deCima}
          className="aspect-[4/3] sm:aspect-auto"
          sizes="(max-width: 640px) 100vw, 58vw"
        />
        <Foto
          foto={aoEntardecer}
          className="aspect-[4/5] sm:aspect-auto"
          sizes="(max-width: 640px) 100vw, 42vw"
        />
      </div>
    </Section>
  )
}
