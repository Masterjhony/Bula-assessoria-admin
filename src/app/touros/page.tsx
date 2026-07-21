import { Hero } from './_components/Hero'
import { SubHero } from './_components/SubHero'
import { ProvaSocial } from './_components/ProvaSocial'
import { Processo } from './_components/Processo'
import { Conscientizacao } from './_components/Conscientizacao'
import { Formulario } from './_components/Formulario'
import { Footer } from './_components/Footer'
import { StickyCta } from './_components/StickyCta'

// Landing de funil perpétuo de venda de touros — Bula Assessoria.
// Ritmo de tiles alternando dark ↔ light (à la Apple): a troca de superfície
// entre seções é o divisor. Único KPI: cadastro qualificado.
//
//   Hero (dark/foto) → SubHero (light) → ProvaSocial (light) →
//   Processo (dark) → Conscientizacao (dark) → Formulário (light) → Footer
export default function TourosPage() {
  return (
    <main>
      <Hero />
      <SubHero />
      <ProvaSocial />
      <Processo />
      <Conscientizacao />
      <Formulario />
      <Footer />
      <StickyCta />
    </main>
  )
}
