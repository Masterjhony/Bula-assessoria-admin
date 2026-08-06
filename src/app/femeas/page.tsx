import { Hero } from './_components/Hero'
import { ParaQuem } from './_components/ParaQuem'
import { Categorias } from './_components/Categorias'
import { Jornada } from './_components/Jornada'
import { Assessoria } from './_components/Assessoria'
import { ProvaSocial } from './_components/ProvaSocial'
import { Fecho } from './_components/Fecho'
import { Footer } from './_components/Footer'
import { StickyCta } from './_components/StickyCta'
import { Galeria } from './_components/Galeria'

// Landing do funil perpétuo de FÊMEAS — Bula Assessoria.
// Roda ao mesmo tempo que o perpétuo de touros (/touros); não substitui nada.
//
// A diferença estrutural em relação ao /touros: o KPI aqui é REUNIÃO AGENDADA,
// não cadastro. Quem compra fêmea PO está montando criatório próprio, o ciclo é
// consultivo, e a decisão do cliente (05/08) é que pós-cadastro se agenda uma
// reunião com assessor em vez de passar o número dele no WhatsApp. Isso muda
// formulário, página de obrigado e instrumentação — não é o /touros com texto
// trocado.
//
// ORDEM DAS SEÇÕES (revista em 06/08 a pedido do dono — ver o aviso abaixo):
//
//   Hero+form → Galeria (as fotos do lote) → ParaQuem (o filtro) → Categorias
//   → Jornada → Assessoria → ProvaSocial → Fecho → Footer → StickyCta
//
// ⚠️ O FILTRO DEIXOU DE SER A PRIMEIRA SEÇÃO DEPOIS DO FORMULÁRIO, e isso tem
// preço medido. A galeria mede 1280px no celular e 1116px no desktop; com ela
// na frente, o topo de #para-quem saiu de 1563 para 2843 no celular (+1280) e
// de 1070 para 2186 no desktop (+1116). Ou seja: no celular a pessoa passa a
// rolar UMA TELA E MEIA A MAIS de fotos antes de chegar ao texto que existe
// para desqualificá-la.
//
// A razão de o filtro estar logo depois do hero continua valendo: ele existe
// para desqualificar, e desqualificar tarde desperdiça o lead que já rolou a
// página inteira — o problema declarado pelo cliente é volume de lead ERRADO,
// não falta de lead. O contra-argumento do dono também é real: as fotos são a
// prova de que existe animal, e prova cedo segura quem ainda não decidiu.
//
// A DECISÃO É DO DONO e está tomada. O que fica registrado aqui é o número, e
// o lugar onde ele vai aparecer se a aposta não pagar: a fila do SDR, semanas
// depois. Se o volume de lead errado subir, esta é a primeira coisa a desfazer.
//
// ⚠️ O `primeiroCampo` (a distância do topo até o primeiro campo no celular)
// NÃO se moveu — a galeria entra DEPOIS do formulário, não antes. O que desceu
// foi o filtro.
//
// RITMO DE SUPERFÍCIE (o divisor editorial desta página é a troca de fundo,
// não filete grosso nem faixa colorida):
//
//   Hero        near-black  #0D0D0D
//   Galeria     near-black  #141414   ← um tom acima; ver o ⚠️ abaixo
//   ParaQuem    pergaminho  #F5F3EF   ← o "documento", onde se lê linha a linha
//   Categorias  near-black  #0D0D0D
//   Jornada     pergaminho  #F5F3EF
//   Assessoria  near-black  #141414   ← um tom acima, separa da faixa de logos
//   ProvaSocial near-black  #0D0D0D
//   Fecho       pergaminho  #F5F3EF
//   Footer      near-black  #0D0D0D
//
// ⚠️ Mudar a galeria de lugar custou um DIVISOR. No fim da página ela ficava
// entre Assessoria (#141414) e ProvaSocial (#0D0D0D), e a troca de fundo fazia
// o trabalho sozinha. Logo depois do hero ela encosta em outro bloco escuro, e
// entre o último campo do formulário e o título da galeria há ~200px de preto
// contínuo — sem nada dizendo que uma seção acabou. Por isso ela sobe para
// #141414: é o mesmo recurso que a Assessoria já usava, não uma invenção.
//
// FOTO — em 06/08 a página deixou de ser 100% tipográfica. O dono enviou o
// material dele, e quatro arquivos entraram. As outras que ele mandou foram
// recusadas por trazerem marca de terceiro no quadro; o motivo de cada uma está
// em public/femeas/README.md.
//
// ── ONDE CADA FOTO MORA, E POR QUÊ (revisto em 06/08, 3ª rodada de design) ──
//
//   hero-mobile / hero-desktop   #topo       banda atrás da promessa
//   curral-lote                  #galeria    célula larga, edge-to-edge
//   curral-dourado               #galeria    célula em pé, edge-to-edge
//   lote-close                   #jornada    faixa full-bleed abrindo a seção
//
// O dono revisou num iPhone e disse, pela terceira vez, "muito texto, sem
// respiro, pouco visual". As duas rodadas anteriores mexeram em espaçamento e
// em traço — aliviaram e não resolveram, porque o problema medido não era ar,
// era PROPORÇÃO:
//
//   · 1.004 palavras, imagem em 16% da área da página;
//   · toda a fotografia concentrada em DOIS pontos (hero e galeria);
//   · e entre eles e a faixa de logos, ~4.700px de texto contínuo em QUATRO
//     seções seguidas, todas com 0% de imagem.
//
// A correção foi de DISTRIBUIÇÃO, não de espaçamento — o mesmo material, em
// mais pontos e edge-to-edge em vez de dentro do container. O maior trecho sem
// nenhuma imagem caiu de ~4.700px para ~2.300px, e a imagem passou de 16% para
// 19% da área sem uma foto nova. Ver FaixaFoto.tsx (o porquê) e Galeria.tsx (o
// que saiu de onde).
//
// ⚠️ NÃO HÁ FOTO SOBRANDO. Os quatro arquivos de public/femeas/ estão todos em
// uso, cada um em UM lugar só. Repetir a mesma foto em dois pontos é o tipo de
// coisa que ninguém aponta e todo mundo sente — a página passa a parecer que
// tem pouco material. Só há mais foto a partir de 14–15/08.
//
// ⚠️ A seção de CATEGORIAS continua sem foto de propósito, e não é por falta de
// material: foto de LOTE não distingue bezerra de novilha, e aquela seção
// existe para a pessoa escolher por onde entrar no plantel. Ilustrar com um
// lote genérico ali seria informação falsa numa seção que orienta decisão. O
// peso visual dela veio da ESCALA TIPOGRÁFICA (o índice de cada cartão virou um
// algarismo de 40–52px) — mesma informação, zero traço novo. Ver Categorias.tsx.
export default function FemeasPage() {
  return (
    <main>
      <Hero />
      {/* As fotos do lote LOGO DEPOIS do formulário (dono, 06/08). Quem acabou
          de ver o card de cadastro vê o animal antes de ler qualquer outra
          coisa. Custo medido no cabeçalho deste arquivo.
          ⚠️ Galeria é a única seção escura colada em outra seção escura na
          página inteira — por isso ela sobe um tom (#141414). Ver Galeria.tsx.
          ⚠️ Ela termina NA FOTO (paddingBottom 0): a borda da imagem encostando
          no pergaminho do filtro é o divisor entre as duas seções. */}
      <Galeria />
      <ParaQuem />
      <Categorias />
      {/* ⚠️ A JORNADA ABRE COM UMA FAIXA DE FOTO, e o lugar dela foi escolhido
          com régua, não por gosto: o meio geométrico do trecho sem imagem
          (filtro → categorias → jornada → assessoria) cai exatamente aqui. A
          faixa é filha desta seção — e não um bloco solto entre as duas — para
          que o medidor de densidade, que lê por seção, consiga contá-la. */}
      <Jornada />
      <Assessoria />
      <ProvaSocial />
      <Fecho />
      <Footer />
      <StickyCta />
    </main>
  )
}
