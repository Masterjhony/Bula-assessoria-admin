'use client'

import { dark } from '../_lib/tokens'
import { hero } from '../_lib/copy'
import { Section, Container, PillButton, Reveal } from './ui'

// Tile de fechamento (dark) — reforço final que sobe de volta ao formulário do
// hero (#cadastro). Reforça a conversão SEM uma segunda instância de form
// (nenhuma lógica/tracking duplicados).
export function Fechamento() {
  return (
    <Section surface="dark">
      <Container>
        <Reveal>
          <div className="mx-auto max-w-[680px] text-center">
            <h2
              style={{
                fontWeight: 600,
                fontSize: 'clamp(28px, 4.5vw, 46px)',
                lineHeight: 1.1,
                letterSpacing: '-0.025em',
              }}
            >
              Pronto para escolher o touro certo?
            </h2>
            <p
              className="mx-auto mt-4 max-w-[520px]"
              style={{ fontSize: 'clamp(17px, 2.2vw, 20px)', lineHeight: 1.5, fontWeight: 300, color: dark.muted }}
            >
              Cadastre-se e a equipe da Bula te ajuda a montar a seleção — sem custo.
            </p>
            <div className="mt-9 flex justify-center">
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
