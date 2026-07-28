'use client'

import { light, typo, space } from '../_lib/tokens'
import { processo as copy } from '../_lib/copy'
import { Section, Container, Reveal, Eyebrow, MultiLine, TopicCard } from './ui'

// O que a Bula faz — tile CLARO. A troca de superfície escuro→claro é o
// divisor da página. Mesmo serviço da landing perpétua, reescrito para o
// contexto de um leilão com data: aqui o passo do cadastro na leiloeira é o
// que destrava o lance, não uma conveniência.
export function SubHero() {
  return (
    <Section surface="light">
      <Container>
        <div className="grid md:grid-cols-2 md:gap-x-20" style={{ rowGap: space['2xl'] }}>
          <Reveal>
            {/* Era a única seção sem eyebrow — a coluna abria direto no h2 e a
                troca de superfície tinha de fazer sozinha o trabalho de dizer
                que ali começa outro assunto. Em Oswald, e não em serifa: aqui
                quem fala é a BULA, não o evento (a serifa está reservada aos
                três lugares do Hero, da Contagem e da Pista). O degrau até o
                título é `md`, o mesmo de Oferta, Fecho e ProvaSocial — é o
                ritmo de eyebrow da página, e ele não muda por seção. */}
            <Eyebrow surface="light">{copy.eyebrow}</Eyebrow>
            <h2 style={{ ...typo.displayLg, color: light.text, marginTop: space.md }}>
              <MultiLine text={copy.title} />
            </h2>
          </Reveal>

          <div className="flex flex-col" style={{ gap: space.sm }}>
            {copy.passos.map((p, i) => (
              <TopicCard
                key={p.text}
                index={i + 1}
                text={p.text}
                strong={p.strong}
                surface="light"
                delay={i * 0.05}
              />
            ))}
          </div>
        </div>
      </Container>
    </Section>
  )
}
