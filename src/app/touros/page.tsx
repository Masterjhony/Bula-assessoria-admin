import { Hero } from './_components/Hero'
import { SubHero } from './_components/SubHero'
import { Ensaio } from './_components/Ensaio'
import { ProvaSocial } from './_components/ProvaSocial'
import { Fecho } from './_components/Fecho'
import { Footer } from './_components/Footer'
import { StickyCta } from './_components/StickyCta'

// Landing de funil perpétuo de venda de touros — Bula Assessoria.
// Revisão do cliente 25/07: o FORMULÁRIO voltou para a 1ª dobra, dentro do
// hero (#cadastro mora no card). A antiga seção de cadastro virou o Fecho —
// último convite + CTA que devolve o lead ao card, sem duplicar o form (duas
// instâncias duplicariam os eventos de funil). Único KPI: cadastro qualificado.
//
//   Hero+form (dark/foto) → Ensaio (dark) → SubHero (light) → ProvaSocial
//   (dark) → Fecho/CTA (dark) → Footer (dark)
export default function TourosPage() {
  return (
    <main>
      <Hero />
      <Ensaio />
      <SubHero />
      <ProvaSocial />
      <Fecho />
      <Footer />
      <StickyCta />
    </main>
  )
}
