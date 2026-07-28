'use client'

import { dark, font, typo, space } from '../_lib/tokens'
import { EVENTO, PAGAMENTO } from '../_lib/evento'
import { oferta as copy, catalogo } from '../_lib/copy'
import { Section, Container, Reveal, FioDuplo } from './ui'

// Condições de pagamento do catálogo oficial. É o argumento comercial mais
// forte do leilão e não depende de nenhuma informação pendente do cliente.
//
// NÃO existe bloco de frete nesta página: mapa e faixas por UF foram cortados
// do escopo (BRIEF §4). Um "frete grátis" genérico seria claim falso, porque o
// catálogo tem região em "sob consulta" e região sem entrega.
export function Oferta() {
  return (
    <Section surface="dark">
      <Container>
        <Reveal>
          <span style={{ ...typo.eyebrow, color: dark.gold }}>{copy.eyebrow}</span>
          <h2 className="max-w-[720px]" style={{ ...typo.displayLg, color: dark.text, marginTop: space.md }}>
            {copy.title}
          </h2>
          <p className="max-w-[620px]" style={{ ...typo.body, color: dark.body, marginTop: space.md }}>
            {copy.lead}
          </p>
        </Reveal>

        {/* Cabeçalho → grade: degrau de SEÇÃO. A grade é outro assunto, não a
            continuação do parágrafo. O fio duplo é quem faz esse degrau agora —
            ele herda a folga que era `marginTop` da grade, e a grade passa a
            correr encostada nele, como a ficha da `Pista` corre no dela.

            O `gap-px` da grade PERMANECE, e não é descuido: a §3.3 do plano
            separa os dois ornamentos por papel — fio duplo marca fronteira de
            CERIMÔNIA (aqui: a entrada nas condições de compra), hairline de 1px
            marca fronteira de LISTA. A grade de quatro condições é lista. */}
        <FioDuplo style={{ marginTop: space['2xl'] }} />
        <div
          className="grid gap-px sm:grid-cols-2 lg:grid-cols-4"
          style={{ background: dark.hairline }}
        >
          {PAGAMENTO.map((item, i) => (
            <Reveal key={item.detalhe} delay={i * 0.06}>
              <div
                className="flex h-full flex-col"
                style={{ background: dark.bg, padding: 'clamp(24px, 3vw, 34px)' }}
              >
                <span
                  style={{
                    fontFamily: font.display,
                    fontWeight: 600,
                    fontSize: 'clamp(34px, 5.5vw, 46px)',
                    lineHeight: 1,
                    color: dark.gold,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {item.destaque}
                </span>
                <span
                  style={{
                    fontFamily: font.display,
                    fontWeight: 600,
                    fontSize: 16,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: dark.text,
                    marginTop: space.sm,
                  }}
                >
                  {item.titulo}
                </span>
                <span style={{ ...typo.body, fontSize: 14, color: dark.muted, marginTop: space.xs }}>
                  {item.detalhe}
                </span>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Menção ao catálogo. A página NÃO lista lote — quem quer ver lote
            fala com o assessor, que é justamente o que queremos que aconteça.
            A contagem vem de EVENTO, não de lotes.ts: importar aquele módulo
            arrastaria o lotes.json (~766 KB) para o bundle por causa de um número. */}
        <Reveal delay={0.1}>
          {/* lineHeight vem de typo.body (1.65). O 1.55 fixo que estava aqui
              repetia, num parágrafo novo, o aperto que o cliente reclamou. */}
          <p
            className="max-w-[720px]"
            style={{ ...typo.body, fontSize: 17, color: dark.body, marginTop: space['2xl'] }}
          >
            {catalogo.nota(EVENTO.totalLotes)}
          </p>
          <a
            href="#cadastro"
            className="inline-flex items-center justify-center"
            style={{
              marginTop: space.lg,
              minHeight: 54,
              padding: '0 26px',
              fontFamily: font.display,
              fontWeight: 600,
              fontSize: 14,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: dark.text,
              border: `1px solid ${dark.hairlineStrong}`,
            }}
          >
            {copy.cta}
          </a>
        </Reveal>
      </Container>
    </Section>
  )
}
