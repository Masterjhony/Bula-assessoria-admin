'use client'

import { dark, typo } from '../_lib/tokens'
import { hero } from '../_lib/copy'
import { Section, Container, PillButton, Reveal, Eyebrow } from './ui'

// Tile de fechamento (dark) — reforço final que sobe de volta ao formulário do
// hero (#cadastro). Reforça a conversão SEM uma segunda instância de form
// (nenhuma lógica/tracking duplicados).
export function Fechamento() {
  return (
    <Section surface="dark">
      <Container>
        <Reveal>
          <div className="mx-auto max-w-[720px] text-center">
            <Eyebrow surface="dark" className="flex justify-center">O próximo passo</Eyebrow>
            <h2 className="mt-4" style={{ ...typo.displayLg }}>
              Pronto para escolher o touro certo?
            </h2>
            <p className="mx-auto mt-5 max-w-[520px]" style={{ ...typo.body, fontSize: 18, color: dark.body }}>
              Cadastre-se e a equipe da Bula te ajuda a montar a seleção — sem custo.
            </p>
            <div className="mt-10 flex justify-center">
              <PillButton href="#cadastro" surface="dark">
                {hero.cta}
              </PillButton>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
