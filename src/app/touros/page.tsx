import { Hero } from './_components/Hero'
import { SubHero } from './_components/SubHero'
import { ProvaSocial } from './_components/ProvaSocial'
import { Produto } from './_components/Produto'
import { Conscientizacao } from './_components/Conscientizacao'
import { Fechamento } from './_components/Fechamento'
import { Footer } from './_components/Footer'
import { StickyCta } from './_components/StickyCta'

// Landing de funil perpétuo de venda de touros — Bula Assessoria.
// Ritmo de tiles alternando dark ↔ light (à la Apple): a troca de superfície
// entre seções é o divisor. Único KPI: cadastro qualificado.
//
// O formulário (multi-step) vive DENTRO do Hero (#cadastro), na 1ª dobra.
//   Hero+form (dark/foto) → SubHero (light) → ProvaSocial (light) →
//   Produto (dark) → Conscientizacao (dark) → Fechamento/CTA (dark) → Footer
export default function TourosPage() {
  return (
    <main>
      <Hero />
      <SubHero />
      <ProvaSocial />
      <Produto />
      <Conscientizacao />
      <Fechamento />
      <Footer />
      <StickyCta />
    </main>
  )
}
