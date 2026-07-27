import { Hero } from './_components/Hero'
import { Oferta } from './_components/Oferta'
import { SubHero } from './_components/SubHero'
import { ProvaSocial } from './_components/ProvaSocial'
import { Fecho } from './_components/Fecho'
import { Footer } from './_components/Footer'
import { StickyCta } from './_components/StickyCta'

// Landing do LANÇAMENTO — Leilão Touros São Geraldo e 7P (Bula Assessoria).
// Único KPI: cadastro qualificado antes do leilão.
//
// Mesma arquitetura da /touros, adaptada para evento único: o que lá é sobre
// genética em geral, aqui é sobre um leilão com data.
//
//   Hero+contagem+form (dark/foto) → Oferta/pagamento (dark) → Processo (light)
//   → ProvaSocial/logos (dark) → Fecho/CTA (dark) → Footer + StickyCta
//
// O formulário aparece UMA VEZ só, dentro do Hero (#cadastro). Duas instâncias
// duplicariam os eventos de funil; todos os CTAs da página ancoram lá.
//
// SEM SEÇÃO DE LOTES (decisão do cliente, 27/07). A página só MENCIONA o
// catálogo — quem quer ver lote fala com o assessor. Além de ser o pedido, era
// o certo tecnicamente: renderizar os 134 lotes levava o HTML de 88 KB (o peso
// da /touros) para 1,82 MB. Numa landing de tráfego pago e mobile, esse peso é
// pago ANTES de a pessoa ver o formulário — e o formulário é o único KPI aqui.
export default function SaoGeraldoPage() {
  return (
    <main>
      <Hero />
      <Oferta />
      <SubHero />
      <ProvaSocial />
      <Fecho />
      <Footer />
      <StickyCta />
    </main>
  )
}
