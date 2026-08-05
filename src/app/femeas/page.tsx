import {
  Hero,
  ParaQuem,
  Categorias,
  Jornada,
  ProvaSocial,
  Fecho,
  Footer,
  StickyCta,
} from './_components/Secoes'

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
// Ordem das seções (travada na Fase 3, conteúdo nas Fases 4 e 7):
//
//   Hero+form → ParaQuem (o filtro) → Categorias → Jornada → ProvaSocial
//   → Fecho → Footer → StickyCta
//
// ParaQuem vem LOGO DEPOIS do hero de propósito: é a seção que existe para
// desqualificar, e desqualificar tarde desperdiça o lead que já rolou a página
// inteira. O problema declarado pelo cliente é volume de lead errado, não falta
// de lead.
//
// ESTADO: copy da Fase 4 no lugar, para revisão do João Antônio. O formulário
// da Fase 6 já está pendurado em `#cadastro`, dentro do Hero — instância única
// (INV-7), com submit para /api/femeas/lead e navegação hard para
// /obrigado-femeas-mql | -lead conforme o veredito do servidor (INV-1/INV-3).
// O tratamento visual continua provisório: é a Fase 7.
export default function FemeasPage() {
  return (
    <main>
      <Hero />
      <ParaQuem />
      <Categorias />
      <Jornada />
      <ProvaSocial />
      <Fecho />
      <Footer />
      <StickyCta />
    </main>
  )
}
