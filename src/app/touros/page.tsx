import { Hero } from './_components/Hero'
import { SubHero } from './_components/SubHero'
import { ProvaSocial } from './_components/ProvaSocial'
import { Footer } from './_components/Footer'
import { StickyCta } from './_components/StickyCta'

// Landing de funil perpétuo de venda de touros — Bula Assessoria.
// Página ENXUTA (revisão do cliente 24/07): hero+form → processo em 4 passos →
// faixa de logos (prova social). Único KPI: cadastro qualificado.
//
// O formulário (multi-step) vive DENTRO do Hero (#cadastro), na 1ª dobra.
//   Hero+form (dark/foto) → SubHero (light) → ProvaSocial (dark) → Footer (dark)
export default function TourosPage() {
  return (
    <main>
      <Hero />
      <SubHero />
      <ProvaSocial />
      <Footer />
      <StickyCta />
    </main>
  )
}
