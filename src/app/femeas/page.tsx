import { Hero } from './_components/Hero'
import { ParaQuem } from './_components/ParaQuem'
import { Categorias } from './_components/Categorias'
import { Jornada } from './_components/Jornada'
import { Assessoria } from './_components/Assessoria'
import { ProvaSocial } from './_components/ProvaSocial'
import { Fecho } from './_components/Fecho'
import { Footer } from './_components/Footer'
import { StickyCta } from './_components/StickyCta'

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
// ⚠️ NÃO EXISTE FOTO NA PÁGINA, e isso é estado, não desenho inacabado: o
// material de fêmeas só é gravado na fazenda em 14–15/08, e as fotos que já
// existem no repositório são de touro (usar uma delas contradiz a segmentação
// que esta página inteira existe para fazer — public/femeas/README.md).
// Os encaixes de imagem estão marcados em Hero.tsx e Categorias.tsx, e são
// INVISÍVEIS enquanto vazios: nenhum retângulo cinza, nenhum espaço reservado.
export default function FemeasPage() {
  return (
    <main>
      <Hero />
      <ParaQuem />
      <Categorias />
      <Jornada />
      <Assessoria />
      <ProvaSocial />
      <Fecho />
      <Footer />
      <StickyCta />
    </main>
  )
}
