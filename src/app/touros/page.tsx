import { Hero } from './_components/Hero'
import { SubHero } from './_components/SubHero'
import { Ensaio } from './_components/Ensaio'
import { ProvaSocial } from './_components/ProvaSocial'
import { Cadastro } from './_components/Cadastro'
import { Footer } from './_components/Footer'
import { StickyCta } from './_components/StickyCta'

// Landing de funil perpétuo de venda de touros — Bula Assessoria.
// Revisão do cliente 24/07 (2ª rodada): o formulário SAIU da 1ª dobra e virou o
// fecho da página; o hero passou a ser promessa + prova + CTA. O ensaio no
// curral subiu para logo depois do hero (a foto puxa o scroll) e o processo em
// 4 passos desceu, colando na prova social. Único KPI: cadastro qualificado.
//
//   Hero (dark/foto) → Ensaio (dark) → SubHero (light) → ProvaSocial (dark)
//   → Cadastro/#cadastro (dark) → Footer (dark)
export default function TourosPage() {
  return (
    <main>
      <Hero />
      <Ensaio />
      <SubHero />
      <ProvaSocial />
      <Cadastro />
      <Footer />
      <StickyCta />
    </main>
  )
}
