import { Hero } from './_components/Hero'
import { ParaQuem } from './_components/ParaQuem'
import { Categorias } from './_components/Categorias'
import { Jornada } from './_components/Jornada'
import { Assessoria } from './_components/Assessoria'
import { ProvaSocial } from './_components/ProvaSocial'
import { Fecho } from './_components/Fecho'
import { Footer } from './_components/Footer'
import { StickyCta } from './_components/StickyCta'
import { FaixaFoto } from './_components/FaixaFoto'

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
// ORDEM DAS SEÇÕES (travada na Fase 3; tratamento visual na Fase 7):
//
//   Hero+form → ParaQuem (o filtro) → Categorias → Jornada → Assessoria
//   → ProvaSocial → Fecho → Footer → StickyCta
//
// ParaQuem vem LOGO DEPOIS do hero de propósito: é a seção que existe para
// desqualificar, e desqualificar tarde desperdiça o lead que já rolou a página
// inteira. O problema declarado pelo cliente é volume de lead errado, não falta
// de lead. Mover esta seção para baixo anula a alavanca sem quebrar nada — é o
// tipo de regressão que só aparece na fila do SDR, semanas depois.
//
// RITMO DE SUPERFÍCIE (o divisor editorial desta página é a troca de fundo,
// não filete grosso nem faixa colorida):
//
//   Hero        near-black  #0D0D0D
//   ParaQuem    pergaminho  #F5F3EF   ← o "documento", onde se lê linha a linha
//   Categorias  near-black  #0D0D0D
//   Jornada     pergaminho  #F5F3EF
//   Assessoria  near-black  #141414   ← um tom acima, separa da faixa de logos
//   ProvaSocial near-black  #0D0D0D
//   Fecho       pergaminho  #F5F3EF
//   Footer      near-black  #0D0D0D
//
// FOTO — em 06/08 a página deixou de ser 100% tipográfica. O dono enviou o
// material dele, e duas fotos entraram: o hero (banda no celular, full-bleed no
// desktop) e uma faixa antes do fecho. As outras que ele mandou foram
// recusadas por trazerem marca de terceiro no quadro; o motivo de cada uma está
// em public/femeas/README.md.
//
// ⚠️ A seção de CATEGORIAS continua sem foto de propósito, e não é por falta de
// material: foto de LOTE não distingue bezerra de novilha, e aquela seção
// existe para a pessoa escolher por onde entrar no plantel. Ilustrar com um
// lote genérico ali seria informação falsa numa seção que orienta decisão.
export default function FemeasPage() {
  return (
    <main>
      <Hero />
      <ParaQuem />
      <Categorias />
      <Jornada />
      <Assessoria />
      <ProvaSocial />
      {/* Respiro antes do último convite. Ver o cabeçalho de FaixaFoto.tsx. */}
      <FaixaFoto src="/femeas/lote-close.webp" posicao="50% 42%" />
      <Fecho />
      <Footer />
      <StickyCta />
    </main>
  )
}
